---
phase: 01-fundacao-executavel
plan: '01'
subsystem: infra
tags: [pnpm, monorepo, typescript-strict, eslint, prettier, vitest, skeleton]

# Dependency graph
requires: []
provides:
  - Monorepo pnpm instalável com toolchain pinada (Node 22 + pnpm 9)
  - tsconfig.base.json strict herdado pelos 4 pacotes do esqueleto
  - Gates locais verdes (typecheck, lint, format, test) + ban de `any` provado fail-closed
  - Fronteiras visíveis: 4 pacotes compiláveis + 7 pastas só com README
affects: ['01-02 (PG+migrations+health)', '01-03 (CI+gates)', 'Phase 2 (platform)']

# Tech tracking
tech-stack:
  added: [typescript 5.9, eslint 9 + typescript-eslint 8, prettier 3, vitest 3, '@eslint/js', eslint-config-prettier]
  patterns: ['pnpm -r --if-present para scripts agregados', 'tsconfig base único com extends', 'eslint flat com no-explicit-any:error', '.prettierignore escopando gates ao monorepo']

key-files:
  created: [package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.mjs, .prettierrc.json, .prettierignore, .gitignore, .node-version, apps/core-api/package.json, apps/core-api/tsconfig.json, apps/core-api/src/index.ts, packages/contracts/package.json, packages/contracts/tsconfig.json, packages/contracts/src/index.ts, packages/db/package.json, packages/db/tsconfig.json, packages/db/src/index.ts, packages/config/package.json, packages/config/tsconfig.json, packages/config/src/index.ts]
  modified: []

key-decisions:
  - 'Gates lint/format escopados ao monorepo via ignores (legado planner-docente/supabase-legacy-export e docs fora do gate)'
  - 'tsconfig.base sem outDir/rootDir (caminhos relativos resolvem a partir da base e quebravam o typecheck dos pacotes)'
  - 'Placeholders sem imports entre workspaces (dist ainda não existe; import real entra no plano 01-02 com o client Drizzle)'
  - 'pnpm-lock.yaml commitado (reprodutibilidade, reforça T-01-02)'

patterns-established:
  - 'Scripts de raiz agregam workspaces: pnpm -r --if-present run typecheck'
  - 'Cada pacote expõe typecheck: tsc --noEmit -p tsconfig.json'
  - 'Fronteira futura = pasta + README de 3-10 linhas, zero código'

requirements-completed: [FOUND-02]

# Metrics
duration: ~10min
completed: 2026-09-09
---

# Phase 1 Plan 1: Esqueleto monorepo pnpm + TS strict Summary

**Monorepo pnpm instalável com toolchain pinada Node 22 + pnpm 9, 4 pacotes-esqueleto compilando sob TS strict com ban de `any` fail-closed e 7 fronteiras declaradas só com README.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-09T14:14:00Z
- **Completed:** 2026-09-09T14:22:43Z
- **Tasks:** 3
- **Files modified:** 30 (29 criados + 1 lockfile; task 3 sem alteração de arquivo)

## Accomplishments

- Raiz do monorepo instalável: `pnpm install` verde, engines Node `22.x` + pnpm `9.x` pinados
- `pnpm typecheck`, `pnpm lint`, `pnpm format` e `pnpm test` verdes sobre o esqueleto
- 4 pacotes compiláveis (`apps/core-api`, `packages/{contracts,db,config}`) sob `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- 7 pastas de fronteira (`apps/{lab,core-worker,cli,mcp}`, `packages/{core,modules,integrations}`) só com README, zero código de produto
- Ban de `any` provado na prática: scratch com `any` quebra o lint com `no-explicit-any`, removido em seguida

## Task Commits

Each task was committed atomically:

1. **task 1: raiz do monorepo com toolchain fixada** — `ba29887` (feat)
2. **task 2: esqueletos compiláveis + READMEs de fronteira** — `7913aee` (feat)
3. **task 3: prova de gates locais no esqueleto** — sem commit (tarefa só de verificação; nenhum arquivo do plano precisou mudar)

**Plan metadata:** (este SUMMARY + STATE/ROADMAP/REQUIREMENTS, commit `docs(01-01)` a seguir)

## Files Created/Modified

- `package.json` — raiz privada pnpm 9.15.0, engines Node 22/pnpm 9, scripts typecheck/lint/format/test
- `pnpm-workspace.yaml` — workspaces `apps/*` e `packages/*`
- `tsconfig.base.json` — `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, `NodeNext`, `ES2022`, `declaration` + `sourceMap`
- `eslint.config.mjs` — flat config typescript-eslint recomendado + `no-explicit-any: error`
- `.prettierrc.json` — singleQuote, trailingComma all, printWidth 100
- `.prettierignore` — escopa `prettier --check .` ao monorepo (desvio documentado abaixo)
- `.gitignore` — `node_modules/`, `dist/`, `.env*` com exceção `!.env.example`, `coverage/`, `*.tsbuildinfo`
- `.node-version` — `22`
- `pnpm-lock.yaml` — lockfile commitado para installs reproduzíveis
- `apps/core-api/{package.json,tsconfig.json,src/index.ts}` — `@uhhu/core-api`, depende de contracts/db/config via `workspace:*`, placeholder `CORE_API_PLACEHOLDER`
- `packages/{contracts,db,config}/{package.json,tsconfig.json,src/index.ts}` — placeholders `*_PLACEHOLDER = 'fase-1-esqueleto'`
- `apps/{lab,core-worker,cli,mcp}/README.md` + `packages/{core,modules,integrations}/README.md` — fronteiras sem código

## Decisions Made

- Gates escopados ao monorepo via ignores em vez de tocar o legado (ver desvio 1)
- `outDir`/`rootDir` fora da base (ver desvio 2)
- Placeholders sem imports cross-workspace até existir `dist` (ver desvio 3)
- Lockfile commitado como parte da task 1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Gates quebravam por arquivos fora do monorepo**

- **Found during:** task 1 (primeiro `pnpm lint` / `pnpm format`)
- **Issue:** `eslint .` acusava 22 erros em `planner-docente/` (legado untracked, material de pesquisa) e `prettier --check .` acusava 169 arquivos (legado + `docs/` + `dev-docs/` + `.planning/` + `AGENTS.md`), todos intencionalmente fora do escopo e sem formatação Prettier
- **Fix:** ignores para `planner-docente/**`, `supabase-legacy-export/**`, `docs/**`, `dev-docs/**` no `eslint.config.mjs`; novo `.prettierignore` com os mesmos + `.planning/`, `AGENTS.md`, `init-prompt.md` e gerados. Scripts do plano mantidos exatamente como especificados (`eslint .`, `prettier --check .`)
- **Files modified:** `eslint.config.mjs`, `.prettierignore` (novo)
- **Verification:** `pnpm lint` exit 0, `pnpm format` exit 0
- **Committed in:** `ba29887` (task 1)

**2. [Rule 1 - Bug] `rootDir`/`outDir` na base quebravam o typecheck dos pacotes**

- **Found during:** task 2 (primeiro `pnpm typecheck` com os 4 pacotes)
- **Issue:** `rootDir: 'src'` no `tsconfig.base.json` resolve relativo ao arquivo da base (`/src` da raiz), então cada pacote falhava com `TS6059: File ... is not under 'rootDir'`
- **Fix:** removidos `outDir`/`rootDir` da base (são detalhes de emissão, não de rigor de tipos; nenhum requisito do plano os exigia). Cada pacote continua herdando todo o rigor via `extends`
- **Files modified:** `tsconfig.base.json`
- **Verification:** `pnpm typecheck` exit 0 nos 4 pacotes
- **Committed in:** `7913aee` (task 2)

**3. [Rule 3 - Blocking] Placeholders sem imports entre workspaces**

- **Found during:** task 2 (desenho dos placeholders)
- **Issue:** um `import type` de `@uhhu/contracts` no `core-api` falharia no `tsc --noEmit`, porque `types: ./dist/index.d.ts` ainda não existe (nenhum build nesta fase). Alternativas (apontar `types` para `src/`, mapear `paths`) desviariam do contrato de `package.json`/`tsconfig` do plano
- **Fix:** placeholders autocontidos, sem imports; a cláusula do plano ("`import type` onde houver import de tipo") fica vacuamente satisfeita — não há imports. Imports reais entram no plano 01-02 com o client Drizzle
- **Files modified:** `apps/core-api/src/index.ts` (desenho)
- **Verification:** `pnpm typecheck` exit 0
- **Committed in:** `7913aee` (task 2)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** todos essenciais para os gates verdes; nenhum amplia escopo de produto (zero tabelas, zero endpoints, zero segredos — mantido).

## Issues Encountered

- Nenhum issue fora dos desvios acima. `pnpm install` resolveu 207 pacotes sem conflito; `vitest run --passWithNoTests` reporta "No test files found" com exit 0, como previsto no plano.

## Gate Evidence (task 3)

Executado na raiz em 2026-09-09 (vitest 3.2.7, eslint 9.39.5, typescript 5.9.3):

- `pnpm typecheck` → exit 0 (4 de 5 projetos; raiz sem script próprio, `--if-present`)
- `pnpm lint` → exit 0
- `pnpm format` (`prettier --check .`) → exit 0 ("All matched files use Prettier code style!")
- `pnpm test` (`vitest run --passWithNoTests`) → exit 0 ("No test files found")
- Fail-closed: `packages/contracts/scratch-any-check.ts` com `export const scratchAnyCheck: any = 1;` → `pnpm exec eslint` exit 1 com `1:31 error Unexpected any @typescript-eslint/no-explicit-any`; arquivo removido em seguida
- `grep -rn ":\s*any\|as any" apps packages --include='*.ts'` → vazio
- `.ts` existentes: só `apps/core-api/src/index.ts`, `packages/{contracts,db,config}/src/index.ts` (4 arquivos)
- `apps/core-api/src/index.ts`: 7 linhas (mínimo 5); `packages/contracts/src/index.ts`: 5 linhas (mínimo 3)

## Known Stubs

Nenhum stub acidental. Os 4 `*_PLACEHOLDER = 'fase-1-esqueleto'` são placeholders mandatórios do plano (D-01/D-10), não dívidas: `db` ganha o Drizzle no plano 01-02, `config` ganha o env Zod no plano 01-02, `core-api` ganha o boot Fastify e `contracts` ganha os tipos após a validação do contrato. Nenhum `TODO`/`FIXME`/`placeholder` em código.

## Next Phase Readiness

- Pronto para `01-02` (PG DEV + envs + Drizzle + `GET /health`): pacotes `db` e `config` existem como donos designados, `core-api` já declara as dependências `workspace:*`
- CI do plano `01-03` pode assumir `pnpm install && pnpm typecheck && pnpm lint && pnpm format && pnpm test` verdes como base

---
*Phase: 01-fundacao-executavel*
*Completed: 2026-09-09*

## Self-Check: PASSED

- `apps/core-api/src/index.ts`, `packages/{contracts,db,config}/src/index.ts` existem com os placeholders
- Commits `ba29887` e `7913aee` presentes no histórico (`git log`)
- Gates re-executados após a limpeza do scratch: `typecheck`/`lint`/`format`/`test` exit 0
