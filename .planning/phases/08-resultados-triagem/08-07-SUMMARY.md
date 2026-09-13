---
phase: 08-resultados-triagem
plan: "07"
subsystem: api
tags: [drizzle, postgres, fastify, vitest, lab, search-runs, fetch-more, incremental, expo]
requires:
  - phase: 08-resultados-triagem plan 01
    provides: owner-scoped routes, D-37 partial, D-15 previous-only isNew
  - phase: 08-resultados-triagem plan 06
    provides: page loop, per-page insert, cancel-checked fetch, pagesFetched/pagesTotal (SUPERSEDED below)
provides:
  - run inicial em 1 lote (BDTD 1x100 + CAPES 2x50) com totalKnown por fonte
  - POST /api/v1/lab/runs/:runId/fetch-more (+ lab.run.fetchMore) com newCount recomputado por lote
  - UI BUSCAR MAIS com loading/retry + "X de Y" totalKnown; polling de volta a 240
  - prova incremental 250 em 100+100+50 + IDOR no fetch-more
affects: [09-corpus-comparacao, lab-ui]
tech-stack:
  added: []
  patterns: [shared fetchBatch for initial + fetch-more, server-side offset from stored count, newCount recompute per batch, superset replace keeps scroll]
key-files:
  created:
    - tests/integration/lab-run-fetch-more.test.ts
    - apps/lab/src/results/fetchMore.ts
    - apps/lab/src/results/__tests__/fetchMore.test.ts
  modified:
    - apps/core-api/src/lib/searchRuns.ts
    - apps/core-api/src/routes/lab.ts
    - apps/core-api/src/capabilities.ts
    - packages/contracts/src/lab.ts
    - packages/contracts/src/capabilities.ts
    - packages/integrations/src/bdtd.ts
    - tests/integration/lab-search-runs-full.test.ts
    - apps/lab/src/api/lab.ts
    - apps/lab/app/project/[id]/results.tsx
    - apps/lab/app/project/[id]/run.tsx
    - apps/lab/src/search/useRunPolling.ts
    - apps/lab/src/results/useResultsList.ts
    - apps/lab/src/search/__tests__/runPolling.test.ts
key-decisions:
  - "Offset sempre server-side (stored count/pagesFetched), nunca input do cliente (T-08-07-02)"
  - "Parcial honesto no lote: fonte caída → 200 com added parcial + hasMore preservado, nunca 500"
  - "newCount recomputado por lote via anti-join só-anteriores (D-15) — badge≡contador"
  - "BDTD PER_PAGE_MAX 50→100 (limit=100 medido em 1 chamada); CAPES segue 2×50"
  - "UI recarrega por superset com mesmo prefixo (scroll não pula ao topo)"
requirements-completed: [UI-14, UI-17]
duration: ~11min
completed: 2026-09-13
---

# Phase 8 Plan 07: Lote incremental + BUSCAR MAIS Summary

**Run inicial em 1 lote (100/fonte + totalKnown) com BUSCAR MAIS sob demanda (+100/fonte, newCount recomputado por lote) e UI com botão/loading/retry + X de Y — decisão Paulo 12/09 REVISADA, 08-06 eager SUPERSEDED**

> Decisão produto Paulo 12/09 REVISADA — SUBSTITUI 08-06 (eager sem teto): lote incremental com BUSCAR MAIS, 100/fonte por vez, totalKnown da pág. 1, custo sob demanda. 100% alcançável sem run de 13 min; custo distribuído por puxada.

## Performance

- **Duration:** ~11 min
- **Started:** 2026-09-13T00:17:25Z
- **Completed:** 2026-09-13T00:28:08Z
- **Tasks:** 3
- **Files modified:** 16 (3 criados, 13 modificados)

## Accomplishments

- Engine em lote: `fetchBatch` reusável (run inicial E fetch-more, sem duplicar regra); BDTD pág.1 limit=100, CAPES págs.1-2 ×50; `RUN_QUEUE_TIMEOUT_MS` de volta a 60s; rank contínuo `storedBefore + i`; insert por página; cancel checado por página; trava anti-loop mantida
- `POST /api/v1/lab/runs/:runId/fetch-more` (+ `lab.run.fetchMore` no registry contracts): Zod `{sources?}`, 404 idêntico fora do escopo, offset = count armazenado (nunca cliente), +100 novos/fonte ou esgotada, `newCount` RECOMPUTADO por lote (D-15), resposta `{added, hasMore, newCount, returned, total}`; parcial honesto, sem auto-retry, double-tap seguro
- Prova PG real: 250 em 100+100+50 com hasMore + isNew/newCount por lote + 4º fetch idempotente + IDOR (estranho/fantasma 404, sem-auth 401); lote inicial BDTD 100 + CAPES 2×50 com totalKnown; cancel de batch preserva página em voo
- UI: botão "BUSCAR MAIS — mais 100 de ~Y" (Y = totalKnown das fontes com hasMore), loading desabilita ("buscando mais 100…"), erro com retry local, sucesso anexa sem pular ao topo; "mostrando X de Y" com Y totalKnown; polling 240 de volta; progresso de páginas mantido para o loading do lote; lab 99/99

## Task Commits

Each task was committed atomically:

1. **task 1: reverter eager + batch inicial + endpoint fetch-more** - `294d305` (feat)
2. **task 2: testes incrementais (250→100+100+50) + IDOR** - `a9e792f` (test)
3. **task 3: UI BUSCAR MAIS + polling de volta + X de Y** - `f8093e7` (feat)

**Plan metadata:** (este SUMMARY + STATE/ROADMAP, commit final abaixo)

## Files Created/Modified

- `apps/core-api/src/lib/searchRuns.ts` - `fetchBatch` compartilhado, lote inicial 1×(100|2×50), `fetchMoreForActor` (+100/fonte, newCount por lote), timeout 60s, `recomputeNewCount` só-anteriores
- `apps/core-api/src/routes/lab.ts` - `POST /runs/:runId/fetch-more` (molde owner-scoped + Zod + 404 idêntico)
- `apps/core-api/src/capabilities.ts` - handler `lab.run.fetchMore` no registry (definição única em contracts)
- `packages/contracts/src/lab.ts` - `fetchMoreRunsSchema`/`FetchMoreInput`/`FetchMoreResult` + doc totalKnown (§10/§18)
- `packages/contracts/src/capabilities.ts` - `lab.run.fetchMore` no registry v1
- `packages/integrations/src/bdtd.ts` - `PER_PAGE_MAX` 50→100 (Rule 3; lote BDTD 1 chamada)
- `tests/integration/lab-search-runs-full.test.ts` - eager 120 SUBSTITUÍDO por lote inicial (200 = 100+100, totalKnown 250/120, cancel de batch)
- `tests/integration/lab-run-fetch-more.test.ts` - incremental 250 (100+100+50, hasMore, isNew/newCount por lote, idempotente) + IDOR/401
- `apps/lab/src/api/lab.ts` - `fetchMore(runId, {sources?})` tipado via `FetchMoreResult`
- `apps/lab/src/results/fetchMore.ts` - helpers puros (hasMore/totalKnown/remaining/label/guarda double-tap)
- `apps/lab/src/results/__tests__/fetchMore.test.ts` - 8 testes puros (botão, contadores, label, guarda)
- `apps/lab/src/results/useResultsList.ts` - `runInfo` (getRun fresco) + `fetchMore()` com reload por superset + loading/erro
- `apps/lab/app/project/[id]/results.tsx` - botão BUSCAR MAIS + loading/retry + X de Y totalKnown
- `apps/lab/app/project/[id]/run.tsx` - comentário polling 240 (lotes curtos)
- `apps/lab/src/search/useRunPolling.ts` - teto 720→240 (runs curtos de novo)
- `apps/lab/src/search/__tests__/runPolling.test.ts` - teto 240 (10min cobre lotes de 60s)

## Decisions Made

- Offset = count armazenado + `pagesFetched` (ambos server-side): `pagesFetched` ancora a próxima página (sobrevive a drops do pós-filtro, onde count < raw); fallback count quando sem métricas. T-08-07-02 honrado (nada vem do cliente) — documentado como ajuste Rule 2.
- Parcial honesto no lote (decidido e documentado no plano): fonte caída mid-lote → 200 com added parcial + hasMore preservado, nunca 500; run NÃO muda de status (já terminal); sem `recordSourceEvent` no lote (saúde registrada no run inicial).
- `newCount` inicial e por lote usam o MESMO `recomputeNewCount` só-anteriores (`executedAt <` corrente, empate = posterior — mesma semântica do on-read): no run inicial equivale ao `ne` antigo (futuros não existem); no fetch-more exclui reruns futuros.
- `packages/core/src/searchRuns.ts` (lista do plano) NÃO criado: o pacote core não tem acesso a DB por desenho (D-55 fail-closed); a lógica vive no lib da core-api via capability — registrado aqui como desvio de lista, sem mudança de comportamento.
- UI recarrega grupos + todas as páginas e substitui por superset com o mesmo prefixo (scroll preservado); contadores canônicos da resposta + run refeito.
- Modo IA futuro: só anotado aqui como deferred (decisão do plano) — ver Next Phase Readiness.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] BDTD `PER_PAGE_MAX` 50→100**
- **Found during:** task 1 (o plano exige BDTD pág.1 `limit=100` em 1 chamada, mas o adapter clamparia para 50)
- **Issue:** `clampPerPage` do BDTD truncava 100→50 — o lote BDTD viraria 2×50 em vez de 1×100, violando o desenho medido (100/50 no threat model)
- **Fix:** teto 100 no BDTD (CAPES intocado em 50); comentário 08-07 no local
- **Files modified:** `packages/integrations/src/bdtd.ts`
- **Verification:** lote inicial BDTD `returned===100` com `pagesFetched===1` no teste PG real
- **Committed in:** `294d305` (part of task commit)

**2. [Rule 2 - Missing Critical] `packages/core/src/searchRuns.ts` não existe — lógica no lib da core-api**
- **Found during:** task 1 (arquivo listado no plano não existe no repo; core não importa db por D-55)
- **Issue:** criar o arquivo no core quebraria a fronteira (persistência no pacote de domínio) ou duplicaria regra
- **Fix:** `fetchBatch`/`fetchMoreForActor` em `apps/core-api/src/lib/searchRuns.ts` via capability `lab.run.fetchMore` (definição única em contracts); sem arquivo novo no core
- **Files modified:** (nenhum novo no core — lista do plano ajustada aqui)
- **Verification:** `tsc` raiz verde; `Record<CapabilityName>` exige o handler (fail-closed por construção)
- **Committed in:** `294d305` (part of task commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Ambos necessários para o desenho medido (100/50) e para a arquitetura (D-55). Sem scope creep — nenhum comportamento além do plano.

## Issues Encountered

- Edição intermediária removeu acidentalmente o cabeçalho de `ExecuteSearchRunResult` e a vírgula de uma rota — detectados na leitura seguinte/`tsc` e corrigidos antes de qualquer commit; sem impacto.
- `exactOptionalPropertyTypes` exigiu construção condicional de `PerSourceMetrics` no fetch-more (sem `pagesFetched: undefined` explícito) + anotação explícita de `page` no reload da UI (TS7022) — correções de tipagem, sem mudança de comportamento.

## Verification Evidence

- `tsc --noEmit` raiz + `@uhhu/lab`: verdes; eslint nos arquivos do plano: exit 0; zero `any` (grep 0 nos 16 arquivos)
- Gates do plano task 1: `RUN_QUEUE_TIMEOUT_MS = 60` 1; `fetch-more|fetchMore` 13 (4 rotas + 5 capabilities + 4 contracts); `newCount` 17 em searchRuns.ts (inicial + recomputo)
- Gates task 2: `hasMore` 19 no fetch-more teste; `tsc` exit 0
- Gates task 3: `BUSCAR MAIS` 3 em results.tsx + 4 em fetchMore.ts; `RUN_POLL_MAX_POLLS = 240` 1; lab typecheck+lint+test exit 0
- vitest PG real (`.env.dev.cs`): **fetch-more 2/2** (250 em 100+100+50 + idempotente + IDOR/401), **full 2/2** (lote 100+100 + totalKnown + cancel batch), **runs 9/9 + isnew 2/2** sem regressão
- vitest `@uhhu/lab`: **99/99** (91 prévios + 8 fetchMore; runPolling atualizado p/ 240)
- `pnpm audit`/Gitleaks/SAST sem binário local (como nos planos 08-01–08-06 — CI cobre); nenhuma dependência nova
- Auditoria adversarial do diff (IDOR/input/segredos/XSS/SSRF/isolamento/DoS/rate-limit): 0 crit/0 high — fetch-more owner-scoped (JOIN owner, 404 idêntico), Zod dupla (rota + capability), offset server-side, sem SQL cru, sem segredo/log novo, sem endpoint além do planejado, XSS só-contagens, SSRF inalterado (mesmo host allowlist, só `limit` 100)

## Known Stubs

Nenhum — scan por TODO/FIXME/placeholder/"coming soon"/"not available" nos 16 arquivos retornou vazio. Sem dados mockados: testes usam stubs de fetch server-side com shapes VuFind/CAPES reais.

## Threat Flags

Nenhuma superfície nova além do `<threat_model>` do plano: 1 endpoint de leitura-escrita por lote atrás de `requireAuth` + JOIN owner + Zod; offset/counts derivados server-side. Mitigações 1:1 — T-08-07-01 (60s/lote + 10 runs/h intactos + double-tap guard + lotes curtos), T-08-07-02 (offset = stored/pagesFetched, nunca cliente), T-08-07-03 (404 idêntico + só contagens do próprio run).

## 08-06 SUPERSEDED

O plano 08-06 (eager sem teto: loop-até-total, timeout 30min, 720 polls, teste 120/120) está **substituído** por este plano (decisão Paulo 12/09 REVISADA). Reversão controlada aplicada (forward rework, história preservada nos commits):

| 08-06 | 08-07 |
|---|---|
| loop-até-total (`perPage: 50`) | loop-de-1-lote (BDTD 1×100, CAPES 2×50, `fetchBatch` compartilhado) |
| `RUN_QUEUE_TIMEOUT_MS` 30min | 60s de volta |
| `RUN_POLL_MAX_POLLS` 720 | 240 de volta |
| teste eager 120/120 | SUBSTITUÍDO pelo incremental 250 (comportamento mudou) |
| — | `POST /runs/:runId/fetch-more` + BUSCAR MAIS (novo) |

Mantidos do 08-06: rank contínuo, `pagesFetched/pagesTotal`, checagem de cancel por página, insert por página, trava anti-loop, `parseOne` aditivo, `pageProgress.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UI-14/UI-17: 100% alcançável por puxadas, sem run de 13 min (decisão revisada 12/09). REQUIREMENTS.md UI-14 mantém Done com adendo do lote (ver atualização abaixo).
- Fase 9 (corpus/comparação) desbloqueada: corpus maior por puxadas exercita paginação de results e contadores.
- Deferred (decisão do plano): modo IA futuro — só anotado, pensar depois.
- Risco residual (baixo, fora de escopo): fetch-more em run `running` concorrente pode intercalar ranks (sem violação — `onConflictDoNothing` segura dupes; janela de ~60s); fetch-more em run `cancelled` anexa ao run cancelado sem mudar status (comando explícito do dono). Reavaliar se a UAT exibir comportamento estranho.
- UAT humana tablet: BUSCAR MAIS (botão/loading/retry/scroll), X de Y totalKnown e cancel de lote entram na fila da fase 8.

---

*Phase: 08-resultados-triagem*
*Completed: 2026-09-13*

## Self-Check: PASSED

- Arquivos: `apps/core-api/src/lib/searchRuns.ts`, `apps/core-api/src/routes/lab.ts`, `apps/core-api/src/capabilities.ts`, `packages/contracts/src/lab.ts`, `packages/contracts/src/capabilities.ts`, `packages/integrations/src/bdtd.ts`, `tests/integration/lab-search-runs-full.test.ts`, `tests/integration/lab-run-fetch-more.test.ts`, `apps/lab/src/api/lab.ts`, `apps/lab/src/results/fetchMore.ts`, `apps/lab/src/results/__tests__/fetchMore.test.ts`, `apps/lab/src/results/useResultsList.ts`, `apps/lab/app/project/[id]/results.tsx`, `apps/lab/app/project/[id]/run.tsx`, `apps/lab/src/search/useRunPolling.ts`, `apps/lab/src/search/__tests__/runPolling.test.ts` — todos FOUND
- Commits: `294d305` FOUND, `a9e792f` FOUND, `f8093e7` FOUND (`git log --oneline` confirma os três sobre `9fb2048`)
