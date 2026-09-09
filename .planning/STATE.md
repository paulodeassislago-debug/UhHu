# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-09)

**Core value:** Um pesquisador consegue executar uma busca real (BDTD/CAPES) pelo CORE, com isolamento por usuário, proveniência e histórico.
**Current focus:** Phase 1: Fundação executável (01-03 tasks 1-2 done — CI+gates+suite; CHECKPOINT humano pendente)

## Current Position

Phase: 1 of 5 (Phase 1 executing — 01-03 checkpoint-pending)
Plan: 3 of 3 in current phase
Status: 01-03 tasks 1-2 complete (commits 4e1b9a8, 7d68fd2) — BLOCKED on human checkpoint (task 3: validacao do contrato com Paulo)
Last activity: 2026-09-09 — 01-03 tasks 1-2 executed (gates.yml 6 jobs fail-closed + suite smoke/integracao + menor privilegio)

Progress: [██░░░░░░░░] 2 plans complete (Phase 1: 2/3)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: ~10min
- Total execution time: ~19min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Fundação executável | 2 | ~19min | ~10min |

**Recent Trend:**
- Last 5 plans: 01-01, 01-02 done
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: GSD ancorado aos dev-docs; `AGENTS.md` preservado; research reutilizada
- 01-01: gates lint/format escopados ao monorepo via ignores (legado e docs fora do gate); `tsconfig.base` sem `outDir`/`rootDir`; placeholders sem imports cross-workspace até existir `dist`; `pnpm-lock.yaml` commitado
- 01-02: entradas `@uhhu/config`/`@uhhu/db` apontam para `src/` (sem build ainda); meta do drizzle-kit (journal+snapshot) commitada; `drizzle.config.ts` consome env validado; `HealthResponse` em `health.ts` até a validação do contrato (D-08); `x-request-id` com allowlist + `migrate` com redação total (auditoria)
- 01-03 (tasks 1-2): CI fail-closed 6 jobs + aceite formal como única exceção; vitest workspace smoke+integration com env dummy condicional (nunca sobrescreve real); `sql` via `@uhhu/db` (D-10); skip de integração só em offline definitivo; `migrate` loga cadeia de causas redigida; FOUND-03 segue aberto até CI verde + aprovação humana

### Pending Todos

None yet.

### Blockers/Concerns

- CHECKPOINT BLOQUEANTE 01-03/task 3: validação do contrato por seções com Paulo pendente (`approved: <seções>`); sem isso Phase 1 não fecha (critério 4) e FOUND-03 segue aberto
- Branch protection de `main` exigindo `gates` ainda não ativada (item do checkpoint — Settings > Branches, manual)
- Primeiro push vai estrear `gates.yml` no GitHub Actions (6 jobs nunca executados em CI ainda)
- Toolchain resolvida neste container (node v22.17.0 + pnpm 9.15.0); sem PostgreSQL/Docker aqui — PG DEV vive na VPS via tailnet (D-06)
- `db:migrate` aplicado + `/health` com `db: ok` pendentes de `user_setup` na máquina tailnet (comandos em 01-02-SUMMARY.md)
- Vault symlink quebrado aqui — usar `docs/` + `dev-docs/`; sincronizar com vault via bridge
- Contrato CORE v0.1 ainda rascunho — validar por seções com Paulo antes de congelar schema

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-09-09
Stopped at: 01-03 checkpoint-pending (tasks 1-2 done) — awaiting human: validacao do contrato por secoes + branch protection + VPS migrate/curl
Resume file: .planning/phases/01-fundacao-executavel/01-03-PLAN.md (task 3 checkpoint)
