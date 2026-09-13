---
phase: 06-fundacao-app-auth-suporte-core
plan: "04"
subsystem: ui
tags: [expo, react-native, typescript-strict, vitest, cors, beta, transverse-states]

# Dependency graph
requires:
  - phase: 05-plataforma-contrato-canais
    provides: [POST /auth/login cookie, POST /auth/token PAT deviceName, GET /auth/me, lockout 5→15min, projects CRUD owner-scoped]
  - phase: 06-fundacao-app-auth-suporte-core
    provides: [06-01 CORS allowlist exata fail-closed, 06-02 scaffold Expo SDK57 + client tipado, 06-03 auth web cookie + PAT nativo + convite + expiração]
provides:
  - Biblioteca de estados transversais §11 (Empty/CardSkeleton/ErrorBanner/PartialBanner) aplicada em login/projetos/projeto
  - Gates verdes do app (typecheck strict + eslint no-any + vitest 7/7, zero any incl. testes)
  - Bundle web sem segredos (export 1.7MB, grep bloqueante 0) + prova beta CORS+auth com dados reais
affects: [07-comparacao-referencia, 08-resultados-badge-novo, 09-corpus-export-web-beta]

# Tech tracking
tech-stack:
  added: []
  patterns: [estados §11 como componentes puros com testID (empty-state/skeleton-card/error-banner/partial-banner), ErrorBanner com onRetry que refaz o fetch real (sem auto-retry), PartialBanner com status ok|partial|failed (ok renderiza null, sem fingir dado), testes de app com fetch mockado via Response real + vi.mock de SecureStore com Map tipado]

key-files:
  created: [apps/lab/src/ui/Empty.tsx, apps/lab/src/ui/Skeleton.tsx, apps/lab/src/ui/ErrorBanner.tsx, apps/lab/src/ui/PartialBanner.tsx, apps/lab/src/api/__tests__/client.test.ts, apps/lab/src/auth/__tests__/session.test.ts]
  modified: [apps/lab/app/login.tsx, apps/lab/app/projects.tsx, apps/lab/app/project/[id].tsx]

key-decisions:
  - "PartialBanner com status ok renderiza null: fase 6 não tem runs, mostrar âmbar fake seria spoofing (T-06-04-03)"
  - "project/[id].tsx busca o projeto real (listById owner-scoped) em vez de placeholder estático: estados §11 exigem loading/erro/vazio sobre dado vivo"
  - "session.test.ts no nível da decisão pura (isSafeNext + montagem do redirect), sem renderer: sem @testing-library no lab; expired E2E provado no beta 401"

patterns-established:
  - "Repetir é ação manual por toque que refaz o fetch real (onRetry={() => void load()}); nenhum auto-retry/polling na fase 6 (T-06-04-05)"
  - "Textos do esqueleto verbatim nos componentes (projetos 'Nenhum projeto ainda', estratégias 'Nenhuma estratégia', parcial 'Chegaram X, faltou Y')"
  - "Prova beta salva em /tmp/opencode (comandos + status + headers ACAO/Vary, segredos redigidos), mesmo ritual da 06-01"

requirements-completed: [UI-03, UI-04]

# Metrics
duration: 7min
completed: 2026-09-11
---

# Phase 6 Plan 04: Estados transversais + gates + prova beta Summary

**Biblioteca §11 (Empty/CardSkeleton/ErrorBanner/PartialBanner) aplicada em login/projetos/projeto com textos verbatim, gates do app verdes (typecheck+lint+vitest 7/7, zero any), bundle web sem segredos e beta web provada com dados reais via CORS da origem aprovada (200+ACAO com cookie, 401 PT-BR sem cookie, sem ACAO à adulterada).**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-11T19:20:32Z
- **Completed:** 2026-09-11T19:27:33Z
- **Tasks:** 2
- **Files modified:** 9 (6 criados, 3 modificados)

## Accomplishments

- UI-03: 4 componentes de estado (§11 verbatim) + 3 telas migradas — login usa ErrorBanner com Repetir + CardSkeleton leve no busy; projetos usa CardSkeleton/Empty/ErrorBanner com retry que refaz `projectsApi.list`; projeto busca o detalhe real com skeleton/erro-retry/Empty de estratégias/PartialBanner `status="ok"` (null, sem fingir dado) + 401→expired preservando `/project/<id>`
- UI-04: `typecheck` exit 0, `lint` exit 0, `vitest` 7/7 (client 4 + session 3, fetch mockado sem rede real), zero `: any|as any|@ts-ignore` em src+app (incl. testes), `expo export --platform web` ok (entry 1.7MB) + grep bloqueante de segredos em `dist/` == 0 + `EXPO_PUBLIC *SECRET|*TOKEN|*PASSWORD` == 0
- Beta (D-03/D-04 + UI-32 ponta a ponta): API no ar (porta 3009, `CORS_ALLOWED_ORIGINS=http://localhost:8081`) — login cookie como admin DEV, projeto "Prova Beta 06-04" criado, `/auth/me` 200+ACAO exata com cookie, `/projects` 200+ACAO com item real, `/auth/me` 401 PT-BR ("Autenticação necessária.") sem cookie, origem adulterada sem ACAO, preflight 204 correto — salvo em `/tmp/opencode/beta-proof-06-04.txt` (5 ACAO)
- Scanners registrados: Gitleaks histórico 126 commits 0 leaks + `apps/lab` 0 leaks (tree global só 2 achados pré-existentes em `.env.dev` gitignored e `supabase-legacy-export/` untracked, fora do escopo); SAST sem binário (pacotes npx 404) substituído por scan manual de padrões (0 `Math.random`/`eval`/`new Function`, 0 storage de privilégio, 0 console); `pnpm audit --prod` 2 moderate + 2 high só em toolchain Expo transitiva sem patch (`image-size<0.0.0`, `uuid@7.0.3` via xcode, `decode-uri-component` via query-string) — 0 no nosso código

## task Commits

Each task was committed atomically:

1. **task 1: estados transversais §11 como biblioteca e aplicação nas telas** - `37ef874` (feat)
2. **task 2: gates verdes + bundle sem segredos + prova beta com dados reais** - `768135c` (test)

**Plan metadata:** (docs: complete plan — próximo commit final)

## Files Created/Modified

- `apps/lab/src/ui/Empty.tsx` - `Empty({title,message,actionLabel,onAction,disabled,disabledHint})` com textos exatos do esqueleto (criado task 1)
- `apps/lab/src/ui/Skeleton.tsx` - `CardSkeleton({count})` com 3 blocos por card, testID `skeleton-card`, zero `ActivityIndicator` (criado task 1)
- `apps/lab/src/ui/ErrorBanner.tsx` - `ErrorBanner({message,requestId,onRetry,onBack})` vermelho-claro, verbatim + `(req …)` + "Repetir"/"Voltar" (criado task 1)
- `apps/lab/src/ui/PartialBanner.tsx` - `PartialBanner({whatCame,whatMissed,status,children})` âmbar "Chegaram X, faltou Y", `status` ok|partial|failed (ok→null) (criado task 1)
- `apps/lab/app/login.tsx` - erro→ErrorBanner com repetir, busy→botão disabled + `CardSkeleton count=1` (modificado task 1)
- `apps/lab/app/projects.tsx` - loading→CardSkeleton, vazio→Empty verbatim + CTA desabilitado "disponível na fase 7", erro→ErrorBanner com retry real (modificado task 1)
- `apps/lab/app/project/[id].tsx` - busca real via `listById` (401→expired+next, id vazio→erro local), header pergunta+status, abas + `Corpus: 0 (fase 9)`, Empty de estratégias + PartialBanner ok (modificado task 1)
- `apps/lab/src/api/__tests__/client.test.ts` - 4 testes: Bearer nativo, cookie web sem Authorization, 401→ApiError verbatim, x-request-id sempre enviado (criado task 2)
- `apps/lab/src/auth/__tests__/session.test.ts` - 3 testes: `/project/<uuid>` preservado, `https://evil`+`//evil`+`\\evil`→`/projects`, redirect expired preserva projeto (criado task 2)

## Decisions Made

- PartialBanner `status="ok"` renderiza null em vez de exibir âmbar decorativo: na fase 6 não há runs; banner parcial sem dado parcial seria skeleton fingindo dado (T-06-04-03). O wire condicional está presente no projeto; o âmbar aparece quando houver `partial` real (fases 8-9).
- `project/[id].tsx` deixou de ser placeholder estático e busca o projeto real: estados §11 (carregando/erro/vazio) só fazem sentido sobre dado vivo; o contador `Corpus: 0` continua placeholder explícito até a fase 9 e nenhuma decisão de elegibilidade foi adicionada (fase 8).
- `session.test.ts` testa a decisão pura (`isSafeNext` + montagem do redirect) sem renderer: o lab não tem `@testing-library`; adicionar jsdom+testing-library por 1 hook seria toolchain desproporcional. O lado estado (`expired` em 401 com user prévio) está provado no beta (401 real sem cookie) e no wiring 06-03 já verde.
- Scripts `typecheck/lint/test/web` já existiam exatos no `package.json` — "garantir" foi verificar + rodar (todos exit 0), sem modificar o arquivo (por isso `package.json` não entra no diff, embora listado no plano).
- Prova beta na porta 3009 (não 3000) com usuário admin DEV residual (`a@example.com`) + projeto criado no ato: PG DEV não tinha mais os usuários da 06-01 (wipe de rotina da suite); criar dado de prova no DEV é o ritual aceito (06-01 fez o mesmo).

## Deviations from Plan

None - plan executed exactly as written.

Notas (não-desvios, documentados para o verificador):

- `grep uhhu_pat` em `src/` retorna 2 matches: ambos são o NOME DA CHAVE do SecureStore (`PAT_STORAGE_KEY = 'uhhu_pat'` + comentário) — identificador, não valor de segredo; pré-existente da 06-03. O gate bloqueante (`dist/`) retorna 0.
- `session.test.ts` não monta `<AuthProvider>` (ver decisão 3): cobre `isSafeNext` + `resolveNext` + montagem do target expired — a mesma lógica que `_layout`/`login`/`projects` executam. Arquivo contém `expired`, `next`, `/project/`, `evil` (grep do verificador encontra o escopo).
- SAST via `npx --yes @opengrep/opengrep` falha com 404 no registry (pacote inexistente; `opengrep`/`semgrep` npx sem executável; `sg` local é `newgrp`, não AST-grep): substituído por scan manual de padrões perigosos + eslint + typecheck, mesmo fallback das 06-01/02/03. SAST de CI continua gate no GitHub.

## Issues Encountered

- `vitest run` no lab sem testes saía 1 ("No test files found") — resolvido pelos próprios testes do plano (7/7 verde após criação); binário `vitest@3.2.7` resolve via workspace raiz, sem instalar nada no lab.
- Login de prova com `a-isnew@example.com` (residual 06-01) retornou `INVALID_CREDENTIALS` (wipe da suite removeu o usuário): listado `users` via driver `postgres` do workspace e usado o admin DEV vigente (`a@example.com` + senha de teste `SenhaForte123!`).
- Primeiro `kill <PID-do-background>` matou o wrapper mas o `tsx` filho (PID 227268) sobreviveu e continuou servindo 200: localizado por varredura de `/proc` por `core-api` (sem `pkill -f`, que casa a própria sessão) e morto com `kill` direto — `curl` depois retornou 000. Nenhum processo residual.
- `gitleaks detect --no-git` (tree) acusa 2 findings pré-existentes: `PG_DEV_PASSWORD` em `.env.dev` (gitignored, credencial local de DEV) e `external_google_secret` em `supabase-legacy-export/auth_config.json` (material legado untracked, só pesquisa). Escopo `apps/lab`: 0 leaks. Histórico git (126 commits): 0 leaks.

## Auditoria adversarial (arquivo-por-arquivo do diff 06-04, antes de qualquer patch — AGENTS.md)

Cobertura: autorização decorativa, IDOR, confiança no navegador, segredos, XSS/input/upload/SSRF, sessões, webhooks, rate limit, SQL/command injection, isolamento entre usuários.

- `src/ui/*.tsx` (4 novos): puros de apresentação, sem fetch/storage/auth; `ErrorBanner.message` repassa verbatim o envelope que o servidor já redige (stack/cookies/SQL nunca no envelope — boundary `tela → ApiError` do plano); `requestId` é correlação, não segredo; `Text` do RN escapa por padrão (sem HTML perigoso no web via react-native-web); skeleton com testID distinto, nunca confundido com dado (T-06-04-03). **0 achados.**
- `app/login.tsx`: validação segue `loginSchema` (mesmas regras do servidor); `onRetry` repete com o mesmo estado (manual, sem loop); `next` via `isSafeNext`; nenhum token/role em storage ou log. **0 achados.**
- `app/projects.tsx`: `getToken` repassado, 401→`markExpired`+redirect (nunca decide privilégio); retry refaz `list` real; links com `id` vindo do servidor. **0 achados.**
- `app/project/[id].tsx`: `projectId` da rota é hostil — vai a `listById` com `encodeURIComponent` (client) e o servidor responde 404 idêntico fora do escopo (IDOR 06-01); id vazio nem faz fetch; `next` interpolado (`/project/${projectId}`) passa por `isSafeNext` no `_layout`/`login` antes de virar navegação. Nota baixa (não-vulnerabilidade): `projectId` com `..` (ex.: `/project/../login`) passa no `isSafeNext` e normaliza para rota segura — efeito máximo é cair no login, sem ganho de privilégio (guards são UX; authZ no CORE). **0 críticos/altos.**
- `__tests__/` (2 novos): fetch 100% mockado (`Response` real, sem rede); `pat-test-123` é dummy; SecureStore mockado com `Map<string,string>` em memória; `expo-device` mockado; zero `any`; zero segredo. **0 achados.**
- Transversal: sem `localStorage`/`AsyncStorage`, sem `Math.random`/`eval`/`new Function`, sem `console`, sem `EXPO_PUBLIC *SECRET|*TOKEN|*PASSWORD`, sem auto-retry/polling (T-06-04-05), sem query SQL no app, sem webhook novo, sem `ownerId` no client. **0 achados.**

**Veredito: 0 críticos/altos. Nenhum patch corretivo necessário — sem autoaprovação aplicada.**

## Auth Gates

None — nenhum bloqueio de autenticação externa; cookie/PAT exercitados via credencial de teste no PG DEV local (nunca segredo real).

## Known Stubs

Intencionais da fase 6 (wire real nas fases indicadas; nenhum impede o objetivo do plano):

- `apps/lab/app/projects.tsx` — CTA "Criar projeto" desabilitado + hint "disponível na fase 7" (criar é fase 7, não stub de dado).
- `apps/lab/app/project/[id].tsx` — `Corpus: 0 (contador vivo na fase 9)`; `Empty` "Nenhuma estratégia… (fase 7)"; `PartialBanner status="ok"` (null até haver runs — fases 8-9).
- `placeholder=` em `TextInput` de login/register (06-03) são props de UX legítimas, não dados mockados.

## Threat Flags

None — nenhuma superfície nova fora do `<threat_model>`: 4 componentes UI sem rede/auth/storage; telas reusam `apiFetch`+`getToken` existentes; nenhum endpoint, rota, tabela ou fluxo além dos previstos (T-06-04-01…05 mitigados conforme o register: bundle grep 0, erro verbatim+retry real, skeleton com testID, 401 real no beta, retry manual).

## Verification Results

- `pnpm --filter @uhhu/lab run typecheck` → exit 0
- `pnpm --filter @uhhu/lab run lint` → exit 0
- `pnpm --filter @uhhu/lab run test` → 2 files, 7 tests passed (client 4 + session 3)
- `grep -rn ": any|as any|@ts-ignore" apps/lab/src apps/lab/app` → 0
- `test -f` Empty/Skeleton/ErrorBanner/PartialBanner → OK; `skeleton-card` 2 (≥1); `onRetry|retry` em ErrorBanner 6 (≥2); `Empty|ErrorBanner|CardSkeleton|PartialBanner` em projects 6 + login 4 (≥4); `ActivityIndicator` solitário 0
- `expo export --platform web` → `Exported: dist` (entry 1.7MB + index.html); `grep segredos dist/` → 0; `EXPO_PUBLIC *SECRET|*TOKEN|*PASSWORD` → 0
- Gitleaks: histórico 126 commits 0 leaks; `apps/lab` 0 leaks; tree global 2 findings pré-existentes fora de escopo (documentados)
- SAST: sem binário local (404 registry) → scan manual 0 padrões perigosos + eslint exit 0; `pnpm audit --prod` → 2 moderate + 2 high só toolchain Expo (0 no nosso código)
- Beta `/tmp/opencode/beta-proof-06-04.txt`: `access-control-allow-origin` 5 (≥1) — me 200+ACAO, projects 200+ACAO com item real, sem-cookie 401 PT-BR, adulterada sem ACAO, preflight 204

## Success Criteria

- UI-03: ✅ vazio orientador / skeleton por card / erro com Repetir / parcial âmbar presentes nas telas existentes (textos verbatim do esqueleto, sem spinner infinito)
- UI-04: ✅ typecheck strict + lint + testes verdes, `any` proibido (incl. testes), bundle web sem segredos, scanners executados com resultado reportado

## Next Phase Readiness

- Fase 6 FECHADA (01+02+03+04): fundação do app + auth nos dois canais + estados §11 + gates + beta com dados reais — pronta para fase 7 (projetos/estratégias/execução: criar projeto, form busca, runs com progresso por fonte, parcial/falha reais no PartialBanner/ErrorBanner)
- Desbloqueia fases 7–9: `projectsApi`/`labApi` + sessão `getToken` + estados prontos para searches/runs/results/corpus/compare; `referenceSearchId`/`isNew` do CORE aguardando UI
- Pendências: `EXPO_PUBLIC_API_BASE_URL` real do beta tailnet no env de build (infra, nunca commitado); `CORS_ALLOWED_ORIGINS` da VPS dev com a origem do preview (valor de infra); revalidar peers/worklets e `pnpm audit` da toolchain quando SDK 58 sair; SAST/Gitleaks de CI verificam no push (6 checks)

## Self-Check: PASSED

- Arquivos criados existem: `apps/lab/src/ui/Empty.tsx` FOUND; `apps/lab/src/ui/Skeleton.tsx` FOUND; `apps/lab/src/ui/ErrorBanner.tsx` FOUND; `apps/lab/src/ui/PartialBanner.tsx` FOUND; `apps/lab/src/api/__tests__/client.test.ts` FOUND; `apps/lab/src/auth/__tests__/session.test.ts` FOUND (verificados via `test -f`)
- Commits existem: `37ef874` FOUND; `768135c` FOUND (verificados via `git log --oneline`)
- Provas existem: `/tmp/opencode/beta-proof-06-04.txt` FOUND (5 ACAO)

---
*Phase: 06-fundacao-app-auth-suporte-core*
*Completed: 2026-09-11*
