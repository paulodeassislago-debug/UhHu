---
phase: 03-buscas-e-adapters
verified: 2026-09-11T05:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 3: Buscas e adapters Verification Report

**Phase Goal:** Busca real BDTD+CAPES com runs temporais, proveniência e degradação graciosa
**Verified:** 2026-09-11T05:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                              | Status                          | Evidence                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Busca real em cada fonte devolve resultados estruturados (≥1 busca de teste por fonte)                                              | ✓ VERIFIED (partial-live, ver nota CAPES) | **BDTD AO VIVO:** run `partial`, `perSource.bdtd ok (total 893, returned 20, 226ms)`, registro `UEL_38802803a4db862b574d4ec10b52885e` ("Utilização de aplicativos no ensino de química") listado via `GET .../results` com `source/sourceId/rawMetadata` (03-06-SUMMARY §Human Checkpoint). **CAPES:** corretude provada pelo contrato com fixtures (15 its, `tests/integration/lab-sources-contract.test.ts`, sem rede); ao vivo a fonte bloqueou no lado dela (61ms, sem challenge, `offline 0/2`) e o `partial` preservou os 20 da BDTD — checkpoint humano `approved with capes blocked`. Re-teste ao vivo da CAPES é carry-over para o próximo ciclo. |
| 2   | Reexecução cria novo `SearchRun` com diff de novos; histórico persiste                                                             | ✓ VERIFIED                      | `executeSearchRun` insere sempre um novo `lab_search_runs` com snapshot congelado (`term_snapshot/filters_snapshot/sources_snapshot`); `newCount` por anti-join `(source,sourceId)` vs todos os runs anteriores da mesma search (searchRuns.ts:456-477); `listRunsForActor` ordenado `executed_at DESC` (histórico temporal); integração `LAB-03+SRC-05` prova rerun com `newCount 1` e snapshot congelado após edição (D-33); curl-lab.sh passo 14 prova rerun com id diferente. |
| 3   | Falha de uma fonte gera `partial` sem apagar resultados válidos; jobs têm estado e cancelamento                                      | ✓ VERIFIED                      | D-37 literal em searchRuns.ts:482-501 (2 ok→`succeeded`, 1 ok→`partial` + `SOURCE_UNAVAILABLE` preservando válidos, 0 ok→`failed`); provado em teste (`LAB-05+D-37`: CAPES falha→`partial` com BDTD preservada e listável; ambas falham→`failed`) **e ao vivo** (partial com 20 BDTD preservados). Job=Run 1:1 (`toJobDTO` em routes/lab.ts:154-176, `GET /api/v1/jobs/:jobId` + `POST .../cancel`); cancel cooperativo `queued\|running`→`cancelled` preservando parciais (searchRuns.ts:535-564), provado em teste com fake lento; throttle duplo (30/min IP no hook + 10 runs/h por usuário no banco). |
| 4   | Proveniência `Result→Run→Search→Project` + `source/sourceId/rawMetadata` reconstruível; health `ok\|degraded\|offline` visível      | ✓ VERIFIED                      | Cadeia reconstruível por JOINs owner-escopados em `getResultForActor/getRunForActor/getSearchForActor` (searches.ts:465-635); `ResultDTO` carrega `runId/source/sourceId/rawMetadata` (contracts/lab.ts:174-192, rota `GET /lab/results/:resultId`); `rawMetadata` integral higienizado por `sanitizeRaw` (bdtd.ts:64-77, capes.ts importa); `adapter_versions` + snapshots + `executed/started/finished` no run. Health: `computeSourceHealth` (janela 50ev/1h, 0→ok, <0.5→`degraded`, ≥0.5→`offline`, challenge conta em failed) exposto em `GET /lab/sources/:name/health` + `GET /lab/sources` (registry, oasisbr desabilitada); provado em teste (LAB-12, health `ok` com counts>0) **e ao vivo** (`bdtd ok 2/2`, `capes offline 0/2`). |

**Score:** 4/4 truths verified

### Nota honesta — CAPES (critério 1, partial-live)

O critério 1 está **parcialmente provado ao vivo**: BDTD viva (893 total / 20 retornados, registro inspecionado) + CAPES provada por contrato (fixtures fiéis aos shapes de 06/09/2026, 15 its verdes sem rede, `termo` intacto, `Ano` expandido, sem-divulgação→`sourceUrl null`+flag) + degradação graciosa provada ao vivo (`partial` + `SOURCE_UNAVAILABLE` PT-BR + 20 resultados BDTD preservados + health `offline 0/2`).

O que falta é **exclusivamente externo**: a CAPES respondeu em 61ms sem challenge — bloqueio no lado da fonte, não bug de código (cenário previsto no passo 5 do `how-to-verify` do checkpoint 03-06, veredito humano `approved with capes blocked`). Nenhum código novo é exigido desta fase por causa disso; o **re-teste ao vivo da CAPES é carry-over para o próximo ciclo** (STATE.md), sem re-tentativas em rajada (cortesia T-03-06-02). Marcar este critério como FAILED bloquearia a fase por uma dependência externa já aceita pelo humano — por isso o veredito é VERIFIED com qualificação explícita, e não um passe silencioso.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `packages/contracts/src/lab.ts` (289 linhas) | Schemas Zod + DTOs Search/Run/Result/Health/Job + cursor | ✓ VERIFIED | `searchTermSchema` (aspas balanceadas), `searchFiltersSchema` (yearFrom≤yearTo), `createSearchSchema`, `runStatusSchema` (6 estados), DTOs + `encode/decodeResultsCursor` null-safe; erros `SOURCE_DISABLED/SOURCE_UNAVAILABLE/IDEMPOTENCY_CONFLICT` no type E no ERROR_CATALOG PT-BR; exportado via `index.ts` (`lab.js`); `pnpm typecheck` verde |
| `packages/db/src/schema.ts` + `drizzle/0002_fancy_hiroim.sql` | 5 tabelas lab com CHECKs/índices/UNIQUE | ✓ VERIFIED | `lab_searches` (CHECK term 1..500, sources `<@`), `lab_search_runs` (CHECK 6 estados, snapshots, `created_by`), `lab_results` (CHECK bdtd\|capes, UNIQUE run+source+sourceId, `raw_metadata` NOT NULL, `rank`), `lab_idempotency_keys` (24h), `lab_source_events`; FKs cascade + índices; migration aplicada contra PG DEV (SUMMARY 03-01) |
| `packages/integrations/src/sourceClient.ts` (242 linhas) | fetch corticado por fonte | ✓ VERIFIED | `UH_HU_UA`, allowlist `bdtd.ibict.br`+`catalogodeteses.capes.gov.br` com `SourceHostBlockedError`, mutex, batch≤10+2s, timeout 15s via `AbortSignal.any`, challenge (`OasisbrVerify`/HTML-inesperado) com limpeza do jar + 1 retry pelo chamador, breaker 5→60s; zero `rejectUnauthorized`; nunca loga jar/corpo |
| `packages/integrations/src/registry.ts` | bdtd+capes on, oasisbr off | ✓ VERIFIED | `SOURCE_REGISTRY` com `oasisbr enabled:false` + `SourceDisabledError`; `getAdapter` instância única por fonte; `listSources` base do `GET /lab/sources` |
| `packages/integrations/src/health.ts` | `ok\|degraded\|offline` sem segredos | ✓ VERIFIED | `computeSourceHealth` (janela 50ev/1h, threshold `0.5`, 0ev→ok) + `recordSourceEvent`; retorno só counts+status+checkedAt; sem `cookie/Authorization/DATABASE_URL` |
| `packages/integrations/src/bdtd.ts` (535 linhas) | search+enrich VuFind | ✓ VERIFIED | `vufind/api/v1/search` + `lookfor` intacto + `type=AllFields` + `filter[]` formato/ano (`publishDate:[from TO to]`) + `page/limit` clamp 5..50; envelope Zod `resultCount/records`; `enrichBdtd` via `Record/<id>`; `sanitizeRaw` (definição única); challenge→`challenge`, transporte/parse→`failed` (nunca lança); `ADAPTER_VERSION='bdtd/1.0-fase3'` |
| `packages/integrations/src/capes.ts` (598 linhas) | search+enrich rest/busca | ✓ VERIFIED | POST `rest/busca` com `termo` intacto, `Ano` expandido por ano (cap 30→`RangeTooWideError` 422 antes da rede), `Grau Acadêmico` Mestrado/Doutorado, `Grande Área Conhecimento`/`Área Conhecimento`, institution fora da fonte; sem-divulgação→`sourceUrl null`+flag; `enrichCapes` (`#resumo`/`#palavras`/`link_download_arquivo`, SSRF validado); `ADAPTER_VERSION='capes/1.0-fase3'` |
| `packages/integrations/src/postFilter.ts` (190 linhas) | pós-filtro redundante | ✓ VERIFIED | `postFilter` idempotente (ano null mantém, docType canônico PT, substring sem acento p/ institution/program/area) + `describePostFilter` PT-BR; puro, sem I/O, sem `any` |
| `packages/integrations/src/adapters.ts` + `index.ts` | barrel final | ✓ VERIFIED | `getSourceAdapter('bdtd'\|'capes')`→`{search,enrich,version}`, `oasisbr`→`SourceDisabledError`; barrel exporta types+sourceClient+registry+health+adapters+postFilter sem colisões |
| `apps/core-api/src/lib/searches.ts` (635 linhas) | CRUD owner-first + results paginados | ✓ VERIFIED | 9 funções `*ForActor` com JOIN owner via `→Project` em TODA query; fora do escopo→null→404; cursor `createdAt\|id` (searches/runs) e `source\|rank\|id` (results, `source ASC, rank ASC`); `toSearchDTO/toRunDTO/toResultDTO` snake→camel com `rawMetadata` |
| `apps/core-api/src/lib/searchRuns.ts` (564 linhas) | motor sync/async-ready, partial, diff, idempotência | ✓ VERIFIED | `executeSearchRun` (escopo→oasisbr 400→rate-limit 10/h no banco→idempotência sha256 24h→queued/running→bdtd→capes sequencial, timeout global 60s, retry 1× pós-challenge, `postFilter`, persistência com rank, partial/failed D-37, `newCount` anti-join + coverage, UPDATE final condicional p/ cancel vencer) + `cancelRunForActor`; `MAX_SYNC_MS=25000`, `RUN_QUEUE_TIMEOUT_MS=60000` exportados; zero `Math.random`/`any` |
| `apps/core-api/src/routes/lab.ts` (648 linhas) | 14 rotas lab/jobs/health | ✓ VERIFIED | `buildLabRoutes` com searches CRUD (DELETE `?confirm=true`), POST runs com `Promise.race` 25s (201 concluído qq. status / 202+`Location` / 200+`Idempotent-Replayed`), histórico de runs, run+results (`{items,page,total,newCount}`), ficha result, sources, health, jobs 1:1+cancel; erros tipados→envelope PT-BR; `requireAuth`+`x-request-id` em todas; zero rotas Phase-4 |
| `apps/core-api/src/plugins/rateLimit.ts` + `src/index.ts` | throttle + boot | ✓ VERIFIED | bucket `lab-runs` (POST `.../searches/*/runs`, 30/min por IP, `labRunsRateLimit` exportado, distinção IP/min vs 10/h-usuário-no-banco documentada); `buildLabRoutes` registrado no boot único |
| `tests/integration/lab-sources-contract.test.ts` (480 linhas) + fixtures | contrato sem rede | ✓ VERIFIED | 15 its verdes SEM rede/PG (fetchFn fake no SourceClient real); fixtures com `resultCount` (BDTD) e `tesesDissertacoes` (CAPES, incl. sem-divulgação e campo ausente); cobre URL/payload, normalização, challenge, `sanitizeRaw`, `postFilter`, `oasisbr`→`SourceDisabledError` |
| `tests/integration/lab-search-runs.test.ts` (1104 linhas) | integração PG real | ✓ VERIFIED | 9/9 its verdes contra PG real (harness Fastify auth+projects+lab, 2 usuários, `x-request-id` + regex negativa de vazamento em todos): LAB-02 (declarativa + snapshot D-33), LAB-03+SRC-05 (coverage 3+3, rerun `newCount 1`), LAB-05+D-37 (partial/failed), LAB-04 (cadeia + rawMetadata), D-36 (cursor), CORE-03/D-39 (replay 200/422/429), CORE-04/D-29/D-30 (jobs/cancel/oasisbr 400), LAB-12 (sources/health), IDOR triplo |
| `scripts/curl-lab.sh` (executável) | prova manual ponta a ponta | ✓ VERIFIED | bootstrap→2 usuários→projeto→search→run→poll job→results→rerun→cancel→health→4×404 estranho + adulterado 404 + 401 sem cookie, cada passo com `assert_code`, final `ALL PASS` (executado contra boot+PG DEV) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `contracts/index.ts` | `contracts/lab.ts` | `export * from './lab.js'` | ✓ WIRED | grep confirma `lab.js` no barrel |
| `db/schema.ts` | `drizzle/0002_*.sql` | `drizzle-kit generate` | ✓ WIRED | SQL contém as 5 tabelas + CHECKs + índices + FKs |
| `bdtd.ts` / `capes.ts` | `sourceClient.ts` | `client.fetchText` corticado | ✓ WIRED | ambos importam `SourceClient` e chamam `fetchText` com `fetchInit` (jar/mutex/timeout/allowlist herdados, sem fetch próprio) |
| `postFilter.ts` | `types.ts` | opera sobre `NormalizedItem[]` | ✓ WIRED | import de tipo + `postFilter(items, def)` chamado pelo executor (searchRuns.ts:409) |
| `adapters.ts` | `registry.ts` | mesmo `SourceDisabledError` | ✓ WIRED | `oasisbr` lança o erro do registry (D-33 fim-a-fim até o 400 da rota) |
| `searchRuns.ts` | `adapters.ts` | `getSourceAdapter` por fonte | ✓ WIRED | searchRuns.ts:372 (+ versions em :294-295); try/catch por tentativa → `failed` (D-37 nunca derruba a outra fonte) |
| `searchRuns.ts` | `lab_search_runs` / `lab_results` / `lab_idempotency_keys` / `lab_source_events` | Drizzle insert/update/select | ✓ WIRED | 27 referências; insert run queued→running, inserts de results com `onConflictDoNothing`, `recordSourceEvent` por fonte/tentativa, UPDATE final condicional + complementar só-métricas |
| `searches.ts` | `projects` | JOIN `owner_id = actor.userId` | ✓ WIRED | TODA query com JOIN `lab_searches→projects` (ou cadeia `→Run→Search→Project`); `ownerId` nunca do body (grep zero) |
| `routes/lab.ts` | `searchRuns.ts` | `executeSearchRun` + `cancelRunForActor` | ✓ WIRED | POST runs via `Promise.race` 25s (201/202/200), cancel via `cancelRunForActor`; rota NUNCA passa `fetchFn` (handoff 03-04 honrado — `fetchFn` só em testes server-side) |
| `routes/lab.ts` | `health.ts` | `computeSourceHealth` | ✓ WIRED | `GET /lab/sources/:name/health` (lab.ts:594) + `listSources` em `GET /lab/sources` |
| `index.ts` (boot) | `routes/lab.ts` | `buildLabRoutes(child, db)` | ✓ WIRED | index.ts:51, ao lado de auth/projects, mesmo db único |
| `lab-search-runs.test.ts` | `routes/lab.ts` | Fastify inject com rotas reais | ✓ WIRED | harness monta `buildLabRoutes` + asserts de envelope/`x-request-id`/vazamento; 9/9 verdes |
| `curl-lab.sh` | `lab-search-runs.test.ts` | mesma cobertura dono/estranho/adulterado | ✓ WIRED | 4×404 estranho + adulterado 404 + 401; `ALL PASS` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `routes/lab.ts` → `GET .../results` | `items: ResultDTO[]` | `listResultsForActor` → `SELECT lab_results WHERE run_id + owner JOIN` ordenado `source,rank` | ✓ FLOWING | Linhas reais persistidas pelo executor (`insert labResults` searchRuns.ts:437); `total` por contagem; `newCount` do `metrics` do run. Ao vivo: 20 itens BDTD listados |
| `routes/lab.ts` → `GET /lab/results/:id` | `ResultDTO` com `rawMetadata` | `getResultForActor` → cadeia `Result→Run→Search→Project` | ✓ FLOWING | `rawMetadata` integral higienizado do adapter; registro BDTD verificado ao vivo |
| `routes/lab.ts` → `GET /jobs/:id` | `JobDTO` | projeção `toJobDTO` da linha `lab_search_runs` | ✓ FLOWING | Mesma linha do run (D-30 1:1); polling do curl confirma transições |
| `routes/lab.ts` → `GET .../health` | `SourceHealthDTO` | `computeSourceHealth` → `SELECT lab_source_events` (janela 50ev/1h) | ✓ FLOWING | Ao vivo: `bdtd ok 2/2`, `capes offline 0/2` a partir de eventos reais gravados pelo executor |
| `searchRuns.ts` → `metrics` | `perSource/coverage/newCount` | adapters reais (BDTD ao vivo; CAPES via fixtures em teste) + anti-join no banco | ✓ FLOWING | Ao vivo: `perSource {bdtd ok 893/20, capes failed 0/0}`, `coverage {20,0}`, `newCount 20`. Nenhum retorno estático: `failed: SourcePage` só em erro real de transporte/parse/HTTP≥400 |

Os `return []`/`return null` detectados pelo grep são inicializadores legítimos (`authors: string[] = []`, campo ausente→`null` por T-03-03-01, fora-do-escopo→`null`→404) — nenhum fluxo de renderização é alimentado por valor fixo vazio.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Typecheck strict do monorepo (root + 6 workspaces) | `pnpm typecheck` | verde (config, contracts, core, db, integrations, core-api) | ✓ PASS |
| BDTD monta `lookfor`+`filter[]` VuFind | grep `vufind/api/v1/search` + `lookfor` + `publishDate` em `bdtd.ts` + assert de URL no teste de contrato | URL montada e assertada via fetch fake | ✓ PASS |
| CAPES monta `rest/busca` com `Ano` expandido | grep `rest/busca` + `registrosPorPagina` em `capes.ts` + its de payload (2020–2022→3 filtros) | payload assertado via fetch fake | ✓ PASS |
| Partial preserva válidos + jobs/cancel | 9/9 its `lab-search-runs` + `curl-lab.sh ALL PASS` (evidência registrada em 03-06-SUMMARY; suíte 42/42) | `partial` com BDTD preservada; `cancelled` com parciais; `ALL PASS` | ✓ PASS (por evidência registrada; sem re-execução de PG/rede nesta verificação — verificação é só-leitura) |
| Health `ok\|degraded\|offline` com counts | grep `degraded`+`offline`+`0.5` em `health.ts` + rota `/:sourceName/health` | thresholds fixos + endpoint vivo (bdtd ok 2/2, capes offline 0/2 ao vivo) | ✓ PASS |
| `any` proibido / sem `rejectUnauthorized` / sem segredos | grep `as any\|: any\|@ts-ignore\|rejectUnauthorized\|console.log\|TODO\|FIXME` nos 8 arquivos da fase | zero ocorrências reais (2 falsos positivos em comentários PT-BR) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| LAB-02 | 03-01, 03-04, 03-05, 03-06 | Busca declarativa por projeto sem executar | ✓ SATISFIED | `createSearchSchema`, `createSearchForActor`, `POST/GET/PATCH/DELETE /lab/searches`; it LAB-02 (declarativa + edição com snapshot congelado) |
| LAB-03 | 03-01, 03-04, 03-05, 03-06 | `SearchRun` temporal + reexecução com diff | ✓ SATISFIED | snapshots + `executed/started/finished` + `adapter_versions`; `newCount` anti-join; histórico `listRunsForActor`; it rerun `newCount 1` |
| LAB-04 | 03-01, 03-04, 03-05, 03-06 | Proveniência `Result→Run→Search→Project` + `rawMetadata` | ✓ SATISFIED | cadeia por JOINs owner-escopados; `ResultDTO.rawMetadata`; it LAB-04 + registro BDTD verificado ao vivo |
| LAB-05 | 03-04, 03-05, 03-06 | `partial` sem perda; sync 201 / async 202 + jobs | ✓ SATISFIED | D-37 no motor; 201/202+`Location`/polling; it partial/failed + `partial` observado ao vivo com 20 preservados |
| LAB-12 | 03-02, 03-05, 03-06 | `GET /lab/sources` + health `ok\|degraded\|offline` | ✓ SATISFIED | registry + `computeSourceHealth`; it LAB-12; health ao vivo bdtd ok / capes offline |
| SRC-01 | 03-03, 03-06 | Adapter BDTD VuFind + enrich `Record/<id>` | ✓ SATISFIED | `searchBdtd` (`lookfor`+`type`+`filter[]`+paginação) + `enrichBdtd`; 15 its de contrato; **busca viva BDTD 893/20** |
| SRC-02 | 03-03, 03-06 | Adapter CAPES rest/busca + enrich ficha | ✓ SATISFIED | `searchCapes` (`termo`+`Ano` expandido+página≥5) + `enrichCapes` (`#resumo`/`#palavras`/download, sem-divulgação sem link); 15 its de contrato; **ao vivo bloqueada na fonte (61ms, sem challenge) — carry-over re-teste** |
| SRC-03 | 03-02, 03-06 | SourceClient compartilhado (jar/mutex/batch≤10+2s/breaker/timeout/UA) | ✓ SATISFIED | `sourceClient.ts` completo; exercitado com fetch mockado (SSRF/UA/challenge/breaker/abort ALL PASS, SUMMARY 03-02) + uso real ao vivo (BDTD 226ms) |
| SRC-04 | 03-02, 03-03, 03-06 | Pós-filtro redundante + registry bdtd+capes/oasisbr-off | ✓ SATISFIED | `postFilter` idempotente + `searchBdtd`/`searchCapes` honram o que a API permite; `oasisbr enabled:false` → 400 (it + curl) |
| SRC-05 | 03-03, 03-06 | Testes de contrato no CI + cobertura por fonte | ✓ SATISFIED | `lab-sources-contract.test.ts` 15 its (só-BDTD/só-CAPES/ambas em nível de adapter, nunca pula) + `metrics.coverage` por run |
| CORE-03 | 03-01, 03-04, 03-05, 03-06 | `Idempotency-Key` sem duplicatas na janela | ✓ SATISFIED | `keyHash=sha256(userId\|key)` + `bodyHash` separados, 24h, replay 200+`Idempotent-Replayed`, conflito 422; it CORE-03 (replay mesmo runId, 422 em corpo diferente) |
| CORE-04 | 03-01, 03-04, 03-05, 03-06 | Jobs observáveis + timeout + retry + cancel; logs sem credenciais | ✓ SATISFIED | 6 estados, Job=Run 1:1, timeout 60s, 1 retry pós-challenge, cancel cooperativo; `recordSourceEvent` por tentativa; logs só `{source,status,durationMs}`; it CORE-04 |

Nenhum requirement órfão: os 12 IDs que o ROADMAP mapeia para a Phase 3 são exatamente os 12 cobertos pelos 6 plans (03-06 cobre todos).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | `as any` / `: any` / `@ts-ignore` / `eval` / `Math.random` / `rejectUnauthorized` / `console.log` / `TODO` / `FIXME` / `PLACEHOLDER` | — | **Nenhum achado.** Grep nos 8 arquivos da fase retorna zero ocorrências reais (2 falsos positivos: palavras PT-BR em comentários contendo substrings do padrão). `typecheck` strict verde confirma. |
| `bdtd.ts` / `capes.ts` / `searches.ts` / `searchRuns.ts` | várias | `return null` / `return []` | ℹ️ Info | Padrão legítimo documentado: campo opcional ausente→`null` (T-03-03-01), fora-do-escopo→`null`→404 idêntico, acumuladores `string[]`. Nenhum alimenta saída de usuário sem fonte real (Level 4 ✓ FLOWING). |

Auditoria adversarial da fase (SUMMARY 03-06, roteiro §4 do security-baseline): **0 crítico / 0 alto**; controles verificados (ownerId da sessão, 404 sem revelar existência, envelope PT-BR, sem segredos em logs/respostas, SSRF confinado à allowlist, SQL 100% parametrizado via Drizzle).

### Human Verification Required

Nenhuma pendência bloqueante — o checkpoint humano desta fase **já ocorreu** (03-06 task 3, veredito `approved with capes blocked`, 2026-09-11 ~04:03Z, com reprodução independente do `curl-lab.sh ALL PASS` + busca viva `"ensino de química"` inspecionada). Carry-over não-bloqueante registrado abaixo.

### Gaps Summary

**Nenhum gap bloqueante.** Os 4 critérios do ROADMAP estão atendidos no código, nos testes (9/9 integração lab + 15 its de contrato + 42/42 suíte + curl `ALL PASS` + gates verdes + auditoria 0 crit/0 high) e, para BDTD/partial/proveniência/health, também ao vivo. O único item não provado ao vivo — 1 busca CAPES retornando resultados — decorre de bloqueio no lado da fonte (61ms, sem challenge, `offline 0/2`), com corretude coberta pelo contrato com fixtures e comportamento de degradação executado exatamente como especificado (D-37). O humano aceitou formalmente esse estado; o re-teste ao vivo da CAPES segue como carry-over para o próximo ciclo (STATE.md), sem exigir código novo nesta fase. Phase 4 (corpus/exportação) tem base provada para construir.

---

_Verified: 2026-09-11T05:00:00Z_
_Verifier: OpenCode (gsd-verifier)_
