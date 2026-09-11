---
phase: 04-corpus-e-exportacao
plan: 04
subsystem: api
tags: [rest, export, csv, bibtex, rate-limit, integration, idor]

# Dependency graph
requires:
  - phase: 04-corpus-e-exportacao
    provides: [04-03 corpus lib *ForActor, 04-01 exports puros + contratos]
provides:
  - 14 endpoints lab de revisao no molde Zod+requireAuth+404
  - export attachment csv/bibtex/json + bucket lab-export 30/min
  - lab-corpus.test.ts com 20 its verdes (suite total 89/89)
affects: [04-05, curl-corpus.sh, checkpoint humano]

# Tech tracking
tech-stack:
  added: []
  patterns: [sendExport helper, offset-cursor base64url(id) em groups, selection grupo-ou-resultado]

key-files:
  created: []
  modified: [apps/core-api/src/routes/lab.ts, apps/core-api/src/plugins/rateLimit.ts, apps/core-api/src/lib/corpus.ts, packages/contracts/src/lab.ts, tests/integration/lab-corpus.test.ts]

key-decisions:
  - "selection aceita IDs de grupos OU resultados (curl usa resultIds, D-50)"
  - "exportQuerySchema selection 20k→40k chars para o guard 1000 IDs ser alcancavel"
  - "JSON export = groups + members brutos + provenance (runs/searches)"
  - "Groups com cursor opaco base64url(id); corpus com decodeCursor tolerante"

patterns-established:
  - "Pre-check getProjectForActor 404 antes de agregar (anti-enumeracao)"
  - "overflow DoS via envelope VALIDATION_ERROR com mensagem PT-BR fixa"

requirements-completed: [LAB-07, LAB-08, LAB-09, LAB-10, LAB-11]

# Metrics
duration: ~120min
completed: 2026-09-11
---

# Phase 4 Plan 4: Superficie REST da revisao Summary

**14 endpoints de revisao no molde blindado + exportacao attachment com guards anti-injection + rate-limit fino, provados por 20 its PG-real com matriz IDOR e suite total 89/89 sem regressao**

## Performance

- **Duration:** ~120min
- **Started:** 2026-09-11T12:00:00Z
- **Completed:** 2026-09-11T14:00:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- 13 endpoints de revisao (groups/confirm/reject/decision/tags/divergence/pin/corpus/compare) + export com 3 content-types e filename ASCII
- Bucket lab-export 30/min/IP + embargo 1000 grupos com mensagem PT-BR via envelope
- 20 its cobrindo LAB-07–LAB-11 + IDOR + guards (CSV `=CMD`, filename traversal, BibTeX balanceado, overflow corpus+selection)
- Suite completa 10 arquivos / 89 testes verde, sem regressao LAB-06

## Task Commits

Each task was committed atomically:

1. **task 1: rotas groups/decision/tags/divergence/pin/corpus/compare** - `e4dc0f6` (feat)
2. **task 2: rota export + bucket fino rate-limit** - `e399a17` (feat)
3. **task 3: expandir lab-corpus.test.ts** - `0259e99` (test)

## Files Created/Modified

- `apps/core-api/src/routes/lab.ts` - 14 handlers + sendExport + params schemas
- `apps/core-api/src/plugins/rateLimit.ts` - labExportRateLimit + bucket GET|POST export
- `apps/core-api/src/lib/corpus.ts` - EXPORT_MAX_GROUPS + provenance/members/selection helpers + exactOptional fixes
- `packages/contracts/src/lab.ts` - selection max 20000→40000
- `tests/integration/lab-corpus.test.ts` - 1→20 its + seedRun/setupCtx/setupExtra + parsers

## Decisions Made

- Selection resolve IDs de grupos OU de resultados (D-50 diz "resultados/grupos"; curl-corpus usa resultIds): grupo direto ou via members escopado; desconhecido→404.
- JSON export inclui members brutos (rawMetadata higienizado) + provenance (projeto + searches/runs): "bruto+proveniencia+grupos" literal.
- Groups pagina com cursor opaco base64url(id) + filtro status; corpus usa decodeCursor tolerante.
- exactOptionalPropertyTypes: inputs de decisao/tag aceitam `| undefined` (Zod infere optional assim).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] exactOptionalPropertyTypes nos inputs de rota**
- **Found during:** task 1 (typecheck)
- **Issue:** `reason?: string`/`color?: string|null` incompativeis com Zod-inferido `| undefined`.
- **Fix:** Assinaturas da lib alargadas para `| undefined`.
- **Files modified:** apps/core-api/src/lib/corpus.ts
- **Verification:** typecheck verde
- **Committed in:** e4dc0f6

**2. [Rule 1 - Bug] Guard Zod 20000 chars tornava o branch 1000-IDs inalcançavel**
- **Found during:** task 3 (integracao, 400 sem a mensagem esperada)
- **Issue:** 1001 UUIDs = 37037 chars > 20000: Zod rejeitava antes do guard da rota (mensagem DoS nunca emitida).
- **Fix:** selection max 20000→40000 (~1000+ UUIDs cabem; rota impõe 1000 com mensagem PT-BR).
- **Files modified:** packages/contracts/src/lab.ts
- **Verification:** overflow selection 400 + mensagem; typecheck contracts+core-api
- **Committed in:** 0259e99

**3. [Rule 1 - Bug] Asserts do teste com premissas erradas**
- **Found during:** task 3 (integracao, 4 falhas)
- **Issue:** (a) setupCtx 2x no mesmo teste → bootstrap aberto vira 401 com usuarios existentes; (b) chave BibTeX esperada `souza2021bdtd-a` mas 2o grupo e single capes → `souza2021capes-a`.
- **Fix:** (a) helper setupExtra (membro via admin = dono isolado); (b) assert corrigido para a chave real.
- **Files modified:** tests/integration/lab-corpus.test.ts
- **Verification:** 20/20 verde
- **Committed in:** 0259e99

**4. [Rule 2 - Missing] `lt`/`or` importados sem uso**
- **Found during:** task 3 (eslint)
- **Issue:** Imports planejados para cursor SQL nao usados (paginacao in-memory com decodeCursor).
- **Fix:** Removidos do import drizzle-orm.
- **Files modified:** apps/core-api/src/lib/corpus.ts
- **Verification:** eslint limpo + typecheck verde
- **Committed in:** 0259e99

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 missing/cleanup)
**Impact on plan:** Sem scope creep; contrato de export ajustado dentro da fase (schema da propria fase).

## Issues Encountered

- Nenhum bloqueio PG/rede; suite completa 89/89 passou de primeira apos os fixes (sem flake de wipe paralelo desta vez).

## Threat Flags

None — alem do previsto: attachment ASCII, guards testados, 404/401 identicos, overflow com mensagem sem vazar existência, rawMetadata higienizado (expectClean no JSON).

## Self-Check: PASSED (rotas respondem via 20 its; bucket declarado; suite 89/89; commits e4dc0f6/e399a17/0259e99 verificados)

## Next Phase Readiness

- 04-05 consome as rotas via curl-corpus.sh; suite + IDOR prontos para auditoria e checkpoint humano.
- Nenhum blocker.

---
*Phase: 04-corpus-e-exportacao*
*Completed: 2026-09-11*
