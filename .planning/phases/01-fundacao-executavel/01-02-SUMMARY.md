---
phase: 01-fundacao-executavel
plan: '02'
subsystem: infra
tags: [postgres, drizzle, fastify, zod, healthcheck, least-privilege, env-separation]

# Dependency graph
requires:
  - phase: 01-01
    provides: [Monorepo pnpm instalável, tsconfig base strict, pacotes-esqueleto db/config/core-api]
provides:
  - PG DEV dedicado via compose próprio (bind local, senha via env)
  - Env validado com Zod por NODE_ENV (APP vs MIGRATION DATABASE_URL)
  - packages/db dono total do Drizzle + migration 0000_infra_proof
  - Boot Fastify com GET /health (4 campos, nunca 500, sem segredos)
affects: ['01-03 (CI+gates+integracao PG)', 'Phase 2 (platform auth sobre infra_proof como modelo)']

# Tech tracking
tech-stack:
  added: [zod 4, drizzle-orm 0.45, postgres 3 (driver), drizzle-kit 0.31, fastify 5, tsx 4]
  patterns: ['factory createDb(url) — único ponto de conexão SQL', 'checkDatabase nunca lança (health nunca 500)', 'migrate usa só MIGRATION_DATABASE_URL com redação de senha', 'entradas de pacote apontando para src/ até existir pipeline de build']

key-files:
  created: [compose.dev.yml, .env.example, packages/config/src/env.ts, packages/config/README.md, packages/db/src/schema.ts, packages/db/src/client.ts, packages/db/src/migrate.ts, packages/db/drizzle.config.ts, packages/db/drizzle/0000_infra_proof.sql, packages/db/drizzle/meta/_journal.json, packages/db/drizzle/meta/0000_snapshot.json, apps/core-api/src/health.ts]
  modified: [packages/config/src/index.ts, packages/config/package.json, packages/db/src/index.ts, packages/db/package.json, apps/core-api/src/index.ts, apps/core-api/package.json, .prettierignore, pnpm-lock.yaml]

key-decisions:
  - 'Entradas @uhhu/config e @uhhu/db apontam para src/ (sem build ainda; typecheck/tsx resolvem sem dist)'
  - 'drizzle.config.ts consome env validado (falha dura sem env) em vez de process.env cru'
  - 'Meta do drizzle-kit (journal+snapshot) commitada: migrate() exige _journal.json'
  - 'X-Request-Id com allowlist estrita; fora do padrão regenera via crypto.randomUUID'
  - 'migrate redige a mensagem de erro inteira (driver pode ecoar a connection string)'

patterns-established:
  - 'core-api nunca toca SQL/driver: importa createDb/checkDatabase de @uhhu/db'
  - 'Segredo só em .env 600 ignorado + memória; exemplo commitado só com CHANGE_ME'
  - 'Health degradado (200) em vez de 500 quando o banco está inalcançável'

requirements-completed: [FOUND-01, FOUND-04]

# Metrics
duration: ~9min
completed: 2026-09-09
---

# Phase 1 Plan 2: PG DEV + envs + Drizzle + GET /health Summary

**PostgreSQL DEV dedicado com roles separadas (app DML vs migrate DDL), env Zod com duas DATABASE_URLs, Drizzle dono total com migration de prova infra_proof e boot Fastify com GET /health de 4 campos que degrada sem 500 nem vazamento.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-09-09T14:28:32Z
- **Completed:** 2026-09-09T14:37:37Z
- **Tasks:** 3 (+1 fix de auditoria)
- **Files modified:** 20 (12 criados + 8 alterados; `.env.dev` criado mas intencionalmente não rastreado)

## Accomplishments

- `compose.dev.yml` com `postgres-dev` (postgres:16-alpine, volume `uhhu-pgdata-dev`, bind `127.0.0.1:55432`, senha só via `${PG_DEV_PASSWORD:?required}`)
- `packages/config` valida env com Zod: `APP_DATABASE_URL` (runtime) vs `MIGRATION_DATABASE_URL` (DDL), `PORT`, `LOG_LEVEL`; README documenta roles `uhhu_migrate` vs `uhhu_app` + setup na VPS
- `packages/db` dono total: `schema.ts` só com `infra_proof`, `createDb(url)` + `checkDatabase` (nunca lança), `migrate.ts` só com `MIGRATION_DATABASE_URL` e redação de senha, `0000_infra_proof.sql` gerado via `drizzle-kit generate`
- `apps/core-api` com boot Fastify real + `GET /health` (sem prefixo `/api/v1`): corpo exato de 4 campos, HTTP 200 até degradado, `x-request-id` aceito ou gerado com `crypto.randomUUID`, logger com `redact` de authorization/cookie, bind `127.0.0.1` no DEV
- Gates verdes: `pnpm typecheck`, `pnpm lint`, `pnpm format` exit 0

## Task Commits

Each task was committed atomically:

1. **task 1: PG DEV dedicado + separação dev/prod com Zod** — `8e91e8a` (feat)
2. **task 2: Drizzle dono total + migration de prova de infra** — `5a12a08` (feat)
3. **task 3: boot Fastify + GET /health sem segredos** — `8858484` (feat)
4. **auditoria adversarial: endurecer /health e redação do migrate** — `5ea2b38` (fix)

**Plan metadata:** (este SUMMARY + STATE/ROADMAP/REQUIREMENTS, commit `docs(01-02)` a seguir)

## Files Created/Modified

- `compose.dev.yml` — PG DEV local-only com volume e credenciais próprios
- `.env.example` — exemplo commitado com `CHANGE_ME` (`.env.dev` criado local, ignorado)
- `packages/config/src/env.ts` — schema Zod + `env` parseado (fail-closed, sem log de valores)
- `packages/config/src/index.ts` — re-exporta `env`/`AppEnv`
- `packages/config/README.md` — roles, grants SQL e setup na VPS
- `packages/db/src/schema.ts` — só `infra_proof` + comentário de proibição D-08
- `packages/db/src/client.ts` — `createDb(url)` (max 10), `checkDatabase` (nunca lança), `parseCount` com narrowing de `unknown`
- `packages/db/src/migrate.ts` — `migrateDatabase(url)` + `main()` com `MIGRATION_DATABASE_URL`, redação total da mensagem de erro, guarda `import.meta.url` para não executar ao ser importado
- `packages/db/src/index.ts` — re-exporta schema + client + migrate
- `packages/db/drizzle.config.ts` — dialeto postgresql, schema/out, credenciais via `env.MIGRATION_DATABASE_URL`
- `packages/db/drizzle/0000_infra_proof.sql` — `CREATE TABLE infra_proof` + header de prova de infra
- `packages/db/drizzle/meta/` — journal + snapshot do drizzle-kit (exigidos pelo `migrate()`)
- `apps/core-api/src/health.ts` — `healthRoute` (plugin), `APP_VERSION = '0.1.0-fase1'`, `HealthResponse` de 4 campos, allowlist de request-id
- `apps/core-api/src/index.ts` — boot Fastify com redact, `/health`, `createDb(env.APP_DATABASE_URL)`, bind condicional
- `packages/{config,db}/package.json`, `apps/core-api/package.json` (+ `start: tsx src/index.ts`), `pnpm-lock.yaml`, `.prettierignore`

## Decisions Made

- Entradas de `@uhhu/config` e `@uhhu/db` apontam para `src/` (ver desvio 1)
- `drizzle.config.ts` importa `env` validado em vez de `process.env` cru (falha dura sem env, coerente com fail-closed)
- Meta do drizzle-kit commitada junto da migration (ver desvio 3)
- `HealthResponse` definido em `health.ts` (não em `@uhhu/contracts`): contracts só ganha tipos após validação do contrato por seções (D-08); tipo único, sem cópia — migra para contracts quando a validação pousar
- Bind `0.0.0.0` em produção (atrás de TLS/nginx) vs `127.0.0.1` no DEV, via `env.NODE_ENV`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Entradas dos pacotes apontam para `src/` em vez de `dist/`**

- **Found during:** task 2 (primeiro import real entre workspaces: `packages/db` → `@uhhu/config`)
- **Issue:** `main`/`types` apontavam para `./dist/*` inexistente (sem pipeline de build nesta fase); `tsc --noEmit` falhava com `TS2307: Cannot find module '@uhhu/config'`, e `tsx` falharia em runtime pelo mesmo motivo. O SUMMARY 01-01 (desvio 3) previu que o plano 01-02 resolveria isso
- **Fix:** `main`/`types` de `@uhhu/config` e `@uhhu/db` → `./src/index.ts`. Zero build necessário para typecheck/lint/tsx/vitest futuros; quando o pipeline de build chegar, volta para `dist`
- **Files modified:** `packages/config/package.json`, `packages/db/package.json`
- **Verification:** `pnpm typecheck` exit 0 com imports `@uhhu/config`/`@uhhu/db` reais
- **Committed in:** `5a12a08` (task 2)

**2. [Rule 3 - Blocking] `drizzle/meta/` fora do gate de formato**

- **Found during:** task 2 (`pnpm format` após `db:generate`)
- **Issue:** `_journal.json` e `0000_snapshot.json` gerados pelo drizzle-kit não seguem o estilo Prettier; reformatar criaria ruído a cada `generate`
- **Fix:** `packages/db/drizzle/meta/` no `.prettierignore` (artefato machine-owned, como `dist/`)
- **Files modified:** `.prettierignore`
- **Verification:** `pnpm format` exit 0
- **Committed in:** `5a12a08` (task 2)

**3. [Rule 3 - Blocking] Meta do drizzle-kit commitada além da lista do plano**

- **Found during:** task 2 (leitura do contrato do `migrate()` do drizzle-orm)
- **Issue:** `migrate(db, { migrationsFolder })` exige `drizzle/meta/_journal.json`; só o `.sql` (único arquivo listado no plano) faria o `db:migrate` falhar com "Can't find meta/_journal.json" mesmo com PG no ar
- **Fix:** `db:generate --name infra_proof` executado de verdade (offline, com env dummy) e journal + snapshot commitados
- **Files modified:** `packages/db/drizzle/meta/_journal.json`, `packages/db/drizzle/meta/0000_snapshot.json`
- **Verification:** `db:generate` exit 0; `db:migrate` chega até a tentativa de conexão (falha só por ECONNREFUSED, prova de que o journal foi lido)
- **Committed in:** `5a12a08` (task 2)

**4. [Rule 2 - Missing Critical] Auditoria adversarial: request-id e redação do migrate**

- **Found during:** auditoria pós-task-3 (AGENTS.md), antes do commit final
- **Issue A:** `reply.header('x-request-id', id)` fora do `try` com validação só de tamanho — header com CRLF/caracteres de controle lançaria fora do handler e o Fastify responderia 500, violando "health nunca 500"
- **Issue B:** `migrate.ts` redigia só a URL configurada, não a mensagem do driver — postgres.js pode ecoar a connection string no erro e vazar a senha para stderr
- **Fix:** allowlist `/^[A-Za-z0-9_.:~-]{1,128}$/` (fora do padrão → regenera UUID); `redactConnectionString()` aplicada à mensagem de erro inteira
- **Files modified:** `apps/core-api/src/health.ts`, `packages/db/src/migrate.ts`
- **Verification:** typecheck/lint/format exit 0; boot offline: id de 200 chars substituído por UUID (HTTP 200), id válido ecoado
- **Committed in:** `5ea2b38` (fix dedicado, sem amend)

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 missing-critical/security)
**Impact on plan:** todos necessários para gates verdes e "health nunca 500 / zero segredo"; nenhum amplia escopo de produto (zero tabelas de domínio, zero endpoints além de `/health`).

## Issues Encountered

- **PG inalcançável neste container (esperado, D-06):** sem `psql`/`pg_isready`/Docker aqui; `db:migrate` falha com ECONNREFUSED e `GET /health` responde `degraded` — ambos capturados como evidência abaixo, não como falha do plano
- **Processos órfãos após `kill` do wrapper:** `kill $(cat pid)` matou o `pnpm` mas deixou `tsx`/`node` ouvindo a porta; limpos com `pkill -f "[t]sx/…"` (bracket trick — o primeiro `pkill` sem brackets matou o próprio shell). Lição registrada para o plano 01-03: subir o servidor de teste com `setsid` + matar o process group
- **`python3` ausente no container:** teste de id oversized refeito com `printf` do bash

## Gate Evidence (verificado aqui — sem PG)

Executado na raiz em 2026-09-09 (node v22.17.0, pnpm 9.15.0, fastify 5, drizzle-orm 0.45, zod 4):

- `pnpm typecheck` → exit 0 (4 workspaces com script; cross-workspace `@uhhu/config`/`@uhhu/db` resolvendo via `src/`)
- `pnpm lint` → exit 0 · `pnpm format` → exit 0
- `grep -c "postgres-dev|uhhu-pgdata-dev|127.0.0.1:55432:5432"` no compose → presentes; `grep -i "password:"` → só a linha `${PG_DEV_PASSWORD:?required}`
- `packages/db/src/schema.ts`: único `pgTable(` é `infra_proof`; `users/projects/searches/results` só no comentário de proibição D-08
- `packages/db/src/migrate.ts` usa `MIGRATION_DATABASE_URL` (nunca `APP_DATABASE_URL`)
- `apps/core-api/src`: zero ocorrências de `postgres`/`drizzle`; `DATABASE_URL` só como `env.APP_DATABASE_URL` (2x); zero `Math.random` literal
- `db:migrate` offline → exit 1 com `postgresql://uhhu_migrate:***@127.0.0.1:55432/uhhu_dev` (senha redigida, fail-closed)
- Boot offline (DB inalcançável) → `GET /health` HTTP 200 `{"status":"degraded","db":"degraded","version":"0.1.0-fase1","migrationsApplied":0}`; `x-request-id` gerado (UUID) ou ecoado; id de 200 chars substituído; corpo com 0 palavras `password/DATABASE_URL/secret/token`; log de boot com 0 segredos
- `git status --porcelain` + `git add -A -n`: `.env.dev` nunca aparece (ignorado); só `.env.example` rastreado

## Pendente de user_setup (máquina com tailnet + VPS)

**Verde aqui ≠ fim da história:** `db:migrate` aplicado e `/health` com `db: ok` só podem ser observados onde o PG DEV é alcançável. Na máquina com acesso tailnet:

```bash
# 1. Subir o PG DEV e criar as roles (ver packages/config/README.md)
export PG_DEV_PASSWORD='<senha-forte-do-postgres>'
docker compose -f compose.dev.yml up -d postgres-dev
# ... criar roles uhhu_migrate / uhhu_app conforme o README ...

# 2. Preencher .env.dev (chmod 600, nunca commitar) e aplicar a migration
cp .env.example .env.dev && chmod 600 .env.dev
# editar HOST (IP tailnet) + senhas reais em .env.dev
set -a; source .env.dev; set +a
pnpm --filter @uhhu/db db:migrate   # esperado: exit 0

# 3. Subir a API e conferir o /health verde
pnpm --filter @uhhu/core-api start &
sleep 4
curl -s http://127.0.0.1:3000/health
# esperado: {"status":"ok","db":"ok","version":"0.1.0-fase1","migrationsApplied":1}
```

## Known Stubs

Nenhum stub acidental. Placeholders `*_PLACEHOLDER` de `db`/`config`/`core-api` foram substituídos por implementação real; o de `contracts` permanece por decisão documentada (tipos após validação do contrato, D-08). Placeholders `CHANGE_ME`/`HOST` em `.env.example`/`.env.dev` são intencionais e rastreados como `user_setup` acima. Nenhum `TODO`/`FIXME` em código.

## Threat Flags

Nenhuma superfície nova além do `<threat_model>` do plano. Cobertura das mitigações:

| Threat | Status |
| ------ | ------ |
| T-02-01 (segredo em compose/.env) | mitigado: só var `${:?required}`, `.env.dev` ignorado (verificado) |
| T-02-02 (bind de porta) | mitigado: `127.0.0.1:55432`, sem 0.0.0.0/80/443 no compose |
| T-02-03 (roles) | mitigado no código: migrate só `MIGRATION_*`, boot só `APP_*`; teste negativo de DDL fica para 01-03 |
| T-02-04 (/health pública) | mitigado: corpo fixo 4 campos, redact no logger, corpo sem segredos (verificado) |
| T-02-05 (random) | mitigado: `crypto.randomUUID` + allowlist; zero `Math.random` |
| T-02-06 (SQL injection) | mitigado: só Drizzle parametrizado, SQL estático sem interpolação, nenhum SQL fora de `@uhhu/db` |

## Auditoria adversarial (resumo)

Arquivo a arquivo sobre tudo que o plano criou/alterou: sem autorização decorativa (sem IDs/autenticados ainda — fora de escopo desta fase), sem IDOR aplicável, sem confiança no navegador, sem segredo em código/Git/logs/respostas (verificado por grep + inspeção dos logs de boot/migrate), input hostil tratado (Zod no env, allowlist no request-id, queries sem interpolação), sem `eval`/`Math.random`, erros sem stack/SQL/senha. Achados (request-id, redação do migrate) corrigidos no commit `5ea2b38` e re-testados. Revisão humana pendente no aceite do plano.

## Next Phase Readiness

- Pronto para `01-03` (CI fail-closed + suite smoke/integração PG): gates locais verdes como base; teste de integração tem alvo claro (`db:migrate` + `/health` contra PG de serviço); lição do process group (`setsid`) registrada para o servidor de teste no CI
- Bloqueio conhecido: `migrationsApplied: 1` + `db: ok` observáveis só após `user_setup` na máquina tailnet (comandos acima)

---
*Phase: 01-fundacao-executavel*
*Completed: 2026-09-09*

## Self-Check: PASSED

- `compose.dev.yml`, `.env.example`, `packages/config/src/env.ts`, `packages/db/src/{schema,client,migrate}.ts`, `packages/db/drizzle.config.ts`, `packages/db/drizzle/0000_infra_proof.sql`, `apps/core-api/src/health.ts` existem
- Commits `8e91e8a`, `5a12a08`, `8858484`, `5ea2b38` presentes no histórico (`git log`)
- `.env.dev` existe local e NÃO aparece em `git status --porcelain` como rastreado
- Gates re-executados após o fix de auditoria: `typecheck`/`lint`/`format` exit 0
