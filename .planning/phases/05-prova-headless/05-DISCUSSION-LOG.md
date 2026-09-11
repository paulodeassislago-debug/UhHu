# Phase 5: Prova headless - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-11
**Phase:** 05-prova-headless
**Areas discussed:** Escopo da prova, Auth CLI/MCP, Experiência CLI, Superfície MCP

---

## Escopo da prova

| Option | Description | Selected |
|--------|-------------|----------|
| Cadeia completa Etapa 2 | projeto→busca→run→revisão→dedup→decisão→exportação por REST e CLI/MCP | ✓ |
| Uma capability isolada | ex. só search execute pelos 3 canais | |
| Slice representativo | 2-3 capabilities sem cadeia inteira | |

**User's choice:** Cadeia completa Etapa 2 (Recommended)
**Notes:** Atende success 1+3 juntos; assume Phase 4 entregue.

| Option | Description | Selected |
|--------|-------------|----------|
| Guard anti-PG | teste/lint quebra se cli/mcp importar @uhhu/db | ✓ |
| Só prova execução | demonstração sem guard estático | |

**User's choice:** Guard anti-PG (Recommended) — alinha com CI fail-closed D-11/D-13
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Sync+polling igual REST | 25s + 202 polling Job=Run (D-28/D-30) | ✓ |
| Só sync simples | sem jobs longos na prova | |

**User's choice:** Sync+polling igual REST (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Auditoria full | adversarial + IDOR curl + scanners, críticos/altos corrigidos ou aceite | ✓ |
| Só gates automáticos | sem adversarial nesta fase | |

**User's choice:** Auditoria full (Recommended) — success 2
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Repasse total | --idempotency-key + 10 runs/h nos 3 canais (D-39) | ✓ |
| Só no REST | CLI/MCP sem idempotência | |

**User's choice:** Repasse total (Recommended)
**Notes:** Extra round após "More questions".

| Option | Description | Selected |
|--------|-------------|----------|
| Arquivo via API | CLI baixa attachment corpus-<projeto>-<data> (D-52) | ✓ |
| Só stdout | JSON no stdout sem arquivo | |

**User's choice:** Arquivo via API (Recommended)
**Notes:** Extra round após "More questions".

---

## Auth CLI/MCP

| Option | Description | Selected |
|--------|-------------|----------|
| Bearer PAT por device | token opaco por device, fecha §8.1/§22-1 | ✓ |
| Reuso sessão cookie | CLI usa cookie browser | |

**User's choice:** Bearer PAT por device (Recommended)
**Notes:** ActorContext hoje só tem `authMethod: 'session'` — estender.

| Option | Description | Selected |
|--------|-------------|----------|
| 30d sliding + revoga | lista + individual + logout-all, espelha D-19/D-20 | ✓ |
| Longo sem expira | prático p/ scripts, maior janela se vazar | |

**User's choice:** 30d sliding + revoga (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| File 600 + env | arquivo 600 + UHHU_TOKEN, nunca em log | ✓ |
| Só env var | sem arquivo | |

**User's choice:** File 600 + env (Recommended) — espelha .env 600 FOUND-04
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Mesma authZ total | mesmo ActorContext, 404 IDOR, lockout | ✓ |
| Escopo reduzido | sem admin/invites no PAT | |

**User's choice:** Mesma authZ total (Recommended) — herda D-23/D-26
**Notes:** —

---

## Experiência CLI

| Option | Description | Selected |
|--------|-------------|----------|
| Nomes do contrato | uhhu auth login, lab search create/run etc. §18 | ✓ |
| Nomes novos | renomear | |

**User's choice:** Nomes do contrato (Recommended)
**Notes:** 1:1 com capabilities §10/§18.

| Option | Description | Selected |
|--------|-------------|----------|
| Tabela + --json | tabela humano, --json scripts, -v progresso | ✓ |
| Sempre JSON | só JSON + jq por fora | |

**User's choice:** Tabela + --json (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Envelope stderr + exit | PT-BR com requestId no stderr, exit por status | |
| You decide | | ✓ |

**User's choice:** You decide
**Notes:** Usuário delegou formato exato de erros/exit codes.

| Option | Description | Selected |
|--------|-------------|----------|
| Bin pnpm simples | bin workspace Node 22, --api base URL | ✓ |
| Build distribuível | bundle/binário release | |

**User's choice:** Bin pnpm simples (Recommended)
**Notes:** Mínimo sem toolchain nova.

---

## Superfície MCP

| Option | Description | Selected |
|--------|-------------|----------|
| Tools cadeia total | create/list project, create/execute search, get run, list results, set decision, get corpus, export, list sources | ✓ |
| Só leitura/execução | sem decisão/export | |

**User's choice:** Tools cadeia total (Recommended)
**Notes:** Prova total Etapa 2.

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm explícito | destrutivas exigem confirm:true + efeitos no schema | ✓ |
| Sem confirmação | só autoriza | |

**User's choice:** Confirm explícito (Recommended) — contrato §18 + SUITE-04
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Mesmo PAT + authZ | mesmo Bearer, 404 IDOR, sem SQL/tokens/tabelas | ✓ |
| Credencial separada | ciclo próprio MCP | |

**User's choice:** Mesmo PAT + authZ (Recommended) — CORE-05
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| DTOs iguais REST | camelCase, cursor, envelope PT-BR | ✓ |
| You decide | | |

**User's choice:** DTOs iguais REST (Recommended)
**Notes:** Herda CORE-01/D-25/D-27.

---

## OpenCode's Discretion

- Formato exato de erros no CLI (stderr + exit codes), flags curtas, paginação interna do CLI, layout exato das tools MCP.

## Deferred Ideas

None — discussion stayed within phase scope.
