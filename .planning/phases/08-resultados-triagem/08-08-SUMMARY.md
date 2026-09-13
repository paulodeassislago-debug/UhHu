---
phase: 08-resultados-triagem
plan: "08"
subsystem: integrations
tags: [capes, rest-busca, payload, postFilter, contract-test, vitest]

# Dependency graph
requires:
  - phase: 08-resultados-triagem plan 08-01
    provides: postFilter do Core com redundância fonte+Core (D-32) e isNew só-anteriores
  - phase: 03-buscas-e-adapters
    provides: adapter CAPES rest/busca + contrato lab-sources-contract com fixtures
provides:
  - Payload CAPES nunca combina Ano + Grau Acadêmico (contorno client-side do zeramento da fonte)
  - Mapper CAPES com year real de dataDefesa ISO (fallback ano/year)
  - Casos de contrato período+tipo, só-período, dataDefesa→year, sem-ano→null + validação com Grau
affects: [08-resultados-triagem UAT, 09-corpus-exportacao, lab-run-fetch-more]

# Tech tracking
tech-stack:
  added: []
  patterns: [fonte-aproxima-Core-garante para combos que zeram a fonte, mapper dataDefesa-first com fallback legado]

key-files:
  created: []
  modified: [packages/integrations/src/capes.ts, tests/integration/lab-sources-contract.test.ts]

key-decisions:
  - "hasDegree via canonicalDocTypes (não docTypes cru): só valores que viram filtro Grau efetivo suprimem o Ano"
  - "yearFromValue NÃO estendido: YEAR_PATTERN já extrai ISO, provado por teste em vez de código novo"
  - "Dois testes extras de validação-com-Grau (range>30a + invertido) além do plano: blindam T-08-08-01 nos dois ramos"

patterns-established:
  - "Contorno client-side de zeramento da fonte: omitir o campo problemático no payload + Core garante via postFilter (D-32)"
  - "Mapper prefere campo real da fonte (dataDefesa) com fallback legado, sem mudar yearFromValue"

requirements-completed: [UI-14]

# Metrics
duration: ~7min
completed: 2026-09-13
---

# Phase 8 Plan 08: CAPES Ano+Grau gap-closure Summary

**Payload CAPES omite Ano quando há filtro de Grau (fonte zerava o combo) + year real de dataDefesa ISO, travados por 6 novos casos de contrato**

## Performance

- **Duration:** ~7min
- **Started:** 2026-09-13T02:03:57Z
- **Completed:** 2026-09-13T02:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `buildCapesPayload` nunca combina `Ano` + `Grau Acadêmico` na mesma chamada: com filtro de Grau, nenhum `Ano` é enviado (range, unilateral ou qualquer forma); período fica 100% com o postFilter do Core. Sem Grau, `Ano` expande normal. Validação range>30a/invertido continua lançando antes da rede.
- `mapCapesRecord` extrai `year` de `dataDefesa` primeiro (ISO `2024-01-26T00:00:00.000Z` via `YEAR_PATTERN` existente), fallback `ano`/`year`; sem nenhum → `null` preservado (passa como "não-provado" no postFilter).
- Contrato CAPES com 6 casos novos/atualizados (21/21 no arquivo); suítes verdes: `pnpm test` 209 passed / 21 files, typecheck raiz exit 0, eslint exit 0, zero `any`.

## Task Commits

Each task was committed atomically:

1. **task 1: payload sem combo + year de dataDefesa** - `d92b50f` (fix)
2. **task 2: casos de contrato + suítes + auditoria** - `e663c8b` (test)

**Plan metadata:** _(docs commit após STATE/ROADMAP, ver Final commit)_

## Files Created/Modified

- `packages/integrations/src/capes.ts` - `hasDegree` gate no payload + comentário de evidência 12/09/2026/D-32; `year` dataDefesa-first no mapper
- `tests/integration/lab-sources-contract.test.ts` - período+tipo sem Ano/com Grau (reescrito do antigo "Ano expandido"); só-período com Ano; dataDefesa ISO→2024 + filtragem postFilter in/out; sem-ano→null + null passa no postFilter; range>30a e invertido com Grau antes da rede

## Decisions Made

- `hasDegree` computado via `canonicalDocTypes` (não `def.docTypes.length` cru): só docTypes que viram filtro `Grau Acadêmico` efetivo suprimem o `Ano`. DocTypes desconhecidos → sem Grau → `Ano` enviado (sem combo que zere).
- `yearFromValue` NÃO estendido: `YEAR_PATTERN` (`/(\d{4})/`) já extrai ISO; em vez de código novo, teste prova `dataDefesa: '2024-01-26T00:00:00.000Z'` → `2024`.
- Dois testes extras além do plano (range>30a e ano-invertido COM Grau): blindam T-08-08-01 nos dois ramos da validação.

## Deviations from Plan

None - plan executed exactly as written (adição de 2 casos de validação-com-Grau é cobertura do threat T-08-08-01 já previsto, não escopo novo).

## Issues Encountered

None. PG-real tests pularam por PG inalcançável (offline condicional por desenho, como nos planos anteriores); contrato puro 21/21 sem PG/rede.

## Auditoria adversarial do diff (AGENTS.md gate)

- **Autorização/IDOR:** adapter puro sem owner/actor — N/A; filtros vêm de `SearchDef` validada por Zod no Core.
- **Injeção:** termo vai em campo `termo` de POST JSON (`Content-Type: application/json`) — sem SQL/interpretação; `campo` sempre literal fixo; `valor` de ano = `String(number)` validado, grau = rótulo fixo Mestrado/Doutorado, área/programa = strings trimadas dentro de JSON.
- **Segredos/logs:** nenhum adicionado; `rawMetadata` passa por `sanitizeRaw` (remove cookie/authorization/token/session).
- **XSS/SSRF:** adapter não renderiza HTML; URL da fonte é constante inalterada; `dataDefesa` promovido só a `year` numérico.
- **T-08-08-01 (período ignorado):** mitigado — validação mantida nos dois ramos + postFilter cobre (year real; null mantido, confirmado em `postFilter.ts:75-80`).
- **T-08-08-02 (dataDefesa disclosure):** sem superfície nova — campo já vinha no `rawMetadata`.
- **Resultado:** 0 crit / 0 high.

## Threat Flags

None — nenhuma superfície nova (sem endpoints, auth, file access ou schema; mesma URL, mesmo envelope, só omissão condicional de filtro + promoção de campo já presente a year numérico).

## Known Stubs

None — nenhum placeholder/TODO/mock adicionado; `year null` sem dataDefesa/ano é comportamento preservado por desenho (postFilter trata como "não-provado").

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UI-14 (busca período+tipo do Paulo 2024-2026) desbloqueada no lado CAPES: payload retorna dados onde a fonte tem (>0) e anos reais voltam a filtrar no Core.
- Re-teste humano UAT + aprovação da auditoria Hermes seguem pendentes em paralelo (fora deste plano).
- Fora de escopo honrado: combos Área/Programa × outros campos intocados (sem evidência de zeramento).

---
*Phase: 08-resultados-triagem*
*Completed: 2026-09-13*

## Self-Check: PASSED (SUMMARY + capes.ts found; d92b50f + e663c8b in log; dataDefesa 2 + 3)
