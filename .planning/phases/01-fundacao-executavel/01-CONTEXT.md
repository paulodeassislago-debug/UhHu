# Phase 1: Fundação executável - Context

**Gathered:** 2026-09-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Dev sobe o CORE contra PostgreSQL DEV com migrations versionadas e CI de segurança verde, sem código de produto ainda. Entrega observável: `pnpm install` → migrations aplicadas → health check verde contra PG DEV; typecheck, lint, testes, Gitleaks (tree+histórico), SAST e `pnpm audit` passando no CI; PG dev/prod separados sem segredo no repo ou logs; contrato inicial validado por seções com Paulo antes de congelar o schema. Nenhuma tabela de domínio e nenhum endpoint de produto nesta fase.

</domain>

<decisions>
## Implementation Decisions

### Esqueleto monorepo
- **D-01:** Escopo mínimo + fronteiras — materializar só `apps/core-api` + `packages/contracts`, `packages/db`, `packages/config`; demais apps/packages do contrato §5 entram como pastas com README de fronteira, sem código.
- **D-02:** Toolchain fixada — Node 22 LTS + pnpm 9, com `engines` + `packageManager` pinados na raiz.
- **D-03:** TypeScript `strict` + extras — `strict` mais `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`; tsconfig base único herdado por todos os pacotes; `any` continua proibido sem exceção (incl. testes/mocks).
- **D-04:** Lint + format — ESLint (typescript-eslint) + Prettier com config na raiz; lint é gate do CI.

### PG DEV + envs
- **D-05:** PostgreSQL DEV via Docker Compose — `compose.dev.yml` próprio com serviço postgres, volume nomeado e porta local/tailnet.
- **D-06:** PG DEV roda na VPS via tailnet (compose próprio); este container/code-server opera só como cliente — não instalar Docker/PG local aqui.
- **D-07:** Roles separadas — role de migrations (DDL) distinta da role de runtime (menor privilégio), conforme baseline §2.1. Vale já no DEV.

### Migrations + health
- **D-08:** Migration inicial só prova infra — nenhuma tabela de domínio (`users`, `projects`, etc.) na Fase 1; schema não congela sem a validação do contrato por seções com Paulo.
- **D-09:** `GET /health` completo — status do banco (`ok`/`degraded`), versão e contagem de migrations aplicadas; sem revelar segredos ou config sensível.
- **D-10:** `packages/db` dono total do Drizzle — schema, client, `drizzle.config` e pasta de migrations; `core-api` só importa o client.

### Gates de CI
- **D-11:** CI em GitHub Actions — workflow de gates + job de integração PG via service container.
- **D-12:** SAST com OpenGrep para JS/TS.
- **D-13:** Falha dura por default — Gitleaks (tree+histórico), achados SAST alto/crítico e `pnpm audit` alto/crítico quebram o pipeline; aceite formal com prazo é exceção registrada, nunca silêncio.
- **D-14:** Testes da Fase 1 = smoke + integração PG — suite mínima verde (typecheck/lint/test runner) mais teste que aplica migrations e bate no `/health` contra PG de serviço.

### OpenCode's Discretion
- Esquema exato de separação dev/prod (`.env.dev`/`.env.prod` + composes separados vs `packages/config` com Zod por `NODE_ENV`, nomes de arquivos, permissões) — respeitar "bancos, credenciais e `.env` distintos; nenhum segredo no repo".
- Fluxo DX das migrations (nomes dos scripts `db:migrate`/`db:generate`, migrate no boot do dev, comportamento no deploy).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato e arquitetura (forma do monorepo e do CORE)
- `dev-docs/07-core-contract.md` §5 — organização-alvo do monorepo (fronteira, não lista de código imediato); §21 — critérios de aceitação do contrato (itens 8 e 14 cobrem esta fase); §22 — questões abertas (não bloquear a fundação por elas)
- `dev-docs/01-arquitetura.md` §5–§6 — layout `apps/` + `packages/` e stack (TS strict, Fastify, Drizzle, Zod, pnpm, Docker)
- `dev-docs/02-decisoes.md` — ADR-003 parcial (stack válida), ADR-009 (PG canônico), o que está descartado (SQLite servidor, Supabase novo)

### Segurança e gates (o que o CI precisa cobrar)
- `dev-docs/08-security-baseline.md` §5 — gates por mudança e no CI (typecheck, lint, autorização, secret scan tree+histórico, SAST JS/TS, `pnpm audit`, integração PG, scan de bundle); §7 — gate de merge/release; §2.1 — roles de banco com menor privilégio (migrations ≠ runtime)
- `AGENTS.md` — regras normativas do repo (contratos compartilhados, `any` proibido, auditoria adversarial, escopo)

### Infra e ambientes (PG dev/prod, segredos)
- `dev-docs/05-infra.md` §2–§5 — topologia VPS, dev restrito a localhost/tailnet, `.env`/credenciais/bancos separados, argon2id e convite (contexto, não implementar aqui), refresh cifrado como lição
- `.planning/REQUIREMENTS.md` — FOUND-01 a FOUND-04 (requisitos desta fase)
- `.planning/PROJECT.md` — Constraints (arquitetura, persistência, frontend, segurança, processo)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Nenhum — repositório greenfield: só `docs/`, `dev-docs/`, `.planning/`; `planner-docente/` e `supabase-legacy-export/` são material de pesquisa e não devem ser copiados como arquitetura.

### Established Patterns
- `packages/contracts` como única definição de tipos/DTOs/erros (ainda a criar nesta fase — só o esqueleto).
- Convenções travadas a respeitar quando o código nascer: REST `/api/v1`, JSON camelCase público / snake_case no banco, envelope de erro `{error:{code,message,details,requestId}}`, `X-Request-Id` propagado.

### Integration Points
- Nenhum nesta fase — PG DEV (VPS via tailnet) é a única dependência externa; sem adapters, sem UIs, sem worker.

</code>

<specifics>
## Specific Ideas

- PG DEV na VPS via tailnet em compose próprio; container atual sem Docker/PG no PATH opera como cliente.
- Migration inicial é prova de infra, não rascunho de domínio — tabelas `platform`/`lab` só entram após validação do contrato por seções com Paulo (success criterion 4 da fase).
- Falha dura no CI por default; aceite formal com prazo é exceção registrada.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-fundacao-executavel*
*Context gathered: 2026-09-09*
