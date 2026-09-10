# Roadmap: UhHu! — CORE v1 + Lab v1

## Overview

Da fundação executável (monorepo + PG + gates) ao primeiro vertical slice do Lab: identidade multiusuário com isolamento comprovado, buscas BDTD/CAPES com runs temporais e proveniência, corpus com dedup/decisões/exportação, e a prova headless (CLI/MCP nos mesmos casos de uso). Cada fase entrega comportamento observável sem depender de UI bonita nem de módulos futuros.

## Phases

- [ ] **Phase 1: Fundação executável** - Monorepo, PG DEV, migrations e gates verdes
- [ ] **Phase 2: Plataforma e isolamento** - Auth, sessão, convite, ownerId server-side, convenções REST
- [ ] **Phase 3: Buscas e adapters** - Searches, runs temporais, BDTD/CAPES, jobs, health
- [ ] **Phase 4: Corpus e exportação** - Dedup, elegibilidade, tags, comparação, CSV/BibTeX/JSON
- [ ] **Phase 5: Prova headless** - CLI/MCP mínimos nos mesmos casos de uso + gate de suite

## Phase Details

### Phase 1: Fundação executável
**Goal**: Dev sobe o CORE contra PostgreSQL DEV com migrations versionadas e CI de segurança verde, sem código de produto ainda
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. Dev executa `pnpm install`, aplica migrations e obtém health check contra PostgreSQL DEV
  2. Typecheck, lint, testes vazios, Gitleaks (tree+histórico), SAST e `pnpm audit` passam no CI
  3. PG dev e prod são separados (bancos, credenciais, `.env`); nenhum segredo no repo ou logs
  4. Contrato inicial validado por seções com Paulo antes de congelar o schema
**Plans**: 3 plans in 3 waves (01 monorepo → 02 PG+migrations+health → 03 CI/gates+validacao do contrato)

Plans:
- [x] 01-01-PLAN.md — Wave 1: esqueleto monorepo pnpm + TS strict + fronteiras (FOUND-02; D-01--D-04) — done 2026-09-09
- [x] 01-02-PLAN.md — Wave 2 *(blocked on Wave 1)*: PG DEV + envs + Drizzle prova de infra + GET /health (FOUND-01, FOUND-04; D-05--D-10) — done 2026-09-09 (código+gates verdes; `db: ok` vivo pendente de user_setup tailnet)
- [x] 01-03-PLAN.md — Wave 3 *(blocked on Wave 2)*: CI fail-closed + suite smoke/integracao + checkpoint de validacao do contrato com Paulo (FOUND-03; D-11--D-14) — done 2026-09-10 (código + prova viva contra PG real + contrato aprovado 1–24; CI verde estreia no 1º push)

Cross-cutting constraints: nenhum segredo em codigo/Git/logs/respostas; nenhuma tabela de dominio ate o contrato congelar; `any` proibido ate em testes.

### Phase 2: Plataforma e isolamento
**Goal**: Contas, sessões e isolamento ownerId funcionando e testados adversarialmente em toda rota com ID
**Depends on**: Phase 1
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, CORE-01, LAB-01
**Success Criteria** (what must be TRUE):
  1. Usuário registra (com convite), loga, mantém sessão e desloga; convite revogado para de valer
  2. Dois usuários não leem/alteram/excluem recursos um do outro; ID adulterado retorna 404
  3. Testes dono/estranho/ID-adulterado via `curl` passam para projetos e cada recurso com ID
  4. Erros seguem o envelope com `requestId`; rate limit e paginação funcionam
**Plans**: TBD

Plans:
- [ ] 02-01: TBD na discussão da fase

### Phase 3: Buscas e adapters
**Goal**: Busca real BDTD+CABES com runs temporais, proveniência e degradação graciosa
**Depends on**: Phase 2
**Requirements**: LAB-02, LAB-03, LAB-04, LAB-05, LAB-12, SRC-01, SRC-02, SRC-03, SRC-04, SRC-05, CORE-03, CORE-04
**Success Criteria** (what must be TRUE):
  1. Busca real em cada fonte devolve resultados estruturados (≥1 busca de teste por fonte)
  2. Reexecução cria novo `SearchRun` com diff de novos; histórico persiste
  3. Falha de uma fonte gera `partial` sem apagar resultados válidos; jobs têm estado e cancelamento
  4. Proveniência `Result→Run→Search→Project` + `source/sourceId/rawMetadata` reconstruível; health `ok|degraded|offline` visível
**Plans**: TBD

Plans:
- [ ] 03-01: TBD na discussão da fase

### Phase 4: Corpus e exportação
**Goal**: Pesquisador revisa, decide, compara e exporta o corpus com proveniência
**Depends on**: Phase 3
**Requirements**: LAB-06, LAB-07, LAB-08, LAB-09, LAB-10, LAB-11
**Success Criteria** (what must be TRUE):
  1. Dedup identifica duplicatas entre fontes em grupo expansível; divergência por fonte funciona
  2. Decisões + tags persistem por projeto; corpus (view de elegíveis) consistente na hora
  3. Comparação entre 2+ buscas mostra totais, anos, fontes e sobreposição
  4. Exportação CSV/BibTeX/JSON correta para seleção e corpus
**Plans**: TBD

Plans:
- [ ] 04-01: TBD na discussão da fase

### Phase 5: Prova headless
**Goal**: Mesma capability executável por REST e por CLI/MCP sem duplicar regra; gates de suite verdes
**Depends on**: Phase 4
**Requirements**: CORE-02, CORE-05
**Success Criteria** (what must be TRUE):
  1. Uma capability do Lab executa por REST e por CLI/MCP sem implementação paralela de negócio
  2. Auditoria adversarial (arquivo a arquivo) + testes IDOR + scanners passam; achados críticos/altos corrigidos ou com aceite formal
  3. Gate Etapa 2 do roadmap geral atendido: projeto→busca→run→revisão→dedup→decisão→exportação sem tocar o banco
**Plans**: TBD

Plans:
- [ ] 05-01: TBD na discussão da fase

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fundação executável | 3/3 | In progress (fecha no 1º push com CI verde) | - |
| 2. Plataforma e isolamento | 0/TBD | Not started | - |
| 3. Buscas e adapters | 0/TBD | Not started | - |
| 4. Corpus e exportação | 0/TBD | Not started | - |
| 5. Prova headless | 0/TBD | Not started | - |
