# Phase 4: Corpus e exportação - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Pesquisador revisa resultados, decide elegibilidade, organiza em corpus com proveniência, compara buscas e exporta (CSV/BibTeX/JSON) — tudo via CORE com isolamento owner-first, sem tocar o banco. Entrega observável: dedup agrupa mesma obra entre fontes com confirmação de fuzzy → decisão por grupo com divergência por fonte → corpus = view derivada dos eligible refletindo na hora → comparação 2+ buscas → exportação de seleção ou corpus. Sem CLI/MCP — isso é Phase 5.
</domain>

<decisions>
## Implementation Decisions

### Fuzzy confirmation flow
- **D-40:** Grupos fuzzy (similaridade ≥0.9) não confirmados vivem em fila pending, fora do corpus, até aceite/rejeição explícita por grupo.
- **D-41:** Confirmação é do dono do projeto, por grupo de duplicatas, persistente por projeto.
- **D-42:** Rejeitar um grupo fuzzy o divide em candidatos singles independentes, cada um com decisão própria; o pareamento rejeitado é lembrado para que re-runs não reagrupem.
- **D-43:** Novos runs anexam automaticamente: resultados com chave exata entram em grupos existentes (confirmados ou pending); novos matches fuzzy vão para a fila pending — sem reconfirmar o já decidido.

### Canonical record + divergence
- **D-44:** Registro canônico do grupo = origem com metadados mais completos (score por campos preenchidos: abstract, autores, ano, URLs); desempate determinístico por source+sourceId.
- **D-45:** Dono pode fixar (pin) qualquer origem como canônica por grupo; override persiste por projeto e sobrevive a re-runs e auto-attach.
- **D-46:** Decisão de elegibilidade é UMA por grupo e dirige o corpus; qualquer origem pode carregar nota de divergência (ex. metadados da CAPES diferem) sem alterar a decisão do grupo — divergência é anotação, não segunda decisão.

### Comparison shape
- **D-47:** Overlap entre buscas = chaves canônicas de dedup compartilhadas (dedup-aware, cross-fonte, reusa a chave LAB-07).
- **D-48:** Cada busca contribui com seu último run concluído (fixo); comparação é estratégia-atual vs estratégia-atual.
- **D-49:** Saída contém exatamente os quatro locked (totais, histograma de anos, counts por fonte, overlaps par-a-par) — sem listas de itens.

### Export mechanics
- **D-50:** Seleção = lista explícita de IDs de resultados/grupos; escopo corpus = todos os eligible resolvido server-side.
- **D-51:** Colisão de chave BibTeX resolve com sufixos -a, -b deterministicamente por ordem de grupo; primeira chave fica com o slug base.
- **D-52:** Exportação entrega arquivo direto (Content-Disposition attachment, filename `corpus-<projeto>-<data>.csv|bib|json`).
- **D-53:** CSV tem uma linha por grupo (registro canônico) com decisão do grupo, tags, contagem de origens e lista de origens — sem duplicar decisões por linha.

### OpenCode's Discretion
Nenhuma — usuário escolheu todas as opções recomendadas explicitamente; sem itens "you decide".
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Lab spec (contrato da fase)
- `dev-docs/03-lab-spec-v1.md` §3 (modelo Search/SearchRun/Result) e §5 (rotas lab: corpus, export, compare) — escopo de endpoints e fluxos UC-05/UC-08
- `dev-docs/03-lab-spec-v1.md` §6 (SourceClient 60s) e §7-8 (critérios de aceite: decisão+tags persistem, exportação correta seleção e corpus)
- `dev-docs/07-core-contract.md` §9.2 (status HTTP), §12 (domínio Lab), §14 (Job) — convenções de rota, envelope e erros PT-BR

### Requisitos locked
- `.planning/REQUIREMENTS.md` LAB-06..LAB-11 — dedup (chave SHA-256 título+ano+autores, fuzzy ≥0.9), decisão eligible|ineligible|undecided, tags default, comparação, formatos de exportação
- `.planning/ROADMAP.md` Phase 4 — goal, dependência da Phase 3, success criteria

### Código existente (integração)
- `packages/contracts/src/lab.ts` — SearchDTO/SearchRunDTO/ResultDTO/RunMetrics; estender com tipos de dedup/decisão/tags/comparação/export (definição única)
- `packages/db/src/schema.ts` — tabelas lab_searches/lab_search_runs/lab_results; espelhar novas tabelas de decisão/grupos/tags
- `apps/core-api/src/lib/searches.ts` — padrão `*ForActor` owner-first via JOIN →Project (copiar para decisões/corpus/export); cursor e toDTO snake→camel
- `apps/core-api/src/lib/searchRuns.ts` — chave canônica de dedup já calculável dos results; provenance Result→Run→Search→Project
- `apps/core-api/src/routes/lab.ts` — rotas lab existentes; novas rotas de corpus/compare/export seguem o mesmo molde (Zod + requireAuth + 404 idêntico)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `*ForActor` (lib/searches.ts): escopo owner via JOIN lab→projects em TODA query; fora do escopo → null → 404 — reutilizar para decisions/tags/corpus/export sem reimplementar
- `encodeResultsCursor/decodeResultsCursor` (contracts/lab.ts): cursor `source|rank|id` tolerante — molde para paginação de corpus/comparação
- `ERROR_CATALOG` + `buildEnvelope` (contracts/errors.ts): novos códigos (se preciso) seguem o catálogo PT-BR, nunca mensagem inline
- `recordSourceEvent` + health (integrations/health.ts): padrão de agregação temporal — referência para counts de comparação

### Established Patterns
- Snapshot congelado por run (D-33): grupos/decisões referenciam result IDs estáveis; re-runs criam novos resultados sem invalidar decisões (rejeição lembrada cruza runs)
- Sync 25s / async 202 + polling Job=Run (D-28/D-30): exportações grandes podem seguir o mesmo molde se excederem o sync
- Rate-limit duplo (hook 30/min IP + 10/h banco): aplicar às rotas novas de decisão/exportação conforme plano

### Integration Points
- Novas tabelas lab (decisões, grupos de dedup, tags, overrides canônicos, pareamentos rejeitados) via migration 0003 sobre o schema Drizzle existente
- Novas rotas sob `/api/v1/lab/` + jobs existentes; boot em `apps/core-api/src/index.ts`
- Prova no padrão 03-06: integração PG + `scripts/curl-corpus.sh` + auditoria adversarial + checkpoint humano
</code_context>

<specifics>
## Specific Ideas

- Filename de exportação: `corpus-<projeto>-<data>.csv|bib|json` (D-52)
- Exemplo de divergência: "metadados da CAPES diferem" como nota por origem sem mudar a decisão do grupo (D-46)
- Exemplo de pareamento rejeitado lembrado: impede reagrupamento em re-runs futuros (D-42)
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope
</deferred>

---

*Phase: 4-Corpus e exportação*
*Context gathered: 2026-09-11*
