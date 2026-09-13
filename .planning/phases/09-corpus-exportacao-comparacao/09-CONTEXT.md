# Phase 9: Corpus, exportação e comparação - Context

**Gathered:** 2026-09-13
**Status:** Ready for planning

## Phase Boundary

Última fase do milestone: corpus como view derivada com filtros + exportação por grupo inteiro com entrega por plataforma + comparação 2–4 com destaque só-"mais inclusiva" e referência manual visível — mais o BibTeX do MP. Encerra com o gate do milestone (slice vertical provado na beta + auditoria adversarial + revisão humana). Sem mudança de semântica do CORE além do `note` BibTeX do MP; sem paleta/tema (fora do v1.1).

## Implementation Decisions

### Entrega do arquivo
- **D-22:** Web: download via blob+anchor. Nativo: Share nativo built-in. Zero dependência nova (sem expo-sharing/file-system).
- **D-23:** Três formatos sempre oferecidos (CSV/BibTeX/JSON); BibTeX com seleção vazia avisa em vez de exportar vazio.

### Referência visível
- **D-24:** Estratégia de referência ganha selo "Referência" no card + coluna destacada no compare; trocar é um toque (mutável, sem confirmação).
- **D-25:** Referência é só memória do projeto — nenhum efeito funcional em corpus/filtros/resultados.

### BibTeX do MP
- **D-26:** `professionalMaster` exporta `@mastersthesis` com campo `note`/`type` indicando profissional (mudança mínima em `exports.ts:117` + teste). Sem novo entry type.

### OpenCode's Discretion
- Layout da tabela compare (scroll horizontal, coluna fixa — esqueleto §9), posição do botão exportar/seleção, textos de vazio/erro, divisão dos planos — respeitando §11, FlatList/ScrollView, `any` proibido.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Esqueleto e spec
- `dev-docs/10-lab-esqueleto-telas.md` §9 (tabela 2–4, cobertura, vencedora), §10 (corpus + filtros + export seleção/grupo), §14-1/14-2 (só-mais-inclusiva + grupo inteiro), §11 (estados)
- `dev-docs/03-lab-spec-v1.md` §4 (UC-04/UC-08), §8 (formatos CSV/BibTeX/JSON, @phdthesis/@mastersthesis)

### Contrato e decisões
- `dev-docs/07-core-contract.md` §11.2 (corpus/export/compare), §12 (corpus = view derivada)
- `.planning/phases/04-corpus-e-exportacao/04-CONTEXT.md` — D-47–D-53 (overlap dedup-aware, 4 blocos, BibTeX -a/-b, attachment, CSV por grupo)
- `.planning/phases/06-fundacao-app-auth-suporte-core/06-CONTEXT.md` — D-30 (referenceSearchId), D-14-2 (grupo inteiro)
- `.planning/phases/08-resultados-triagem/08-CONTEXT.md` — D-20/D-21 (tags, filtros que o corpus reusa), MP terceiro valor

### Código existente (integração)
- `apps/lab/app/project/[id]/corpus.tsx` (placeholder — construir), `apps/lab/src/api/lab.ts` (`getCorpus`, `exportProject` raw, `compareSearches`)
- `apps/core-api/src/lib/exports.ts:117` (mapeamento @phdthesis/@mastersthesis — ponto do `note` MP)
- `apps/lab/app/project/[id]/strategies.tsx` (cards onde entra o selo Referência)

## Existing Code Insights

### Reusable Assets
- `labApi.getCorpus/exportProject/compareSearches` + cursor: base pronta do client
- `SearchCard` + selos existentes: molde do selo "Referência"
- `Empty/ErrorBanner` + tripwire scroll: telas novas já nascem com §11

### Established Patterns
- Export attachment `corpus-<projeto>-<data>` (D-52); grupo inteiro = um trabalho uma referência; referência mutável sem confirmação
- Filtros corpus (tag/fonte/ano) espelham os de resultados (D-17)

### Integration Points
- `GET .../corpus` (view derivada), `GET .../export?format&scope` (attachment), `GET .../compare?with=` (4 blocos), `PATCH /projects/:id` (`referenceSearchId`)

## Specific Ideas

No specific requirements — open to standard approaches.

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 9-Corpus, exportação e comparação*
*Context gathered: 2026-09-13*
