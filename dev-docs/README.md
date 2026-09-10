# UhHu! — Documentação de Desenvolvimento (dev-docs)

> **Propósito desta pasta:** documentação LIMPA e operacional do estado atual do
> UhHu!, consumida durante a etapa de desenvolvimento (opencode/code-server,
> testes, CI, deploy).
>
> O **vault Obsidian (`Projetos/UhHu/`)** continua sendo a memória completa do
> projeto (histórico, ADRs originais, investigações, decisões). Estes documentos
> são o destilado vigente daquela documentação — sem narrativa histórica, sem
> nomes antigos, sem decisões substituídas.
>
> Se houver conflito entre este diretório e o vault, **o vault vence** (fonte da
> verdade) e este diretório deve ser atualizado.
>
> Seção normativa para agentes: leia também `/projetos/UhHu/AGENTS.md` antes de
> qualquer alteração de código; o gate detalhado está em `08-security-baseline.md`.

> Onboarding no code-server: use `/projetos/UhHu/init-prompt.md` como prompt
> inicial do agente. Ele complementa — não substitui — `AGENTS.md`.

## Índice

| Documento | Conteúdo |
|---|---|
| `01-arquitetura.md` | Arquitetura vigente: suite sobre CORE headless, monorepo, módulos, PostgreSQL, superfícies REST/MCP/CLI |
| `02-decisoes.md` | Decisões vigentes (ADRs aceitos) e o que está descartado/histórico |
| `03-lab-spec-v1.md` | Especificação funcional do UhHu! Lab v1 (primeiro produto) |
| `04-fontes-bdtd-capes.md` | Fatos operacionais das fontes BDTD e CAPES (endpoints, shapes, limites) |
| `05-infra.md` | Ambientes dev/prod, PostgreSQL, deploy e segurança |
| `06-legado-planner.md` | Herança do Planner-Docente → UhHu! Plan e UhHu! Prof (features, schema, integrações) |
| `07-core-contract.md` | Contrato inicial do CORE: capabilities, REST, CLI, MCP, módulos, Lab v1, jobs, adapters e critérios de aceitação |
| `08-security-baseline.md` | Segurança obrigatória desde o primeiro commit: autorização, IDOR, segredos, XSS, scanners, auditoria e release gate |
| `09-roadmap-geral.md` | Roadmap macro da suite: CORE v1, Lab, Lib, Note, Plan, Prof e integração futura |

## Estado vigente em uma frase

> **UhHu! é uma suite de aplicativos** (Lab, Lib, Note, Plan, Prof) construída
> sobre um **CORE headless compartilhado** (REST + MCP + CLI), em **monorepo
> TypeScript**, com **PostgreSQL self-hosted** como persistência canônica.
> Primeiro produto: **UhHu! Lab**. Um app por vez, com a suite sempre em mente.

## Árvores relacionadas (fora desta pasta)

- `/projetos/UhHu/docs` — espelho rclone do vault (`Projetos/UhHu`), sincronizado
  a cada 3 min pela ponte `~/bin/uhhu-docs-bridge.sh`.
- `/projetos/UhHu/planner-docente` — codebase legada do Planner-Docente (só
  pesquisa/referência; reescrita não iniciada).
- `/projetos/UhHu/supabase-legacy-export` — extração do schema e das edge
  functions do Supabase legado (material de migração).
