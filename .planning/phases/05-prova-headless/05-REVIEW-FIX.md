---
phase: 05-prova-headless
fixed_at: 2026-09-11T15:11:10Z
review_path: .planning/phases/05-prova-headless/05-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-09-11T15:11:10Z
**Source review:** .planning/phases/05-prova-headless/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (H-01, H-02, H-03, M-01, M-02, M-03, M-04 — fix_scope=critical_warning)
- Fixed: 7
- Skipped: 0

**Isolation note:** the generic `git worktree add "$wt" main` isolation fails here
(`fatal: 'main' is already used by worktree at '/home/coder/projetos/UhHu'`),
so fixes were applied directly in the main working tree per the task's runtime
notes: `git status` checked before every commit, only fix files staged with
`git add <fix files>`, Phase 4 uncommitted files
(`apps/core-api/src/lib/corpus.ts`, `dedup.ts`, `package.json`,
`packages/integrations/src/bdtd.ts`, `scripts/curl-corpus.sh`,
`tests/integration/auth|idor-matrix|lab-search-runs|lab-sources-contract|projects`,
`fixtures/bdtd-search.json`, `pnpm-lock.yaml`) never touched/staged/committed.
Each `git show --name-only` verified to contain only fix files.

## Fixed Issues

### H-01: CLI `lab search run` exit code depends on timing, not outcome

**Files modified:** `apps/cli/src/commands.ts`, `tests/smoke/cli-unit.test.ts`
**Commit:** `3ca09f2` (`fix(05): H-01 CLI fast-path failed exit 1`)
**Applied fix:** fast path (201 final / 200 replay) now maps terminal
`failed`/`cancelled` to `CliApiError(500)` with `error.code/message` fallback
`RUN_FAILED` / `Execução terminou sem sucesso.`, mirroring the 202 polling
branch. `succeeded`/`partial` still emit with exit 0.
**Verification:** `pnpm --filter @uhhu/cli run typecheck` pass; `npx eslint`
on both files pass; `pnpm vitest run --project smoke
tests/smoke/cli-unit.test.ts` 20/20 pass (3 new: 201 failed→500/exit 1,
201 cancelled→500/`RUN_FAILED`, 201 succeeded→no throw).
**Regression test:** `describe('commands runSearchRun fast path (H-01)')` with
mocked `fetch` (201 + `{status:'failed'|'cancelled'|'succeeded'}`).

### H-02: Saved `baseUrl` silently ignored when `UHHU_TOKEN` is set

**Files modified:** `apps/cli/src/auth-store.ts`, `tests/smoke/cli-unit.test.ts`
**Commit:** `c278817` (`fix(05): H-02 saved baseUrl used with env token`)
**Applied fix:** new best-effort `readStoredBaseUrl()` (reads only `baseUrl`,
never throws — missing/corrupt → `undefined`) consulted in the env-token
branch, restoring documented precedence
`UHHU_API_URL > --api > base salva > default`. `runAuthLogin` inherits the fix
via `loaded?.baseUrl`.
**Verification:** CLI typecheck pass; eslint pass; smoke cli-unit 23/23 pass
(3 new H-02: stored base used with env token, full precedence
env > flag > stored > default, no-file env → default).
**Regression test:** `H-02: base salva e usada…`, `H-02: precedencia…`,
`H-02: sem arquivo…` in `auth-store (HOME fake)`.

### H-03: `POST /auth/logout` deletes a session by cookie hash without scoping to the actor

**Files modified:** `apps/core-api/src/routes/auth.ts`, `tests/integration/pat-auth.test.ts`
**Commit:** `e14277e` (`fix(05): H-03 scope logout session delete to actor`)
**Applied fix:** hoisted `actor = request.actor` above the cookie block; delete
now `where(and(eq(tokenHash, hash(raw)), eq(userId, actor.userId)))` and only
when `actor !== undefined`. `and` was already imported. PAT revoke path
unchanged. No logic change for `logout-all`.
**Verification:** `pnpm --filter @uhhu/core-api run typecheck` pass; eslint
pass; live PG (`source .env.dev.cs`) `pat-auth.test.ts` 14/14 pass including
the 2 new tests; offline skip-grace run also green.
**Regression test:** `H-03: logout com Bearer de A + cookie de B nao apaga a
sessao de B` (PAT-A revoked → 401, cookie-B → 200, cookie-A → 200) and
`H-03: logout com cookie proprio apaga so a sessao atual` (cookie-A → 401,
cookie-B → 200).

### M-01: Credential file mode enforced on write but never on read

**Files modified:** `apps/cli/src/auth-store.ts`, `tests/smoke/cli-unit.test.ts`
**Commit:** `33fbb0d` (`fix(05): M-01 stat credential file on load`)
**Applied fix:** `loadToken` file branch now `stat`s after `readFile` and throws
`CliAuthError(... permissão insegura ... esperado 600)` when
`(mode & 0o777) !== 0o600`. `stat` was already imported. Env-token
best-effort `readStoredBaseUrl()` intentionally does not throw.
**Verification:** CLI typecheck pass; eslint pass; smoke cli-unit 24/24 pass.
Pre-existing `arquivo corrompido` test fixed to `chmod 600` after raw write so
it exercises JSON-parse (not permission) path.
**Regression test:** `M-01: arquivo afrouxado (644) falha alto na leitura`.

### M-02: `UHHU_TOKEN` not trimmed in CLI (and in `scripts/mcp-call.mjs`), trimmed in MCP client

**Files modified:** `apps/cli/src/auth-store.ts`, `apps/cli/src/commands.ts`, `scripts/mcp-call.mjs`, `tests/smoke/cli-unit.test.ts`
**Commit:** `e39901b` (`fix(05): M-02 trim UHHU_TOKEN and API URL parity`)
**Applied fix:** `loadToken` trims `UHHU_TOKEN`/`UHHU_API_URL`/`--api`/stored
`baseUrl` (`trim().length > 0 ? trim() : undefined`); whitespace-only token
treated as absent (falls back to file). `runAuthLogin` trims flag/env base the
same way. `scripts/mcp-call.mjs` trims `UHHU_TOKEN` and `UHHU_API_URL`
(`(... ?? default).trim() || default`). Mirrors
`apps/mcp/src/mcp-client.ts:58-64`.
**Verification:** CLI typecheck pass; eslint on all 4 files pass;
`node --check scripts/mcp-call.mjs` pass; smoke cli-unit 27/27 pass.
**Regression test:** `M-02: UHHU_TOKEN com newline/espaco e aparado`,
`M-02: UHHU_TOKEN so com espacos e tratado como ausente`,
`M-02: UHHU_API_URL com espacos e aparado`.

### M-03: Malformed `Authorization` falls back to cookie instead of 401

**Files modified:** `apps/core-api/src/auth/requireAuth.ts`, `tests/integration/pat-auth.test.ts`
**Commit:** `bc84f45` (`fix(05): M-03 malformed Bearer uniform 401 no cookie fallback`)
**Applied fix:** `readBearerAttempt` now treats any string matching `/^bearer/i`
(RFC 9110 case-insensitive, including bare `Bearer` with no token) as a Bearer
attempt → strict `BEARER_PATTERN` or `'invalid'` → uniform 401. Non-Bearer
schemes (`Basic …`) return `null` → cookie path preserved. Non-string header
still `null`.
**Verification:** core-api typecheck pass; eslint pass; live PG
`pat-auth.test.ts` 15/15 pass.
**Regression test:** `M-03: Bearer malformado nao cai para cookie (401
uniforme); Basic cai` — `Bearer`, `Bearer␣`, `Bearer xyz-curto`,
`bearer xyz-curto`, `BEARER` + valid cookie → 401 `UNAUTHENTICATED`;
`Basic …` + valid cookie → 200.

### M-04: `CAPABILITY_VERSION` defined twice despite the "definição única" claim

**Files modified:** `packages/core/src/capabilities.ts`, `tests/smoke/capabilities-guard.test.ts`
**Commit:** `77709eb` (`fix(05): M-04 single-source CAPABILITY_VERSION`)
**Applied fix:** `packages/core/src/capabilities.ts` no longer declares its own
literal; it `import { CAPABILITY_VERSION, capabilityNameSchema } from
'@uhhu/contracts'` and `export { CAPABILITY_VERSION }`. `core/index.ts`
re-export unchanged. `@uhhu/core` already depends on `@uhhu/contracts`, no new
cycle.
**Verification:** `pnpm --filter @uhhu/core run typecheck` pass; eslint pass;
smoke `capabilities-guard.test.ts` 10/10 pass (2 new).
**Regression test:** `M-04 CAPABILITY_VERSION fonte unica` — value equality
(`CORE === CONTRACTS === 'v1'`) + structural (`export const
CAPABILITY_VERSION =` absent, `from '@uhhu/contracts'` present).

## Final gates (after all 7 commits)

- `pnpm --filter @uhhu/cli|@uhhu/core-api|@uhhu/core run typecheck`: pass ×3.
- `npx eslint` on all 9 touched files: pass (exit 0).
- `pnpm vitest run --project smoke`: 5 files, 93 tests passed.
- Live PG (`source .env.dev.cs`): `pat-auth` 15 + `cli-headless` 7 +
  `mcp-headless` 7 + `headless-idor` 10 = 39 passed, ephemeral ports only
  (stale :3000 untouched, no extra server left running).
- `git status`: only pre-existing Phase 4 uncommitted files remain modified;
  no fix files left uncommitted; `REVIEW-FIX.md` uncommitted by design.

## Skipped Issues

None — all in-scope findings fixed. Out-of-scope informative findings I-01…
I-05 intentionally untouched per `fix_scope: critical_warning`.

---

_Fixed: 2026-09-11T15:11:10Z_
_Fixer: OpenCode (gsd-code-fixer)_
_Iteration: 1_
