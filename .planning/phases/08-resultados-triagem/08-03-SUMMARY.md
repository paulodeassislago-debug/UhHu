---
phase: 08-resultados-triagem
plan: "03"
subsystem: ui
tags: [expo, react-native, vitest, lab, triagem, dedup, decisao, divergencia]
requires:
  - phase: 08-resultados-triagem plan 02
    provides: ResultCard base + lista infinita + TriagedItem/GroupFilter + labApi decision/divergence
  - phase: 08-resultados-triagem plan 01
    provides: PUT groups/:id/decision + PUT groups/:id/divergence + decidedAt/divergences no DTO
provides:
  - barra de decisão mutável por grupo (elegível/não/indeciso, decidedAt visível, sem confirmação)
  - grupo deduplicado expansível (origens/links/diferenças/canônica) + divergência por fonte sem mudar decisão
  - padrão groupOverrides local + resultCache para updates sem refetch (contrato de 08-04)
affects: [08-04, lab-ui]
tech-stack:
  added: []
  patterns: [groupOverrides Map local com item efetivo, membros sob demanda Promise.all por grupo com cache, bloqueio client de HTML em nota, Linking só-https com fallback texto]
key-files:
  created:
    - apps/lab/src/results/DecisionBar.tsx
    - apps/lab/src/results/decision.ts
    - apps/lab/src/results/DedupGroupSection.tsx
    - apps/lab/src/results/__tests__/decisionBar.test.ts
  modified:
    - apps/lab/src/results/ResultCard.tsx
    - apps/lab/app/project/[id]/results.tsx
key-decisions:
  - "Helpers puros em decision.ts com re-export no DecisionBar: vitest node não importa react-native/expo-router"
  - "groupOverrides local na tela (sem tocar useResultsList/triage.ts dono 08-02); filtros operam sobre o item efetivo"
  - "resultCache do run corrente repassado ao card: expansão busca só membros ausentes, uma vez por grupo"
  - "diffMembers puro + linhas sem .map/nested-FlatList; links só https com fallback texto"
requirements-completed: [UI-18, UI-19]
duration: ~6min
completed: 2026-09-12
---

# Phase 8 Plan 03: Decisão mutável + grupo expansível Summary

**Decisão elegível/não/indeciso mutável a um toque com decidido-em visível + grupo dedup expansível (origens/links/diferenças/★ canônica) com divergência anotável que nunca muda a decisão, refletindo na lista sem refetch**

> Escopo: slice UI de UI-18/UI-19 (D-46). Acopla os controles ao ResultCard da 08-02: DecisionBar (PUT por groupId) + DedupGroupSection (getResult sob demanda + PUT divergência) + groupOverrides/resultCache na tela. Tags no card e ficha dedicada ficam para 08-04 sobre este contrato.

## Performance

- **Duration:** ~6 min
- **Started:** 2026-09-12T20:43:51Z
- **Completed:** 2026-09-12T20:49:41Z
- **Tasks:** 2
- **Files modified:** 6 (4 criados, 2 modificados)

## Accomplishments

- `DecisionBar` mutável por grupo: três botões `[elegível] [não] [indeciso]` com destaque no `group.decision` atual, linha `decidido em DD/MM HH:MM` ou `não triado`, toque → busy + `setGroupDecision(group.id, {decision})` → `onDecided(novoGroup)`, sem confirmação; ApiError verbatim inline sem trocar estado; 401 markExpired+login; null desabilita + `grupo indisponível`
- Helpers puros `decisionLabel`/`decisionForButton`/`formatDecidedAt` em definição única (`decision.ts`, re-exportados pelo `DecisionBar`) + 11 testes verdes sem rede
- `DedupGroupSection` expansível só quando `originCount>1`: botão `[ORIGENS — N origens ▸/▾]`, fetch sob demanda dos ausentes (`getResult` em Promise.all do grupo, skeleton, erro isolado + retry do grupo, uma vez por grupo via cache), linhas por origem (fonte+título/autores/ano+links tocáveis só-https+selo `★ versão mais completa` no `canonicalResultId`), bloco `Diferenças` via `diffMembers` (`campo: A ≠ B` em title/authors/year/institution/program), bloco `Divergências` (`fonte: nota` ou `sem divergências`), formulário (origem entre `group.origins` + nota 1..1000 + `[Anotar]` → `setDivergence` → `onGroupUpdated`; `<>` bloqueados com `Nota não pode conter HTML`)
- `ResultCard` integra ambos abaixo da proveniência (badge NOVO, selo fonte, `ver ficha →` preservados); single sem seção; órfão sem ação
- `results.tsx` com `groupOverrides` (Map groupId→DedupGroupDTO, item efetivo `override ?? original`), `resultCache` (Map resultId→ResultDTO do run), `visibleItems` via `applyResultFilters(efetivos)` — decisão/divergência refletem sem refetch; sem tocar `useResultsList`/`triage.ts`; documentado para 08-04 reusar o mapa

## Task Commits

Each task was committed atomically:

1. **task 1: DecisionBar mutável + integração no card** - `62b9f47` (feat)
2. **task 2: grupo expansível + divergência + overrides na tela** - `28c3cff` (feat)

**Plan metadata:** (este SUMMARY + STATE/ROADMAP, commit final abaixo)

## Files Created/Modified

- `apps/lab/src/results/decision.ts` - helpers puros `decisionLabel`/`decisionForButton`/`formatDecidedAt` em definição única (extra fora do plano, ver desvios)
- `apps/lab/src/results/DecisionBar.tsx` - barra mutável (PUT por groupId, busy, verbatim, 401, null degradado; re-exporta helpers)
- `apps/lab/src/results/__tests__/decisionBar.test.ts` - 11 testes puros (labels 3+fallback, botão→PUT, formato decidedAt, wiring por fonte sem importar RN)
- `apps/lab/src/results/DedupGroupSection.tsx` - seção expansível + `diffMembers` puro + form divergência + https-only + skeleton/retry isolado
- `apps/lab/src/results/ResultCard.tsx` - embute `DecisionBar` + `DedupGroupSection` (só `originCount>1`) via `resultCache`/`onGroupUpdated`
- `apps/lab/app/project/[id]/results.tsx` - `groupOverrides` + `resultCache` + `effectiveAllItems`/`visibleItems` sobre o efetivo + contadores efetivos

## Decisions Made

- `decision.ts` puro com re-export no `DecisionBar`: vitest node quebra ao importar `react-native`/`expo-router` (`SyntaxError: Unexpected token 'typeof'`); definição única continua no puro, o componente re-exporta para o contrato `decisionLabel`/`decisionForButton` seguir válido.
- `groupOverrides` local na tela em vez de expor `updateGroup` no hook: `triage.ts`/`useResultsList.ts` são donos da 08-02 já executada; o mapa `groupId→DedupGroupDTO` com item efetivo evita dependência reversa e já serve à 08-04 (tags) sem reescrever a lista.
- `resultCache` do run corrente (de `list.allItems`) repassado ao card: membros do run nunca refetcham; só ausentes disparam `getResult` em `Promise.all` do grupo, uma vez por grupo (T-08-03-04).
- `diffMembers(members): string[]` puro + linhas construídas com `for` (sem `.map`, sem FlatList aninhada vertical): evita virtualização aninhada dentro da FlatList da tela e mantém o padrão sem-`.map` da 08-02.
- Links só-`https://` via `Linking.openURL`; `http`/esquema estranho vira texto não-tocável (T-08-03-02 com render em `Text` que escapa + bloqueio `<>` no client).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest não importa componente com react-native/expo-router**
- **Found during:** task 1 (verify `decisionBar.test.ts` → `SyntaxError: Unexpected token 'typeof'`, 0 testes coletados)
- **Issue:** teste importava helpers de `DecisionBar.tsx`, que puxa `react-native` + `expo-router` — vitest node não transforma esses módulos (precedente: `useRunPolling.ts` é testável porque só importa `react`).
- **Fix:** helpers puros movidos para `decision.ts` (sem RN); `DecisionBar.tsx` importa e re-exporta (`export { decisionLabel, ... } from './decision'`); teste importa do puro + asserta wiring do componente por leitura de fonte (molde `projects-ui.test.ts`), sem rede.
- **Files modified:** `apps/lab/src/results/decision.ts` (novo, extra ao plano), `apps/lab/src/results/DecisionBar.tsx`, `apps/lab/src/results/__tests__/decisionBar.test.ts`
- **Verification:** `vitest run src/results/__tests__/decisionBar.test.ts` 11/11; suite cheia 72/72.
- **Committed in:** `62b9f47` (part of task commit)

**2. [Rule 1 - Bug] Narrowing de `string | null` perdido no closure do `onPress`**
- **Found during:** task 2 (typecheck após criar `DedupGroupSection.tsx`: `TS2345 string | null → string` em 2 linhas do `Linking.openURL`)
- **Issue:** `isHttpsUrl(member.originUrl)` estreita no branch, mas o `onPress={() => ...}` cria closure — o narrowing da propriedade não persiste no closure.
- **Fix:** locais `httpsOrigin`/`rawOrigin`/`httpsSource`/`rawSource` (`isHttpsUrl(...) ? ... : null`) antes do JSX; `openURL` recebe `string` já estreitado por `!== null`; sem `as any` (só narrowing + ternário).
- **Files modified:** `apps/lab/src/results/DedupGroupSection.tsx`
- **Verification:** `tsc --noEmit` verde após o fix.
- **Committed in:** `28c3cff` (part of task commit)

**3. [Rule 2 - Missing Critical] `ResultCard.tsx` precisou de segunda edição na task 2**
- **Found during:** task 2 (integração da seção — `files` da task 2 não listava `ResultCard.tsx`, mas o `action` exige `ResultCard repassa a DecisionBar+DedupGroupSection`)
- **Issue:** sem embutir `<DedupGroupSection/>` no card, a seção existiria mas nunca montaria (grupo expansível morto; UI-18 não entregue).
- **Fix:** `ResultCard` passa a receber `resultCache` (obrigatório) e monta a seção só quando `originCount>1`; `results.tsx` repassa `resultCache` + `onGroupUpdated` aos dois controles.
- **Files modified:** `apps/lab/src/results/ResultCard.tsx`, `apps/lab/app/project/[id]/results.tsx`
- **Verification:** `grep -c "DecisionBar\|DedupGroupSection" ResultCard` 6; `tsc` + suite verdes.
- **Committed in:** `28c3cff` (part of task commit)

**4. [Rule 3 - Blocking] Comando de lint do plano com paths errados sob `--filter`**
- **Found during:** task 2 (verify do plano)
- **Issue:** `pnpm --filter @uhhu/lab exec eslint apps/lab/...` falha com "No files matching" — sob `--filter` o cwd é `apps/lab` (mesmo desvio da 08-02).
- **Fix:** mesmo comando com paths relativos ao app (`src/results/...`, `app/...`); cobertura idêntica, exit 0.
- **Files modified:** nenhum (só invocação)
- **Verification:** eslint exit 0 nos 6 arquivos do plano.
- **Committed in:** n/a (verificação)

---

**Total deviations:** 4 auto-fixed (1 bug, 1 missing critical, 2 blocking)
**Impact on plan:** Todos necessários para gates verdes/entrega real (helpers testáveis, typecheck, montagem da seção). Sem scope creep — nenhum comportamento além do plano; `decision.ts` é extra estrutural documentado acima.

## Issues Encountered

- Nenhum bloqueio real: rotas `PUT decision/divergence` + `getResult` da 08-01 conferiram 1:1 com `labApi` (o alerta do plano sobre `PATCH results/:id/decision` e `duplicate-divergence` inexistentes se confirmou — nenhum dos dois literais aparece no diff).
- `pnpm audit`/Gitleaks/SAST sem execução local (sem binário, como nos planos 06/07/08-02 — CI cobre); nenhuma dependência nova neste plano.

## Verification Evidence

- `tsc --noEmit` (`apps/lab`): verde (após fix do closure `Linking`)
- eslint (6 arquivos, paths relativos ao app): exit 0; zero `any` (grep gate 0 nos 6)
- vitest `@uhhu/lab`: **72/72** (61 prévios + 11 novos de decisão), tripwire scroll-containers intacto (não toca nas telas listadas)
- Gates do plano task 1: `setGroupDecision` 2; `PATCH.*decision|results/.*decision` 0; `não triado|decidido em` 2; `DecisionBar` no card 3; `any` 0
- Gates do plano task 2: `getResult|setDivergence` 4; `★ versão mais completa|origens ▸|origens ▾` 5; `groupOverrides` na tela 6; `duplicate-divergence` 0+0; `any` 0
- Auditoria adversarial do diff (IDOR/input/segredos/XSS/SSRF/isolamento): 0 crit/0 high — groupId só do DTO, card null sem ação, nota bloqueia `<>` + `Text` escapa, links só-https, membros só do grupo uma vez via cache, erro isolado por grupo com retry, `decidedAt` exibido + `requestId` em erro
- Fluxo manual (código, tablet segue na 08-04/UAT): toque elegível → destaca + `decidido em`; outro toque reverte sem confirmar; expandir mostra origens/links/diferenças/canônica; anotar divergência aparece sem mudar decisão; single sem botão; erro de rede dá retry local sem travar lista
- curl servidor (08-01 já provado, sem re-execução aqui): decisão/divergência com id alheio → 404 owner-scoped; nota com HTML → salva sem tags (client também bloqueia)

## Known Stubs

Nenhum stub funcional. Os dois únicos `placeholder=` no diff são props legítimas de UX (`placeholder="nota da divergência"` no form de divergência, `placeholder="todos"` no filtro de ano herdado da 08-02) — dicas de input, não dados mockados. Sem TODO/FIXME, sem `.map` em lista, sem `Math.random`/`eval`, sem storage de privilégio.

## Threat Flags

Nenhuma superfície nova além do `<threat_model>` do plano: `Linking.openURL` só-https com fallback texto (T-08-03-02), PUTs por `groupId` do DTO com card null desabilitado (T-08-03-01), `getResult` só de `memberIds` uma vez via cache (T-08-03-04 com erro isolado), `decidedAt` + `requestId` visíveis (T-08-03-05). Sem endpoint novo, sem WebView, sem segredo no bundle.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 08-04 desbloqueado: `groupOverrides` + `onGroupUpdated` + `resultCache` já fluem `tela → ResultCard → DecisionBar/DedupGroupSection`; tags (autocomplete + modal) e ficha sob demanda acoplam no mesmo mapa sem reescrever a lista; `attachTag`/`detachTag`/`listProjectTags`/`getResult` já prontos no client.
- REQUIREMENTS.md: UI-18/UI-19 prontos para marcar (este plano); UI-20/UI-22 seguem para 08-04; UI-23+ para a fase 9.
- Risco residual (baixo, fora de escopo): re-teste humano tablet do fluxo completo (decidir/reverter/expandir/anotar/single/retry) entra na UAT da fase 8.

---

*Phase: 08-resultados-triagem*
*Completed: 2026-09-12*

## Self-Check: PASSED

- Arquivos: `apps/lab/src/results/DecisionBar.tsx`, `apps/lab/src/results/decision.ts`, `apps/lab/src/results/DedupGroupSection.tsx`, `apps/lab/src/results/__tests__/decisionBar.test.ts`, `apps/lab/src/results/ResultCard.tsx`, `apps/lab/app/project/[id]/results.tsx` — todos FOUND
- Commits: `62b9f47` FOUND, `28c3cff` FOUND (`git log --oneline` confirma ambos sobre `7301daf`)
