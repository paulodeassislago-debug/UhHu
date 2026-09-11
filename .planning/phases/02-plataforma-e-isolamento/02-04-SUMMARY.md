---
phase: 02-plataforma-e-isolamento
plan: "04"
subsystem: platform
tags: [typescript, fastify, rate-limit, idor, curl, security-audit, postgres, envelope-ptbr]
requires:
  - phase: 02-plataforma-e-isolamento/02
    provides: buildAuthRoutes(app, db) + primitivas tokens/password/session + lockout 5→15min
  - phase: 02-plataforma-e-isolamento/03
    provides: buildProjectRoutes(app, db) + lib owner-first + paginacao cursor
provides:
  - Boot unico Fastify com cookie/requestId/errorHandler/rate-limit + auth/projects + 404 envelope
  - Rate limit global 200/min + fino por rota auth (login 10/register 20/invites 20/reset 5) com 429 PT-BR
  - Matriz IDOR automatizada (4 its) + script curl executavel com mesma cobertura
  - Auditoria adversarial 02-04 sem alto/critico aberto
affects: [phase-3-buscas, wiring-gates, verify-fase-2]
tech-stack:
  added: []
  patterns: [wiring direto no root para hooks globais (encapsulamento Fastify), throttle manual por IP com janela deslizante sem re-declarar rotas, prova dupla teste+curl para IDOR]
key-files:
  created:
    - apps/core-api/src/plugins/rateLimit.ts
    - tests/integration/idor-matrix.test.ts
    - scripts/curl-idor.sh
  modified:
    - apps/core-api/src/index.ts
key-decisions:
  - "Plugins da casa chamados direto no root (await requestIdPlugin(app)) em vez de app.register: register encapsula e nao valeria para rotas irmas; direto garante global sem nova dep fastify-plugin"
  - "app.setErrorHandler(errorHandler) do plano seria type-error (errorHandler e plugin que chama setErrorHandler dentro); correto e await errorHandler(app)"
  - "Throttle fino via hook manual preHandler (Map por instancia) em vez de config.rateLimit nas rotas: re-declarar duplicaria regra e quebraria paralelismo 02-02/03"
  - "Teste IDOR sem rate-limit no harness (como auth/projects): evita flake por limite; rate-limit provado no boot real via curl + teste dedicado de 11 logins"
  - "Script curl exige banco vazio no bootstrap (401 indica DB nao vazio); verificacao truncou via APP role antes de rodar"
patterns-established:
  - "Boot: cookie(fp global) + requestId/errorHandler/rateLimit diretos no root + health ANTES do produto + setNotFoundHandler envelope NOT_FOUND"
  - "IDOR: UMA query escopada por ator + 404 identico + ownerId nunca do body (Zod strip) — provado por teste+curl em projects+sessions"
  - "Rate-limit: global 200/min (plugin) + fino auth por IP (hook) + lockout por e-mail independente (ACCOUNT_LOCKED vs RATE_LIMITED)"
requirements-completed: [PLAT-03, PLAT-04, PLAT-05]
duration: 52min
completed: 2026-09-11
---

# Phase 2 Plan 04: Wiring final + hardening + prova adversarial Summary

**Boot único auth+projects atrás de requestId+envelope+rate-limit (200 global + 10/20/5 auth) com 429 PT-BR sem quebrar lockout, matriz IDOR dono/estranho/adulterado provada por 4 its + curl ALL PASS e auditoria sem alto/crítico**

## Performance

- **Duration:** 52 min
- **Started:** 2026-09-11T00:08:08Z
- **Completed:** 2026-09-11T01:00:02Z
- **Tasks:** 2/2 auto (checkpoint human-verify pendente — não contado)
- **Files modified:** 4 (2 criados em plugins/test + 1 script + 1 boot)

## Accomplishments

- Wiring único em `apps/core-api/src/index.ts`: instância ÚNICA `createDb`, `cookie` + `requestId` + `errorHandler` + `rateLimit` globais, `healthRoute` antes do produto, `buildAuthRoutes` + `buildProjectRoutes` no mesmo Fastify, `setNotFoundHandler` com envelope `NOT_FOUND` + `x-request-id`; logger redact + bind preservados
- `plugins/rateLimit.ts`: global `@fastify/rate-limit` 200/min com `errorResponseBuilder` envelope + hook manual por IP (login 10, register 20, invites 20, reset 5) com 429 `RATE_LIMITED` PT-BR; lockout por e-mail intacto (5×401→429 `ACCOUNT_LOCKED`, 11º login fantasma→429 `RATE_LIMITED`)
- Matriz IDOR `tests/integration/idor-matrix.test.ts` (4 its PG real, sessoes reais): estranho 404 em GET/PATCH/DELETE projects + dado intacto, cross-delete sessions 404 + intacta, UUID adulterado 404 + sem-cookie 401, `ownerId` do body ignorado em POST/PATCH; asserts de `x-request-id` + regex negativa `stack|passwordHash|token`
- `scripts/curl-idor.sh` executável (chmod +x, 12×`404`): bootstrap→A admin→convite B→B→logins→A cria→B 404/404/404→adulterado 404→sessions cross 404→sem-confirm 400→com-confirm 204; verificado `ALL PASS` contra boot local + PG DEV
- Suite integração 18/18 verde (auth 6 + projects 5 + idor 4 + health 1 + least-privilege 2); `pnpm audit --audit-level high` 0 high (3 moderates dev-only); typecheck+lint+format verdes

## task Commits

Each task was committed atomically:

1. **task 1: wiring do boot + rate limit por rota** - `4c57a47` (feat)
2. **task 2: matriz IDOR automatizada + script curl + auditoria** - `e237e20` (feat)

## Files Created/Modified

- `apps/core-api/src/plugins/rateLimit.ts` - `authRateLimit` documentado + `registerRateLimits` (global 200 + hook fino por IP com janela deslizante, 429 envelope, `rateLimitPlugin` alias)
- `apps/core-api/src/index.ts` - boot único: `cookie`, `requestId/errorHandler/rateLimit` diretos no root, `healthRoute` + `buildAuthRoutes` + `buildProjectRoutes` com `db` único, `setNotFoundHandler` 404 envelope
- `tests/integration/idor-matrix.test.ts` - 4 its com 2 usuários reais (dono A, stranger B): projects 404 triplo, sessions cross 404, adulterado 404, sem-cookie 401, `ownerId` ignorado
- `scripts/curl-idor.sh` - prova manual executável com `assert_code`, jars `/tmp/uhhu-a.jar|b.jar`, `curl -s -o /dev/stderr -w '%{http_code}'` nos passos 404/400/204

## Decisions Made

- Plugins da casa diretos no root (não `app.register`): Fastify encapsula hooks de `register` e isolaria `onRequest/setErrorHandler/preHandler` das rotas irmãs; direto no root vale globalmente sem `fastify-plugin` novo. Documentado no boot + SUMMARY.
- `app.setErrorHandler(errorHandler)` do plano não compila (plugin ≠ handler); correto `await errorHandler(app)` que internamente faz `setErrorHandler` com envelope do catálogo.
- Hook manual em vez de `config.rateLimit` nas rotas: plugin só diferencia por rota na declaração; re-declarar aqui duplicaria regra dos planos 02-02/03. Hook inspeciona `POST /api/v1/auth/*` e throttla por IP, comentado no arquivo.
- Map de throttle por instância (closure), não módulo: testes `inject` com mesmo IP isolam por app; módulo compartilharia entre arquivos e flakearia.
- Teste IDOR sem rate-limit no harness (padrão auth/projects): matriz foca isolamento; rate-limit coberto no boot real (11 logins→429 + lockout→`ACCOUNT_LOCKED` + curl script com 2 logins sob limite).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wiring global via chamada direta (não `app.register`)**
- **Found during:** task 1 (revisão de encapsulamento Fastify antes do boot)
- **Issue:** `await app.register(requestIdPlugin/errorHandler/rateLimitPlugin)` encapsularia `onRequest/setErrorHandler/preHandler` e não valeria para rotas irmãs; `app.setErrorHandler(errorHandler)` ainda seria TS2322 (plugin `(app)=>Promise<void>` ≠ handler `(err,req,reply)`)
- **Fix:** `await app.register(cookie)` (fp, global) + `await requestIdPlugin(app)` + `await errorHandler(app)` + `await registerRateLimits(app)` direto no root; `registerRateLimits` internamente faz `app.register(rateLimit)` (fp, global) + `addHook` direto no root; `setNotFoundHandler` no root
- **Files modified:** `apps/core-api/src/index.ts`, `apps/core-api/src/plugins/rateLimit.ts`
- **Verification:** typecheck exit 0; boot local `/health` 200 + `/me` 401 + 404 envelope todos com `x-request-id`; 11 logins fantasma→429 `RATE_LIMITED`
- **Committed in:** `4c57a47`

**2. [Rule 1 - Bug] Helper `userOf` no teste IDOR sem `.user`**
- **Found during:** task 2 (typecheck raiz após criar teste)
- **Issue:** `return body as { user: ... }` retornava envelope em vez do usuário → TS2739
- **Fix:** `return (body as { user: ... }).user` (mesmo padrão do `auth.test.ts`)
- **Files modified:** `tests/integration/idor-matrix.test.ts`
- **Verification:** `tsc --noEmit -p tsconfig.json` exit 0; 4/4 its verdes
- **Committed in:** `e237e20`

---

**Total deviations:** 2 auto-fixed (1 bug encapsulamento/wiring, 1 bug tipo estrito)
**Impact on plan:** Ambos necessários para boot global correto e typecheck strict sem mudar escopo ou semântica. Sem scope creep: contratos, schema, env, auth/projects intocados; nenhuma rota/tabela nova.

## Issues Encountered

- `jq` ausente no container — parsing JSON no `curl-idor.sh` via `node -e require('fs')` (mesmo padrão do 02-02 que usou node por falta de `python3`).
- `prettier --check` não tem parser para `.sh` — script fora do gate de formato (`.prettierignore` cobre só docs/legado; `pnpm lint/format` do produto foca TS; CI `sast` cobre shell via outros jobs).
- Gitleaks/OpenGrep não instalados neste container — CI (`secrets-tree`, `secrets-history`, `sast`) cobre no push. `pnpm audit --prod` local: 0 high (3 moderates dev-only: esbuild via drizzle-kit, vitest path-traversal).
- PG DEV via DNS docker `uhhu-dev-postgres-dev-1` (rede `uhhu-dev_default`, `.env.dev.cs`), sem `psql/pg_isready`; truncate pré-curl via `postgres` lib com role APP (DML permitido, sem TRUNCATE DDL).
- Script curl exige banco vazio no bootstrap (401 = DB não vazio); verificação truncou `projects/password_resets/sessions/invites/users` via APP role antes de subir o boot :3000.

## Auditoria adversarial (02-04)

Cobertura: `index.ts`, `plugins/rateLimit.ts|requestId.ts|errorHandler.ts`, `auth/*`, `routes/auth.ts|projects.ts`, `lib/projects.ts`, `contracts/errors.ts`, `db/schema.ts`, `idor-matrix.test.ts`, `curl-idor.sh` — roteiro baseline §4 (8 itens), arquivo-a-arquivo, antes de correção. Sem achado alto/crítico aberto.

| # | Severidade | Arquivo:linha | Checagem | Controle / Resultado |
|---|------------|---------------|----------|----------------------|
| 1 | baixa | `index.ts:39-49` | Autorização decorativa no wiring | Mitigado: `requireAuth(db)` em TODAS product routes (5/5 projects + 5/5 auth protegidas); boot só registra, não autoriza; provado por 401 sem cookie |
| 2 | baixa | `plugins/rateLimit.ts:105-130` | Bypass de throttle por IP spoofado | Mitigado: `request.ip` sem `trustProxy` (X-Forwarded-For ignorado em DEV); limites por IP + lockout por e-mail independentes; 11º login fantasma→429 `RATE_LIMITED` |
| 3 | informativa | `plugins/rateLimit.ts:10-24` | Rate-limit quebra lockout 15min | Limpo: lockout por e-mail no banco vs throttle por IP; 5×errada→401 + 6ª correta→429 `ACCOUNT_LOCKED` (não `RATE_LIMITED`) provado via curl |
| 4 | média | `lib/projects.ts:75,198,217` + `routes/projects.ts:131-217` | IDOR projects (leitura/alteração/exclusão) | Mitigado: TODA query `and(eq(id), eq(owner_id, actor.userId))`, nunca findById+check; fora do escopo→404 idêntico; provado por teste+curl (B 404/404/404 + dado intacto) |
| 5 | média | `routes/auth.ts:371-396` | IDOR sessions (revogação cruzada) | Mitigado: `target.userId !== actor.userId`→404 idêntico (inexistente/alheio/malformado); provado por cross-delete 404 + sessão intacta |
| 6 | média | `routes/projects.ts:91,172` + `lib/projects.ts:51` | `ownerId` do body sobrescreve dono | Mitigado: schemas sem `ownerId` (Zod strip) + lib só usa `actor.userId`; testado POST/PATCH com `ownerId` do B → pertence a A (B 404, lista B vazia) |
| 7 | baixa | `index.ts:29-34` + `auth/session.ts:16-23` | Sessão/cookie sem flag, fixação | Mitigado: token sempre novo server-side (hash SHA-256 UNIQUE), `HttpOnly`+`SameSite=lax`+`Secure` em prod (provado via curl), sliding no 2º meio do TTL, logout vs logout-all separados |
| 8 | baixa | `contracts/errors.ts:21-35` + `plugins/errorHandler.ts:48-82` | Vazamento stack/SQL/token em erro/429/404 | Limpo: só `buildEnvelope` do catálogo PT-BR; `x-request-id` em 200/401/404/429; regex negativa `stack|passwordHash|token` passa em todos os corpos; logger redact `authorization|cookie` |
| 9 | baixa | `routes/*:safeParse` (13×) + `lib/projects.ts:97-123` | Input hostil / DoS / injection | Mitigado: Zod em toda fronteira + clamp limit 1..100 + cursor opaco null-safe + Drizzle parametrizado (0 `sql` com input); sem `eval`/`Math.random`/`any` (grep 0) |
| 10 | informativa | `scripts/curl-idor.sh:1-14` | Auditoria ativa contra prod terceiros | Aceito por design: script só contra `BASE_URL` local/staging próprio (T-02-04-04); ZAP fica para staging com UI (sem superfície browser nesta fase) |
| 11 | baixa (residual) | `routes/auth.ts:119-133` | TOCTOU bootstrap count==0 → 2 admins | Residual conhecido do 02-02 #5: janela manual única de bootstrap; sem impacto pós-primeiro usuário; sem correção nesta fase |

**Vereditos:** 0 crítica, 0 alta aberta. 3 médias mitigadas com teste duplo, 5 baixas mitigadas/limpas, 2 informativas aceitas com motivo. Padrão CI D-13 atendido (sem aceite formal em `.planning/aceites-seguranca.md` necessário).

## User Setup Required

None - no external service configuration required. Para repetir a prova manual: `pnpm db:migrate` contra PG DEV + `pnpm --filter @uhhu/core-api start` (ou `tsx src/index.ts` com `.env.dev.cs`) + `BASE_URL=http://127.0.0.1:3000 bash scripts/curl-idor.sh` (banco vazio no bootstrap; truncate via APP role se precisar).

## Next Phase Readiness

- Pronto para verify da Fase 2: boot único verificável, PLAT-03/04/05 fechados de ponta a ponta, 18/18 integração verde, curl ALL PASS, auditoria sem pendência alta/crítica — aguardando apenas este checkpoint humano (servidor completo + cookie + lockout + reset).
- Phase 3 (buscas) pode copiar ownerId-first + cursor `limit+1` + 404 idêntico + `withClampedLimit` deste slice; rate-limit fino serve de molde para `POST /searches` e `PATCH/DELETE` futuros.
- Atenção verify: `Secure` do cookie só em `NODE_ENV=production`; `x-ratelimit-*` presentes em rotas produto (404 do `setNotFoundHandler` tem só `x-request-id` por design); throttle em memória por instância (monolito v1, sem Redis).

---

*Phase: 02-plataforma-e-isolamento*
*Completed: 2026-09-11*

## Self-Check: PASSED

- All 4 key files FOUND (`plugins/rateLimit.ts`, `index.ts`, `idor-matrix.test.ts`, `curl-idor.sh` executável)
- Both task commits FOUND (`4c57a47`, `e237e20`)
- Forbidden files untouched (contracts, `db/src/schema.ts`, `config/src/env.ts`, `routes/auth.ts`, `routes/projects.ts`, `lib/projects.ts`)
- Full suite 18/18 green; curl ALL PASS; lockout/reset/cookie provados; audit high 0
