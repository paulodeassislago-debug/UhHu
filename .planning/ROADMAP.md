# Roadmap: UhHu! — CORE v1 + Lab v1 + Lab UI v1

## Milestones

- ✅ **v1.0 CORE v1 + Lab v1** — Phases 1-5 (shipped 2026-09-11)
- 🚧 **v1.1 Lab UI v1** — Phases 6-9 (in progress)

## Phases

<details>
<summary>✅ v1.0 CORE v1 + Lab v1 (Phases 1-5) — SHIPPED 2026-09-11</summary>

- [x] Phase 1: Fundação executável (3/3 plans) — completed 2026-09-10
- [x] Phase 2: Plataforma e isolamento (4/4 plans) — completed 2026-09-11
- [x] Phase 3: Buscas e adapters (6/6 plans) — completed 2026-09-11
- [x] Phase 4: Corpus e exportação (5/5 plans) — completed 2026-09-11
- [x] Phase 5: Prova headless (5/5 plans) — completed 2026-09-11

</details>

### 🚧 v1.1 Lab UI v1 (In Progress)

**Milestone Goal:** Pesquisador usa o Lab por interface tablet-first (web/PWA beta + nativo) consumindo SOMENTE o CORE — slice vertical login → corpus/export primeiro, comparação por último.

#### Phase 6: Fundação do app + auth + suporte CORE — ✅ COMPLETE 2026-09-11
**Goal**: App Expo abre na web e no tablet, autentica nos dois canais e o CORE expõe o que a UI precisa (§14)
**Depends on**: Phase 5
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, UI-30, UI-31, UI-32
**Success Criteria** (what must be TRUE):
  1. User abre o app Expo na web (expo web) e no tablet sem erro de build, com navegação entre telas e estados vazio/carregando/erro/parcial
  2. User faz login na web (cookie httpOnly) e no nativo (PAT em secure storage), registra-se por convite e cai no login com aviso ao expirar a sessão
  3. `referenceSearchId` persiste por migration e `isNew` aparece no GET results sem coluna nova (testes de isolamento/IDOR verdes)
  4. Web beta carrega dados da API via CORS a partir da origem aprovada; gates do app verdes (typecheck strict, lint, testes, bundle sem segredos)
**Plans**: 4 plans in 3 waves + 1 gap-closure plan (UAT)

Plans:
- [x] 06-01: Suporte CORE — referenceSearchId + isNew + CORS (Wave 1) — done 2026-09-11 (a2f12d5, dbd02b5, b293c3c)
- [x] 06-02: Scaffold Expo + client tipado + navegação esqueleto (Wave 1) — done 2026-09-11 (bef85d9, aad160f)
- [x] 06-03: Auth web cookie + PAT nativo + convite + expiração (Wave 2, blocked on 06-02) — done 2026-09-11 (83527eb, d60f213)
- [x] 06-04: Estados §11 + gates + prova beta com dados reais (Wave 3, blocked on 06-03) — done 2026-09-11 (37ef874, 768135c)
- [x] 06-05: Gap-closure UAT — lista rolável FlatList + ScrollView + tripwire (Wave 4, gap 06-HUMAN-UAT) — done 2026-09-11 (4592cd3, ee663f1)

Cross-cutting constraints: CORS allowlist exata sem espelho (06-01, 06-04); `any` proibido + `import type` de contracts (todos); ownerId sempre do ator no servidor (06-01, 06-03).

#### Phase 7: Projetos, buscas e execução — ✅ COMPLETE 2026-09-12 (UAT 4/4 tablet Paulo)
**Goal**: Pesquisador organiza projetos, define estratégias e executa buscas com acompanhamento do run
**Depends on**: Phase 6
**Requirements**: UI-09, UI-10, UI-11, UI-12, UI-13, UI-14, UI-15, UI-16
**Success Criteria** (what must be TRUE):
  1. User cria/arquiva/reativa projetos, edita a pergunta e navega por abas com contador de corpus vivo
  2. User salva estratégia (só salvar ou salvar-e-executar) com selo de filtro garantido pelo Core e status das fontes
  3. User executa busca, acompanha progresso por fonte (cancelável) e entende banners ok/parcial/falha/cancelled
  4. User exclui busca somente após diálogo listando a cascata; histórico de runs consultável
**Plans**: 5 plans in 4 waves + 1 gap-closure (UAT) + 1 UX request (Paulo 12/09)

Plans:
- [x] 07-01-PLAN.md — Projetos: modal criar + lista gerenciável + cabeçalho editável com abas (Wave 1) — done 2026-09-12 (1965da1, 4817ef0)
- [x] 07-02-PLAN.md — Estratégias: cards + formulário §6 salvar/salvar-e-executar (Wave 1) — done 2026-09-12 (df7c5e1, 76bdd54)
- [x] 07-03-PLAN.md — Execução: polling por fonte + cancelar + banners (Wave 2, blocked on 07-02) — done 2026-09-12 (637b0ca, e585c41)
- [x] 07-04-PLAN.md — Cascata de exclusão + histórico expansível no card (Wave 3, blocked on 07-02, 07-03) — done 2026-09-12 (89841a3, 4e114b1)
- [x] 07-05-PLAN.md — Gap-closure UAT: wrapper UUID cross-platform (expo-crypto + fallback) + migração dos 3 toques + tripwire (Wave 4, gap 07-HUMAN-UAT item 1) — done 2026-09-12 (d84025d, eb6b2c2)
- [x] 07-06-PLAN.md — UX Paulo 12/09: lápis ✎ inline no cabeçalho (título + pergunta, PATCH existente) (Wave 5, depends on 07-01) — done 2026-09-12 (e758388, c43ea39)

#### Phase 8: Resultados e triagem
**Goal**: Pesquisador tria resultados item a item com decisão mutável, tags e transparência de dedup
**Depends on**: Phase 7
**Requirements**: UI-17, UI-18, UI-19, UI-20, UI-21, UI-22
**Success Criteria** (what must be TRUE):
  1. User lê cards com proveniência completa e expande grupos deduplicados (origens, links, diferenças, divergência por fonte)
  2. User decide elegível/não/indeciso com reversão imediata e associa tags com autocomplete + gestão de tags
  3. User identifica itens novos pelo badge "NOVO" e abre ficha completa sob demanda sem travar a lista
**Plans**: 4 plans in 4 waves

Plans:
- [x] 08-01-PLAN.md — CORE: fix isNew só-anteriores + groups expõem tags/divergências/decidedAt + rename/delete de tags (Wave 1) — done 2026-09-12 (f13a482, d4c73c5)
- [x] 08-02-PLAN.md — Client triagem + lista infinita com filtros + cards proveniência/NOVO + run linkado (Wave 2, blocked on 08-01) — done 2026-09-12 (e8da752, 940f4be)
- [ ] 08-03-PLAN.md — Decisão mutável + grupo expansível com divergência (Wave 3, blocked on 08-02)
- [ ] 08-04-PLAN.md — Tags autocomplete + modal gestão + ficha sob demanda (Wave 4, blocked on 08-03)

#### Phase 9: Corpus, exportação e comparação
**Goal**: Pesquisador fecha o corpus derivado, exporta por grupo inteiro e escolhe a estratégia de referência
**Depends on**: Phase 8
**Requirements**: UI-23, UI-24, UI-25, UI-26, UI-27, UI-28, UI-29
**Success Criteria** (what must be TRUE):
  1. User vê o corpus como view derivada consistente após cada decisão, filtra por tag/fonte/ano e exporta seleção (grupo inteiro) ou corpus completo em CSV/BibTeX/JSON
  2. User compara 2–4 buscas lado a lado, vê o destaque "mais inclusiva" e marca manualmente a referência do projeto (persistida)
  3. Gate do milestone: slice vertical completo login → corpus/export provado na web beta + auditoria adversarial do app + revisão humana
**Plans**: TBD

Plans:
- [ ] 09-01: TBD during `/gsd-plan-phase 9`

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Fundação executável | v1.0 | 3/3 | Complete | 2026-09-10 |
| 2. Plataforma e isolamento | v1.0 | 4/4 | Complete | 2026-09-11 |
| 3. Buscas e adapters | v1.0 | 6/6 | Complete | 2026-09-11 |
| 4. Corpus e exportação | v1.0 | 5/5 | Complete | 2026-09-11 |
| 5. Prova headless | v1.0 | 5/5 | Complete | 2026-09-11 |
| 6. Fundação do app + auth + suporte CORE | v1.1 | 5/5 | Complete | 2026-09-11 |
| 7. Projetos, buscas e execução | v1.1 | 6/6 | Complete | 2026-09-12 |
| 8. Resultados e triagem | v1.1 | 0/TBD | Not started | - |
| 9. Corpus, exportação e comparação | v1.1 | 0/TBD | Not started | - |
