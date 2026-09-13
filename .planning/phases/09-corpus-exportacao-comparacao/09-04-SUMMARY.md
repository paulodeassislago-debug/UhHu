---
phase: 09-corpus-exportacao-comparacao
plan: 04
subsystem: ui
tags: [expo, react-native, flatlist, compare, lab-ui]

# Dependency graph
requires:
  - phase: 08-resultados-triagem
    provides: [SearchCard/strategies listadas via listSearches, padrões §11 FlatList/skeleton/verbatim]
  - phase: 06-fundacao-app-auth-suporte-core
    provides: [labApi.compareSearches tipado, AuthProvider com expired+next, CompareDTO em contracts]
provides:
  - Helpers puros mostInclusive/pairOverlap/sortedYearRows com 8 its verdes
  - Tela compare 2–4 lado a lado com destaque único ★ mais inclusiva
  - Rota project/[id]/compare registrada e ligada na TabBar
affects: [09-05-referencia-manual, 09-06-gate-milestone]

# Tech tracking
tech-stack:
  added: []
  patterns: [FlatList raiz com ListHeader/ListFooter para seleção+tabela, colunas condicionais sem loop em JSX, guard UUID client-side antes do compare]

key-files:
  created: [apps/lab/src/compare/compareHelpers.ts, apps/lab/src/compare/__tests__/compareHelpers.test.ts, apps/lab/app/project/[id]/compare.tsx]
  modified: [apps/lab/app/_layout.tsx, apps/lab/app/project/[id].tsx]

key-decisions:
  - "Colunas da tabela como slots condicionais col0..col3 em vez de FlatList aninhada (evita VirtualizedList aninhada e zera .map no JSX)"
  - "Anos globais em FlatList horizontal de chips (orientação distinta da lista externa, sem warning de nesting)"
  - "Guard UUID client-side + só IDs da lista do projeto antes do compare (T-09-04-01)"

patterns-established:
  - "CompareResult puro recebe CompareDTO + termsById e deriva vencedora/anos/colunas sem estado"
  - "Base = primeira marcada; Sobreposição da base exibe 'base'"

requirements-completed: [UI-27, UI-28]

# Metrics
duration: 5min
completed: 2026-09-13
---

# Phase 9 Plan 4: Comparação 2–4 Summary

**Tabela compare 2–4 lado a lado com Resultados/BDTD/CAPES/Sobreposição/Por-ano-global, destaque único ★ mais inclusiva, rota ligada na TabBar e zero menos-ruído**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-13T14:20:17Z
- **Completed:** 2026-09-13T14:25:00Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- Helpers puros `mostInclusive`/`pairOverlap`/`sortedYearRows` com vencedora determinística, overlap bidirecional e anos com `desconhecido` por último (8/8 verdes)
- Tela `compare.tsx`: seleção FlatList com contador `N selecionadas (2 a 4)` + botão Comparar 2..4, tabela em ScrollView horizontal com 4 blocos do DTO e bloco global `Por ano (todas)`
- Destaque único `★ mais inclusiva` no cabeçalho da vencedora; nenhum texto de classificação oposta em código ou UI (grep gate 0)
- Rota `project/[id]/compare` registrada no Stack e TabBar Comparação convertida de disabled para Link; Estratégias/Corpus intactos

## Task Commits

Each task was committed atomically:

1. **task 1: helpers da tabela com testes** - `865c0e3` (feat)
2. **task 2: tela compare 2-4 com vencedora** - `0488c2c` (feat)
3. **task 3: registrar rota e ligar a TabBar** - `cc46067` (feat)

## Files Created/Modified

- `apps/lab/src/compare/compareHelpers.ts` - mostInclusive/pairOverlap/sortedYearRows puros, sem `any`
- `apps/lab/src/compare/__tests__/compareHelpers.test.ts` - 8 its (vencedora, empate, vazio, overlap 2 ordens, ausente, anos, histograma vazio, outsider ignorado)
- `apps/lab/app/project/[id]/compare.tsx` - seleção + tabela + Por-ano-global + §11 + 401 expired/next
- `apps/lab/app/_layout.tsx` - Stack.Screen `project/[id]/compare` após corpus
- `apps/lab/app/project/[id].tsx` - TabBar Comparação vira Link; comentário de header atualizado

## Decisions Made

- Colunas da tabela como slots condicionais `col0..col3` dentro do ScrollView horizontal em vez de FlatList aninhada: evita VirtualizedList aninhada na mesma orientação e mantém `grep .map(` = 0 sem truque.
- Anos globais em FlatList horizontal de chips: orientação distinta da FlatList vertical externa, sem warning de nesting, e o bloco `Por ano (todas)` fica fora do scroll horizontal da tabela.
- Guard UUID client-side + restrição a IDs vindos de `listSearches` do próprio projeto antes de chamar `compareSearches` (mitigação T-09-04-01 no client; servidor continua dono do 404/401).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Comando de teste adaptado ao package do lab**
- **Found during:** task 1 (helpers da tabela com testes)
- **Issue:** O plano manda `pnpm --filter @uhhu/lab vitest run ...`, mas `@uhhu/lab` não expõe script `vitest` (scripts: typecheck/lint/test/start/web; `test` = `vitest run`)
- **Fix:** Executado o equivalente `pnpm --filter @uhhu/lab exec vitest run src/compare/...` (mesmo binário, mesmo filtro)
- **Files modified:** nenhum (só invocação)
- **Verification:** 8/8 verdes no arquivo; `src/compare` 8/8; suite lab 115/115
- **Committed in:** n/a (sem mudança de arquivo)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Adaptação de invocação, sem mudança de escopo ou comportamento.

## Issues Encountered

None — typecheck, lint e suite lab verdes em todas as tasks; gates de conteúdo do plano (`mais inclusiva` presente, `menos.*ru` = 0, `.map(` = 0, `any` = 0 nos 4 arquivos) todos satisfeitos.

## Auditoria adversarial (AGENTS.md, por arquivo)

- **compareHelpers.ts:** funções puras sem I/O; narrowing `unknown` + `Number.isFinite` em todos os acessos a Record; empate determinístico pelo primeiro em `order`; sem superfície de auth/rede/segredo.
- **compare.tsx:** IDs enviados vêm só da lista do próprio projeto + regex UUID antes do request (IDOR/enumeração contida no client; servidor decide 404/401); 401 vira `markExpired` + next `/project/<id>/compare`; Text escapa por padrão, sem WebView/innerHTML/links externos; erro verbatim + requestId sem vazar token; sem `eval`/`Math.random`; termos exibidos são do próprio usuário.
- **_layout.tsx / [id].tsx:** só registro de rota + troca de disabled por Link; título/pergunta/arquivar e contador Corpus intocados (07-01/07-06 intactos).
- Achados: 0 crit / 0 high. Sem segredos em código; bundle check segue no 09-06.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 09-04 pronto para 09-05 (referência manual: selo no card + coluna destacada reutilizam `mostInclusive`/ordenação daqui; `referenceSearchId` segue fora desta tela por desenho do plano).
- Wave 2 (09-03 bloqueado no 09-02, 09-05 bloqueado no 09-04) desbloqueada do lado compare.
- UAT humana pendente em fila paralela (07/06/08) — sem bloqueio para 09-05.

---
*Phase: 09-corpus-exportacao-comparacao*
*Completed: 2026-09-13*

## Self-Check: PASSED (6/6 files FOUND, 3/3 commits FOUND)
