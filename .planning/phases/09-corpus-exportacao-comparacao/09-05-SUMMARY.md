---
phase: 09-corpus-exportacao-comparacao
plan: 05
subsystem: ui
tags: [expo, react-native, reference-search, lab-ui]

# Dependency graph
requires:
  - phase: 09-corpus-exportacao-comparacao
    provides: [Tela compare 2-4 com vencedora ★ mais inclusiva e rota na TabBar (09-04)]
  - phase: 06-fundacao-app-auth-suporte-core
    provides: [PATCH projects referenceSearchId nullable + pertencimento application-level]
provides:
  - Selo Referência no SearchCard com troca em um toque sem confirmação
  - strategies.tsx lendo/trocando referenceSearchId via PATCH com revert otimista
  - Coluna de referência destacada no compare sem efeito funcional
affects: [09-06-gate-milestone]

# Tech tracking
tech-stack:
  added: []
  patterns: [PATCH parcial só-campo com estado otimista revertido em erro verbatim, referência como memória visual sem filtro funcional]

key-files:
  created: []
  modified: [apps/lab/src/search/SearchCard.tsx, apps/lab/app/project/[id]/strategies.tsx, apps/lab/app/project/[id]/compare.tsx]

key-decisions:
  - "Referência otimista com revert em erro verbatim no topo; 401 vira expired+next (molde 07-06)"
  - "Exclusão da busca-referência limpa o selo local para null sem request extra"
  - "Coluna referência destacada só com peso/borda, sem paleta nova; vencedora ★ intacta"

patterns-established:
  - "SearchCard sem API: recebe isReference/onSetReference e só renderiza selo ou botão de um toque"
  - "referenceSearchId nunca filtra corpus/resultados/export (gate grep D-25)"

requirements-completed: [UI-29]

# Metrics
duration: 2min
completed: 2026-09-13
---

# Phase 9 Plan 5: Referência manual Summary

**Selo Referência no card com troca em um toque via PATCH, coluna destacada no compare, sem efeito em corpus/filtros/resultados**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-09-13T14:30:44Z
- **Completed:** 2026-09-13T14:32:59Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `SearchCard` estendido com `projectId/isReference/onSetReference`: selo `Referência` ou botão `Usar como referência` de um toque, sem API e sem confirmação
- `strategies.tsx` com `Promise.all(listSearches + listById)` guardando `referenceSearchId`, PATCH otimista com revert e erro verbatim no topo, 401 expired+next; null = nenhum selo
- `compare.tsx` com fetch `listById` no mount e coluna referência com `Referência` + destaque peso/borda; vencedora ★ do 09-04 intacta; D-25 provado por grep = 0

## Task Commits

Each task was committed atomically:

1. **task 1: selo Referencia no SearchCard com um toque** - `3a98c1e` (feat)
2. **task 2: strategies le e troca a referencia + compare destaca a coluna** - `f3f27ff` (feat)

## Files Created/Modified

- `apps/lab/src/search/SearchCard.tsx` - props `projectId/isReference/onSetReference` + selo/botão de um toque após runs, sem API/Alert
- `apps/lab/app/project/[id]/strategies.tsx` - leitura/troca `referenceSearchId` via `projectsApi`, erro verbatim + 401 expired+next, limpeza local ao excluir referência
- `apps/lab/app/project/[id]/compare.tsx` - `referenceSearchId` no mount + `Referência` e destaque na coluna, tabela e vencedora intactas

## Decisions Made

- Referência otimista com revert em erro verbatim no topo; 401 vira expired+next (molde 07-06 título/PATCH parcial, estados independentes).
- Exclusão da busca-referência limpa o selo local para null sem request extra (servidor continua dono; evita selo órfão).
- Coluna referência destacada só com `fontWeight 700`/borda 2, sem paleta nova; vencedora ★ intacta.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- task 1 quebra o typecheck até a task 2 (chamador `strategies.tsx` ainda sem as novas props — `TS2739` esperado no plano por divisão em 2 tasks). Resolvido na task 2; typecheck final verde. Não é desvio de escopo.

## Auditoria adversarial (AGENTS.md, por arquivo)

- **SearchCard.tsx:** sem API interna (PATCH mora em strategies); sem `Alert`/confirm; `projectId` só para next do 401; Text escapa por padrão, sem WebView/eval/segredo; `any` 0.
- **strategies.tsx:** só oferece IDs da lista do próprio projeto (IDOR contido no client; servidor decide 404/401 T-09-05-01); troca sem confirmação é decisão D-24 aceita (T-09-05-02, re-PATCH reverte em 1 toque); sem filtro por referência (D-25 grep 0); erro verbatim + requestId sem vazar token; sem `eval`/`Math.random`.
- **compare.tsx:** leitura `listById` read-only no mount; UUID guards do 09-04 intactos; 401 vira expired+next; destaque só visual; termos do próprio usuário; sem filtro funcional; `any` 0.
- Achados: 0 crit / 0 high. Sem segredos em código; bundle check segue no 09-06.

## Threat Flags

None — nenhuma superfície nova além do PATCH `referenceSearchId` já previsto no threat model do plano (T-09-05-01 mitigado, T-09-05-02 aceito).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 09-05 pronto para 09-06 (gate do milestone: slice vertical + auditoria + UAT humana).
- Wave 2 completa do lado referência (09-03 + 09-05); falta só 09-06.
- UAT humana pendente em fila paralela (07/06/08) — sem bloqueio para 09-06.

---
*Phase: 09-corpus-exportacao-comparacao*
*Completed: 2026-09-13*

## Self-Check: PASSED (3/3 files FOUND, 2/2 commits FOUND)
