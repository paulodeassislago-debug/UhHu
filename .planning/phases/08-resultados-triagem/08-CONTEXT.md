# Phase 8: Resultados e triagem - Context

**Gathered:** 2026-09-12
**Status:** Ready for planning

## Phase Boundary

Fase 8 entrega a triagem item a item: lista de resultados com scroll infinito + filtros, cards com proveniência e badge NOVO, grupo dedup expansível, decisão elegível/não/indeciso mutável, tags com autocomplete + modal de gestão, ficha completa sob demanda em tela dedicada — mais o fix CORE H-01 (isNew só-anteriores). Corpus/exportação (fase 9) ficam de fora; o run concluído desemboca na tela de resultados real (acaba o placeholder da fase 7).

## Implementation Decisions

### H-01 isNew (decisão Paulo, obrigatória pré-fase 8)
- **D-15:** `isNew` = ausente nos runs ANTERIORES da busca (texto validado D-35); histórico congelado, `newCount` sempre consistente com o badge. Fix pequeno no CORE (on-read passa a ignorar runs posteriores) + teste de 3 runs provando badge ≡ contador. Sem coluna nova, sem migration.

### Lista de resultados
- **D-16:** Scroll infinito com cursor (`limit`+`nextCursor` do client): rolou ao fim, busca mais automaticamente. Sem botão "carregar mais", sem páginas numeradas.
- **D-17:** Filtros combináveis na tela: estado de decisão (elegível/não/indeciso/não triado) + tag + fonte + ano. Client-side quando o CORE não filtrar (padrão pós-filtro); sem nova rota de filtro.

### Ficha on-demand
- **D-18:** Ficha completa em tela dedicada (resumo/orientador/banca/keywords + decisão também ali). Sem modal.
- **D-19:** Enrich ao abrir com skeleton + erro com repetir (padrão §11). Nunca pré-carrega a lista; nunca abre vazia sem estado.

### Tags
- **D-20:** No card: autocomplete das tags do projeto; digitar inexistente cria na hora; defaults (incluir/excluir/duplicado/indisponível/revisar) sempre sugeridos.
- **D-21:** Gestão em modal simples (lista, criar/renomear/excluir, cor opcional) sem sair da triagem. Sem seção fixa na tela.

### OpenCode's Discretion
- Threshold do scroll infinito (prefetch), layout exato do card/grupo expandido (dentro do §7), debounce do autocomplete, mensagens de validação, divisão interna dos planos — respeitando TS strict, contratos em definição única, `any` proibido, FlatList/ScrollView, estados §11.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Esqueleto e spec
- `dev-docs/10-lab-esqueleto-telas.md` §7 (cards, DedupGroup expansível, badge NOVO, decisão no card, ficha sob demanda, banners), §8 (tags, mutabilidade, sem lote), §11 (estados) — contrato visual da fase
- `dev-docs/03-lab-spec-v1.md` §4 (UC-05/06/07), §5 (decision/divergence/enrich), §7 (dedup) — capacidades a consumir

### Contrato e decisões
- `dev-docs/07-core-contract.md` §11.2 (results/decision/divergence), §12 (Decision/Tag) — endpoints e DTOs
- `.planning/phases/04-corpus-e-exportacao/04-CONTEXT.md` — D-40–D-46 (fuzzy pending, canônico+pin, decisão por grupo, divergência é anotação)
- `.planning/phases/06-fundacao-app-auth-suporte-core/06-CONTEXT.md` — D-31/isNew on-read (base do fix D-15)
- `.planning/phases/07-projetos-buscas-execucao/07-CONTEXT.md` — D-07–D-14 (polling, form, histórico, modal)

### Código existente (integração)
- `apps/lab/src/api/lab.ts` (`listResults` com isNew/newCount, `getResult` — estender com decision/tags/divergence/enrich), `packages/contracts/src/lab.ts` (ResultDTO/Decision — definição única)
- `apps/core-api/src/routes/lab.ts` + lib de decisão/tags (decision PATCH, tags CRUD, divergence, isNew on-read a corrigir p/ D-15)
- Telas/padrões fase 7 (`SearchCard`, `RunHistory`, tripwire scroll, modal ProjectModal — moldes a reusar)

## Existing Code Insights

### Reusable Assets
- `labApi.listResults/getResult` + cursor: base da lista infinita + filtros
- `ProjectModal` (modal + validação + teste): molde do modal de gestão de tags
- `SearchCard` expansível + `RunHistory`: molde do grupo dedup expansível
- `Empty/ErrorBanner/CardSkeleton` + tripwire: telas novas já nascem com §11 e scroll

### Established Patterns
- Decisão por grupo (D-46), divergência é anotação; fuzzy pending fora do corpus (D-40)
- Enrich sob demanda, nunca N+1 na lista; skeleton + retry em async sob demanda

### Integration Points
- `PATCH /api/v1/lab/results/:id/decision`, tags do projeto (CRUD), `POST .../duplicate-divergence`, enrich de ficha, fix D-15 no `isNew` on-read (+ teste 3 runs)
- Tela de resultados substitui o placeholder que o run concluído abre hoje (fase 7)

## Specific Ideas

- Lápis ✎ (07-06) já implementado — fase 8 só **confirma visualmente no tablet** (hard-refresh) na abertura; não é escopo de implementação.

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 8-Resultados e triagem*
*Context gathered: 2026-09-12*
