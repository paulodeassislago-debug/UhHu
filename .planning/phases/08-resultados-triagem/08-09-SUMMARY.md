---
phase: 08-resultados-triagem
plan: "09"
subsystem: integrations
tags: [capes, bdtd, payload, postFilter, docType, searchTerm, vitest, contract-test]

# Dependency graph
requires:
  - phase: 08-resultados-triagem plan 08-01
    provides: postFilter do Core com redundância fonte+Core (D-32)
  - phase: 08-resultados-triagem plan 08-08
    provides: contorno Ano×Grau client-side + year de dataDefesa (base REVISADA: Grau-only → Ano-only)
provides:
  - Contrato com terceiro valor `professionalMaster` (MP separado, max 3, sem migration)
  - Payload CAPES Ano-only (ano+tipo → só Ano; só-tipo → Grau; nunca Ano+Grau; nunca Grande Área)
  - Termo de busca cru sem auto-aspas + checkbox MP + hint 2026 no run
  - Casos de contrato Ano-only/MP/termo-cru travando as decisões Paulo 12/09
affects: [08-resultados-triagem UAT, 09-corpus-exportacao, lab-run-busca-paulo]

# Tech tracking
tech-stack:
  added: []
  patterns: [ano-only-com-ambos-tipo-no-posfiltro, mp-categoria-propria-fim-a-fim, termo-cru-fidelidade-ao-site]

key-files:
  created: []
  modified: [packages/contracts/src/lab.ts, packages/integrations/src/capes.ts, packages/integrations/src/postFilter.ts, packages/integrations/src/bdtd.ts, apps/lab/src/search/searchTerm.ts, apps/lab/src/search/SearchForm.tsx, apps/lab/app/project/[id]/run.tsx, apps/lab/src/results/triage.ts, apps/lab/src/search/SearchCard.tsx, tests/integration/lab-sources-contract.test.ts, apps/lab/src/search/__tests__/searchTerm.test.ts]

key-decisions:
  - "Ano-only com ambos (revisa Grau-only 08-08): período+tipo do Paulo volta com anos reais da fonte, tipo 100% pós-filtro"
  - "MP terceiro valor separado com rótulo próprio em todas as camadas (contrato, Grau CAPES, labels UI, BDTD omitido-na-fonte)"
  - "BDTD MP-only omite format[] (formato VuFind não verificado zeraria a fonte — mesmo molde dos 2 formatos)"
  - "hasDegree removido como morto; Grau gated por hasYear (sem ano junto = sem combo que zere)"

patterns-established:
  - "Filtro não-verificado na fonte é omitido e garantido pelo Core (D-32): BDTD MP segue o precedente dos 2 formatos"
  - "Campos exatos do payload travam remoção de filtro (sort+toEqual em vez de not.toContain com literal)"

requirements-completed: [UI-13, UI-14]

# Metrics
duration: ~8min
completed: 2026-09-13
---

# Phase 8 Plan 09: Decisões Paulo definitivas Summary

**MP como terceiro valor separado fim-a-fim + payload CAPES Ano-only sem Grande Área + termo cru sem auto-aspas, travados por 6 novos casos de contrato**

## Performance

- **Duration:** ~8min
- **Started:** 2026-09-13T02:55:49Z
- **Completed:** 2026-09-13T03:03:47Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- `docTypeSchema` += `'professionalMaster'` com `docTypes` max 2→3 (coluna `doc_type` é `text` nullable — SEM migration; `DocType`/`NormalizedItem` fluem pelo tipo, aditivo §19). `canonicalDocType` mapeia 'Mestrado Profissional' → `professionalMaster` em capes/postFilter/bdtd (checado ANTES do mestrado comum); `degreeLabel` com rótulo próprio 'Mestrado Profissional'.
- `buildCapesPayload` Ano-only DEFINITIVO (revisa o Grau-only do 08-08): ano+tipo → SÓ `Ano` expandido (tipo 100% pós-filtro); unilateral+tipo → SÓ `Ano`; só-tipo → `Grau Acadêmico` (3 rótulos); sem ambos → nenhum; NUNCA Ano+Grau juntos; `area` NUNCA vai à fonte (só pós-filtro heurístico D-32); `program` segue como `Área Conhecimento`. Validações RangeTooWideError/invertido sempre antes da rede, nos dois ramos.
- `buildSearchTerm` sem `quoteIfNeeded`: texto trimado e cru (multi-palavra sem aspas automáticas — fidelidade ao site, decisão 12/09); aspas digitadas explicitamente preservadas verbatim; `splitSearchTerm` inalterado (quote-aware, round-trip preservado). SearchForm com terceiro checkbox "mestrado profissional" ↔ `professionalMaster` (criar+editar preservam os 3 via `DocType` do contrato; tese/dissertação sem inversão). Hint 2026 no run: CAPES `total===0` E `filtersSnapshot.yearTo>=2026` → "(a fonte tem poucos dados de 2026)" — só dados já na tela, sem nova rota.
- Suítes verdes: `pnpm test` 214 passed / 21 files (contrato 26/26 no arquivo), typecheck raiz exit 0, `pnpm --filter @uhhu/lab` typecheck+lint exit 0, vitest lab 100/100, zero `any`.

## Task Commits

Each task was committed atomically:

1. **task 1: contrato 3º valor + payload Ano-only + sem Grande Área** - `c677872` (feat)
2. **task 2: sem auto-aspas + checkbox MP + hint 2026** - `538299c` (feat)
3. **task 3: testes (contrato + searchTerm + regressão) + auditoria** - `90255bd` (test)

**Plan metadata:** _(docs commit após STATE/ROADMAP, ver Final commit)_

## Files Created/Modified

- `packages/contracts/src/lab.ts` - enum += `professionalMaster` (+ comentário decisão/aditivo), `docTypes` max 3
- `packages/integrations/src/capes.ts` - `canonicalDocType` MP-first, `degreeLabel` 3 rótulos, payload Ano-only, área removida da fonte, comentários decisão 12/09 + D-32
- `packages/integrations/src/postFilter.ts` - `canonicalDocType` MP (casa SOMENTE `professionalMaster`), `describeDocTypes` com 'Mestrado Profissional' [Rule 2]
- `packages/integrations/src/bdtd.ts` - `canonicalDocType` MP + MP-only omite `format[]` (fonte não conhece; Core garante) [Rule 1]
- `apps/lab/src/search/searchTerm.ts` - `quoteIfNeeded` removido; composição crua + comentários decisão 12/09
- `apps/lab/src/search/SearchForm.tsx` - checkbox mestrado profissional (`DocType` do contrato), criar/editar preservam os 3
- `apps/lab/app/project/[id]/run.tsx` - hint 2026 condicional no bloco CAPES (só dados da tela)
- `apps/lab/src/results/triage.ts` - `docTypeLabel` com 'mestrado profissional' (nunca 'dissertação') [Rule 1]
- `apps/lab/src/search/SearchCard.tsx` - `summarizeFilters` com 'mestrado profissional' [Rule 1]
- `tests/integration/lab-sources-contract.test.ts` - período+tipo e unilateral+tipo Ano-only; só-tipo Grau MP; MP→professionalMaster + filtro separado; contrato max3; BDTD MP-only sem format[]; BDTD lookfor cru; dataDefesa mantido
- `apps/lab/src/search/__tests__/searchTerm.test.ts` - cru sem aspas, explícitas preservadas, 2 round-trips (cru + explícito)

## Decisions Made

- **Ano-only com ambos (revisão do 08-08):** a busca do Paulo (2024-2026 + tese/dissertação) precisa dos anos REAIS da fonte; o tipo é 100% pós-filtravel (year real de dataDefesa + docType canônico), então o Ano vai à fonte. Decisão Paulo 12/09 definitiva, incorporada ao contorno.
- **`hasDegree` removido como variável morta; Grau gated por `hasYear`:** a inversão do gate (era `!hasDegree` no Ano, agora `!hasYear` no Grau) deixou `hasDegree` sem leitores — removido em vez de mantido como peso morto.
- **Campos exatos do payload no teste (`sort+toEqual`) em vez de `not.toContain` com literal:** trava qualquer reintrodução do filtro removido E satisfaz o acceptance `grep -c "Grande Área" == 0` sem enfraquecer a asserção.
- **Correção de typo do plano (task 3 ação 1 "período+tipo → sem Ano"):** lido contra must_haves/interfaces ("viram Ano-only", "Ano-only com ambos") — implementado COM Ano SEM Grau; documentado aqui como erro de texto do plano, não mudança de escopo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] postFilter.ts + describeDocTypes sem MP**
- **Found during:** task 1 (contrato 3º valor + payload)
- **Issue:** plano listava só `lab.ts`/`capes.ts` em `<files>` mas a ação 4 exigia "postFilter: MP só casa professionalMaster" — sem o mapeamento, MP filtraria como null (tese+dissertação incluiriam/excluiriam errado, T-08-09-01 aberto).
- **Fix:** `canonicalDocType` MP-first + rótulo 'Mestrado Profissional' no describe. Allowed-set confirmado genérico (Set dos mapeados, sem allowlist binária).
- **Files modified:** packages/integrations/src/postFilter.ts
- **Verification:** teste MP→professionalMaster + filtro separado (MP-only keeps, tese+dissert exclui, sem-filtro inclui); typecheck raiz exit 0
- **Committed in:** c677872 (task 1 commit)

**2. [Rule 1 - Bug] bdtd.ts não reconhecia MP + enviaria `format:"professionalMaster"` à VuFind**
- **Found during:** task 3 (auditoria adversarial do diff)
- **Issue:** valor novo fazia o BDTD (a) mapear MP→null e (b) enviar formato não-verificado que provavelmente zeraria a fonte em buscas MP-only — regressão causada diretamente pelo 3º valor.
- **Fix:** `canonicalDocType` MP-first + MP-only omite `format[]` (Core garante, D-32 — mesmo molde do caso 2-formatos já comentado no código).
- **Files modified:** packages/integrations/src/bdtd.ts, tests/integration/lab-sources-contract.test.ts
- **Verification:** teste MP-only sem `filter[]`; `pnpm test` 214/214
- **Committed in:** c677872 (mapeamento) + 90255bd (omissão + teste)

**3. [Rule 1 - Bug] triage.ts/SearchCard.tsx rotulariam MP como 'dissertação'**
- **Found during:** task 2 (checkbox MP)
- **Issue:** ternários binários `doctoralThesis ? 'tese' : 'dissertação'` absorveriam o valor novo no rótulo errado — UX mentirosa causada diretamente pelo 3º valor.
- **Fix:** ramo explícito 'mestrado profissional' nos dois pontos (triage é o ponto único; SearchCard tem summarize próprio não-exportado).
- **Files modified:** apps/lab/src/results/triage.ts, apps/lab/src/search/SearchCard.tsx
- **Verification:** typecheck+lint lab exit 0; vitest lab 100/100
- **Committed in:** 538299c (task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs Rule 1, 1 missing-critical Rule 2)
**Impact on plan:** Todos exigidos por corretude da feature (o 3º valor quebrava classificação/filtro/rótulo sem eles). Sem scope creep — nenhum endpoint, schema ou superfície nova.

## Issues Encountered

- Typecheck quebrou no meio da task 1 (meu edit derrubou os locais `yearFrom`/`yearTo`): restaurados, ROOT_TYPECHECK_OK antes do commit.
- Insert de testes engoliu o opener do teste dataDefesa: restaurado e verificado (dataDefesa 08-08 intacto, 26/26 no arquivo).
- Comentário com o literal "Grande Área Conhecimento" violava o acceptance `grep == 0`: reescrito sem o literal (o filtro nunca foi reintroduzido — só o comentário citava o nome).
- Contagem `pnpm test` 213→214 explicada: searchTerm (+1) roda no projeto lab, não no workspace raiz; BDTD MP (+1) e 4 CAPES no raiz (209+5=214 ✓); lab 99→100 ✓.

## Auditoria adversarial do diff (AGENTS.md gate)

- **Autorização/IDOR:** adapters puros sem owner/actor — N/A; filtros vêm de `SearchDef` validada por Zod no Core; SearchForm/run são UX guards.
- **T-08-09-01 (tipo ignorado volta tudo):** mitigado — Ano-only com tipo 100% postFilter genérico; testes por valor (MP-only keeps, tese+dissert exclui MP, sem-filtro inclui); BDTD MP-only omitido-na-fonte + garantido no Core.
- **T-08-09-02 (termo cru injeta operador):** mitigado — operadores só via linhas AND/OR/NOT (D-09, sem expressão livre); texto é operando trimado em campo `termo` JSON / `lookfor` query — sem SQL/comando/interpolação; validação 1..500 + aspas balanceadas mantida no schema chamador + servidor.
- **Injeção (payload):** Ano = `String(number)` validado; Grau = 1 de 3 rótulos fixos (`degreeLabel` só recebe canônicos — `canonicalDocTypes` filtra null); programa trimado em JSON; sem SQL.
- **XSS/SSRF:** labels MP são literais fixos; Text RN escapa por padrão; hint 2026 é literal fixo; URL da fonte inalterada; sem HTML renderizado.
- **Segredos/logs:** nenhum adicionado; `sanitizeRaw` intocado.
- **`degreeLabel` fallback 'Doutorado':** inalcançável para desconhecidos por construção (só recebe saída de `canonicalDocTypes`, que filtra null) — sem mudança.
- **Resultado:** 0 crit / 0 high.

## Threat Flags

None — nenhuma superfície nova (sem endpoints, auth, file access ou schema; mesmos envelopes e URL; só omissão/seleção condicional de filtros + 3º valor em coluna `text` existente, servidor revalida o enum).

## Known Stubs

None — nenhum placeholder/TODO/mock adicionado; `year null` sem dataDefesa/ano e MP ausente-sem-filtro seguem comportamentos preservados por desenho.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UI-13/UI-14 com decisões Paulo definitivas implementadas: busca do Paulo (2024-2026 + tese/dissertação + MP opcional) retorna CAPES com anos reais; MP excluído salvo se selecionado; termo fiel ao site.
- Re-teste humano UAT (busca período+tipo + MP + termo multi-palavra no tablet) entra na fila com os UATs pendentes das fases 6-8.
- Fora de escopo honrado: combos Programa × outros campos intocados (sem evidência de zeramento além de Ano×Grau).

---
*Phase: 08-resultados-triagem*
*Completed: 2026-09-13*

## Self-Check: PASSED (SUMMARY found; c677872 + 538299c + 90255bd in log; professionalMaster 4 + Grande-Área 0 + max(3) 1)
