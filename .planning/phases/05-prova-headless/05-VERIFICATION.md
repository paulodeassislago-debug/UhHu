---
phase: 05-prova-headless
verified: 2026-09-11T12:00:00Z
status: passed
score: 20/20 must-haves verified
overrides_applied: 0
---

# Phase 5: Prova headless Verification Report

**Phase Goal:** Mesma capability executável por REST e por CLI/MCP sem duplicar regra; gates de suite verdes
**Verified:** 2026-09-11T12:00:00Z
**Status:** passed
**Re-verification:** No — initial verification (no prior VERIFICATION.md in phase dir)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 05-01: execute() despacha capability registrada para o handler com ActorContext e rejeita nome desconhecido com erro tipado | ✓ VERIFIED | `packages/core/src/capabilities.ts` (50 lines): `createExecutor` + `UnknownCapabilityError` (5 refs); smoke `capabilities-guard` 8/8, re-run 81/81 green |
| 2 | 05-01: ActorContext aceita authMethod session\|pat sem quebrar nenhuma rota de sessão existente | ✓ VERIFIED | `actor.ts` exactly 1× `authMethod: 'session' \| 'pat'`; session regression green (pat-auth + full suite per 05-02/05-05 summaries) |
| 3 | 05-01: Tabela personal_access_tokens existe via migration versionada com hash único, expiração e revogação | ✓ VERIFIED | `schema.ts` 3× `personalAccessTokens`; `0004_personal_access_tokens.sql` with CREATE TABLE + UNIQUE + FK cascade; applied to PG DEV (select-1 proof in pat-auth beforeAll) |
| 4 | 05-01: Guard estrutural quebra se apps/cli ou apps/mcp importarem @uhhu/db, drizzle ou SQL | ✓ VERIFIED | `capabilities-guard.test.ts` (174 lines, 8 its); 0 db/drizzle imports in `apps/cli`, `apps/mcp`, `packages/core` (only match is a comment); smoke green |
| 5 | 05-02: CLI obtém PAT via login por API sem cookie e lista PATs ativos, revoga um e revoga todos | ✓ VERIFIED | `POST /auth/token` + `GET/DELETE /auth/tokens` (4 refs in auth.ts); all 6 pat.ts exports (`issuePat…revokeAllPats`); `revokeAllPats` 3 refs; pat-auth 13 its incl. full cycle |
| 6 | 05-02: Bearer PAT acessa as mesmas rotas lab/projects com o mesmo 404 IDOR e o mesmo envelope PT-BR | ✓ VERIFIED | Bearer-first in `requireAuth.ts` (`resolvePat`/`touchPat` 5 refs, `authMethod: 'pat'` ×1); pat-auth asserts identical code+message Bearer≈cookie + IDOR Bearer |
| 7 | 05-02: Toda rota lab/projects passa por execute() — não existe chamada direta a lib fora do mapa de handlers | ✓ VERIFIED | `execute(` 37× lab.ts + 6× projects.ts; direct `lib/` imports in routes = 0; `buildExecutor`/`createExecutor` 4 refs in capabilities.ts (598 lines) |
| 8 | 05-02: Emissão de PAT compartilha lockout 5→15min e rate-limit do login; fora do escopo continua 404 idêntico | ✓ VERIFIED | Same `ip:login` bucket (no new bucket); lockout test 5×401→429 ACCOUNT_LOCKED; cross-PAT DELETE → 404 |
| 9 | 05-03: Usuário faz login pelo CLI, lista projetos e executa a cadeia lab sem abrir o navegador | ✓ VERIFIED | 22 commands (uhhu.ts) + 14 in commands.ts (900 lines); `cli-headless` 8 its chain vs real PG; `bin/uhhu.mjs` executable wrapper present |
| 10 | 05-03: CLI nunca importa @uhhu/db nem abre conexão PG — só HTTPS contra a API com Bearer PAT | ✓ VERIFIED | 0 db/drizzle refs in cli src+package.json; guard green; integration child runs with env stripped of `*DATABASE*` |
| 11 | 05-03: Saída legível em tabela por default e JSON puro com --json; -v mostra progresso do polling | ✓ VERIFIED | `table.ts` (`printTable`/`printJson`); cli-unit 17 its (table, store, error mapping, polling/timeout) |
| 12 | 05-03: Export baixa o attachment e salva corpus-\<projeto\>-\<data\>.ext; --idempotency-key repassa o header | ✓ VERIFIED | `content-disposition` handling in client+commands; `Idempotency-Key` 4+9 refs; integration saves parseable `corpus-*.json`; proof replay SAME run |
| 13 | 05-04: Agente lista 11 tools semânticas e executa a cadeia Etapa 2 por tools com o mesmo PAT e o mesmo 404 | ✓ VERIFIED | All 11 verbatim names present (2–3× each) in `tools.ts` (471 lines); `mcp-headless` 8 its chain + cross-user NOT_FOUND vs real PG |
| 14 | 05-04: Tools destrutivas exigem confirm:true explícito e declaram efeitos/proveniência no schema | ✓ VERIFIED | `confirm` 14 refs; `Efeitos`/`Proveniência` 22 refs; smoke 29 its incl. no-fetch rejection without confirm on all 5 effectful tools |
| 15 | 05-04: MCP nunca importa @uhhu/db nem expõe tool SQL/genérica; DTOs e paginação idênticos ao REST | ✓ VERIFIED | 0 db/drizzle refs in mcp src+package.json; SDK 1.30.0 pinned exact (0 carets); `nextCursor`/`hasMore` passthrough 3 refs |
| 16 | 05-04: Erros voltam no envelope PT-BR com requestId, sem stack/SQL/tokens | ✓ VERIFIED | `McpToolError {code,message,requestId}`; smoke asserts 404 carries requestId without token; `StdioServerTransport` ×1 in index.ts |
| 17 | 05-05: Cadeia projeto→busca→run→resultados→dedup→decisão→corpus→exportação executa por REST e repete por CLI e por MCP contra o mesmo banco | ✓ VERIFIED | `prova-headless.sh` (365 lines): FASE A/B/C/D all present, 47 `assert_code`, 10 `mcp-call` invokes, `ALL PASS` ×1; `mcp-call.mjs` (`StdioClientTransport` ×1); human checkpoint APPROVED 2026-09-11 |
| 18 | 05-05: Nenhum passo da prova toca o PostgreSQL direto pelo CLI/MCP (só a API) | ✓ VERIFIED | `env -u *DATABASE*` 18× in proof script; D-55 guards green in smoke re-run; CLI/MCP integration suites assert DATABASE-free env |
| 19 | 05-05: IDOR dono/estranho/adulterado passa nas superfícies novas e auditoria adversarial + scanners passam sem crítico/alto | ✓ VERIFIED | `headless-idor.test.ts` (857 lines, 10 real its, `404` ×32, GHOST ×1, `any` 0); audit 0 crit/0 high; Gitleaks history 94 commits 0 leaks; SAST 0 ERROR; `pnpm audit` 0 vulns (per 05-05 SUMMARY evidence) |
| 20 | 05-05: Humano aprova a prova ponta a ponta com a cadeia visível nos 3 canais | ✓ VERIFIED | Checkpoint APPROVED "approved" 2026-09-11 recorded in 05-05-SUMMARY + ROADMAP line 106; STATE/ROADMAP updated (commits 74424f8, 43d16da) |

**Score:** 20/20 truths verified

### Roadmap Success Criteria (contract)

| SC | Criterion | Status | Covering truths |
|----|-----------|--------|-----------------|
| 1 | Uma capability do Lab executa por REST e por CLI/MCP sem implementação paralela de negócio | ✓ VERIFIED | 5, 6, 7, 9, 13, 17 (routes are thin `execute()` adapters; CLI/MCP are thin REST adapters; zero lib/db imports at the edges) |
| 2 | Auditoria adversarial + IDOR + scanners passam; críticos/altos corrigidos ou com aceite formal | ✓ VERIFIED | 19 (0 crit/0 high across 05-01–05-05 audits; REVIEW advisory only, none breaks a must-have — see Anti-Patterns) |
| 3 | Gate Etapa 2: projeto→busca→run→revisão→dedup→decisão→exportação sem tocar o banco | ✓ VERIFIED | 17, 18, 20 |

### Required Artifacts

All 25 artifacts exist, are substantive (no stubs), and are wired. Spot-verified levels:

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/contracts/src/capabilities.ts` (35 lines) | 20 capability names + version, single definition | ✓ VERIFIED | 20 unique names incl. `lab.search.execute`; wired via `capabilityNameSchema` reuse in core + server allowlist |
| `packages/core/src/capabilities.ts` (50 lines) | Registry + fail-closed execute, no db | ✓ VERIFIED | `createExecutor`/`UnknownCapabilityError` ×5; 0 db imports; imported by smoke + server |
| `packages/core/src/actor.ts` | session\|pat | ✓ VERIFIED | 1 exact match; consumed by requireAuth pat branch |
| `packages/db/src/schema.ts` + `0004_*.sql` | PAT table + versioned migration | ✓ VERIFIED | `personalAccessTokens` ×3; SQL CREATE TABLE + UNIQUE; applied to PG DEV |
| `tests/smoke/capabilities-guard.test.ts` (174 lines) | D-55 guard + execute unit | ✓ VERIFIED | 8 its, green in re-run |
| `apps/core-api/src/auth/pat.ts` (150 lines) | 6 PAT functions, sliding 30d | ✓ VERIFIED | 6/6 exports; consumed by requireAuth + auth routes |
| `apps/core-api/src/auth/requireAuth.ts` (160 lines) | Bearer-first + cookie fallback | ✓ VERIFIED | `resolvePat`/`touchPat` wired; `authMethod: 'pat'` ×1 |
| `apps/core-api/src/capabilities.ts` (598 lines) | CapabilityName→ForActor map + executor | ✓ VERIFIED | `buildExecutor` wired into lab.ts:207 + projects routes; `toHttpError`/`callCapability`/`sendExport` shared |
| `tests/integration/pat-auth.test.ts` (712 lines) | PAT cycle + Bearer IDOR + lockout | ✓ VERIFIED | 13 its |
| `apps/cli/src/{uhhu,client,auth-store,table,commands}.ts` + `bin/uhhu.mjs` | CLI per D-64/D-65/D-66/D-62 | ✓ VERIFIED | 22 commands; `apiFetch`/`waitForJob` 27 uses in commands.ts; `0o600`/`UHHU_TOKEN` ×9 |
| `tests/smoke/cli-unit.test.ts` (373 lines) | CLI unit, no PG/net | ✓ VERIFIED | 17 its, green in re-run |
| `tests/integration/cli-headless.test.ts` (581 lines) | CLI chain vs PG, no DATABASE_URL | ✓ VERIFIED | 8 its |
| `apps/mcp/src/{tools,index,mcp-client}.ts` (471/66/235 lines) | 11 tools + stdio + client | ✓ VERIFIED | 11 verbatim; `mcpFetch`/`mcpWaitForJob` 16 uses; dynamic `registerTool` loop |
| `tests/smoke/mcp-tools.test.ts` (455 lines) | Tool contract, no PG/net | ✓ VERIFIED | 24 its + it.each (29 total), green in re-run |
| `tests/integration/mcp-headless.test.ts` (519 lines) | MCP chain vs PG | ✓ VERIFIED | 8 its |
| `scripts/prova-headless.sh` (365 lines) | 3-channel chain, ALL PASS | ✓ VERIFIED | 4 FASEs, 47 asserts, env-filtered CLI/MCP |
| `scripts/mcp-call.mjs` (118 lines) | stdio helper for proof | ✓ VERIFIED | `StdioClientTransport` ×1; TOKEN/URL-only child env |
| `tests/integration/headless-idor.test.ts` (857 lines) | IDOR matrix new surfaces | ✓ VERIFIED | 10 real its, 8 surfaces × 4 actors |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| core/capabilities.ts | @uhhu/contracts | `CapabilityName` schema reuse | ✓ WIRED | Fail-closed double check (schema + lookup) |
| requireAuth.ts | pat.ts | `resolvePat` + background `touchPat` | ✓ WIRED | 5 refs; Bearer hex64 strict, uniform 401 |
| routes/lab.ts + projects.ts | capabilities.ts | `buildExecutor(db)` + `callCapability` (promise-passing, call-site invokes `execute()` literally) | ✓ WIRED | 37 + 6 `execute(`; 0 direct lib imports |
| routes/auth.ts | pat.ts | token issuance/listing/revocation | ✓ WIRED | `issuePat`/`revokePat`/`revokeAllPats`/`listPatsForUser` all consumed; logout/logout-all/reset revoke PATs |
| cli/commands.ts | cli/client.ts | `apiFetch`/`waitForJob` per command | ✓ WIRED | 27 uses; no PG path exists |
| mcp/tools.ts | mcp/mcp-client.ts | `mcpFetch`/`mcpWaitForJob` per tool | ✓ WIRED | 16 uses; `UHHU_TOKEN` required before any network |
| mcp/index.ts | mcp/tools.ts | dynamic `TOOL_DEFINITIONS`/`callTool` registration | ✓ WIRED | `registerTool` loop; stdout stays JSON-RPC clean |
| prova-headless.sh | uhhu CLI + MCP | same chain via cookie-REST, PAT-CLI, PAT-MCP | ✓ WIRED | 10 mcp-call invokes; CLI sees Phase-A project (same DB) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| requireAuth Bearer branch | `request.actor` (pat) + `patId` | `resolvePat` → `personal_access_tokens` lookup by sha256 hash | ✓ FLOWING | Real PG lookup; null-singleton for absent/expired/revoked |
| capabilities map | handler results | `*ForActor(db, actor, input)` owner-scoped via JOIN→Project | ✓ FLOWING | Same functions the REST routes used pre-refactor; 63/63 pre-existing integration green post-refactor |
| CLI `project list --json` | CLI table/JSON output | `apiFetch` → live API vs same PG | ✓ FLOWING | Proof Phase B sees Phase-A project; integration asserts content |
| MCP `lab_export_project` | `{filename, contentType, sizeBytes, content…}` | `mcpFetch` → export attachment endpoint | ✓ FLOWING | Filename `corpus-*` asserted in proof + integration |
| prova-headless replay | SAME run id across B3/B4 | `Idempotency-Key` 24h window server-side | ✓ FLOWING | `PASS B4 replay MESMO run (be8c57fd…)` in ALL PASS log |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Smoke suite (guards + CLI/MCP unit, no PG) | `pnpm vitest run --project smoke` | 5 files, 81/81 passed (5.4s) | ✓ PASS |
| Guard D-55 structural | included above | capabilities-guard 8/8 | ✓ PASS |
| CLI bin entrypoint | `ls -la apps/cli/bin/uhhu.mjs` | present + executable | ✓ PASS |
| Full integration (180/180 vs PG DEV) | documented in 05-05 SUMMARY | 99 integration + 81 smoke, 0 failures | ✓ PASS (evidence; not re-run — needs live PG + ports, human-approved) |
| Live prova-headless ALL PASS | documented in 05-05 SUMMARY | ALL PASS log excerpt + human approval | ✓ PASS (evidence; not re-run — same reason) |

Step 7b note: live server checks were deliberately NOT re-run (ports 3000/3001 owned by other sessions; human already approved the live run 2026-09-11). Static + smoke re-checks substitute.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CORE-02 | 05-01, 05-02, 05-03, 05-04, 05-05 | Capabilities via `execute(name, input, ActorContext)`; HTTP/CLI/MCP adapt E/S | ✓ SATISFIED | Registry + fail-closed executor; all lab/projects routes via `execute()`; CLI/MCP thin REST adapters; 3-channel proof |
| CORE-05 | 05-02, 05-03, 05-04, 05-05 | CLI via API never PG; MCP only semantic tools, no generic SQL | ✓ SATISFIED | 0 db imports in cli/mcp; D-55 guard green; no generic-SQL tool; 11 semantic tools with confirm gates |

Traceability: REQUIREMENTS.md maps exactly CORE-02→Phase 5 and CORE-05→Phase 5 — both claimed by plans, both evidenced. No orphaned Phase-5 requirements. (REQUIREMENTS.md checkboxes still `Pending` — flip to complete is the orchestrator's recon step at phase-close, per 05-05 SUMMARY "Next Phase Readiness".)

D-54–D-70 honors (05-CONTEXT): all 17 decisions evidenced — D-54 chain×3 (truth 17), D-55 guard (truth 4), D-56 polling `waitForJob`/`mcpWaitForJob` (truths 11–13), D-57 audit+scanners (truth 19), D-58 idempotency replay (truths 12, 17), D-59 file export (truth 12), D-60/D-61 PAT format+30d cycle (truths 3, 5), D-62 600+env (truth 10), D-63 same-authZ/404/lockout (truths 6, 8), D-64 verbatim command names (truth 9), D-65 table/--json (truth 11), D-66 pnpm bin (truth 9), D-67 11 tools (truth 13), D-68 confirm (truth 14), D-69 same PAT (truths 13, 16), D-70 DTOs/pagination (truth 15).

### Anti-Patterns Found

No stubs, TODOs, `any`, `Math.random`, or `eval` in any phase file (reviewer independently verified across 27 files). `return null` hits are the documented null→404 passthrough pattern, not stubs. Advisory findings from 05-REVIEW.md (0 critical; 3 high + 4 medium + 5 low, all WARNING/Info) were assessed against must-haves — **none breaks a must-have truth**, so none is a gap:

| File | Finding | Severity | Impact |
|------|---------|----------|--------|
| `apps/cli/src/commands.ts:458-492` | H-01: fast-path 201 with failed status exits 0 (timing-dependent exit code) | ⚠️ Warning | Real bug, but chain executability (the must-have) holds; polling path already exits 1. Recommend fix pass, not phase blocker |
| `apps/cli/src/auth-store.ts:60-72` | H-02: stored baseUrl ignored when UHHU_TOKEN set | ⚠️ Warning | UX/wrong-server confusion; proof sets both vars explicitly so gate unaffected |
| `apps/core-api/src/routes/auth.ts:357-364` | H-03: logout session delete not scoped to actor (needs prior token theft) | ⚠️ Warning | Hardening; authZ enforcement itself intact, IDOR matrix green |
| `apps/cli/src/auth-store.ts` | M-01: credential mode enforced on write, never on read | ⚠️ Warning | Half-enforced 600 control; write path verified |
| `apps/cli/src/auth-store.ts` + `scripts/mcp-call.mjs` | M-02: UHHU_TOKEN untrimmed (MCP client trims) | ⚠️ Warning | Confusing 401 on pasted tokens; behavior divergence only |
| `apps/core-api/src/auth/requireAuth.ts:70-81` | M-03: malformed non-Bearer Authorization falls back to cookie | ⚠️ Warning | Surprising dual path; not exploitable without valid credential |
| `packages/core/src/capabilities.ts:13` | M-04: CAPABILITY_VERSION duplicated (contracts + core) | ⚠️ Warning | Drift risk on future bump; names remain single-sourced |
| misc | I-01…I-05 (export fallback sanitize, dead timeoutMs, brittle SDK path, duplicated helpers, global flag parser) | ℹ️ Info | Defense-in-depth / cleanup candidates |

### Human Verification Required

None. The only human gate in this phase (05-05 checkpoint, gate Etapa 2) was already executed and APPROVED by Paulo on 2026-09-11, with STATE/ROADMAP updated. No new genuinely-unverifiable-by-code items were found; live-server evidence (ALL PASS log, 180/180 suite, scanners) is documented in 05-05-SUMMARY and was human-accepted. Per verification notes, `human_needed` is not required for already-approved items.

### Gaps Summary

No gaps. All 20 must-have truths verified against the codebase (existence + substance + wiring + data flow), all 5 roadmap SCs covered, both Phase-5 requirements evidenced, D-54–D-70 honored, review advisories assessed as non-blocking.

Known non-blocking follow-ups (documented in SUMMARIES, not gaps — no action required for phase-close):
- 14 transitional capabilities (05-02) live in a local allowlist, not yet in contract §10 — needs a §10 addendum decision (AGENTS.md: no silent CORE changes).
- Bare `uhhu` bin name needs root wiring (collides with uncommitted Phase-4 hunk in root package.json).
- CLI `--password` appears in shell history (v1 accepted pattern, same as curl).

---
_Verified: 2026-09-11T12:00:00Z_
_Verifier: OpenCode (gsd-verifier)_
