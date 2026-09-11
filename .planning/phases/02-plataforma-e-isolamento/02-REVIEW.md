---
phase: 02-plataforma-e-isolamento
reviewed: 2026-09-11T00:00:00Z
depth: deep
files_reviewed: 28
files_reviewed_list:
  - packages/contracts/src/errors.ts
  - packages/contracts/src/pagination.ts
  - packages/contracts/src/auth.ts
  - packages/contracts/src/projects.ts
  - packages/contracts/src/index.ts
  - packages/contracts/package.json
  - packages/db/src/schema.ts
  - packages/db/src/index.ts
  - packages/db/drizzle/0001_0001_platform_projects.sql
  - packages/config/src/env.ts
  - packages/core/src/actor.ts
  - packages/core/src/index.ts
  - apps/core-api/src/plugins/requestId.ts
  - apps/core-api/src/plugins/errorHandler.ts
  - apps/core-api/src/plugins/rateLimit.ts
  - apps/core-api/src/auth/password.ts
  - apps/core-api/src/auth/tokens.ts
  - apps/core-api/src/auth/session.ts
  - apps/core-api/src/auth/requireAuth.ts
  - apps/core-api/src/routes/auth.ts
  - apps/core-api/src/lib/projects.ts
  - apps/core-api/src/routes/projects.ts
  - apps/core-api/src/index.ts
  - apps/core-api/package.json
  - tests/integration/auth.test.ts
  - tests/integration/projects.test.ts
  - tests/integration/idor-matrix.test.ts
  - scripts/curl-idor.sh
findings:
  critical: 0
  high: 0
  medium: 4
  low: 13
  info: 8
  total: 25
status: issues_found
advisory: true
---

# Phase 02: Code Review Report — Plataforma e Isolamento

**Reviewed:** 2026-09-11
**Depth:** deep (per-file + cross-file: call chains, error propagation, test-harness fidelity, schema/migration consistency)
**Files Reviewed:** 28
**Status:** issues_found (ADVISORY ONLY — do not block; no critical/high findings)

## Summary

Reviewed all source files changed in phase 2 (plans 02-01 through 02-04: contracts, Drizzle schema + migration 0001, env, ActorContext, requestId/errorHandler/rateLimit plugins, auth primitives + routes, projects lib + routes, boot wiring, 3 integration suites, curl IDOR script).

Overall the implementation is careful: zero `any`, zero `Math.random`/`eval`, argon2id with matching dummy-verify, SHA-256 hashed opaque tokens, owner-scoped queries everywhere, 404-identical IDOR handling, atomic single-use claims, and graceful offline test skips — all verified by direct reading, not by trusting the SUMMARies.

25 advisory findings below: **0 critical, 0 high, 4 medium, 13 low, 8 info**. The mediums are real but bounded: a lockout counter that undercounts under concurrency, a keyset cursor that can skip same-millisecond rows, test harnesses that silently never execute the global plugins they claim to prove, and IP-keyed throttling with no `trustProxy` story for prod-behind-nginx. None is remotely exploitable to RCE, auth bypass, or secret disclosure in the current v1 shape, hence advisory-only.

Controls verified working (no finding filed): requestId allowlist + no-CRLF reflection, envelope-only errors without stack/SQL/token, Zod on every body/query/param boundary, cookie `HttpOnly`+`SameSite=lax`+`Secure(prod)`, server-side sessions with sliding in the second half of TTL, logout vs logout-all separation, reset revoking all sessions + clearing lockout, `owner_id` never sourced from client (schemas strip it, lib uses `actor.userId`), `CONFIRMATION_REQUIRED` gating DELETE, limit clamp 1..100 with null-safe cursor, FK CASCADE + UNIQUE + CHECKs in migration matching the Drizzle schema.

## Medium Issues

### MD-01: Lockout counter uses non-atomic read-modify-write — concurrent failures undercount and can bypass the 5→15min lockout

**File:** `apps/core-api/src/routes/auth.ts:259-267`
**Issue:** On wrong password the handler reads `user.failedAttempts`, computes `attempts + 1` in JS, and writes the absolute value back. N parallel wrong-password requests against the same account all read the same stale value and all write the same increment, so a batch of N failures advances the counter by ~1 instead of N. A distributed or simply parallel guesser (the fine rate limit is per-IP at 10/min, so multiple source IPs each stay under it) can submit many more than 5 failures without triggering `locked_until`. The lockout is a headline D-26 control; its enforcement must not depend on request serialization.
**Fix:**
```typescript
// atomic increment; then re-read to decide lockout
await db.update(users)
  .set({ failedAttempts: sql`${users.failedAttempts} + 1` })
  .where(eq(users.id, user.id));
const fresh = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
// if (fresh[0].failedAttempts >= MAX_FAILED_ATTEMPTS) set lockedUntil ...
```
(`sql` is already re-exported from `@uhhu/db` for exactly this kind of use.)

### MD-02: Keyset cursor truncates `timestamptz` microseconds to milliseconds — same-ms rows can be skipped at a page boundary

**File:** `apps/core-api/src/lib/projects.ts:150-151` (encode) + `apps/core-api/src/lib/projects.ts:104-123` (filter)
**Issue:** The DB orders by `created_at DESC, id DESC` at full `timestamptz` (microsecond) precision, but the cursor encodes `last.createdAt.toISOString()` (millisecond precision — and node-postgres already collapses to JS-Date ms on read). Consider rows R (db time `T+0.5ms`) closing page 1 and S (db time `T+0.3ms`, unseen, sorting after R). Cursor date = `T` exactly. Next-page filter `createdAt < T OR (createdAt = T AND id < R.id)` excludes S on both branches (`T+0.3 ≠ T`, `T+0.3 ≮ T`), so S is silently never listed. Trigger requires two inserts in the same millisecond straddling a page boundary — rare in manual use, plausible in bulk/scripted creation — and the 25-project test passes only because sequential inserts land on distinct milliseconds. Missing rows read as data loss to the user.
**Fix:** Make the cursor exact. Options: (a) encode a full-precision instant (e.g. microseconds since epoch derived at insert, or `extract(epoch ...)` text) instead of ISO-ms; or (b) keep `(created_at, id)` keyset but compare with `<=` on the truncated instant plus `id <>` exclusion of already-seen ids; or (c) order/cursor on a monotonic surrogate only. At minimum add a regression test that inserts several projects within one millisecond (freeze time / bulk insert) and asserts lossless two-page traversal.

### MD-03: Integration harnesses register global plugins in encapsulated child contexts — requestId/errorHandler never execute under test

**File:** `tests/integration/auth.test.ts:199-205`, `tests/integration/projects.test.ts:245-257`, `tests/integration/idor-matrix.test.ts:254-260`
**Issue:** Each harness does `await instance.register(async (child) => { await requestIdPlugin(child); })` (same for `errorHandler`). Fastify encapsulates hooks/`setErrorHandler` set inside a registered context: that child context owns zero routes, so the `onRequest` hook and the error handler never fire for the sibling contexts holding `buildAuthRoutes`/`buildProjectRoutes`. The suites still pass because every route manually sets `x-request-id` via its own `resolveRequestId` fallback and uses `safeParse` (never throwing into the global handler). Consequence: assertions on `x-request-id` and envelope shape do **not** prove the PLAT-05 plugin wiring — the one thing 02-04 claims as proven — and an unknown-route 404 under test would be stock Fastify HTML, not the envelope (never asserted). The production boot does it correctly (direct calls on root, `index.ts:43-45`), so this is a proof-fidelity gap, not a prod bug.
**Fix:** Mirror the boot in harnesses:
```typescript
await instance.register(cookie);
await requestIdPlugin(instance);
await errorHandler(instance);
await instance.register(async (child) => buildAuthRoutes(child, database));
```

### MD-04: Fine rate limit keyed by `request.ip` with no `trustProxy` — behind the prod TLS terminator every client shares one bucket

**File:** `apps/core-api/src/plugins/rateLimit.ts:114`, `apps/core-api/src/index.ts:29-34`
**Issue:** `Fastify()` is created without `trustProxy`, so in production (bind `0.0.0.0` behind nginx per `index.ts:59`) `request.ip` is the proxy's address for all traffic. The `login 10/min`, `register 20/min`, `reset 5/min` per-IP buckets and the 200/min global bucket are then shared by the whole user base: ten logins by *any* users in a minute locks out everyone else's 11th login with 429, i.e. a self-inflicted availability throttle (and one bad actor can cheaply keep the bucket full). Ignoring `X-Forwarded-For` is the safe default against spoofing, but shipping prod without a proxy-trust story converts the control into a shared throttle.
**Fix:** Set `trustProxy` to trust only the local terminator (e.g. `trustProxy: '127.0.0.1'` / unix socket) and document it next to the `host` selection in `index.ts`; keep the per-email lockout as the identity-level backstop (it already is independent). Add a boot assertion/test that `request.ip` differs per `X-Forwarded-For` only through the trusted hop.

## Low Issues

### LW-01: Duplicate-email race returns 500 and burns a single-use invite; claim+insert are not transactional

**File:** `apps/core-api/src/routes/auth.ts:184-216`
**Issue:** Duplicate check (SELECT) → invite claim (UPDATE) → user INSERT are three separate statements. Two concurrent registers with the same email and different invites both pass the SELECT, both burn their invites at the claim, and the loser's INSERT hits the `users.email` UNIQUE violation, which is uncaught → Drizzle error → 500 INTERNAL_ERROR (generic body, fine) with a burned invite recoverable only by admin reissue. Crash between claim and insert has the same burn effect.
**Fix:** Wrap claim+insert in `db.transaction(...)`, and catch unique-violation (`code '23505'`) around the insert → 409 `VALIDATION_ERROR` like the sequential-duplicate path.

### LW-02: Atomic single-use claims do not re-check `revoked_at` / `expires_at`

**File:** `apps/core-api/src/routes/auth.ts:199-203` (invite), `apps/core-api/src/routes/auth.ts:470-474` (reset)
**Issue:** The SELECT validates revoked/expiry, but the winning claim's `WHERE` only asserts `used_at IS NULL`. An admin revocation (or the 30d/1h expiry edge) landing between SELECT and claim still loses: the claim succeeds on a revoked/expired token. Window is millisecond-scale and requires a concurrent admin action, hence low — but the fix is one predicate and closes the TOCTOU the audit claims as closed.
**Fix:**
```typescript
.where(and(eq(invites.id, invite.id), isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())))
```
(same shape for `passwordResets` with expiry).

### LW-03: `isErrorCode` uses `in` — prototype-chain names misclassify and poison the envelope message

**File:** `apps/core-api/src/plugins/errorHandler.ts:44-46`
**Issue:** `value in ERROR_CATALOG` is true for inherited properties (`'constructor'`, `'toString'`, `'hasOwnProperty'`, …). A thrown error carrying such a `code` would take the catalog branch and `buildEnvelope` would set `message` to a function object instead of the PT-BR string. No current throw site produces those codes (Fastify/pg codes never collide), so this is latent, not exploitable today — but the guard is exactly the kind of check that must be airtight.
**Fix:** `return typeof value === 'string' && Object.hasOwn(ERROR_CATALOG, value);`

### LW-04: Session-cookie value length unbounded before hashing + DB lookup

**File:** `apps/core-api/src/auth/requireAuth.ts:44-51`, `apps/core-api/src/routes/auth.ts:65-72` (duplicate)
**Issue:** Any non-empty cookie string is SHA-256'd and used in a `WHERE token_hash = …` lookup. A multi-KB cookie is hashed and sent as a query parameter on every authenticated request — cheap per-request amplification with no legitimate value (real tokens are 64 hex chars). Fail fast instead.
**Fix:** `if (value.length > 256) return null;` in `readSessionCookie` (and deduplicate the helper — see LW-10).

### LW-05: `clearCookie` omits the flags the cookie was set with — stale cookie can survive logout in prod browsers

**File:** `apps/core-api/src/routes/auth.ts:295`, `apps/core-api/src/routes/auth.ts:312`
**Issue:** The session cookie is set with `Secure` (prod) + `SameSite=lax` + `path=/`, but cleared with `{ path: '/' }` only. Some browsers will not overwrite a `Secure`/`SameSite` cookie with a bare clear, leaving a dead-but-present cookie jar entry. Server-side session deletion is authoritative (no session fixation/hijack follows), so impact is cosmetic — still, logout should actually log the browser out.
**Fix:** `reply.clearCookie(COOKIE_NAME, { ...cookieOptions(process.env['NODE_ENV'] === 'production'), path: '/' });` (expired automatically).

### LW-06: `setNotFoundHandler` re-derives requestId from the header only, ignoring `request.requestId`

**File:** `apps/core-api/src/index.ts:52-56`
**Issue:** Every other module reads `request.requestId` first and falls back to the header. The 404 handler reads only `request.headers['x-request-id']`. With an invalid inbound header, `requestIdPlugin` already minted UUID-A, but the 404 path mints UUID-B — the response is self-consistent (header and body both carry B), yet request-scoped logs for that request carry A, breaking log↔response correlation on exactly the path attackers probe most. Copy-paste drift from the shared pattern (see LW-10).
**Fix:** Use the same holder-first `resolveRequestId(request)` helper as the routes.

### LW-07: `reset-request` mints unbounded tokens per email — no per-account throttle or supersede/cleanup

**File:** `apps/core-api/src/routes/auth.ts:424-428`
**Issue:** Every call for an existing email inserts a new 1h row; nothing deletes superseded/expired rows and the only throttle is per-IP (5/min). Consequences scale with enabling SMTP (email bombing the victim) and already apply now (`password_resets` bloat; expired rows are never reaped — `resolveSession`-style expiry returns null without deleting, same for resets). The always-200 anti-enumeration behavior must stay; the storage/egress cost needs a bound.
**Fix:** In the same handler, delete prior active/expired rows for the user (or keep only the newest), and add a small per-account allowance (e.g. max 3 active); add a periodic cleanup of expired sessions/resets.

### LW-08: Dead code and dead config: `requireUser`/`isAdmin`/`UnauthenticatedError`, `SESSION_EXPIRED`, `COOKIE_SECRET`

**File:** `packages/core/src/actor.ts:15-34`, `packages/contracts/src/errors.ts:27`, `packages/config/src/env.ts:24`
**Issue:** `requireUser`, `isAdmin`, and `UnauthenticatedError` have zero references in `apps/` and `tests/` (routes hand-roll the `request.actor === undefined` check, which is fine defense-in-depth, but then the "single guard" the plan advertises does not exist). `SESSION_EXPIRED` sits in the catalog unused (expired sessions answer `UNAUTHENTICATED` — a defensible anti-oracle choice, but then the entry is misleading). `COOKIE_SECRET` is parsed/validated yet never consumed — `@fastify/cookie` is registered without a secret. Dead authorization-adjacent code rots into divergent duplicate checks (already visible: invites re-implements the admin check inline instead of composing `requireAuth`+`requireAdmin`).
**Fix:** Either wire them (use `requireUser`/`isAdmin` in routes, sign cookies with `COOKIE_SECRET`, or document why `SESSION_EXPIRED` stays reserved) or delete them. Do not leave a third state.

### LW-09: Lenient mappings that hide caller mistakes: `toStatus` fail-open, empty PATCH no-op 200, `""` vs `null`

**File:** `apps/core-api/src/lib/projects.ts:27-29`, `apps/core-api/src/lib/projects.ts:159-175`, `apps/core-api/src/routes/projects.ts:172-179`
**Issue:** (a) `toStatus` maps *anything* non-`'archived'` to `'active'` — a corrupt/foreign status silently becomes active (DB CHECK makes this unreachable today; fail-closed `throw` is still the correct shape for a trust-boundary mapper). (b) `PATCH {}` validates, finds "no changes", and returns 200 with the untouched DTO — an empty update is more honestly a 400 `VALIDATION_ERROR` (or explicitly documented as no-op). (c) `researchQuestion: ""` stores `""` while an omitted field stores `null`, so readers must handle both for "empty" — normalize `""` → `null` (or `undefined` → keep) at the lib boundary.
**Fix:** Strict `toStatus` with throw on unknown; `.min(1)`-style non-empty-body check (or document no-op); `input.x === '' ? null : input.x` normalization in create/update.

### LW-10: `resolveRequestId` (+ allowlist regex) copied into 7 modules; `readSessionCookie` copied into 2

**File:** `apps/core-api/src/plugins/requestId.ts:16-23`, `apps/core-api/src/plugins/errorHandler.ts:14-26`, `apps/core-api/src/plugins/rateLimit.ts:34-46`, `apps/core-api/src/auth/requireAuth.ts:30-42`, `apps/core-api/src/routes/auth.ts:34-63`, `apps/core-api/src/routes/projects.ts:30-42`, `apps/core-api/src/index.ts:20-27` (+ `apps/core-api/src/health.ts`)
**Issue:** The single most security-sensitive one-liner in the codebase (what counts as a safe request id) exists in ~8 copies. LW-06 is already a live divergence specimen. Any future tightening (length, alphabet) must land in all copies or silently not apply on some paths.
**Fix:** Export one `resolveRequestId` + `REQUEST_ID_PATTERN` (+ `readSessionCookie`) from `@uhhu/core` (or contracts) and import everywhere. Zero behavior change, removes the drift class.

### LW-11: SQL operators imported from a second drizzle-orm copy while tables come from `@uhhu/db` — dual-instance fragility

**File:** `apps/core-api/src/auth/session.ts:10`, `apps/core-api/src/routes/auth.ts:15`, `apps/core-api/src/lib/projects.ts:8`; lockfile has `drizzle-orm@0.45.2` **and** `drizzle-orm@0.45.2(postgres@3.4.9)`
**Issue:** `pnpm-lock.yaml` resolves two drizzle-orm variants — the exact dual-copy hazard the 02-02 SUMMARY hit in tests (fixed there by using `sql` re-exported from `@uhhu/db`). Production code still imports `eq/and/or/lt/...` from `drizzle-orm` (core-api's copy) while table definitions come from `@uhhu/db` (db's copy). It works today (suites green), but cross-instance `SQL`/column branding can break query building at runtime after any bump that stops deduping — a latent outage class in every owner-scoping predicate, i.e. in the IDOR boundary itself.
**Fix:** Re-export the needed operators from `@uhhu/db` (extend the existing `sql` re-export pattern in `packages/db/src/index.ts:10`) and import them from there in core-api.

### LW-12: Stored `title`/`researchQuestion`/`description` accept arbitrary markup — no sanitization contract for the future renderer

**File:** `packages/contracts/src/projects.ts:8-12`, `apps/core-api/src/lib/projects.ts:43-62`
**Issue:** No HTML-surface exists in this phase (JSON API only), so this is not a live XSS. But `title` persists any string including `<script …>`/event-handler payloads, and the baseline (§2.5) requires sanitization before persist-or-render. Whoever builds the first project renderer inherits stored-XSS unless the contract is fixed now.
**Fix:** Decide and document now: either strip/reject markup at the Zod boundary (e.g. reject `<[a-z]` / control chars in `title`) or record an explicit "renderers must sanitize/escape; API returns raw text" obligation where the frontend spec will read it. Advisory, pre-emptive.

### LW-13: `scripts/curl-idor.sh` uses fixed `/tmp` jar paths — concurrent runs cross-contaminate sessions

**File:** `scripts/curl-idor.sh:14-15`
**Issue:** `JAR_A/B` are fixed (`/tmp/uhhu-a.jar`, `/tmp/uhhu-b.jar`) while only the body dir uses `mktemp -d`. Two simultaneous runs (CI parallel + a human, or two humans) share cookie jars: B's requests can run under A's session, flipping 404↔200 assertions nondeterministically. The script is manual-proof tooling, hence low.
**Fix:** `JAR_A="$TMPDIR_CURL/a.jar"; JAR_B="$TMPDIR_CURL/b.jar"`.

## Info

### IN-01: `ErrorCode` union hand-mirrors catalog keys — drift risk

**File:** `packages/contracts/src/errors.ts:7-19`
**Issue:** The 12-member union duplicates `keyof typeof ERROR_CATALOG` by hand; adding a 13th message without updating the union (or vice versa) compiles and fails at runtime/typing boundaries. Currently in sync.
**Fix:** `export type ErrorCode = keyof typeof ERROR_CATALOG;`

### IN-02: 403 non-admin reuses code/message `UNAUTHENTICATED` ("Autenticação necessária.") — correct status, confusing message

**File:** `apps/core-api/src/auth/requireAuth.ts:101-104`, `apps/core-api/src/routes/auth.ts:128-130`
**Issue:** An authenticated non-admin hitting an admin route is told (in PT-BR) that authentication is *needed*, which reads as "you are logged out" and will generate support noise. The plan's rationale (no `FORBIDDEN` code in the catalog; don't invent one ad hoc) is sound and the HTTP status is right — but the catalog gap is now load-bearing in two places.
**Fix:** Add a stable `FORBIDDEN` entry ("Acesso negado.") to the catalog in a contracts-owned change, then use it for 403s. Until then, keep as-is (do not hand-roll inline messages).

### IN-03: `PASSWORD_RESET_SENT` is a success message living in the error catalog

**File:** `packages/contracts/src/errors.ts:33`, `apps/core-api/src/routes/auth.ts:413-430`
**Issue:** Semantic misuse only: a non-error string in `ERROR_CATALOG` invites someone to `buildEnvelope('PASSWORD_RESET_SENT', …)` as an error and confuses catalog consumers. Behavior is correct (200 + generic message).
**Fix:** Move to a `SUCCESS_MESSAGES`-style export (or keep with a comment marking it intentionally non-error).

### IN-04: Lockout 429 inherently reveals account existence/activity

**File:** `apps/core-api/src/routes/auth.ts:244-251`
**Issue:** Locked account → 429 `ACCOUNT_LOCKED`; nonexistent or unlocked-wrong → 401. Probing distinguishes "this email exists and recently failed logins" from the rest. This is inherent to any visible lockout (D-26 explicitly chose lockout + generic credential message), the window is 15 min, and exploiting it requires already knowing the email — accept and record rather than fix.
**Fix:** None required; note the acceptance next to D-26 so a future "fix" doesn't silently remove the lockout.

### IN-05: Limit edge coercions: `?limit=` → 1, floats silently truncated

**File:** `apps/core-api/src/routes/projects.ts:59-77`
**Issue:** `Number('')` is `0` → clamped to `1`, so `?limit=` returns one item instead of default/400; `?limit=20.5` becomes 20 via `Math.trunc` while the contract declares `int`. Both defensible under "clamp, don't 400", but surprising at the edges.
**Fix:** Treat empty string as absent (pass through to Zod default) and either reject non-integers or document truncation.

### IN-06: Global-429 `x-request-id` relies on implicit hook ordering

**File:** `apps/core-api/src/plugins/rateLimit.ts:98-104`, `apps/core-api/src/index.ts:43-45`
**Issue:** `errorResponseBuilder` returns the envelope body but never sets the header itself; the header is present only because `requestIdPlugin`'s `onRequest` was registered first and already stamped the reply. Correct today, fragile to any reorder/refactor of the boot sequence.
**Fix:** Set `reply.header('x-request-id', resolveRequestId(request))` explicitly in the 429 paths (as the fine-throttle hook already does at `rateLimit.ts:119-120`).

### IN-07: Cookie `Secure` flag reads raw `process.env` instead of the validated env

**File:** `apps/core-api/src/routes/auth.ts:96-103`
**Issue:** `setSessionCookie` checks `process.env['NODE_ENV'] === 'production'` while the boot uses validated `env.NODE_ENV`. Unset/invalid values behave the same today (both non-prod → insecure), but the single validated source should be the only reader — especially for the flag that decides cookie confidentiality.
**Fix:** Thread `env.NODE_ENV` (or an `isProd` param from the caller) into `setSessionCookie`.

### IN-08: Bootstrap TOCTOU (two admins on concurrent fresh-deploy bootstrap) — reaffirm residual, harden later

**File:** `apps/core-api/src/routes/auth.ts:119-133`
**Issue:** `SELECT count(users) == 0` → insert-invite → register is not mutually exclusive: two racers in the pre-first-user window both pass, both mint invites, both register (both read zero users → both `admin`). No user-delete flow and no data exists yet, the window is one deploy event, and both SUMMARies already record it — reaffirmed here as accepted residual, not a new hole.
**Fix (future):** Single-use bootstrap token from server env (or partial unique index guaranteeing exactly one admin / one pre-user invite), consumed at first register. No action required for v1.

---

_Reviewed: 2026-09-11_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: deep_
_Scope: phase 02-plataforma-e-isolamento (plans 02-01…02-04)_
_Mode: advisory — no finding blocks; no source files modified._
