# Phase 2: Plataforma e isolamento - Context

**Gathered:** 2026-09-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Contas, sessões e isolamento `ownerId` funcionando e testados adversarialmente em toda rota com ID, mais as convenções REST do CORE e o primeiro recurso isolado (projetos). Entrega observável: usuário registra (com convite), loga, mantém sessão e desloga; dois usuários não leem/alteram/excluem recursos um do outro e ID adulterado retorna 404; testes dono/estranho/ID-adulterado via `curl` passam para projetos e cada recurso com ID; erros seguem o envelope com `requestId`; rate limit e paginação funcionam. Sem buscas, adapters ou corpus — isso é Phase 3+.

</domain>

<decisions>
## Implementation Decisions

### Convites e registro
- **D-15:** Emissão só por admin (beta fechado) — sem auto-registro público; sem convite de usuário para usuário no v1.
- **D-16:** Token de convite opaco, uso único, validade de 30 dias; convite revogado para de valer (PLAT-01).
- **D-17:** Cadastro com nome + e-mail + senha (argon2id); login com Google/OAuth fica fora do v1 (escopo travado: PROJECT.md Out of Scope + FUT-04).
- **D-18:** Reset de senha por e-mail com token de uso único e expiração curta; mensagens genéricas também no reset ("se o e-mail estiver cadastrado, enviamos o link") — sem enumeração.

### Sessão e dispositivos
- **D-19:** Sessão de 30 dias com expiração deslizante; checkbox "manter conectado" no login (marcado = 30 dias, desmarcado = 24h). Cookie `httpOnly`/`Secure`/`SameSite` (PLAT-02).
- **D-20:** Vários dispositivos simultâneos, com lista de sessões ativas, revogação individual e "sair de todas".
- **D-21:** Logout encerra só a sessão do aparelho atual; "sair de todas" é ação separada.

### Projetos e isolamento
- **D-22:** Projeto tem título obrigatório, pergunta e descrição opcionais — todos facilmente editáveis pelo usuário a qualquer momento.
- **D-23:** Isolamento só por `ownerId` no v1; sem `workspaceId` (colaboração é pós-v1). `ownerId` sempre da sessão, nunca do body; recurso fora do escopo retorna 404 sem revelar existência (PLAT-03).
- **D-24:** Excluir projeto exige confirmação e apaga tudo dele; arquivar oculta da lista sem apagar (reativável).

### Erros, rate limit e paginação
- **D-25:** Mensagens de erro em PT-BR, i18n-ready (codes estáveis, mensagens catalogadas para outros idiomas no futuro); envelope `{error:{code,message,details,requestId}}` sem vazar stack/SQL/tokens (PLAT-05).
- **D-26:** 5 logins falhos → bloqueio de 15min, com reset por e-mail como saída imediata (sem esperar); resposta de login inválido genérica ("e-mail ou senha inválidos") — sem enumeração (decisão explícita após alerta de segurança).
- **D-27:** Paginação `limit`+cursor com `nextCursor`/`hasMore`; default 20, máximo 100 (CORE-01).

### OpenCode's Discretion
- Parâmetros do argon2id, formato dos tokens (convite/reset/sessão), duração exata do token de reset, estratégia de armazenamento de sessão server-side (desde que revogação individual + "sair de todas" funcionem), nomes de cookies e desenho exato das rotas — respeitando as decisões acima, o envelope de erro, `X-Request-Id` e o baseline de segurança.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato e requisitos (o que a fase precisa entregar)
- `.planning/REQUIREMENTS.md` — PLAT-01 a PLAT-05, CORE-01, LAB-01 (fontes: `dev-docs/07-core-contract.md` §10–13/21, `dev-docs/03-lab-spec-v1.md` §4/11, `dev-docs/08-security-baseline.md` §7, `dev-docs/09-roadmap-geral.md` §3–5)
- `dev-docs/07-core-contract.md` — convenções do CORE (REST `/api/v1`, envelope de erro, paginação, capabilities)
- `dev-docs/03-lab-spec-v1.md` — definição de projetos (título + pergunta) e o que vem depois (buscas/runs são Phase 3, não implementar aqui)

### Segurança e infra (restrições duras)
- `dev-docs/08-security-baseline.md` — IDOR como ameaça principal, testes dono/estranho/ID-adulterado, sem enumeração, segredos fora de logs/respostas
- `dev-docs/05-infra.md` — argon2id e convite beta (contexto), dev/prod separados
- `.planning/PROJECT.md` — Constraints (arquitetura, persistência, frontend, segurança, processo) e Out of Scope (OAuth fora do v1)
- `AGENTS.md` — regras normativas do repo (`any` proibido, auditoria adversarial, `ownerId` server-side)

### Contexto da fase anterior
- `.planning/phases/01-fundacao-executavel/01-CONTEXT.md` — D-01 a D-14 (monorepo, roles de banco separadas, `packages/db` dono do Drizzle, CI fail-closed)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/core-api/src/index.ts` — boot Fastify com logger que já redige `authorization`/`cookie`; padrão para registrar novas rotas.
- `apps/core-api/src/health.ts` — padrão de rota existente (a seguir/estender para convenções: envelope, `X-Request-Id`).
- `packages/db/src/client.ts` + `migrate.ts` — `createDb(url)` com role de runtime; migrations DDL em role separada (D-07 vale para as novas tabelas de users/sessions/invites/projects).
- `packages/config/src/env.ts` — env validado com Zod; novas variáveis (ex.: SMTP do reset) entram aqui.

### Established Patterns
- `packages/contracts` como única definição de tipos/DTOs/erros — DTOs de auth/projetos nascem aqui, nenhum app duplica.
- REST `/api/v1`, JSON camelCase público / snake_case no banco, IDs opacos, `X-Request-Id` propagado.
- CI fail-closed: novas rotas/tabelas entram cobertas por typecheck, lint, testes e auditoria adversarial.

### Integration Points
- Novas tabelas em `packages/db/src/schema.ts` (contrato 1–24 aprovado → domínio liberado; só resta `infra_proof` hoje).
- Novas rotas em `apps/core-api/src/` sobre o mesmo boot Fastify; sem worker, CLI ou MCP nesta fase.

</code>

<specifics>
## Specific Ideas

- Convite de 30 dias (usuário escolheu contra os 7 recomendados — mais folga para convidados que demoram a entrar).
- Campos do projeto "facilmente editáveis" — o fluxo de edição (não só criação) importa para o usuário.
- Combo de lockout: bloqueio de 15min + reset por e-mail como saída imediata, para o usuário legítimo não ficar preso esperando.

</specifics>

<deferred>
## Deferred Ideas

- Login com Google (OAuth) — pós-v1; escopo atual é só e-mail+senha (PROJECT.md Out of Scope + FUT-04).
- `workspaceId` / colaboração no mesmo projeto — pós-v1 (D-23).

</deferred>

---

*Phase: 02-plataforma-e-isolamento*
*Context gathered: 2026-09-10*
