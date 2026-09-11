---
phase: 03-buscas-e-adapters
plan: "04"
subsystem: lab
tags: [search-runs, idempotency, rate-limit, partial, post-filter, adapters, drizzle, postgres, owner-first]

# Dependency graph
requires:
  - phase: 03-buscas-e-adapters plan 01
    provides: [contratos lab (SearchFilters, RunMetrics, cursor results), erros PT-BR SOURCE_*, tabelas lab_searches/runs/results/idempotency_keys + migration 0002 viva]
  - phase: 03-buscas-e-adapters plan 02
    provides: [SourceClient (jar/mutex/timeout/allowlist/challenge), registry (getAdapter, SourceDisabledError, oasisbr off), health recordSourceEvent]
  - phase: 03-buscas-e-adapters plan 03
    provides: [getSourceAdapter bdtd/capes + ADAPTER_VERSIONs, postFilter redundante, search nunca lança por transporte]
provides:
  - Lib `searches.ts` owner-first via cadeia →Project (CRUD + runs/results paginados)
  - Motor `searchRuns.ts` (execute sync/async-ready, retry 1× pós-challenge, partial D-37, diff anti-join D-35, idempotência sha256 24h, rate-limit 10/h no banco, cancel cooperativo)
  - Barrel `@uhhu/integrations` final (types+sourceClient+registry+health+adapters+postFilter)
affects: [03-05 rotas lab/jobs/sources/health + throttle + boot, 03-06 prova PG + curl + IDOR]

# Tech tracking
tech-stack:
  added: []
  patterns: [executor de runs 1:1 com job sobre a mesma linha (sem worker no v1), UPDATE final condicional para cancel concorrente vencer, idempotência chave/corpo em hashes independentes, um evento de health por fonte por run]

key-files:
  created: [apps/core-api/src/lib/searchRuns.ts]
  modified: [apps/core-api/src/lib/searches.ts, apps/core-api/package.json, packages/integrations/src/index.ts, packages/integrations/src/adapters.ts]

key-decisions:
  - "Ordem de commit invertida (task 3 antes da task 2): executor importa do barrel, barrel precisava existir para o gate typecheck da task 2"
  - "keyHash = sha256(userId|key) + bodyHash = sha256(canonicalBody) separados: incluir o corpo na chave tornaria o ramo 422 inalcançável"
  - "Um evento de health por fonte por run (ok=desfecho, isChallenge=visto): challenge recuperado ainda conta como challenge na janela"
  - "UPDATE final condicional (status IN queued,running) + update complementar só de métricas: cancel concorrente nunca ressuscita"
  - "oasisbr checado na linha crua do banco: o DTO filtra para executáveis e esconderia dado legado"

patterns-established:
  - "Executor nunca lança por fonte (try/catch por tentativa → failed, D-37); só SourceDisabledError/RunRateLimitedError/IdempotencyConflictError lançam (a rota traduz para 400/429/422)"
  - "MAX_SYNC_MS=25000 exportado como documentação executável: controle sync/async vive na rota via Promise.race, o lib sempre corre até o fim"

requirements-completed: [LAB-02, LAB-03, LAB-04, LAB-05, CORE-03, CORE-04]

# Metrics
duration: ~25min
completed: 2026-09-11
---

# Phase 3 Plan 4: Lib de buscas + motor de runs Summary

**CRUD de searches isolado por owner via cadeia →Project + motor de execução com snapshot temporal, partial por fonte, diff de novos por anti-join, idempotência sha256 24h, rate-limit 10/h no banco e cancel cooperativo, sobre o barrel final de integrations**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-11T03:10Z (estimativa — task 1 herdada de agente anterior)
- **Completed:** 2026-09-11T03:35Z
- **Tasks:** 3 (task 1 herdada e verificada, tasks 2–3 executadas aqui)
- **Files modified:** 5 (2 criados nesta continuação: searchRuns.ts + SUMMARY; searches.ts + package.json herdados; index.ts + adapters.ts na task 3)

## Accomplishments

- `apps/core-api/src/lib/searches.ts` (herdado, verificado): 9 funções `*ForActor` com JOIN owner em TODA query, cursor `createdAt|id` (searches/runs) e `source|rank|id` (results, D-36), `any`/`Math.random` zero, typecheck verde — aceito sem retrabalho
- `apps/core-api/src/lib/searchRuns.ts` (564 linhas, criado): `executeSearchRun` (escopo → oasisbr 400 → rate-limit → idempotência → queued/running → bdtd→capes sequencial com timeout global 60s → retry 1× pós-challenge → postFilter → persistência com rank por fonte → partial/failed D-37 → newCount anti-join + coverage → UPDATE condicional) e `cancelRunForActor` (só queued|running → cancelled, parciais preservados)
- `packages/integrations/src/index.ts` (barrel final): `types+sourceClient+registry+health+adapters+postFilter`, zero colisões, typechecks do pacote e do root verdes
- Gates: `pnpm typecheck` root verde (core, db, integrations, core-api), eslint limpo, prettier limpo, grep `Math.random|as any|: any|eval|console.log|process.env` zero em searchRuns.ts

## task Commits

Each task was committed atomically:

1. **task 1: dep workspace + lib searches owner-first + results paginados** - `86c5dbc` (feat, herdado de agente anterior — verificado, não refeito)
2. **task 2: motor de execução de runs** - `926db6f` (feat)
3. **task 3: barrel final de integrations** - `da5d401` (feat, commitado ANTES da task 2 por dependência de gate — ver desvios)

## Files Created/Modified

- `apps/core-api/src/lib/searchRuns.ts` - Motor de runs: constantes D-28/D-29, 3 classes de erro de contrato, canonicalBody estável, execute + cancel (criado)
- `apps/core-api/src/lib/searches.ts` - Domínio de leitura/escrita owner-first (herdado, verificado)
- `apps/core-api/package.json` - `@uhhu/integrations: workspace:*` (herdado, verificado)
- `packages/integrations/src/index.ts` - Barrel final com adapters.js + postFilter.js (modificado)
- `packages/integrations/src/adapters.ts` - Comentário stale (proibição de reexport) atualizado (modificado, 3 linhas)

## Decisions Made

- **Commit da task 3 antes da task 2:** `searchRuns.ts` importa `getSourceAdapter`/`postFilter` do barrel `@uhhu/integrations`; commitar o executor antes do barrel deixaria o commit da task 2 vermelho em checkout isolado. Inversão é só ordenação — conteúdo e gates por task preservados.
- **Chave e corpo de idempotência em hashes independentes:** o plano escreve `keyHash=sha256(userId|key|canonicalBody)`, mas incluir o corpo na chave torna o ramo 422 inalcançável (corpo diferente → hash diferente → miss, nunca conflito). Implementado `keyHash=sha256(userId|key)` + `bodyHash=sha256(canonicalBody)`; o 422 volta a funcionar. Documentado no código.
- **Um evento de health por fonte por run** com `isChallenge=challengeVisto`: challenge recuperado pelo retry ainda sinaliza instabilidade na janela (conta como failed no `computeSourceHealth`, por desenho da 03-02). Alternativas (2 eventos, ou esconder o challenge) distorciam mais a taxa.
- **Finalização em 2 UPDATEs:** condicional (status+finished+metrics+error, só de queued|running) para o cancel concorrente vencer, seguido de complementar só-métricas sem tocar status — métricas úteis aterrissam mesmo quando o cancel vence a corrida.
- **`oasisbr` verificado na linha crua:** `parseSearchSources` filtra para executáveis, então o DTO nunca mostraria `oasisbr` legado; a checagem D-33 lê `lab_searches.sources` cru (com JOIN owner) antes de executar.
- **Single-source generaliza D-37:** `okCount === executedCount` → succeeded (1/1 ok = succeeded; 1/2 = partial; 0 = failed). Sem `skipped` fantasma no status final.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking/sequencing] Task 3 commitada antes da task 2**
- **Found during:** task 2 (executor importa `getSourceAdapter`/`postFilter` do barrel)
- **Issue:** o plano ordena task 2 → task 3, mas o gate typecheck da task 2 exige o barrel da task 3 já exportando adapters; commitar nesta ordem deixaria `926db6f` quebrado em checkout isolado
- **Fix:** executada e commitada a task 3 primeiro (`da5d401`), depois a task 2 (`926db6f`); ambas verificadas individualmente
- **Files modified:** packages/integrations/src/index.ts, packages/integrations/src/adapters.ts
- **Verification:** typecheck do pacote + root verdes em ambos os commits
- **Committed in:** da5d401 (task 3)

**2. [Rule 1 - Bug] Fórmula da chave de idempotência tornaria o 422 inalcançável**
- **Found during:** task 2 (desenho do lookup)
- **Issue:** `keyHash=sha256(userId|key|canonicalBody)` (plano + T-03-04-02) — corpo diferente gera chave diferente, então o SELECT nunca acerta para comparar `bodyHash`; o ramo `IdempotencyConflictError` seria código morto
- **Fix:** `keyHash=sha256(userId|key)`, `bodyHash=sha256(canonicalBody)` em coluna separada; conflito detectado por mesma chave + bodyHash diferente; rationale em comentário no código
- **Files modified:** apps/core-api/src/lib/searchRuns.ts
- **Verification:** typecheck verde; lógica revisada (hit+mesmo body → replay; hit+body diferente → 422; miss/expirado → executa e vincula)
- **Committed in:** 926db6f (task 2)

**3. [Rule 2 - Missing Critical] Try/catch por tentativa de fonte**
- **Found during:** task 2 (RangeTooWideError da CAPES lança antes da rede, fora do contrato "search nunca lança")
- **Issue:** `RangeTooWideError` (range amplo) ou qualquer throw inesperado do adapter derrubaria o run inteiro e a outra fonte, violando D-37
- **Fix:** cada tentativa envolta em try/catch → `failed` com detalhe por fonte; run segue para a próxima fonte
- **Files modified:** apps/core-api/src/lib/searchRuns.ts
- **Verification:** typecheck verde
- **Committed in:** 926db6f (task 2)

**4. [Rule 2 - Missing Critical] Comentário stale em adapters.ts proibia o reexport**
- **Found during:** task 3 (barrel passa a exportar adapters por ordem do plano)
- **Issue:** cabeçalho de `adapters.ts` dizia "NÃO reexportar pelo src/index.ts", contradizendo a task 3 e confundindo 03-05
- **Fix:** comentário atualizado (3 linhas) — barrel é a via oficial, módulo direto segue importável
- **Files modified:** packages/integrations/src/adapters.ts
- **Verification:** typecheck verde
- **Committed in:** da5d401 (task 3)

---

**Total deviations:** 4 auto-fixed (1 blocking/sequencing, 1 bug, 2 missing-critical)
**Impact on plan:** Todos necessários para corretude/gates verdes. Sem scope creep; nenhum arquivo de 03-05 tocado.

## Issues Encountered

- Prettier acusou formatação em `searchRuns.ts` após escrita (quebras condicionais do `ctx` e da paginação): resolvido com `prettier --write` + re-typecheck + re-lint, tudo verde antes do commit.
- Comentário com literal `` `Math.random` `` (dizendo que NÃO usa) poderia falhar num grep ingênuo `Math.random zero` da verificação do plano: frase reescrita sem o literal; grep confirma zero ocorrências.

## Auditoria adversarial (resumo — AGENTS.md)

Arquivo a arquivo antes dos commits: IDOR mitigado (escopo owner em execute/cancel/replay/raw-oasisbr; keyHash inclui userId — replay cross-user impossível); sem confiança no navegador (UUID→null, key vazia ignorada, snapshot do banco nunca do cliente); sem segredos (mensagens de erro estáticas PT-BR sem hosts/cookies/corpos; rawMetadata já higienizado no adapter; zero logging no lib); SSRF confinado aos adapters (allowlist no SourceClient); `fetchFn` injetável só server-side — **handoff para 03-05: a rota NUNCA deve aceitar fetchFn do cliente**; rate-limit duplo (10/h no banco + 200/min global herdado); SQL 100% parametrizado via Drizzle; isolamento entre usuários revisado nos 4 pontos de query. **Nenhum achado a corrigir.**

## Known Stubs

None — nenhum `TODO`/`FIXME`/`placeholder` nos arquivos criados (falso positivo `TODOS`→`TODO` em comentário PT-BR descartado); `sync: true` e `maxSyncMs` documentado são desenho D-28 (controle na rota 03-05), não stub.

## Threat Flags

None — nenhuma superfície nova além do `<threat_model>` do plano (T-03-04-01…05 todas mitigadas no lib; `fetchFn` é parâmetro interno server-side, não fronteira).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 03-05 (rotas) desbloqueado: `executeSearchRun`/`cancelRunForActor` + erros tipados (`SourceDisabledError`→400, `RunRateLimitedError`→429, `IdempotencyConflictError`→422, null→404) + `MAX_SYNC_MS`/`IDEMPOTENT_REPLAYED_HEADER` exportados para a rota; `listResultsForActor` retorna `total` para o header; handoff: rota usa `Promise.race(…, 25000)` → 202 + polling, nunca passa `fetchFn` do cliente.
- 03-06 (prova) precisará de PG DEV vivo + `fetchFn` mockado ou rede real para exercitar partial/diff/idempotência/rate-limit contra o banco.
- Nenhum blocker.

---
*Phase: 03-buscas-e-adapters*
*Completed: 2026-09-11*

## Self-Check: PASSED
- SUMMARY exists; commits 86c5dbc + da5d401 + 926db6f exist; searchRuns.ts contém executeSearchRun/cancelRunForActor/25000/60000/Idempotent-Replayed/newCount/coverage; barrel contém adapters.js + postFilter.js; typecheck root verde.
