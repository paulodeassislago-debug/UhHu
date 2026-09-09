---
phase: 01-fundacao-executavel
plan: '03'
subsystem: infra
tags: [github-actions, gitleaks, opengrep, pnpm-audit, vitest, postgres-integration, least-privilege, fail-closed]

# Dependency graph
requires:
  - phase: 01-01
    provides: [Monorepo pnpm instalável, gates locais typecheck/lint/format/test]
  - phase: 01-02
    provides: [PG DEV + env Zod APP/MIGRATION, Drizzle dono total, GET /health 4 campos]
provides:
  - Pipeline `gates` com 6 jobs fail-closed (Gitleaks tree+histórico, SAST OpenGrep, audit high, integração PG)
  - Suite mínima verde: smoke (degraded sem banco) + integração PG com skip gracioso offline + menor privilégio (42501)
  - Estado pronto para o checkpoint humano de validação do contrato (task 3, PENDENTE)
affects: ['Phase 2 (platform auth sobre gates verdes)', 'CI de todos os planos seguintes']

# Tech tracking
tech-stack:
  added: [gitleaks-action v2, opengrep via docker, postgres:16-alpine service, tsx no root, fastify no root]
  patterns: ['CI fail-closed sem excecao silenciosa (aceite so via .planning/aceites-seguranca.md)', 'vitest workspace smoke+integration com skip gracioso offline', 'env dummy condicional que nunca sobrescreve valor real', 'SQL so via @uhhu/db (re-export do tag sql)']

key-files:
  created: [.github/workflows/gates.yml, .gitleaks.toml, .planning/aceites-seguranca.md, vitest.workspace.ts, tsconfig.json, tests/smoke/boot.test.ts, tests/integration/health-pg.test.ts, tests/integration/least-privilege.test.ts]
  modified: [package.json, pnpm-lock.yaml, packages/db/src/index.ts, packages/db/src/migrate.ts]

key-decisions:
  - 'Env dummy condicional no vitest workspace (nunca sobrescreve APP/MIGRATION real do CI/tailnet)'
  - 'Tag `sql` re-exportado por @uhhu/db em vez de dependencia direta (D-10 + identidade unica de tipos no pnpm)'
  - 'Skip de integracao so em sinais definitivos de offline (sem termo generico "connect" — fail-closed)'
  - 'migrate loga cadeia de causas com redacao total (diagnostico sem vazar senha)'
  - 'FOUND-03 segue ABERTO: exige CI verde no push + aprovacao humana do contrato (task 3)'

patterns-established:
  - 'Todo job do gates.yml e fail-closed; excecao so com aceite datado em .planning/aceites-seguranca.md'
  - 'Testes de integracao leem process.env cru (nunca @uhhu/config, que lanca no import) e pulam sem falhar offline'
  - 'Erros Drizzle: percorrer a cadeia `cause` (ECONNREFUSED vive la, nao na mensagem externa)'

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-09-09
---

# Phase 1 Plan 3: CI fail-closed + suite smoke/integração — Summary (PARCIAL: checkpoint pendente)

**Pipeline `gates` com 6 jobs fail-closed (Gitleaks tree+histórico, OpenGrep, audit high, integração contra postgres:16-alpine) e suite vitest smoke+integração verde local com skip gracioso offline; validação humana do contrato (task 3) PENDENTE.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-09T14:40:58Z
- **Completed:** 2026-09-09T14:51:10Z
- **Tasks:** 2 of 3 auto (task 3 é checkpoint humano bloqueante — NÃO executada)
- **Files modified:** 12 (8 criados + 4 alterados)

## Accomplishments

- `.github/workflows/gates.yml` com 6 jobs fail-closed: `gates` (install frozen + typecheck + lint + format + test), `secrets-tree`, `secrets-history` (fetch-depth 0), `sast` (OpenGrep via docker sobre apps/+packages/), `audit` (`pnpm audit --audit-level high`), `integration-pg` (service postgres:16-alpine + migrate + curl /health + test:integration)
- `.gitleaks.toml` com `[extend] useDefault = true`; `.planning/aceites-seguranca.md` com "Nenhum aceite vigente" como única via de exceção (D-13)
- `tests/smoke/boot.test.ts`: /health `degraded` sem banco (porta fechada), 4 chaves exatas, nunca 500, sem segredos, x-request-id ecoado/substituído
- `tests/integration/health-pg.test.ts`: aplica `db:migrate` real, sobe Fastify em porta efêmera, prova `db: ok` + `migrationsApplied >= 1` + corpo sem segredos; pula com graça offline
- `tests/integration/least-privilege.test.ts`: prova viva de D-07 — APP sem DDL (42501/permission denied), MIGRATION com SELECT 1 ok; pula com graça offline
- Gates locais verdes: `pnpm typecheck` (raiz + 4 workspaces), `pnpm lint`, `pnpm format`, `pnpm test` (3 arquivos, 5 testes), `pnpm test:integration` (2 arquivos, 3 testes)

## Task Commits

Each task was committed atomically:

1. **task 1: pipeline de gates com falha dura** — `4e1b9a8` (feat)
2. **task 2: suite minima smoke + integracao PG + menor privilegio** — `7d68fd2` (feat)
3. **task 3: checkpoint validacao do contrato com Paulo** — NÃO executada (bloqueante, aguarda humano)

**Plan metadata:** (este SUMMARY + STATE/ROADMAP/REQUIREMENTS, commit `docs(01-03)` a seguir)

## Files Created/Modified

- `.github/workflows/gates.yml` — 6 jobs fail-closed, `on: [push, pull_request]`, zero `continue-on-error`/`allow-failure`, service postgres com healthcheck
- `.gitleaks.toml` — `title` + `[extend] useDefault = true` + `[stage]` sem allowlists reais
- `.planning/aceites-seguranca.md` — "Nenhum aceite vigente" + tabela de aceite datado (prazo + responsável)
- `vitest.workspace.ts` — projetos `smoke` (5s) + `integration` (15s) com env dummy condicional
- `tsconfig.json` — raiz cobre `vitest.workspace.ts` + `tests/**` sob strict; `typecheck` da raiz roda antes dos workspaces
- `tests/smoke/boot.test.ts` — 2 testes, type guard `isHealthResponse`, assert sem-segredos, `import type`, zero `any`/`Math.random`
- `tests/integration/health-pg.test.ts` — migrate via CLI do pacote, listen em porta 0, fetch com timeout 4s, skip em ECONNREFUSED & cia
- `tests/integration/least-privilege.test.ts` — `sql` via `@uhhu/db`, `messageOf` percorrendo `cause`, skip só em offline definitivo
- `package.json` — devDeps `tsx`, `fastify`, `@uhhu/db` (workspace) no root; scripts `test:integration` + `typecheck` com tsc da raiz
- `pnpm-lock.yaml` — lockfile atualizado
- `packages/db/src/index.ts` — re-export do tag `sql` (dono total D-10)
- `packages/db/src/migrate.ts` — `messageChain` (cadeia de causas) com redação total preservada
- `packages/db/package.json`, `apps/core-api/package.json` (listados no plano) — nenhuma mudança necessária

## Decisions Made

- Env dummy condicional em vez de `.env` para testes: URLs fictícias em porta fechada só quando o ambiente não definiu as reais — CI/tailnet nunca sobrescritos, imports de `@uhhu/config` (fail-closed no import) continuam válidos
- `sql` via `@uhhu/db` (não `drizzle-orm` direto na raiz): respeita D-10 e elimina identidade dupla de tipos do pnpm
- Skip só em `ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE`: queda de conexão no meio do teste contra PG real continua falha (fail-closed), nunca skip silencioso
- `requirements-completed: []`: FOUND-03 exige push com CI verde + aprovação humana — nenhum dos dois aconteceu ainda

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Root precisou de `@uhhu/db` + `fastify` além de vitest/tsx**

- **Found during:** task 2 (primeiro `pnpm test`: `Cannot find module '@uhhu/db'`/`fastify` a partir de `tests/`)
- **Issue:** a raiz não tinha links dos workspaces; testes em `tests/` não resolvem bare imports sem dep declarada (pnpm isolado)
- **Fix:** `pnpm add -w -D @uhhu/db@workspace:* fastify@^5.12.3` (mesmas versões dos workspaces, sem duplicar store)
- **Files modified:** `package.json`, `pnpm-lock.yaml`
- **Verification:** imports resolvem; `pnpm test` coleta os 3 arquivos
- **Committed in:** `7d68fd2` (task 2)

**2. [Rule 3 - Blocking] `tsconfig.json` na raiz + `typecheck` cobrindo `tests/`**

- **Found during:** task 2 (nenhum `tsc -p` cobria `tests/**` nem `vitest.workspace.ts`)
- **Issue:** sem isso, erro de tipo nos testes passaria batido pelo gate `typecheck` (vitest transpila sem checar)
- **Fix:** `tsconfig.json` (extends base, `include` workspace + tests) e script `typecheck` = `tsc -p tsconfig.json && pnpm -r ...`
- **Files modified:** `tsconfig.json` (novo), `package.json`
- **Verification:** `pnpm typecheck` verde (raiz + 4 workspaces); erro real detectado no caminho (ver desvio 4)
- **Committed in:** `7d68fd2` (task 2)

**3. [Rule 3 - Blocking] Env dummy condicional no vitest workspace**

- **Found during:** task 2 (`ZodError` no import: `@uhhu/config` valida no import e o smoke roda sem env)
- **Issue:** sem URLs o próprio `import { createDb }` lançava; `describe.skipIf` nunca era alcançado — skip gracioso impossível
- **Fix:** `env: fallback` por projeto (dummy `postgresql://offline:offline@127.0.0.1:59999/offline` + `NODE_ENV=development` para o `test` do vitest), só quando o ambiente não definiu os reais
- **Files modified:** `vitest.workspace.ts`
- **Verification:** smoke verde offline; integração exercita o skip com warn explícito; com env real, fallback retorna `{}` (sem override)
- **Committed in:** `7d68fd2` (task 2)

**4. [Rule 3 - Blocking] `sql` re-exportado por `@uhhu/db` (TS2345 identidade dupla)**

- **Found during:** task 2 (`pnpm typecheck`: `SQL<unknown>` não atribuível a `SQLWrapper` — duas cópias de tipos do drizzle-orm)
- **Issue:** `drizzle-orm` como dep direta da raiz criava segunda identidade de tipos vs a cópia de `packages/db` (peer `postgres` distinto no store)
- **Fix:** removido `drizzle-orm` da raiz; `export { sql } from 'drizzle-orm'` em `packages/db/src/index.ts` (dono total D-10); teste importa `sql` de `@uhhu/db`
- **Files modified:** `packages/db/src/index.ts`, `tests/integration/least-privilege.test.ts`, `package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm typecheck` exit 0
- **Committed in:** `7d68fd2` (task 2)

**5. [Rule 1 - Bug] `migrate.ts` engolia a causa raiz do erro**

- **Found during:** task 2 (falha offline logava só `Failed query: ...` sem o `ECONNREFUSED`, que vive no `cause`)
- **Issue:** sem a causa, operador não distingue rede de SQL — e o skip gracioso da integração não tinha sinal confiável
- **Fix:** `messageChain` percorre `cause` (com guarda anti-ciclo) e a redação total continua aplicada à string inteira
- **Files modified:** `packages/db/src/migrate.ts`
- **Verification:** `db:migrate` offline mostra `... <- connect ECONNREFUSED 127.0.0.1:59999` com senha `***`; `grep s3cr3t` vazio; skip da integração dispara no sinal real
- **Committed in:** `7d68fd2` (task 2)

**6. [Rule 2 - Missing Critical] `isConnectionFailure` sem o termo genérico `connect`**

- **Found during:** auditoria pós-task-2 (AGENTS.md) dos caminhos de skip
- **Issue:** `connect` casaria "connection terminated/closed" no meio do teste contra PG real — falha verdadeira viraria skip silencioso (CI verde vazio)
- **Fix:** regex restrita a `ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE` nos dois arquivos de integração
- **Files modified:** `tests/integration/health-pg.test.ts`, `tests/integration/least-privilege.test.ts`
- **Verification:** skips offline continuam disparando (sinal ECONNREFUSED confirmado no stderr); `pnpm test` verde
- **Committed in:** `7d68fd2` (task 2)

---

**Total deviations:** 6 auto-fixed (4 blocking, 1 bug, 1 missing-critical/security)
**Impact on plan:** todos necessários para gates verdes sem enfraquecer fail-closed; nenhum amplia escopo de produto (zero tabelas de domínio, zero endpoints além de `/health`).

## Issues Encountered

- `pnpm dlx js-yaml` exige sintaxe `pnpm dlx <pkg>` (sem `--yes`): validado YAML do workflow via js-yaml + node (6 jobs, `on: [push, pull_request]`, service postgres)
- `describe.skipIf` + `beforeAll` que relança: falha no `beforeAll` marca o teste como skipped com suite falha — comportamento usado como diagnóstico, não como skip (o skip real é via `return` com warn)

## Gate Evidence (verificado aqui — sem PG, sem gitleaks/opengrep locais)

Executado na raiz em 2026-09-09 (node v22.17.0, pnpm 9.15.0, vitest 3.2.7):

- `pnpm typecheck` → exit 0 (tsc raiz + 4 workspaces)
- `pnpm lint` → exit 0 · `pnpm format` → exit 0
- `pnpm test` → 3 arquivos, 5 testes passed (smoke 2 asserts reais + integração 3 skips graciosos com warn)
- `pnpm test:integration` → 2 arquivos, 3 testes passed (skips graciosos)
- `gates.yml`: `gitleaks` 4x, `opengrep` 1x, `pnpm audit --audit-level high` 1x, `services:` + `postgres` presentes; `continue-on-error: true` e `allow-failure` ausentes (grep 0); YAML válido com 6 jobs
- `.gitleaks.toml` contém `useDefault`; gitleaks binário ausente aqui — CI executa (documentado no plano)
- `grep -rn ": any\|as any" tests/ vitest.workspace.ts` → vazio; `Math.random` → vazio; `eval|new Function` → vazio
- `db:migrate` offline com senha fake → `***`, `grep s3cr3t` vazio (redação + cadeia de causas verificadas)

## Pendente (task 3 — checkpoint humano bloqueante, NÃO executado)

Ver `## CHECKPOINT` na mensagem de retorno ao orquestrador: VPS/tailnet migrate+curl, `pnpm` gates, validação do contrato por seções com Paulo (`approved: <seções>`), branch protection exigindo `gates`, e confirmação de nenhum segredo no histórico.

## Known Stubs

Nenhum stub acidental. Skips de integração offline são comportamento intencional (fail-open só na ausência de PG; CI com service exerce o caminho real). Nenhum `TODO`/`FIXME` em código novo.

## Threat Flags

Nenhuma superfície nova além do `<threat_model>` do plano. Cobertura:

| Threat | Status |
| ------ | ------ |
| T-03-01 (segredos tree+histórico) | mitigado: Gitleaks nos dois modos com fetch-depth 0; `.env*` ignorado; teste de corpo do /health sem segredos; credenciais do workflow e do workspace são fictícias/test-only (`uhhu_test`, `offline`) |
| T-03-02 (SAST) | mitigado: OpenGrep auto sobre apps/+packages/ no CI (binário ausente local; CI executa) |
| T-03-03 (supply chain) | mitigado: `pnpm audit --audit-level high` + `--frozen-lockfile` no CI |
| T-03-04 (bypass do CI) | PENDENTE do humano: branch protection exigindo `gates` (item do checkpoint) |
| T-03-05 (vazamento em logs) | mitigado: redação total + cadeia de causas verificada sem senha; testes nunca imprimem URL (só warns estáticos) |
| T-03-06 (negação de aceite) | mitigado: `.planning/aceites-seguranca.md` versionado com "Nenhum aceite vigente" |

## Auditoria adversarial (resumo)

Arquivo a arquivo sobre tudo que o plano criou/alterou: sem autorização/IDOR aplicável (sem IDs/autenticados ainda — fora de escopo desta fase), sem confiança no navegador, sem segredo real em código/Git/logs/respostas (dummy/test-only documentados; redação verificada com senha fake), inputs de teste estáticos (URLs de teste, tabela `least_privilege_probe` constante via `sql.raw` sem input de usuário), sem `eval`/`Math.random`, erros sem stack/senha (mensagens curtas, nunca a URL). Achado (regex `connect` ampla mascarando falha real como skip) corrigido antes do commit. Revisão humana pendente no checkpoint.

## Next Phase Readiness

- Pronto para o checkpoint (task 3): tudo que era automatizável está feito e verde; falta `user_setup` tailnet + validação do contrato com Paulo + branch protection
- CI do GitHub ainda não executado (sem push até o aceite do checkpoint) — primeiro push vai estrear `gates.yml` com os 6 jobs
- Bloqueio conhecido: `migrationsApplied: 1` + `db: ok` vivos e `test:integration` real observáveis só com PG (CI service ou tailnet)

---
*Phase: 01-fundacao-executavel*
*Completed: 2026-09-09 (tasks 1-2; task 3 checkpoint pendente)*

## Self-Check: PASSED

- `.github/workflows/gates.yml`, `.gitleaks.toml`, `.planning/aceites-seguranca.md`, `vitest.workspace.ts`, `tsconfig.json`, `tests/smoke/boot.test.ts`, `tests/integration/health-pg.test.ts`, `tests/integration/least-privilege.test.ts` existem
- Commits `4e1b9a8` e `7d68fd2` presentes no histórico (`git log`)
- Gates re-executados após o último ajuste: `typecheck`/`lint`/`format`/`test` exit 0
