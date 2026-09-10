# Requirements: UhHu! — CORE v1 + Lab v1 (fundação executável)

**Defined:** 2026-09-09
**Core Value:** Um pesquisador consegue executar uma busca real (BDTD/CAPES) pelo CORE, com isolamento por usuário, proveniência e histórico — sem UI direta no banco e sem Supabase.

Fontes: `dev-docs/07-core-contract.md` §10–13/21, `dev-docs/03-lab-spec-v1.md` §4/11, `dev-docs/08-security-baseline.md` §7, `dev-docs/09-roadmap-geral.md` §3–5.

## v1 Requirements

### Fundação e persistência

- [x] **FOUND-01**: Dev consegue subir o CORE contra PostgreSQL DEV e aplicar migrations versionadas do monorepo (provado 2026-09-10: PG DEV postgres 16.14 via compose na VPS, `db:migrate` exit 0 host+container, `/health` `{"status":"ok","db":"ok","migrationsApplied":1}`)
- [x] **FOUND-02**: Monorepo pnpm/TS `strict` com fronteiras `apps/core-api` + `packages/{core,contracts,db,modules,integrations,config}` e `packages/contracts` como única definição de tipos/DTOs/erros
- [ ] **FOUND-03**: CI mínimo barra segredo (Gitleaks tree+histórico), SAST, `pnpm audit`, typecheck, lint e testes — falha em crítico/alto sem aceite formal (código+gates+integração real verdes 2026-09-10; contrato aprovado 1–24; CI verde no push pendente — estreia no 1º push)
- [x] **FOUND-04**: PG dev e prod são instâncias/bancos/credenciais/`.env` distintos; nenhum segredo em código, bundle, Git, logs ou respostas (provado 2026-09-10: roles uhhu_migrate/uhhu_app + grants revisados, `.env.dev(.cs)` 600 ignorados, histórico só com placeholders, migrate/health com redação verificada)

### Plataforma, identidade e isolamento

- [ ] **PLAT-01**: Usuário cria conta e-mail+senha (argon2id) somente com token de convite válido; convite revogado para de valer
- [ ] **PLAT-02**: Usuário faz login e mantém sessão segura (cookie `httpOnly`/`Secure`/`SameSite`); logout revoga
- [ ] **PLAT-03**: Toda leitura/alteração/exclusão por ID verifica `ownerId`/`workspaceId` da sessão no servidor; recurso fora do escopo retorna 404 sem revelar existência
- [ ] **PLAT-04**: Testes automatizados cobrem dono, estranho e ID adulterado via `curl` em leitura, alteração e exclusão de cada recurso com ID
- [ ] **PLAT-05**: Rate limit em login/convite/busca/exportação; `X-Request-Id` propagado; erros no formato `{error:{code,message,details,requestId}}` sem vazar stack/SQL/tokens

### Convenções e capabilities headless

- [ ] **CORE-01**: REST sob `/api/v1`, JSON UTF-8, datas ISO 8601 UTC, IDs opacos, camelCase público / snake_case banco, paginação `limit`+cursor com `nextCursor`/`hasMore`
- [ ] **CORE-02**: Capabilities executáveis por `execute(name, input, ActorContext)`; HTTP/CLI/MCP adaptam E/S sem duplicar regra de negócio
- [ ] **CORE-03**: Operações com efeitos externos/jobs aceitam `Idempotency-Key` sem criar duplicatas na janela
- [ ] **CORE-04**: Jobs longos são observáveis (`queued|running|succeeded|partial|failed|cancelled`), com timeout de fila, retry idempotente e cancelamento; logs sem credenciais
- [ ] **CORE-05**: CLI opera o CORE por API (nunca PG direto) e MCP expõe só tools semânticas autorizadas, sem SQL genérico nem acesso a tokens/tabelas

### Lab — projetos, buscas e execuções

- [ ] **LAB-01**: Usuário cria lista, lê e atualiza projetos de pesquisa (título + pergunta); múltiplos projetos por usuário
- [ ] **LAB-02**: Usuário define busca declarativa por projeto (termo, booleanos, filtros ano/tipo/fonte/área/instituição/programa, fontes `bdtd|capes|ambas`, default ambas) sem executar
- [ ] **LAB-03**: Usuário executa busca → cria `SearchRun` temporal (`queued|running|ok|partial|failed|cancelled`, `executedAt`, métricas); reexecução cria novo run com diff de novos vs run anterior
- [ ] **LAB-04**: Execução multi-fonte preserva `source`, `sourceId`, `runId`, `retrievedAt`, adapter/versão, URLs e `rawMetadata`; cadeia `Result→Run→Search→Project` reconstruível
- [ ] **LAB-05**: Falha de uma fonte gera `partial` preservando resultados válidos; cliente sempre consulta estado do `SearchRun` (sync `201` / async `202` + `GET /jobs/:id`)

### Lab — resultados, dedup, corpus e exportação

- [ ] **LAB-06**: Usuário lista resultados por run com paginação/ordenação estável e consulta ficha individual
- [ ] **LAB-07**: Dedup automático agrupa mesma obra entre fontes (chave canônica título+ano+autores SHA-256; `exact|fuzzy`, fuzzy ≥0.9 com confirmação); card transparente com N origens sem apagar proveniência
- [ ] **LAB-08**: Usuário registra/edita decisão de elegibilidade por resultado (`eligible|ineligible|undecided` + motivo/tag); corpus é view derivada dos `eligible` e reflete na hora
- [ ] **LAB-09**: Usuário gerencia tags do projeto (defaults: incluir, excluir, duplicado, indisponível, revisar) e opera decisão no grupo com `duplicate-divergence` por fonte
- [ ] **LAB-10**: Usuário compara 2+ buscas (totais, anos, fontes, sobreposição) para escolher a estratégia do corpus
- [ ] **LAB-11**: Usuário exporta seleção ou corpus em CSV (completo+tags+decisão), BibTeX (`@phdthesis`/`@mastersthesis`, `school`=instituição, key slug autor+ano+fonte) e JSON (bruto+proveniência+grupos)
- [ ] **LAB-12**: `GET /lab/sources` e `/lab/sources/:name/health` reportam `ok|degraded|offline`, falhas recentes e challenges

### Adapters BDTD/CAPES

- [ ] **SRC-01**: Adapter BDTD busca na API VuFind (`lookfor`+`type`, `filter[]` formato/data, paginação) e enriquece sob demanda via `Record/<id>` (orientador, banca, programa, keywords, resumo)
- [ ] **SRC-02**: Adapter CAPES busca em `POST rest/busca` (`termo` com frase exata entre aspas, filtros `Ano` expandido por ano, paginação ≥5/página) e enriquece via ficha HTML (`#resumo`, `#palavras`, `#download:link_download_arquivo`); sem link quando sem divulgação autorizada
- [ ] **SRC-03**: `SourceClient` compartilhado por instância (cookie jar por fonte, renovação adaptativa anti-challenge, mutex anti-thundering-herd, rate limit global batch ≤10 + wait 2s, circuit breaker, timeout de fila 60s, UA `UhHu-Lab/<versão>`); nenhuma credencial/cookie retorna ao cliente
- [ ] **SRC-04**: Core aplica pós-filtro local do que a fonte não honrou (redundância fonte+Core); registry com `bdtd`+`capes` habilitadas e `oasisbr` desabilitada
- [ ] **SRC-05**: Testes de contrato dos adapters no CI + relatório de cobertura (só BDTD / só CAPES / ambas)

## v2 Requirements

Deferred — fora do CORE v1 / Lab v1.

### Lib/Note/Plan/Prof e suite

- **SUITE-01**: Resultado selecionado do Lab vira registro Lib preservando fonte/IDs/proveniência
- **SUITE-02**: Documento Lib vira referência/citação em nota Note sem duplicação
- **SUITE-03**: Aula Prof relaciona-se a evento Plan por vínculo explícito (sem fundir modelos)
- **SUITE-04**: Capabilities úteis em CLI/MCP com confirmação de destrutivas e auditoria

### Lab futuro / Etapa 3+

- **FUT-01**: Análise/arquivos (Etapa 3): proxy streaming sem copiar PDF no CORE, links assinados curtos
- **FUT-02**: Triagem avançada e assistência por IA com proveniência e revisão humana (CORE funciona sem IA)
- **FUT-03**: Fonte `oasisbr` habilitável; DOAJ como primeira fonte de artigos (fora do v1)
- **FUT-04**: Colaboração no mesmo projeto, SSO/OAuth de login, sync offline completo, Reader completo

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend por app / CORE como gateway fino | Descartado ADR-009; CORE é o backend da suite |
| SQLite como banco do servidor | ADR-009: só cache/local/offline; canônico é PG |
| Supabase auth/RLS/storage/edge na arquitetura nova | Fora da arquitetura; legado só como pesquisa |
| UI de estante própria no v1 | Só via fork Kerko se um dia necessário; Lib fora do crítico |
| Entrega de PDFs no caminho crítico do Lab v1 | ADR-004 adiado para Etapa 3 |
| Microsserviços, Redis/fila externa, extração de módulo já | Sem necessidade operacional comprovada; worker começa simples |
| `Math.random` p/ tokens, `eval`/`new Function` | Proibidos pelo baseline de segurança |
| Auditoria ativa contra produção de terceiros | Antiético e fora de escopo; só local/staging próprio |
| Backup do Nextcloud | Risco aceito pelo dono — não insistir (05-infra §9) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete (checkpoint 2026-09-10: migrate + /health `db: ok` vs PG real) |
| FOUND-02 | Phase 1 | Complete (01-01) |
| FOUND-03 | Phase 1 | In progress (gates+integration green vs real PG; contract approved 1–24; CI green pending first push) |
| FOUND-04 | Phase 1 | Complete (checkpoint 2026-09-10: roles+grants, envs 600 ignored, history clean) |
| PLAT-01 | Phase 2 | Pending |
| PLAT-02 | Phase 2 | Pending |
| PLAT-03 | Phase 2 | Pending |
| PLAT-04 | Phase 2 | Pending |
| PLAT-05 | Phase 2 | Pending |
| CORE-01 | Phase 2 | Pending |
| CORE-02 | Phase 5 | Pending |
| CORE-03 | Phase 3 | Pending |
| CORE-04 | Phase 3 | Pending |
| CORE-05 | Phase 5 | Pending |
| LAB-01 | Phase 2 | Pending |
| LAB-02 | Phase 3 | Pending |
| LAB-03 | Phase 3 | Pending |
| LAB-04 | Phase 3 | Pending |
| LAB-05 | Phase 3 | Pending |
| LAB-06 | Phase 4 | Pending |
| LAB-07 | Phase 4 | Pending |
| LAB-08 | Phase 4 | Pending |
| LAB-09 | Phase 4 | Pending |
| LAB-10 | Phase 4 | Pending |
| LAB-11 | Phase 4 | Pending |
| LAB-12 | Phase 3 | Pending |
| SRC-01 | Phase 3 | Pending |
| SRC-02 | Phase 3 | Pending |
| SRC-03 | Phase 3 | Pending |
| SRC-04 | Phase 3 | Pending |
| SRC-05 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-09*
*Last updated: 2026-09-09 after initialization (derivados de 07-core-contract §21, 03-lab-spec §11, 08-security gate)*
