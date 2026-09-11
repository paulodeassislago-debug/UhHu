---
phase: 05-prova-headless
reviewed: 2026-09-11T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - apps/core-api/src/auth/pat.ts
  - apps/core-api/src/auth/requireAuth.ts
  - apps/core-api/src/auth/tokens.ts
  - apps/core-api/src/capabilities.ts
  - apps/core-api/src/routes/auth.ts
  - apps/core-api/src/routes/lab.ts
  - apps/core-api/src/routes/projects.ts
  - apps/core-api/src/plugins/rateLimit.ts
  - packages/contracts/src/auth.ts
  - packages/contracts/src/capabilities.ts
  - packages/contracts/src/index.ts
  - packages/core/src/actor.ts
  - packages/core/src/capabilities.ts
  - packages/core/src/index.ts
  - packages/db/src/schema.ts
  - packages/db/drizzle/0004_personal_access_tokens.sql
  - apps/cli/src/auth-store.ts
  - apps/cli/src/client.ts
  - apps/cli/src/commands.ts
  - apps/cli/src/table.ts
  - apps/cli/src/uhhu.ts
  - apps/cli/bin/uhhu.mjs
  - apps/mcp/src/index.ts
  - apps/mcp/src/mcp-client.ts
  - apps/mcp/src/tools.ts
  - scripts/mcp-call.mjs
  - scripts/prova-headless.sh
findings:
  critical: 0
  warning: 7
  info: 5
  total: 12
status: issues_found
---

# Phase 05: Code Review Report (05-prova-headless)

**Reviewed:** 2026-09-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found (maps to the requester's `issues`; ADVISORY ONLY — never blocks, no source file modified)

## Summary

Reviewed the full Phase 5 headless slice (PAT server, `execute()` facade, CLI, MCP, proof script) against
`./AGENTS.md` and `dev-docs/08-security-baseline.md`, with focus on PAT issuance/storage, Bearer parsing,
cookie-vs-PAT authZ parity (IDOR → 404), lockout/rate-limit sharing, CLI credential permissions + token
precedence, MCP confirm gates, secret leakage, the `any` ban and the `Math.random` ban. Also read the five
`05-0*-SUMMARY.md` files and spot-checked claims against code (see "Spot-checks").

No critical (BLOCKER-level security) defect was proven: Bearer handling, PAT hashing, lockout/throttle
sharing, IDOR → 404 mapping, confirm gates and secret hygiene all hold on the reviewed paths. The report
carries **0 critical, 7 warning, 5 informative** findings. The strongest functional finding is a
timing-dependent CLI exit code (fast-failed run exits 0, slow-failed exits 1). The rest are hardening /
consistency gaps worth a fix pass. Severity is given in the requester's scale with the reviewer
classification in parentheses: `critical` = BLOCKER, `high/medium` = WARNING, `low/informative` = Info.

## Warnings

### H-01: CLI `lab search run` exit code depends on timing, not outcome (WARNING · high)

**File:** `apps/cli/src/commands.ts:458-492`
**Precondition:** a search run reaches a terminal `failed`/`cancelled` state in under ~25 s, so the server
answers `201` directly (D-28: 201 carries ANY final status, including failed) instead of `202` + polling.
**Issue:** only the `202` polling branch maps `failed`/`cancelled` to `CliApiError(500)` → exit 1
(lines 479-483). The non-`202` branch (line 491) emits the DTO unconditionally with exit 0, even when
`data.status` is `failed`/`cancelled`. The same logical outcome therefore exits 0 or 1 depending on
server timing, so scripts/CI checking the exit code miss fast failures. The MCP side documents returning
the failed run (agent inspects `status`); the CLI contract implies failure → non-zero exit.
**Fix:** check the status on the fast path too:

```ts
// after: const { data, status } = await apiFetch<SearchRunDTO>(...)
if (status !== 202 && (data.status === 'failed' || data.status === 'cancelled')) {
  const code = data.error?.code ?? 'RUN_FAILED';
  const message = data.error?.message ?? 'Execução terminou sem sucesso.';
  throw new CliApiError(500, code, message, '');
}
emit(globals, data, () => runMetricsTable(data));
```

### H-02: Saved `baseUrl` silently ignored when `UHHU_TOKEN` is set (WARNING · high)

**File:** `apps/cli/src/auth-store.ts:60-72` (documented order at lines 58-59)
**Precondition:** `credentials.json` holds a custom `baseUrl` (e.g. staging) and `UHHU_TOKEN` is set in
the environment.
**Issue:** the comment promises `UHHU_API_URL > --api > base salvo > default`, but the env-token branch
computes `envApi ?? explicitBaseUrl ?? DEFAULT_API_URL` and never consults the file (the file is not even
read on that path). The CLI then talks to the wrong server (typically localhost) with a token meant for
another environment: requests fail confusingly, and a PAT is presented to an unintended base URL.
`runAuthLogin` (`apps/cli/src/commands.ts:249-250`) inherits the same resolution.
**Fix:** fall back to the stored base before the default (read the file for its `baseUrl` even when the
token comes from env), or correct the comment + help text if ignoring the file is intentional:

```ts
if (trimmedEnv !== undefined) {
  const stored = await readStoredBaseUrl().catch(() => undefined); // best-effort
  const baseUrl = envApi?.length ? envApi
    : explicitBaseUrl?.length ? explicitBaseUrl
    : stored ?? DEFAULT_API_URL;
  return { baseUrl, token: trimmedEnv, from: 'env' };
}
```

### H-03: `POST /auth/logout` deletes a session by cookie hash without scoping to the actor (WARNING · high)

**File:** `apps/core-api/src/routes/auth.ts:357-364`
**Precondition:** request authenticated via Bearer PAT (actor = PAT user A) while also presenting an
arbitrary `uhhu_session` cookie (attacker-controlled header in headless use).
**Issue:** the session delete is `delete(sessions).where(eq(sessions.tokenHash, hashToken(raw)))` with no
`userId` predicate, whereas the PAT revoke on the next lines is correctly scoped
(`revokePat(db, actor.userId, …)`). A caller presenting user B's session token deletes B's session without
owning it (requires prior token theft, so not a standalone bypass — hence high, not critical), and the
benign dual-credential case kills two devices at once despite the comment's "SO o aparelho atual".
**Fix:** scope the delete to the actor:

```ts
import { and } from 'drizzle-orm';
if (raw !== null && actor !== undefined) {
  await db.delete(sessions).where(
    and(eq(sessions.tokenHash, hashToken(raw)), eq(sessions.userId, actor.userId)),
  );
}
```

(Note: `actor` is read after the cookie block today; hoist the read or re-read before the delete.)

### M-01: Credential file mode enforced on write but never on read (WARNING · medium)

**File:** `apps/cli/src/auth-store.ts:60-114`
**Precondition:** `credentials.json` permissions are loosened after creation (`chmod 644`, backup/restore,
copy, umask side effects).
**Issue:** `saveToken` correctly writes 0600 + `chmod` + `stat` verification (lines 44-56), but
`loadToken` never stats the file. A world-readable PAT file is then used silently, with no warning,
defeating the 600 control the SUMMARY claims ("600+stat"). The threat model T-05-03-LEAK is only
half-enforced.
**Fix:** stat on load and fail/warn loudly:

```ts
import { stat } from 'node:fs/promises';
const st = await stat(file);
if ((st.mode & 0o777) !== 0o600) {
  throw new CliAuthError(`Credencial local com permissão insegura em ${file} (esperado 600).`);
}
```

### M-02: `UHHU_TOKEN` not trimmed in CLI (and in `scripts/mcp-call.mjs`), trimmed in MCP client (WARNING · medium)

**File:** `apps/cli/src/auth-store.ts:63`, `scripts/mcp-call.mjs:42-47`; contrast `apps/mcp/src/mcp-client.ts:58-64`
**Precondition:** token env var carries a trailing newline/space (e.g. `export UHHU_TOKEN=$(cat file)`,
editor + newline, copy/paste).
**Issue:** the CLI treats `"  "`/trailing-newline tokens as-is (`length > 0`, no trim) and sends
`Authorization: Bearer <token with whitespace>`, which the server's strict `/^Bearer ([a-f0-9]{64})$/`
rejects → confusing 401. The MCP client trims, so the same env works over MCP and fails over CLI.
`scripts/mcp-call.mjs` repeats the untrimmed pattern for both `UHHU_TOKEN` and `UHHU_API_URL`.
**Fix:** mirror the MCP behavior in both places:

```ts
// auth-store.ts
const raw = process.env['UHHU_TOKEN'];
const trimmedEnv = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
```

```js
// mcp-call.mjs
const token = (process.env['UHHU_TOKEN'] ?? '').trim();
const apiUrl = (process.env['UHHU_API_URL'] ?? 'http://127.0.0.1:3000').trim() || 'http://127.0.0.1:3000';
```

### M-03: Malformed `Authorization` falls back to cookie instead of 401 (WARNING · medium)

**File:** `apps/core-api/src/auth/requireAuth.ts:70-81`
**Precondition:** request carries `Authorization: Bearer` (no trailing space/token), `Basic …`, or any
non-`Bearer␣` scheme together with a valid session cookie.
**Issue:** `readBearerAttempt` returns `null` (absent) for anything not starting with `'Bearer '`, so the
request silently authenticates via cookie; but `Bearer <garbage>` returns `'invalid'` → immediate 401 with
no cookie fallback. Two malformed variants of the same header therefore take different auth paths, which
is surprising for clients and makes the "Bearer-first" contract harder to reason about. Not exploitable
without an already-valid credential, hence medium, not critical.
**Fix:** treat any present `Authorization` header that names the Bearer scheme (case-insensitive per
RFC 9110, or at minimum any value starting with `Bearer`) as a Bearer attempt — malformed → uniform 401:

```ts
if (typeof header === 'string' && /^bearer/i.test(header)) {
  const match = BEARER_PATTERN.exec(header);
  return match?.[1] ?? 'invalid';
}
if (typeof header === 'string' && !header.startsWith('Bearer ')) return null; // non-Bearer scheme
```

### M-04: `CAPABILITY_VERSION` defined twice despite the "definição única" claim (WARNING · medium)

**File:** `packages/contracts/src/capabilities.ts:10`, `packages/core/src/capabilities.ts:13`,
re-exported at `packages/core/src/index.ts:5-11`
**Precondition:** any future version bump of the capability registry.
**Issue:** contracts and core each declare their own `CAPABILITY_VERSION = 'v1'`; `core/index.ts`
re-exports the core copy, so two sources of truth exist and can drift (one bumped, one stale) while both
claim to be canonical. The 05-01 SUMMARY's "definição única" holds for names but not for the version.
**Fix:** single-source it:

```ts
// packages/core/src/capabilities.ts
import { CAPABILITY_VERSION } from '@uhhu/contracts';
export { CAPABILITY_VERSION };
```

## Info

### I-01: CLI export fallback filename interpolates raw `--project` (informative · low)

**File:** `apps/cli/src/commands.ts:866-871`
**Precondition:** server answers 200 without `content-disposition` (never happens today — `sendExport`
always sets it) AND `--project` contains `/` or `\`.
**Issue:** the fallback `` `corpus-${projectId}-${date}.${ext}` `` uses the CLI flag verbatim, so a
slash-containing `projectId` would traverse out of `--out` via `join(outDir, name)`. Unreachable on the
success path (a 200 implies a valid UUID projectId), so defense-in-depth only.
**Fix:** sanitize the fallback exactly like server filenames:

```ts
const safeProject = projectId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
const name = filename ?? `corpus-${safeProject}-${date}.${ext}`;
```

### I-02: `ApiOptions.timeoutMs` is dead in `apiFetch` (informative · low)

**File:** `apps/cli/src/client.ts:13-19` vs `109-177`; used only at `190` (`waitForJob`)
**Precondition:** any caller passing `timeoutMs` expecting a per-request timeout.
**Issue:** the option exists on the shared `ApiOptions` type but `apiFetch` never reads it — there is no
`AbortSignal`/timeout on single fetches (including the initial `POST …/runs`, which by design can take
25 s+). `--timeout` therefore bounds only polling, not the request that starts it. The help text
("timeout do polling") suggests this is intentional, but the dead field invites misuse.
**Fix:** either remove `timeoutMs` from `ApiOptions` (keep it on `WaitForJobArgs` only) or implement it:

```ts
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90000);
try { res = await fetch(url, { ...init, signal: ctrl.signal }); }
finally { clearTimeout(timer); }
```

### I-03: `scripts/mcp-call.mjs` pins a brittle relative SDK path + dead code (informative · low)

**File:** `scripts/mcp-call.mjs:16-17`, `116`
**Precondition:** any pnpm layout change (hoisting, store relocation, SDK minor reorganization).
**Issue:** deep relative imports (`../apps/mcp/node_modules/…/dist/esm/…`) break outside the current
install layout; `void connectOk` (line 116) is a dead lint-silencer for a flag that is written but never
read.
**Fix:** resolve from the owning package and drop the flag:

```js
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/mcp/package.json', import.meta.url));
const { Client } = await import(require.resolve('@modelcontextprotocol/sdk/dist/esm/client/index.js'));
```

### I-04: Duplicated helpers across the slice (informative)

**Files:** `withClampedLimit` in `apps/core-api/src/routes/lab.ts:87-105` and
`apps/core-api/src/routes/projects.ts:58-76`; `resolveRequestId` in `requireAuth.ts:41-51`,
`routes/auth.ts:60-70`, `routes/lab.ts:72-82`, `routes/projects.ts:31-41`, `plugins/rateLimit.ts:46-56`;
`parseContentDisposition` in `apps/cli/src/client.ts:86-107` and `apps/mcp/src/mcp-client.ts:107-128`
**Precondition:** any behavior fix needed in one copy (e.g. clamp bounds, request-id allowlist, filename
hygiene).
**Issue:** identical logic in 2-5 copies drifts independently; the three copies already evolved
separately (CLI vs MCP clients are mirrors "by design" per header comments, but nothing enforces parity —
see M-02, where they already diverged on trimming).
**Fix:** extract to a shared internal module per app (`core-api/src/http.ts`, `packages/`-level util for
CLI/MCP) with unit coverage; no behavior change.

### I-05: Global flag parser accepts another flag as a value (informative · low)

**File:** `apps/cli/src/uhhu.ts:169-180` (`takeValue`)
**Precondition:** `uhhu --api --json project list` (or any `--api/--idempotency-key/--timeout` followed by
another flag).
**Issue:** `takeValue` consumes the next argv token unconditionally, so `baseUrl` becomes the literal
`--json` and the request fails later with a confusing network error. The per-command `parseArgs`
(`apps/cli/src/commands.ts:133-139`) guards with `!next.startsWith('-')`; the global parser does not.
**Fix:** reject flag-like values at the global layer:

```ts
const next = argv[index + 1];
if (next === undefined || next.length === 0 || next.startsWith('-')) {
  throw new UsageError(`Flag ${flag} exige um valor.\n${GENERAL_HELP}`);
}
```

## Spot-checks (SUMMARY claims vs code)

- **Claim 05-02: "37 `execute(` em lab.ts, 6 em projects.ts"** — VERIFIED: `grep -c` returns exactly
37 and 6. Zero-`lib/`-import claim is consistent with the read files (routes import only
`../capabilities.js` + contracts/integrations/db types).
- **Claim 05-01–05-05: "zero `any`, sem `Math.random`, sem `eval`"** — VERIFIED on all 27 files:
no `as any` / `: any` / `<any>`, no `Math.random` (secure `randomBytes`/`randomUUID` only), no
`eval(`/`new Function`.
- **Claim 05-05 gates (`assert_code` 47, `StdioClientTransport` 1)** — VERIFIED on the script:
`assert_code` occurs 47×, `StdioClientTransport` 1×, no `set -x`, no `curl -k`. (`DATABASE` lines count
23 here vs "18" in the SUMMARY — same order of magnitude; the SUMMARY's `404`×32 figure refers to
`tests/integration/headless-idor.test.ts`, not to the shell script, which legitimately contains fewer.)

## Controls verified and working

Bearer strictly `hex64` with a single generic 401 (invalid/expired/revoked/malformed indistinguishable);
PAT raw circulates once, only the SHA-256 hash is stored (UNIQUE), never logged (issue log carries only
`requestId/userId/patId`); sliding extension only below 50 % remaining, mirroring `touchSession`; lockout
5→15 min and the 10/min `login` throttle bucket genuinely shared between `/auth/login` and `/auth/token`
(`rateLimit.ts:93-95`, throttled requests never reach the handler so `failedAttempts` is untouched);
resource routes scope by actor with `null` → uniform 404; `DELETE` of foreign/malformed PAT/session ids →
404; logout-all/reset revoke sessions AND PATs; MCP confirm pre-checked before Zod and before any I/O on
all 5 effectful tools with `z.literal(true)` also enforced at the SDK layer; export filename hygiene
rejects `.`/`..` and strips paths in both CLI and MCP clients; credential file created 0700/0600 with
explicit `chmod` + `stat`; `UHHU_TOKEN` precedes file; `X-Request-Id` echoed only from a header-safe
allowlist; proof script runs without `set -x`, keeps PATs in vars + `mktemp -d` (0700) with trap cleanup,
and never echoes tokens (asserts absence from stdout).

---

_Reviewed: 2026-09-11T00:00:00Z_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: standard_
