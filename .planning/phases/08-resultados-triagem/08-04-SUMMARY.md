---
phase: 08-resultados-triagem
plan: "04"
subsystem: ui
tags: [expo, react-native, vitest, lab, triagem, tags, autocomplete, ficha]
requires:
  - phase: 08-resultados-triagem plan 03
    provides: DecisionBar/group patterns + groupOverrides/resultCache reutilizáveis
  - phase: 08-resultados-triagem plan 02
    provides: ResultCard/results list + labApi tag/decision/divergence/getResult
  - phase: 08-resultados-triagem plan 01
    provides: tag rename/delete endpoints + defaults seed-if-empty
provides:
  - TagInput com autocomplete (defaults primeiro) + criar-e-associar no card/ficha
  - TagManagerModal (criar/renomear/excluir) sem sair da triagem + refresh canônico
  - ficha dedicada sob demanda com skeleton/retry + decisão/tags ali
affects: [09-corpus, lab-ui]
tech-stack:
  added: []
  patterns: [helpers puros com re-export para vitest isolation, groupOverrides canônico descartado pós-PUT, detach 204 sintetizado, cache local de 1 na ficha]
key-files:
  created:
    - apps/lab/src/results/tags.ts
    - apps/lab/src/results/TagInput.tsx
    - apps/lab/src/results/TagManagerModal.tsx
    - apps/lab/src/results/__tests__/tagInput.test.ts
    - apps/lab/app/project/[id]/result.tsx
  modified:
    - apps/lab/src/results/ResultCard.tsx
    - apps/lab/app/project/[id]/results.tsx
    - apps/lab/app/_layout.tsx
key-decisions:
  - "tags.ts puro com re-export no TagInput: vitest node não importa react-native/expo-router"
  - "refreshGroups canônico: descarta overrides + list.refresh (servidor pós-PUT é verdade)"
  - "detach 204 sintetiza grupo sem a tag para o mapa (decisão/divergências por spread)"
  - "ficha com overrides locais de 1 grupo + resultCache de 1 (mesmo mapa da 08-03)"
requirements-completed: [UI-20, UI-22]
duration: ~7min
completed: 2026-09-12
---

# Phase 8 Plan 04: Tags autocomplete + gestão + ficha sob demanda Summary

**Autocomplete com defaults canônicos + criar-na-hora e chips com × por grupo, modal de gestão (criar/renomear com 400 verbatim/excluir two-tap) com refresh canônico sem refetch manual, e ficha dedicada com busca fresca + skeleton/retry + decisão e tags ali**

> Escopo: slice UI de UI-20/UI-22 (D-18/D-19/D-20/D-21). Fecha a fase 8: completa o card da 08-02/08-03 e entrega a tela dedicada, consumindo o client da 08-02 e o mapa de overrides da 08-03. Os requisitos UI-20/UI-22 concluem nesta UI (servidor veio da 08-01).

## Performance

- **Duration:** ~7 min
- **Started:** 2026-09-12T20:53:21Z
- **Completed:** 2026-09-12T21:00:23Z
- **Tasks:** 3
- **Files modified:** 8 (5 criados, 3 modificados)

## Accomplishments

- `TagInput` no card/ficha: chips das `group.tags` com `×` (detach com busy por chip, 204 sintetizado sem a tag), input com sugestões `suggestTags` (defaults `incluir, excluir, duplicado, indisponível, revisar` primeiro na ordem canônica, depois alfabética pt-BR, prefixo case-insensitive, teto 8), submit com `resolveTagAction` (match exato → `attachTag`; senão valida vazio/101+ sem request → `createProjectTag` + `attachTag` da criada, erro da 2ª mantém a criada em `localTags` para retry virar attach); ApiError verbatim inline; group null → disabled + `grupo indisponível`
- Helpers puros `suggestTags`/`resolveTagAction` em definição única (`tags.ts`, re-exportados pelo `TagInput`) + 10 testes verdes sem rede (defaults primeiro, prefixo filtra, alfabética, teto 8, case-insensitive, attach/create/invalid)
- `TagManagerModal` sem sair da triagem (molde ProjectModal): FlatList com keyExtractor id (sem `.map`), linhas editáveis (TextInput + [Salvar] com no-op sem mudança e validação local sem request + [Excluir] two-tap → [Confirmar?]), rodapé criar (nome + cor opcional ≤20 texto livre, sem color-picker), rename 400 → verbatim na linha, qualquer mutação → `onTagsChanged` + lista local atualizada; fechar (X/voltar) também notifica quando houve mutação (refresh idempotente)
- `results.tsx` com botão `[Tags]` no header abrindo o modal + `refreshGroups()` canônico (descarta `groupOverrides` + `list.refresh()` — o hook refaz `listGroups` até esgotar cursor, rebuild do índice e `listProjectTags`; decisões/tags/divergências já persistidas via PUT voltam frescas, sem reaplicar mapa) + `projectTags={list.tags}` repassado ao card
- Ficha dedicada `project/[id]/result?resultId=<uuid>` (NUNCA modal): uuid inválido → `Ficha inválida` + Voltar sem request; válido → busca FRESCA `getResult` ao montar + `listGroups` por memberIds + `listProjectTags`, skeleton até resolver, erro verbatim + [repetir]; corpo completo (título, autores, ano ou 'ano desconhecido', tipo label, instituição/programa, abstract verbatim ou "sem resumo", originUrl/sourceUrl só-https tocáveis com fallback texto, proveniência formatProvenance, badge NOVO) + `DecisionBar` + `TagInput` + `DedupGroupSection` com cache local de 1 quando multi-origem; 401 → expired+next da ficha; ScrollView raiz; Stack `project/[id]/result` title 'Ficha' após results; link `ver ficha →` confirmado no formato canônico

## Task Commits

Each task was committed atomically:

1. **task 1: TagInput no card + testes** - `44443b3` (feat)
2. **task 2: modal de gestão de tags + montagem na tela** - `143a3a1` (feat)
3. **task 3: ficha dedicada sob demanda** - `223d68e` (feat)

**Plan metadata:** (este SUMMARY + STATE/ROADMAP, commit final abaixo)

## Files Created/Modified

- `apps/lab/src/results/tags.ts` - helpers puros `DEFAULT_TAG_ORDER`/`suggestTags`/`resolveTagAction`/`TagAction` em definição única (extra fora do plano, ver desvios)
- `apps/lab/src/results/TagInput.tsx` - autocomplete + criar-e-associar + chips × (attach/detach/create, verbatim, 401, null degradado; re-exporta helpers)
- `apps/lab/src/results/__tests__/tagInput.test.ts` - 10 testes puros (suggest 4 + resolve 4 + wiring 2 por leitura de fonte, sem rede/RN)
- `apps/lab/src/results/TagManagerModal.tsx` - modal de gestão (FlatList, rename 400 na linha, delete two-tap, criar com cor texto, dirty+refresh idempotente)
- `apps/lab/app/project/[id]/result.tsx` - ficha sob demanda (getResult fresco + grupo por memberIds + overrides locais + skeleton/retry + links só-https + NOVO)
- `apps/lab/src/results/ResultCard.tsx` - embute `TagInput` abaixo da `DecisionBar` (projectTags opcional com default [] para task1 verde) + literal canônico da ficha
- `apps/lab/app/project/[id]/results.tsx` - botão `[Tags]` + `TagManagerModal` + `refreshGroups` canônico documentado + `projectTags` no card
- `apps/lab/app/_layout.tsx` - `Stack.Screen project/[id]/result` title 'Ficha' após results

## Decisions Made

- `tags.ts` puro com re-export no `TagInput`: vitest node quebra ao importar `react-native`/`expo-router` (`TS2307`/SyntaxError — precedente `decision.ts` da 08-03); definição única continua no puro, o componente re-exporta para o contrato `suggestTags`/`resolveTagAction` seguir válido.
- `refreshGroups` canônico (descarta mapa + `list.refresh()`): decisões/tags/divergências vivem no DTO e já foram persistidas via PUT — o GET fresco do hook (que pagina `listGroups` até `hasMore` false + refaz `listProjectTags`) é a verdade; reaplicar overrides seria divergir do servidor (T-08-04-03). Documentado em comentário na tela e neste SUMMARY.
- `detachTag` 204 sintetiza `{...group, tags: sem-a-tag}` para o mapa: o servidor não devolve corpo no detach — o spread preserva decisão/divergências/decidedAt sem refetch (mesma regra do mapa da 08-03).
- Ficha com `groupOverrides` local de 1 grupo + `resultCache` de 1 (o próprio `getResult`): decisão/tags/divergência atualizam sem refetch na ficha, sem tocar `useResultsList`/`triage` (donos 08-02); membros multi-origem ausentes buscam via `getResult` sob demanda no expandir (sem N+1 na lista — a ficha é single).
- `projectTags` opcional no card na task 1 (default `[]`): `results.tsx` só passa as tags reais na task 2 — sem isto a task 1 quebraria o typecheck intermediário; estado final repassa `list.tags` sempre.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest não importa componente com react-native/expo-router**
- **Found during:** task 1 (padrão já provado na 08-03 — teste importaria `TagInput.tsx` com RN)
- **Issue:** `suggestTags`/`resolveTagAction` em `TagInput.tsx` puxariam `react-native` + `expo-router` no vitest node.
- **Fix:** helpers puros em `tags.ts` (sem RN); `TagInput.tsx` importa e re-exporta; teste importa do puro + asserta wiring por leitura de fonte (molde `decisionBar.test.ts`), sem rede.
- **Files modified:** `apps/lab/src/results/tags.ts` (novo, extra ao plano), `apps/lab/src/results/TagInput.tsx`, `apps/lab/src/results/__tests__/tagInput.test.ts`
- **Verification:** `vitest run src/results/__tests__/tagInput.test.ts` 10/10; suite cheia 82/82.
- **Committed in:** `44443b3` (part of task commit)

**2. [Rule 1 - Bug] Import de teste com path errado (`../api/lab`)**
- **Found during:** task 1 (typecheck após criar teste: `TS2307 Cannot find module '../api/lab'`)
- **Issue:** `__tests__/` está dois níveis abaixo de `src/` — o correto é `../../api/lab`.
- **Fix:** path corrigido para `../../api/lab`; sem mudar runtime.
- **Files modified:** `apps/lab/src/results/__tests__/tagInput.test.ts`
- **Verification:** `tsc --noEmit` verde após o fix.
- **Committed in:** `44443b3` (part of task commit)

**3. [Rule 1 - Bug] Imports de UI com path errado no modal (`./ErrorBanner`)**
- **Found during:** task 2 (typecheck após criar `TagManagerModal.tsx`: `TS2307 ./ErrorBanner`)
- **Issue:** `ErrorBanner`/`Skeleton` vivem em `src/ui/`, não em `src/results/`.
- **Fix:** imports para `../ui/ErrorBanner` + `../ui/Skeleton`; sem mudar runtime.
- **Files modified:** `apps/lab/src/results/TagManagerModal.tsx`
- **Verification:** `tsc --noEmit` verde após o fix.
- **Committed in:** `143a3a1` (part of task commit)

**4. [Rule 1 - Bug] Narrowing `string | null` perdido + `TS7022` no ternário de groups (ficha)**
- **Found during:** task 3 (typecheck após criar `result.tsx`: `TS7022 'page' implicitly has type 'any'`)
- **Issue:** `const page = cond ? await listGroups(...) : await listGroups(...)` — o tsc infere `any` indireto no inicializador (mesmo desvio da 08-02 em `useResultsList.ts`).
- **Fix:** tipo explícito `{ items: DedupGroupDTO[]; page: PageInfo }` + `import type { PageInfo }`; sem mudar runtime.
- **Files modified:** `apps/lab/app/project/[id]/result.tsx`
- **Verification:** `tsc --noEmit` verde após o fix.
- **Committed in:** `223d68e` (part of task commit)

**5. [Rule 3 - Blocking] `eslint-disable` para regra inexistente quebra o lint**
- **Found during:** task 2 (verify do plano: `Definition for rule 'react-hooks/exhaustive-deps' was not found`)
- **Issue:** plugin `react-hooks` não instalado no app — o disable adicionado no `useEffect` do modal virou erro.
- **Fix:** removido o disable; deps `[visible, projectId]` sem warning (sem plugin); sem mudar runtime.
- **Files modified:** `apps/lab/src/results/TagManagerModal.tsx`
- **Verification:** eslint exit 0 nos 7 arquivos do plano.
- **Committed in:** `143a3a1` (part of task commit)

---

**Total deviations:** 5 auto-fixed (3 bugs, 2 blocking)
**Impact on plan:** Todos necessários para gates verdes/entrega real (helpers testáveis, typecheck, lint). Sem scope creep — nenhum comportamento além do plano; `tags.ts` é extra estrutural documentado acima.

## Issues Encountered

- Nenhum bloqueio real: rotas `attach/detach/tags CRUD/getResult/listGroups` da 08-01/08-02 conferiram 1:1 com `labApi` (nenhum literal stale encontrado).
- `pnpm audit`/Gitleaks/SAST sem execução local (sem binário, como nos planos 06/07/08-02/08-03 — CI cobre); nenhuma dependência nova neste plano.

## Verification Evidence

- `tsc --noEmit` (`apps/lab`): verde (após fixes TS2307/TS7022)
- eslint (7 arquivos, paths relativos ao app sob `--filter`): exit 0; zero `any` (grep gate 0 nos 8)
- vitest `@uhhu/lab`: **82/82** (72 prévios + 10 novos de tags), tripwire scroll-containers intacto
- Gates do plano task 1: `attachTag|detachTag|createProjectTag` 9; `suggestTags|resolveTagAction` 5+17; `TagInput` no card 3; `any` 0
- Gates do plano task 2: `rename|delete|createProjectTag` 6; `FlatList` 3; `TagManagerModal|refreshGroups` 6; `any` 0
- Gates do plano task 3: `getResult` 2; `Skeleton` 4; `DecisionBar|TagInput` 6; `project/[id]/result` 2+1; `any` 0
- Auditoria adversarial do diff (IDOR/input/segredos/XSS/SSRF/isolamento): 0 crit/0 high — resultId uuid-validado sem request quando inválido, 404/401 sem oráculo (401 → expired+next interno), grupo só por memberIds do DTO, tag nome 1..100 + cor ≤20 só-texto nunca-estilo, `Text` escapa + sem WebView, links só-https com fallback texto, sugestões cap 8 local + criar exige submit, erro verbatim com requestId sem segredo, nenhum `Math.random`/`eval`/`localStorage`
- Fluxo manual (código, tablet segue na UAT da fase 8): prefixo sugere defaults na ordem; inexistente cria e associa (retry mantém criada); chips × removem por grupo; modal cria/renomeia (400 na linha)/exclui two-tap e reflete nos cards+filtros via refresh canônico; ficha abre do card com skeleton, decide e tagueia ali, retry funciona

## Known Stubs

Nenhum stub funcional. Os únicos `placeholder=` no diff são props legítimas de UX (`"adicionar tag"`, `"nome da tag"`, `"cor opcional (ex. vermelho)"`, `"todos"` herdado) — dicas de input, não dados mockados. Sem TODO/FIXME, sem `.map` em lista nos fontes (for-loops + FlatList), sem `Math.random`/`eval`, sem storage de privilégio.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Fase 8 FECHADA 4/4: UI-17/18/19/20/21/22 entregues (lista infinita + cards/NOVO + decisão mutável + grupo expansível/divergência + tags autocomplete/modal + ficha sob demanda); `groupOverrides`/`resultCache`/`refreshGroups` documentados como contrato para a fase 9.
- REQUIREMENTS.md: UI-20/UI-22 prontos para marcar (este plano); UI-23+ para a fase 9 (corpus como view derivada dos elegíveis — tags/decisões deste plano alimentam os filtros).
- Risco residual (baixo, fora de escopo): re-teste humano tablet do fluxo completo (autocomplete/criar/modal/ficha/retry com rede cortada + `<img>` virando texto no chip e na ficha) entra na UAT da fase 8.

---

*Phase: 08-resultados-triagem*
*Completed: 2026-09-12*

## Self-Check: PASSED

- Arquivos: `apps/lab/src/results/tags.ts`, `apps/lab/src/results/TagInput.tsx`, `apps/lab/src/results/__tests__/tagInput.test.ts`, `apps/lab/src/results/TagManagerModal.tsx`, `apps/lab/app/project/[id]/result.tsx`, `apps/lab/src/results/ResultCard.tsx`, `apps/lab/app/project/[id]/results.tsx`, `apps/lab/app/_layout.tsx` — todos FOUND
- Commits: `44443b3` FOUND, `143a3a1` FOUND, `223d68e` FOUND (`git log --oneline` confirma os três sobre `66f7d46`)
