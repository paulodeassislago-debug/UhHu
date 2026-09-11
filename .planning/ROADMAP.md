# Roadmap: UhHu! — CORE v1 + Lab v1

## Overview

Da fundação executável (monorepo + PG + gates) ao primeiro vertical slice do Lab: identidade multiusuário com isolamento comprovado, buscas BDTD/CAPES com runs temporais e proveniência, corpus com dedup/decisões/exportação, e a prova headless (CLI/MCP nos mesmos casos de uso). Cada fase entrega comportamento observável sem depender de UI bonita nem de módulos futuros.

## Phases

- [x] **Phase 1: Fundação executável** - Monorepo, PG DEV, migrations e gates verdes
- [x] **Phase 2: Plataforma e isolamento** - Auth, sessão, convite, ownerId server-side, convenções REST (COMPLETA 2026-09-11 — 4/4 plans, 18/18 integração, curl ALL PASS, 02-VERIFICATION human_needed→approved via HUMAN-UAT 4/4)
- [x] **Phase 3: Buscas e adapters** - Searches, runs temporais, BDTD/CAPES, jobs, health (COMPLETA 2026-09-11 — 6/6 plans, 9/9 integração lab + 42/42 suite + curl ALL PASS, checkpoint "approved with capes blocked")
- [x] **Phase 4: Corpus e exportação** - Dedup, elegibilidade, tags, comparação, CSV/BibTeX/JSON (COMPLETA 2026-09-11 — 5/5 plans, suite 90/90 + curl ALL PASS vivo + checkpoint approved)
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
**Plans**: 4 plans in 3 waves (01 fundacao → 02 auth + 03 projetos em paralelo → 04 wiring+IDOR+checkpoint)

Plans:
- [x] 02-01-PLAN.md — Wave 1: contratos compartilhados + schema/migration 0001 (users/sessions/invites/resets/projects) + envelope PT-BR/requestId/ActorContext (CORE-01, PLAT-05; D-23, D-25, D-27) — done 2026-09-11
- [x] 02-02-PLAN.md — Wave 2 *(blocked on Wave 1)*: convites admin + registro/login/logout + sessoes multi-device + reset + lockout 5→15min (PLAT-01, PLAT-02, PLAT-05; D-15--D-21, D-26) — done 2026-09-11
- [x] 02-03-PLAN.md — Wave 2 *(blocked on Wave 1, paralelo ao 02-02)*: CRUD projetos + isolamento ownerId + arquivar/excluir + paginacao cursor (LAB-01, PLAT-03, CORE-01; D-22--D-24, D-27) — done 2026-09-11
- [x] 02-04-PLAN.md — Wave 3 *(blocked on Wave 2)*: wiring boot + rate limit + matriz IDOR curl + auditoria adversarial + checkpoint humano (PLAT-03, PLAT-04, PLAT-05; D-25, D-26) — done 2026-09-11 (checkpoint approved + curl ALL PASS)

Cross-cutting constraints: `ownerId` sempre da sessao, nunca do body; fora do escopo → 404 sem revelar existencia; envelope `{error:{code,message,details,requestId}}` PT-BR sem stack/SQL/tokens; `any` proibido ate em testes; `Math.random` proibido para tokens.

### Phase 3: Buscas e adapters
**Goal**: Busca real BDTD+CABES com runs temporais, proveniência e degradação graciosa
**Depends on**: Phase 2
**Requirements**: LAB-02, LAB-03, LAB-04, LAB-05, LAB-12, SRC-01, SRC-02, SRC-03, SRC-04, SRC-05, CORE-03, CORE-04
**Success Criteria** (what must be TRUE):
  1. Busca real em cada fonte devolve resultados estruturados (≥1 busca de teste por fonte)
  2. Reexecução cria novo `SearchRun` com diff de novos; histórico persiste
  3. Falha de uma fonte gera `partial` sem apagar resultados válidos; jobs têm estado e cancelamento
  4. Proveniência `Result→Run→Search→Project` + `source/sourceId/rawMetadata` reconstruível; health `ok|degraded|offline` visível
**Plans**: 6 plans in 5 waves (01 contratos+schema → 02 SourceClient/registry + 03 adapters em paralelo → 04 lib execução → 05 rotas+wiring → 06 prova+IDOR+checkpoint)

Plans:
- [x] 03-01-PLAN.md — Wave 1: contratos lab + erros PT-BR + schema/migration 0002 (LAB-02/03/04, CORE-03/04) — done 2026-09-11
- [x] 03-02-PLAN.md — Wave 2 *(blocked on 03-01)*: SourceClient + registry + health (SRC-03, SRC-04-parte, LAB-12-parte) — done 2026-09-11
- [x] 03-03-PLAN.md — Wave 2 *(blocked on 03-01, paralelo ao 03-02)*: adapters BDTD/CAPES + pós-filtro + contrato com fixtures (SRC-01, SRC-02, SRC-04, SRC-05) — done 2026-09-11
- [x] 03-04-PLAN.md — Wave 3 *(blocked on 03-01–03)*: lib searches owner-first + motor de runs sync/async/partial/diff/idempotência (LAB-02/03/04/05, CORE-03/04; D-28–D-39-núcleo) — done 2026-09-11
- [x] 03-05-PLAN.md — Wave 4 *(blocked on 03-04)*: rotas lab+jobs+sources/health + throttle + boot (LAB-02/03/05/12, CORE-03/04) — done 2026-09-11
- [x] 03-06-PLAN.md — Wave 5 *(blocked on 03-05)*: integração PG + curl + auditoria + checkpoint humano busca real (todos os REQ da fase) — done 2026-09-11 (9/9 + 42/42 + ALL PASS + 0 crit/0 high + "approved with capes blocked"; BDTD viva 893 resultados, CAPES re-teste no próximo ciclo)

### Phase 4: Corpus e exportação
**Goal**: Pesquisador revisa, decide, compara e exporta o corpus com proveniência
**Depends on**: Phase 3
**Requirements**: LAB-06, LAB-07, LAB-08, LAB-09, LAB-10, LAB-11
**Success Criteria** (what must be TRUE):
  1. Dedup identifica duplicatas entre fontes em grupo expansível; divergência por fonte funciona
  2. Decisões + tags persistem por projeto; corpus (view de elegíveis) consistente na hora
  3. Comparação entre 2+ buscas mostra totais, anos, fontes e sobreposição
  4. Exportação CSV/BibTeX/JSON correta para seleção e corpus
**Plans**: 5 plans in 4 waves (01 contratos+puras + 02 schema/migration em paralelo → 03 lib corpus → 04 rotas+integracao → 05 prova+checkpoint)

Plans:
- [x] 04-01-PLAN.md — Wave 1: fastest-levenshtein + contratos dedup/decisao/tags/compare/export + dedup.ts/exports.ts puros + unit smoke (LAB-07, LAB-11; D-40/D-44/D-49/D-51/D-52/D-53) — done 2026-09-11
- [x] 04-02-PLAN.md — Wave 1 (paralelo ao 04-01): schema 8 tabelas + migration 0003 + push BLOCKING + fixtures + skeleton lab-corpus (LAB-07/08/09; D-41/D-42/D-45/D-46) — done 2026-09-11
- [x] 04-03-PLAN.md — Wave 2 *(blocked on 04-01, 04-02)*: lib corpus.ts owner-first (groups/confirm/reject/pin + decisao/tags/divergencia/corpus + compare 4 blocos) (LAB-07/08/09/10; D-40–D-49) — done 2026-09-11
- [x] 04-04-PLAN.md — Wave 3 *(blocked on 04-03)*: rotas lab revisao + export attachment + bucket lab-export + integracao LAB-07–LAB-11 + IDOR (todos menos LAB-06; D-41/D-46/D-48–D-53) — done 2026-09-11
- [x] 04-05-PLAN.md — Wave 4 *(blocked on 04-04)*: curl-corpus.sh ALL PASS + regressao LAB-06 + auditoria + checkpoint humano busca viva (LAB-06–LAB-11) — done 2026-09-11 (approved + 3 fixes checkpoint: mapper BDTD real, ano-null, typecheck raiz)

### Phase 5: Prova headless
**Goal**: Mesma capability executável por REST e por CLI/MCP sem duplicar regra; gates de suite verdes
**Depends on**: Phase 4
**Requirements**: CORE-02, CORE-05
**Success Criteria** (what must be TRUE):
  1. Uma capability do Lab executa por REST e por CLI/MCP sem implementação paralela de negócio
  2. Auditoria adversarial (arquivo a arquivo) + testes IDOR + scanners passam; achados críticos/altos corrigidos ou com aceite formal
  3. Gate Etapa 2 do roadmap geral atendido: projeto→busca→run→revisão→dedup→decisão→exportação sem tocar o banco
**Plans**: 5 plans in 4 waves (01 fundação capabilities+PAT → 02 servidor PAT+execute → 03 CLI + 04 MCP em paralelo → 05 prova+checkpoint)

Plans:
- [x] 05-01-PLAN.md — Wave 1: registry capabilities + execute() + ActorContext pat + PAT contracts + migration 0004 + guard anti-PG D-55 (CORE-02; D-60/D-61/D-55) — done 2026-09-11 (registry 20 caps + execute fail-closed + PAT table/patExpiry + guard 8 its; suite 98/98 PG real; push 0004 deferido ao 05-02)
- [x] 05-02-PLAN.md — Wave 2: pat.ts + Bearer no requireAuth + rotas lab/projects como adaptadores execute() + PAT CRUD com lockout/rate-limit + integração (CORE-02, CORE-05; D-56-servidor/D-58-servidor/D-60–D-63) — done 2026-09-11 (PAT ciclo completo + capabilities 34 nomes + rotas 37/6 execute zero-lib + pat-auth 12/12; suite 110/110 PG real; 14 extensões transicionais, adendo §10 adiado)
- [x] 05-03-PLAN.md — Wave 3 *(blocked on 05-02, paralelo ao 05-04)*: CLI @uhhu/cli (comandos D-64 + tabela/--json + polling 25s + export arquivo + credencial 600) + smoke + integração sem DATABASE_URL (CORE-02, CORE-05; D-56–D-59 lado CLI, D-62, D-64–D-66) — done 2026-09-11 (22 comandos + client PAT + store 600; cli-unit 17/17 + cli-headless 7/7; suite 134/134 PG real; wiring do nome nu adiado)
- [ ] 05-04-PLAN.md — Wave 3 *(blocked on 05-02, paralelo ao 05-03)*: MCP @uhhu/mcp (11 tools + confirm destrutivas + mesmos DTOs) + smoke + integração (CORE-05, CORE-02; D-56–D-59 lado MCP, D-67–D-70)
- [ ] 05-05-PLAN.md — Wave 4 *(blocked on 05-03, 05-04, checkpoint humano)*: prova-headless.sh 3 canais ALL PASS + matriz IDOR + auditoria adversarial + scanners + checkpoint gate Etapa 2 (CORE-02, CORE-05; D-54, D-55-gate, D-57)

Cross-cutting constraints: mesma capability nos 3 canais sem duplicar regra; CLI/MCP só por API (nunca PG direto, guard D-55 fail-closed); Bearer PAT 30d sliding com revogação, mesmo 404 IDOR e envelope PT-BR nos 3 canais; `any` proibido até em testes; `Math.random` proibido para tokens.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fundação executável | 3/3 | Complete | 2026-09-10 |
| 2. Plataforma e isolamento | 4/4 | Complete | 2026-09-11 |
| 3. Buscas e adapters | 6/6 | Complete | 2026-09-11 |
| 4. Corpus e exportação | 5/5 | Complete | 2026-09-11 |
| 5. Prova headless | 3/5 | In progress | - |
