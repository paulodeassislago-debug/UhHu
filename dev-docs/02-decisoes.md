# UhHu! — Decisões vigentes (ADRs)

> Estado: vigente (09/09/2026). Textos originais completos no vault
> (`Projetos/UhHu/ADR*.md`). Este documento é o resumo operacional: o que vale
> para implementar, o que foi descartado.

## Vigentes

### ADR-001 — Core independente de Zotero
- Zotero = adapter/autoridade bibliográfica quando integrado, nunca o centro do Core.
- Storage é abstração (`StorageProvider`); PDF tem fonte física única.
- Cache ≠ fonte de verdade; fulltext via Zotero Web API v3.
- Kerko não é dependência arquitetural (estante futura → fork do Kerko, se precisar).

### ADR-003 (parcial) — Stack
- **Vale:** TypeScript/Node LTS, Fastify, Zod, Drizzle, pnpm monorepo, Docker, API-first.
- **Substituído:** SQLite como banco principal → **PostgreSQL** (ADR-009).

### ADR-004 — Entrega de arquivos
- Aceito, **adiado**: proxy/signed-redirect + thumbnails via Core. PDFs fora do
  caminho crítico. Reabre quando a Etapa 3 do Lab (Análise/arquivos) entrar.

### ADR-005 — Modelo de produto
- Válido como modelo do Lib **futuro** (catálogo nativo + Zotero/WebDAV + OAuth +
  pass-through + IA/reader Nível C). Fora do caminho crítico.

### ADR-006 — Primeiro produto: UhHu! Lab
- Lab (hub de pesquisas BDTD/CAPES) é o primeiro produto e o caminho crítico.
- Escopo v1: memória de pesquisas, coleta estruturada, dedup, elegibilidade,
  exportação. Triagem avançada/IA fora do v1.
- Lib fora do caminho crítico.

### ADR-007 — Visão: suite sobre CORE
- Produto é uma suite (Lab, Lib, Note, Plan, Prof) sobre o CORE headless.
- Lib reabilitado como peça futura (WebDAV provado em produção).
- Nomes definidos: Lab, Lib, Note, Plan, Prof.
- Regra de não antecipação: nenhuma feature de produto entra antes do Lab v1 validado.

### ADR-008 — Multi-usuário e ambientes dev/prod
- Multi-usuário desde o v1: contas e-mail+senha (argon2id), sessão segura,
  isolamento por `ownerId` em todas as entidades (IDOR é o principal modelo de
  ameaça).
- Registro beta por token de convite; colaboração no mesmo projeto fora do v1.
- Dev e prod na VPS em ambientes separados (diretórios, containers, portas,
  `.env`, bancos/credenciais). Git privado = fonte da verdade do deploy.

### ADR-009 — CORE compartilhado modular + PostgreSQL
- Ver `01-arquitetura.md`. Banco canônico: PostgreSQL self-hosted; SQLite só
  local/cache/offline.

## Histórico / descartado (não usar em implementação nova)

- **SQLite + FTS5 como persistência do servidor** → substituído (ADR-009).
- **Owner key única de instalação como autenticação de usuários** → substituída
  por contas multiusuário (ADR-008); owner key no máximo como credencial admin/script.
- **Backend independente por app / CORE como gateway de backends** → descartado
  (ADR-009).
- **Supabase como plataforma (auth/RLS/storage/edge functions)** → fora da
  arquitetura nova; o schema do legado é apenas material de migração.
- **UI de estante própria (Lib)** → só via fork do Kerko se um dia for necessária.
- **"Researcher" como nome de produto** → renomeado para UhHu! Lab.
- **Antiga API Initial Spec / Vertical Slice do Lib** → históricos; não orientam
  o contrato do CORE.

## Decisões a tomar em breve (documental, antes do código)

1. Validar por seções o contrato inicial do CORE (`07-core-contract.md` / `UhHu_CORE_Contrato_Inicial.md`).
2. Modelo de dados/migrations PostgreSQL iniciais (usar legado como material de
   pesquisa, não cópia literal).
3. Validação P1/P2 do ADR-008 (isolamento total por usuário; token de convite) —
   assumidas por default, revisitar na spec do Core.
