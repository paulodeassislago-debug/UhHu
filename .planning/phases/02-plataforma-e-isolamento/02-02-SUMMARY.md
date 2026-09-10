---
phase: 02-plataforma-e-isolamento
plan: "02"
subsystem: auth
tags: [typescript, fastify, argon2id, drizzle, postgres, zod, sessions, lockout, password-reset, invites, integration-tests]
requires:
  - phase: 02-plataforma-e-isolamento/01
    provides: contratos auth PT-BR, schema users/invites/sessions/password_resets, ActorContext, plugins requestId/errorHandler, deps argon2/cookie/rate-limit/zod
provides:
  - Primitivas auth (argon2id, tokens opacos 256 bits, sessao server-side com sliding, guards requireAuth/requireAdmin)
  - Rotas /api/v1/auth/* via buildAuthRoutes(app, db) sem wiring no boot
  - Suite de integracao PG com 6 its (invite/register/login/sessao/reset/lockout) + skip offline
affects: [02-03-projetos-isolamento, 02-04-wiring-gates]
tech-stack:
  added: [drizzle-orm@^0.45.2 em @uhhu/core-api, "@uhhu/core em @uhhu/core-api (workspace)", "@fastify/cookie em devDeps raiz (harness de teste)"]
  patterns: [sessoes server-side com hash SHA-256 + sliding no segundo meio do TTL, claims atomicos de uso unico (UPDATE..WHERE used_at IS NULL), anti-enumeracao com respostas genericas + verify dummy]
key-files:
  created:
    - apps/core-api/src/auth/password.ts
    - apps/core-api/src/auth/tokens.ts
    - apps/core-api/src/auth/session.ts
    - apps/core-api/src/auth/requireAuth.ts
    - apps/core-api/src/routes/auth.ts
    - tests/integration/auth.test.ts
  modified:
    - apps/core-api/package.json
    - package.json
    - pnpm-lock.yaml
key-decisions:
  - "403 nao-admin com code estavel UNAUTHENTICATED (catalogo nao tem code proprio; nao inventar code, nao usar NOT_FOUND)"
  - "Reset com token invalido/expirado/usado responde 400 VALIDATION_ERROR generico (sem code novo no catalogo)"
  - "E-mail duplicado no registro responde 409 VALIDATION_ERROR sem consumir o convite"
  - "Claims atomicos de uso unico para convite e reset (auditoria adversarial)"
  - "requireAdmin exportado mas nao usado nas rotas (bootstrap exige checagem inline condicional); wiring real no 02-04"
patterns-established:
  - "ActorContext sempre derivado da sessao via request.actor; nenhuma rota le identidade do body"
  - "Sessoes isoladas por user_id do ator; id alheio/inexistente/invalido responde 404 identico"
  - "Testes de integracao com Fastify em memoria + migrate real + truncate por teste + skip gracioso offline"
requirements-completed: [PLAT-01, PLAT-02, PLAT-05]
duration: 16min
completed: 2026-09-10
---

# Phase 2 Plan 02: Plataforma de identidade Summary

**Convites admin-only com bootstrap, registro argon2id, login com lockout 5→15min, sessoes multi-dispositivo com sliding em cookie httpOnly, reset generico sem enumeracao e 6 testes de integracao PG — tudo via `buildAuthRoutes(app, db)` sem wiring no boot**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-10T23:24:51Z
- **Completed:** 2026-09-10T23:40:50Z
- **Tasks:** 2/2
- **Files modified:** 9 (6 criados em auth/routes/test + 3 manifests com deps)

## Accomplishments

- Primitivas isoladas: `hashPassword`/`verifyPassword` (argon2id 19MiB/2/1), 5 helpers de tokens opacos 256 bits (`randomBytes(32)` + SHA-256, expiracoes 30d/1h/30d-24h), sessao server-side (hash no banco, sliding no 2º meio do TTL, `uhhu_session` httpOnly/SameSite=lax) e guards `requireAuth`/`requireAdmin` com `ActorContext` da sessao
- 10 rotas `/api/v1/auth/*`: invites (bootstrap count==0 + admin-only), register (primeiro vira admin, 409 duplicado sem consumir convite), login (lockout por e-mail + verify dummy anti-oracle), logout/logout-all separados, me, sessions lista+revoga (404 cruzado), reset-request sempre 200 identico, reset que destrava lockout + revoga tudo + re-login implicito
- 6 its PG real verdes + suite completa 11/11 + skip offline verde; prova `curl` viva contra servidor local (201/200/204/401, reuso 400, 5×401→429, cookie com `HttpOnly; SameSite=Lax; Max-Age`)
- Auditoria adversarial arquivo-a-arquivo sem achado alto/critico aberto; 2 hardenings de concorrencia aplicados (claims atomicos)

## task Commits

Each task was committed atomically:

1. **task 1: primitivas auth (argon2id, tokens opacos, sessao, requireAuth)** - `1049fd3` (feat)
2. **task 2: rotas auth + testes de integracao PG** - `989f6bc` (feat)

## Files Created/Modified

- `apps/core-api/src/auth/password.ts` - `hashPassword`/`verifyPassword` argon2id 19MiB/2/1, erro de formato vira `false`
- `apps/core-api/src/auth/tokens.ts` - `newOpaqueToken`/`hashToken`/`inviteExpiry`/`resetExpiry`/`sessionExpiry`
- `apps/core-api/src/auth/session.ts` - `createSession`/`resolveSession`/`touchSession` + `COOKIE_NAME`/`cookieOptions`
- `apps/core-api/src/auth/requireAuth.ts` - `requireAuth(db)` (401 generico + sliding background) + `requireAdmin` (401/403) + augment `request.actor`
- `apps/core-api/src/routes/auth.ts` - `buildAuthRoutes(app, db)` com as 10 rotas, envelope PT-BR + `x-request-id` em todas
- `tests/integration/auth.test.ts` - 6 its PG real (bootstrap/admin-only, reuso/revogado/vinculado/duplicado, login+TTL+logout, lockout+reset, nao-enumeracao, sessoes multi-device)
- `apps/core-api/package.json` - adiciona `drizzle-orm`, `@uhhu/core` (deps diretas; pnpm estrito)
- `package.json` - adiciona `@fastify/cookie` ao harness de teste raiz
- `pnpm-lock.yaml` - versoes travadas

## Decisions Made

- 403 nao-admin com code estavel `UNAUTHENTICATED` (solucao literal do plano: catalogo sem code proprio; inventar code quebraria D-25, `NOT_FOUND` mentiria o motivo).
- Reset com token invalido/expirado/usado → 400 `VALIDATION_ERROR` generico (plano nao define code; nenhum code novo no catalogo, sem distinguir motivo).
- `reset-request` com formato invalido → 400; com e-mail valido → sempre 200 com corpo identico (`toEqual` entre existente/inexistente no teste).
- `requireAdmin` exportado e tipado mas nao referenciado nas rotas (bootstrap precisa de checagem inline condicional); consumo real no wiring 02-04.
- Teste usa `sql` de `@uhhu/db` em vez de `eq` do `drizzle-orm` raiz (pnpm isola copias; operadores de outra copia quebram identidade de tipos) — documentado em comentario no teste.
- `resolveRequestId` duplicado em guards/rotas (nao depender da ordem do plugin `requestId`, que so e registrado no 02-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adicionados `drizzle-orm` + `@uhhu/core` ao `@uhhu/core-api`**
- **Found during:** task 1 (imports de `eq` e `ActorContext`)
- **Issue:** pnpm estrito nao resolve `drizzle-orm` transitivo nem `@uhhu/core` ausente para o typecheck
- **Fix:** `pnpm --filter @uhhu/core-api add drizzle-orm@^0.45.2 @uhhu/core@workspace:*`
- **Files modified:** `apps/core-api/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @uhhu/core-api typecheck` exit 0
- **Committed in:** `1049fd3` (parte do commit da task 1)

**2. [Rule 3 - Blocking] Adicionado `@fastify/cookie` aos devDeps raiz**
- **Found during:** task 2 (harness do teste registra o plugin de cookie)
- **Issue:** `tests/` pertence ao pacote raiz, que nao tinha `@fastify/cookie` direto
- **Fix:** `pnpm add -Dw @fastify/cookie@^11.0.2` (mesma major do core-api)
- **Files modified:** `package.json`, `pnpm-lock.yaml`
- **Verification:** typecheck raiz + integracao verde
- **Committed in:** `989f6bc` (parte do commit da task 2)

**3. [Rule 3 - Blocking] Removido `drizzle-orm` raiz; teste usa `sql` de `@uhhu/db`**
- **Found during:** task 2 (typecheck do teste: `eq` da copia raiz vs colunas da copia do db)
- **Issue:** pnpm instalou variante com peer distinto (`drizzle-orm@0.45.2_postgres@3.4.9`); tipos `SQL`/`PgColumn` de instancias diferentes sao incompativeis
- **Fix:** `pnpm remove -Dw drizzle-orm`; revoke no teste via `sql` re-exportado por `@uhhu/db` (mesma instancia das tabelas)
- **Files modified:** `tests/integration/auth.test.ts`, `package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm typecheck` (raiz + 5 pacotes) exit 0
- **Committed in:** `989f6bc`

**4. [Rule 1 - Bug] Convite aceita body ausente (`?? {}`)**
- **Found during:** task 2 (integracao: bootstrap sem payload retornava 400)
- **Issue:** `request.body` undefined nao passa no `inviteBodySchema`; alem disso o helper de teste enviava `content-type: json` sem payload (Fastify 400 antes do handler)
- **Fix:** `safeParse(request.body ?? {})` na rota + helper so envia content-type com body presente
- **Files modified:** `apps/core-api/src/routes/auth.ts`, `tests/integration/auth.test.ts`
- **Verification:** integracao 6/6 + curl bootstrap 201
- **Committed in:** `989f6bc`

**5. [Rule 1 - Bug] Teste 6 usava sessao possivelmente revogada**
- **Found during:** task 2 (integracao: cross-user DELETE retornava 401 em vez de 404)
- **Issue:** a sessao "other" revogada podia ser a do `cookieA2`, invalidando os passos seguintes
- **Fix:** passos pos-revogacao usam `cookieA` (current, sobrevivente) com comentario
- **Files modified:** `tests/integration/auth.test.ts`
- **Verification:** integracao 6/6
- **Committed in:** `989f6bc`

**6. [Rule 2 - Missing Critical] Claims atomicos de uso unico (convite + reset)**
- **Found during:** auditoria adversarial pos-implementacao (corrida: dois POSTs concorrentes com o mesmo token passavam na checagem `used_at IS NULL` antes de qualquer UPDATE)
- **Issue:** garantia central do plano ("uso unico") furavel sob concorrencia
- **Fix:** `UPDATE .. SET used_at=now() WHERE id AND used_at IS NULL RETURNING` antes de criar usuario/trocar senha; perdedor recebe 400; claim do convite apos o 409 (nao queima convite em duplicado)
- **Files modified:** `apps/core-api/src/routes/auth.ts`
- **Verification:** typecheck + integracao 6/6 + import `and`/`isNull` da mesma copia do db
- **Committed in:** `989f6bc`

---

**Total deviations:** 6 auto-fixed (3 blocking deps/resolucao, 2 bugs, 1 missing critical de concorrencia)
**Impact on plan:** Todos necessarios para typecheck/aceitacao e para a garantia de uso unico sob concorrencia. Sem scope creep: contratos, schema, env e boot intocados; nenhuma rota extra criada.

## Issues Encountered

- `python3` ausente no container — parsing de JSON no curl-check feito com `node --input-type=module`.
- Script temporario de curl-check precisou de extensao `.mts` (raiz sem `"type": "module"`; tsx tratava `.ts` como CJS e TLA falhava). Script apagado apos a prova; nao commitado.
- Role de runtime (`uhhu_app`) sem `TRUNCATE` (prova viva de D-07 funcionando); limpeza do banco DEV feita com a role de migrate + `CASCADE`.
- Gitleaks/OpenGrep nao instalados neste container — CI (`secrets-tree`, `secrets-history`, `sast`) cobre no push. `pnpm audit --prod`: 0 vulnerabilidades.

## Auditoria adversarial (resumo registrado)

Cobertura: `auth/*`, `routes/auth.ts`, teste de integracao. Sem achado alto/critico aberto:

| # | Arquivo | Checagem | Resultado |
|---|---------|----------|-----------|
| 1 | `routes/auth.ts` (register/reset) | Double-spend concorrente de token unico | **Corrigido** (claims atomicos, dev. 6) |
| 2 | `routes/auth.ts` (login) | Oracle de tempo em e-mail inexistente | Mitigado (verify dummy + 401 generico; testado) |
| 3 | `routes/auth.ts` (reset-request) | Enumeracao de e-mails | Mitigado (200 identico; `toEqual` no teste) |
| 4 | `routes/auth.ts` (register 409) | Vazamento de existencia de e-mail | Aceito por design (exige convite valido; especificado no plano) |
| 5 | `routes/auth.ts` (invites bootstrap) | TOCTOU count==0 → 2 admins | Risco baixo residual (janela manual unica de bootstrap; sem impacto pos-primeiro usuario) |
| 6 | `session.ts`/`requireAuth.ts` | Fixacao de sessao / cookie sem flag | Mitigado (token sempre novo server-side; `HttpOnly`+`SameSite=lax`+`Secure` em prod; provado via curl) |
| 7 | geral | SQL injection / XSS / segredos em log-resposta | Limpo (Drizzle parametrizado; JSON sem HTML; logs sem token/senha; `pnpm audit` 0) |
| 8 | `routes/auth.ts` (reset-request) | Spam sem rate-limit | Residual → 02-04 (hook de rate-limit cobre; lockout por e-mail ja ativo no login) |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pronto para 02-04 (wiring): assinatura `buildAuthRoutes(app, db)` posicional + `COOKIE_NAME='uhhu_session'` + primitivas, exatamente como o 02-04 espera (`app.register(async (i) => buildAuthRoutes(i, db))` apos `@fastify/cookie`).
- 02-03 pode importar `requireAuth`/`ActorContext` de `apps/core-api/src/auth/requireAuth.ts` (augment `request.actor` incluso) — ou usar stub compativel; o teste com sessoes reais sera refeito no 02-04.
- Atencao 02-04: rate-limit em `POST /auth/login|register|invites|password/*` (residual da auditoria #8); `Secure` do cookie flipa com `NODE_ENV=production`.

---
*Phase: 02-plataforma-e-isolamento*
*Completed: 2026-09-10*

## Self-Check: PASSED

- All 6 key files FOUND (`auth/*.ts` x4, `routes/auth.ts`, `tests/integration/auth.test.ts`)
- Both task commits FOUND (`1049fd3`, `989f6bc`)
- Forbidden files untouched (contracts, `db/src/schema.ts`, `config/src/env.ts`, `index.ts`, `routes/projects.ts`)
- Full suite 11/11 green; offline skip green; live curl proof recorded above
