---
status: findings
phase: 06-fundacao-app-auth-suporte-core
date: 2026-09-11
---

# Advisory Code Review — Phase 6 (fundação app + auth + suporte CORE)

**Scope:** phase-6 commits only — `a2f12d5`, `dbd02b5`, `b293c3c` (06-01),
`bef85d9`, `aad160f` (06-02), `83527eb`, `d60f213` (06-03), `37ef874`,
`768135c` (06-04). Read before reviewing: `06-01/02/03/04-SUMMARY.md`,
`AGENTS.md`, `06-CONTEXT.md` (D-01…D-06). No files modified. No source
changes made by this review.

**Method:** full read of every changed source file (backend libs, contracts,
config, migration, all of `apps/lab/src|app`, both new test files, metro/babel
configs); cross-checked each SUMMARY claim against the diff; traced
`searchRuns.ts` D-35 canonical vs the new on-read `isNew`; grepped for
`any`/`eval`/`Math.random`/`localStorage`/`AsyncStorage`/`console` and
hardcoded secrets (clean — see V-05/V-06); verified one suspected CORS hole
against MDN/Fetch spec and **withdrew it** (documented below so nobody
re-flags it).

**Verdict:** no critical security hole. One **high** correctness defect
(H-01) that breaks the phase's own stated invariant as soon as a third run
exists, plus three **medium** defects worth fixing before phases 7–9 build on
this foundation. ` /gsd-code-review-fix` is worth running (see bottom).

Counts: high 1 · medium 3 · low 6 · info 8. Verified-working controls: 10.

---

## HIGH

### H-01: `isNew` on-read diverges from frozen `newCount` with ≥3 runs — claimed invariant breaks

**File:** `apps/core-api/src/lib/searches.ts:561-580` (`seenKeysForSearch`)
+ `apps/core-api/src/routes/lab.ts:645` (`newCount: run.metrics.newCount`)

**What the code does:** `seenKeysForSearch` builds the seen-set from **all
other runs** (`ne(labSearchRuns.id, excludeRunId)`), including runs executed
*later* than the run being read. The route returns `newCount` frozen in
`run.metrics` at execution time. The contract comment (`packages/contracts/src/lab.ts:193`)
and the SUMMARY both claim the obligatory invariant
`newCount === count(isNew===true)`.

**Precondition:** a search with 3 runs sharing keys. Minimal repro:
run1 `{A}`, run2 `{A,B}` (frozen `newCount=1`), run3 `{B,C}`. Then
`GET /api/v1/lab/runs/<run2>/results` computes
seen=`{A(run1), B(run3), C(run3)}` → A→false, B→false → `count(isNew)=0`
while the envelope still reports `newCount=1`. Same root cause makes **all**
of run1's items flip to `isNew=false` retroactively once a later run repeats
them (at execution time they were new). The shipped test
(`tests/integration/lab-results-isnew.test.ts:446-507`) only seeds **2 runs**,
where frozen and on-read coincide — so the assertion passes while the
invariant is false in general. (Note the implementation faithfully mirrors
the canonical D-35 in `searchRuns.ts:456-460`, which uses the same
`ne(runId)` — the defect is inherited semantics + a frozen-vs-live mix, not a
transcription error. The comments saying "runs **anteriores**" are also
inaccurate: the query is "all **other** runs".)

**Impact:** user-visible NOVO badge disagrees with the run's `newCount`;
phase 8 (triage/badge) builds directly on this field. Display/integrity
issue, not a security issue.

**Fix (pick one, in order of preference):**
1. Compute `newCount` on-read with the identical rule and return it instead
   of the frozen metric (the `totalRows` query at `searches.ts:627-633`
   already loads every id — extend the select to `source,sourceId` and
   count `!seen.has(...)` over the full set, not the page).
2. Or scope `seenKeysForSearch` temporally (`executedAt <= current run's
   executedAt`) in **both** `searchRuns.ts` and `searches.ts` — but that
   changes frozen historical `newCount` semantics; needs a decision, not a
   silent patch.
3. Or drop the "Consistência obrigatória" claim and document frozen
   semantics explicitly.

**Proving test:** extend `lab-results-isnew.test.ts` `seedTwoRuns` with a
third run `{B,C}`, then assert `page.newCount ===
page.items.filter(i => i.isNew).length` for run2 (fails today: 1 vs 0) and
that run1's `A` stays `isNew=true` (fails today).

---

## MEDIUM

### M-01: Dangling `referenceSearchId` — search deletion orphans the reference (no FK, no cleanup, check-then-set race)

**Files:** `packages/db/src/schema.ts:132` (uuid column, deliberately no FK),
`apps/core-api/src/lib/searches.ts:448-465` (`deleteSearchForActor`, no
reference cleanup), `apps/core-api/src/lib/projects.ts:182-198` (scoped
check, then unconditional update — no transaction).

**Precondition:** (a) `PATCH /projects/:id {referenceSearchId: S}`, then
`DELETE /lab/searches/S` (the owner's own search — fully authorized). (b)
Race variant: S is deleted between the scoped membership check (line 183)
and the `UPDATE` (line 231).

**Impact:** `GET /projects/:id` returns a `referenceSearchId` pointing at a
deleted search. No privilege issue (still owner-scoped), but phase 7 compare
built on this id gets a confusing 404, and integrity silently decays. The
no-FK choice (migration-cycle avoidance) is legitimate — but then cleanup
belongs in application code and is missing.

**Fix:** in `deleteSearchForActor`, null out referencing projects in the same
transaction:
```ts
await db.transaction(async (tx) => {
  await tx.update(projects)
    .set({ referenceSearchId: null, updatedAt: new Date() })
    .where(and(eq(projects.referenceSearchId, id), eq(projects.ownerId, actor.userId)));
  await tx.delete(labSearches).where(eq(labSearches.id, id));
});
```
**Proving test:** set ref → delete search → `GET /projects/:id` → expect
`referenceSearchId === null` (today: deleted uuid).

### M-02: Typed client casts server responses without runtime validation (`data as T`)

**Files:** `apps/lab/src/api/client.ts:191-202` (`return data as unknown as T`),
`apps/lab/src/api/auth.ts:47,57` (`data.user`), `projects.ts`, `lab.ts`
(all call sites trust the shape).

**Precondition:** any 200 with an unexpected shape — future API version
drift, a proxy error page served as 200 with JSON content-type, truncated
persistence bug. `JSON.parse` succeeds, Zod never runs on the way in
(request bodies are validated; responses are not), and e.g. `data.user`
resolves to `undefined`.

**Impact:** `undefined` enters typed state (`setUser(undefined)`), and every
`user === null` guard in `projects.tsx` / `project/[id].tsx` / `_layout.tsx`
is bypassed (`undefined !== null`) until something dereferences
(`project.title` → RN redbox). Violates `AGENTS.md`: "a validação em runtime
deve ocorrer nas fronteiras apropriadas". The plan scoped Zod to request
bodies, so this is a documented gap, not a broken promise — but phases 7–9
multiply the call sites.

**Fix:** add `parseResponse(schema, data)` at the boundary (at minimum for
`authApi.login/register/me` and `projectsApi.list/listById`) and throw
`ApiError(INTERNAL_ERROR)` on mismatch.
**Proving test** (in `apps/lab/src/api/__tests__/client.test.ts` style, fetch
mocked): 200 with `{}` for `login` → expect rejection, not a resolved
`undefined` user.

### M-03: `nativeLogin` leaves an orphan PAT in SecureStore when `me` throws

**File:** `apps/lab/src/auth/pat.ts:22-36`

**Precondition:** `issuePat` succeeds (PAT minted server-side **and**
persisted via `setToken`, line 28), then `authApi.me({getToken})` **throws**
(network drop — note the `me===null` path at line 31 is handled, the
*throw* path is not). UI shows an error with `user===null`; user retries →
a second PAT is minted. No token-list/revocation UI exists in phase 6
(accepted per D-02), so orphans accumulate server-side.

**Impact:** valid-token sprawl; low confidentiality impact (SecureStore is
encrypted), but each retry widens the set of live credentials for a device
with no user-visible inventory.

**Fix:**
```ts
const created = await authApi.issuePat(parsed);
await setToken(created.token);
try {
  const me = await authApi.me({ getToken });
  if (me === null) throw new Error('Autenticação necessária.');
  return me;
} catch (e) { await clearToken(); throw e; }
```
**Proving test:** mock `issuePat` ok + `me` throw → assert `getToken()`
resolves `null` afterwards (today: raw remains stored).

---

## LOW

### L-01: `session.login` is web-only transport with no guard against native misuse

**File:** `apps/lab/src/auth/session.tsx:97-105` — calls `authApi.login`
(cookie flow) unconditionally. Only safe because `login.tsx:63-68` happens
to branch on `Platform.OS`. A future native caller gets a silent cookie
login that does not persist on-device.
**Fix:** `if (Platform.OS !== 'web') throw new Error(...)` inside `login`
(or rename to `loginWeb`). **Test:** invoke under native `Platform` mock →
expect throw.

### L-02: Native login ignores `refresh() === null` and navigates into a protected route

**File:** `apps/lab/app/login.tsx:66-69` — after `nativeLogin`, `await
refresh()` may resolve `null` (revocation race) without throwing; code still
`router.replace(safeNext)` → AuthGate bounces back to login. Confusing
success-then-bounce.
**Fix:** mirror `pat.ts:31-34`: `if ((await refresh()) === null) throw new
Error('Autenticação necessária.')`. **Test:** mock refresh→null → expect
error state, no navigation.

### L-03: The real redirect-target logic is untested — `session.test.ts` tests a local lookalike

**File:** `apps/lab/app/_layout.tsx:18-28` (`nextForPathname` is inline,
non-exported). The test file re-implements `resolveNext` locally
(`session.test.ts:41-43`) and proves *that*, so a regression in the real
function (the open-redirect-relevant composition over `isSafeNext`, which
*is* tested) would stay green.
**Fix:** export `nextForPathname` (or move it into `session.tsx`), import it
in the test, delete the duplicate. **Test:** the existing evil-URL cases run
against the real function, plus `/` → `/projects`.

### L-04: Metro `.js`-strip resolver is unscoped

**File:** `apps/lab/metro.config.js:16-29` — strips trailing `.js` for
**every** specifier including `node_modules`, silently retrying; masks
genuine resolution errors and can resolve a different file than the author
meant.
**Fix:** only strip when the importer is workspace source (e.g.
`context.originModuleName` contains `apps/lab/` or `packages/`). **Test:**
CI check that a bogus `.js` import still fails loudly.

### L-05: `x-request-id` response header not exposed for browsers

**File:** `apps/core-api/src/index.ts:49-66` — no `exposedHeaders`, so
`response.headers.get('x-request-id')` (`client.ts:162-165`) returns `null`
in browsers and the client silently falls back to its own generated id.
Graceful today, but client/server correlation diverges exactly where the
beta runs (web). **Fix:** `exposedHeaders: ['X-Request-Id']`. **Test:**
assert the preflight/GET response carries
`access-control-expose-headers: x-request-id`.

### L-06: Register screen bypasses the §11 error pattern

**File:** `apps/lab/app/register.tsx:129-130` — plain `Text` error, no
`ErrorBanner`, no Repetir, unlike login/projects. Inconsistent with UI-03's
"erro com Repetir" transverse rule. **Fix:** reuse `ErrorBanner` with
`onRetry`.

---

## INFO

- **I-01 — Stale placeholder + dead-end for authed users:** `app/index.tsx:4`
  still says session "em 06-03"; behind `AuthGate`, `/` is only reachable
  authed yet offers "Ir para login". Likewise `AuthGate` never redirects an
  authed user away from `/login`. Cosmetic.
- **I-02 — Web in-memory PAT slot is write-only-dead:** `secureToken.ts:19`
  (`volatileToken`) is never written on the web path (nothing calls
  `setToken` on web) — harmless, but a future caller could park a secret in
  JS memory. Consider removing the web branch or documenting the invariant.
- **I-03 — `API_BASE_URL` snapshot at import time** (`client.ts:59`) while
  every call re-resolves via `getApiBaseUrl()`. Stale export if env is
  injected late (Expo web). Prefer exporting only the function.
- **I-04 — `deviceName` surrogate split:** `deviceName.ts:22` slices at 100
  UTF-16 units before Zod validation; a split surrogate passes length checks
  and is sent/stored. Cosmetic; slice via `Array.from(candidate).slice(0,
  100).join('')`.
- **I-05 — Secrets at rest outside git (pre-existing, out of phase scope):**
  per the 06-04 summary, `supabase-legacy-export/auth_config.json`
  (untracked) contains `external_google_secret` and gitignored `.env.dev`
  holds `PG_DEV_PASSWORD`. Neither is committed or in the reviewed diff —
  keep it that way; ensure the untracked dir never gets `git add -A`'d
  (it is currently `??` in status).
- **I-06 — Comment precision:** "runs **anteriores**" (`searches.ts:557`,
  `searchRuns.ts:453`) vs actual "all **other** runs" semantics (see H-01).
- **I-07 — Empty-id redirect target:** `[id].tsx:87` builds
  `next=/project/` when `projectId===''`, which survives `isSafeNext` and
  lands post-login on the "Projeto inválido." screen. Trivial.
- **I-08 — Toolchain audit debt (pre-existing):** `pnpm audit` highs/moderates
  in Expo transitive deps (`image-size`, `uuid@7` via xcode,
  `decode-uri-component`) with no upstream patch; dev-tooling attack surface,
  not shipped app code. Acknowledged, correctly not claimed as app risk.

**Checked and withdrawn (not a finding):** `Accept: application/json` (sent
on every `apiFetch`) is absent from CORS `allowedHeaders` — verified against
MDN/Fetch spec that `Accept` with value `application/json` remains a
CORS-safelisted request header (`/` is not a CORS-unsafe byte), so no
preflight is triggered by it; the always-sent `x-request-id` *does*
preflight and *is* allowlisted. The curl-only beta proof therefore transfers
to browsers for this header set. L-05 (expose-headers) is the only residual.

---

## Verified-working controls (do not regress)

- **V-01 Owner-scoping server-side:** `projects` lib filters
  `owner_id=actor` on every query; `searches`/`runs`/`results` scope via the
  `lab_* → projects` join chain; `referenceSearchId` membership requires the
  **same** `projectId` **and** owner (triple check); invalid uuid → `null` →
  identical 404. No `ownerId` from body/storage anywhere.
- **V-02 CORS allowlist, fail-closed:** exact-match callback, empty env →
  empty allowlist, no `Origin` → no ACAO, `credentials:true` + `Vary: Origin`
  via the plugin, preflight 204 proven by curl (valid/tampered/preflight);
  comments correctly state CORS≠auth and `requireAuth` remains enforced.
- **V-03 Input validation depth:** route schema → capability schema → lib
  check for `referenceSearchId`; same-schema client validation
  (login/register/PAT/deviceName); `encodeURIComponent` on all id path
  params; cursor decoders null-safe; `PAT_STORAGE_KEY` matches are the key
  *name*, not a secret.
- **V-04 PAT lifecycle:** raw handled once (`pat.ts`), SecureStore-only on
  native, never persisted on web (cookie-only), never logged/bundled;
  `nativeLogout` revokes server-side **and** clears local in `finally`
  (works offline); no token inventory UI per D-02.
- **V-05 Hygiene greps clean** over `apps/lab/{src,app}` + touched backend
  files: zero `any`/`as any`/`ts-ignore`, `eval`/`new Function`,
  `Math.random`, `localStorage`/`AsyncStorage`, `console.*`; strict
  tsconfig, eslint green.
- **V-06 No secrets in code/bundle:** only `EXPO_PUBLIC_API_BASE_URL`
  (public base URL); Gitleaks history clean per summary; the two tree
  findings are pre-existing, uncommitted/gitignored (I-05).
- **V-07 `isNew` mirrors canonical D-35 exactly** (same `ne(runId)`
  anti-join, one `Set` per request, no N+1); 2-run test asserts
  `newCount===count(isNew)` + IDOR 404s. (H-01 is about frozen-vs-live, not
  the transcription.)
- **V-08 Guards are UX-only:** `AuthGate`/per-screen redirects decide
  nothing; every 401 originates server-side; `isSafeNext` blocks
  `http(s)://`, `//`, `\` with `/projects` fallback; `next` preserves
  `/project/<id>`.
- **V-09 Lockout/rate-limit surfaced verbatim** (401 generic, 429 without
  client retry; retry is always manual via `onRetry`).
- **V-10 Migration 0005 minimal and safe:** single nullable `ADD COLUMN`,
  journal registered, applied against PG DEV with FK-count verified 0.

---

## Fix recommendation

Run **`/gsd-code-review-fix`** — scoped to **H-01 + M-01…M-03** first
(concrete, test-backed, all inside the phase's own stated contracts), then
L-01…L-06 as a second pass. H-01 needs a product decision (frozen vs live
`newCount`) before code; M-01/M-02/M-03 are mechanical. Info items are
optional hygiene.

_Reviewed: 2026-09-11_
_Reviewer: OpenCode (gsd-code-reviewer, advisory, non-blocking)_
_Scope: 9 phase-6 commits (06-01…06-04), ~46 files, full-read + cross-file trace_
