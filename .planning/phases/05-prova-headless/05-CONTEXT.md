# Phase 5: Prova headless - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Mesma capability executável por REST e por CLI/MCP sem duplicar regra; gates de suite verdes. Entrega observável: a cadeia Etapa 2 (projeto→busca→run→revisão→dedup→decisão→corpus→exportação) executa por REST e repete por CLI/MCP contra o mesmo banco sem tocar o PostgreSQL direto; auditoria adversarial + IDOR + scanners passam; gate Etapa 2 do roadmap geral atendido. Assume Phase 4 (corpus/exportação) entregue — Phase 5 depende dela. Sem Lib/Note/Plan/Prof, sem worker extraído, sem PDFs Etapa 3.

</domain>

<decisions>
## Implementation Decisions

### Escopo da prova
- **D-54:** Cadeia completa Etapa 2 como prova — projeto→busca→run→resultados→dedup→decisão→corpus→exportação executa por REST e repete por CLI/MCP. Não é uma capability isolada nem slice parcial. Motivo: success 1+3 exigem a cadeia ponta a ponta sem tocar o banco.
- **D-55:** Guard automatizado anti-PG — teste/lint que quebra se `apps/cli` ou `apps/mcp` importarem `@uhhu/db`, SQL direto ou acesso a tabelas. Prova estrutural além da demonstração por execução (alinha com CI fail-closed D-11/D-13).
- **D-56:** Sync+polling igual ao REST nos 3 canais — espera até 25s, depois polling em `GET /jobs/:id` até `ok|partial|failed|cancelled` (herda D-28/D-30, Job=Run 1:1). CLI/MCP não usam caminho sync simplificado.
- **D-57:** Auditoria full mantida — adversarial arquivo-a-arquivo + curl IDOR dono/estranho/ID-adulterado para as novas superfícies + scanners (Gitleaks tree+histórico, SAST, `pnpm audit`); críticos/altos corrigidos ou com aceite formal (success 2).
- **D-58:** Repasse total de idempotência e rate-limit — CLI/MCP aceitam `--idempotency-key` e repassam o header (janela 24h, mesma key + mesmo body = mesmo run); respeitam 10 runs/h por usuário além do global 200/min (herda D-39).
- **D-59:** Export via API com arquivo — CLI baixa o attachment e salva com filename `corpus-<projeto>-<data>.csv|bib|json` (herda D-52); MCP retorna referência/conteúdo sem gravar PG direto. Não é só stdout.

### Auth CLI/MCP (fecha questão aberta contrato §8.1 / §22-1)
- **D-60:** Bearer PAT próprio por device — token opaco gerado no login via API, formato e ciclo em `packages/contracts` (definição única). Cookie de sessão continua só browser; CLI/MCP nunca usam cookie.
- **D-61:** Ciclo 30d sliding com revogação — espelha sessão D-19/D-20: lista de PATs ativos, revogação individual e "sair de todas"; `logout` revoga o PAT atual. Sem PAT eterno sem expira no v1.
- **D-62:** Guarda file 600 + env — arquivo local `600` + env `UHHU_TOKEN` com precedência (espelha `.env` 600 FOUND-04/D-07); flag `--logout` apaga; PAT nunca em log/resposta/bundle/Git.
- **D-63:** Mesma authZ total — mesmo `ActorContext` + `ownerId` server-side; fora do escopo → 404 idêntico nos 3 canais; sem enumeração; lockout 5→15min e envelope PT-BR valem para PAT (herda D-23/D-25/D-26).

### Experiência CLI
- **D-64:** Nomes do contrato §18 — `uhhu auth login/logout`, `project list`, `lab search create/run`, `lab run results`, `lab result decide`, `lab export`, `job get`. Sem renomear; cada comando aponta para capability existente.
- **D-65:** Tabela + `--json` — humano lê tabela, `--json` sai JSON puro para scripts; `-v` mostra progresso/polling; silencioso por default.
- **D-66:** Bin workspace simples — bin via pnpm no monorepo (Node 22, sem build distribuível no v1); base URL via env/flag `--api` (default localhost/dev).

### Superfície MCP
- **D-67:** Tools da cadeia total — `lab_create_project`, `lab_list_projects`, `lab_create_search`, `lab_execute_search`, `lab_get_run`, `lab_list_results`, `lab_set_result_decision`, `lab_get_corpus`, `lab_export_project`, `lab_list_sources` (+ health). Sem subset só-leitura; cobre Etapa 2.
- **D-68:** Confirmação explícita para destrutivas — tool declara efeitos colaterais, limites e proveniência no schema; decisão/delete exigem `confirm:true` explícito; auditoria com `actorId`/`requestId` (contrato §18 + SUITE-04).
- **D-69:** Mesmo PAT + mesma authZ — MCP usa o mesmo Bearer PAT (env), mesmo `ActorContext` e 404 IDOR; sem tool SQL genérico, sem acesso a tokens/tabelas; sampling/IA não muda autoridade (CORE-05).
- **D-70:** DTOs iguais ao REST — mesmos DTOs camelCase, paginação `limit`+cursor com `nextCursor`/`hasMore`, envelope PT-BR com `requestId` sem stack/SQL/tokens (herda CORE-01/D-25/D-27).

### OpenCode's Discretion
- Formato exato de erros no CLI (envelope no stderr + mapa de exit codes por status), desenho de flags curtas (`-o/-v/-f`), paginação interna do CLI, thresholds numéricos de health já herdados, nomes de arquivo de config do CLI e layout exato das tools MCP — respeitando D-54–D-70, envelope PT-BR, `X-Request-Id`, `any` proibido e baseline de segurança.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato e requisitos (o que a fase precisa entregar)
- `.planning/REQUIREMENTS.md` — CORE-02 (capabilities via `execute(name, input, ActorContext)`), CORE-05 (CLI por API nunca PG direto; MCP só tools semânticas)
- `.planning/ROADMAP.md` — Phase 5 Prova headless (goal, success 1-3, gate Etapa 2)
- `dev-docs/07-core-contract.md` §8 (identidade: Bearer própria CLI/MCP + ActorContext), §10 (modelo capability + lista inicial Lab), §18 (CLI por API + lista comandos; MCP tools + regras sem SQL/tokens), §22-1 (questão aberta Bearer a fechar), §21-1/2 (aceite: capability por REST sem UI; CLI/MCP mesma capability)
- `dev-docs/03-lab-spec-v1.md` §4 (UC-01–UC-10 que a cadeia Etapa 2 cobre), §5 (rotas lab a espelhar no CLI/MCP), §7–8 (dedup + export que a prova inclui)

### Segurança e processo (restrições duras)
- `dev-docs/08-security-baseline.md` — IDOR dono/estranho/adulterado, SSRF, segredos fora de logs/respostas, sem `Math.random` p/ tokens
- `AGENTS.md` — `any` proibido, `ownerId` server-side, auditoria adversarial antes de patch, REST/CLI/MCP mesmos casos de uso, PG canônico
- `.planning/PROJECT.md` — Constraints (arquitetura, persistência, frontend, segurança) e Out of Scope (sem backend por app, sem SQLite servidor)

### Contexto das fases anteriores
- `.planning/phases/02-plataforma-e-isolamento/02-CONTEXT.md` — D-15–D-27 (convite, sessão 30d sliding, ownerId só sessão, 404, envelope PT-BR, lockout, cursor)
- `.planning/phases/03-buscas-e-adapters/03-CONTEXT.md` — D-28–D-39 (sync 25s/202+polling, Job=Run, Idempotency-Key 24h, 10 runs/h, partial, health)
- `.planning/phases/04-corpus-e-exportacao/04-CONTEXT.md` — D-40–D-53 (fuzzy pending, canônico+pin, decisão por grupo, compare 4 blocos, BibTeX -a/-b, attachment D-52)
- `dev-docs/09-roadmap-geral.md` §4 Etapa 1 (gate: CLI/MCP mínima provando mesmos casos de uso headlessly)

### Código existente (integração)
- `packages/core/src/actor.ts` — `ActorContext` atual só `authMethod: 'session'`; estender para PAT sem quebrar sessão
- `packages/core/src/index.ts` — fronteira de capabilities a materializar (`execute(name, input, actor)`)
- `apps/core-api/src/lib/searches.ts` + `apps/core-api/src/lib/searchRuns.ts` — padrão `*ForActor` owner-first via JOIN →Project (reusar, não duplicar)
- `apps/core-api/src/routes/lab.ts` — rotas lab existentes; CLI/MCP adaptam E/S sobre as mesmas capabilities
- `apps/cli/README.md` — fronteira reservada CLI (opera por API, nunca PG)
- `apps/mcp/README.md` — fronteira reservada MCP (sem SQL genérico, sem tokens/tabelas)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `*ForActor` (`apps/core-api/src/lib/projects.ts`, `searches.ts`, `searchRuns.ts`): escopo owner via JOIN →Project + `toDTO` snake→camel — CLI/MCP reusam via capability, nunca reimplementam
- `packages/contracts` (auth/lab/errors/pagination): única definição de DTOs/erros PT-BR/cursor — PAT, comandos CLI e tools MCP nascem aqui
- `apps/core-api/src/plugins/rateLimit.ts`: duas camadas (global 200/min + fino 10/h runs) — CLI/MCP herdam sem bypass
- `packages/integrations` (registry/health/postFilter): health `ok|degraded|offline` e pós-filtro — `lab_list_sources` expõe o mesmo

### Established Patterns
- REST `/api/v1`, envelope `{error:{code,message,details,requestId}}` PT-BR, `X-Request-Id`, cursor `limit+1` default 20 max 100, 404 idêntico fora do escopo, `any` zero, `Math.random` proibido p/ tokens
- Sync 25s → `201`, senão `202` + polling `GET /jobs/:id` com Job=Run; `Idempotency-Key` com `keyHash`+`bodyHash`; export attachment `corpus-<projeto>-<data>`
- CI fail-closed: typecheck, lint, testes (incl. IDOR curl dono/estranho/adulterado), Gitleaks tree+histórico, SAST, `pnpm audit`, integração PG

### Integration Points
- `apps/cli/` (novo bin): cliente HTTP do CORE com PAT file 600 + env `UHHU_TOKEN`, `--api`, `--json`, `--idempotency-key`; nunca importa `@uhhu/db`
- `apps/mcp/` (novo server): tools semânticas sobre as mesmas capabilities com `confirm:true` p/ destrutivas; mesmo PAT/authZ; nunca SQL/tokens/tabelas
- `packages/core/` (materializar capabilities): `execute(name, input, actor)` + registry versionado; `apps/core-api` vira adaptador HTTP fino sobre ele
- Prova no padrão 03-06/04-05: integração PG + script cadeia (`curl` + CLI + MCP) + auditoria adversarial + checkpoint humano

</code>

<specifics>
## Specific Ideas

- Cadeia completa como prova (não capability isolada) — usuário escolheu recomendado cobrindo gate Etapa 2 ponta a ponta.
- Bearer PAT por device espelhando a sessão (30d sliding + lista + revogação) — fecha a questão aberta §8.1/§22-1 do contrato.
- Tabela por default com `--json` para scripts; bin workspace simples sem build distribuível no v1.
- MCP com `confirm:true` explícito para destrutivas e efeitos/proveniência declarados no schema.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Worker extraído, outbox/eventos entre módulos, backup/restore VPS e Lib/Note/Plan/Prof seguem fora (contrato §22 + PROJECT.md Out of Scope).

</deferred>

---

*Phase: 05-prova-headless*
*Context gathered: 2026-09-11*
