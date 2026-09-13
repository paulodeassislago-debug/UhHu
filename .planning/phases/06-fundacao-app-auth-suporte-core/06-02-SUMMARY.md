---
phase: 06-fundacao-app-auth-suporte-core
plan: "02"
subsystem: ui
tags: [expo, expo-router, react-native, typescript-strict, zod, contracts, api-client]

# Dependency graph
requires:
  - phase: 05-plataforma-contrato-canais
    provides: [capabilities execute() fail-closed, requireAuth cookie+PAT, lab searches/runs/results, projects CRUD owner-scoped]
  - phase: 06-fundacao-app-auth-suporte-core
    provides: [06-01 referenceSearchId + isNew + CORS allowlist (contrato que a UI consome)]
provides:
  - Scaffold Expo SDK 57 em apps/lab (web export ok + Expo Go via tailnet, sem EAS)
  - 7 rotas placeholder navegáveis (index/login/register/projects/project-[id]/strategies/corpus)
  - Client tipado do CORE em definição única (apiFetch + auth/projects/lab via import type, zero any)
affects: [06-03, 06-04, 07-comparacao-referencia, 08-resultados-badge-novo, 09-corpus-export-web-beta]

# Tech tracking
tech-stack:
  added: [expo 57.0.22, expo-router 57.0.21, react 19.2.3, react-dom 19.2.3, react-native 0.86.3, react-native-web 0.21.2, expo-secure-store 57.0.4, expo-device 57.0.2, expo-status-bar 57.0.1, expo-constants 57.0.18, expo-linking 57.0.10, react-native-screens 4.26.0, react-native-safe-area-context 5.7.0, zod ^4.5.4 (instalado 4.5.4, mesma major do contracts)]
  patterns: [fetch wrapper único com TokenProvider injetado (web cookie / nativo Bearer), Zod na fronteira para bodies de saída, envelope PT-BR verbatim em ApiError, typedRoutes com Stack]

key-files:
  created: [apps/lab/package.json, apps/lab/tsconfig.json, apps/lab/app.json, apps/lab/babel.config.js, apps/lab/metro.config.js, apps/lab/.npmrc, apps/lab/app/_layout.tsx, apps/lab/app/index.tsx, apps/lab/app/login.tsx, apps/lab/app/register.tsx, apps/lab/app/projects.tsx, apps/lab/app/project/[id].tsx, apps/lab/app/project/[id]/strategies.tsx, apps/lab/app/project/[id]/corpus.tsx, apps/lab/src/api/client.ts, apps/lab/src/api/auth.ts, apps/lab/src/api/projects.ts, apps/lab/src/api/lab.ts]
  modified: [apps/lab/README.md, .gitignore, pnpm-lock.yaml]

key-decisions:
  - "Montagem manual do scaffold (não create-expo-app template): controle total de pnpm workspace + TS strict + contracts workspace"
  - "Pins SDK 57 do template blank/tabs (react 19.2.3 + RN 0.86.3), não latest (19.3.0/0.87.1 quebra export rn-get-polyfills)"
  - "Abas como rotas aninhadas project/[id]/strategies + corpus coexistindo com project/[id].tsx (file vs dir distintos, export ok)"
  - "Client sem importar SecureStore direto (injetado via getToken) para manter web testável; PAT nunca logado"

patterns-established:
  - "apiFetch<T> com credentials include sempre + Bearer injetado + x-request-id via crypto.randomUUID + envelope verbatim"
  - "Bodies via schema.parse (login/register/PAT/create/update/search) — nunca objeto à mão sem parse"
  - "IDs via encodeURIComponent; 401 em me() vira null sem lançar; 204 vira void; export via raw text verbatim"

requirements-completed: [UI-01, UI-02]

# Metrics
duration: 18min
completed: 2026-09-11
---

# Phase 6 Plan 02: Scaffold Expo + client tipado Summary

**Scaffold Expo SDK 57 com 7 rotas placeholder navegáveis (web export 1.1MB + Expo Go via tailnet, sem EAS) e client tipado do CORE em definição única (cookie web + Bearer nativo injetado, erros PT-BR verbatim, zero any).**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-11T18:46:24Z
- **Completed:** 2026-09-11T19:04:52Z
- **Tasks:** 2
- **Files modified:** 21 (17 scaffold + 4 client)

## Accomplishments

- UI-01: app Expo abre na web (`expo export --platform web` → `apps/lab/dist/` com `index.html` + bundle 1.1MB, exit 0) e no Expo Go via tailnet (instruções no README, sem EAS/conta/assinatura per D-05; Android primeiro D-06); navegação real entre 7 placeholders via Stack + typedRoutes, sem erro de build
- UI-02: `src/api/client.ts` (`apiFetch` + `ApiError` + `getApiBaseUrl` de `EXPO_PUBLIC_API_BASE_URL` com fallback dev `http://127.0.0.1:3000`) + `auth.ts` (login/register/me-401→null/logout/issuePat) + `projects.ts` (list/listById/create/update com referenceSearchId) + `lab.ts` (searches/runs/jobs/results/corpus/export/sources/compare finos, sem lógica local); todos os tipos via `import type` de `@uhhu/contracts` (8 imports, 9 `import type`), zero interface de domínio local, zero `any`, zero armazenamento de navegador para privilégio, zero postgres/drizzle/externo
- TS strict verde (`tsc --noEmit` exit 0, `extends: ../../tsconfig.base.json`, sem `strict:false`), eslint verde (root `no-explicit-any` sem exceção para apps/lab), bundle sem segredos (só base URL pública; PAT/cookie nunca no bundle/log)

## task Commits

Each task was committed atomically:

1. **task 1: scaffold Expo em apps/lab com navegação do esqueleto** - `bef85d9` (feat)
2. **task 2: client tipado do CORE em definição única** - `aad160f` (feat)

**Plan metadata:** (docs: complete plan — próximo commit final)

## Files Created/Modified

- `apps/lab/package.json` - `@uhhu/lab` com `expo-router/entry`, scripts typecheck/lint/test/start/web, deps SDK 57 pinadas + `@uhhu/contracts workspace:*`
- `apps/lab/tsconfig.json` - `extends: ../../tsconfig.base.json` + overrides bundler (`module ESNext`, `moduleResolution bundler`, `jsx react-native`, `lib DOM`), `strict:true`, includes `app/**` + `src/**`
- `apps/lab/app.json` - `UhHu Lab` (`slug/scheme uhhu-lab`, `platforms ios/android/web`, `typedRoutes:true`, plugin `expo-router`)
- `apps/lab/babel.config.js` - `babel-preset-expo` (CommonJS exigido pelo Metro + eslint-disable node)
- `apps/lab/metro.config.js` - default do Expo (resolve symlinks workspace; sem custom além do default)
- `apps/lab/.npmrc` - `node-linker=hoisted` + `symlink=true` APENAS neste dir (não tocado raiz)
- `apps/lab/README.md` - fronteira substituída: como rodar web, Expo Go via tailnet, `EXPO_PUBLIC_API_BASE_URL`, mapa das 7 rotas
- `apps/lab/app/_layout.tsx` - Stack com 7 Screens (typedRoutes)
- `apps/lab/app/index.tsx` - `/` placeholder redirect (links /login, /projects)
- `apps/lab/app/login.tsx` - `/login` email+senha+entrar+convite (POST /api/v1/auth/login)
- `apps/lab/app/register.tsx` - `/register` token convite (POST /api/v1/auth/register)
- `apps/lab/app/projects.tsx` - `/projects` lista + CTA (GET /api/v1/projects; exemplo uuid linkado)
- `apps/lab/app/project/[id].tsx` - cabeçalho pergunta+status + abas (GET /api/v1/projects/:id; `useLocalSearchParams` tipado)
- `apps/lab/app/project/[id]/strategies.tsx` - aba Estratégias (GET /api/v1/lab/searches?projectId=)
- `apps/lab/app/project/[id]/corpus.tsx` - aba Corpus: 0 (GET /api/v1/lab/projects/:id/corpus)
- `apps/lab/src/api/client.ts` - `API_BASE_URL`/`getApiBaseUrl`, `TokenProvider`, `ApiError`, `apiFetch<T>` (credentials include, Bearer injetado, x-request-id, envelope verbatim, raw para export, `unknown`+narrowing)
- `apps/lab/src/api/auth.ts` - `authApi.login/register/me/logout/issuePat` (schemas parse, 401→null, raw UMA vez sem log)
- `apps/lab/src/api/projects.ts` - `projectsApi.list/listById/create/update` (schemas parse, referenceSearchId, paginação status/limit/cursor)
- `apps/lab/src/api/lab.ts` - `labApi` fino (searches CRUD, execute/listRuns/getRun/getJob/cancelJob, listResults/getResult, getCorpus, exportProject raw, listSources/getSourceHealth, compareSearches)
- `.gitignore` - adicionado `.expo/` (gerado, não commitar)
- `pnpm-lock.yaml` - 506+69 pacotes do scaffold (reprodutível)

## Decisions Made

- Montagem manual em vez de `npx create-expo-app --template blank-typescript`: template conflitaria com pnpm workspace + `tsconfig.base` strict + `workspace:*`; manual dá controle de pins, Metro e contratos. Documentado per plano (alternativa aceitável).
- Pins SDK 57 do template (`expo-template-blank-typescript@57.0.24` + `tabs@57.0.24`): react 19.2.3 + RN 0.86.3 (não latest 19.3.0/0.87.1); `react-native-web 0.21.2` satisfaz `~0.21.0`; adicionados `expo-constants 57.0.18`, `expo-linking 57.0.10`, `screens 4.26.0`, `safe-area 5.7.0` exigidos pelo router (não listados no plano, necessários para export).
- Abas como `project/[id]/strategies.tsx` + `corpus.tsx` coexistindo com `project/[id].tsx`: file `[id].tsx` vs dir `[id]/` são entradas distintas; export prova sem ambiguidade (sem `[id]/index.tsx` competindo). Top-level alternativo evitado para preservar escopo por projeto.
- Client injeta `getToken` em vez de importar SecureStore: web testável sem native module; 06-03 fornece SecureStore no nativo. `API_BASE_URL` const + `getApiBaseUrl()` por chamada (testes via `opts.baseUrl`).
- View model `AuthViewModel` não criado (sem necessidade): retornos são DTOs puros; mapeamento explícito só quando apresentação divergir (fases 7–9).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Latest react/RN quebram export (rn-get-polyfills) — pinados para SDK 57 + deps do router**
- **Found during:** task 1 (prova `expo export --platform web`: `ERR_PACKAGE_PATH_NOT_EXPORTED './rn-get-polyfills'` em RN 0.87.1)
- **Issue:** `npm view react/react-native version` dá latest (19.3.0/0.87.1); RN 0.87 remove wildcard `./*` do `exports`, mas `@expo/cli@57.0.24` ainda requer `rn-get-polyfills`; além disso faltavam peers do router (screens/safe-area/linking/constants)
- **Fix:** Pins do template SDK 57 (`blank@57.0.24`/`tabs@57.0.24`): react/react-dom 19.2.3, RN 0.86.3 (wildcard `./*` presente), + `expo-constants 57.0.18`, `expo-linking 57.0.10`, `screens 4.26.0`, `safe-area 5.7.0`; `react-native-web 0.21.2` mantido (satisfaz `~0.21.0`)
- **Files modified:** apps/lab/package.json, pnpm-lock.yaml
- **Verification:** `expo export --platform web` → `Exported: dist` (bundle 1.1MB + index.html); `tsc` exit 0
- **Committed in:** bef85d9 (parte do commit da task 1)

**2. [Rule 1 - Bug] exactOptionalPropertyTypes rejeita `body: undefined` no fetch**
- **Found during:** task 2 (`tsc` TS2769: `string|undefined` não atribuível a `BodyInit|null`)
- **Issue:** `RequestInit.body?: BodyInit|null` com `exactOptionalPropertyTypes:true` não aceita `undefined` explícito
- **Fix:** spread condicional `...(hasBody ? { body: JSON.stringify(...) } : {})` em vez de ternário com `undefined`
- **Files modified:** apps/lab/src/api/client.ts
- **Verification:** `tsc --noEmit` exit 0
- **Committed in:** aad160f (parte do commit da task 2)

**3. [Rule 1 - Bug] eslint no-undef em babel/metro CommonJS**
- **Found during:** task 1 (`eslint` 5 erros: `module`/`require`/`__dirname` + `no-require-imports`)
- **Issue:** configs JS exigem CommonJS do Metro; root eslint não tem env node para `.js`
- **Fix:** `/* eslint-disable no-undef */` no babel + `/* eslint-disable no-undef, @typescript-eslint/no-require-imports */` no metro (file-level, sem exceção em `eslint.config.mjs` raiz per plano)
- **Files modified:** apps/lab/babel.config.js, apps/lab/metro.config.js
- **Verification:** `eslint apps/lab/` exit 0
- **Committed in:** bef85d9 (parte do commit da task 1)

**4. [Rule 3 - Blocking] `.expo/` gerado deve ser ignorado**
- **Found during:** task 1 (`git status` mostra `apps/lab/.expo/` após export)
- **Issue:** cache do Expo não deve ser commitado; `.gitignore` só tinha `dist/` + `node_modules/`
- **Fix:** adicionado `.expo/` ao `.gitignore` (gerado/runtime, per protocolo; `dist/` já ignorado)
- **Files modified:** .gitignore
- **Verification:** `git status` sem `.expo/`/`dist/`
- **Committed in:** bef85d9 (parte do commit da task 1)

**5. [Rule 1 - Bug] Gates literais com falsos-positivos — ajustados sem mudar semântica**
- **Found during:** tasks 1–2 (verificação dos acceptance criteria)
- **Issue A:** comentário com `localStorage` (“zero localStorage”) faz `grep -rn localStorage` retornar 1 mesmo sem uso real. **Fix:** reescrito como “sem armazenamento do navegador para privilégio/owner” (zero matches).
- **Issue B:** gate `grep -c "localStorage" src -r | wc -l == 0` é insatisfatível: `grep -c -r` emite 1 linha por arquivo (4 linhas = nº de arquivos), nunca 0. **Fix:** verificação significativa usada: `grep -rn localStorage src | wc -l == 0`.
- **Files modified:** apps/lab/src/api/client.ts (comentário)
- **Verification:** `grep -rn localStorage src | wc -l` 0; `grep -rn ": any|as any" src app | wc -l` 0
- **Committed in:** aad160f (parte do commit da task 2)

---

**Total deviations:** 5 auto-fixed (3 bugs, 2 blocking)
**Impact on plan:** Todos necessários para build verde, typecheck strict e gates executáveis. Nenhum scope creep; nenhuma rota, status ou envelope mudou além do especificado.

## Issues Encountered

- `pnpm install` avisa peers não atendidos (`worklets ^0.7–0.10` vs `0.12.2`, `@react-native/metro-config@0.86.3` vs `0.87.1` residual): transitivos do Expo SDK, fora do nosso controle de pins; export e tsc verdes, sem impacto funcional. Reavaliar quando SDK 58 pinar worklets novo.
- `pnpm audit`: 5 moderate + 2 high, todos em toolchain transitiva do Expo (`image-size` via expo, `uuid@7.0.3` via `xcode`, `esbuild`, `vitest` pré-existente) + 0 no nosso código; highs sem patch (`<0.0.0`, DoS em parser de imagem do dev tooling, não no bundle). Documentado como dívida de toolchain, não bloqueia (bundle estático sem dev server).
- `gitleaks`/`opengrep` sem binário local: substituídos por scan manual (sem chaves/token hardcoded, sem `BEGIN PRIVATE KEY`, bundle sem `EXPO_PUBLIC_*` além da base pública esperada — bundle atual nem inclui client ainda; matches de `password` no bundle são tipos de input do `react-native-web`, não segredos) + eslint + `pnpm audit`. SAST/Gitleaks de CI continuam como gate no GitHub.
- Shell `grep -c` com glob emite por-arquivo (`file:count`): contagens do plano interpretadas como total (`-h | wc -l` / soma); nenhum gate afrouxado, apenas leitura correta.

## Auth Gates

None — nenhum bloqueio de autenticação externa; login/PAT exercitados só como tipos/paths (prova viva com PG em 06-03/04).

## Known Stubs

Placeholders intencionais do esqueleto (dados reais em 06-03/04 e fases 7–9):

- `apps/lab/app/index.tsx` — redirect estático para /login|/projects; sessão real em 06-03 (sem decidir privilégio)
- `apps/lab/app/login.tsx` — campos estáticos (email+senha+entrar+convite); lógica + `authApi.login` em 06-03
- `apps/lab/app/register.tsx` — campo token estático; `authApi.register` + erro legível em 06-03
- `apps/lab/app/projects.tsx` — lista estática + exemplo uuid `00000000-...`; `projectsApi.list/create` + estados em 06-04/07
- `apps/lab/app/project/[id].tsx` — header/abass estáticos + contador `Corpus: 0`; `projectsApi.listById` + contador vivo em 06-04/09
- `apps/lab/app/project/[id]/strategies.tsx` — lista estática; `labApi.listSearches/execute` na fase 7
- `apps/lab/app/project/[id]/corpus.tsx` — `Corpus: 0` estático; `labApi.getCorpus/export` na fase 9
- `apps/lab/src/api/*` — `labApi` cobre só paths §11 usados em 7–9; decisões/tags/grupos (fase 8) entram com as telas de triagem, sem filtrar localmente

## Threat Flags

None — nenhuma superfície nova fora do `<threat_model>`: app→API validada como hostil (Zod + narrowing), bundle só com base URL pública (T-06-02-01), tipos em definição única (T-06-02-02), ownerId nunca enviado/lido do storage (T-06-02-03), PAT/cookies nunca logados (T-06-02-04), Metro/pnpm com `.npmrc` local + Expo Go manual (T-06-02-05). Nenhum endpoint, rota ou tabela além dos previstos.

## Verification Results

- `pnpm --filter @uhhu/lab exec tsc --noEmit` → exit 0 (após fix exactOptionalPropertyTypes)
- `pnpm --filter @uhhu/lab exec expo export --platform web` → `Exported: dist` (bundle 1.1MB `entry-*.js` + `index.html` + `metadata.json` + 18 assets; `apps/lab/dist/` 1.3M)
- `test -f apps/lab/package.json && grep -c workspace` → 1 (>=1); `extends tsconfig.base` 1, `strict:false` 0; `ls app/*.tsx app/project/*.tsx | wc -l` 6 (>=5) + 2 aninhadas = 8 arquivos de rota
- `grep -h "from '@uhhu/contracts'" src/api` → 8 (>=4); `grep -h "import type"` → 9 (>=4); zero `interface PublicUser|ProjectDTO|SearchDTO` fora de `import type`
- `grep -rn ": any|as any|@ts-ignore|Array<any>" src app` → 0; `credentials.*include` 2 (>=1); `EXPO_PUBLIC_API_BASE_URL` 2 (>=1); `grep -rn localStorage src` → 0
- `eslint apps/lab/` → exit 0; `pnpm audit` → 5 moderate + 2 high só em toolchain Expo (0 no nosso código); scan manual segredos 0; `Math.random`/`eval`/`new Function` 0
- Auditoria adversarial arquivo-a-arquivo (autorização decorativa, IDOR 404 idêntico, confiança no navegador, segredos, XSS/Zod/encodeURIComponent, sessões cookie/PAT, rate limit server-side, SQL/command, isolamento): 0 achados críticos/altos

## Success Criteria

- UI-01: ✅ web exporta sem erro e Expo Go documentado via tailnet (sem EAS), 7 rotas placeholder navegáveis (Stack + typedRoutes)
- UI-02: ✅ todo dado do CORE passa pelo client tipado derivado dos schemas compartilhados (`import type`, Zod na fronteira), sem cópia local, cookie no web + Bearer injetado no nativo, erros PT-BR tipados

## Next Phase Readiness

- Pronto para 06-03 (auth web cookie + nativo PAT em SecureStore + logout revoga + redirect expirada): telas e `authApi` já com paths/tipos corretos, falta wiring de sessão
- Pronto para 06-04 (estados vazio/skeleton/erro/parcial + gates app + prova beta com dados reais): esqueleto + `projectsApi`/`labApi` prontos, falta UI de estados e CORS beta ponta-a-ponta
- Desbloqueia fases 7–9: buscas/runs (searches), triagem/isNew (results), corpus/compare/export (labApi) já com paths §11 corretos
- Pendências: `EXPO_PUBLIC_API_BASE_URL` real do beta tailnet no env de build (valor de infra, nunca commitado); revalidar peers/worklets quando SDK 58 sair

## Self-Check: PASSED

- Arquivos criados existem: `apps/lab/package.json` FOUND; `apps/lab/app/_layout.tsx` FOUND; `apps/lab/src/api/client.ts` FOUND; `apps/lab/src/api/lab.ts` FOUND (verificados via `test -f`)
- Commits existem: `bef85d9` FOUND; `aad160f` FOUND (verificados via `git log --oneline`)

---
*Phase: 06-fundacao-app-auth-suporte-core*
*Completed: 2026-09-11*
