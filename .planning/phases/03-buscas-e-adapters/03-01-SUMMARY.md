---
phase: 03-buscas-e-adapters
plan: "01"
subsystem: database
tags: [zod, drizzle, postgres, contracts, lab, migration]

# Dependency graph
requires:
  - phase: 02-plataforma-e-isolamento
    provides: [packages/contracts conventions, packages/db Drizzle setup + migration 0001, envelope PT-BR]
provides:
  - Contratos lab em definição única (Search/SearchRun/Result/SourceHealth/Job + cursor fonte|rank|id)
  - Catálogo de erros PT-BR estendido (SOURCE_DISABLED, SOURCE_UNAVAILABLE, IDEMPOTENCY_CONFLICT)
  - Schema Drizzle + migration 0002 com as 5 tabelas lab (aplicada contra PG DEV)
affects: [03-02 SourceClient/registry, 03-03 adapters, 03-04 lib execução, 03-05 rotas]

# Tech tracking
tech-stack:
  added: []
  patterns: [Zod-first contracts in packages/contracts, CHECKs mirrored in Postgres, jsonb snapshots for temporal runs]

key-files:
  created: [packages/contracts/src/lab.ts, packages/db/drizzle/0002_fancy_hiroim.sql]
  modified: [packages/contracts/src/errors.ts, packages/contracts/src/index.ts, packages/db/src/schema.ts]

key-decisions:
  - "PerSourceMetrics.status inclui 'skipped' para buscas de fonte única (Record exige ambas as chaves)"
  - "SourceHealthDTO.source tipado como LabSource (inclui oasisbr) para health de qualquer fonte do registry"
  - "jsonb sem $type no schema do db (sem nova dependência contracts→db; espelho estrutural, não import)"

patterns-established:
  - "Runs congelam snapshot (term/filters/sources) — diff e proveniência sobrevivem à edição da Search"
  - "decodeResultsCursor nunca lança: retorna null em malformado (molde pagination.ts)"

requirements-completed: [LAB-02, LAB-03, LAB-04, CORE-03, CORE-04]

# Metrics
duration: ~5min
completed: 2026-09-11
---

# Phase 3 Plan 1: Fundação lab (contratos + tabelas) Summary

**Schemas Zod de Search/SearchRun/Result/Source/Job em definição única + migration 0002 com 5 tabelas lab (CHECKs/índices/UNIQUE) aplicada contra PG DEV**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-11T02:50:24Z
- **Completed:** 2026-09-11T02:52:59Z
- **Tasks:** 2
- **Files modified:** 7 (3 contracts + 4 db incl. meta)

## Accomplishments

- `packages/contracts/src/lab.ts` (286 linhas): searchTerm/filters/sources, create/update, runStatus 6 estados, DTOs Search/SearchRun/Result/RunMetrics/SourceHealth/Job, cursor `fonte|rank|id` base64url com decode null-safe
- `errors.ts`: `SOURCE_DISABLED`, `SOURCE_UNAVAILABLE`, `IDEMPOTENCY_CONFLICT` no type E no ERROR_CATALOG com mensagens PT-BR exatas do plano
- `packages/db/src/schema.ts`: `labSearches`, `labSearchRuns`, `labResults`, `labIdempotencyKeys`, `labSourceEvents` com CHECKs, índices e FKs cascade
- Migration `0002_fancy_hiroim.sql` gerada via `drizzle-kit generate` e aplicada contra PG DEV com sucesso (5 tabelas vivas, migrations count 3)
- `pnpm typecheck` verde (root + pacotes), eslint limpo nos arquivos tocados, zero `any`

## task Commits

Each task was committed atomically:

1. **task 1: contratos lab em packages/contracts** - `175b12b` (feat)
2. **task 2: schema Drizzle + migration 0002 das tabelas lab** - `052e9fd` (feat)

**Plan metadata:** `ded3ac5` (docs: complete plan)

## Files Created/Modified

- `packages/contracts/src/lab.ts` - Schemas Zod + DTOs de busca/run/result/sources/health + cursor (criado)
- `packages/contracts/src/errors.ts` - 3 novos códigos PT-BR no type + ERROR_CATALOG (modificado)
- `packages/contracts/src/index.ts` - export `./lab.js` (modificado)
- `packages/db/src/schema.ts` - 5 tabelas lab + tipos LabSearch/LabSearchRun/LabResult/LabIdempotencyKey/LabSourceEvent (modificado)
- `packages/db/drizzle/0002_fancy_hiroim.sql` - Migration versionada das 5 tabelas (criado)
- `packages/db/drizzle/meta/0002_snapshot.json` - Snapshot drizzle-kit (criado)
- `packages/db/drizzle/meta/_journal.json` - Journal atualizado (modificado)

## Decisions Made

- `PerSourceMetrics.status` = `'ok' | 'failed' | 'skipped'`: o plano exige `Record<'bdtd'|'capes', ...>` (ambas as chaves sempre presentes); buscas de fonte única precisam representar a fonte não executada sem violar o tipo — `skipped` resolve sem `Partial`.
- `SourceHealthDTO.source: LabSource` (inclui `oasisbr`): health pode reportar qualquer fonte do registry, inclusive desabilitadas; rotas decidem 400 SOURCE_DISABLED.
- `ResultDTO.docType: DocType | null`: adapters normalizam para `masterThesis|doctoralThesis`; valores desconhecidos viram `null`, nunca string solta.
- `lab_search_runs.created_by` sem `onDelete: cascade` (default `no action`): a cadeia users→projects→searches→runs já remove em cascata; FK simples evita duplo caminho de deleção.
- `jsonb` sem `.$type<>()` no schema do db: evita introduzir dependência `@uhhu/contracts` em `@uhhu/db`; espelho estrutural documentado, não import.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `pnpm --filter @uhhu/db db:generate` falha sem env (drizzle.config.ts parseia `env` do `@uhhu/config` mesmo sem conectar): resolvido exportando `.env.dev.cs` na sessão (`set -a; source .env.dev.cs`) — generate não conecta, migrate conectou no PG DEV real e aplicou com sucesso. Comportamento esperado do fail-closed, não bug.
- NOTICE `relation "__drizzle_migrations" already exists, skipping` no migrate: benigno (tabela de controle já existia da 0001); migrate reportou sucesso e as 5 tabelas foram provadas vivas via query direta.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 03-02 (SourceClient/registry) e 03-03 (adapters) desbloqueados: tipos `ExecutableSource`, `RunMetrics`, `SourceHealthDTO`, `PerSourceMetrics` e tabelas `lab_source_events`/`lab_results` disponíveis.
- 03-04 (lib execução) desbloqueado: snapshots, `created_by` por usuário, `lab_idempotency_keys` (24h) e UNIQUE(run,source,sourceId) para o diff de novos.
- Nenhum blocker. `oasisbr` passa no schema e falha na rota (D-33) — 03-05 implementa o 400.

---
*Phase: 03-buscas-e-adapters*
*Completed: 2026-09-11*

## Self-Check: PASSED
- SUMMARY exists; commits 175b12b + 052e9fd exist; migration 0002 contains 5 lab tables (6 refs to lab_searches incl. FK/index).
