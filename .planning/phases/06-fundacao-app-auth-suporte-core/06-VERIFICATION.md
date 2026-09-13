---
phase: 06-fundacao-app-auth-suporte-core
verified: 2026-09-11T19:39:14Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Abrir o app no tablet Android real via Expo Go (QR na rede tailnet)"
    expected: "Expo Go carrega o Lab sem erro de build; navegacao entre /login, /register, /projects, /project/[id] e abas funciona; login nativo por PAT guarda em SecureStore e lista projetos reais"
    why_human: "Requer hardware real (tablet Android do Paulo) + rede tailnet fora deste container; export web prova o bundle, nao o runtime nativo"
  - test: "Acessar o web beta a partir da origem aprovada na tailnet e logar"
    expected: "Login com email+senha via cookie httpOnly leva a /projects com lista real; origem adulterada nao recebe ACAO (provado via curl aqui, falta prova no navegador real)"
    why_human: "Requer rede tailnet + origem beta aprovada + navegador real com cookie; curl prova o servidor, nao o fluxo do navegador"
---

# Phase 6: Fundação do app + auth + suporte CORE — Verification Report

**Phase Goal:** App Expo abre na web e no tablet, autentica nos dois canais e o CORE expõe o que a UI precisa (§14)
**Verified:** 2026-09-11T19:39:14Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 (06-01) | User com sessão expirada não perde dados pois referenceSearchId persiste no Project e volta no GET | ✓ VERIFIED | `packages/db/src/schema.ts:132` coluna `uuid('reference_search_id')` sem FK; PG vivo: `reference_search_id uuid nullable=YES, FK 0`; `apps/core-api/src/lib/projects.ts:39` toDTO expõe `?? null`, `:182-198` check mesmo projectId+owner → null/404, `:228-229` persiste/limpa; capability `projectUpdateInputSchema` reusa `updateProjectSchema` (`capabilities.ts:195,262-263`); `contracts/projects.ts:22,37` schema+DTO; migration `0005_reference_search_id.sql` + journal idx 5 + `/health migrationsApplied:6` |
| 2 (06-01) | Resultado novo do run aparece com isNew verdadeiro e resultado repetido aparece com isNew falso sem coluna nova no banco | ✓ VERIFIED (com aviso H-01, ver § Review) | Re-run PG real: `lab-results-isnew.test.ts` 2/2 verde (A repetido false, B inédito true, `newCount===1` asserido); `contracts/lab.ts:193-194` `isNew: boolean`; `lib/searches.ts:561-580` anti-join D-35 + `:634-645,:668-670` preenche list+get; PG vivo: zero colunas `is_new/isnew` em `lab_results`; IDOR 404 estranho/adulterado no mesmo teste |
| 3 (06-01) | Web beta na origem aprovada recebe dados da API via CORS e origem adulterada recebe resposta sem ACAO | ✓ VERIFIED | Re-prova curl contra servidor fresco (porta 3011, allowlist de teste): válida → `access-control-allow-origin: https://beta.verify.test` + `credentials: true` + `vary: Origin`; adulterada → sem ACAO (401 intacto); preflight → 204 + methods/headers/maxAge; sem Origin → sem ACAO. Código: `index.ts:49-66` callback exato, sem `origin:true/*`/regex; `env.ts:34,48-54` `CORS_ALLOWED_ORIGINS` + `corsAllowedOrigins()` `^https?://[^/]+$`, ausente → lista vazia (fail-closed) |
| 4 (06-02) | User abre o app na web e no tablet sem erro de build e navega entre as telas do esqueleto | ✓ VERIFIED (web automatizado; tablet → humano) | Re-run: `expo export --platform web` → `Exported: dist` exit 0; 8 arquivos de rota (`app/*.tsx`, `app/project/*.tsx` + 2 aninhadas); `_layout.tsx:59-62` Stack com 7 screens + typedRoutes; cada placeholder tem título + mapeamento CORE + link navegável; `app.json` sem `eas.json` (D-05); tablet físico via Expo Go → `human_verification[0]` |
| 5 (06-02) | App consome somente o CORE via client tipado derivado dos schemas compartilhados sem cópia local de tipos | ✓ VERIFIED (com nota M-02, ver § Review) | `src/api/client.ts:125` `apiFetch<T>` (`credentials:include`, Bearer injetado, x-request-id, envelope PT-BR verbatim, `unknown`+narrowing); 8 imports `from '@uhhu/contracts'` + `import type` em todos os módulos; zero `interface PublicUser/ProjectDTO/SearchDTO` local (única `ProjectsRequestOptions` é view model, permitido); bodies via `schema.parse`; IDs com `encodeURIComponent`; zero `postgres`/drizzle/storage/URL inventada |
| 6 (06-02) | Bundle web não contém segredos e typecheck strict passa com any proibido | ✓ VERIFIED | Re-run: `typecheck` exit 0 (extends `tsconfig.base`, sem `strict:false`), `lint` exit 0, `grep : any|as any|@ts-ignore|Array<any>` em `src+app` → 0, `localStorage|AsyncStorage` → 0, `console.` → 0, `Math.random/eval/new Function` → 0; `dist/` grep `uhhu_pat|COOKIE_SECRET|DATABASE_URL|PRIVATE KEY` → 0; `EXPO_PUBLIC*SECRET|TOKEN|PASSWORD` → 0 (só base URL pública) |
| 7 (06-03) | User faz login na web com email e senha via cookie httpOnly e vê a lista de projetos | ✓ VERIFIED | Contrato servidor re-provado: `auth.test.ts` 6/6 (bootstrap/convite/login cookie/sessão/lockout) + `pat-auth.test.ts` 15/15; wiring client: `login.tsx:63-64` `Platform.OS==='web' → session.login` → `authApi.login` (`session.tsx:97-105`, valida `loginSchema`); `projects.tsx:40` `projectsApi.list` real com `credentials:include` (`client.ts:154`); vazio orientador + retry; web nunca chama `/auth/token` |
| 8 (06-03) | User registra conta com convite válido e recebe erro legível com token inválido ou expirado | ✓ VERIFIED | `auth.test.ts` cobre convite válido/registro + reuso/revogado/expirado/email-vinculado sem oráculo (6/6 verde); `register.tsx:53,59-60` valida `registerSchema`, pré-preenche `?token=`, repassa envelope verbatim + requestId, sucesso → `/login?registered=1`; sem cadastro aberto além do convite (ADR-008) |
| 9 (06-03) | User autentica no nativo via PAT por device guardado em secure storage com logout que revoga | ✓ VERIFIED (com nota M-03, ver § Review) | `pat-auth.test.ts` 15/15: emissão 201 raw-uma-vez, 401 genérico, 429 lockout, logout Bearer revoga PAT atual sem derrubar sessão; client: `pat.ts:22-36` `nativeLogin` (valida `patCreateSchema` + `deviceName` automático de `deviceName.ts:20-28`, `issuePat` → `setToken` → `me`), `nativeLogout:38-44` revoga no servidor + `clearToken` em `finally` (offline garantido); `secureToken.ts:21-42` SecureStore só no nativo, memória volátil no web (D-01/D-02; sem tela de tokens per D-02) |
| 10 (06-03) | User com sessão expirada cai no login com aviso sem perder o projeto atual | ✓ VERIFIED | `session.tsx:79,121-129` `expired` + `markExpired` (limpa user/token, nativo descarta PAT); `_layout.tsx:44-45` redirect `/login?expired=1&next=<rota>`; `login.tsx:51-53,97,69` aviso "Sua sessão expirou. Entre novamente." + `safeNext` preserva `/project/<id>`; `isSafeNext` (`session.tsx:32-49`) rejeita `http//`/backslash com fallback `/projects`; `session.test.ts` 3/3 (preserve + evil → fallback); 401 real sem cookie provado via curl (PT-BR) |
| 11 (06-04) | User vê vazio orientador, skeleton carregando, erro com ação repetir e parcial âmbar em todas as telas | ✓ VERIFIED (com nota L-06) | 4 componentes existem (`Empty/Skeleton/ErrorBanner/PartialBanner`); `Skeleton:18` testID `skeleton-card`, 3 blocos/card, zero `ActivityIndicator` solitário; `ErrorBanner:32` botão "Repetir" (`onRetry` refaz o fetch real, sem auto-retry); `PartialBanner` âmbar "Chegaram X, faltou Y", `status ok→null` (sem fingir dado); aplicados em login (erro+retry, busy+skeleton), projetos (skeleton/vazio verbatim/erro+retry) e projeto (detalhe real via `listById`, skeleton/erro+retry/Empty/Partial ok). Nota: `register.tsx` usa erro em `Text` simples sem `ErrorBanner` (L-06, baixa — mantém mensagem legível, só sem Repetir) |
| 12 (06-04) | Gates do app passam com typecheck strict, lint, testes, any proibido e bundle sem segredos | ✓ VERIFIED | Re-run nesta verificação: `lab typecheck` 0, `lab lint` 0, `lab test` 7/7 (client 4 + session 3, fetch mockado), `contracts/db/core-api typecheck` 0, `expo export web` 0 + `dist` segredos 0; `pnpm audit --prod` só toolchain Expo transitiva (`image-size`, `uuid@7` via xcode, `decode-uri-component`, sem patch — I-08, fora do bundle); Gitleaks sem binário neste container (substituído por greps 0 + histórico limpo reportado em 06-04; CI como gate); SAST idem (fallback manual 0 + eslint 0, CI como gate) |
| 13 (06-04) | Web beta carrega dados reais da API a partir da origem aprovada com CORS e auth íntegros | ✓ VERIFIED (servidor+curl; navegador tailnet → humano) | Lado servidor re-provado nesta verificação (verdade 3); histórico 06-04 (`beta-proof-06-04.txt`, 5 ACAO): `/auth/me` 200+ACAO com cookie, `/projects` 200+ACAO com item real, sem-cookie 401 PT-BR, adulterada sem ACAO, preflight 204; `V-04/V-08/V-09` (PAT/cookie, guards UX, lockout verbatim) íntegros; navegador real na origem tailnet → `human_verification[1]` |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `packages/db/drizzle/0005_reference_search_id.sql` | Migration coluna `reference_search_id` | ✓ VERIFIED | `ALTER TABLE "projects" ADD COLUMN "reference_search_id" uuid;` + journal idx 5 `0005_reference_search_id`; PG vivo confirma coluna + aplicada (`migrationsApplied:6`) |
| `packages/contracts/src/projects.ts` | ProjectDTO + schema com referenceSearchId | ✓ VERIFIED | 3 ocorrências (doc + `updateProjectSchema:22` só-update + `ProjectDTO:37`); definição única |
| `packages/contracts/src/lab.ts` | ResultDTO com isNew | ✓ VERIFIED | `isNew: boolean:193-194` + comentário D-35/§14-5; sem coluna em nenhum schema |
| `apps/core-api/src/index.ts` | CORS allowlist exata | ✓ VERIFIED | `cors:9,49-66` callback exato antes das rotas, `credentials:true`, methods/headers/maxAge, `Vary: Origin`; zero padrão espelhado; `requireAuth` intacto; logger redact auth/cookie; bind 127.0.0.1 em DEV |
| `apps/lab/package.json` | Scaffold Expo | ✓ VERIFIED | `@uhhu/lab`, SDK 57 pinado, scripts typecheck/lint/test/start/web, `@uhhu/contracts workspace:*` |
| `apps/lab/src/api/client.ts` | Fetch wrapper tipado | ✓ VERIFIED | `apiFetch:125` + `ApiError` verbatim + `getApiBaseUrl` (`EXPO_PUBLIC_API_BASE_URL`, fallback dev, nunca segredo) |
| `apps/lab/app/_layout.tsx` | Navegação esqueleto | ✓ VERIFIED | `Stack:59-62` 7 screens + `AuthProvider`/`AuthGate` com redirect expired+next |
| `apps/lab/app/login.tsx` | Tela login web+nativo | ✓ VERIFIED | MESMA tela, branch `Platform.OS:63-68` (web cookie / nativo PAT+refresh), avisos expired/registered, erro verbatim+req, `safeNext` |
| `apps/lab/src/auth/pat.ts` | Fluxo PAT nativo | ✓ VERIFIED | `issuePat /api/v1/auth/token:25-26`, SecureStore uma-vez, `nativeLogout` revoga+apaga em `finally` |
| `apps/lab/src/auth/session.tsx` | Sessão + expiração + next | ✓ VERIFIED | `expired:79`, `isSafeNext:32-49`, `login/logout/refresh/markExpired`, web-cookie vs nativo-Bearer |
| `apps/lab/src/ui/Empty.tsx` | Vazio orientador | ✓ VERIFIED | Textos verbatim ("Nenhum projeto ainda…", "Nenhuma estratégia… fase 7"), CTA fase 7 desabilitado explícito |
| `apps/lab/src/ui/Skeleton.tsx` | Skeleton carregando | ✓ VERIFIED | `CardSkeleton` 3 blocos/card, testID `skeleton-card`, sem spinner solitário |
| `apps/lab/src/ui/ErrorBanner.tsx` | Erro com ação | ✓ VERIFIED | `onRetry` → "Repetir" refaz fetch real + `onBack` "Voltar", verbatim + `(req …)` |
| `apps/lab/src/ui/PartialBanner.tsx` | Parcial âmbar | ✓ VERIFIED | "Chegaram X, faltou Y", `status ok|partial|failed` (ok→null, sem dado fake) |
| `apps/lab/src/api/__tests__/client.test.ts` | Testes client | ✓ VERIFIED | 4 testes (Bearer nativo, cookie web, 401 verbatim, x-request-id); `unknown`+narrowing, zero `any` |
| `apps/lab/src/auth/__tests__/session.test.ts` | Testes sessão/next | ✓ VERIFIED | 3 testes (`/project/<uuid>` preservado, evil→`/projects`, redirect expired); cobre `isSafeNext`+montagem (L-03: mira no `_layout` real como follow-up) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `routes/projects.ts` | `lib/projects.ts` | capability `platform.project.update` com `referenceSearchId` | ✓ WIRED | `capabilities.ts:195,262-263` schema→lib; `lib:182-198,228-229` check+set; rota sem owner do body |
| `lib/searches.ts` | `contracts/lab.ts` | `listResultsForActor` preenche isNew via anti-join D-35 | ✓ WIRED | `searches.ts:561-580,634-645,668-670` + `toResultDTO(row,isNew):282`; `lab.ts:645` envelope mantém `newCount` frozen (ver H-01) |
| `index.ts` | `config/env.ts` | `CORS_ALLOWED_ORIGINS` do env validado | ✓ WIRED | `index.ts:11,55` consome `corsAllowedOrigins()`; `env.ts:34,48-54` schema+helper; re-prova curl válida/adulterada/preflight |
| `lab/src/api/client.ts` | `packages/contracts` | `import type` DTOs/schemas sem duplicar | ✓ WIRED | 8 imports de contracts, `import type` em todos os módulos; zero interface de domínio local |
| `lab/app/_layout.tsx` | `lab/src/api/client.ts` | telas chamam client, nunca fetch direto/banco | ✓ WIRED | `_layout` monta `AuthProvider`; `login/register/projects/project[id]` chamam `authApi/projectsApi` + `getToken`; zero fetch direto, zero drizzle/postgres no app |
| `lab/app/login.tsx` | `lab/src/api/auth.ts` | login chama `authApi` sem fetch direto | ✓ WIRED | web `session.login→authApi.login`, nativo `pat.nativeLogin→authApi.issuePat` (`login.tsx:63-68`, `pat.ts:24-26`) |
| `lab/src/auth/pat.ts` | `/api/v1/auth/token` | POST email+senha+deviceName, raw uma vez | ✓ WIRED | `pat.ts:24-28` + `auth.ts:86-87`; `pat-auth.test.ts` 15/15 prova o servidor |
| `lab/src/auth/session.tsx` | `lab/app/_layout.tsx` | 401 global → `/login` com aviso+next | ✓ WIRED | `markExpired:121-129` + gate `_layout:44-45` + `login:51-53` aviso/next |
| `lab/app/projects.tsx` | `lab/src/ui/Empty.tsx` | vazio renderiza Empty com CTA | ✓ WIRED | `projects.tsx:111` Empty verbatim + CTA desabilitado fase 7 |
| `lab/app/projects.tsx` | `lab/src/ui/ErrorBanner.tsx` | falha renderiza banner com repetir | ✓ WIRED | `projects.tsx:97` ErrorBanner com retry que refaz `projectsApi.list` |
| `apps/lab/dist` | `apps/core-api` | bundle sem segredos via CORS da origem beta | ✓ WIRED | export re-run ok + `dist` segredos 0; CORS+auth re-provados via curl; navegador tailnet → humano |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `projects.tsx` | lista de projetos | `projectsApi.list` → `GET /api/v1/projects` → `projects.ownerId=actor` (PG) | ✓ FLOWING | histórico beta com item real + `projects.test.ts` 5/5 |
| `project/[id].tsx` | detalhe do projeto | `projectsApi.listById` → `GET /projects/:id` owner-scoped, 404 idêntico | ✓ FLOWING | busca real com skeleton/erro/401→expired |
| `login.tsx` (web) | `user` | `authApi.login/me` → cookie httpOnly → `GET /auth/me` | ✓ FLOWING | `auth.test.ts` 6/6; cookie nunca em storage/JS |
| `pat.ts` (nativo) | `user` + PAT | `POST /auth/token` → SecureStore → `GET /me` Bearer | ✓ FLOWING | `pat-auth.test.ts` 15/15; raw uma vez, zero log/bundle |
| `runs results` | `items[].isNew` | `listResultsForActor` anti-join D-35 sobre `lab_results` real | ✓ FLOWING (2 runs) | `lab-results-isnew.test.ts` 2/2; H-01 só com ≥3 runs (decisão pendente) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| isNew PG real (repetido false / inédito true / newCount) | `pnpm vitest run tests/integration/lab-results-isnew.test.ts` | 2/2 passed | ✓ PASS |
| PAT lifecycle (emissão/logout/IDOR/lockout) | `pnpm vitest run tests/integration/pat-auth.test.ts` | 15/15 passed | ✓ PASS |
| Auth cookie/convite/sessão/lockout | `pnpm vitest run tests/integration/auth.test.ts` | 6/6 passed | ✓ PASS |
| Projects CRUD owner-scoped (sem regressão) | `pnpm vitest run tests/integration/projects.test.ts` | 5/5 passed | ✓ PASS |
| App gates (typecheck+lint+test) | `lab run typecheck/lint/test` | 0 / 0 / 7-7 | ✓ PASS |
| CORS válida/adulterada/preflight/sem-Origin | curl fresco porta 3011 `/api/v1/auth/me` | ACAO exata+credentials só na válida; 204 preflight; sem ACAO adulterada/sem-Origin | ✓ PASS |
| Web export + bundle sem segredos | `expo export --platform web` + grep `dist/` + `EXPO_PUBLIC*` | `Exported: dist`, 0 segredos | ✓ PASS |
| Login cookie vivo via curl DEV | `POST /auth/login` com usuário residual | 401 (usuários DEV removidos pelo wipe de rotina da suite) | ? SKIP → coberto pelos 6/6 de auth + beta histórico |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| UI-01 | 06-02 | App abre web+tablet, 7 telas sem erro de build | ✓ SATISFIED (web) / humano (tablet) | export re-run ok + 8 rotas + Stack; tablet → humano |
| UI-02 | 06-02 | Só CORE via client tipado, sem cópia local | ✓ SATISFIED | 8 imports contracts, `import type`, zero dup, zero any |
| UI-03 | 06-04 | Vazio/skeleton/erro/parcial em todas as telas | ✓ SATISFIED (nota L-06) | 4 componentes + 3 telas migradas; register sem Repetir (baixa) |
| UI-04 | 06-04 | Gates verdes, any proibido, bundle sem segredos | ✓ SATISFIED | typecheck+lint+7/7, any 0, dist 0, audit só toolchain |
| UI-05 | 06-03 | Login web cookie → lista de projetos | ✓ SATISFIED | auth 6/6 + wiring login→list com cookie |
| UI-06 | 06-03 | Registro por convite + erro legível | ✓ SATISFIED | auth 6/6 convites + register verbatim sem oráculo |
| UI-07 | 06-03 | Nativo PAT/device + logout revoga | ✓ SATISFIED | pat-auth 15/15 + SecureStore + finally |
| UI-08 | 06-03 | Expirada → login com aviso, sem perder projeto | ✓ SATISFIED | expired+next+isSafeNext, session 3/3, 401 real |
| UI-30 | 06-01 | referenceSearchId nullable, migration, owner-isolado | ✓ SATISFIED | migration 0005 + PG coluna/FK0 + lib scoped + DTO |
| UI-31 | 06-01 | GET results expõe isNew on-read D-35, sem coluna | ✓ SATISFIED (aviso H-01) | isnew 2/2 + zero coluna PG + D-35 fiel |
| UI-32 | 06-01 (+06-04 beta) | Web beta via CORS da origem aprovada | ✓ SATISFIED (servidor) / humano (navegador) | curl válida/adulterada re-provado + beta histórico 5 ACAO |

Orphaned requirements: none — os 11 IDs da fase estão todos nos PLANs e no REQUIREMENTS.md (UI-01..08, UI-30..32); UI-09..29 pertencem às fases 7-9.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | `TODO/FIXME/PLACEHOLDER`, `return null/[]/{}` vazio, `console.log` com segredo, `localStorage/AsyncStorage`, `Math.random/eval/new Function`, segredo hardcoded, `EXPO_PUBLIC*SECRET/TOKEN/PASSWORD` | — | ℹ️ Nenhum encontrado (greps 0 em `src+app` e `dist/`) |
| `contracts/projects.ts:5`, `schema.ts:128-131`, `index.ts:42-48` | — | greps literais casam os próprios comentários que documentam a proibição | ℹ️ Info (falso-positivo conhecido, já tratado nas SUMMARIES) | nenhum — prova funcional acima dos greps |
| `src/api/projects.ts:20` | `ProjectsRequestOptions` | interface local | ℹ️ Info — view model de request, não tipo de domínio; permitido | nenhum |

### Advisory Review Assessment (06-REVIEW.md — H-01/M-01..M-03, L-01..L-06, I-01..I-08)

Nenhum achado invalida um must_have da fase 6 (review declara: sem furo crítico de segurança; advisory, non-blocking). Classificação:

- **H-01 (isNew on-read vs `newCount` frozen com ≥3 runs):** NÃO invalida a verdade 2 no escopo da fase (2 runs: coincidem; teste 2/2 verde; transcrição fiel ao D-35 canônico V-07). É divergência real de semântica frozen-vs-live + comentário "anteriores" vs query "outros" — exige **decisão de produto** (frozen vs live) antes da fase 8 (badge NOVO constrói sobre este campo). Recomendação: rodar `/gsd-code-review-fix` com a opção 1 do review (computar `newCount` on-read) ou decisão explícita; **não bloquear a fase 6**, bloquear silêncio sobre H-01 na fase 8.
- **M-01 (dangling `referenceSearchId` após DELETE da search):** NÃO invalida a verdade 1 (persistência/GET/404 funcionam; sem questão de privilégio — ainda owner-scoped). Falta cleanup em `deleteSearchForActor` (nulificar referências na mesma transação) + teste. Afeta a fase 7 (comparação). Follow-up mecânico.
- **M-02 (client sem validação runtime de respostas, `data as T`):** NÃO invalida a verdade 5 (plano escopou Zod aos bodies de saída; tipos em definição única cumpridos). Gap documentado: adicionar `parseResponse(schema,data)` ao menos em login/register/me/list. Fases 7-9 multiplicam call sites — endurecer antes.
- **M-03 (`nativeLogin` deixa PAT órfão se `me` lança):** NÃO invalida a verdade 9 (caminho feliz + `me===null` tratados; 15/15 verdes). Só o caminho *throw* após `setToken` não limpa — fix `try/catch → clearToken` + teste. Sprawl baixo, sem tela de inventário per D-02.
- **L-01..L-06:** nenhum invalida must_have. L-03 (teste mira em lookalike de `nextForPathname`) e L-05 (`x-request-id` sem `exposedHeaders` no browser) são os mais úteis como segunda passada; L-06 (register sem `ErrorBanner`) registrado como nota da verdade 11.
- **Controles verificados V-01..V-10:** conferem com esta verificação (owner-scoping, CORS fail-closed, validação em profundidade, ciclo PAT, higiene, sem segredos, D-35 fiel, guards UX, lockout verbatim, migration mínima).

### Context Decisions (D-01..D-06)

| Decisão | Status | Evidência |
| ------- | ------ | --------- |
| D-01 primeiro PAT in-app (sem web/QR) | ✓ HONORED | `pat.ts` email+senha→token→SecureStore; zero fluxo QR/web |
| D-02 deviceName automático, sem revogação web na fase 6 | ✓ HONORED | `deviceName.ts` modelo+data≤100 + schema; sem tela `GET/DELETE /tokens` |
| D-03 beta via tailnet/local, sem exposição pública | ✓ HONORED | bind 127.0.0.1 em DEV, allowlist por env, sem origem pública hardcoded |
| D-04 CORS allowlist exata, prova válida/adulterada, sem permissivo | ✓ HONORED | callback exato + re-prova curl (válida ACAO / adulterada sem ACAO / preflight 204) |
| D-05 Expo Go (+web), sem EAS | ✓ HONORED | sem `eas.json`, sem conta/assinatura; README documenta Expo Go |
| D-06 Android primeiro | ✓ HONORED | README orienta Android; `app.json` com `android.package`, iOS presente mas sem prioridade |

### Human Verification Required

### 1. Tablet Android real via Expo Go

**Test:** Na rede tailnet, rodar `pnpm --filter @uhhu/lab start`, escanear o QR no Expo Go do tablet, navegar login→projects→project→abas, fazer login nativo e confirmar a lista real.
**Expected:** App carrega sem redbox, navegação funciona, PAT guardado em SecureStore, logout revoga (próximo uso dá 401→aviso).
**Why human:** Requer o tablet físico + rede tailnet + Expo Go — fora do container.

### 2. Web beta na origem aprovada (navegador real)

**Test:** Abrir a URL do preview web na origem da allowlist (`CORS_ALLOWED_ORIGINS`), logar com email+senha, confirmar `/projects` com dados reais; repetir sem cookie e confirmar 401 PT-BR com aviso de expiração preservando `next`.
**Expected:** 200 + dados com cookie; 401 + "Sua sessão expirou. Entre novamente." + retorno ao projeto após login; DevTools mostra `access-control-allow-origin` exata só na origem aprovada.
**Why human:** Requer navegador real com cookie httpOnly + origem tailnet aprovada — curl prova o servidor, não o navegador.

### Gaps Summary

Nenhum gap bloqueante. 13/13 must-haves verificados contra o código real (typechecks, 4 suites de integração PG — 28 testes — re-executadas, prova CORS curl contra servidor fresco, export web + bundle limpo re-executados). Achados do review advisory (H-01 + M-01..M-03) são follow-ups com dono claro antes/durante as fases 7-9, não invalidações da fase 6. Restam apenas os 2 itens de hardware/rede acima — por isso `human_needed`, não `passed`.

---

_Verified: 2026-09-11T19:39:14Z_
_Verifier: OpenCode (gsd-verifier)_
