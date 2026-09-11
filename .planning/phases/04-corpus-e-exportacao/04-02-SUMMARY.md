---
phase: 04-corpus-e-exportacao
plan: 02
subsystem: database
tags: [drizzle, postgres, migration, dedup, fixtures, integration]

# Dependency graph
requires:
  - phase: 03-buscas-e-adapters
    provides: [lab_searches/lab_search_runs/lab_results, migrate harness, lab-search-runs.test.ts]
  - phase: 04-corpus-e-exportacao
    provides: [04-01 contratos puros (canonicalKey por conteudo)]
provides:
  - 8 tabelas lab de revisao com UNIQUEs/CHECKs/FKs + 0003_corpus aplicada no PG DEV
  - fixtures dedup-overlap.json (8 itens exato/fuzzy/distinct/cross-ano)
  - skeleton lab-corpus.test.ts (harness 2 usuarios verde)
affects: [04-03, 04-04, corpus lib, rotas lab]

# Tech tracking
tech-stack:
  added: []
  patterns: [content-key identity (projectId, canonicalKey), wipe FK-safe children-first, describe.skipIf offline]

key-files:
  created: [packages/db/drizzle/0003_corpus.sql, tests/integration/fixtures/dedup-overlap.json, tests/integration/lab-corpus.test.ts]
  modified: [packages/db/src/schema.ts, packages/db/drizzle/meta/_journal.json]

key-decisions:
  - "drizzle-kit generate --name corpus para 0003_corpus.sql (journal via generate, nunca editado a mao)"
  - "labGroupTags sem id proprio (PK logica groupId+tagId via UNIQUE)"
  - "labGroupDecisions/labCanonicalPins com UNIQUE(groupId): 1 decisao/pin por grupo (D-45/D-46)"

patterns-established:
  - "Review por (projectId, canonicalKey); lab_results.id so em members; rejected_pairs guarda par de chaves"
  - "Seed preguicoso de tags (sem data migration, RESEARCH A6) — implementado em 04-03"

requirements-completed: [LAB-07, LAB-08, LAB-09]

# Metrics
duration: ~30min
completed: 2026-09-11
---

# Phase 4 Plan 2: Persistencia da revisao Summary

**Schema de 8 tabelas de revisao enderecadas por chave de conteudo + migration 0003 aplicada no PG DEV + fixtures de threshold + harness de integracao com 2 usuarios**

## Performance

- **Duration:** ~30min
- **Started:** 2026-09-11T10:35:00Z
- **Completed:** 2026-09-11T11:05:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- schema.ts com labDedupGroups/Members/GroupDecisions/Divergences/Tags/GroupTags/RejectedPairs/CanonicalPins (UNIQUEs + CHECKs espelhando Zod, FKs cascade)
- 0003_corpus.sql com 8 CREATE TABLE gerada via drizzle-kit e aplicada no PG DEV (migrate exit 0; 8 tabelas provadas vivas via pg_tables)
- Fixture dedup-overlap.json com 8 itens (par exato NFKD-equivalente, par fuzzy mesmo ano, par distinct anos distintos, par cross-ano anti-fuzzy)
- Skeleton lab-corpus.test.ts com harness 2 usuarios + wipe FK-safe, fumaca verde (43/43 na suite de integracao)

## Task Commits

Each task was committed atomically:

1. **task 1: estender schema.ts com 8 tabelas de revisao** - `8247cea` (feat)
2. **task 2 [BLOCKING]: gerar migration 0003 e aplicar no PG DEV** - `7166e5f` (feat)
3. **task 3: fixtures dedup-overlap + skeleton lab-corpus.test.ts** - `0e21c29` (test)

## Files Created/Modified

- `packages/db/src/schema.ts` - 8 tabelas + 16 types inferidos
- `packages/db/drizzle/0003_corpus.sql` - migration gerada (mold 0002: gen_random_uuid, CONSTRAINTs inline, statement-breakpoint)
- `packages/db/drizzle/meta/0003_snapshot.json` + `_journal.json` - journal via generate
- `tests/integration/fixtures/dedup-overlap.json` - 8 resultados sem segredos/PII
- `tests/integration/lab-corpus.test.ts` - harness + 1 fumaca

## Decisions Made

- Nome `0003_corpus.sql` via `db:generate --name corpus` (generate sorteou `0003_famous_gladiator`; refeito com --name em vez de renomear a mao, preservando journal).
- labGroupTags sem coluna id (PK logica UNIQUE(groupId,tagId), conforme plano).
- groupId UNIQUE em labGroupDecisions e labCanonicalPins (1 decisao/pin por grupo).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `db:generate` exige MIGRATION_DATABASE_URL (drizzle.config valida env no import): resolvido com `source .env.dev.cs` (convecao 03-01, nunca prod).
- Primeira execucao da suite de integracao completa falhou com FK `lab_search_runs_created_by_users_id_fk` em `delete from users` (6 falhas); rerun passou 43/43. Causa: arquivos de integracao paralelos compartilham o mesmo PG DEV e fazem wipe concorrente (condicao pre-existente, afeta todos os arquivos, fora do escopo deste plano). O skeleton segue a mesma convencao dos demais.
- Verificacao de tabelas vivas sem `psql` (nao instalado): script node temporario via `postgres` de packages/db aplicado e removido em seguida (working tree limpa).

## Threat Flags

None — DDL via drizzle parametrizado, CHECKs allowlist, migrate sem segredo no log, fixture ficticia sem PII.

## Self-Check: PASSED (schema typecheck verde; 0003 com 8 CREATE TABLE; migrate exit 0; 8 tabelas vivas; skeleton 1/1 + suite 43/43 verde; commits 8247cea/7166e5f/0e21c29 existem)

## Next Phase Readiness

- 04-03 pode implementar corpus.ts (tabelas + tipos disponiveis; `Db` exporta as 8 tabelas).
- Nenhum blocker.

---
*Phase: 04-corpus-e-exportacao*
*Completed: 2026-09-11*
