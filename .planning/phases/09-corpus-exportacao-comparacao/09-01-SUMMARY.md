---
phase: 09-corpus-exportacao-comparacao
plan: 01
subsystem: api
tags: [bibtex, export, corpus, professionalMaster, vitest, smoke]

# Dependency graph
requires:
  - phase: 08-resultados-triagem
    provides: professionalMaster como terceiro docType separado (enum + canonical MP-first)
  - phase: 04-corpus-e-exportacao
    provides: serializadores puros de exportacao (toBibTeX/toCSV/toJSON) + guards anti-injection
provides:
  - toBibTeX emite `type={Mestrado profissional}` somente para professionalMaster
  - 3 casos de contrato MP no smoke dedup-exports (suite 28/28)
affects: [09-03-export-ui, 09-06-gate-milestone]

# Tech tracking
tech-stack:
  added: []
  patterns: [fixed-literal via escapeBibtex para marcacao BibTeX, sem novo entry type]

key-files:
  created: []
  modified: [apps/core-api/src/lib/exports.ts, tests/smoke/dedup-exports.test.ts]

key-decisions:
  - "type= (nao note=) como campo da marcacao profissional, valor literal fixo via escapeBibtex"
  - "Sem novo entry type: professionalMaster continua @mastersthesis"

patterns-established:
  - "Marcacao de subtipo BibTeX via campo type= condicional com literal fixo escapado"

requirements-completed: [UI-26]

# Metrics
duration: ~2min
completed: 2026-09-13
---

# Phase 9 Plan 01: CORE BibTeX MP Summary

**`professionalMaster` exporta `@mastersthesis` com `type={Mestrado profissional}` via literal fixo escapado, sem novo entry type, com 3 casos de contrato no smoke (28/28 verde)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-09-13T14:12:23Z
- **Completed:** 2026-09-13T14:13:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `toBibTeX` emite `type={Mestrado profissional}` somente para `docType === 'professionalMaster'` (D-26, UI-26)
- Tese continua `@phdthesis`, dissertacao academica continua `@mastersthesis` sem marcacao, `docType null` continua `@mastersthesis` sem `type=` (fallback preservado)
- CSV e JSON de exportacao intocados (byte-identicos — diff mostra so 3 linhas adicionadas no bloco BibTeX)
- Suite smoke `dedup-exports` verde: 25/25 antes + 3 casos MP novos = 28/28

## task Commits

Each task was committed atomically:

1. **task 1: toBibTeX marca professionalMaster sem novo entry type** - `8e1c6be` (feat)
2. **task 2: casos de contrato MP no smoke existente** - `0a27e8d` (test)

## Files Created/Modified

- `apps/core-api/src/lib/exports.ts` - condicional `type=` com literal `Mestrado profissional` via `escapeBibtex`, apos o campo `note=`; `entryType`/`toCSV`/`toJSON` intocados
- `tests/smoke/dedup-exports.test.ts` - `describe('toBibTeX professionalMaster (D-26)')` com 3 its via `makeEntry` (professional com marcacao; master e doctoral sem marcacao)

## Decisions Made

- Campo `type=` (nao `note=`) para a marcacao profissional: `note=` ja carrega `decision:` do grupo; `type=` e o campo BibTeX canonico para subtipo de thesis — valor literal fixo, sem interpolar input do usuario (mitiga T-09-01-01)
- Nenhum entry type novo (`@mphil`/`@techreport` ausentes, grep = 0): tese/dissertação/MP mapeiam para os 2 entry types que a spec §8 reconhece

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Auditoria adversarial (AGENTS.md)

- **Autorizacao/IDOR:** N/A — serializador puro, sem actor/HTTP/db; escopo e 404 seguem na rota (intocada)
- **Injection (T-09-01-01, mitigate):** valor literal fixo `'Mestrado profissional'` passado por `escapeBibtex`; emitido somente quando `e.docType === 'professionalMaster'` — teste prova exclusividade (master/doctoral `not.toContain`)
- **Injection BibTeX/CSV (T-09-01-02, accept):** guards existentes (`csvCell` anti `=+@`, `escapeBibtex`, brace-protection) intocados; nenhum campo novo com input livre
- **Segredos/sessoes/webhooks/SQL:** N/A — sem I/O, sem query, sem token
- **Gates executados:** `pnpm vitest run tests/smoke/dedup-exports.test.ts` 28/28 verde; `tsc --noEmit` do `@uhhu/core-api` exit 0; `grep -c "Mestrado profissional"` = 1 em `exports.ts`; `grep -c "@mphil\|@techreport"` = 0

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CORE pronto para 09-03 (Export UI): BibTeX do MP ja sai marcado; UI so consome `exportProject` raw
- Sem bloqueios; 09-02 e 09-04 (Wave 1 paralelos) nao conflitam (zero overlap de arquivos)

---
*Phase: 09-corpus-exportacao-comparacao*
*Completed: 2026-09-13*

## Self-Check: PASSED
- FOUND: apps/core-api/src/lib/exports.ts (commit 8e1c6be)
- FOUND: tests/smoke/dedup-exports.test.ts (commit 0a27e8d)
- FOUND: 8e1c6be e 0a27e8d em git log
- Suite 28/28 + typecheck exit 0 verificados acima
