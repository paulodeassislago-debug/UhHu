# Phase 1: Fundação executável - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-09
**Phase:** 1-Fundação executável
**Areas discussed:** Esqueleto monorepo, PG DEV + envs, Migrations + health, Gates de CI

---

## Esqueleto monorepo

| Option | Description | Selected |
|--------|-------------|----------|
| Mínimo + fronteiras | Só apps/core-api + packages/contracts, db, config; resto como README de fronteira | ✓ |
| Esqueleto completo | Todas as pastas do contrato §5 com package.json/tsconfig, mesmo vazias | |
| Você decide | OpenCode escolhe no planejamento | |

**User's choice:** Mínimo + fronteiras
**Notes:** Contrato §5 autoriza não materializar tudo de imediato; repo greenfield.

| Option | Description | Selected |
|--------|-------------|----------|
| Node 22 LTS + pnpm 9 | LTS ativa em 2026; engines + packageManager pinados | ✓ |
| Node 20 LTS + pnpm 9 | Mais conservadora | |
| Você decide | Researcher verifica docs oficiais | |

**User's choice:** Node 22 LTS + pnpm 9

| Option | Description | Selected |
|--------|-------------|----------|
| Strict + extras | strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes; base única herdada | ✓ |
| Só strict puro | Apenas strict:true | |
| Você decide | Planner define extras | |

**User's choice:** Strict + extras

| Option | Description | Selected |
|--------|-------------|----------|
| ESLint + Prettier | Padrão do ecossistema, typescript-eslint; config na raiz | ✓ |
| Biome | Binário único, mais rápido; menos plugins | |
| Você decide | Planner escolhe | |

**User's choice:** ESLint + Prettier

---

## PG DEV + envs

| Option | Description | Selected |
|--------|-------------|----------|
| Docker Compose | compose.dev.yml, volume nomeado, porta local/tailnet | ✓ |
| PG nativo instalado | Mais rápido; cada dev configura o próprio | |
| Você decide | Planner escolhe | |

**User's choice:** Docker Compose

| Option | Description | Selected |
|--------|-------------|----------|
| .env por ambiente + compose separado | .env.dev/.env.prod nunca commitados, .env.example versionado | |
| packages/config resolve | Config central com Zod por NODE_ENV | |
| Você decide | Planner desenha a separação | ✓ |

**User's choice:** Você decide — esquema de separação dev/prod vai para OpenCode's Discretion.

| Option | Description | Selected |
|--------|-------------|----------|
| VPS via tailnet | PG DEV na VPS em compose próprio; container atual só como cliente | ✓ |
| Tudo neste container | Instalar Docker/Node aqui e rodar PG local | |
| Você decide | Planner investiga o ambiente | |

**User's choice:** VPS via tailnet (container sem Docker/PG no PATH é blocker conhecido do STATE.md).

| Option | Description | Selected |
|--------|-------------|----------|
| Separados | Role DDL de migrations ≠ role runtime menor privilégio, já no DEV (baseline §2.1) | ✓ |
| Uma só no DEV | Simplicidade; separar só em prod | |
| Você decide | Planner define roles | |

**User's choice:** Separados

---

## Migrations + health

| Option | Description | Selected |
|--------|-------------|----------|
| Só prova infra | Migration de ping/journal vazio; nenhuma tabela de domínio na Fase 1 | ✓ |
| Tabelas mínimas platform | users/workspaces/sessions/invites como rascunho p/ Fase 2 | |
| Você decide | Planner define baseline | |

**User's choice:** Só prova infra — schema não congela sem validação do contrato por seções com Paulo.

| Option | Description | Selected |
|--------|-------------|----------|
| GET /health completo | db:ok/degraded, versão, migrations aplicadas; sem segredos | ✓ |
| Ping mínimo | Só 200 ok + ping do banco | |
| Você decide | Planner define shape | |

**User's choice:** GET /health completo

| Option | Description | Selected |
|--------|-------------|----------|
| packages/db dono total | Schema, client, drizzle.config e migrations em packages/db | ✓ |
| Você decide | Planner define moradia | |

**User's choice:** packages/db dono total

| Option | Description | Selected |
|--------|-------------|----------|
| Scripts pnpm | db:migrate / db:generate / migrate no boot | |
| Você decide | Planner define o fluxo | ✓ |

**User's choice:** Você decide — fluxo DX das migrations vai para OpenCode's Discretion.

---

## Gates de CI

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions | Workflows no repo; integração PG via service container | ✓ |
| Você decide | Planner define provedor | |

**User's choice:** GitHub Actions

| Option | Description | Selected |
|--------|-------------|----------|
| OpenGrep | Sugestão literal do baseline §5 | ✓ |
| Você decide | Researcher compara opções | |

**User's choice:** OpenGrep

| Option | Description | Selected |
|--------|-------------|----------|
| Falha dura por default | Segredo/SAST alto-crítico/audit alto-crítico quebram; aceite formal é exceção registrada | ✓ |
| Você decide | Planner define política | |

**User's choice:** Falha dura por default

| Option | Description | Selected |
|--------|-------------|----------|
| Smoke + integração PG | Suite mínima verde + migrations e /health contra PG de serviço | ✓ |
| Só testes vazios | Esqueleto passando; integração fica p/ Fase 2 | |
| Você decide | Planner define escopo | |

**User's choice:** Smoke + integração PG

---

## OpenCode's Discretion

- Esquema exato de separação dev/prod (arquivos .env, composes, packages/config, permissões).
- Fluxo DX das migrations (nomes de scripts, migrate no boot, comportamento no deploy).

## Deferred Ideas

None — discussion stayed within phase scope.
