# UhHu! — Suite sobre CORE headless compartilhado

## What This Is

UhHu! é uma suite de apps (Lab, Lib, Note, Plan, Prof) sobre um único backend compartilhado, modular e headless — o UhHu! CORE (REST + CLI + MCP sobre os mesmos casos de uso). Primeiro produto: UhHu! Lab, gerenciador de pesquisas sobre a produção científica brasileira (BDTD + CAPES) com memória temporal, proveniência e exportação. Stack: TypeScript strict, Node LTS, Fastify, Zod, Drizzle, pnpm monorepo, PostgreSQL self-hosted.

## Core Value

Um pesquisador consegue executar uma busca real (BDTD/CAPES) pelo CORE, com isolamento por usuário, proveniência e histórico — sem UI direta no banco e sem Supabase.

## Requirements

### Validated

- ✓ Fundação executável (monorepo, PG DEV, CI fail-closed) — v1.0
- ✓ Plataforma/isolamento (auth, ownerId, IDOR, UAT 4/4) — v1.0
- ✓ Convenções CORE + capabilities execute() nos 3 canais — v1.0
- ✓ Lab v1 (buscas, runs, dedup, corpus, compare, exportação) — v1.0
- ✓ Adapters BDTD/CAPES + SourceClient + partial — v1.0
- ✓ CLI/MCP mínimos + gates (typecheck, IDOR, Gitleaks, SAST, audit, PG) — v1.0

### Active

Próximo milestone definido via `/gsd-new-milestone`. Carry-over técnico conhecido (candidatos):

- [ ] Adendo ao contrato §10: formalizar as 14 extensões transicionais de capability
- [ ] Wiring do bin nu `uhhu` na raiz do monorepo
- [ ] Review info I-01–I-05 (05-REVIEW.md)
- [ ] Re-teste CAPES ao vivo (bloqueio na fonte durante v1.0)

### Out of Scope

- [ ] Backend independente por app — descartado pelo ADR-009; CORE é o backend da suite
- [ ] SQLite como banco do servidor — só cache/local/offline (ADR-009)
- [ ] Supabase (auth/RLS/storage/edge) na arquitetura nova — só material de pesquisa (06-legado)
- [ ] Lib/Note/Plan/Prof v1 antes do Lab validado — regra de não antecipação (ADR-007, 09-roadmap)
- [ ] Triagem avançada/IA, escrita acadêmica por IA, Reader completo — fora do Lab v1
- [ ] Colaboração no mesmo projeto, SSO/OAuth de login, sync offline completo — fora do v1
- [ ] Entrega de PDFs Etapas 3 (proxy/signed) — ADR-004 adiado
- [ ] Microsserviços/filas externas/extração de módulo sem necessidade operacional comprovada

## Context

- Contratos vigentes: `dev-docs/07-core-contract.md` (rascunho v0.1 p/ validação por seções), `03-lab-spec-v1.md` (validada 06/09/2026), `04-fontes-bdtd-capes.md` (probes reais 06/09/2026: BDTD VuFind 7.1.1, CAPES rest/busca JSON; OAI-PMH BDTD desativado; 57% ausência BDTD vs CAPES em amostra "ensino de química").
- Segurança: `dev-docs/08-security-baseline.md` + `AGENTS.md` — IDOR é o principal modelo de ameaça; auditoria adversarial antes de patch automático; revisão humana obrigatória.
- Infra: `dev-docs/05-infra.md` — dev/prod separados na VPS (dirs, containers, portas, .env, bancos); prod atrás de TLS; backup/restore PG antes de produção pública.
- Legado: `planner-docente/` (não modificar no onboarding) + `supabase-legacy-export/` — só pesquisa; Prof/Plan herdam requisitos, nunca arquitetura. Refresh token em texto simples no legado vira cifrado no CORE.
- Roadmap macro: `dev-docs/09-roadmap-geral.md` — fundação → CORE v1 → Lab v1 → Lib → Note → Plan → Prof → suite integrada → evolução. Este GSD cobre fundação + CORE v1 + Lab v1.
- Ambiente DEV atual (09/09/2026, verificado): workspace `/home/coder/projetos/UhHu`; sem Node/pnpm/psql/docker no PATH deste container; vault symlink quebrado (`~/ubuntu/vault` → `/home/ubuntu/...` inexistente aqui) — fonte utilizável é `docs/` (espelho) + `dev-docs/`; sem `.planning` antes deste init; git recém-inicializado (`main`, sem commits).
- GSD: sem runtime Node → `gsd-sdk`/subagents indisponíveis; research paralela pulada (workflow fallback); roadmap gerado inline e ancorado aos dev-docs. `AGENTS.md` existente é normativo e NÃO foi sobrescrito pelo gerador.
- Estado v1.0 SHIPPED 2026-09-11: 5 fases, 23 plans, 104 commits, ~12.4k LOC TS; suite 195/195, typecheck 7/7, scanners zerados; tag v1.0. Dívida conhecida: adendo §10, bin `uhhu`, info I-01–I-05, re-teste CAPES (ver milestones/v1.0-ROADMAP.md).

## Constraints

- **Arquitetura**: CORE compartilhado modular monolith; REST/CLI/MCP mesmos casos de uso; fronteiras `platform|lab|lib|note|plan|prof|integrations`; acesso entre módulos só por contrato/caso de uso/evento — nunca leitura direta de tabela alheia
- **Persistência**: PostgreSQL canônico, dev/prod separados, migrations no monorepo, Drizzle dialeto PG; nenhuma UI acessa banco/storage/externo direto
- **Frontend**: TS `strict`; tipos/DTOs/erros/capabilities em definição única compartilhada (`packages/contracts`); `import type`; view models só com mapeamento explícito; `any` proibido sem exceção (incl. testes/mocks); sem enfraquecer `tsconfig`
- **Segurança**: authZ no backend; `ownerId` da sessão nunca do body; IDs fora do escopo → 404; Zod + limites em toda fronteira; segredos nunca em código/bundle/Git/logs/respostas; OAuth cifrado em repouso; sem `Math.random` p/ tokens; sem `eval`; webhooks com assinatura+timestamp+replay; ZAP só local/staging próprio
- **Processo**: validar contrato por seções com Paulo antes de congelar schema; não alterar decisões do CORE silenciosamente (atualizar ADR/docs primeiro); relatar tarefa só com testes reais executados (`não verificado` quando ausente)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CORE compartilhado + PostgreSQL (ADR-009) | Multiusuário, transações, JSONB, FTS, jobs; evita 5 backends | ✓ Good (v1.0: 195 testes PG real, 5 migrations) |
| Lab primeiro, Lib fora do caminho crítico (ADR-006/007) | Cobertura BDTD+CAPES provada necessária; foco | ✓ Good (v1.0: Lab v1 entregue; Lib próxima) |
| Multiusuário desde v1, convite beta (ADR-008) | Isolamento ownerId; IDOR como ameaça principal | ✓ Good (v1.0: IDOR 4/4 + 10/10, UAT passed) |
| BDTD VuFind + CAPES rest/busca, ambas obrigatórias | 57% ausência BDTD vs CAPES; dedup por interseção | ✓ Good (v1.0: partial provado ao vivo; shape real mapeado) |
| Capabilities execute() fail-closed; CLI/MCP só por API | Uma regra, três superfícies; guard D-55 | ✓ Good (v1.0: 37/6 call-sites zero-lib, ALL PASS 3 canais) |
| PAT Bearer 30d sliding, mesmo envelope/404 nos 3 canais | Fecha questão aberta §8.1/§22-1 do contrato | ✓ Good (v1.0: ciclo+revogação+lockout compartilhado) |
| BDTD/search sem ano → year=null por desenho | VuFind não retorna ano; enrich só on-demand | ✓ Good (v1.0: fuzzy bloqueado, bucket 'desconhecido') |
| GSD ancorado aos dev-docs, sem duplicar roadmap | dev-docs + docs/ já são a base validada; vault é fonte da verdade | ✓ Good (este init) |
| `AGENTS.md` preservado (não sobrescrito pelo gerador GSD) | Normativo do projeto; gerador sobrescreveria | ✓ Good |
| Git `main` inicializado sem commits de código | Rastrear `.planning` + fundação; código só após gates | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-11 after v1.0 milestone (shipped; próxima definição via /gsd-new-milestone)*
