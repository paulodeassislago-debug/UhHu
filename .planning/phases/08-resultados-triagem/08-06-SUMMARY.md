---
phase: 08-resultados-triagem
plan: "06"
subsystem: api
tags: [drizzle, postgres, fastify, vitest, lab, search-runs, pagination, expo]
requires:
  - phase: 08-resultados-triagem plan 01
    provides: searchRuns.ts engine patterns, D-37 partial, D-38 challenge retry
  - phase: 07-projetos-buscas-execucao plan 03
    provides: run screen with useRunPolling (2500ms, teto 240)
provides:
  - run retorna busca COMPLETA (loop 50/página até total, rank global, timeout 30min, progresso pagesFetched/pagesTotal)
  - prova 120/120 + rerun newCount 0 + cancel mid-loop determinístico
  - UI acompanha 30min (720 polls) com "página X de ~Y" e Cancelar sempre vivo
affects: [09-corpus-comparacao, lab-ui]
tech-stack:
  added: []
  patterns: [page loop with empty/repeat stops, fetch-first inside cancel-checked loop, additive metrics pass-through in defensive DTO parser]
key-files:
  created:
    - tests/integration/lab-search-runs-full.test.ts
    - apps/lab/src/search/pageProgress.ts
  modified:
    - apps/core-api/src/lib/searchRuns.ts
    - apps/core-api/src/lib/searches.ts
    - packages/contracts/src/lab.ts
    - apps/lab/src/search/useRunPolling.ts
    - apps/lab/app/project/[id]/run.tsx
    - apps/lab/src/search/__tests__/runPolling.test.ts
key-decisions:
  - "Loop controlado por coletados brutos (raw), métricas por kept: filtro nunca causa loop extra"
  - "Total null = 1 página (nunca laço só por total, T-08-06-02)"
  - "Cancel sem recordSourceEvent: ação do operador, não sinal da fonte"
  - "parseOne aditivo estrito: ausente ok (legado), malformado → fallback fail-closed"
  - "sourceProgressLine puro em pageProgress.ts: vitest node não importa react-native"
requirements-completed: [UI-14]
duration: ~9min
completed: 2026-09-13
---

# Phase 8 Plan 06: Busca completa por run Summary

**Run pagina a busca inteira (50/página até o total, rank global contínuo, timeout 30min, progresso por página) com prova PG real de 120/120 + rerun zerado + cancel determinístico, e UI que acompanha 30min sem falso timeout**

> Decisão produto Paulo 12/09: runs retornam a busca COMPLETA, 100%, sem teto — rate limit é proteção, não truncamento. UI-14 (já Done na 07-03) ganha o comportamento completo aqui.

## Performance

- **Duration:** ~9 min
- **Started:** 2026-09-13T00:04:54Z
- **Completed:** 2026-09-13T00:13:26Z
- **Tasks:** 3
- **Files modified:** 8 (2 criados, 6 modificados)

## Accomplishments

- Engine pagina tudo: `RUN_FETCH_PER_PAGE=50`, loop até `coletados >= total` OU página vazia OU fonte repetindo itens OU abort/cancel; rank `(page-1)*50+i`; insert por página com o mesmo `onConflictDoNothing`
- `RUN_QUEUE_TIMEOUT_MS = 30*60_000` com comentário do trade-off (worker/DB segurados, Paulo aceitou; sync 25s inalterado); challenge retry só página 1; cancel/abort checados ANTES de cada fetch
- `PerSourceMetrics += pagesFetched/pagesTotal` (aditivo §19, sem migration) preenchidos por página; `total`/`returned` somam TODAS as páginas
- Prova PG real: fonte BDTD fake total 120 (50+50+20) → 120 armazenados, rank 0..119 único, `returned===120`, `pagesFetched===3`, rerun `newCount===0`
- Cancel determinístico mid-loop (stub 400ms/página + cancel após observar `running`): `cancelled` com página 1 (50) preservada
- UI: `RUN_POLL_MAX_POLLS` 240→720 (30min ÷ 2.5s); "buscando página X de ~Y" com métricas, "buscando…" sem elas; Cancelar visível enquanto o run vive; D-08 preservado
- Sem regressão: lab-search-runs 9/9 + isnew 2/2 (fixture com total 7120 prova a trava anti-loop) + lab 91/91

## Task Commits

Each task was committed atomically:

1. **task 1: loop de páginas no engine + timeout 30min + progresso** - `caf30b6` (feat)
2. **task 2: teste multi-página (120/120) + rerun + timeout** - `09f8a90` (test)
3. **task 3: UI acompanha runs longos (polling + progresso + cancela)** - `639bafb` (feat)

**Plan metadata:** (este SUMMARY + STATE/ROADMAP, commit final abaixo)

## Files Created/Modified

- `apps/core-api/src/lib/searchRuns.ts` - loop de páginas até o total (50/pág, rank global, paradas vazia/repetida/abort/cancel), timeout 30min, progresso por página, falha mid-loop → failed com coletado preservado
- `apps/core-api/src/lib/searches.ts` - `parseOne` repassa `pagesFetched/pagesTotal` ao DTO (Rule 2; sem isto o progresso era stripado)
- `packages/contracts/src/lab.ts` - `PerSourceMetrics` += `pagesFetched?`/`pagesTotal?` (aditivo §19)
- `tests/integration/lab-search-runs-full.test.ts` - 120/120 + rank + rerun + cancel mid-loop (2 testes PG real, offline-skip, `const api/database`)
- `apps/lab/src/search/useRunPolling.ts` - teto 720 + helper puro `formatPageProgress`
- `apps/lab/src/search/pageProgress.ts` - `sourceProgressLine` puro (extra estrutural, ver desvios)
- `apps/lab/app/project/[id]/run.tsx` - consome `sourceProgressLine`; Cancelar sempre vivo; D-08 intacto
- `apps/lab/src/search/__tests__/runPolling.test.ts` - 9 testes novos (teto 720, helper, linha por fonte)

## Decisions Made

- Loop controlado por coletados **brutos** (raw `items.length`), métricas por **kept** (pós-filtro): filtro restritivo nunca causa páginas extras — a parada pelo total reflete o que a fonte declarou, o `returned` reflete o que passou no D-32.
- Total `null` (fonte sem total) = 1 página: nunca laço só por total (T-08-06-02) — com as travas vazia/repetida como rede.
- Cancel mid-loop sem `recordSourceEvent`: cancel é ação do operador, não sinal de saúde da fonte (o caminho de cancel pré-fonte já não registrava).
- `parseOne` aditivo **estrito**: campo ausente = linha legada (sem fallback, retrocompatível); presente mas malformado = fallback fail-closed como os campos centrais.
- `sourceProgressLine` puro em `pageProgress.ts` (extra estrutural): vitest node quebra ao importar `run.tsx` (react-native) — mesmo precedente da 08-03 (`decision.ts`); a tela só monta JSX.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `parseOne` stripava `pagesFetched/pagesTotal` do DTO**
- **Found during:** task 2 (teste 120/120 verde em `total`/`returned`, `pagesFetched` undefined no GET)
- **Issue:** `toRunDTO` reconstrói `PerSourceMetrics` campo a campo em `searches.ts`; os campos aditivos do contrato nunca chegavam à API — o progresso existia no banco mas era invisível para a UI (o plano previa "UI usa se presentes", mas nada chegaria).
- **Fix:** `parseOne` valida e repassa os opcionais (ausente = legado sem fallback; malformado = fallback fail-closed) + `import type PerSourceMetrics`.
- **Files modified:** `apps/core-api/src/lib/searches.ts`
- **Verification:** teste 120/120 com `pagesFetched===3` via rota HTTP; regressão isnew/groups intacta
- **Committed in:** `09f8a90` (part of task commit)

**2. [Rule 1 - Bug] Cancel durante o fetch da página 1 descartava a página**
- **Found during:** task 2 (teste de cancel afirmou `returned===50`, recebeu 0 com status `cancelled`)
- **Issue:** o fetch da página 1 ocorria ANTES do loop checado; o cancel que chegava durante esse fetch fazia o `while` parar antes de processar — página legitimamente coletada era descartada (viola "preserva o coletado").
- **Fix:** fetch movido PARA DENTRO do loop (checa cancel → fetch → processa); página em voo ainda é processada, a parada ocorre na próxima iteração. Challenge retry continua só na página 1.
- **Files modified:** `apps/core-api/src/lib/searchRuns.ts`
- **Verification:** cancel determinístico `cancelled` + 50 preservados; suite runs 9/9 sem regressão
- **Committed in:** `09f8a90` (part of task commit)

**3. [Rule 3 - Blocking] `sourceProgressLine` não era testável no vitest node**
- **Found during:** task 3 (plano exige "progresso renderiza com métricas e some sem elas" em `runPolling.test.ts`, mas `run.tsx` importa react-native)
- **Issue:** importar a função da tela quebraria a suite (precedente 08-03: `SyntaxError` com react-native/expo-router).
- **Fix:** função pura movida para `src/search/pageProgress.ts` (só contracts + helper); `run.tsx` importa e monta; 4 testes diretos da linha (pulada/falhou/buscando/com-páginas/terminal).
- **Files modified:** `apps/lab/src/search/pageProgress.ts` (novo), `apps/lab/app/project/[id]/run.tsx`, `apps/lab/src/search/__tests__/runPolling.test.ts`
- **Verification:** lab 91/91 (82 prévios + 9 novos), tripwire intacto
- **Committed in:** `639bafb` (part of task commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking)
**Impact on plan:** Todos necessários para a entrega real (progresso visível na API, cancel que preserva, UI testável). Sem scope creep — nenhum comportamento além do plano; `pageProgress.ts` é extra estrutural documentado acima.

## Issues Encountered

- Primeira versão do loop checava cancel APÓS o fetch da página 1 (fetch pré-loop): o teste de cancel provou a perda (0 em vez de 50) e guiou o redesign fetch-first — o próprio teste planejado funcionou como detector.
- `pnpm audit`/Gitleaks/SAST sem execução local (sem binário, como nos planos 08-01–08-04 — CI cobre); nenhuma dependência nova neste plano.
- Abort simulado mid-loop via timeout real (30min) inviável sem flakiness: coberto pelo cancel determinístico (mesmo caminho de preservação, `stoppedByCancel`/`abortedMidLoop` escrevem as mesmas métricas com coletado); documentado aqui em vez de teste flaky, conforme o plano permitia.

## Verification Evidence

- `tsc --noEmit` contracts + core-api + raiz + lab: verdes; eslint nos pacotes/app: exit 0; zero `any` (grep gate 0 nos 8 arquivos)
- Gates do plano task 1: `page: 1, perPage: RUN_PER_PAGE` 0; `RUN_FETCH_PER_PAGE = 50|perPage: 50` 3; `RUN_QUEUE_TIMEOUT_MS = 30` 1; `pagesFetched` 2+8
- vitest PG real (`.env.dev.cs`): **full 2/2** (120/120 + rerun 0 + cancel 50/cancelled), runs 9/9, isnew 2/2 — sem regressão
- vitest `@uhhu/lab`: **91/91** (82 prévios + 9 novos), tripwire scroll-containers intacto
- Gates do plano task 3: `RUN_POLL_MAX_POLLS = 720` 1; `pagesFetched` no hook + pageProgress; typecheck+lint+test exit 0
- Auditoria adversarial do diff (IDOR/input/segredos/XSS/SSRF/isolamento/DoS): 0 crit/0 high — paginação sem input do cliente (page/perPage fixos), cancel owner-scoped existente, progresso só-contagens do próprio run, `Text` escapa, sem endpoint novo, sem segredo no bundle

## Known Stubs

Nenhum — scan por TODO/FIXME/placeholder/"coming soon" nos 8 arquivos retornou só falsos positivos ("TODOS" em comentários PT-BR). Sem dados mockados: o teste usa stub de fetch server-side com shape VuFind real.

## Threat Flags

Nenhuma superfície nova além do `<threat_model>` do plano: sem endpoint, sem schema físico, sem auth path novo. Mitigações implementadas 1:1 — T-08-06-01 (teto 30min + cancel + 10 runs/h intactos), T-08-06-02 (vazia + repetida + total-null=1pág + teto global), T-08-06-03 (só contagens do run do dono).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UI-14 agora completo no comportamento (busca completa fim-a-fim); REQUIREMENTS.md pode marcar a evolução (tabela mantém Done 07-03 — ver atualização abaixo).
- Fase 9 (corpus/comparação) desbloqueada: runs com corpus maior (120+ por fonte) exercitam paginação de results (limit 100) e contadores de corpus.
- Risco residual (baixo, fora de escopo): fonte com total gigante mentiroso + itens únicos infinitos só para no teto 30min (aceito no threat model); re-teste humano tablet do run longo + cancel entra na UAT da fase 8.

---

*Phase: 08-resultados-triagem*
*Completed: 2026-09-13*

## Self-Check: PASSED

- Arquivos: `apps/core-api/src/lib/searchRuns.ts`, `apps/core-api/src/lib/searches.ts`, `packages/contracts/src/lab.ts`, `tests/integration/lab-search-runs-full.test.ts`, `apps/lab/src/search/useRunPolling.ts`, `apps/lab/src/search/pageProgress.ts`, `apps/lab/app/project/[id]/run.tsx`, `apps/lab/src/search/__tests__/runPolling.test.ts` — todos FOUND
- Commits: `caf30b6` FOUND, `09f8a90` FOUND, `639bafb` FOUND (`git log --oneline` confirma os três sobre `43e5838`)
