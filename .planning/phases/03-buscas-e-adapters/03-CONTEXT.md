# Phase 3: Buscas e adapters - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Busca real BDTD + CAPES com runs temporais, proveniência `Result→Run→Search→Project` e degradação graciosa. Entrega observável: busca declarativa por projeto → `SearchRun` temporal com diff de novos → resultados com `source/sourceId/rawMetadata` → `partial` sem perda quando uma fonte falha → health `ok|degraded|offline` visível. Sem dedup, elegibilidade, corpus, comparação ou exportação — isso é Phase 4. Sem CLI/MCP — isso é Phase 5.
</domain>

<decisions>
## Implementation Decisions

### Execução sync/async + jobs + cancelamento
- **D-28:** `POST .../runs` sync até 25s responde `201` direto; passou disso responde `202` + polling em `GET /jobs/:id` (que é o próprio run).
- **D-29:** Timeout de fila 60s (default do SourceClient); cancelar marca `cancelled` e preserva parciais já coletados (nunca descarta).
- **D-30:** Job e SearchRun são 1:1 — mesmos estados `queued|running|succeeded|partial|failed|cancelled`; sem sub-jobs por fonte no v1.

### Busca declarativa + filtros + pós-filtro
- **D-31:** Termo em string livre com `AND/OR/NOT` + aspas para frase exata — melhor compatibilidade com BDTD (VuFind `lookfor`+`type`) e CAPES (`termo` com frase exata); Core valida e repassa pass-through, sem camada de tradução estruturada no v1.
- **D-32:** Filtros v1 completos da spec: ano + tipo + fonte + área + instituição + programa; cada fonte honra o que sua API permite, Core aplica pós-filtro local do resto (redundância fonte+Core desejada).
- **D-33:** Busca editável após runs; runs antigos congelam termo/filtros usados; pedir `oasisbr` (desabilitada no registry) retorna 400.

### Proveniência + enriquecimento + diff de novos
- **D-34:** Por `Result`: persiste `rawMetadata` JSON integral da fonte + campos normalizados extraídos (título, autores, ano, tipo, instituição, programa, resumo, links).
- **D-35:** "Novos" no re-run = ausentes por `source+sourceId` no run anterior da mesma Search; sem dedup cross-fonte aqui (dedup real é Phase 4).
- **D-36:** Listagem `GET .../results` ordenada por fonte + ordem da fonte, com paginação cursor estável (`limit`+`nextCursor`/`hasMore`, default 20, max 100, como projetos).

### Degradação partial + health + idempotência + cortesia
- **D-37:** 1 de 2 fontes falhou = `partial` (preserva válidos); 2 de 2 = `failed`.
- **D-38:** 1 retry por fonte antes de declarar falha; `GET /lab/sources/:name/health` reporta `ok|degraded|offline` por taxa recente de falhas/challenges, expondo counts sem vazar cookies/segredos.
- **D-39:** `POST .../runs` aceita `Idempotency-Key` com janela 24h (mesma key + mesmo body = mesmo run); rate-limit próprio de execução: 10 runs/h por usuário (além do global 200/min herdado).

### OpenCode's Discretion
- Nomes exatos de tabelas/colunas lab (seguindo snake_case + `ownerId` via cadeia `→Project`), formato do cursor de results, thresholds numéricos do health (taxa/janela que define degraded vs offline), mensagem PT-BR dos novos códigos de erro de fonte/job, estratégia de timeout sync (race vs elapsed check), e desenho exato das rotas — respeitando D-28–D-39, envelope PT-BR, `X-Request-Id` e baseline de segurança.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato e requisitos (o que a fase precisa entregar)
- `.planning/REQUIREMENTS.md` — LAB-02, LAB-03, LAB-04, LAB-05, LAB-12, SRC-01–SRC-05, CORE-03, CORE-04
- `dev-docs/03-lab-spec-v1.md` — §2 (filtros + pós-filtro), §3 (modelo Search/SearchRun/Result), §5 (rotas lab), §6 (contrato de fontes + enrich sob demanda)
- `dev-docs/04-fontes-bdtd-capes.md` — shapes validados VuFind + rest/busca (base dos adapters)
- `dev-docs/07-core-contract.md` — REST `/api/v1`, envelope, paginação, jobs (§14), idempotência

### Segurança e infra (restrições duras)
- `dev-docs/08-security-baseline.md` — SSRF em adapters, segredos fora de logs/respostas, sem `rejectUnauthorized:false` na CAPES
- `.planning/PROJECT.md` — Constraints e Out of Scope (dedup/corpus/export são Phase 4; CLI/MCP Phase 5)
- `AGENTS.md` — `any` proibido, auditoria adversarial, `ownerId` server-side

### Contexto das fases anteriores
- `.planning/phases/02-plataforma-e-isolamento/02-CONTEXT.md` — D-15–D-27 (isolamento, envelope, rate-limit mold, cursor)
- `.planning/phases/02-plataforma-e-isolamento/02-04-SUMMARY.md` — boot + rateLimit duas camadas + matriz IDOR (molde para execução de busca)
- `apps/core-api/src/lib/projects.ts` — padrão owner-first `*ForActor` + cursor `created_at DESC, id DESC` (copiar para searches/runs/results)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/core-api/src/lib/projects.ts` — padrão `*ForActor(db, actor, ...)` com `and(eq(id), eq(ownerId, actor.userId))` + `toProjectDTO` snake→camel; copiar para searches/runs/results via cadeia `→Project`.
- `apps/core-api/src/plugins/rateLimit.ts` — duas camadas (global 200/min + fino por rota via hook); molde para `POST .../runs` 10/h por usuário.
- `packages/contracts` — única definição de tipos; DTOs de search/run/result nascem aqui.
- `packages/db/src/schema.ts` + migration `0001` — novas tabelas lab seguem roles separadas + Drizzle (D-07/D-10).

### Established Patterns
- REST `/api/v1`, envelope PT-BR, `X-Request-Id`, cursor `limit+1`, 404 idêntico fora do escopo, `any` zero.
- Integração PG real com skip gracioso offline; `scripts/curl-*.sh` como prova manual.

### Integration Points
- Novas tabelas lab em `packages/db/src/schema.ts` + migration `0002`; novas rotas `/api/v1/lab/*` no mesmo boot Fastify; sem worker dedicado no v1 (execução inline até 25s, senão 202 + polling).
</code_context>

<specifics>
## Specific Ideas

- Compatibilidade máxima com as APIs reais: BDTD honra `lookfor`+`type`+`filter[]`, CAPES honra `termo` com frase exata + `Ano` expandido — string livre passa direto nas duas sem tradução lossy.
- Runs congelam o que foi usado (termo/filtros) para o diff e a proveniência sobreviverem à edição da Search.
- `partial` como default de resiliência: 1 fonte viva já entrega valor; `failed` só quando tudo falhou ou timeout/cancel sem nada.

</specifics>

<deferred>
## Deferred Ideas

- Dedup cross-fonte (chave canônica + fuzzy ≥0.9), elegibilidade/tags, corpus view, comparação entre buscas, exportação CSV/BibTeX/JSON — Phase 4.
- CLI/MCP das capabilities de busca — Phase 5.
- Fonte `oasisbr` habilitável — pós-v1 (registry já prevê flag).
- Sub-jobs por fonte com UI de progresso granular — pós-v1 (v1 é Job=Run 1:1).

</deferred>

---

*Phase: 03-buscas-e-adapters*
*Context gathered: 2026-09-11*
