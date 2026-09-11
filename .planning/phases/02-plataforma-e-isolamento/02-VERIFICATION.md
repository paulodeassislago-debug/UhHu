---
phase: 02-plataforma-e-isolamento
verified: 2026-09-11T22:45:00Z
status: human_needed
score: 16/16 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Boot + health com X-Request-Id"
    expected: "`pnpm db:migrate` + start core-api; `curl /health` retorna status/db ok com header `x-request-id`; `/api/v1/auth/me` sem cookie retorna 401 com envelope PT-BR"
    why_human: "Plano 02-04 define checkpoint blocking humano; PG inalcançavel neste container (testes fazem skip gracioso), então prova viva exige ambiente com PG DEV"
  - test: "Matriz IDOR via curl (PLAT-04)"
    expected: "`BASE_URL=http://127.0.0.1:3000 bash scripts/curl-idor.sh` → ALL PASS (dono 200, estranho 404/404/404, adulterado 404, sem confirm 400, com confirm 204)"
    why_human: "Exige servidor local + PG DEV com banco vazio no bootstrap; não executável neste container"
  - test: "Lockout + reset genérico ao vivo"
    expected: "5 logins errados → 6ª retorna 429 ACCOUNT_LOCKED PT-BR; reset-request sempre 200 idêntico para e-mail existente/inexistente"
    why_human: "Comportamento temporal contra servidor real; código verificado estaticamente (lockout/lockout-MS/reset genérico presentes)"
  - test: "Cookie de sessão e lista de sessões"
    expected: "Cookie `uhhu_session` com flags HttpOnly (+Secure em prod) e SameSite=Lax; `GET /api/v1/auth/sessions` lista com `current:true`"
    why_human: "Flags de cookie e sliding só observáveis em navegador/curl contra boot real"
---

# Phase 2: Plataforma e isolamento Verification Report

**Phase Goal:** Contas, sessões e isolamento ownerId funcionando e testados adversarialmente em toda rota com ID
**Verified:** 2026-09-11T22:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Toda resposta de erro segue o envelope `{error:{code,message,details,requestId}}` com mensagem PT-BR e sem stack/SQL/tokens | ✓ VERIFIED | `errors.ts`: 12 codes PT-BR + `buildEnvelope` único; `errorHandler.ts` só usa `buildEnvelope`, Zod→400, resto→500 `INTERNAL_ERROR`; regex negativa `stack\|passwordHash\|token` coberta em testes; zero `TODO/console.log` |
| 2 | Toda resposta carrega X-Request-Id (aceita o enviado quando seguro, gera quando ausente/inseguro) | ✓ VERIFIED | `requestId.ts` com allowlist `^[A-Za-z0-9_.:~-]{1,128}$` + `randomUUID()` fallback, header + `request.requestId`; mesmo pattern em `errorHandler/rateLimit/auth/projects/index`; `setNotFoundHandler` com envelope + header |
| 3 | Tipos de auth/projetos/paginação existem em packages/contracts e nenhum outro pacote os duplica | ✓ VERIFIED | `contracts/src/{errors,pagination,auth,projects}.ts` + `index.ts` re-exporta os 4; rotas usam `registerSchema/loginSchema/resetConfirmSchema/createProjectSchema/updateProjectSchema` verbatim; `import type` para DTOs; zero `any` em contracts/auth/routes/lib |
| 4 | Tabelas users/sessions/invites/password_resets/projects existem no schema Drizzle com ownerId server-side e constraints | ✓ VERIFIED | `schema.ts` com 6 `pgTable` (infra_proof preservada + 5 novas), `owner_id` FK CASCADE, UNIQUE em email/token_hash, CHECKs role/status, índice owner; migration `0001_0001_platform_projects.sql` com 5 `CREATE TABLE`s; zero `workspaceId` (D-23) |
| 5 | Usuário cria conta com nome+e-mail+senha (argon2id) somente com convite válido; convite usado ou revogado nunca reutiliza | ✓ VERIFIED | `password.ts` argon2id 19MiB/2/1; `tokens.ts` `randomBytes(32)`+SHA-256, expirações 30d/1h/30d-24h; `auth.ts` bootstrap count==0 + admin-only + claim atômico `UPDATE..WHERE used_at IS NULL RETURNING` + 400 INVITE_INVALID/REVOKED + 409 duplicado sem consumir convite |
| 6 | Usuário loga (manter conectado 30d vs 24h), mantém sessão deslizante em cookie httpOnly/Secure/SameSite, vê sessões ativas, revoga individual e sai de todas; logout só encerra o aparelho atual | ✓ VERIFIED | `session.ts` `createSession/resolveSession/touchSession` (sliding 2º meio TTL) + `COOKIE_NAME='uhhu_session'` + `cookieOptions {httpOnly, secure:isProd, sameSite:lax}`; rotas login/logout/logout-all/me/sessions/DELETE com escopo `userId`; `setCookie/clearCookie` com `cookieOptions` no código |
| 7 | Reset por e-mail usa token único de 1h com mensagens genéricas (sem enumeração); reset com sucesso destrava lockout | ✓ VERIFIED | `reset-request` sempre 200 `PASSWORD_RESET_SENT` idêntico (log só requestId+userId, sem token); `reset` valida `resetConfirmSchema`, claim atômico, zera `failedAttempts/lockedUntil`, revoga todas as sessões + re-login implícito |
| 8 | 5 logins falhos bloqueiam 15min por e-mail; resposta de credencial inválida é genérica PT-BR | ✓ VERIFIED | `auth.ts:246-273`: `lockedUntil>now`→429 ACCOUNT_LOCKED; user inexistente→verify dummy + 401 INVALID_CREDENTIALS; errada→`failedAttempts+1`, 5ª seta `lockedUntil+15min`; `grep Math.random` = 0 |
| 9 | Usuário cria, lista (paginado), lê e atualiza projetos (título obrigatório, pergunta/descrição opcionais e editáveis) | ✓ VERIFIED | `lib/projects.ts` `toProjectDTO` + 5 helpers; `routes/projects.ts` POST 201/GET lista `{items,page}`/GET/PATCH 200 com `createProjectSchema/updateProjectSchema`; `withClampedLimit` 1..100 |
| 10 | Projeto fora do owner logado retorna 404 sem revelar existência em leitura, alteração e exclusão | ✓ VERIFIED | TODA query `and(eq(id), eq(ownerId, actor.userId))` — nunca findById+check; fora do escopo→404 NOT_FOUND idêntico (inclusive UUID malformado); `grep ownerId.*body` = 0; sessions cross→404 idêntico |
| 11 | Excluir exige `?confirm=true` e apaga; arquivar oculta da lista e permite reativar | ✓ VERIFIED | DELETE sem `confirm=true`→400 CONFIRMATION_REQUIRED, com→204; arquivar/reativar via `PATCH {status}` allowlist active\|archived; lista default `active`, `all` inclui arquivados |
| 12 | Lista pagina com limit+cursor (default 20, max 100) e retorna nextCursor/hasMore com ordenação estável | ✓ VERIFIED | `pagination.ts` `paginationQuerySchema` default 20/max 100 + `encode/decodeCursor` null-safe; lib ordenação `created_at DESC, id DESC` + `limit+1` + `nextCursor/hasMore`; cursor malformado recomeça sem 400 |
| 13 | Servidor sobe com todas as rotas auth+projects atrás de requestId+envelope+rate-limit; erros em PT-BR sem vazamento | ✓ VERIFIED | `index.ts`: `cookie` + `requestIdPlugin` + `errorHandler` + `registerRateLimits` globais no root, `healthRoute` antes do produto, `buildAuthRoutes` + `buildProjectRoutes` com DB único, `setNotFoundHandler` 404 envelope; logger redact preservado; typecheck 3 pacotes exit 0 |
| 14 | Rate limit em login/convite/reset responde 429 com envelope e não quebra o lockout de 15min | ✓ VERIFIED | `rateLimit.ts`: global 200/min (`errorResponseBuilder` envelope) + hook fino por IP (login 10/register 20/invites 20/reset 5) com 429 RATE_LIMITED + `x-request-id`; lockout por e-mail no banco é independente (throttle não toca `failedAttempts`) |
| 15 | Matriz dono/estranho/ID-adulterado via curl passa para leitura, alteração e exclusão de projetos e sessões | ✓ VERIFIED | `scripts/curl-idor.sh` executável (12×`404`, `curl -w '%{http_code}'`, jars A/B separados, bootstrap→A→convite B→cria→B 404/404/404→adulterado 404→cross-session 404→sem-confirm 400→com-confirm 204, `assert_code` com exit 1); `idor-matrix.test.ts` 4 its com sessões reais cobrem a mesma matriz + `ownerId` ignorado + regex negativa |
| 16 | Auditoria adversarial arquivo-a-arquivo registrada sem achado alto/crítico aberto (ou com aceite formal) | ✓ VERIFIED | 02-02 SUMMARY: 8 itens (1 corrigido — claims atômicos); 02-03 SUMMARY: 8 itens, 0 alto/crítico; 02-04 SUMMARY: 11 itens (3 médias mitigadas com teste duplo, 0 crítica/0 alta aberta, residual bootstrap TOCTOU documentado); padrão CI D-13 atendido sem aceite formal necessário |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/contracts/src/errors.ts` | Catálogo PT-BR + envelope | ✓ VERIFIED | `ERROR_CATALOG` 12 msgs + `buildEnvelope`; importado por errorHandler/rateLimit/rotas |
| `packages/contracts/src/pagination.ts` | Helpers cursor limit+cursor | ✓ VERIFIED | `encodeCursor/decodeCursor/paginationQuerySchema/PageInfo`; consumido por routes/projects + lib |
| `packages/db/src/schema.ts` | Tabelas platform + projects | ✓ VERIFIED | 6 `pgTable`, `owner_id` FK CASCADE, UNIQUEs, CHECKs; migration 0001 com 5 CREATE TABLEs |
| `apps/core-api/src/plugins/errorHandler.ts` | Error handler global | ✓ VERIFIED | Zod→400, status preservado, resto→500; `ERROR_CATALOG` importado, nunca envelope inline |
| `packages/core/src/actor.ts` | ActorContext da sessão | ✓ VERIFIED | `ActorContext/requireUser/isAdmin/UnauthenticatedError`; `requireAuth` constrói da sessão, nunca do body |
| `apps/core-api/src/routes/auth.ts` | Rotas invites/register/login/logout/me/sessions/reset | ✓ VERIFIED | 10 rotas via `buildAuthRoutes`; schemas Zod + `hashToken` + `user_id` escopado; registrada no boot |
| `apps/core-api/src/auth/session.ts` | Sessão server-side + sliding | ✓ VERIFIED | `uhhu_session` + `sameSite`; create/resolve/touch; usada por requireAuth + rotas |
| `tests/integration/auth.test.ts` | Cobertura invite/register/login/sessão/reset/lockout | ✓ VERIFIED | 6 its PG real + `ACCOUNT_LOCKED` + `uhhu_session` + skip offline |
| `apps/core-api/src/routes/projects.ts` | CRUD `/api/v1/projects` com ownerId da sessão | ✓ VERIFIED | 5 rotas, `preHandler: requireAuth` em TODAS, `request.actor`, `CONFIRMATION_REQUIRED`; registrada no boot |
| `apps/core-api/src/lib/projects.ts` | Queries escopadas + camelCase | ✓ VERIFIED | `toProjectDTO` + `owner_id = actor.userId` em todas; `and(eq(id),eq(ownerId))` |
| `tests/integration/projects.test.ts` | Isolamento dono/estranho + paginação | ✓ VERIFIED | 5 its + `404/nextCursor/CONFIRMATION_REQUIRED` + skip offline |
| `apps/core-api/src/index.ts` | Boot com plugins + rotas | ✓ VERIFIED | `buildAuthRoutes` + `buildProjectRoutes` + `cookie`; DB único; 404 envelope |
| `apps/core-api/src/plugins/rateLimit.ts` | Rate limits por rota | ✓ VERIFIED | `RATE_LIMITED` + `max: 10` login; global 200 + hook fino; `rateLimitPlugin` registrado no boot |
| `scripts/curl-idor.sh` | Prova curl dono/estranho/adulterado | ✓ VERIFIED | Executável, 12×`404`, `curl.*projects` leitura/alteração/exclusão + sessions + confirm |
| `tests/integration/idor-matrix.test.ts` | Matriz automatizada | ✓ VERIFIED | 4 its, `stranger/estranho/ownerId`, sessões reais, asserts `x-request-id` + regex negativa |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `plugins/errorHandler.ts` | `contracts/errors.ts` | importa ERROR_CATALOG, nunca envelope inline | WIRED | `import { ERROR_CATALOG, buildEnvelope }` + 4 usos `buildEnvelope` |
| `db/schema.ts` | `contracts/auth.ts` | snake_case ↔ camelCase DTOs | WIRED | `token_hash/user_id/owner_id/password_hash` no schema; DTOs camelCase + `toProjectDTO` faz a ponte |
| `routes/auth.ts` | `contracts/auth.ts` | bodies validados por schemas | WIRED | `registerSchema/loginSchema/resetConfirmSchema` + `safeParse` antes de qualquer DB |
| `auth/requireAuth.ts` | `core/actor.ts` | constrói ActorContext da sessão | WIRED | `import type { ActorContext }`, injeta `request.actor = {userId, role, requestId, authMethod:'session'}` |
| `routes/auth.ts` | `db/schema.ts` | drizzle com where owner/user + token_hash | WIRED | `eq(invites/sessions/passwordResets.tokenHash, hashToken(..))` + `eq(sessions.userId, actor.userId)` |
| `routes/projects.ts` | `contracts/projects.ts` | schemas validam todo body | WIRED | `createProjectSchema/updateProjectSchema` + `safeParse` em POST/PATCH/lista |
| `lib/projects.ts` | `db/schema.ts` | toda query filtra owner_id | WIRED | `and(eq(id), eq(ownerId, actor.userId))` em get/update/delete; lista com `eq(ownerId)` |
| `routes/projects.ts` | `core/actor.ts` | actor de requireAuth, nunca do body | WIRED | `preHandler: requireAuth(db)` 5/5 rotas + `request.actor`; `ownerId` do cliente = 0 ocorrências |
| `index.ts` | `routes/auth.ts` | registra buildAuthRoutes com DB único | WIRED | `app.register(async (child) => buildAuthRoutes(child, db))` |
| `index.ts` | `routes/projects.ts` | registra buildProjectRoutes no mesmo Fastify | WIRED | `app.register(async (child) => buildProjectRoutes(child, db))` |
| `scripts/curl-idor.sh` | `routes/projects.ts` | exercita leitura/alteração/exclusão com 2 usuários + ID adulterado | WIRED | 4×`curl.*projects` (POST/GET/PATCH/DELETE) + adulterado + confirm 400/204 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `routes/auth.ts` | `user/session/invite` rows | Drizzle `select/insert/update/delete` em users/invites/sessions/password_resets via `createDb` | ✓ FLOWING | login/register/sessions/reset leem e retornam linhas reais; reset-request genérico por design anti-enumeração |
| `routes/projects.ts` + `lib/projects.ts` | `items/ProjectDTO` | `select..where(owner_id=actor.userId)` + `toProjectDTO` (snake→camel, ISO UTC) | ✓ FLOWING | CRUD retorna DTOs do banco; lista `limit+1` com cursor real |
| `plugins/rateLimit.ts` | throttle Map por IP | Hook `preHandler` inspecionando `method+url`, `request.ip` | ✓ FLOWING | Retorna 429 envelope sem tocar no banco; lockout independente preservado |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck contracts+core+core-api | `pnpm --filter ... typecheck` | exit 0, 3 pacotes Done | ✓ PASS |
| Integration projects (PG real) | `pnpm vitest run --project integration projects.test.ts` | 5 passed — com skip gracioso (PG inalcançavel neste container) | ? SKIP (live) |
| Zero `any` em produção | `grep -rn "as any\|: any"` nos 4 dirs | 0 ocorrências | ✓ PASS |
| Script curl executável | `test -x scripts/curl-idor.sh` | EXEC_OK, 12×`404` | ✓ PASS |
| Boot + curl ALL PASS contra PG DEV | `bash scripts/curl-idor.sh` com servidor local | Não executável aqui (sem PG/servidor) | ? SKIP → humano |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PLAT-01 | 02-02 | Conta e-mail+senha (argon2id) só com convite válido; revogado não vale | ✓ SATISFIED | Convite 30d uso único atômico, bootstrap, register primeiro=admin, 409 sem consumir |
| PLAT-02 | 02-02 | Login + sessão segura cookie; logout revoga | ✓ SATISFIED | Sliding 30d/24h, httpOnly/Secure(prod)/SameSite=lax, lista+revoga+logout-all |
| PLAT-03 | 02-03, 02-04 | Toda leitura/alteração/exclusão verifica ownerId; fora do escopo 404 | ✓ SATISFIED | Owner-first em projects + sessions, 404 idêntico, ownerId nunca do cliente |
| PLAT-04 | 02-04 | Testes dono/estranho/ID-adulterado via curl em leitura/alteração/exclusão | ✓ SATISFIED | 4 its + script curl executável, mesma matriz projects+sessions |
| PLAT-05 | 02-01, 02-02, 02-04 | Rate limit; X-Request-Id; envelope sem vazamento | ✓ SATISFIED | 200 global + 10/20/5 auth, allowlist requestId global, envelope PT-BR em tudo |
| CORE-01 | 02-01, 02-03 | REST `/api/v1`, JSON UTF-8, ISO UTC, IDs opacos, camelCase/snake_case, limit+cursor | ✓ SATISFIED | Rotas `/api/v1`, `toProjectDTO` camelCase+ISO, UUID opacos, `page{limit,nextCursor,hasMore}` |
| LAB-01 | 02-03 | Cria/lista/lê/atualiza projetos (título + pergunta) | ✓ SATISFIED | CRUD + editável a qualquer momento + arquivar/reativar + múltiplos por usuário |

Orphaned requirements: none — todos os 7 IDs da fase aparecem nos PLANs (02-01: CORE-01, PLAT-05; 02-02: PLAT-01, PLAT-02, PLAT-05; 02-03: LAB-01, PLAT-03, CORE-01; 02-04: PLAT-03, PLAT-04, PLAT-05).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `routes/auth.ts:68`, `lib/projects.ts:70,79,166,202` | `return null` | ℹ️ Info | Legítimo: `readSessionCookie`/UUID inválido/row ausente → chamadores convertem em 401/404 genérico; não é stub |
| — | TODO/FIXME/placeholder/console.log | — | Nenhum encontrado nos 6 dirs verificados | — |

### Human Verification Required

Plano 02-04 declara `checkpoint:human-verify` com gate **blocking** (tasks auto 2/2 feitas, checkpoint pendente). PG inalcançável neste container → integração faz skip gracioso por design, então a prova viva precisa de ambiente com PG DEV:

### 1. Boot + health com X-Request-Id

**Test:** `pnpm db:migrate` contra PG DEV + start core-api; `curl -s http://127.0.0.1:3000/health` e `GET /api/v1/auth/me` sem cookie
**Expected:** `/health` com 4 campos + header `x-request-id`; `/me` 401 envelope `{error:{code:'UNAUTHENTICATED',...}}` PT-BR
**Why human:** Exige PG DEV + servidor local; não executável neste container

### 2. Matriz IDOR via curl (PLAT-04)

**Test:** `BASE_URL=http://127.0.0.1:3000 bash scripts/curl-idor.sh` (banco vazio no bootstrap)
**Expected:** ALL PASS — dono 200, estranho 404/404/404 + dado intacto, adulterado 404, sem confirm 400, com confirm 204
**Why human:** Exige servidor + PG; SUMMARY 02-04 registra ALL PASS prévio mas a reprodução independente é o gate

### 3. Lockout + reset genérico ao vivo

**Test:** Login com senha errada 5x → 6ª tentativa; `reset-request` com e-mail existente e inexistente
**Expected:** 6ª retorna 429 ACCOUNT_LOCKED PT-BR; reset-request sempre 200 com corpo idêntico (sem enumeração)
**Why human:** Comportamento temporal contra servidor real

### 4. Cookie de sessão e lista de sessões

**Test:** Login com `rememberMe` true/false; inspecionar `Set-Cookie`; `GET /api/v1/auth/sessions`
**Expected:** `uhhu_session` HttpOnly (+Secure em prod), SameSite=Lax, Max-Age 30d/24h; lista com `current:true` na sessão atual
**Why human:** Flags de cookie e sliding observáveis só contra boot real

### Gaps Summary

Nenhum gap de implementação: 16/16 truths verificadas no código (exists + substantive + wired + data flowing), 15/15 artefatos, 11/11 key links, 7/7 requirements, typecheck verde, zero `any`, zero TODO/stub. O único item aberto é a reprodução humana do checkpoint blocking do plano 02-04 (boot + curl + lockout + cookie contra PG DEV), já que este container não alcança o PG e os testes fazem skip gracioso por design.

---

_Verified: 2026-09-11T22:45:00Z_
_Verifier: OpenCode (gsd-verifier)_
