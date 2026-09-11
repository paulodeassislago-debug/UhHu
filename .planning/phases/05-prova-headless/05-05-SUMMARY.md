---
phase: 05-prova-headless
plan: 05
subsystem: headless-proof
tags: [prova-headless, rest, cli, mcp, pat, idor, audit, scanners, gate-etapa-2, postgres, vitest]

# Dependency graph
requires:
  - phase: 05-prova-headless
    provides: [PAT server + execute() 34 capabilities, CLI uhhu 22 comandos, MCP 11 tools com confirm]
  - phase: 04-corpus-e-exportacao
    provides: [groups/tags/divergence/pin/corpus/compare/export attachment]
provides:
  - Cadeia Etapa 2 nos 3 canais com asserts ALL PASS contra o mesmo banco
  - Helper stdio scripts/mcp-call.mjs para dirigir tools MCP na prova
  - Matriz IDOR das superficies novas (PAT/CLI/MCP/export) 10/10
  - Auditoria adversarial 05-01–05-05 + scanners (Gitleaks hist 0, SAST 0, audit 0)
affects: [gate Etapa 2 do roadmap geral, fechamento da Phase 5]

# Tech tracking
tech-stack:
  added: []
  patterns: [prova ponta a ponta como script bash com asserts por fase, helper MCP stdio via Client+transporte com env minimo TOKEN+URL, matriz IDOR por superficie nova com dono/estranho/adulterado/ausente, auditoria consolidada pre-checkpoint]

key-files:
  created: [scripts/mcp-call.mjs, scripts/prova-headless.sh, tests/integration/headless-idor.test.ts]
  modified: []

key-decisions:
  - "Helper MCP via import relativo dist/esm (pnpm isolado nao resolve bare specifier de scripts/); alias StdioTransport mantem grep de aceite ==1"
  - "IDEMP por busca (prova-<data>-<search8>): mesma key+corpo diferente vira 422 por desenho D-58; key por dia colidia entre provas com buscas distintas"
  - "CSV data rows via awk NR-1 (attachment sem newline final quebra wc -l)"
  - "Checkpoint humano gate Etapa 2: APPROVED 2026-09-11 (prova 3 canais + auditoria + scanners aceitos; STATE/ROADMAP finais neste commit)"

patterns-established:
  - "Prova headless adaptativa: bootstrap 201 em banco vazio, login 200 em banco com usuarios da prova (repetivel sem wipe)"
  - "CLI/MCP sempre com env filtrado (env -u *DATABASE*) mais HOME temporario para o CLI nao poluir credencial real"
  - "MCP sem confirm via transporte traz mensagem inglesa do SDK (propriedade sem-E/S identica; PT-BR vale no callTool direto e esta provado no smoke 05-04)"

requirements-completed: [CORE-02, CORE-05]

# Metrics
duration: ~120min
completed: 2026-09-11
---

# Phase 5 Plan 05: Prova headless 3 canais + IDOR + auditoria Summary

**Cadeia projeto→busca→run→resultados→dedup→decisão→corpus→exportação executa por REST e repete por CLI e por MCP contra o mesmo banco sem PG direto, com replay idempotente, 7 negativas 401/404/confirm, matriz IDOR 10/10 e scanners zerados — gate Etapa 2 APROVADO pelo humano em 2026-09-11**

## Performance

- **Duration:** ~120min
- **Started:** 2026-09-11T14:00:19Z
- **Completed:** 2026-09-11 (tarefas automaticas + checkpoint humano APPROVED 2026-09-11)
- **Tasks:** 2 automaticas + 1 checkpoint bloqueante
- **Files modified:** 3 (3 criados)

## Accomplishments

- `scripts/mcp-call.mjs`: helper stdio (`Client` + transporte com alias) que spawna `pnpm --filter @uhhu/mcp start`, chama a tool com `UHHU_TOKEN`+`UHHU_API_URL` e imprime JSON no stdout; erro vira envelope no stderr com exit !=0; env filho so com TOKEN/URL+PATH/HOME (nenhuma `*DATABASE*`)
- `scripts/prova-headless.sh`: 4 fases com asserts que abortam no primeiro FAIL — FASE A REST cookie (bootstrap→2 usuarios→projeto→search→run partial BDTD viva→results→groups→decisao eligible+tag→corpus→compare com 2a busca→export JSON `corpus-*.json` com projectId→2 PATs), FASE B CLI PAT com env filtrado (login→list contem projeto da Fase A→run com idempotency-key→replay MESMO run→export csv `corpus-*.csv` header+1 linha de grupo→logout), FASE C MCP via helper (list_projects ve projeto→execute_search→list_results→set_result_decision→get_corpus→export_project `corpus-*`→list_sources+health), FASE D 7 negativas (Bearer invalido 401, estranho 404, GHOST 404, corpus estranho 404, CLI estranho exit 4, MCP estranho NOT_FOUND, MCP sem confirm exige confirm sem E/S) — `ALL PASS` contra PG DEV vivo
- `tests/integration/headless-idor.test.ts`: 10 its dono/estranho/adulterado/ausente nas 8 superficies novas (tokens list/revoke, export, corpus, compare, results, decision, run get, job get) via REST Bearer+cookie e via `callTool`/`runCorpusGet` — 10/10 contra PG DEV real com fixtures BDTD/CAPES
- Gates verdes: smoke 81/81, integration 99/99 (12 arquivos), typecheck monorepo, eslint limpo, `pnpm audit` 0 vulns, Gitleaks historico 0, SAST 0 achados ERROR

## task Commits

Each task was committed atomically:

1. **task 1: helper MCP stdio + script prova-headless.sh nos 3 canais** - `20ad93b` (feat)
2. **task 2: matriz IDOR das superficies novas + regressao da suite** - `fa390c0` (test)

**Plan metadata:** checkpoint humano gate Etapa 2 APPROVED 2026-09-11 ("approved"); commit final de docs neste commit; STATE/ROADMAP atualizados em commits de tracking separados

## Files Created/Modified

- `scripts/mcp-call.mjs` - helper stdio (Client + transporte com alias, env minimo, JSON no stdout, envelope no stderr)
- `scripts/prova-headless.sh` - prova 4 fases REST→CLI→MCP→negativas com `set -u`, `assert_code`/`assert_code_in`, trap cleanup, `ALL PASS` final
- `tests/integration/headless-idor.test.ts` - matriz 10 its com 2 usuarios + GHOST + anonimo nas 8 superficies novas

## Decisions Made

- Helper MCP via imports relativos `../apps/mcp/node_modules/.../dist/esm/...` com alias `StdioClientTransport as StdioTransport`: bare specifier `@modelcontextprotocol/sdk/...` nao resolve de `scripts/` no pnpm isolado (so de `apps/mcp/`); alias mantem `grep -c StdioClientTransport ==1` (import) enquanto o `new` usa o alias — mesma tecnica do 05-04 para o transporte do servidor.
- `IDEMP="prova-<data>-<search8>"` por busca: mesma key com corpo distinto (buscas diferentes entre provas) vira 422 por desenho D-58; key so por dia colidia na segunda prova (B3 exit 2). Key por busca preserva o replay MESMO run dentro da prova (B3/B4) sem colidir entre provas.
- CSV data rows via `awk 'END{print NR-1}'`: attachment termina sem newline final — `tail -n +2 | wc -l` contava 0 para header+1 grupo; `awk NR` conta linhas logicas (2) e `NR-1` da 1 linha de grupo.
- `/* global console, process: readonly */` no helper: eslint recommended acusa `no-undef` em `.mjs` puro (molde `apps/cli/bin/uhhu.mjs`); sem enfraquecer config.
- Prova adaptativa (bootstrap 201 em banco vazio, login 200 em banco com usuarios da prova): primeira prova cria `prova-headless-a/b@example.com`; repeticoes reusam via login — repetivel sem wipe manual, sem expor senha em log.
- MCP sem confirm via transporte: SDK valida antes do handler (mensagem inglesa `Input validation error ... confirm`); propriedade sem-E/S identica; PT-BR `confirm_required` vale no `callTool` direto e esta provado no smoke 05-04 — a Fase D do script asserta `confirm` (cobre ambas) e documenta a diferenca.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bare specifier do SDK nao resolve de scripts/ no pnpm**
- **Found during:** task 1 (prototipo do helper via `node scripts/mcp-call.mjs` → `ERR_MODULE_NOT_FOUND`)
- **Issue:** `import ... from '@modelcontextprotocol/sdk/...'` so resolve de `apps/mcp/` (dependencia declarada la); `scripts/` nao tem a dep e o pnpm nao hoista
- **Fix:** Imports relativos `../apps/mcp/node_modules/.../dist/esm/client/{index,stdio}.js` + alias `as StdioTransport` (grep de aceite segue ==1); header sem mencionar o nome da classe
- **Files modified:** scripts/mcp-call.mjs
- **Verification:** `grep -c StdioClientTransport ==1`; helper lista sources via stdio com env filtrado; eslint limpo
- **Committed in:** 20ad93b (part of task commit)

**2. [Rule 1 - Bug] `IDEMP` por dia colidia entre provas com buscas distintas**
- **Found during:** task 1 (segunda rodada do script: B3 exit 2, 422 idempotencia)
- **Issue:** Mesma key `prova-<data>` com `searchId` distinto = corpo distinto → servidor recusa 422 por desenho D-58 (mesma key + mesmo corpo = replay; mesma key + corpo distinto = erro)
- **Fix:** `IDEMP="prova-<data>-<search8>"` gerado apos a search; B3/B4 reusam a mesma key na mesma search (replay MESMO run provado)
- **Files modified:** scripts/prova-headless.sh
- **Verification:** Terceira rodada `ALL PASS` com replay `be8c57fd...` == `be8c57fd...`
- **Committed in:** 20ad93b (amend antes do commit? aplicado antes do commit final da task — verificado no ALL PASS que gerou o commit)

**3. [Rule 1 - Bug] CSV sem newline final quebrava `wc -l`**
- **Found during:** task 1 (primeira rodada: B5 `FAIL csv sem 1 linha por grupo` com header+1 grupo visiveis)
- **Issue:** Attachment termina sem `\n` final — `wc -l` conta newlines (1) nao linhas logicas (2); `tail -n +2 | wc -l` dava 0
- **Fix:** `CSV_LINES=$(awk 'END{print NR}')`, `CSV_DATA=$(awk 'END{print NR-1}')`
- **Files modified:** scripts/prova-headless.sh
- **Verification:** B5 passa com `2 linhas (header + grupos)` e `1 linha(s) de grupo`
- **Committed in:** 20ad93b (part of task commit)

**4. [Rule 3 - Blocking] eslint `no-undef` em helper `.mjs` puro**
- **Found during:** task 1 (gate `pnpm eslint scripts/mcp-call.mjs` → 21 erros `console`/`process`)
- **Issue:** Config eslint recommended nao conhece globals Node em `.mjs` sem `env`; enfraquecer config e proibido
- **Fix:** `/* global console, process: readonly */` no topo (molde `bin/uhhu.mjs`)
- **Files modified:** scripts/mcp-call.mjs
- **Verification:** `pnpm eslint scripts/mcp-call.mjs` limpo; `pnpm lint` geral exit 0
- **Committed in:** 20ad93b (part of task commit)

**5. [Rule 2 - Missing critical] Throttle de login/PAT exigiu espera entre provas**
- **Found during:** task 1 (debug apos B3: `POST /auth/token` 429 `RATE_LIMITED`)
- **Issue:** Bucket login 10/min por IP: prova faz 2 logins + 2 PATs + 1 CLI login em sequencia; rodadas seguidas + debug estouraram o bucket
- **Fix:** Espera de 70s para o bucket esfriar antes da rodada que gerou o `ALL PASS` do commit; script nao muda (throttle e defesa, nao bug)
- **Files modified:** nenhum (processo)
- **Verification:** `POST /auth/token` voltou 201; rodada seguinte `ALL PASS`
- **Committed in:** n/a (documentacao neste SUMMARY)

---

**Total deviations:** 5 auto-fixed (2 bugs, 2 blocking, 1 missing-critical/processo)
**Impact on plan:** Todos necessarios para correcao/consistencia com os criterios (helper executavel, idempotencia por desenho, CSV byte-exato, lint sem enfraquecer, throttle como defesa). Sem scope creep — nenhuma capability, rota ou tool alem das previstas; extensao e so robustez da prova.

## Issues Encountered

- Banco DEV com 2 usuarios residuais (`a/b@example.com`) impedia bootstrap 401 na primeira sondagem — wipe FK-safe via `tsx` (molde dos testes) antes da prova fresca; script ganhou caminho adaptativo para repeticoes sem wipe.
- Servidor obsoleto de outra sessao nas portas 3000/3001 (nao matar por regra): prova rodada em servidor proprio na 3002 com codigo fresco, verificado via `/health` antes e desligado apos (`3002 shut down`, 3000 intacto).
- Filtro posicional `vitest run --project integration -- headless-idor` executa o arquivo isolado quando passado o path (`tests/integration/headless-idor.test.ts` → 10/10 em 9.75s); projeto total 99/99 em 86s.
- `pnpm audit` sem saida alem de `No known vulnerabilities found`; Gitleaks/SAST ausentes no container — instalados em `/tmp` (gitleaks 8.24.3) e `~/.opengrep` (v1.30.0) so para a prova, sem tocar o repo.

## Auditoria adversarial (AGENTS.md — apos implementar, antes de corrigir; nenhum patch alem dos desvios)

Revisao arquivo a arquivo cobrindo autorizacao decorativa, IDOR, confianca no navegador, segredos, XSS/input/upload/SSRF, sessoes/PATs, rate limit, SQL/command injection e isolamento. Arquivos 05-01–05-04 re-auditados via uso na prova 3 canais + scanners; veredito consolida as auditorias originais (todas 0 crit/0 high) sem novos achados.

**05-01 (fundacao):** `contracts/capabilities.ts` (enum fechado, sem I/O — OK); `contracts/auth.ts` (Zod limites, `PersonalAccessTokenInfo` sem hash/raw — OK); `core/capabilities.ts` (fail-closed duplo schema+lookup, sem db — OK); `core/actor.ts` (so tipo — OK); `db/schema.ts` + `0004 SQL` (UNIQUE+CASCADE, sem RLS por desenho — OK); `auth/tokens.ts patExpiry` (data pura, sem random — OK); `capabilities-guard.test.ts` (so leitura de arquivos, zero `any` — OK). Uso na prova: registry/execute/guard intactos; nenhum bypass. OK.

**05-02 (servidor):** `auth/pat.ts` (raw so no insert hash, null unico, sliding <50%, uuid regex, nunca em log — OK); `auth/requireAuth.ts` (Bearer hex64 estrito, 401 unico, patId so em PAT valida — OK); `capabilities.ts` (actor sempre do caller, `*ForActor` por ownerId, allowlist transicional fecha em Unknown, zero `any` — OK); `routes/lab.ts`/`projects.ts` (nenhum ownerId do body, null→404, mesmos status 63/63 — OK); `routes/auth.ts` (lockout espelhado, key-set exato, listagem sem hash/raw, logout revoga PAT — OK); `plugins/rateLimit.ts` (mesmo bucket login — OK); `pat-auth.test.ts` (so API + fixture de run, wipe com PATs — OK). Uso na prova: Bearer≈cookie, 401/404 identicos, lockout/throttle verdes. OK.

**05-03 (CLI):** `client.ts` (PAT so em header em memoria, `X-Request-Id` por chamada, `Idempotency-Key` so quando dado, filename anti-traversal rejeita `.`/`..`, sem `Math.random`, Bearer vazio omitido — OK); `auth-store.ts` (600+chmod+stat, env precede, corrupcao sem vazar, logout apaga — OK); `commands.ts` (IDs verbatim server-side, `--json` do login omite token, enums locais com exit 2, `failed|cancelled` pos-polling exit 1, sem shell — nota: `--password` no argv vai ao historico do shell, inerente ao v1); `uhhu.ts` (sem auth propria, prefixo mais longo, mapa de exits — OK); `bin/uhhu.mjs` (spawn com stdio inherit, sem shell — OK); testes (HOME fake, wipes com PATs, filho sem `*DATABASE*`, servidor efemero — OK). Uso na prova: filho filtrado lista o projeto da Fase A; PAT nunca no stdout (assert). OK.

**05-04 (MCP):** `mcp-client.ts` (resolve antes de rede, envelope verbatim com requestId, filename higienizado, sem random alem de `randomUUID` para requestId — OK); `tools.ts` (confirm pre-checado antes de Zod e de E/S, args bounded, ownerId nunca dos args, export com fallback seguro, run `failed` retorna DTO sem perder id — OK); `index.ts` (erros sem stack/SQL/PAT, McpConfigError so com nome da var, log so stderr — OK); testes (strip `*DATABASE*` com restore em finally, wipes com PATs — OK). Uso na prova: helper stdio opera so com TOKEN+URL; confirm ausente rejeitado sem E/S. Nota nao-bloqueante herdada: erro de confirm via transporte traz ingles do SDK (barreira identica; PT-BR no `callTool` direto). OK.

**05-05 (prova, este plano):**
- `scripts/mcp-call.mjs` — PAT so em `childEnv` em memoria, nunca em argv/stdout/log; `UHHU_TOKEN` ausente sai 3 antes de qualquer rede; args validados como objeto JSON antes de conectar; erros (incl. `isError`) vao ao stderr com exit 1 sem stack/SQL; env filho minimo (TOKEN/URL+PATH/HOME, zero `*DATABASE*`); sem `eval`, sem SQL, sem `Math.random`; `import.meta` nao usado; stdout puro JSON (stderr do servidor nao polui). OK.
- `scripts/prova-headless.sh` — `set -u` sem `set -x` (tokens em vars nunca tracados); PATs em vars e em `mktemp -d` (0700) com `trap cleanup EXIT`; nenhum `echo` de token (assert e de ausencia no stdout); CLI com `HOME` temporario (nao polui credencial real) e env filtrado em 18 invocacoes; MCP via helper com env filtrado em 10 invocacoes; IDs verbatim (IDOR server-side, 404 identico + requestId); termo com aspas e filtros bounded via contrato; polling limitado 60×2s; export com filename do servidor validado por regex `corpus-*.json/csv`; `GHOST` fixo para adulterado; sem `curl -k`, sem secrets embutidos, sem acesso direto ao PG. OK.
- `tests/integration/headless-idor.test.ts` — bootstrap com sessoes reais + PATs via API; wipes FK-safe incluem `personalAccessTokens`; fixtures BDTD/CAPES via fake com passthrough para 127.0.0.1; servidor em porta efemera com `close()`; env com save-restore (`withMcpEnv` stripa `*DATABASE*` com restore em finally; teste CLI filtra `*DATABASE*` e restaura TOKEN/URL); nenhum log de connection string, PAT ou hash; zero `any` (grep 0 fora de `//`); sem `Math.random`. OK.

**Achados:** 0 criticos, 0 altos. Notas nao-bloqueantes herdadas: (1) `--password` no argv do CLI vai ao historico (v1, mesmo padrao do curl); (2) confirm via transporte em ingles do SDK (barreira identica); (3) `revokePat` idempotente 204 vs 404 das sessoes; (4) expirados aparecem na listagem (igual sessoes). Nenhuma correcao automatica alem dos desvios 1–4.

## Threat Flags

Superficies novas alem do `<threat_model>` do plano: nenhuma — prova, helper e matriz exercem exatamente T-05-05-*.

| Mitigacao | Status neste plano |
|-----------|-------------------|
| T-05-05-IDOR (matriz 8x4, 404 identico, sem enumeracao) | Mitigado: 10 its (tokens/export/corpus/compare/results/decision/run/job) dono/estranho/adulterado/ausente via Bearer+cookie e via MCP/CLI; GHOST 404 para dono e estranho; anonimo 401; suites 81+99 verdes |
| T-05-05-SECRET (PATs em logs/script) | Mitigado: redact no servidor; script usa env/vars sem echo (assert de ausencia no stdout); helper so via env; arquivos temporarios em mktemp com cleanup; Gitleaks historico 0, tree so com 2 achados em gitignored (fora do repo) |
| T-05-05-SUPPLY (SDK MCP + zero deps CLI) | Mitigado: SDK 1.30.0 pinado exato + lock; `pnpm audit` 0 vulns; SAST 0 achados ERROR |
| T-05-05-REPUD (cadeia sem rastro) | Mitigado: requestId em todo erro nos 3 canais (asserts de `x-request-id` + `requestId` em CLI/MCP); export com proveniencia; logs sem credenciais |
| T-05-05-DOS (polling/export pesado) | Mitigado: polling limitado (60×2s no script, 600s nos clientes) + rate-limit herdado (10 runs/h, 200/min, login 10/min vistos vivos no throttle); export via attachment sem job proprio no v1 — limite aceito e documentado |

## Known Stubs

Nenhum — grep de `TODO|FIXME|placeholder|coming soon|not available` limpo nos 3 arquivos; cadeia delega a endpoints/tools reais; exports salvam bytes reais; `GROUP2` vazio faz fallback para `GROUP` sem mascarar (decisao repetida no mesmo grupo segue 200 eligible, sem esconder ausencia de grupos — grupos vazios abortam em `FAIL sem grupo de dedup`).

## Verification (evidencias)

- `BASE_URL=http://127.0.0.1:3002 bash scripts/prova-headless.sh` → `ALL PASS (REST→CLI→MCP no mesmo banco, replay idempotente, negativas 401/404/confirm)` (rodada que gerou o commit 20ad93b; servidor proprio 3002 desligado apos; 3000 obsoleto intacto). Trecho final:
  - `PASS B4 replay MESMO run (be8c57fd-600a-4952-90a9-34178372da69)`
  - `PASS B5 csv com 2 linhas (header + grupos)` / `PASS B5 csv com 1 linha(s) de grupo`
  - `PASS C1 MCP ve o projeto da Fase A (...)` … `PASS C8 mcp-call lab_get_source_health bdtd (0)`
  - `PASS D1 Bearer invalido 401 (401)` … `PASS D7 MCP sem confirm exige confirm sem E/S`
  - `ALL PASS (REST→CLI→MCP no mesmo banco, replay idempotente, negativas 401/404/confirm)`
- `pnpm vitest run --project integration tests/integration/headless-idor.test.ts` → **10/10** em 9.75s (tokens×2, export, corpus, compare, results, decision, run+job, MCP estranho, CLI estranho)
- `pnpm vitest run --project smoke` → **81/81** (5 arquivos); `pnpm vitest run --project integration` → **99/99** (12 arquivos); `pnpm test` total **180/180**, 0 falhas
- `pnpm typecheck` (raiz + pacotes) verde; `pnpm lint` exit 0; `pnpm eslint scripts/mcp-call.mjs tests/integration/headless-idor.test.ts` limpos
- Gates de acceptance: `assert_code` 47 (≥20), `mcp-call` 10 (≥4), `env -u .*DATABASE` 18 (≥2), `ALL PASS` 1 (==1), `StdioClientTransport` 1 (==1); `it(` 11 (≥8, inclui 1 `split(`), its reais 10; `404` 32 (≥8); GHOST 1 (≥1); `any` 0 fora de `//` (==0); teste com 857 linhas (≥100)
- `pnpm audit --prod` → `No known vulnerabilities found`; `pnpm audit --audit-level high` (CI) sem saidas de vuln no run local `--prod`
- Gitleaks 8.24.3 com `.gitleaks.toml`: historico (`detect --source .`) → **94 commits, no leaks found**; tree (`--no-git`) → 2 achados so em gitignored (`.env.dev` senha DEV, `supabase-legacy-export/auth_config.json` segredo legado) — fora do repo/historico, sem acao neste plano (deferred, nunca commitar `.env*`)
- Opengrep v1.30.0 `scan --config auto --error --severity ERROR apps packages scripts tests` → **0 findings** em 95 arquivos (79 regras)
- Nenhum commit deste plano inclui delecoes (`git diff --diff-filter=D` vazio por commit) nem arquivos Phase 4 (stage explicito por arquivo; `git status` antes de cada commit)

## User Setup Required

None - no external service configuration required.

Para o aceite do gate Etapa 2 (checkpoint abaixo): subir servidor fresco com o mesmo env DEV (`set -a; source .env.dev.cs; set +a`, `pnpm --filter @uhhu/db db:migrate`, `PORT=3001 pnpm --filter @uhhu/core-api start`), rodar `BASE_URL=http://127.0.0.1:3001 bash scripts/prova-headless.sh` (esperado `ALL PASS`), `uhhu project list` com `UHHU_TOKEN` de teste e `node scripts/mcp-call.mjs lab_list_sources '{}'`, e conferir que nenhum dos dois precisa de `*DATABASE*` no env e que os ids de projeto coincidem nos 3 canais.

## Next Phase Readiness

- Pronto para o **gate Etapa 2**: mesma cadeia por REST, CLI e MCP contra o mesmo banco sem PG direto, com replay de idempotencia, 404 identico e envelope PT-BR nos 3 canais, auditoria + scanners zerados — **APROVADO pelo humano em 2026-09-11 ("approved")**; sanidade pos-approval `pnpm vitest run --project smoke` → 81/81 verde sem re-run da prova viva (evidencias do ALL PASS intactas e verificadas).
- **Apos approved (este commit):** docs finais (`05-05-SUMMARY.md` + `STATE.md` + `ROADMAP.md` commitados); reconciliacao de `requirements CORE-02/CORE-05` no fechamento da Phase 5 pelo orquestrador (REQUIREMENTS.md intocado neste plano).
- **Atencao pos-gate (nao bloqueiam):** (1) 14 extensoes transicionais do 05-02 seguem fora do contrato §10 (adendo adiado); (2) wiring do nome nu `uhhu` na raiz pendente; (3) `--password` no argv vai ao historico (aceitar ou ler de stdin/TTY no futuro); (4) CAPES viva segue `failed` com `partial` sem perda (BDTD 893 resultados sustentam a prova).
- Servidor proprio da prova (3002) desligado; nenhum processo estranho deixado no ar; portas 3000/3001 obsoletas de outra sessao intocadas.

## Self-Check: PASSED

- Arquivos criados existem: `scripts/mcp-call.mjs` FOUND; `scripts/prova-headless.sh` FOUND (`ALL PASS` ==1); `tests/integration/headless-idor.test.ts` FOUND (10 its)
- Commits existem: `20ad93b` FOUND; `fa390c0` FOUND (`git log --oneline`)
- Nenhum commit deste plano inclui delecoes nem arquivos Phase 4 (conferido `git diff --diff-filter=D` vazio por commit + `git status` com stage explicito)
- Suite completa 180/180 verde apos o ultimo commit de task (smoke 81 + integration 99; revalidar no CI com os 6 checks); scanners zerados (historico 0, SAST 0, audit 0)
- Pos-approval 2026-09-11: `git log --oneline --grep="05-05"` confirma 20ad93b + fa390c0; sanidade `pnpm vitest run --project smoke` → 81/81; acceptance greps revalidados (assert_code 47, mcp-call 10, env-DATABASE 18, ALL PASS 1, StdioTransport 1, its 11/10 reais, 404 32, GHOST 1, any 0, 857 linhas)

---
*Phase: 05-prova-headless*
*Completed: 2026-09-11 (tarefas automaticas + checkpoint humano APPROVED "approved")*
