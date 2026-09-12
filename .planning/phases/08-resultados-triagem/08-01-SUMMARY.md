---
phase: 08-resultados-triagem
plan: "01"
subsystem: api
tags: [drizzle, postgres, zod, fastify, vitest, lab, dedup, tags, isNew]
requires:
  - phase: 06-fundacao-app-auth-suporte-core
    provides: isNew on-read via anti-join D-35 (base do fix D-15)
  - phase: 04-corpus-e-exportacao
    provides: decisão UMA por grupo D-46, divergência como anotação, seed preguiçoso de tags
provides:
  - isNew só-anteriores (D-15/H-01) com histórico congelado provado em 3 runs
  - DedupGroupDTO com tags/divergences/decidedAt + PATCH/DELETE de tags owner-scoped
  - seed-if-empty de tags default + decidedAt atualizado na re-decisão
affects: [08-02, 08-03, 08-04, lab-ui, corpus]
tech-stack:
  added: []
  patterns: [anti-join temporal por executedAt, seed-if-empty, erro tipado mapeado na rota via error.name sem importar lib]
key-files:
  created:
    - tests/integration/lab-groups-triage.test.ts
  modified:
    - apps/core-api/src/lib/searches.ts
    - tests/integration/lab-results-isnew.test.ts
    - packages/contracts/src/lab.ts
    - apps/core-api/src/lib/corpus.ts
    - apps/core-api/src/capabilities.ts
    - apps/core-api/src/routes/lab.ts
key-decisions:
  - "Anti-join D-15 ancora em executedAt do run corrente (sem coluna nova, sem migration)"
  - "Colisão de rename vira 400 VALIDATION_ERROR com details livre; catálogo de erros intocado"
  - "Rota traduz TagNameConflictError por error.name (rotas não importam lib/*, gate 05-02)"
  - "decidedAt com refresh explícito no upsert (SET explícito não herda $onUpdate)"
requirements-completed: [UI-18, UI-19, UI-20, UI-21]
duration: ~8min
completed: 2026-09-12
---

# Phase 8 Plan 01: CORE triagem servidor Summary

**isNew só-anteriores com badge congelado provado em 3 runs + DedupGroupDTO com tags/divergências/decidedAt e gestão de tags (rename/delete) owner-scoped**

> Escopo: slice SERVIDOR de UI-18/19/20/21. Os requisitos seguem Pending em REQUIREMENTS.md até a UI (08-02/08-03/08-04) — este plano destrava essas telas, não as entrega.

## Performance

- **Duration:** ~8 min
- **Started:** 2026-09-12T20:24:57Z
- **Completed:** 2026-09-12T20:32:34Z
- **Tasks:** 2
- **Files modified:** 7 (2 criados/estendidos em task 1, 5 em task 2)

## Accomplishments

- Badge NOVO estável no tempo: `seenKeysForSearch` filtra só runs com `executedAt <` run corrente; run posterior nunca apaga NOVO antigo; `newCount === count(isNew)` nos 3 runs
- `GET groups` expõe por grupo `tags` (nomes ordenados), `divergences` e `decidedAt` (ISO de `labGroupDecisions.updatedAt`, null = não triado)
- `PATCH` + `DELETE /api/v1/lab/projects/:projectId/tags/:tagId` owner-scoped (404 idêntico, colisão 400, 204 no delete, cascade nos joins)
- `ensureDefaultTags` vira seed-if-empty: tag default excluída não ressuscita
- Re-decisão atualiza `decidedAt` (refresh explícito no upsert)

## Task Commits

Each task was committed atomically:

1. **task 1: isNew só-anteriores + teste de 3 runs** - `f13a482` (feat)
2. **task 2: grupo expõe tags/divergências/decidedAt + rename/delete de tags** - `d4c73c5` (feat)

**Plan metadata:** (este SUMMARY + STATE/ROADMAP, commit final abaixo)

## Files Created/Modified

- `apps/core-api/src/lib/searches.ts` - anti-join D-15 (filtro `lt(executedAt)` + âncora por run corrente nos dois callers)
- `tests/integration/lab-results-isnew.test.ts` - `seedThreeRuns` (run1 A; run2 A+B; run3 A+B+C) + asserts badge≡contador nos 3 runs + unitário + IDOR
- `packages/contracts/src/lab.ts` - `DedupGroupDTO.tags/divergences/decidedAt` + `updateTagSchema`/`UpdateTagInput`
- `apps/core-api/src/lib/corpus.ts` - bundle+loader+mapper de triagem; seed-if-empty; `renameTagForActor`/`deleteTagForActor`/`TagNameConflictError`; refresh de `updatedAt` na decisão
- `apps/core-api/src/capabilities.ts` - `lab.tag.rename` + `lab.tag.delete` (schemas inline)
- `apps/core-api/src/routes/lab.ts` - PATCH/DELETE de tag (molde tag existente; colisão→400 via `error.name`)
- `tests/integration/lab-groups-triage.test.ts` - 3 testes PG real (triagem, tags, IDOR 8+7 probes)

## Decisions Made

- Anti-join D-15 ancora em `executedAt` do run corrente (coluna já existente, mesma do `orderBy` de corpus): sem coluna nova, sem migration; empate exato = posterior (documentado no teste).
- `searchRuns.ts` (newCount congelado) intocado: no momento da execução runs futuros não existem — já é só-anteriores por construção.
- Colisão de rename → `400 VALIDATION_ERROR` com `details: { name: 'Já existe uma tag com este nome.' }`; catálogo `errors.ts` intocado (sem `TAG_EXISTS`).
- Rota traduz `TagNameConflictError` por `error.name` em vez de `instanceof`: rotas não importam `lib/*` (gate 05-02); nome estável documentado em `corpus.ts`.
- `decidedAt` com `updatedAt: new Date()` explícito no SET do upsert: SET de `onConflictDoUpdate` é explícito e não herdaria o `$onUpdate` — sem isto a re-decisão congelaria o `decidido_em` (UI-19 exige atualizado).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Refresh explícito de `updatedAt` na re-decisão**
- **Found during:** task 2 (auditoria adversarial do diff antes do commit)
- **Issue:** `setGroupDecisionForActor` fazia upsert com `set: { decision, reason }`; o SET do `onConflictDoUpdate` é explícito e não aplica o `$onUpdate` do schema — a segunda decisão manteria o `updatedAt` da primeira e `decidedAt` (UI-19 "decidido_em atualizado") mentiria.
- **Fix:** `set` passa a incluir `updatedAt: new Date()` + assert de re-decisão no teste (flip eligible→ineligible, `decidedAt` monotônico não-decrescente).
- **Files modified:** `apps/core-api/src/lib/corpus.ts`, `tests/integration/lab-groups-triage.test.ts`
- **Verification:** vitest 25/25 PG real (triagem 3/3 + corpus 20/20 + isnew 2/2)
- **Committed in:** `d4c73c5` (part of task commit)

**2. [Rule 2 - Missing Critical] Seed de 3 runs incluía B repetido no run3**
- **Found during:** task 1 (revisão do teste antes de commitar — o teste como esboçado não falhava no código antigo)
- **Issue:** com run3 = A+C, o anti-join antigo (todos os outros runs) ainda acertava B no run2 — o teste não provava o bug D-15 (run posterior apagando badge).
- **Fix:** run3 = A+B+C (newCount 1, só C novo); prova vermelha-no-antigo confirmada via `git stash` (1 failed) e verde-no-novo.
- **Files modified:** `tests/integration/lab-results-isnew.test.ts`
- **Verification:** vermelho no `searches.ts` antigo, verde no novo; 2/2 PG real
- **Committed in:** `f13a482` (part of task commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Ambos necessários para corretude (contrato UI-19) e para o teste provar o que alega. Sem scope creep.

## Issues Encountered

- Edição intermediária corrompeu o cabeçalho de `seedThreeRuns` (duas edições encadeadas no mesmo bloco) — detectado na leitura seguinte e corrigido antes de rodar; sem impacto no commit.
- `pnpm audit`: só toolchain pré-existente (Expo `image-size`, drizzle-kit esbuild dev, vitest) — nenhuma dependência nova neste plano; SAST/Gitleaks sem binário local (CI cobre, como nos planos 06/07).

## Verification Evidence

- `tsc --noEmit` contracts + core-api: verdes
- eslint nos 7 arquivos (5 fonte + 2 testes): exit 0; zero `any` (grep gate 0 em todos)
- vitest PG real (`.env.dev.cs`, rede docker): **25/25** — isnew 2/2 (incl. prova vermelha-no-antigo), triage 3/3, corpus 20/20 sem regressão
- Gates do plano: `executedAt` 13 ocorrências; `seedThreeRuns|run3` 17+; `count(isNew` 3; `decidedAt` 6; `lab.tag.rename|delete` 6; string de colisão só em `routes/lab.ts` (1, catálogo 0)
- Auditoria adversarial do diff (IDOR/input/segredos/SQL/isolamento): 0 crit/0 high; risco residual baixo documentado (TOCTOU em rename concorrente contido pela UNIQUE — ver Next Phase)

## Known Stubs

Nenhum — sem placeholders, TODOs ou dados mockados nos arquivos do plano.

## Threat Flags

Nenhuma superfície nova além do `<threat_model>` do plano: 2 endpoints de escrita single-resource (sem listagem nova), ambos atrás de `requireAuth` + JOIN owner + Zod; `executedAt`/`decidedAt` derivados server-side.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 08-02 desbloqueado: `listResults` com `isNew` congelado + `GET groups` com triagem legível; UI endereça `groupId` (nunca `resultId`).
- 08-03/08-04 desbloqueados: `PUT decision/divergence`, attach de tag, `PATCH/DELETE` de tags, defaults via `GET tags`.
- Risco residual (baixo, fora de escopo): rename concorrente da mesma tag para o mesmo nome pode estourar a UNIQUE como 500 em vez de 400 (TOCTOU check-then-act; sem corrupção — constraint segura). Reavaliar se UI-20 exibir erro 500 em teste humano.
- REQUIREMENTS.md: UI-18/19/20/21 seguem Pending (slice servidor pronto; conclusão na UI).

---
*Phase: 08-resultados-triagem*
*Completed: 2026-09-12*

## Self-Check: PASSED

- Arquivos: `apps/core-api/src/lib/searches.ts`, `packages/contracts/src/lab.ts`, `apps/core-api/src/lib/corpus.ts`, `apps/core-api/src/capabilities.ts`, `apps/core-api/src/routes/lab.ts`, `tests/integration/lab-results-isnew.test.ts`, `tests/integration/lab-groups-triage.test.ts` — todos FOUND
- Commits: `f13a482` FOUND, `d4c73c5` FOUND (`git log --oneline` confirma ambos sobre `c0970bf`)
