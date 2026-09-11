---
phase: 05-prova-headless
plan: 03
subsystem: headless-cli
tags: [cli, pat, bearer, headless, polling, idempotency, export, fastify, vitest, tsx]

# Dependency graph
requires:
  - phase: 05-prova-headless
    provides: [POST /auth/token emissao de PAT, Bearer auth com sliding 30d, buildExecutor(db) + rotas lab/projects via execute(), 14 capabilities transicionais]
  - phase: 04-corpus-e-exportacao
    provides: [rotas lab Phase 4 (groups/tags/divergence/pin/corpus/compare/export attachment), envelope PT-BR, Job=Run 1:1]
provides:
  - CLI @uhhu/cli sobre a API (auth PAT, cadeia Etapa 2, tabela/--json, polling D-56, export com arquivo, credencial 600)
  - client HTTP fino (apiFetch Bearer+X-Request-Id+Idempotency-Key, waitForJob 600s) sem nenhum import de db
  - Suites cli-unit 17/17 (smoke) + cli-headless 7/7 (integracao PG real, filho sem DATABASE_URL)
affects: [05-04 (MCP sobre o mesmo PAT + execute), 05-05 (prova 3 canais + gate Etapa 2)]

# Tech tracking
tech-stack:
  added: []
  patterns: [cli como adaptador fino de E/S sobre REST (1 comando = 1+ chamadas HTTP, validacao leve local), erro envelope→stderr + exit por status, teste de filho headless via spawn async (sync deadlocka o loop do servidor in-process), HOME fake + UHHU_TOKEN para isolamento de credencial em teste]

key-files:
  created: [apps/cli/src/commands.ts, apps/cli/src/client.ts, apps/cli/src/auth-store.ts, apps/cli/src/table.ts, apps/cli/src/uhhu.ts, apps/cli/bin/uhhu.mjs, apps/cli/package.json, apps/cli/tsconfig.json, tests/smoke/cli-unit.test.ts, tests/integration/cli-headless.test.ts]
  modified: [apps/cli/README.md]

key-decisions:
  - "Bin via wrapper bin/uhhu.mjs (JS puro -> tsx src/uhhu.ts); nome nu `uhhu` exige wiring na raiz (fora do escopo: root package.json com hunk Phase 4 nao commitado) — verificado via path, follow-up documentado"
  - "`lab result decide --result` recebe o id do GRUPO de dedup (decisao UMA por grupo, D-46), path espelha PUT /lab/groups/:groupId/decision"
  - "apiFetch com opcao raw para salvar o attachment byte-exato (sem re-serializar o JSON)"
  - "Spawn do filho em teste SEMPRE async (execFile): execFileSync deadlocka o event loop do servidor in-process"
  - "baseUrl: UHHU_API_URL > --api > base salvo > default (ordem do plano); token: UHHU_TOKEN > arquivo"

patterns-established:
  - "Comandos nunca chamam process.exit (testabilidade: integracao importa as funcoes direto; so uhhu.ts sai)"
  - "Filename de export vem do content-disposition do servidor, higienizado (basename, sem path, rejeita `.`/`..`); fallback corpus-<projeto>-<AAAAMMDD>.<ext>"
  - "Estados terminais do polling = succeeded|partial|failed|cancelled (os reais do JobDTO); failed|cancelled pos-polling = exit 1 com o erro no stderr"

requirements-completed: [CORE-02, CORE-05]

# Metrics
duration: ~22min
completed: 2026-09-11
---

# Phase 5 Plan 03: CLI @uhhu/cli headless Summary

**CLI `uhhu` sobre PAT executa a cadeia Etapa 2 (login→projeto→busca→run→results→decide→corpus→export) só com BASE_URL+PAT, com tabela/`--json`, polling 25s+jobs, export em arquivo e credencial 600 — zero imports de db, 134/134 verdes**

## Performance

- **Duration:** ~22min
- **Started:** 2026-09-11T13:02:09Z
- **Completed:** 2026-09-11T13:24:05Z (aprox.)
- **Tasks:** 3
- **Files modified:** 11 (10 criados + 1 alterado)

## Accomplishments

- Bin `uhhu` funcional via pnpm sem build (wrapper `bin/uhhu.mjs` → `tsx src/uhhu.ts`): 22 comandos (D-64 exatos + cadeia total: corpus get, search compare, source list, groups/tags/diverge/pin), `--help` geral e por comando, exit por status documentado (0/2/3/4/5/1)
- `client.ts`: `apiFetch` (Bearer, `X-Request-Id` por chamada, `Idempotency-Key`, envelope PT-BR verbatim em `CliApiError`, captura de `content-disposition`, modo `raw` byte-exato) + `waitForJob` (polling 2s, timeout 600s, `-v` no stderr)
- `auth-store.ts`: `credentials.json` 600 verificado por stat, `UHHU_TOKEN` precede, `logout` revoga o PAT no servidor e apaga o local (missing=ok); PAT nunca em stdout (provado por teste)
- Smoke `cli-unit` 17/17 sem PG/rede (tabela, store em HOME fake, mapping de erros, polling/timeout, guard sem-db) + integração `cli-headless` 7/7 contra PG DEV real (cadeia completa, replay idempotente com mesma key, filho sem `DATABASE_URL` no env)
- Suite completa do monorepo: **14 arquivos, 134 testes, 0 falhas**; typecheck raiz + pacotes verde; eslint limpo; zero `any`; guard D-55 verde

## task Commits

Each task was committed atomically:

1. **task 1: scaffold @uhhu/cli + client HTTP + auth-store 600** - `9395ff4` (feat)
2. **task 2: comandos D-64 da cadeia total + export com arquivo + --json/-v** - `2f1be53` (feat)
3. **task 3: smoke do CLI + integração contra PG DEV** - `5fa7f9c` (test)

**Plan metadata:** pendente (docs: complete plan — commit final após STATE/ROADMAP)

## Files Created/Modified

- `apps/cli/package.json` - `@uhhu/cli` com bin `uhhu` → `./bin/uhhu.mjs`, deps só contracts+tsx
- `apps/cli/tsconfig.json` - estende a base (strict, sem enfraquecer)
- `apps/cli/bin/uhhu.mjs` - wrapper JS puro que resolve tsx e repassa argv
- `apps/cli/src/client.ts` - `apiFetch` + `waitForJob` + `CliApiError` + `parseContentDisposition`
- `apps/cli/src/auth-store.ts` - `saveToken`/`loadToken`/`clearToken` + `CliAuthError`
- `apps/cli/src/table.ts` - `printTable` (padEnd, sem cor) + `printJson` (puro, 2 espaços)
- `apps/cli/src/commands.ts` - 22 comandos da cadeia total + `exitCodeForStatus` + `UsageError` + `parseArgs`
- `apps/cli/src/uhhu.ts` - roteador argv, `parseGlobals`, helps, mapa de erros→exit
- `apps/cli/README.md` - uso real (substitui "fronteira reservada") + códigos de saída
- `tests/smoke/cli-unit.test.ts` - 17 its sem PG/rede
- `tests/integration/cli-headless.test.ts` - 7 its contra PG DEV real

## Decisions Made

- Bin via wrapper `bin/uhhu.mjs` (JS puro → `tsx ../src/uhhu.ts`): `.ts` direto não roda sob o shim node do pnpm; o wrapper resolve tsx em `node_modules/.bin` (pacote/app/raiz) com fallback para o PATH.
- Nome nu `uhhu` em `pnpm --filter @uhhu/cli exec uhhu` exige linkage na raiz (root depender de `@uhhu/cli`) — fora do escopo deste plano E colidindo com hunk Phase 4 não commitado no root `package.json`; verificado via path (`exec ./bin/uhhu.mjs --help`, exit 0). Follow-up: wiring da raiz (05-05 ou dono do root).
- `--result` do `lab result decide` = id do grupo de dedup (D-46: decisão UMA por grupo); documentado no help e no código; path espelha a rota Phase 4 verbatim.
- `apiFetch` com opção `raw: true` para o export salvar o attachment byte-exato em vez de re-serializar o JSON parseado (extensão aditiva, sem nova exportação — acceptance de 2 exports preservado).
- `baseUrl`: `UHHU_API_URL` > `--api` > base salvo no arquivo > default (ordem literal do plano); token: `UHHU_TOKEN` > arquivo.
- Spawn do filho em teste sempre async (`execFile` promisificado): `execFileSync` com servidor `listen` no mesmo worker deadlocka o event loop (filho nunca conecta, ETIMEDOUT). Achado provado com drivers isolados antes de corrigir.
- Comandos nunca chamam `process.exit` (só `uhhu.ts` sai): permite à integração importar as funções direto; `uhhu.ts` não é importado no smoke (o `void run()` do top-level leria o argv do vitest).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `apps/cli/tsconfig.json` + `bin/uhhu.mjs` fora da lista `files_modified`**
- **Found during:** task 1 (scaffold)
- **Issue:** O script `typecheck` exige `tsconfig.json`, e o bin `.ts` não executa sob o shim node do pnpm — sem esses dois arquivos o plano não fecha
- **Fix:** `tsconfig.json` estendendo a base (molde core-api) + wrapper `bin/uhhu.mjs` documentado no cabeçalho como decisão D-66
- **Files modified:** apps/cli/tsconfig.json, apps/cli/bin/uhhu.mjs
- **Verification:** typecheck verde; `--help` exit 0 via pnpm exec
- **Committed in:** 9395ff4 (part of task commit)

**2. [Rule 3 - Blocking] Nome nu `uhhu` não resolve em `pnpm exec` sem wiring da raiz**
- **Found during:** task 1 (verify `exec uhhu --help` → "Command uhhu not found")
- **Issue:** O bin só aparece no `.bin` quando algum pacote depende de `@uhhu/cli`; adicionar devDep na raiz colidiria com o hunk Phase 4 não commitado (proibido tocar)
- **Fix:** Verificado via path (`exec ./bin/uhhu.mjs --help`, exit 0 — mesmo "bin via pnpm, sem build"); documentado como follow-up
- **Files modified:** nenhum (processo)
- **Verification:** `--help` e `lab export --help` exit 0 via path
- **Committed in:** n/a (documentação neste SUMMARY)

**3. [Rule 3 - Blocking] `raw: true` em `apiFetch` para export byte-exato**
- **Found during:** task 2 (export com arquivo)
- **Issue:** Sem modo raw, o formato json seria re-serializado (perde bytes do servidor); só o texto cru preserva o attachment verbatim nos 3 formatos
- **Fix:** Opção aditiva `raw?: boolean` (sem nova função exportada — acceptance de 2 exports intacto)
- **Files modified:** apps/cli/src/client.ts
- **Verification:** teste de export bruto (filename + corpo verbatim); integração salva `corpus-*.json` parseável
- **Committed in:** 2f1be53 (part of task commit)

**4. [Rule 1 - Bug] `parseContentDisposition` aceitaria `..` (path traversal)**
- **Found during:** task 2 (auditoria adversarial pré-commit)
- **Issue:** O regex permitia `.`/`..` após a higienização → `join(outDir, '..')` escaparia do `--out`
- **Fix:** Rejeita `.`/`..`/vazio (retorna undefined → fallback local seguro)
- **Files modified:** apps/cli/src/client.ts
- **Verification:** revisão + suite verde
- **Committed in:** 2f1be53 (part of task commit)

**5. [Rule 1 - Bug] `Authorization: Bearer ` vazio no `auth login`**
- **Found during:** task 2 (auditoria adversarial pré-commit)
- **Issue:** `apiFetch` sempre montava o header, inclusive com token vazio (pré-login)
- **Fix:** Omite o header quando o token está vazio
- **Files modified:** apps/cli/src/client.ts
- **Verification:** login ponta a ponta na integração (7/7)
- **Committed in:** 2f1be53 (part of task commit)

**6. [Rule 1 - Bug] Spawn síncrono deadlockava o filho contra o servidor in-process**
- **Found during:** task 3 (integração CLI-07 ETIMEDOUT, `--help` ok, HITS vazios)
- **Issue:** `execFileSync` bloqueia o event loop do worker; o Fastify no mesmo worker nunca aceita a conexão do filho (porta fechada falhava rápido no OS — por isso só casos com servidor vivo travavam)
- **Fix:** `execFileAsync` (promisificado, loop livre) + timeout 90s; provado antes com drivers isolados (`/tmp/opencode/repro*.mjs`)
- **Files modified:** tests/integration/cli-headless.test.ts
- **Verification:** CLI-07 verde; suite completa 82/82 integração, 134/134 total
- **Committed in:** 5fa7f9c (part of task commit)

**7. [Rule 1 - Bug] 3 expectativas erradas nos testes smoke (implementação correta)**
- **Found during:** task 3 (smoke 3 falhas)
- **Issue:** (a) escrita de arquivo corrompido sem `mkdir`; (b) 202 real sempre tem corpo JSON (o "sem body" do plano não existe no servidor); (c) `parseArgs` consome valor após flag desconhecida — correto, pois só globals são booleanas puras
- **Fix:** Testes ajustados à semântica real (mkdir; 202 com corpo; bool no fim)
- **Files modified:** tests/smoke/cli-unit.test.ts
- **Verification:** smoke 52/52 (4 arquivos)
- **Committed in:** 5fa7f9c (part of task commit)

---

**Total deviations:** 7 auto-fixed (4 bugs, 3 blocking)
**Impact on plan:** Todos necessários para correção/segurança/consistência com os critérios (bin executável, export byte-exato, traversal, teste sem deadlock). Sem scope creep — comandos extras (groups/tags/diverge/pin, corpus, compare, sources) são a "cadeia TOTAL" exigida pelo plano, todos adaptadores finos 1:1 sobre rotas existentes.

## Issues Encountered

- Shell persistente travou 2x com servidores stub em background (pipe herdado): resolvido matando via PID e nunca mais usando `&` (drivers foreground únicos). Sem impacto no código.
- Filtro posicional `pnpm vitest run --project integration -- cli-headless` executou o projeto inteiro (10 arquivos) — mesmo comportamento visto no 05-02; resultado aproveitado como regressão total (82/82).
- Gitleaks não instalado localmente (verificação de segredos fica para o CI `secrets-tree`/`secrets-history`); arquivos do plano contêm só tokens fake (`tok-*`, PATs de teste efêmeros).

## Auditoria adversarial (AGENTS.md — após implementar, antes de cada commit)

- `client.ts` — PAT só no header em memória, nunca em erro/log; `X-Request-Id` por chamada; `Idempotency-Key` só quando dado; filename higienizado anti-traversal; sem `Math.random` (só `randomUUID`); transporte vira exit 1. OK.
- `auth-store.ts` — 600 + chmod explícito + re-stat (lança se falhar); env precede; corrupção→mensagem sem vazar conteúdo; logout apaga (missing=ok); teste prova PAT fora do stdout. OK.
- `commands.ts` — IDs verbatim (IDOR no servidor, 404 idêntico + requestId repassado); `--json` do login omite o `token`; enums locais (decision/format/scope) com mesmo exit 2 do 400 server-side; `failed|cancelled` pós-polling = exit 1; sem shell/exec (sem command injection). Nota não-bloqueante: `--password` na linha de comando aparece no histórico do shell (inerente a CLI v1, mesmo padrão do curl).
- `uhhu.ts` — sem auth própria (correto); prefixo mais longo evita colisão; `UsageError`→2, `CliApiError`→mapa, `CliAuthError`→3, resto→1. OK.
- Testes — HOME/env/fetch com save-restore; wipes incluem `personal_access_tokens`; filho com env sem `*DATABASE*` (assert); servidor em porta efêmera fechado no afterAll; timeouts limitados; skip offline no padrão do repo. OK.

**Achados:** 2 corrigidos (traversal `..`, Bearer vazio). 0 críticos, 0 altos restantes.

## Threat Flags

Superfícies novas além do `<threat_model>` do plano: nenhuma — todos os vetores (PAT em Authorization, `credentials.json` 600, baseUrl arbitrário dev-local, argv→API, IDs com 404 idêntico) estavam previstos em T-05-03-*.

| Mitigação | Status neste plano |
|-----------|-------------------|
| T-05-03-LEAK (600+stat, env precede, PAT nunca em stdout) | Mitigado: statSync 600 em smoke+integração; teste assert stdout sem o PAT; `--json` do login omite `token` |
| T-05-03-SPOOF (baseUrl arbitrário) | Mitigado: default localhost:3000, flag/env explícitos; sem cert pinning v1 (aceito: dev local, documentado) |
| T-05-03-INJECT (argv→API) | Mitigado: repasse verbatim, Zod server-side; filename do servidor higienizado anti-traversal |
| T-05-03-BYPASS (CLI acessando PG) | Mitigado: guard D-55 verde + assert no smoke + filho sem `DATABASE_URL` executando `project list` real |
| T-05-03-IDOR (comandos com ID) | Mitigado: servidor decide (404 idêntico); CLI repassa requestId; exit codes sem vazar existência |

## Known Stubs

Nenhum — grep de `TODO|FIXME|placeholder|coming soon|not available` limpo nos 11 arquivos; todos os comandos delegam a endpoints reais; export salva bytes reais.

## Verification (evidências)

- `pnpm --filter @uhhu/cli run typecheck` — verde (3 tasks + final); `pnpm typecheck` monorepo — verde (raiz + pacotes)
- `pnpm vitest run --project smoke -- cli-unit` — **17/17** (smoke total 52/52 em 4 arquivos)
- `pnpm vitest run --project integration -- cli-headless` — **7/7** (projeto total 82/82 em 10 arquivos)
- `pnpm test` (suite completa) — **14 arquivos, 134 testes, 0 falhas**
- eslint nos 11 arquivos do plano — verde; prettier herdado (sem violações apontadas)
- Gates de acceptance: task1 (bin 1, client 2, store 3, 600-refs 9, table 4, db-imports 0); task2 (comandos 22+14, waitForJob 2, disposition ≥1, idempotency 4+9, any 0); task3 (its 17/8, DATABASE_URL 6, any 0)
- Nenhum commit deste plano inclui deleções nem arquivos Phase 4 (conferido `git diff --diff-filter=D` vazio por commit + stage explícito por arquivo)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pronto para **05-04** (MCP): mesmo PAT (`POST /auth/token` + Bearer), mesmos DTOs/envelope, `lab search run` com polling como referência de semântica para `lab_execute_search`, export com filename do servidor como molde.
- Pronto para **05-05** (prova 3 canais): cadeia CLI ponta a ponta provada contra PG real; script `prova-headless.sh` pode dirigir `uhhu` via `UHHU_TOKEN`+`UHHU_API_URL` sem `DATABASE_URL`.
- **Atenção 05-04/05-05:** (1) wiring do nome nu `uhhu` na raiz (root depender de `@uhhu/cli`) pendente — hoje só via path; (2) 14 extensões transicionais do 05-02 seguem fora do contrato §10 (adendo adiado, sem impacto neste plano); (3) `--password` no argv vaza para histórico do shell (aceitar ou ler de stdin/TTY no futuro).
- Arquivos Phase 4 não commitados seguem intocados no working tree para revisão humana (nenhum foi staged em nenhum commit deste plano — verificado por commit).

## Self-Check: PASSED

- Arquivos criados existem: `apps/cli/src/commands.ts` FOUND; `apps/cli/src/client.ts` FOUND; `tests/integration/cli-headless.test.ts` FOUND (8 its); `apps/cli/bin/uhhu.mjs` FOUND
- Commits existem: `9395ff4` FOUND; `2f1be53` FOUND; `5fa7f9c` FOUND (`git log --oneline`)
- Nenhum commit deste plano inclui deleções nem arquivos Phase 4 (conferido `git diff --diff-filter=D` vazio por commit + `git status` com stage explícito)
- Suite completa 134/134 verde após o último commit de task (rodada antes do SUMMARY; revalidar no CI com os 6 checks)

---
*Phase: 05-prova-headless*
*Completed: 2026-09-11*
