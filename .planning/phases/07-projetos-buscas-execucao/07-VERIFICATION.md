---
phase: 07-projetos-buscas-execucao
verified: 2026-09-12T00:47:59Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Fluxo ponta a ponta com dados reais no tablet via tailnet (beta)"
    expected: "Criar projeto via modal → aparece no topo; criar estratégia em linhas → card com termos legíveis; Executar agora → run criado, progresso por fonte move sozinho até banner terminal (ok/parcial/falha)"
    why_human: "Requires real CORE + real BDTD/CAPES long run on tablet hardware over tailnet — network/hardware-dependent, cannot be proven by mocks"
  - test: "Sair da tela no meio do run e voltar (D-08)"
    expected: "Run continua no servidor; ao voltar, a tela mostra o estado atual sem criar novo run"
    why_human: "Requires live run against real backend with navigation timing — cannot be verified by unit tests"
  - test: "Polling sob rede degradada (round-trip getRun > 2500ms, cf. MD-01)"
    expected: "Tela nunca congela em estado não-terminal com timer morto; resolução stale é ignorada e o polling converge ao estado terminal real"
    why_human: "Requires throttled/degraded mobile network to force overlapping polls — environment-dependent; current code has no in-flight guard (advisory MD-01)"
  - test: "Diálogo de cascata com contagens reais + histórico expansível com toque"
    expected: "Excluir mostra Nº de execuções/resultados antes do hard-delete; confirma → card some; histórico expande com data/status/total/novos/duração/detalhe parcial e toque abre o run"
    why_human: "Requires seeded real data (runs + results) on device; visual/UX confirmation of dialog and expandable card"
---

# Phase 7: Projetos, buscas e execução — Verification Report

**Phase Goal:** Pesquisador organiza projetos, define estratégias e executa buscas com acompanhamento do run
**Verified:** 2026-09-12T00:47:59Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User cria projeto via modal (título + pergunta) e a lista atualiza sem reload manual | ✓ VERIFIED | `apps/lab/src/ui/ProjectModal.tsx` (createProjectSchema ×3: import+parse+type); `apps/lab/app/projects.tsx` (ProjectModal/projectsApi.create/update ×9); `grep -c "fase 7"` = 0 (CTA habilitado); suite 40/40 |
| 2 | User edita a pergunta inline no cabeçalho do projeto e arquiva/reativa por menu sem tela de configurações | ✓ VERIFIED | `apps/lab/app/project/[id].tsx:297-307` ("Editar pergunta", "Arquivar"/"Reativar" ×5 matches); empty→null PATCH covered by `projects-ui.test.ts` (a); no settings screen added |
| 3 | User navega por 3 abas (Estratégias / Comparação / Corpus com contador vivo) sem perder posição | ✓ VERIFIED | `[id].tsx` TabBar + `formatCorpusCount` (`apps/lab/src/projects/counts.ts`) via `labApi.getCorpus` (×3 refs); Comparação disabled hint fase 9; error → "Corpus" sem número |
| 4 | User vê cards de estratégia com termos legíveis, filtros, fontes, nº de runs e última execução (ou vazio orientador) | ✓ VERIFIED | `apps/lab/src/search/SearchCard.tsx` (listRuns ×3, coverage total, runStatusLabel); `strategies.tsx` FlatList ×3 + "Nenhuma estratégia" ×2 + zero `.map(`; vazio verbatim |
| 5 | User monta a busca em linhas com AND/OR/NOT (sem expressão livre) e o app compõe o termo do contrato | ✓ VERIFIED | `searchTerm.ts` build/split (×3); `booleanOperators` 0 hits (nenhum campo novo); free-expression TextInput 0 hits; `searchTerm.test.ts` 10/10 incl. round-trip quote-aware |
| 6 | User salva a estratégia OU salva-e-executa, vendo o selo de filtro Core + status das fontes antes de executar | ✓ VERIFIED | Selo "filtro garantido pelo Core (pós-filtro)" ×2 + CTAs "Salvar estratégia"/"Executar agora" ×3 em `SearchForm.tsx`; `listSources` ×2 em `search-form.tsx`; `randomUUID` por toque, `Math.random` 0 |
| 7 | User acompanha o run com progresso por fonte atualizando sozinho e botão Cancelar visível (sem refresh manual) | ✓ VERIFIED | `useRunPolling.ts` (getRun ×5, 2500ms + teto 240 ×6 matches, `cancel(` 0 calls); `run.tsx` Cancelar/cancelJob ×4; blocos por fonte explícitos, zero `.map(`; `runPolling.test.ts` 6/6 |
| 8 | User entende o desfecho pelos banners ok / parcial (o que faltou) / falha (motivo + repetir) / cancelada | ✓ VERIFIED | `run.tsx` PartialBanner/ErrorBanner ×14 refs; succeeded/partial/failed/cancelled branches; "fase 8" placeholder honesto ×2 (nenhum item fingido) |
| 9 | User sai da tela no meio do run sem cancelar no servidor e ao voltar vê o estado atual | ✓ VERIFIED | Cleanup `useRunPolling.ts:192-198` = `clearInterval` only + comentário D-08 explícito; `cancelJob` no hook só em 2 comentários (nunca importado/chamado); cancel vive só em `run.tsx` via botão explícito |
| 10 | User exclui busca somente após diálogo que lista a cascata (runs, resultados, decisões perdidas) | ✓ VERIFIED | `DeleteSearchDialog.tsx`: "serão perdidas"/hard-delete/"Excluir estratégia" ×6; `deleteSearch` (?confirm=true em `api/lab.ts:130`) ×2; cascata `• N execução(ões)` + `• ~N resultado(s)` + decisões qualitativas + aviso hard-delete |
| 11 | User consulta o histórico de runs expansível dentro do card da estratégia (sem quarta aba) | ✓ VERIFIED | `RunHistory.tsx` botão `Histórico (N) ▸/▾` + paginação limit 20 + "Ver mais"; "quarta aba|TabBar|/history" 0 hits; `SearchCard.tsx` monta RunHistory + DeleteSearchDialog (×6 refs); strategies repassa `onDeleted` com remoção local |
| 12 | Cada entrada do histórico mostra data/hora, status, total, novos, duração e detalhe do parcial; toque abre o run | ✓ VERIFIED | `RunHistory.tsx:165-182` (formatRunWhen · runStatusLabel · total · +newCount novos · duration · `faltou:` + error.message); reusa runStatusLabel/formatDurationMs (×4, sem duplicar); toque → string `/run?runId=` (×2); `runHistory.test.ts` 8/8 |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/lab/src/ui/ProjectModal.tsx` | Modal criar + Zod client-side | ✓ VERIFIED | Existe, substantivo, wired a projectsApi.create |
| `apps/lab/app/projects.tsx` | Lista gerenciável FlatList | ✓ VERIFIED | FlatList ×4, filtro Ativos/Arquivados, contagem leve, zero `any` |
| `apps/lab/app/project/[id].tsx` | Cabeçalho editável + TabBar + contador vivo | ✓ VERIFIED | ScrollView raiz, TabBar 3 abas, getCorpus vivo |
| `apps/lab/src/projects/counts.ts` + `__tests__/projects-ui.test.ts` | Helper + testes PATCH | ✓ VERIFIED | 3/3 testes verdes |
| `packages/contracts/src/projects.ts` (auto-fix 07-01) | update widening validation-only | ✓ VERIFIED | Ver (a) abaixo — aditivo, sem migration |
| `apps/lab/src/search/searchTerm.ts` + `__tests__/searchTerm.test.ts` | Composição linhas→termo | ✓ VERIFIED | 10/10 testes, contrato intocado |
| `apps/lab/src/search/SearchForm.tsx` | Form §6 + selo + 2 CTAs | ✓ VERIFIED | Selo ×2, CTAs ×3, mapeamento tese→doctoralThesis |
| `apps/lab/src/search/SearchCard.tsx` | Card §5 + runs reais | ✓ VERIFIED | listRuns, Executar/Duplicar reais, histórico+diálogo integrados |
| `apps/lab/app/project/[id]/search-form.tsx` | Tela criar/editar + execute | ✓ VERIFIED | Saúde das fontes, save→back, save&run→push run |
| `apps/lab/app/project/[id]/strategies.tsx` | Lista FlatList | ✓ VERIFIED | FlatList, vazio, onDeleted local, zero `.map(` |
| `apps/lab/src/search/useRunPolling.ts` + `__tests__/runPolling.test.ts` | Polling D-07/D-08 | ✓ VERIFIED | Ver (b) abaixo; 6/6 testes |
| `apps/lab/app/project/[id]/run.tsx` | Tela §7 + banners + cancelar | ✓ VERIFIED | ScrollView, progresso por fonte, 4 banners, Cancelar só em polling |
| `apps/lab/src/search/RunHistory.tsx` + `runHistory.ts` + `__tests__/runHistory.test.ts` | Histórico expansível | ✓ VERIFIED | 8/8 testes, reuso de helpers da 07-03 |
| `apps/lab/src/search/DeleteSearchDialog.tsx` | Diálogo de cascata | ✓ VERIFIED | Cascata honesta, hard-delete explícito |
| `apps/lab/src/ui/__tests__/scroll-containers.test.ts` | Tripwire 7 telas | ✓ VERIFIED | 6/6 testes (strategies/search-form/run incluídos) |
| `apps/lab/app/_layout.tsx` | Registro das rotas | ✓ VERIFIED | search-form + run com títulos (Rule 3, navegação only) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ProjectModal.tsx | projectsApi.create | createProjectSchema.parse antes do POST | ✓ WIRED | 3 refs |
| projects.tsx | projectsApi.update | arquivar/reativar PATCH status | ✓ WIRED | 3 refs |
| [id].tsx | labApi.getCorpus | contador vivo Corpus | ✓ WIRED | 3 refs |
| SearchForm/search-form | labApi.createSearch/updateSearch | parse antes do POST | ✓ WIRED | 3+3 refs |
| SearchCard | labApi.listRuns | runs count + última (items[0]) | ✓ WIRED | 3 refs |
| search-form | labApi.listSources/getSourceHealth | status antes de executar | ✓ WIRED | listSources ×2, informativo sem bloquear |
| useRunPolling | labApi.getRun | poll até terminal | ✓ WIRED | 5 refs, para em terminal/timeout/unmount |
| run.tsx | labApi.cancelJob | botão Cancelar | ✓ WIRED | só em polling, some no terminal |
| run.tsx | PartialBanner/ErrorBanner | banners por status | ✓ WIRED | 14 refs, 4 desfechos |
| DeleteSearchDialog | labApi.deleteSearch | DELETE ?confirm=true pós-confirmação | ✓ WIRED | `api/lab.ts:130` encodeURIComponent |
| RunHistory | labApi.listRuns | histórico paginado limit 20 | ✓ WIRED | 3 refs, "Ver mais" manual |
| RunHistory | run.tsx route | toque → `/run?runId=` string literal | ✓ WIRED | 2 refs, sem import da tela |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| projects.tsx contagem | `N busca(s)` por card | listSearches limit 100 por projeto | ✓ FLOWING | erro omite a linha, nunca quebra |
| [id].tsx Corpus:N | items.length + hasMore | getCorpus limit 100 | ✓ FLOWING | fallback "Corpus" sem número |
| SearchCard runs | runs N + última items[0] | listRuns limit 100 | ✓ FLOWING | erro → "histórico indisponível", card continua |
| RunHistory entradas | items + cursor | listRuns limit 20 + Ver mais | ✓ FLOWING | erro → retry; vazio honesto |
| run.tsx banners | run.status + metrics | getRun polling | ✓ FLOWING | skeleton inicial, nunca "ok" presumido |
| DeleteSearchDialog | runs/resultados soma coverage | listRuns limit 100 | ✓ FLOWING | falha → "contagem indisponível", diálogo continua |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck strict | `pnpm --filter @uhhu/lab exec tsc --noEmit` | exit 0 | ✓ PASS |
| Suite completa incl. 4 novos 07-0x testes | `pnpm --filter @uhhu/lab run test` | 40/40 (projects-ui 3 + searchTerm 10 + runPolling 6 + runHistory 8 + tripwire 6) | ✓ PASS |
| Lint arquivos da fase | `eslint src/search/ src/projects/ src/ui/ProjectModal.tsx app/project/[id].tsx` | exit 0 | ✓ PASS |
| Bans (`any`, Math.random, eval, localStorage, console) | grep 17 arquivos da fase | 0 ocorrências | ✓ PASS |
| Real BDTD/CAPES run end-to-end no tablet | n/a (needs hardware/network) | — | ? SKIP → human_verification |

### Specific Assessments (prompt-required)

**(a) 07-01 auto-fix widening `updateProjectSchema` — validation-only, additive, sem migration.**
Diff `4de753e..HEAD` em `packages/contracts/src/projects.ts` toca SÓ os modificadores nullable de
`researchQuestion`/`description` no update (`string?` → `string | null`, optional preservado); `create`
inalterado (ainda rejeita null — `packages/contracts/src/projects.ts:9-13`); key set idêntico, sem campo
novo (sem over-posting de `ownerId`/privilégio); `title`/`status`/`referenceSearchId` byte-idênticos.
Servidor já suportava null (`apps/core-api/src/lib/projects.ts:219-220` atribui `string | null` direto,
null limpa). Nenhum arquivo de migration no diff da fase (`NO-MIGRATION-FILES`). Typecheck contracts +
core-api exit 0 (SUMMARY 07-01). **SAFE / aditivo — corrobora REVIEW §1. Nenhum gap.**

**(b) D-08 polling cleanup — timer only, no server cancel.**
`apps/lab/src/search/useRunPolling.ts`: `cancelJob` aparece SÓ em 2 comentários D-08 (linhas 17, 194),
nunca importado/chamado; `cancel(` 0 ocorrências; cleanup do unmount (`:192-198`) faz `stopped = true` +
`clearInterval` apenas, com comentário D-08 explícito. Cancelamento real vive só em `run.tsx:141-161`
via botão explícito → `labApi.cancelJob`. **D-08 holds — corrobora REVIEW §2 (exceto MD-01, abaixo).**

### Advisory Review Findings (07-REVIEW.md) — impact on must_haves

| Finding | Severity | Invalidates must_have? | Disposition |
|---------|----------|------------------------|-------------|
| MD-01 overlapping polls (stale resolve pós-terminal, timer morto) | medium | **No** — polling funciona em condições normais (prova: testes + lógica verificada); race exige round-trip > 2500ms (rede degradada). Headline D-07 intacta no caminho feliz | WARNING — hardening futuro (seq/inFlight guard); coberto por item human_verification nº 3 |
| LW-01 `randomUUID()` sem guarda em 3 tap paths | low | **No** — falha cai no try existente (sem crash, sem request duplicado); só mensagem críptica em runtime antigo | WARNING — extrair `newIdempotencyKey()` com fallback/mensagem PT-BR (fase futura) |
| LW-02 split reescreve termos não-autorados pelo lab (NOT inicial) | low | **No** — termos autorados pela UI fazem round-trip (10/10 testes); só afeta edição de termos externos API/CLI/MCP | WARNING — aviso "termo criado fora do app" ou fidelidade de split (fase futura) |
| LW-03 [Excluir] habilitado antes das contagens carregarem | low | **No** — gate AGENTS.md mantido (diálogo + botão vermelho dedicado + aviso hard-delete); contagens são informativas por desenho (T-07-04-02) | WARNING — `disabled={!countsReady}` (1 linha, fase futura) |
| LW-04 cache de contagem nunca invalidado | low | **No** — staleness cosmética, self-heal no remount | WARNING — geração/invalidação no `load()` (fase futura) |
| LW-05 criar a partir do estado erro engole o projeto | low | **No** — servidor correto, só contradição visual transitória | WARNING — `setState('ready')`/reload no create (fase futura) |
| IN-01..IN-04 (elapsedPolls morto, activeTab morto, formatRunDate, tripwire blind spot) | info | **No** | INFO — limpeza/consistência futura, sem efeito no goal |

Nenhum finding do REVIEW invalida um must_have. Todos os 6 LW/IN são robustez/cosmética para fases
futuras; MD-01 é o único com impacto funcional real e só sob rede degradada (vai para verificação humana).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UI-09 | 07-01 | Lista de projetos + vazio orientador | ✓ SATISFIED | FlatList + `N busca(s)` + vazio verbatim |
| UI-10 | 07-01 | Criar/arquivar/reativar + pergunta editável | ✓ SATISFIED | Modal + PATCH status + inline vazia→null |
| UI-11 | 07-01 | 3 abas com contador vivo | ✓ SATISFIED | TabBar + Corpus vivo; Comparação disabled fase 9 |
| UI-12 | 07-02 | Cards de estratégia + vazio | ✓ SATISFIED | SearchCard runs reais + strategies FlatList |
| UI-13 | 07-02 | Salvar vs salvar-e-executar + selo + saúde | ✓ SATISFIED | SearchForm §6 + Idempotency-Key por toque |
| UI-14 | 07-03 | Run com progresso cancelável + 4 banners | ✓ SATISFIED | useRunPolling + run.tsx §7 |
| UI-15 | 07-04 | Diálogo de cascata antes do hard-delete | ✓ SATISFIED | DeleteSearchDialog + DELETE ?confirm=true |
| UI-16 | 07-04 | Histórico de runs da busca | ✓ SATISFIED | RunHistory expansível D-11/D-12 |

Orphaned requirements: none — todos os 8 IDs da fase estão nos frontmatters dos 4 PLANs e em
REQUIREMENTS.md mapeados à Phase 7. Nenhum ID extra de Phase 7 em REQUIREMENTS.md fora dos planos.

### User Decisions D-07..D-14 (07-CONTEXT.md) — honored?

| Decision | Status | Evidence |
|----------|--------|----------|
| D-07 polling automático, sem refresh manual | ✓ | 2500ms fixo + teto 240; sem botão atualizar |
| D-08 sair não abandona o run | ✓ | cleanup timer-only (ver (b)) |
| D-09 linhas AND/OR/NOT, sem expressão livre | ✓ | buildSearchTerm + 0 free-expr input |
| D-10 filtros §6 + selo + saúde, salvar ≠ executar | ✓ | selo + status por fonte + 2 CTAs |
| D-11 histórico expansível no card, sem 4ª aba | ✓ | RunHistory no card; 0 hits quarta aba |
| D-12 entrada completa + toque abre run | ✓ | data/status/total/novos/duração/parcial + push run |
| D-13 criar via modal, volta à lista | ✓ | ProjectModal + onCreated no topo + CTA habilitado |
| D-14 pergunta inline + arquivar/reativar sem tela config | ✓ | Editar pergunta + menu cabeçalho/lista; 0 telas config |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `ProjectModal.tsx` | 132, 140 | `placeholder=` (TextInput prop) | ℹ️ Info | Legítimo — placeholder de input RN, não stub |
| — | — | TODO/FIXME/`.map(` fora de FlatList/`as any`/`Math.random`/`eval`/`localStorage`/`console.` | — | 0 ocorrências nos 17 arquivos da fase |

### Human Verification Required

#### 1. Fluxo ponta a ponta com dados reais no tablet via tailnet (beta)

**Test:** Criar projeto via modal → criar estratégia em linhas → Executar agora → acompanhar até banner terminal
**Expected:** Projeto no topo; card com termos legíveis; progresso por fonte move sozinho até ok/parcial/falha
**Why human:** Requires real CORE + real BDTD/CAPES long run on tablet hardware over tailnet

#### 2. Sair da tela no meio do run e voltar (D-08)

**Test:** No meio de um run real, navegar para fora e voltar à tela do run
**Expected:** Run continua no servidor; tela mostra estado atual sem criar novo run
**Why human:** Requires live run with navigation timing against real backend

#### 3. Polling sob rede degradada (cf. MD-01)

**Test:** Throttle de rede (round-trip getRun > 2500ms) durante acompanhamento de run real
**Expected:** Tela nunca congela em estado não-terminal com timer morto; converge ao terminal real
**Why human:** Environment-dependent; código atual não tem in-flight guard (advisory MD-01)

#### 4. Cascata com contagens reais + histórico com toque

**Test:** Com runs/resultados reais, abrir Excluir (ver cascata), confirmar; expandir Histórico e tocar entrada
**Expected:** Cascata lista execuções/resultados/decisões; confirma some o card; entrada abre o run
**Why human:** Requires seeded real data on device; confirmação visual/UX do diálogo e do expansível

### Gaps Summary

Nenhum gap bloqueador. 12/12 must-haves VERIFIED com evidência de código + gates verdes
(typecheck exit 0, eslint exit 0, vitest 40/40, zero `any`/sins). Auto-fix 07-01 (a) provado aditivo sem
migration; D-08 (b) provado timer-only; nenhum finding do REVIEW invalida must_have (6 WARNINGs + 4 INFOs
documentados para hardening futuro). Status `human_needed` SOMENTE pelos 4 itens hardware/rede/UX acima,
conforme regra (itens humanos têm prioridade sobre `passed`).

---

_Verified: 2026-09-12T00:47:59Z_
_Verifier: OpenCode (gsd-verifier)_
