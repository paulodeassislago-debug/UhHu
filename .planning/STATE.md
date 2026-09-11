---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Lab UI v1
status: "planning — defining requirements"
stopped_at: 06-01 done, ready for 06-02
last_updated: "2026-09-11T18:43:26Z"
last_activity: "2026-09-11 — 06-01 done (referenceSearchId + isNew + CORS; UI-30/31/32; 3 task commits + SUMMARY)"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-11)

**Core value:** Um pesquisador usa o Lab por interface tablet-first (web/PWA beta + nativo) consumindo SOMENTE o CORE — do login ao corpus exportado.
**Current focus:** Defining requirements for v1.1 Lab UI v1 (research skipped; esqueleto §14 + spec §9 as base)

## Current Position

Phase: 6 of 9 (Executing — Wave 1/3: 06-01 done, 06-02 next sequential, no worktree isolation in this runtime)
Plan: 06-02 of 4
Status: Executing Phase 6
Last activity: 2026-09-11 — 06-01 done (referenceSearchId + isNew + CORS, 3 commits, SUMMARY written)
Resume file: .planning/phases/06-fundacao-app-auth-suporte-core/06-02-PLAN.md

Progress: [██░░░░░░░░] 1/4 plans complete (Phase 6 executing)

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Average duration: ~10min
- Total execution time: ~19min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Fundação executável | 2 | ~19min | ~10min |
| 3. Buscas e adapters | 6 | ~74min+40min | ~19min |
| 4. Corpus e exportação | 5 | ~150min (executor + checkpoint/fixes) | ~30min |

**Recent Trend:**

- Last 5 plans: 03-02, 03-03, 03-04, 03-05, 03-06 done (Phase 3 fechada 6/6)
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: GSD ancorado aos dev-docs; `AGENTS.md` preservado; research reutilizada
- 01-01: gates lint/format escopados ao monorepo via ignores (legado e docs fora do gate); `tsconfig.base` sem `outDir`/`rootDir`; placeholders sem imports cross-workspace até existir `dist`; `pnpm-lock.yaml` commitado
- 01-02: entradas `@uhhu/config`/`@uhhu/db` apontam para `src/` (sem build ainda); meta do drizzle-kit (journal+snapshot) commitada; `drizzle.config.ts` consome env validado; `HealthResponse` em `health.ts` até a validação do contrato (D-08); `x-request-id` com allowlist + `migrate` com redação total (auditoria)
- 01-03 (tasks 1-2): CI fail-closed 6 jobs + aceite formal como única exceção; vitest workspace smoke+integration com env dummy condicional (nunca sobrescreve real); `sql` via `@uhhu/db` (D-10); skip de integração só em offline definitivo; `migrate` loga cadeia de causas redigida; FOUND-03 segue aberto até CI verde + aprovação humana
- 03-01: `PerSourceMetrics.status` com 'skipped' (Record exige ambas as chaves; fonte única); `SourceHealthDTO.source: LabSource` (health de qualquer fonte do registry); `created_by` sem cascade (cadeia já remove); jsonb sem `$type` (sem dep contracts→db)
- 03-02: dep `@uhhu/contracts` no integrations (DTO em definição única, sem duplicar); challenge conta como falha no breaker (5 seguidas→60s); barrel em 2 etapas (health só na task 2, gate typecheck por commit)
- 03-03: erros de search como valores (failed/challenge), só RangeTooWideError/termo-vazio lançam; ficha CAPES só em host público (SSRF); teste sem `import.meta` (tsconfig raiz = CJS, fixtures via process.cwd)
- 03-04: task 3 (barrel) commitada antes da task 2 (executor importa do barrel — gate typecheck); keyHash=sha256(userId|key) + bodyHash separados (corpo na chave mataria o 422); 1 evento health por fonte/run (challenge recuperado conta); UPDATE final condicional + complementar só-métricas (cancel concorrente vence); oasisbr checado na linha crua; try/catch por tentativa (RangeTooWideError→failed, D-37)
- 03-05: ResultDTO.rawMetadata aditivo (contrato §19; proveniência D-34 no GET result); 202 resolve run corrente via listRuns limit 1 + fallback aguarda desfecho; key malformada → 400 (nunca ignorada); GET /lab/sources = array do registry; JobDTO progress null só em queued, resultRef só em terminal; rota nunca passa fetchFn (handoff 03-04 honrado)
- 03-06: checkpoint "approved with capes blocked" (CAPES 61ms sem challenge = bloqueio na fonte, não bug; partial D-37 funcionou); fixtures 03-03 seguem prova de corretude CAPES; re-teste ao vivo entra no próximo ciclo; auditoria 0 crit/0 high
- 05-01: registry 20 capabilities v1 em contracts (definição única) + execute() fail-closed em core validando contra capabilityNameSchema (nunca duplica nomes); ActorContext session|pat sem consumer `=== 'session'` quebrado; PAT 30d sliding espelhando rememberMe=true (tabela + migration 0004 via generate renomeada + patExpiry); guard D-55 verde em smoke com fallback relativo (@uhhu/core não linkado na raiz); push 0004 ao PG deferido ao 05-02 (T-05-01-TAMPER); suite 98/98 PG real; auditoria 0 crit/0 high
- 05-02: servidor PAT + execute end-to-end (CORE-02 server-side, núcleo CORE-05): pat.ts (6 fns, sliding 30d, null único) + requireAuth Bearer-first (401 único, cookie intacto, patId p/ logout); capabilities.ts com mapa total (20 §10 + 14 transicionais com allowlist fail-closed — registry §10 não cobre get/cancel/tags/pins; adendo ao contrato adiado) + toHttpError por instanceof + callCapability promise-passing + sendExport/assembleExport movidos; rotas lab/projects 100% via execute() (37/6, zero lib/ incl. types) sem mudar nenhum status (63/63 sem regressão); PAT CRUD com lockout+throttle compartilhados, logout/logout-all/reset revocam PATs; migration 0004 aplicada ao PG DEV e provada; pat-auth 12/12; suite 110/110 PG real; auditoria 0 crit/0 high
- 05-03: CLI @uhhu/cli headless (CORE-02/05 lado CLI): bin via wrapper bin/uhhu.mjs→tsx sem build (nome nu exige wiring da raiz — adiado, root com hunk Phase 4); client apiFetch (Bearer+X-Request-Id+Idempotency-Key, envelope verbatim, raw byte-exato, sem Bearer vazio) + waitForJob 600s; store 600+stat, env precede, logout revoga+apaga; 22 comandos (D-64 + cadeia total Phase 4); `--result` = grupo de dedup (D-46); comandos nunca exitam (só uhhu.ts); spawn em teste sempre async (sync deadlocka servidor in-process); cli-unit 17/17 + cli-headless 7/7; suite 134/134 PG real; auditoria 0 crit/0 high
- 05-04: MCP @uhhu/mcp headless (CORE-02/05 lado MCP): sdk 1.30.0 pinado exato (sem fallback, rede ok, zod v4 suportado); client mcpFetch (Bearer PAT via env+X-Request-Id+Idempotency-Key, raw byte-exato) + mcpWaitForJob 600s; 11 tools verbatim com inputSchema=.shape da rota + confirm:z.literal(true) nas 5 (pre-check confirm_required PT-BR sem E/S; SDK valida antes do handler no transporte); execute retorna run em qualquer desfecho; export={filename,contentType,sizeBytes,contentJson|contentText}; McpConfigError vira unauthenticated acionavel; withMcpEnv stripa *DATABASE* com restore; 2º usuário usa cookie admin p/ convite; mcp-tools 29/29 + mcp-headless 7/7; suite 170/170 PG real; auditoria 0 crit/0 high (traversal `..` e Bearer vazio corrigidos)
- 05-05: prova headless 3 canais + gate Etapa 2 APPROVED 2026-09-11 (CORE-02/05 evidenciados): helper MCP stdio via imports relativos dist/esm + alias StdioTransport (pnpm isolado nao resolve bare specifier de scripts/); script prova-headless.sh 4 fases ALL PASS (REST cookie → CLI PAT env filtrado → MCP via helper → 7 negativas 401/404/confirm) com IDEMP por busca (prova-<data>-<search8>, mesma key+corpo distinto = 422 por D-58) e CSV data rows via awk NR-1 (attachment sem newline final); matriz IDOR 10/10 nas 8 superficies novas (tokens/export/corpus/compare/results/decision/run/job); auditoria adversarial 05-01–05-05 0 crit/0 high; Gitleaks historico 94 commits 0 leaks (tree so 2 achados em gitignored fora do repo); SAST 0 ERROR; pnpm audit 0 vulns; suite 180/180 (smoke 81 + integration 99) com sanidade 81/81 revalidada pos-approval
- 06-01: suporte CORE §14+CORS (UI-30/31/32, a2f12d5+dbd02b5+b293c3c): reference_search_id uuid nullable SEM FK (ciclo projects↔lab_searches evitado; pertencimento application-level mesmo projectId+owner, 404 IDOR; null limpa) + migration 0005 aplicada no PG DEV; isNew on-read via anti-join D-35 (seenKeysForSearch, um Set/request, toResultDTO(row,isNew) obrigatório; teste PG real 2/2 + newCount consistente); CORS @fastify/cors 11.3.0 allowlist exata CORS_ALLOWED_ORIGINS fail-closed (curl válida ACAO+credentials / adulterada sem ACAO / preflight 204); ZodError do lib→400 em toHttpError + corsAllowedOrigins no barrel (Rule 2); gates literais com falso-positivo documentados (TODO em TODOS, references( em comentário, origin:true em comentário); suite 7/7 (projects 5 + isnew 2); eslint 10 arquivos exit 0; pnpm audit só 3 moderate pré-existentes (vitest); gitleaks/sast sem binário local — CI cobre

### Pending Todos

None yet.

### Blockers/Concerns

- CHECKPOINT 01-03/task 3 CONCLUÍDO 2026-09-10 (contrato APROVADO 1–24 pelo Paulo; evidências no adendo do 01-03-SUMMARY; repasse `founds-01-03-opencode.md` incorporado e apagado): PG DEV postgres 16.14 no ar; migrate exit 0 host+container; /health `{"status":"ok","db":"ok","version":"0.1.0-fase1","migrationsApplied":1}`; gates verdes com integração REAL (5/5 + 3/3, zero skip); audit high exit 0; FOUND-01 (schema `drizzle.__drizzle_migrations`) patchado em `packages/db/src/client.ts:31` e provado vivo; FOUND-02 documentado em `dev-docs/05-infra.md` §3; FOUND-01/FOUND-04 complete; code-server na rede `uhhu-dev_default` via `.env.dev.cs` (600, gitignored)
- Repo GitHub PÚBLICO (decisão do Paulo 2026-09-10) + branch protection ativa em `main`: 6 checks obrigatórios (`gates`, `secrets-tree`, `secrets-history`, `sast`, `audit`, `integration-pg`), `strict: true`, `enforce_admins: true`. T-03-04 mitigado.
- Toolchain reinstalada nesta sessão em `~/toolchains/node-v22.17.0-linux-arm64` (symlinks de `/tmp/opencode` haviam evaporado; `~/.local/share` é root-owned) + `xz-utils` via apt; `corepack prepare pnpm@9.15.0`; PG DEV via rede docker `uhhu-dev_default` (`.env.dev.cs`), sem túnel SSH
- Vault symlink quebrado aqui — usar `docs/` + `dev-docs/`; sincronizar com vault via bridge

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-09-11T18:43:26Z
Stopped at: Phase 6 executing — 06-01 done, ready for 06-02
Resume file: .planning/phases/06-fundacao-app-auth-suporte-core/06-02-PLAN.md (REQUIREMENTS.md UI-30/31/32 marked done)
