---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Lab UI v1
status: "executing — phase 7 complete + gap 07-05 done (5/5 plans)"
stopped_at: Phase 7 plan 07-05 complete
last_updated: "2026-09-12T12:47:00Z"
last_activity: "2026-09-12 — Phase 7 gap plan 07-05 executed (wrapper UUID cross-platform + 3 toques migrados + tripwire; d84025d, eb6b2c2)"
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

Phase: 7 of 9 (Phase 7 COMPLETE 4/4 + gap 07-05 done — next phase 8 planning)
Plan: 07-05 of 5 (gap-closure UAT)
Status: Phase 7 complete + UAT blocker do caminho Executar fechado no código
Last activity: 2026-09-12 — Phase 7 gap plan 07-05 complete (sequential executor on main tree)
Resume file: .planning/phases/08-resultados-triagem/08-CONTEXT.md (phase 8 planning; 07-05 SUMMARY em .planning/phases/07-projetos-buscas-execucao/07-05-SUMMARY.md)

Progress: [████████████████] 5/5 plans complete (Phase 7 COMPLETE + gap 07-05)

Progress: [██████░░░░] 5/5 plans phase 6 + UAT approved (milestone v1.1 phase 6/9 done)

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: ~9min
- Total execution time: ~24min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Fundação executável | 2 | ~19min | ~10min |
| 3. Buscas e adapters | 6 | ~74min+40min | ~19min |
| 4. Corpus e exportação | 5 | ~150min (executor + checkpoint/fixes) | ~30min |
| 7. Projetos, buscas e execução | 5 (07-01, 07-02, 07-03, 07-04, gap 07-05) | ~38min | ~8min |

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
- 06-02: scaffold Expo SDK57 + client tipado (UI-01/UI-02, bef85d9+aad160f): montagem manual (não template) com pins template 57 (react 19.2.3 + RN 0.86.3, não latest 19.3.0/0.87.1 que quebra rn-get-polyfills) + screens/safe-area/linking/constants do router; 7 rotas placeholder (Stack typedRoutes, export web 1.1MB ok, Expo Go tailnet sem EAS); apiFetch (cookie include + Bearer injetado, x-request-id, envelope PT-BR, raw export, unknown+narrowing) + auth/projects/lab via import type + Zod fronteira, zero any; exactOptional body spread + eslint-disable node em babel/metro + .expo gitignore (Rules 1/3); gate localStorage em comentário + grep -c insatisfatível documentados; eslint exit 0; audit só toolchain Expo (5 mod + 2 high sem patch); auditoria 0 crit/0 high
- 06-03: auth web cookie + PAT nativo + convite + expiração (UI-05/UI-06/UI-07/UI-08, 83527eb+d60f213): AuthProvider memória (zero storage privilégio) com getToken por plataforma + isSafeNext; login MESMA tela Platform branch (web authApi.login cookie, nativo nativeLogin issuePat+SecureStore+refresh); register convite com prefill ?token= e erro verbatim; projects lista real com vazio/skeleton/retry + 401 expired; _layout gate UX com expired+next preservando /project/<id>; Metro resolve .js NodeNext dos contracts + imports extensionless no lab (Rules 3, export web 1.7MB); tsc+eslint verdes; pat-auth 15/15 + auth 6/6 PG real; auditoria 0 crit/0 high
- 06-04: estados §11 + gates app + prova beta (UI-03/UI-04, 37ef874+768135c): Empty/CardSkeleton/ErrorBanner/PartialBanner verbatim (Partial ok→null, sem fingir dado); login/projetos/projeto migrados (projeto busca listById real; 401→expired+next); vitest 7/7 sem rede (Response real + SecureStore mock Map); typecheck+lint exit 0, any 0; export web 1.7MB + dist grep 0; Gitleaks histórico 126 commits 0 + lab 0 (tree só 2 pré-existentes fora de escopo); audit só toolchain Expo; beta porta 3009 me 200+ACAO/projects real/401 PT-BR/adulterada sem ACAO/preflight 204; auditoria 0 crit/0 high
- 06-05: gap-closure UAT rolagem (UI-05/UI-04, 4592cd3+ee663f1): projects View+map → FlatList virtualizada (keyExtractor id opaco, mesmo card, ListEmpty verbatim + branch vazio preservado); login/register/[id] raiz ScrollView (flexGrow+keyboardShouldPersistTaps; [id] nos 4 branches); tripwire scroll-containers 3/3 (import+uso reais, zero .map fora de FlatList/renderItem); typecheck+lint exit 0, vitest 10/10, any 0, dist reexportado 1.7MB grep 0; Gitleaks sem binário local (CI cobre); auditoria 0 crit/0 high; re-teste humano UAT pendente
- 07-01: projetos na UI (UI-09/UI-10/UI-11, 1965da1+4817ef0): ProjectModal (createProjectSchema parse + flatten + ApiError verbatim) + lista FlatList com criar/arquivar/reativar + filtro Ativos/Arquivados + contagem leve via listSearches com cache por mount (elegíveis fora, UI-23); cabeçalho editável inline (vazia salva null) + TabBar 3 abas com Corpus vivo via getCorpus + formatCorpusCount; updateProjectSchema widened p/ researchQuestion/description null no update (alinhado a DTO + lib servidor, sem migration); vitest 13/13 (tripwire 3/3 + projetos-ui 3/3); typecheck lab+contracts+core-api + eslint exit 0, any 0; auditoria 0 crit/0 high
- 07-02: estratégias na UI (UI-12/UI-13, df7c5e1+76bdd54): searchTerm (linhas AND/OR/NOT → termo pass-through, split quote-aware) + SearchForm §6 (selo Core + saúde fontes + 2 CTAs, erro PT-BR sem API) + tela search-form (criar/editar + execute Idempotency-Key por toque + push run) + SearchCard §5 (runs/última reais, Executar/Duplicar, Comparar/Excluir disabled) + strategies FlatList + tripwire 5/5 + registro search-form no Stack; contrato intocado; vitest 25/25; typecheck+eslint exit 0, any 0; auditoria 0 crit/0 high
- 07-03: execução com acompanhamento (UI-14, 637b0ca+e585c41): useRunPolling (getRun imediato + 2500ms + teto 240 + 3 erros seguidos → retry manual, cleanup só-timer D-08, 401 imediato, retry exposto) + helpers isTerminalStatus/runStatusLabel/formatDurationMs (testes 6/6) + tela run.tsx §7 (progresso por fonte explícito, Cancelar só em polling, banners ok/parcial/falha/cancelada + repetir Idempotency-Key, placeholder fase 8 honesto, uuid inválido sem request, expired/next com runId+searchId, guarda expired anti-clobber) + tripwire 6/6 + registro run no Stack; contrato intocado; vitest 32/32; typecheck+eslint exit 0, any 0; auditoria 0 crit/0 high
- 07-04: cascata + histórico no card (UI-15/UI-16, 89841a3+4e114b1): runHistory.ts puro (formatRunWhen/summarizeRun, testes 8/8) + RunHistory expansível paginado (limit 20 + Ver mais, toque → string run?runId=) + DeleteSearchDialog (contagens honestas limit 100, Excluir explícito → 204 → onDeleted, erro verbatim sem fechar) + SearchCard final (histórico + excluir; Comparar disabled fase 9) + strategies remove card local; fase 7 FECHADA 4/4; vitest 40/40; typecheck+eslint exit 0, any 0; auditoria 0 crit/0 high
- 07-05: gap-closure UAT EXECUTAR AGORA no beta HTTP (UI-14, d84025d+eb6b2c2): `newIdempotencyKey()` em src/utils/uuid.ts (expo-crypto 57.0.3 version-aligned, NÃO ~15.x; cadeia randomUUID→getRandomValues→global porque o randomUUID web do expo também delega ao global ausente; getRandomBytes evitado — cai em PRNG fraco em __DEV__ remoto) + 3 toques migrados (search-form/run/SearchCard, key por toque, sem retry) + uuid.test.ts 6/6 (formato/unicidade/1000 sem colisão/ausência global/atalho seguro/sem-expo) + tripwire anti-`crypto.randomUUID` nu (provado com plantio temporário) + client.ts newRequestId intocado (já degrada); vitest 47/47; typecheck+lint exit 0, any 0, dist reexportado 1.8MB grep 0; audit só toolchain pré-existente; auditoria 0 crit/0 high; re-teste humano UAT item 1 pendente

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

Last session: 2026-09-12T12:47:00Z
Stopped at: Phase 7 COMPLETE + gap 07-05 (wrapper UUID cross-platform, EXECUTAR AGORA funciona no beta HTTP) — next phase 8 planning. Nota: re-teste humano UAT 07-HUMAN-UAT item 1 (EXECUTAR AGORA via tailnet) segue pendente em paralelo, junto com 06-HUMAN-UAT.
Resume file: .planning/phases/08-resultados-triagem/08-CONTEXT.md (phase 8 planning; 07-04 SUMMARY em .planning/phases/07-projetos-buscas-execucao/07-04-SUMMARY.md). Nota: re-teste humano UAT 06-HUMAN-UAT (LISTA ROLA web+nativo) segue pendente em paralelo.
