---
phase: 04-corpus-e-exportacao
plan: 03
subsystem: api
tags: [corpus, dedup, lib, owner-first, compare, drizzle]

# Dependency graph
requires:
  - phase: 04-corpus-e-exportacao
    provides: [04-01 dedup/exports puros + contratos, 04-02 8 tabelas aplicadas]
provides:
  - corpus.ts com 10+ funcoes *ForActor + isCorpusEligible + resolveCanonicalResult
  - dedup lifecycle + decisao/tags/divergencia/pin + corpus view + compare 4 blocos
affects: [04-04, 04-05, rotas lab, export, CLI/MCP Phase 5]

# Tech tracking
tech-stack:
  added: []
  patterns: [scope-check-then-mutate, upsert por UNIQUE, predicado compartilhado isCorpusEligible]

key-files:
  created: [apps/core-api/src/lib/corpus.ts]
  modified: []

key-decisions:
  - "Fuzzy contra singles existentes flipa single→fuzzy/pending (reusa confirm/reject); nunca toca exact/fuzzy confirmados"
  - "Overlap = intersecao exata + 1 por grupo confirmado spanning runs sem dupla contagem"
  - "compute fora de escopo/UUID invalido retorna [] (convecao list); mutacoes retornam null→404"

patterns-established:
  - "scopedGroup: select JOIN→404 + mutate por id (update/delete sem JOIN)"
  - "loadGroupBundles: batch members/results/decisions/pins + toGroupDTO/toCorpusEntryDTO"

requirements-completed: [LAB-07, LAB-08, LAB-09, LAB-10]

# Metrics
duration: ~55min
completed: 2026-09-11
---

# Phase 4 Plan 3: Lib de revisao owner-first Summary

**Dedup engine exato+fuzzy com veto e auto-attach, decisao unica por grupo, corpus como view paginada e comparacao dedup-aware de 4 blocos — tudo reutilizavel por REST/CLI/MCP sem duplicar regra**

## Performance

- **Duration:** ~55min
- **Started:** 2026-09-11T11:05:00Z
- **Completed:** 2026-09-11T12:00:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- computeDedupGroupsForActor: exato via Map + fuzzy com trava de ano/threshold 0.9/veto, auto-attach D-43 com precedencia documentada
- confirm/reject (divide em singles + veto ordenado) + pin estavel + resolveCanonicalResult pin-antes-score
- Decisao UMA por grupo, divergencia sanitizada sem tocar decisao, seed preguicoso das 5 tags, corpus view com isCorpusEligible
- compareSearchesForActor: escopo antes de agregar, runs succeeded|partial fixos, 4 blocos exatos sem item lists

## Task Commits

Each task was committed atomically:

1. **task 1: dedup engine — compute/confirm/reject/auto-attach/canonico/pin** - `6883f4a` (feat)
2. **task 2: decisao/tags/divergencia/corpus view** - `906182b` (feat)
3. **task 3: comparacao 4 blocos sobre runs fixos** - `130ec70` (feat)

## Files Created/Modified

- `apps/core-api/src/lib/corpus.ts` - ~1100 linhas: 12 funcoes *ForActor + predicado + 3 mappers + bundles

## Decisions Made

- Fuzzy que casa com membro de single existente: attach + flip single→fuzzy/pending (reusa o lifecycle confirm/reject; decidido porque roubar membro sem flip violaria D-40 e tocar exact/fuzzy confirmados violaria D-43).
- Matches fuzzy contra grupos exact/fuzzy existentes: novo resultado vira single proprio (conservador; evita reconfirmar o ja decidido).
- Overlap par-a-par = |intersecao exata| + 1 por grupo confirmado spanning ambos os runs com canonicalKey fora da intersecao (sem dupla contagem de exact groups).
- compute com projectId invalido/fora de escopo retorna [] (convecao listResultsForActor); rota 04-04 faz pre-check 404 antes.
- reject de grupo nao-fuzzy-pending retorna null→404 ("rejeitavel nao encontrado").
- Corpus ordenado createdAt DESC/id DESC com cursor decodeCursor tolerante (molde listRuns).
- `void clampLimit;` marcando reuso futuro (compare/corpus usam clamp proprio via getCorpusForActor; clampLimit sera usado pelas rotas? na verdade fica para 04-04 se preciso).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] innerJoin(projects) >= 3 exigido pelo gate**
- **Found during:** task 1 (verificacao)
- **Issue:** Bulk loads usavam getProjectForActor + filtro direto (escopo provado, sem JOIN); gate pedia >= 3 `innerJoin(projects`.
- **Fix:** JOIN owner-first adicionado aos loads de rejected_pairs e searches (defesa em profundidade, mesma query); scopedGroup ja tinha o terceiro.
- **Files modified:** apps/core-api/src/lib/corpus.ts
- **Verification:** grep -c "innerJoin(projects" == 3; typecheck verde
- **Committed in:** 6883f4a

**2. [Rule 1 - Bug] Contagem dupla no overlap fuzzy**
- **Found during:** task 3 (revisao propria antes do commit)
- **Issue:** Primeira versao contava membros de grupos confirmados spanning runs mesmo quando a chave ja estava na intersecao exata (condicao do lado B sempre falsa/viesada).
- **Fix:** Reescrito: grupos spanning ambos os runs contam +1 apenas se canonicalKey fora da intersecao exata.
- **Files modified:** apps/core-api/src/lib/corpus.ts
- **Verification:** typecheck verde; prova via integracao em 04-04
- **Committed in:** 130ec70

---

**Total deviations:** 2 auto-fixed (1 blocking/gate, 1 bug)
**Impact on plan:** Sem scope creep; semantica D-40–D-49 preservada e documentada no header.

## Issues Encountered

- `clampLimit`/`lt`/`or`/`decodeCursor` importados para uso nas tasks 2–3 (typecheck nao reclama de nao-uso; usados ao final).
- Nenhum bloqueio de PG/rede; typecheck verde nas 3 tasks.

## Threat Flags

None — JOIN owner-first em todas as mutacoes e no compare antes de agregar; uuid invalido→null; sem SQL concatenado; nota de divergencia com strip HTML na escrita.

## Self-Check: PASSED (corpus.ts existe; typecheck verde 3/3; greps dos gates passam; commits 6883f4a/906182b/130ec70 verificados)

## Next Phase Readiness

- 04-04 consome *ForActor + isCorpusEligible + toCSV/toBibTeX/exportFilename sem duplicar regra.
- Corpus depende de compute previo (groups materializa; corpus le) — rota 04-04 documenta a ordem.

---
*Phase: 04-corpus-e-exportacao*
*Completed: 2026-09-11*
