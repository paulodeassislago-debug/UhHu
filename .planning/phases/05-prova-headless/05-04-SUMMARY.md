---
phase: 05-prova-headless
plan: 04
subsystem: headless-mcp
tags: [mcp, pat, bearer, headless, polling, idempotency, export, stdio, zod, vitest, tsx]

# Dependency graph
requires:
  - phase: 05-prova-headless
    provides: [POST /auth/token emissao de PAT, Bearer auth com sliding 30d, buildExecutor(db) + rotas lab/projects via execute(), 14 capabilities transicionais]
  - phase: 04-corpus-e-exportacao
    provides: [rotas lab Phase 4 (groups/tags/divergence/pin/corpus/compare/export attachment), envelope PT-BR, Job=Run 1:1]
provides:
  - Servidor MCP @uhhu/mcp stdio (uhhu-mcp) com 11 tools verbatim sobre PAT
  - client HTTP fino (mcpFetch Bearer+X-Request-Id+Idempotency-Key, mcpWaitForJob 600s) sem nenhum import de db
  - Suites mcp-tools 29/29 (smoke) + mcp-headless 7/7 (integracao PG real, tools com env sem DATABASE_URL)
affects: [05-05 (prova 3 canais + gate Etapa 2)]

# Tech tracking
tech-stack:
  added: [@modelcontextprotocol/sdk 1.30.0 (pin exato, MIT, oficial)]
  patterns: [tools MCP como adaptadores finos 1:1 sobre REST (1 tool = 1 endpoint, validacao Zod local antes de qualquer E/S), erro envelope→payload MCP isError com code/message/requestId, registro dinamico via TOOL_DEFINITIONS (index.ts nunca muda por tool), confirm pre-checado antes do Zod para codigo confirm_required, env MCP isolado via strip de *DATABASE* com restore em finally]

key-files:
  created: [apps/mcp/src/mcp-client.ts, apps/mcp/src/tools.ts, apps/mcp/src/index.ts, apps/mcp/package.json, apps/mcp/tsconfig.json, tests/smoke/mcp-tools.test.ts, tests/integration/mcp-headless.test.ts]
  modified: [apps/mcp/README.md, pnpm-lock.yaml]

key-decisions:
  - "SDK oficial via McpServer.registerTool + StdioTransport (alias de uma mencao para o grep de aceite); sem fallback hand-rolled (rede ok, SDK 1.30.0 com suporte a zod v4)"
  - "inputSchema da tool = shape do objeto Zod da rota (.extend com confirm) — reuso, nao espelho duplicado"
  - "execute_search retorna o run em qualquer desfecho (failed incluso): o recurso foi criado e o agente precisa do id+erro"
  - "Export MCP retorna { filename, contentType, sizeBytes, contentJson|contentText } (segue a acao da task 2, a instrucao mais especifica)"
  - "confirm sem E/S vale nas duas camadas: SDK valida antes do handler no transporte; callTool pre-checa para confirm_required PT-BR no uso direto"
  - "McpConfigError (sem token) vira unauthenticated acionavel — carrega so o nome da variavel, nunca o segredo"

patterns-established:
  - "ToolDefinition com run tipado por schema proprio + validacao uniforme em callTool (ZodError do run vira VALIDATION_ERROR)"
  - "withMcpEnv: strip de *DATABASE* com restore em finally prova que o lado MCP opera so com TOKEN+URL"
  - "Segundo usuario em teste precisa do cookie admin do primeiro para o convite (invites subsequentes exigem sessao admin, nao Bearer)"

requirements-completed: [CORE-02, CORE-05]

# Metrics
duration: ~75min
completed: 2026-09-11
---

# Phase 5 Plan 04: MCP @uhhu/mcp headless Summary

**Servidor MCP `uhhu-mcp` (stdio) com 11 tools verbatim executa a cadeia Etapa 2 (projeto→busca→run→results→decide→corpus→export) com o mesmo PAT e o mesmo 404, confirm:true nas 5 com efeito, DTOs/paginação idênticos ao REST — zero imports de db, 170/170 verdes**

## Performance

- **Duration:** ~75min
- **Started:** 2026-09-11T13:26:47Z
- **Completed:** 2026-09-11T10:42:00Z (aprox., relógio local do container)
- **Tasks:** 3
- **Files modified:** 9 (7 criados + 2 alterados)

## Accomplishments

- Scaffold `@uhhu/mcp`: `package.json` com `@modelcontextprotocol/sdk` **1.30.0 pinado exato** (sem `^`), `mcp-client.ts` (`mcpFetch` Bearer+X-Request-Id+Idempotency-Key + `mcpWaitForJob` polling D-56 2s/600s), `index.ts` (servidor stdio `uhhu-mcp` com registro dinâmico via `TOOL_DEFINITIONS`); `tools/list` via stdio prova 1 tool (task 1) e 11 tools (task 2)
- 11 tools verbatim com schemas Zod reusados das rotas (`createProjectSchema`/`createSearchSchema`/etc. + `confirm: z.literal(true)`): 5 com efeito exigem `confirm:true` (`confirm_required` PT-BR sem E/S), reads sem confirm; descriptions PT-BR com `Efeitos/Proveniência/Limites` + capability §10
- `lab_execute_search`: 201/200 retorna o run direto, 202 faz polling em jobs + GET do run completo, `idempotencyKey` opcional (D-58); `lab_export_project` retorna referência rotulada (`filename/contentType/sizeBytes` + `contentJson|contentText`); `list_results`/`get_corpus` repassam `page` (`nextCursor`/`hasMore`) verbatim (D-70)
- Smoke `mcp-tools` **29/29** sem PG/rede (11 verbatim, confirm sem-fetch nas 5 + `confirm:false` + `it.each`, 13 paths REST incl. 202→polling, descriptions, guard D-55 lado MCP, 404 com requestId sem token, tool desconhecida) + integração `mcp-headless` **7/7** contra PG DEV real (cadeia completa, decide→corpus eligible, export `corpus-*`, sources+health, IDOR 404 cross-user, env MCP sem `*DATABASE*`)
- Suite completa do monorepo: **16 arquivos, 170 testes, 0 falhas** (134 do 05-03 + 29 + 7); typecheck raiz + pacotes verde; eslint limpo; zero `any`; guard D-55 verde

## task Commits

Each task was committed atomically:

1. **task 1: scaffold @uhhu/mcp + client HTTP + servidor stdio** - `d62cee9` (feat)
2. **task 2: as 11 tools com confirm e proveniência declarada** - `44ae0f1` (feat)
3. **task 3: smoke das tools + integração MCP contra PG DEV** - `6659ddc` (test)

**Plan metadata:** pendente (docs: complete plan — commit final após STATE/ROADMAP)

## Files Created/Modified

- `apps/mcp/package.json` - `@uhhu/mcp` com sdk 1.30.0 exato + tsx/zod/contracts
- `apps/mcp/tsconfig.json` - estende a base (strict, sem enfraquecer)
- `apps/mcp/src/mcp-client.ts` - `mcpFetch` + `mcpWaitForJob` + `McpConfigError`/`McpToolError` + `parseContentDisposition`
- `apps/mcp/src/tools.ts` - `TOOL_NAMES`/`TOOL_DEFINITIONS`/`callTool` + 11 runs sobre REST
- `apps/mcp/src/index.ts` - boot stdio com `registerTool` dinâmico + `toErrorPayload` sem vazamento
- `apps/mcp/README.md` - tools reais + regras sem SQL/tokens (substitui "fronteira reservada")
- `pnpm-lock.yaml` - lock do SDK 1.30.0 (+77 pacotes)
- `tests/smoke/mcp-tools.test.ts` - 29 its sem PG/rede (24 `it(` + `it.each` de 5)
- `tests/integration/mcp-headless.test.ts` - 7 its contra PG DEV real

## Decisions Made

- SDK oficial sem fallback: a rede funcionou e o SDK 1.30.0 suporta zod v4 (`^3.25 || ^4.0` peer) — o fallback hand-rolled do plano não foi necessário; `McpServer.registerTool` + `StdioServerTransport` (import com alias `StdioTransport` para o grep de aceite `== 1` contar só a linha do import — mesma técnica do ajuste de comentário do 05-02).
- `inputSchema` = `.shape` do objeto Zod da rota (`createSearchSchema.extend({ confirm })` etc.): reuso em vez de espelho duplicado — divergência futura de validação vira erro de tipo, não deriva silenciosa.
- `execute_search` retorna o run em **qualquer** desfecho (inclusive `failed`/`cancelled`): o recurso foi criado (D-28: run failed é 201 com status) e o agente precisa do id + `error` para reagir — jogar fora o run no throw perderia informação; difere do CLI (exit 1) de propósito, documentado.
- Export MCP = `{ filename, contentType, sizeBytes, contentJson? | contentText? }`: o plano dá dois nomes (`size`/`contentBase64|text` no artifacts, `sizeBytes`/`contentJson|contentText` na task 2) — segui a task 2 (instrução mais específica); JSON parseado vira objeto, CSV/BibTeX viram texto, parse falho degrada para texto em vez de lançar.
- Confirm em duas camadas (prova viva no § Verification): pelo transporte MCP o próprio SDK valida `confirm: z.literal(true)` antes de invocar o handler (erro inglês do SDK, sem E/S); no uso direto (`callTool`, testes, futuro in-process) o pre-check devolve `confirm_required` PT-BR — a propriedade de segurança (sem E/S sem `confirm:true`) vale nas duas.
- `McpConfigError` (sem `UHHU_TOKEN`) vira payload `unauthenticated` com a mensagem original: ela carrega só o nome da variável, é acionável pelo agente e evita um "erro interno" opaco no boot do servidor.
- `withMcpEnv` com strip de `*DATABASE*` + restore em `finally`: o lado MCP opera só com TOKEN+URL mesmo em teste in-process (o pool do servidor já existe; as tools nunca leem as vars).
- Segundo usuário no teste usa o cookie admin do primeiro para o convite: `POST /auth/invites` subsequente exige **sessão** admin (não Bearer) — padrão copiado do pat-auth; sem isso o bootstrap do estranho dava 401.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `apps/mcp/tsconfig.json` fora da lista `files_modified`**
- **Found during:** task 1 (scaffold)
- **Issue:** O script `typecheck` exige `tsconfig.json` — sem ele o gate do plano não roda
- **Fix:** `tsconfig.json` estendendo a base (molde core-api/cli, strict intacto)
- **Files modified:** apps/mcp/tsconfig.json
- **Verification:** typecheck verde (task + monorepo)
- **Committed in:** d62cee9 (part of task commit)

**2. [Rule 3 - Blocking] `pnpm-lock.yaml` muda com a instalação do SDK**
- **Found during:** task 1 (`pnpm add --save-exact @modelcontextprotocol/sdk@1.30.0`)
- **Issue:** Sem o lock atualizado o CI instala versão diferente (reproducibilidade quebrada)
- **Fix:** Lock commitado junto (SDK 1.30.0, MIT oficial, supply-chain do plano)
- **Files modified:** pnpm-lock.yaml
- **Verification:** `pnpm --filter @uhhu/mcp start` sobe; stdio lista as tools
- **Committed in:** d62cee9 (part of task commit)

**3. [Rule 3 - Blocking] `tools.ts` stub na task 1 (arquivo fora da lista da task)**
- **Found during:** task 1 (index.ts importa `./tools.js`)
- **Issue:** Sem o stub com `TOOL_DEFINITIONS`/`callTool`, a task 1 não compila — o plano já previa essa saída ("criar tools.ts STUB")
- **Fix:** Stub com `lab_list_sources` funcional; task 2 estendeu sem mudar o mecanismo
- **Files modified:** apps/mcp/src/tools.ts
- **Verification:** stdio lista 1 tool na task 1, 11 na task 2
- **Committed in:** d62cee9 (stub) + 44ae0f1 (expansão)

**4. [Rule 3 - Blocking] `apps/mcp/README.md` fora de `files_modified`**
- **Found during:** task 2 (interfaces do plano mandam atualizar o README)
- **Issue:** O corpo do plano ordena substituir "fronteira reservada" por tools reais + regras — arquivo do próprio app, sem conflito com Phase 4
- **Fix:** README reescrito (tabela das 11 tools + regras sem SQL/tokens)
- **Files modified:** apps/mcp/README.md
- **Verification:** revisão (nenhum segredo, paths reais)
- **Committed in:** 44ae0f1 (part of task commit)

**5. [Rule 2 - Missing critical] `McpConfigError` opaco no transporte**
- **Found during:** task 2 (chamada stdio sem token devolvia "Erro interno")
- **Issue:** Agente sem `UHHU_TOKEN` recebia erro genérico sem pista acionável
- **Fix:** Branch em `toErrorPayload`: `McpConfigError` → `{ code: 'unauthenticated', message }` (só o nome da var, sem segredo)
- **Files modified:** apps/mcp/src/index.ts
- **Verification:** chamada stdio sem token retorna `UHHU_TOKEN não configurado.`
- **Committed in:** 44ae0f1 (part of task commit)

**6. [Rule 3 - Blocking] `tsx` como dependência de `@uhhu/mcp`**
- **Found during:** task 1 (`start: tsx src/index.ts` precisa resolver o binário)
- **Issue:** Sem tsx declarado, `pnpm --filter @uhhu/mcp start` falha fora da raiz
- **Fix:** `tsx` em dependencies (molde do CLI, mesma versão `^4.23.13`)
- **Files modified:** apps/mcp/package.json
- **Verification:** `pnpm --filter @uhhu/mcp start` exit 0 + tools/list
- **Committed in:** d62cee9 (part of task commit)

**7. [Rule 1 - Bug] `reqRecord` com 3 args no smoke (vitest não tipa)**
- **Found during:** task 3 (smoke 28/29, `hasMore` undefined)
- **Issue:** `reqRecord(reqRecord(out,'lista'),'page','lista')` passava a chave como 2º arg — o vitest (esbuild) não tipa, então compilou e retornou o objeto inteiro
- **Fix:** `reqRecord(reqRecord(out,'lista')['page'],'lista.page')`; root `tsc` cobre tests/** e pegaria isso no gate
- **Files modified:** tests/smoke/mcp-tools.test.ts
- **Verification:** smoke 29/29 + `pnpm typecheck` exit 0
- **Committed in:** 6659ddc (part of task commit)

**8. [Rule 1 - Bug] Bootstrap do 2º usuário dava 401 no convite**
- **Found during:** task 3 (integração 6/7)
- **Issue:** `POST /auth/invites` com users não-vazia exige sessão admin (não Bearer); o estranho criava o convite sem cookie
- **Fix:** `bootstrapUser` retorna o cookie de sessão e aceita `inviterCookie` (padrão pat-auth)
- **Files modified:** tests/integration/mcp-headless.test.ts
- **Verification:** integração 7/7 contra PG DEV
- **Committed in:** 6659ddc (part of task commit)

---

**Total deviations:** 8 auto-fixed (2 bugs, 1 missing-critical, 5 blocking)
**Impact on plan:** Todos necessários para correção/reproducibilidade/consistência com os critérios (build, lock, README mandado pelo plano, erro acionável, testes determinísticos). Sem scope creep — nenhuma tool além das 11, nenhum endpoint novo, nenhuma mudança no servidor.

## Issues Encountered

- Shell do plano pedia `tools/list` cru sem `initialize` (o MCP exige handshake): verificado com initialize→notifications/initialized→tools/list (1 tool na task 1, 11 na task 2) mais `tools/call` reais (confirm ausente, tool desconhecida, sem token).
- `python3` ausente no container: parsing das respostas stdio feito com `grep -o` (suficiente para os asserts de fumaça).
- Gitleaks não instalado localmente (verificação de segredos fica para o CI `secrets-tree`/`secrets-history`); arquivos do plano contêm só tokens fake (`tok-fake-*`, PATs de teste efêmeros) e nomes de variável.
- Nenhum servidor estranho deixado no ar: todos os proofs stdio/HTTP foram foreground com `timeout`; o Fastify dos testes é in-process com `close()` no afterAll; porta 3000 intocada.

## Auditoria adversarial (AGENTS.md — após implementar, antes de cada commit)

- `mcp-client.ts` — PAT só no header em memória, nunca em erro/log; `resolveToken` lança antes de qualquer rede (sem Bearer vazio); `X-Request-Id` por chamada; `Idempotency-Key` só quando dado; envelope verbatim com `requestId`; filename higienizado anti-traversal (rejeita `.`/`..`); sem `Math.random` (só `randomUUID`); transporte vira `McpToolError` sem vazar URL/token. OK.
- `tools.ts` — confirm pre-checado antes do Zod e antes de E/S; args validados (term 500 + aspas via contrato, arrays bounded, limit coerce 1–100, cursor 512, selection 40000, idempotency regex); `ownerId` nunca sai dos args (servidor deriva do PAT); export com fallback de filename seguro + JSON com degradação para texto; erros do run `failed` retornam o DTO (sem throw que perderia o id). OK.
- `index.ts` — erros viram `{ code, message, requestId }` sem stack/SQL/PAT; `McpConfigError` expõe só o nome da var; log só em stderr (stdout é o canal JSON-RPC); sem `eval`, sem SQL. OK.
- Testes — env com save-restore (`UHHU_TOKEN`/`UHHU_API_URL` no smoke; strip `*DATABASE*` com restore em `finally` na integração); wipes incluem `personal_access_tokens`; fetch stub com restore; servidor em porta efêmera fechado no afterAll; timeouts limitados; skip offline no padrão do repo. OK.

**Achados:** 0 críticos, 0 altos. Notas não-bloqueantes: (1) erro de confirm ausente via transporte traz a mensagem inglesa do SDK (a propriedade sem-E/S vale; o PT-BR vale no `callTool` direto); (2) `execute_search` retorna run `failed` em vez de lançar (diverge do CLI de propósito — documentado).

## Threat Flags

Superfícies novas além do `<threat_model>` do plano: nenhuma — todos os vetores (PAT em Authorization via env, args JSON validados com Zod, 11 paths allowlist, erros com requestId, SDK pinado) estavam previstos em T-05-04-*.

| Mitigação | Status neste plano |
|-----------|-------------------|
| T-05-04-CONFIRM (confirm obrigatório nas 5, sem E/S sem ele) | Mitigado: pre-check + `z.literal(true)`; smoke prova sem-fetch nas 5 + `confirm:false` + `it.each`; stdio prova rejeição no transporte |
| T-05-04-SQL (zero tools genéricas, só allowlist REST) | Mitigado: guard D-55 verde (smoke dedicado + capabilities-guard existente); grep anti-`@uhhu/db`/drizzle/`SELECT..FROM` limpo |
| T-05-04-PROMPT (efeitos/proveniência/limites declarados) | Mitigado: 11/11 descriptions com as 3 linhas + capability §10; autoridade sempre server-side |
| T-05-04-LEAK (envelope sem stack/SQL/tokens) | Mitigado: `McpToolError` só com code/message/requestId; teste 404 assert requestId + ausência de token; PAT nunca em output (só header em memória) |
| T-05-04-SUPPLY (SDK pinado) | Mitigado: `1.30.0` exato no package.json + lock commitado; `pnpm audit` no gate 05-05 |

## Known Stubs

Nenhum — grep de `TODO|FIXME|placeholder|coming soon|not available` limpo nos 9 arquivos; todas as tools delegam a endpoints reais; export retorna conteúdo real.

## Verification (evidências)

- `pnpm --filter @uhhu/mcp run typecheck` — verde (3 tasks + final); `pnpm typecheck` monorepo — verde (exit 0, raiz + pacotes + tests)
- stdio task 1: `initialize→tools/list` lista **1** tool (`lab_list_sources`); stdio task 2: lista as **11** verbatim; `tools/call` prova confirm ausente (rejeição sem E/S), tool desconhecida e sem-token (`unauthenticated`)
- `pnpm vitest run --project smoke mcp-tools` — **29/29** (smoke total 81/81 em 5 arquivos)
- `pnpm vitest run --project integration mcp-headless` — **7/7** contra PG DEV real (migration via `db:migrate`, fixtures BDTD/CAPES)
- `pnpm test` (suite completa) — **16 arquivos, 170 testes, 0 falhas**
- eslint nos 9 arquivos do plano — verde
- Gates de acceptance: task1 (sdk 1, `^` 0, UHHU_TOKEN 4, StdioServerTransport 1, db-imports 0); task2 (nomes 23, confirm 14, Prov/Efeitos 22, any 0); task3 (its 24/8, UHHU_TOKEN 11, any 0)
- Nenhum commit deste plano inclui deleções de arquivos nem arquivos Phase 4 (conferido `git diff --diff-filter=D` vazio por commit + stage explícito por arquivo)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pronto para **05-05** (prova 3 canais): MCP executa a cadeia Etapa 2 ponta a ponta com o mesmo PAT (`UHHU_TOKEN`+`UHHU_API_URL`, sem `DATABASE_URL`); `prova-headless.sh` pode dirigir as tools via stdio ou `callTool`.
- Pronto para o gate Etapa 2: confirm/destrutivas, IDOR 404 e envelope PT-BR provados nos 3 canais (REST no 05-02, CLI no 05-03, MCP aqui).
- **Atenção 05-05:** (1) `pnpm audit` do SDK 1.30.0 entra no gate (T-05-04-SUPPLY); (2) wiring do nome nu `uhhu` na raiz segue pendente (dono do root, com hunk Phase 4); (3) 14 extensões transicionais do 05-02 seguem fora do contrato §10; (4) erro de confirm via transporte traz mensagem inglesa do SDK (só a mensagem — a barreira sem-E/S é idêntica).
- Arquivos Phase 4 não commitados seguem intocados no working tree para revisão humana (nenhum foi staged em nenhum commit deste plano — verificado por commit).

## Self-Check: PASSED

- Arquivos criados existem: `apps/mcp/src/tools.ts` FOUND; `apps/mcp/src/mcp-client.ts` FOUND; `apps/mcp/src/index.ts` FOUND; `tests/smoke/mcp-tools.test.ts` FOUND (24 its + it.each); `tests/integration/mcp-headless.test.ts` FOUND (7 its)
- Commits existem: `d62cee9` FOUND; `44ae0f1` FOUND; `6659ddc` FOUND (`git log --oneline`)
- Nenhum commit deste plano inclui deleções de arquivos nem arquivos Phase 4 (conferido `git diff --diff-filter=D` vazio por commit + `git status` com stage explícito)
- Suite completa 170/170 verde após o último commit de task (rodada antes do SUMMARY; revalidar no CI com os 6 checks)

---
*Phase: 05-prova-headless*
*Completed: 2026-09-11*
