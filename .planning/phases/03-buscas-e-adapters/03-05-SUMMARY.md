---
phase: 03-buscas-e-adapters
plan: "05"
subsystem: api
tags: [fastify, lab-routes, jobs, sync-async, idempotency, rate-limit, source-health, zod, postgres]

# Dependency graph
requires:
  - phase: 03-buscas-e-adapters plan 04
    provides: [lib searches owner-first (*ForActor), motor executeSearchRun/cancelRunForActor + erros tipados, barrel @uhhu/integrations final]
  - phase: 03-buscas-e-adapters plan 01
    provides: [contratos lab (schemas/DTOs), erros PT-BR SOURCE_DISABLED/RATE_LIMITED/IDEMPOTENCY_CONFLICT, tabelas + migration 0002]
  - phase: 02-plataforma-e-isolamento plan 04
    provides: [molde buildXRoutes/requireAuth/requestId/clamp, rateLimit duas camadas, boot único]
provides:
  - Superfície REST /api/v1/lab/* + /api/v1/jobs/* com semântica 201 sync / 202 async+polling / 200 replay/cancel
  - JobDTO como projeção 1:1 do SearchRunDTO (D-30)
  - Throttle lab-runs 30/min por IP (fallback) + wiring lab no boot único
  - ResultDTO.rawMetadata (proveniência D-34 visível no GET result)
affects: [03-06 prova PG + curl + IDOR + checkpoint humano, Phase 4 corpus/exportação (rotas fora do slice seguem 404 natural)]

# Tech tracking
tech-stack:
  added: []
  patterns: [rota adapta E/S e lib decide (Promise.race 25s na rota, execução até o fim no lib), erro tipado do lib vira envelope na rota via instanceof, JobDTO como projeção do SearchRunDTO, Idempotency-Key validada por allowlist e corpo do snapshot server-side]

key-files:
  created: [apps/core-api/src/routes/lab.ts]
  modified: [apps/core-api/src/plugins/rateLimit.ts, apps/core-api/src/index.ts, packages/contracts/src/lab.ts, apps/core-api/src/lib/searches.ts]

key-decisions:
  - "ResultDTO ganha rawMetadata (aditivo v1, §19 do contrato): o plano exige proveniência runId/source/sourceId/rawMetadata no GET result e o DTO não tinha o campo"
  - "Timeout 202 resolve o run corrente via listRuns limit 1, com fallback que aguarda o desfecho real se a linha ainda não estiver visível"
  - "Idempotency-Key malformada → 400 VALIDATION_ERROR (nunca ignorada em silêncio); corpo ignorado — idempotência é sobre o snapshot server-side"
  - "GET /lab/sources devolve o array do registry; progress do JobDTO é null só em queued; resultRef só em estado terminal"

patterns-established:
  - "POST runs: Promise.race(execPromise, 25s) → 201 concluído (qualquer status) / 202 corrente+Location / 200 replay+Idempotent-Replayed; erros tipados mapeados por instanceof antes do errorHandler global"
  - "Throttle em duas velocidades documentado no código: 30/min por IP no hook (anti-rajada, memória) vs 10 runs/h por usuário no banco (contratual D-39, sobrevive a restart)"

requirements-completed: [LAB-02, LAB-03, LAB-05, LAB-12, CORE-03, CORE-04]

# Metrics
duration: ~35min
completed: 2026-09-11
---

# Phase 3 Plan 5: Rotas lab/jobs/health + throttle + boot Summary

**Superfície REST do lab (14 rotas: searches CRUD, runs sync/async com 201/202/200, results com newCount, sources/health, jobs 1:1 + cancel) sobre o motor 03-04, com throttle duplo de execução e boot único servindo tudo**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-11T03:44:45Z
- **Completed:** 2026-09-11T04:20Z (estimativa)
- **Tasks:** 2
- **Files modified:** 5 (1 criado, 4 modificados)

## Accomplishments

- `apps/core-api/src/routes/lab.ts` (criado, ~700 linhas): `buildLabRoutes(app, db)` com 14 rotas atrás de `requireAuth(db)`, envelope PT-BR e `x-request-id` em TODA resposta — searches CRUD (DELETE com `?confirm=true`), POST runs com race 25s (201/202+Location/200+Idempotent-Replayed, erros 400/422/429 tipados), histórico de runs, run + results com `{items, page, total, newCount}`, ficha de result com proveniência, sources do registry, health via `computeSourceHealth`, jobs 1:1 + cancel
- `apps/core-api/src/plugins/rateLimit.ts` (modificado): bucket `lab-runs` (POST `/api/v1/lab/searches/*/runs`, 30/min por IP) com `labRunsRateLimit` exportado e comentário distinguindo do contratual 10/h por usuário no banco
- `apps/core-api/src/index.ts` (modificado): `buildLabRoutes` registrado com o db único ao lado de auth/projects, sem reordenar plugins globais
- Gates: typecheck core-api + contracts verdes, eslint root limpo, prettier root limpo
- Prova viva: boot sobe e `GET /api/v1/lab/sources` sem cookie → 401 UNAUTHENTICATED PT-BR com `x-request-id`; 7 rotas lab/jobs → 401 (registradas); path Phase-4 (`.../compare`) → 404 natural

## task Commits

Each task was committed atomically:

1. **task 1: rotas lab (searches, runs, results, sources, jobs)** - `a2f4ece` (feat)
2. **task 2: throttle de runs + wiring no boot** - `102002e` (feat)

## Files Created/Modified

- `apps/core-api/src/routes/lab.ts` - 14 rotas lab/jobs + projeção JobDTO + mapeamento de erros tipados (criado)
- `apps/core-api/src/plugins/rateLimit.ts` - bucket `lab-runs` 30/min por IP + distinção IP/min vs usuário/hora (modificado)
- `apps/core-api/src/index.ts` - registro de `buildLabRoutes` no boot único (modificado)
- `packages/contracts/src/lab.ts` - `ResultDTO.rawMetadata: Record<string, unknown>` (modificado, aditivo)
- `apps/core-api/src/lib/searches.ts` - `parseRawMetadata` (Zod) + mapeamento no `toResultDTO` (modificado)

## Decisions Made

- **ResultDTO com `rawMetadata` (aditivo, sem nova versão):** o contrato §19 permite campos aditivos em v1; único construtor é `toResultDTO` (atualizado); nenhum teste/fixture quebra. Alternativa (devolver DTO sem o campo) descumpriria o requisito explícito da task.
- **202 resolve o run corrente via `listRunsForActor(limit: 1)`:** o lib só devolve o run ao concluir, então na vitória do timeout a rota relê a linha mais recente (ordenação `executedAt DESC, id DESC` — é a recém-criada); fallback aguarda o desfecho real se a linha ainda não estiver visível (corrida extrema), nunca inventando 202 sem run.
- **Idempotency-Key malformada → 400, corpo ignorado:** a chave é validada por allowlist (mesmo pattern das rotas); o corpo da idempotência é o snapshot server-side, então body do POST runs é irrelevante por desenho (D-33/D-39).
- **`GET /lab/sources` devolve o array do registry** (`{name, level, enabled}`, sem segredos); **progress null só em `queued`**, `resultRef` só em terminal; **`sourceName` fora do enum → 404** (não 400), incluindo `oasisbr` conhecida-mas-desabilitada que retorna seu health normalmente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `ResultDTO` sem `rawMetadata` exigido pelo plano**
- **Found during:** task 1 (ação exige `GET result → 200 ResultDTO com runId/source/sourceId/rawMetadata`; 03-04 já previa a ficha com rawMetadata mas 03-01 não colocou o campo no DTO)
- **Issue:** sem o campo, o requisito de proveniência LAB-04 na resposta não seria atendido; a coluna existe no banco e os adapters higienizam o valor
- **Fix:** `rawMetadata: Record<string, unknown>` aditivo no `ResultDTO` + `parseRawMetadata` via `z.record(z.string(), z.unknown())` no `toResultDTO` (fallback `{}` se o valor legado não for objeto)
- **Files modified:** packages/contracts/src/lab.ts, apps/core-api/src/lib/searches.ts
- **Verification:** typecheck contracts + core-api verdes; nenhum outro construtor de ResultDTO no repo
- **Committed in:** a2f4ece (task 1)

**2. [Rule 2 - Missing Critical] Comentário da Camada 2 do rateLimit desatualizado**
- **Found during:** task 2 (dizia "throttle fino por rota auth" após adicionar lab-runs)
- **Issue:** comentário mentiria sobre o escopo do hook
- **Fix:** atualizado para "auth + lab runs" (2 linhas)
- **Files modified:** apps/core-api/src/plugins/rateLimit.ts
- **Verification:** lint + typecheck verdes
- **Committed in:** 102002e (task 2)

---

**Total deviations:** 2 auto-fixed (2 missing-critical)
**Impact on plan:** Ambos necessários para corretude/fidelidade ao plano. Sem scope creep; nenhum arquivo de 03-06 tocado.

## Issues Encountered

- Prettier 3.9.6 reformatou hunks pré-existentes em `searches.ts`/`contracts/lab.ts` (linhas longas que o formato anterior havia deixado passar); mantido o output do `--write` — repo inteiro `prettier --check` verde, diff com reflow whitespace-only colateral.
- PG DEV sem container visível neste ambiente (`docker ps` vazio); a prova de boot usou connection strings dummy — suficiente porque o 401 sem cookie ocorre antes de qualquer query (gate de auth precede o DB).

## Auditoria adversarial (resumo — AGENTS.md)

Arquivo a arquivo antes dos commits: IDOR mitigado (todas as rotas atrás de `requireAuth` + `*ForActor` com actor da sessão; listagens checam escopo do pai antes de listar — projeto/search — para 404 idêntico em vez de lista vazia-oráculo); fora do escopo → 404 em todos os IDs (UUID inválido incluído); sem confiança no navegador (limit com clamp, cursor validado no lib, `confirm=true` literal, key por allowlist, body do POST runs ignorado); sem segredos (só `name/level/enabled` + counts no sources/health; envelopes só do catálogo; log de background server-side sem conteúdo de resposta); SSRF confinado (rota nunca passa `fetchFn` — handoff 03-04 honrado); rate-limit duplo preservado (hook 30/min + banco 10/h + global 200/min); SQL só via Drizzle no lib (rota não monta query; `Location` interpola UUID do banco). **Nenhum achado a corrigir.**

## Known Stubs

None — nenhum `TODO`/`FIXME`/`placeholder` nos arquivos tocados; `SYNC_TIMEOUT` + fallback aguardando desfecho real cobrem o caminho 202 sem stub.

## Threat Flags

None — nenhuma superfície nova além do `<threat_model>` do plano (T-03-05-01…05 todas mitigadas nas rotas: 404 idêntico incl. jobs, health só com counts, throttle duplo + timeout 60s no lib + cancel, key com charset/tamanho + 422 explícito, requestId por allowlist + randomUUID).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 03-06 (prova) desbloqueado: superfície completa para curl autenticado (CRUD searches → POST runs → polling `GET /jobs/:id` → cancel → results com newCount → health); matriz IDOR dono/estranho/ID-adulterado aplicável a todos os IDs; PG DEV vivo será necessário para exercitar 201/202/200 contra o banco.
- Nenhum blocker.

---

*Phase: 03-buscas-e-adapters*
*Completed: 2026-09-11*

## Self-Check: PASSED
- SUMMARY exists; commits a2f4ece + 102002e exist; lab.ts contém /lab/searches, /runs, /results, /sources, /jobs/:jobId, /cancel + literais 25000, Idempotent-Replayed, Location + executeSearchRun/computeSourceHealth/buildLabRoutes; zero rotas compare/decision/corpus/export; requireAuth ×14 + x-request-id ×14 handlers; boot 401 + 404-compare provados; typecheck core-api/contracts + eslint + prettier verdes.
