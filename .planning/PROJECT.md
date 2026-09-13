# UhHu! — Suite sobre CORE headless compartilhado

## What This Is

UhHu! é uma suite de apps (Lab, Lib, Note, Plan, Prof) sobre um único backend compartilhado, modular e headless — o UhHu! CORE (REST + CLI + MCP sobre os mesmos casos de uso). Primeiro produto: UhHu! Lab, gerenciador de pesquisas sobre a produção científica brasileira (BDTD + CAPES) com memória temporal, proveniência e exportação. Stack: TypeScript strict, Node LTS, Fastify, Zod, Drizzle, pnpm monorepo, PostgreSQL self-hosted.

## Core Value

Um pesquisador consegue executar uma busca real (BDTD/CAPES) pelo CORE, com isolamento por usuário, proveniência e histórico — sem UI direta no banco e sem Supabase.

## Current Milestone: v1.1 Lab UI v1 — ✅ SHIPPED 2026-09-13

**Goal (achieved):** Pesquisador usa o Lab por interface tablet-first (web/PWA beta + nativo Android/iOS) consumindo SOMENTE o CORE — slice vertical login → corpus/export primeiro.

**Shipped:** Phases 6–9 (26 plans, 09-11→09-13) — Expo app + auth cookie/PAT + CORS; projetos/buscas/runs com polling; triagem infinita + decisão/tags + lote incremental; corpus/export 3 formatos + compare 2–4 + referência manual. Gates: lab 121/121, smoke 28/28, PG 20/20, IDOR 16/16, auditorias 0 crit/0 high, UATs 06/07/08 approved + 09 7/7. Tag `v1.1`. Archives: `milestones/v1.1-ROADMAP.md`, `milestones/v1.1-REQUIREMENTS.md`. Audit `tech_debt` (`.planning/v1.1-MILESTONE-AUDIT.md`): sem blockers; dívida documentada (H-01 frozen-vs-live, corpus-100, getJob órfão, Nyquist 6–9).

## Next Milestone Goals (v1.2+ candidates, unscoped)

- Refinamento visual pós-uso real (UIV-01/02: paleta, tipografia, animações)
- Métrica "menos ruído" v2 com taxa de elegibilidade pós-triagem (UIV-03, amostra ~20)
- Conveniência de triagem: lote (UIV-04), cache local do último run (UIV-05)
- Dívida v1.1: H-01 (decisão frozen-vs-live), corpus >100 paginação, getJob, referenceSearchId dangling
- Pendência Paulo 12/09: autocomplete de filtros de área (pós-filtro até seleção explícita)
- Carry-over v1.0: adendo contrato §10 (14 extensões), wiring bin nu `uhhu`, review info I-01–I-05, re-teste CAPES ao vivo

**Target features (v1.1, all shipped):**
- Scaffold Expo + TypeScript strict em `apps/lab` + client CORE tipado (contracts em definição única)
- Auth web (cookie httpOnly) + nativo (PAT por device em secure storage) + CORS da API para origem do web beta
- Projetos: lista/criar/arquivar + cabeçalho com pergunta + abas (Estratégias/Comparação/Corpus)
- Busca: formulário + execução com polling de run + estados ok/parcial/falha/cancelled
- Resultados: cards + DedupGroup expansível + decisão elegibilidade + tags + badge `isNew`
- Corpus: view derivada + filtros + export CSV/BibTeX/JSON por grupo deduplicado inteiro
- Comparação 2–4 buscas com destaque só "mais inclusiva" + escolha manual da referência
- CORE (§14): migration `referenceSearchId` nullable + `isNew` derivado on-read + diálogo hard-delete com cascata

## Requirements

### Validated

- ✓ Fundação executável (monorepo, PG DEV, CI fail-closed) — v1.0
- ✓ Plataforma/isolamento (auth, ownerId, IDOR, UAT 4/4) — v1.0
- ✓ Convenções CORE + capabilities execute() nos 3 canais — v1.0
- ✓ Lab v1 (buscas, runs, dedup, corpus, compare, exportação) — v1.0
- ✓ Adapters BDTD/CAPES + SourceClient + partial — v1.0
- ✓ CLI/MCP mínimos + gates (typecheck, IDOR, Gitleaks, SAST, audit, PG) — v1.0
- ✓ Fundação do app Lab UI (Expo scaffold + client tipado + auth web/PAT + estados §11 + lista rolável) — v1.1 Phase 6
- ✓ Suporte CORE p/ UI (`referenceSearchId` migration + `isNew` on-read + CORS allowlist) — v1.1 Phase 6
- ✓ Projetos/buscas/execução na UI (modal, form §6, polling, cascata, histórico, UUID fix, lápis ✎) — v1.1 Phase 7 (UAT 4/4 tablet 12/09)
- ✓ Resultados/triagem na UI (infinito+filtros, decisão mutável, dedup expansível, tags, ficha, isNew só-anteriores) — v1.1 Phase 8 (UAT 3/3 tablet 12/09)
- ✓ Busca completa incremental (lote 100/fonte + BUSCAR MAIS + totalKnown) — v1.1 Phase 8 (decisão revisada Paulo 12/09)
- ✓ Contorno CAPES (Ano-only, sem Grande Área, year dataDefesa) + decisões definitivas (termo cru fiel ao site; MP terceiro valor separado) — v1.1 Phase 8 (prova viva bate com o site)
- ✓ Corpus (§10) + export por grupo inteiro nos 3 formatos + BibTeX MP — v1.1 Phase 9 (UAT 7/7 + beta IDOR 16/16)
- ✓ Comparação (§9) só "mais inclusiva" + referência manual — v1.1 Phase 9 (UAT 7/7)
- ✓ CORE §14 completo na UI + gates verdes fim-a-fim — v1.1 Phases 6–9 (lab 121/121, smoke 28/28, auditorias limpas)

### Active (next milestone, unscoped)

- [ ] Escopo v1.2 a definir via `/gsd-new-milestone` (candidatos em "Next Milestone Goals" acima)
- [ ] Carry-over v1.0 (fora do caminho crítico UI; só se bloquear): adendo contrato §10 (14 extensões), wiring bin nu `uhhu`, review info I-01–I-05, re-teste CAPES ao vivo
- [ ] Pendência Paulo 12/09: UI de seleção com autocomplete para filtros de área (Grande Área nunca vai à fonte — área cai no pós-filtro até existir seleção explícita)

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
- Out of Scope vigente confirmado em v1.1: paleta/tema visual, refinamento de componentes, IA/síntese, etapa Análise, Lib/Note/Plan/Prof UI, Nextcloud (decisão Paulo 10–11/09/2026)
- Estado v1.0 SHIPPED 2026-09-11: 5 fases, 23 plans, 104 commits, ~12.4k LOC TS; suite 195/195, typecheck 7/7, scanners zerados; tag v1.0. Dívida conhecida: adendo §10, bin `uhhu`, info I-01–I-05, re-teste CAPES (ver milestones/v1.0-ROADMAP.md).
- Estado v1.1 SHIPPED 2026-09-13: 4 fases (6–9), 26 plans, 130+ commits, +34k LOC; lab 121/121, smoke 28/28, PG 20/20, IDOR 16/16, auditorias 0 crit/0 high; UATs 06/07/08 approved + 09 7/7; tag v1.1. Dívida: H-01 frozen-vs-live, corpus-100, getJob órfão, Nyquist 6–9 (ver milestones/v1.1-ROADMAP.md + v1.1-MILESTONE-AUDIT.md).

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
| Expo Go + web beta sem EAS; CORS allowlist exata (v1.1 D-03–D-06) | Tablet-first sem infra de release; auth íntegra | ✓ Good (UATs approved, IDOR 16/16) |
| Busca incremental 100/fonte + BUSCAR MAIS (rev. 08-07) | Run longo eager afugenta; puxadas sob demanda | ✓ Good (prova 250 em lotes + IDOR) |
| CAPES Ano-only + MP terceiro valor + termo cru (08-09) | Fidelidade ao site da fonte; sem combo rejeitado | ✓ Good (prova viva bate com o site) |
| Export blob+anchor/Share zero dep; referência só memória (D-22–D-26) | Sem expo-sharing/file-system; sem "menos ruído" | ✓ Good (beta attachments + UAT 7/7) |

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
*Last updated: 2026-09-13 after v1.1 Lab UI v1 shipped (phases 6–9; tag v1.1)*
