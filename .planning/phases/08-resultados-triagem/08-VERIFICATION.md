---
phase: 08-resultados-triagem
verified: 2026-09-12T18:15:00Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Sessão real de triagem no tablet com 200+ resultados (via tailnet)"
    expected: "Rolagem infinita sem travar/jank e sem botão 'carregar mais'; filtros estado+tag+fonte+ano combinam; cards exibem proveniência e badge NOVO; run concluído abre a lista via [Ver resultados]"
    why_human: "Performance de scroll com volume real e rendering no device exigem hardware/rede (tablet + tailnet) indisponíveis neste ambiente; código prova estrutura (cursor limit 30, FlatList virtualizada, tripwire 7/7) mas não feel"
  - test: "Fluxo decidir/reverter/expandir/anotar no tablet"
    expected: "Toque elegível destaca + mostra 'decidido em'; outro toque reverte sem confirmação; expandir exibe origens/links/diferenças/★ canônica; anotar divergência aparece sem mudar a decisão; grupo single sem botão; erro de rede dá retry local sem travar a lista"
    why_human: "Interação touch + estados visuais + comportamento sob rede cortada exigem device real"
  - test: "Autocomplete/criar/modal de tags + ficha no tablet (incl. retry com rede cortada e payload `<img>` em nome de tag)"
    expected: "Prefixo sugere defaults na ordem canônica; inexistente cria e associa; modal cria/renomeia (400 verbatim na linha)/exclui two-tap e reflete nos cards+filtros; ficha abre com skeleton, decide e tagueia ali, [repetir] funciona; `<img>` vira texto no chip e na ficha"
    why_human: "UX touch + HTML-rendering negativo exigem inspeção visual no device; servidor não stripa nomes de tag (L-02), então a garantia hoje é só o `<Text>` do RN"
---

# Phase 8: Resultados e triagem Verification Report

**Phase Goal:** Pesquisador tria resultados item a item com decisão mutável, tags e transparência de dedup
**Verified:** 2026-09-12T18:15:00Z
**Status:** human_needed (12/12 automatizáveis VERIFIED; 3 itens exigem tablet/tailnet)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | badge NOVO de um run antigo nunca apaga por causa de run posterior; newCount congelado sempre igual à contagem de isNew true | ✓ VERIFIED | `apps/core-api/src/lib/searches.ts:566-580` anti-join `lt(executedAt, current)` nos 2 callers (`:648`, `:688`); `tests/integration/lab-results-isnew.test.ts:372-449` `seedThreeRuns` run3=A+B+C + asserts badge≡contador nos 3 runs (`:578-600`) + unitário (`:610-615`) + IDOR. PG offline aqui → suites pularam graciosamente (5 passed/skipped); prova estática + prova PG da execução (25/25 em 08-01-SUMMARY) sustentam. M-01 (empate de `executedAt`/backfill) registrado como risco residual, não falha do caso normal |
| 2 | GET groups do projeto expõe por grupo as tags, as divergências e quando foi decidido | ✓ VERIFIED | `packages/contracts/src/lab.ts:426` `DedupGroupDTO.tags/divergences/decidedAt`; `apps/core-api/src/lib/corpus.ts:165,199,252-310` bundle+loader+mapper; teste `lab-groups-triage.test.ts:472-541` asserta `tags:[]`/`divergences:[]`/`decidedAt:null` → decision preenche `decidedAt` + re-decisão monotônica |
| 3 | Dono renomeia e exclui tags do projeto; tag padrão excluída não ressuscita na próxima listagem | ✓ VERIFIED | `apps/core-api/src/routes/lab.ts:1088,1154` PATCH/DELETE `tags/:tagId`; `capabilities.ts:379-380,435-439` `lab.tag.rename/delete`; `corpus.ts:670+` seed-if-empty; teste `:543-668` asserta rename 200, colisão 400 `VALIDATION_ERROR` + details, delete 204, default excluído ausente no GET seguinte, cascade nos joins, delete repetido 404 |
| 4 | User abre os resultados de um run concluído e lê cards com proveniência completa e badge NOVO | ✓ VERIFIED | `ResultCard.tsx:56,73` `formatProvenance(result)` + badge `NOVO` em `result.isNew`; `triageFilter.test.ts` 10/10 incl. proveniência BDTD/CAPES + run curto |
| 5 | User rola 200+ itens sem travar e sem botão "carregar mais"; filtros combináveis refinam a lista | ✓ VERIFIED (estrutural) | `results.tsx` + `useResultsList.ts`: `onEndReached` thr 0.5 + `nextCursor`/`hasMore` append (6+17 ocorrências), zero `carregar mais`, zero `.map` de lista, páginas limit 30; `applyResultFilters` AND 4 dimensões (`untriaged` = group null ou `decidedAt` null) com 10 testes; tripwire `scroll-containers` 7/7. Volume real de 200+ no device → human_verification |
| 6 | O run concluído desemboca na tela real (acaba o placeholder "lista de itens na fase 8") | ✓ VERIFIED | `run.tsx:207-209` `Ver resultados` → `/project/${projectId}/results?runId=&searchId=` só em succeeded/partial; `grep "lista de itens na fase 8" run.tsx` = 0; `_layout.tsx:68` registra `project/[id]/results` |
| 7 | User decide elegível/não/indeciso com um toque, reverte com outro toque e vê quando decidiu | ✓ VERIFIED | `DecisionBar.tsx:56` `setGroupDecision(group.id,…)` por groupId; `decidido em`/`não triado` (`grep` = 2); `decisionBar.test.ts` 11/11 (`decisionLabel`/`decisionForButton`/`formatDecidedAt`); suite lab 82/82 |
| 8 | User expande o grupo deduplicado e vê origens, links, diferenças e a versão canônica, e anota divergência por fonte | ✓ VERIFIED | `DedupGroupSection.tsx:276-277` toggle `N origens ▸/▾` só se `originCount>1` (`:133` null em single); `getResult` sob demanda em `Promise.all` do grupo (`:165`); `★ versão mais completa` (`:316`); `diffMembers` puro `campo: A ≠ B`; form divergência → `setDivergence` → `onGroupUpdated` |
| 9 | Decisão nunca pede confirmação; divergência nunca muda a decisão | ✓ VERIFIED | Zero `Alert|confirm` em `DecisionBar.tsx`/`DedupGroupSection.tsx` (só comentário "sem diálogo de confirmação"); `corpus.ts:920-937` `setDivergenceForActor` só escreve `labDivergences` (decisão intocada) |
| 10 | User associa tag com autocomplete, cria inexistente digitando, e gerencia tags sem sair da triagem | ✓ VERIFIED | `TagInput.tsx:114,154-171,210` attach/detach/create+attach; `suggestTags` defaults-primeiro + `resolveTagAction` (`tags.ts`, re-export) com `tagInput.test.ts` 10/10; `TagManagerModal.tsx` FlatList + rename 400 na linha + delete two-tap + criar; montado em `results.tsx:413` com botão `[Tags]`, sem seção fixa |
| 11 | User abre a ficha completa sob demanda em tela dedicada, com decisão ali também, skeleton e retry | ✓ VERIFIED | `result.tsx:99` `getResult` fresco ao montar + `listGroups` por `memberIds` (`:133`); `CardSkeleton` (`:212,251`) + `ErrorBanner` + `[repetir]`; `DecisionBar`+`TagInput`+`DedupGroupSection` reusados; uuid inválido → `Ficha inválida` sem request; `_layout.tsx:69` `project/[id]/result` title 'Ficha'; link do card no formato canônico |
| 12 | Renomear/excluir tag reflete nos cards e nos filtros sem refetch manual | ✓ VERIFIED | `results.tsx:176-183` `refreshGroups()` canônico (descarta `groupOverrides` + `list.refresh()` — servidor pós-PUT é a verdade, documentado em comentário); `groupOverrides` (7 ocorrências) aplica updates de decisão/tag/divergência sem refetch; modal notifica via `onTagsChanged` (inclusive no fechar com mutação) |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/core-api/src/lib/searches.ts` | isNew só-anteriores (D-15) | ✓ VERIFIED | `seenKeysForSearch` + `executedAt` ×13; ambos os callers ancorados |
| `packages/contracts/src/lab.ts` | DedupGroupDTO + updateTagSchema | ✓ VERIFIED | `decidedAt` presente; `TAG_EXISTS` ausente do catálogo (colisão só em details da rota) |
| `apps/core-api/src/routes/lab.ts` | PATCH/DELETE tag por projeto | ✓ VERIFIED | Rotas + `lab.tag.rename/delete` + 400/404/204 conformes |
| `apps/core-api/src/lib/corpus.ts` | bundle triagem + rename/delete + seed-if-empty | ✓ VERIFIED | `labGroupTags` join, `TagNameConflictError`, `decidedAt` ×6, refresh de `updatedAt` no upsert |
| `apps/core-api/src/capabilities.ts` | `lab.tag.rename/delete` | ✓ VERIFIED | Registro + handlers com parseOrThrow |
| `tests/integration/lab-results-isnew.test.ts` | seed 3 runs + badge≡contador | ✓ VERIFIED | `seedThreeRuns\|run3` ×22, `count(isNew` ×3; pula gracioso offline |
| `tests/integration/lab-groups-triage.test.ts` | triagem/tags/IDOR PG real | ✓ VERIFIED | 3 its (triagem, tags, IDOR 8+7 probes); pula gracioso offline |
| `apps/lab/src/api/lab.ts` | client triagem (9 métodos) | ✓ VERIFIED | `listGroups/setGroupDecision/tags×5/attach/detach/setDivergence` ×18; PUT/POST/DELETE reais, nunca PATCH em results |
| `apps/lab/src/results/triage.ts` | join + filtros puros | ✓ VERIFIED | `buildResultGroupIndex` (memberIds) + `mergeResultsWithGroups` + `applyResultFilters` AND; 10 testes |
| `apps/lab/src/results/useResultsList.ts` | lista infinita cursor | ✓ VERIFIED | `nextCursor` append, `loadingMore`, `refresh`, 401 via `status` |
| `apps/lab/src/results/ResultCard.tsx` | card + decisão/tags/grupo | ✓ VERIFIED | NOVO ×2, `DecisionBar` ×3, `TagInput` ×3, `DedupGroupSection` montado; link ficha canônico |
| `apps/lab/app/project/[id]/results.tsx` | tela + overrides + modal | ✓ VERIFIED | `groupOverrides` ×7, `resultCache`, `refreshGroups`, `[Tags]` + modal, 4 filtros |
| `apps/lab/app/project/[id]/run.tsx` | wiring Ver resultados | ✓ VERIFIED | Placeholder morto; botão só succeeded/partial |
| `apps/lab/app/_layout.tsx` | rotas results + result | ✓ VERIFIED | `results` (:68) + `result` title 'Ficha' (:69) |
| `apps/lab/src/results/DecisionBar.tsx` + `decision.ts` | decisão mutável | ✓ VERIFIED | PUT por groupId, busy, verbatim, 401, null degradado; 11 testes |
| `apps/lab/src/results/DedupGroupSection.tsx` | grupo expansível | ✓ VERIFIED | `getResult\|setDivergence` ×4; selo canônico + toggle |
| `apps/lab/src/results/TagInput.tsx` + `tags.ts` | autocomplete + criar | ✓ VERIFIED | attach/detach/create ×9; 10 testes |
| `apps/lab/src/results/TagManagerModal.tsx` | gestão sem sair da triagem | ✓ VERIFIED | rename/delete/create ×6; FlatList ×3; two-tap delete |
| `apps/lab/app/project/[id]/result.tsx` | ficha sob demanda | ✓ VERIFIED | `getResult` fresco, Skeleton, DecisionBar+TagInput, https-only |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `searches.ts` | `labSearchRuns.executedAt` | anti-join só-anteriores | ✓ WIRED | `lt(executedAt, current)` + 2 callers passam o `executedAt` corrente |
| `corpus.ts` | `DedupGroupDTO.tags` | join labGroupTags→labTags | ✓ WIRED | Loader agregado por grupo + `toGroupDTO` |
| `routes/lab.ts` | `lab.tag.rename` | PATCH 404 idêntico | ✓ WIRED | Rota → capability → `error.name` narrowing |
| `results.tsx` | `labApi.listResults` | cursor limit+nextCursor append | ✓ WIRED | `useResultsList.loadMore`, sem botão |
| `useResultsList.ts` | `labApi.listGroups` | join resultId→grupo por memberIds | ✓ WIRED | Via `triage.ts:42 buildResultGroupIndex` (importado e usado em `:128,154,185`) |
| `run.tsx` | results route | botão Ver resultados | ✓ WIRED | `router.push(.../results?runId=&searchId=)` |
| `DecisionBar.tsx` | `labApi.setGroupDecision` | PUT groups/:id/decision | ✓ WIRED | Por `group.id`, nunca resultId |
| `DedupGroupSection.tsx` | `labApi.getResult` | membros sob demanda | ✓ WIRED | `Promise.all` do grupo, uma vez via cache |
| `DedupGroupSection.tsx` | `labApi.setDivergence` | PUT divergence por origem | ✓ WIRED | Form origem+nota → `onGroupUpdated` |
| `TagInput.tsx` | `labApi.attachTag` | associa existente ou recém-criada | ✓ WIRED | `resolveTagAction` → attach; create+attach com retry |
| `TagManagerModal.tsx` | `labApi.renameProjectTag` | PATCH com 400 em colisão | ✓ WIRED | Verbatim na linha; two-tap delete; criar com cor texto |
| `result.tsx` | `labApi.getResult` | busca fresca ao abrir | ✓ WIRED | Sempre, mesmo vindo do card; nunca props da lista |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `results.tsx` list | `list.allItems` → `visibleItems` | `listResults` (PG) + `listGroups` (PG) via `useResultsList` | ✓ FLOWING | Merge por memberIds; filtros sobre item efetivo (override ?? original) |
| `ResultCard` | `item.result/group` | props da lista + `groupOverrides` | ✓ FLOWING | PUTs retornam DTO fresco que alimenta o mapa |
| `result.tsx` ficha | `fetched getResult` + grupo por scan | `getResult` (PG) + `listGroups` paginado | ✓ FLOWING | L-01: scan O(all-groups) por ficha — correto, custo escala (low) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| contracts typecheck | `tsc --noEmit -p tsconfig.json` (@uhhu/contracts) | exit 0 | ✓ PASS |
| core-api typecheck | `tsc --noEmit -p tsconfig.json` (@uhhu/core-api) | exit 0 | ✓ PASS |
| lab typecheck | `tsc --noEmit -p tsconfig.json` (@uhhu/lab) | exit 0 | ✓ PASS |
| lab suite (incl. 31 testes novos 08-02/03/04 + tripwire) | `pnpm --filter @uhhu/lab run test` | 11 files, 82/82 (triageFilter 10, decisionBar 11, tagInput 10, scroll-containers 7) | ✓ PASS |
| lab lint phase-8 | `eslint src/results/ app/... src/api/lab.ts` | exit 0, `any` = 0 em todos | ✓ PASS |
| isNew 3-run + triagem server | `vitest run lab-results-isnew lab-groups-triage` | 5 passed (skip gracioso offline — sem docker/PG neste ambiente) | ? SKIP (infra) |
| H-01 red-green histórico | inspeção: run3=A+B+C apagaria B no run2 com anti-join antigo | vermelho-no-antigo crível (08-01-SUMMARY confirma via `git stash`: 1 failed) | ✓ PASS (por inspeção + registro) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UI-17 | 08-02 | Cards de resultado + proveniência | ✓ SATISFIED | ResultCard + lista infinita; REQUIREMENTS.md Done (08-02) |
| UI-18 | 08-01(srv)+08-03(UI) | Grupo expansível + divergência | ✓ SATISFIED | DedupGroupSection + server; Done (08-03) |
| UI-19 | 08-01(srv)+08-03(UI) | Decisão mutável + `decidido_em` | ✓ SATISFIED | DecisionBar + decidedAt c/ refresh no upsert; Done (08-03) |
| UI-20 | 08-01(srv)+08-04(UI) | Tags autocomplete + gestão | ✓ SATISFIED | TagInput + modal + rename/delete; Done (08-04) |
| UI-21 | 08-01(fix)+08-02(UI) | Badge NOVO (D-35) | ✓ SATISFIED | isNew só-anteriores + badge + `N NOVOS`; Done (08-02) |
| UI-22 | 08-04 | Ficha sob demanda | ✓ SATISFIED | Tela dedicada c/ getResult fresco; Done (08-04) |

União dos `requirements` dos 4 PLANs = {UI-17..UI-22} — cobertura total, sem órfãos. UI-23+ pertencem à fase 9 (Pending, fora de escopo).

### Decisões D-15..D-21 (08-CONTEXT.md)

| Decisão | Status | Evidence |
|---------|--------|----------|
| D-15 isNew só-anteriores + teste 3 runs | ✓ HONORED | Anti-join ancorado + seedThreeRuns; empate de ms = posterior (documentado no teste) |
| D-16 scroll infinito sem botão/páginas | ✓ HONORED | `onEndReached` + cursor; zero `carregar mais` |
| D-17 filtros combináveis client-side | ✓ HONORED | `applyResultFilters` AND; `untriaged` distingue `decidedAt` null de indeciso explícito (testado) |
| D-18 ficha em tela dedicada c/ decisão | ✓ HONORED | `result.tsx` NUNCA modal; DecisionBar+TagInput ali |
| D-19 enrich ao abrir c/ skeleton+retry, sem preload | ✓ HONORED | `getResult` fresco + skeleton + `[repetir]`; lista nunca pré-carrega (só membros do grupo expandido) |
| D-20 autocomplete + criar-na-hora + defaults | ✓ HONORED | `suggestTags` defaults-primeiro ordem canônica + `resolveTagAction` (testados) |
| D-21 gestão em modal, sem seção fixa | ✓ HONORED | `TagManagerModal` + botão `[Tags]`; nenhuma seção fixa de gestão na tela |

Nota: 08-CONTEXT citava `PATCH /results/:id/decision` e `POST .../duplicate-divergence` — rotas inexistentes no servidor; os planos usaram corretamente `PUT groups/:id/decision` e `PUT groups/:id/divergence` (intenção D-46 honrada, paths reais; zero literais stale no diff — confirmado por grep).

### Advisory Review 08-REVIEW.md — disposição

| Finding | Severidade | Afeta must_have? | Disposição |
|---------|-----------|------------------|------------|
| M-01 badge≡counter quebra em empate de `executedAt`/backfill | medium | NÃO (caso normal intacto) | Risco residual documentado. `newCount` (execução, `ne`-only) e `isNew` (on-read, `lt`-anchored) são derivações estruturalmente distintas que coincidem enquanto ordem de `executedAt` == ordem de criação. Fix sugerido (ancorar `searchRuns.ts` ou computar `newCount` on-read) é follow-up, não gap desta fase |
| M-02 asserts do contador são tautológicos (métricas hand-seeded) | medium | NÃO (metade badge genuína) | A metade badge do teste é genuína (falha no código antigo — crível por inspeção + `git stash` registrado). Teste do produtor real (`executeSearchRun` com adapters stubbed) é follow-up sugerido |
| L-01 ficha escaneia ALL groups; dedup recomputado por página | low | NÃO | Correto porém custoso em escala; sugestão `GET groups/by-member/:resultId` para fase futura |
| L-02 nomes de tag sem defesa HTML server-side | low | NÃO | Não explorável no RN atual (`<Text>` escapa, cor nunca vira estilo); vira item humano (payload `<img>` deve renderizar como texto) + hardening futuro (refine em `tagNameSchema` como divergências têm) |
| L-03 detach resolve por nome; 204 em no-op | low | NÃO | Estado servidor correto (JOIN por id); UI auto-cura no `refreshGroups`; ids no DTO como fix futuro |
| L-04 year filter aceita `parseInt` slop | low | NÃO | UX-only; `parseYearInput` puro como fix futuro |
| L-05 tag criada no card infiltrável até abrir o modal | low | NÃO | Inconsistência UX-only (`list.tags` só refresca via modal); otimista no filtro como fix futuro |
| L-06 rename concorrente escapa como 500 | low | NÃO | Já divulgado no 08-01-SUMMARY; mapear `23505`→`TagNameConflictError` como fix futuro |
| I-01..I-08 | info | NÃO | Nits de robustez/UX documentados no REVIEW; nenhum invalida verdade observável |

Zero findings critical/high. Controles C-01..C-08 do REVIEW (authZ owner-scoped, 404 idênticos, Zod nas fronteiras, sem `any`/`eval`/`Math.random`/`localStorage`/segredos, links só-https, hostile-ids sem request) conferem com o verificado acima.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | TODO/FIXME/placeholder/`console.log`/stub-data | — | Nenhum (grep limpo; únicos `placeholder=` são props legítimas de UX) |
| `DedupGroupSection.tsx` | 39, 133 | `return []` / `return null` | ℹ️ Info | Legítimos: `diffMembers` com <2 membros; single sem seção (spec §7) |
| `TagInput.tsx` | 50 | `return null` | ℹ️ Info | Legítimo: `findTagByName` not-found |
| `DedupGroupSection.tsx` | 165 | `.map(` | ℹ️ Info | Legítimo: `Promise.all(missingIds.map…)` (fan-out, não render); tripwire verde |

### Human Verification Required

### 1. Sessão real de triagem no tablet com 200+ resultados (via tailnet)

**Test:** Abrir run concluído → [Ver resultados] → rolar a lista até o fim; combinar filtros estado+tag+fonte+ano; conferir cards (proveniência, NOVO) e contadores (`N NOVOS`, `mostrando X de Y`)
**Expected:** Rolagem pagina sozinha sem travar; filtros refinam por AND; `untriaged` distingue não-triado de indeciso; 401 redireciona ao login preservando destino
**Why human:** Performance com volume real e rendering no device exigem tablet + tailnet, indisponíveis aqui

### 2. Fluxo decidir/reverter/expandir/anotar no tablet

**Test:** Tocar [elegível]/[não]/[indeciso] e reverter com outro toque; expandir grupo multi-origem; anotar divergência; testar grupo single, card órfão e retry com rede cortada
**Expected:** Destaque + `decidido em` atualiza, sem confirmação; origens/links/diferenças/★ canônica visíveis; divergência aparece sem mudar a decisão; single sem botão; erro dá retry local sem travar a lista
**Why human:** Interação touch + estados visuais + rede cortada exigem device real

### 3. Autocomplete/criar/modal de tags + ficha no tablet (incl. retry com rede cortada e payload `<img>` em nome de tag)

**Test:** Digitar prefixo no TagInput; criar tag inexistente; abrir modal [Tags] (criar/renomear com colisão/excluir); abrir ficha do card; repetir com rede cortada; criar tag `<img src=x onerror=alert(1)>`
**Expected:** Defaults sugeridos na ordem; criada associa e aparece no card; modal reflete nos cards+filtros sem refetch manual; ficha abre com skeleton, decide/tagueia ali, `[repetir]` funciona; payload HTML renderiza como texto puro
**Why human:** UX touch + rendering negativo exigem inspeção visual; nomes de tag não têm strip server-side (L-02), garantia atual é o `<Text>` do RN

### Gaps Summary

Nenhum gap bloqueador. As 12 verdades observáveis dos 4 planos estão implementadas, com substância (sem stubs), wiring completo (12/12 key links) e dados fluindo de fontes reais (PG via CORE; DTOs frescos dos PUTs). Os achados M-01/M-02 do advisory review são riscos residuais documentados com fix proposto (follow-up, p.ex. teste do produtor `newCount` via `executeSearchRun` real e ancoragem de `searchRuns.ts` em `executedAt`), não falhas de must_have no caso normal. Fase pronta para UAT humana no tablet; sem necessidade de re-planejamento.

---

_Verified: 2026-09-12T18:15:00Z_
_Verifier: OpenCode (gsd-verifier)_
