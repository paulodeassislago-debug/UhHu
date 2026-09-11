---
phase: 02-plataforma-e-isolamento
plan: "03"
subsystem: lab
tags: [typescript, fastify, drizzle, postgres, zod, owner-isolation, pagination, integration-tests]
requires:
  - phase: 02-plataforma-e-isolamento/01
    provides: contratos projects/pagination/errors PT-BR, schema projects com owner_id FK CASCADE + indice owner, ActorContext, plugins requestId/errorHandler
  - phase: 02-plataforma-e-isolamento/02
    provides: requireAuth/requireAdmin com ActorContext da sessao, buildAuthRoutes para sessoes reais nos testes
provides:
  - Lib escopada por ownerId (toProjectDTO + CRUD owner-first com 404 identico)
  - Rotas /api/v1/projects/* via buildProjectRoutes(app, db) sem wiring no boot
  - Suite de integracao PG com 5 its (CRUD, isolamento, ID-adulterado, confirm/arquivar, paginacao)
affects: [02-04-wiring-gates, phase-3-buscas]
tech-stack:
  added: []
  patterns: [ownerId-first copiavel por recursos futuros, cursor (created_at DESC, id DESC) com limit+1 e nextCursor/hasMore, 404 identico sem distinguir inexistente vs alheio, confirm=true obrigatorio para DELETE]
key-files:
  created:
    - apps/core-api/src/lib/projects.ts
    - apps/core-api/src/routes/projects.ts
    - tests/integration/projects.test.ts
  modified: []
key-decisions:
  - "Testes com sessoes reais do 02-02 (nao stub): ambos os builders no mesmo Fastify provam isolamento fim-a-fim; stub compativel fica desnecessario e o 02-04 refaz so o wiring real"
  - "withClampedLimit pre-normaliza limit numerico para 1..100 antes do paginationQuerySchema: reconcilia max 100 do contrato com clamp D-27/T-02-03-04 e o caso ?limit=999 do plano"
  - "Cursor malformado/UUID invalido/data invalida ignora e recomeca do inicio (decode null-safe, nunca 400)"
  - "ID de formato invalido vira 404 identico (nunca 400): mesma resposta para inexistente, alheio e malformado"
patterns-established:
  - "Isolamento owner-first: UMA query escopada and(eq(id), eq(owner_id, actor.userId)), nunca findById+check depois"
  - "DTO unico em @uhhu/contracts com import type; snake->camel e toISOString UTC so no toProjectDTO"
  - "Nenhuma rota le identidade do body/query: ownerId so de request.actor; Zod strip + lib ignora extras"
  - "Lista default status=active; all inclui arquivados; arquivar/reativar via PATCH status (D-24)"
requirements-completed: [LAB-01, PLAT-03, CORE-01]
duration: 22min
completed: 2026-09-11
---

# Phase 2 Plan 03: Projetos isolados Summary

**CRUD /api/v1/projects isolado por ownerId com paginacao cursor limit+1 e arquivar/excluir com confirmacao — 5 its PG real provam dono/estranho/ID-adulterado como 404 identico**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-10T23:42:40Z
- **Completed:** 2026-09-11T00:05:08Z
- **Tasks:** 2/2
- **Files modified:** 3 (2 criados em lib/routes + 1 teste)

## Accomplishments

- Lib escopada `apps/core-api/src/lib/projects.ts`: `toProjectDTO` camelCase UTC + `create/get/list/update/deleteForActor` todas com `owner_id = actor.userId`, ordenacao estavel `created_at DESC, id DESC`, cursor opaco base64url null-safe e `limit` clamp 1..100
- Rotas `buildProjectRoutes(app, db)` com `preHandler: requireAuth(db)` em TODAS: POST 201, GET lista `{ items, page }`, GET/PATCH por id com 404 identico, DELETE com 400 `CONFIRMATION_REQUIRED` sem `?confirm=true` e 204 com ele; arquivar/reativar via `PATCH { status }`
- 5 its PG real verdes + suite completa 14/14 + skip offline verde; prova viva de clamp (`?limit=999` -> `page.limit 100`), default 20 e cursor com 25 projetos (20 + 5, `hasMore`/`nextCursor`)
- Auditoria adversarial sem achado alto/critico aberto; `ownerId` nunca do cliente (grep 0); arquivos proibidos intocados (contracts/schema/env/index/auth)

## task Commits

Each task was committed atomically:

1. **task 1: lib de projetos escopada + rotas CRUD com paginacao** - `6714ddd` (feat)
2. **task 2: testes de integracao PG (dono/estranho/paginacao)** - `5f97f2e` (feat)

## Files Created/Modified

- `apps/core-api/src/lib/projects.ts` - `toProjectDTO` + 5 helpers escopados (`owner_id = actor.userId`, cursor `or(lt(createdAt), and(eq(createdAt), lt(id)))`, `limit+1` para `hasMore`)
- `apps/core-api/src/routes/projects.ts` - `buildProjectRoutes(app, db)` com as 5 rotas, envelope PT-BR + `x-request-id` em todas, `withClampedLimit` + `CONFIRMATION_REQUIRED`
- `tests/integration/projects.test.ts` - 5 its com sessoes reais (bootstrap admin + membro via `buildAuthRoutes`), truncate por teste + skip gracioso offline

## Decisions Made

- Testes com sessoes reais do 02-02 em vez do stub: o plano permite ambos ("importar `requireAuth` SE existir, senao stub"); como o 02-02 ja existe, registrar `buildAuthRoutes` + `buildProjectRoutes` no mesmo Fastify prova isolamento fim-a-fim (cookie real) em vez de injecao de ator. O teste com sessoes reais do 02-04 continua valido (vira wiring do boot, nao dos builders).
- `withClampedLimit` antes do Zod: o contrato diz `max(100)` (daria 400 para 999) mas o plano exige clamp e a ameaca T-02-03-04 exige clamp DoS; pre-normalizar numerico para 1..100 satisfaz os tres sem tocar no contrato. Nao-numerico continua 400 via coercao.
- Cursor invalido (malformado, UUID nao-uuid, data NaN) ignora e lista do inicio: evita 400 em cursor opaco e impede erro PG com UUID invalido na comparacao `id < cursor`.
- `ListProjectsOptions` com `| undefined` explicito nos opcionais (`exactOptionalPropertyTypes`): sem isso o `cursor: string | undefined` do Zod nao atribui; mesmo padrao estrito do monorepo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ListProjectsOptions` exige `| undefined` nos opcionais**
- **Found during:** task 1 (typecheck do `core-api`)
- **Issue:** `cursor: string | undefined` do Zod nao atribui a `cursor?: string` com `exactOptionalPropertyTypes: true` (TS2379)
- **Fix:** Interface com `limit?: number | undefined; cursor?: string | undefined; status?: ... | undefined`
- **Files modified:** `apps/core-api/src/lib/projects.ts`
- **Verification:** `pnpm --filter @uhhu/core-api typecheck` exit 0
- **Committed in:** `6714ddd` (parte do commit da task 1)

**2. [Rule 1 - Bug] DELETE usava helper `notFound` com segundo `resolveRequestId`**
- **Found during:** task 1 (revisao pos-implementacao: dois resolves gerariam UUIDs distintos sem plugin, header final divergindo do primeiro)
- **Issue:** Helper re-resolvia `requestId` e re-setava o header, inconsistente com o `requestId` do envelope de entrada
- **Fix:** Removido helper; ramo `!removed` usa o mesmo `requestId` do inicio do handler (`404 NOT_FOUND` inline como nas demais rotas)
- **Files modified:** `apps/core-api/src/routes/projects.ts`
- **Verification:** typecheck exit 0 + integracao 5/5 (404 estranho/inexistente cobertos)
- **Committed in:** `6714ddd` (parte do commit da task 1)

---

**Total deviations:** 2 auto-fixed (1 blocking tipos estritos, 1 bug consistencia de requestId)
**Impact on plan:** Ambos necessarios para typecheck estrito e envelope `requestId` consistente. Sem scope creep: contratos, schema, env, boot e auth intocados; nenhuma rota extra criada.

## Issues Encountered

- `docker` ausente neste container — PG DEV alcancado pelo DNS docker `uhhu-dev-postgres-dev-1` via `.env.dev.cs` (rede `uhhu-dev_default`), sem tunel; `pg-ok` provado antes dos testes.
- Offline skip verificado nos dois modos: com PG real 5/5 verdes (3.0s); sem `APP/MIGRATION_DATABASE_URL` (dummy do workspace, ECONNREFUSED) 5/5 "pulados" sem falhar — mesmo padrao do `auth.test.ts`.
- Gitleaks/OpenGrep nao instalados neste container — CI (`secrets-tree`, `secrets-history`, `sast`) cobre no push. `pnpm audit --prod` nao rodado neste plano (sem novas deps; lockfile intocado).

## Auditoria adversarial (resumo registrado)

Cobertura: `lib/projects.ts`, `routes/projects.ts`, teste de integracao. Sem achado alto/critico aberto:

| # | Arquivo | Checagem | Resultado |
|---|---------|----------|-----------|
| 1 | `lib/projects.ts` (todas) | IDOR: query sem escopo ou findById+check | Limpo (toda query com `and(eq(id), eq(owner_id, actor.userId))`; lista sempre com `eq(ownerId)`) |
| 2 | `routes/projects.ts` (POST/PATCH) | `ownerId` do body/query sobrescreve dono | Mitigado (schemas sem `ownerId`, strip Zod + lib so usa `actor.userId`; `grep ownerId.*body` 0) |
| 3 | `routes/projects.ts` (GET/PATCH/DELETE :id) | 403/400 distingue inexistente vs alheio | Mitigado (tudo 404 `NOT_FOUND` "Recurso não encontrado.", inclusive UUID malformado) |
| 4 | `routes/projects.ts` (todas) | Auth decorativa / ator undefined | Mitigado (`preHandler: requireAuth(db)` em TODAS + `401` se `actor === undefined`) |
| 5 | `routes/projects.ts` (DELETE) | Exclusao sem confirmacao / CSRF-like | Mitigado (`confirm !== 'true'` -> 400 `CONFIRMATION_REQUIRED`; `confirm=false`/ausente cobertos) |
| 6 | `lib` cursor + `routes` limit | DoS via `limit` gigante / cursor injetado | Mitigado (clamp 1..100 + `limit+1`; cursor max 512, decode null-safe, UUID/data validados, ordenacao estavel) |
| 7 | geral | SQL injection / XSS / segredos em log-resposta | Limpo (Drizzle parametrizado, sem `sql` cru com input; JSON sem HTML; sem logs com token/senha; erros via catalogo sem stack/SQL) |
| 8 | `routes` PATCH status | Status fora da allowlist | Mitigado (`updateProjectSchema` so `active\|archived`; invalido -> 400) |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pronto para 02-04 (wiring): assinatura `buildProjectRoutes(app, db)` posicional + `requireAuth(db)` por rota, exatamente como `buildAuthRoutes` (`app.register(async (i) => buildProjectRoutes(i, db))` apos `@fastify/cookie` + `requestIdPlugin` + `errorHandler`).
- 02-04 refaz a prova com sessoes reais no boot + matriz `curl` (dono/estranho/ID-adulterado, 400 sem confirm, clamp e `x-request-id`); padrao ownerId-first aqui e copiavel para buscas/runs (Phase 3).
- Atencao 02-04: rate-limit em `POST /projects` e `PATCH/DELETE /projects/:id` (residual desta auditoria, mesmo padrao do auth #8); `Secure` do cookie ja tratado no 02-02.

---
*Phase: 02-plataforma-e-isolamento*
*Completed: 2026-09-11*

## Self-Check: PASSED

- All 3 key files FOUND (`lib/projects.ts`, `routes/projects.ts`, `tests/integration/projects.test.ts`)
- Both task commits FOUND (`6714ddd`, `5f97f2e`)
- Forbidden files untouched (contracts, `db/src/schema.ts`, `config/src/env.ts`, `index.ts`, `routes/auth.ts`)
- Full suite 14/14 green (auth 6 + projects 5 + health 1 + least-privilege 2); lint + format + typecheck exit 0
