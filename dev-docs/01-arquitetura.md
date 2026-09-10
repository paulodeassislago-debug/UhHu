# UhHu! — Arquitetura vigente

> Estado: vigente (09/09/2026). Fonte: ADR-009, ADR-008, ADR-003 (parcial),
> visão da suite. Detalhes históricos no vault.

## 1. Forma do produto

UhHu! é uma **suite de aplicativos** sobre um núcleo único:

| App | Papel | Status |
|---|---|---|
| **UhHu! Lab** | Gerenciador de pesquisas e buscas da pesquisa científica brasileira (BDTD/CAPES) | **Primeiro a desenvolver** |
| **UhHu! Lib** | Gerenciador bibliográfico: integra Zotero, BibTeX, organização da bibliografia | Fora do caminho crítico |
| **UhHu! Note** | Notas (produto próprio, decisão de Paulo) | A definir |
| **UhHu! Plan** | Agenda inteligente; integra Google Calendar | Rascunho conceitual |
| **UhHu! Prof** | Organização do trabalho docente; conversa com o Plan | Reescrita decidida, não iniciada |
| **UhHu! CORE** | API da suite; headless (REST + MCP + CLI) | Fundação |

Regra de lançamento: **um app por vez**, Lab primeiro; o CORE nasce já pensando
na integração de toda a suite. Horizonte de meses/anos, sem pressa.

## 2. Topologia de runtime: CORE compartilhado e modular

- **Não** há um backend independente por app no início.
- O CORE não é uma API-gateway fina que encaminha chamadas para cinco backends:
  ele é o backend da suite e dono das regras de integração.
- Lab, Lib, Note, Plan e Prof são **módulos de domínio e clientes** da mesma API.
- REST, CLI e MCP são **superfícies dos mesmos casos de uso e contratos** (não
  três implementações de negócio).
- Um `core-worker` (processo separado, mesmo monorepo/domínio/banco) pode surgir
  para tarefas longas (buscas, sincronizações) quando necessário.
- Extrair um módulo para serviço independente só ocorre com **necessidade
  operacional comprovada** (escala, isolamento, ciclo de deploy, equipe).

## 3. Módulos com fronteiras explícitas

| Módulo | Domínio |
|---|---|
| `platform` | usuários, workspaces, autenticação, permissões |
| `lab` | projetos de pesquisa, buscas, execuções, resultados, deduplicação |
| `lib` | documentos bibliográficos, coleções, BibTeX, adapter Zotero |
| `note` | notas, links, referências a documentos |
| `plan` | agenda, calendários, horários, conexões de calendário externo |
| `prof` | escolas, turmas, disciplinas, aulas, sequências, tarefas pedagógicas |
| `integrations` | Zotero, Google Calendar, Nextcloud, BDTD, CAPES |

Regras de fronteira:

- Cada módulo é dono de suas regras e tabelas.
- Acesso entre módulos por **casos de uso, contratos ou eventos explícitos** —
  nunca leitura direta das tabelas internas de outro módulo.
- Nomes semelhantes em módulos diferentes **não** são unificados sem validação
  semântica (ex.: tarefa pedagógica do Prof ≠ tarefa operacional do Plan).

## 4. Persistência

- **PostgreSQL self-hosted** é o banco canônico da suite (fora do Supabase).
- Dev e produção usam bancos/instâncias, volumes e credenciais **separados**.
- Migrations versionadas no monorepo, testadas contra PostgreSQL.
- PostgreSQL é escolhido por: multiusuário, concorrência, transações/constraints/
  FKs, JSONB (metadados brutos de fontes), busca textual, jobs de sincronização,
  compatibilidade conceitual com o legado (Planner-Docente era Postgres).
- **SQLite fica reservado** a cache local, operação offline, CLI/local/desktop e
  dados temporários — nunca fonte de verdade do servidor.
- Sem dual-dialeto oficial: testes de integração usam PostgreSQL.

## 5. Monorepo (organização-alvo)

```text
apps/
├── core-api/       → CORE compartilhado (Fastify + REST)
├── lab/            → cliente UhHu Lab (Expo/web/nativo)
├── core-worker/    → jobs longos, quando necessário
├── cli/            → superfície headless
└── mcp/            → superfície MCP

packages/
├── core/           → domínio e casos de uso
├── contracts/      → schemas Zod e contratos REST/MCP/CLI
├── db/             → Drizzle, PostgreSQL, migrations
├── modules/        → Lab, Lib, Note, Plan e Prof (fronteiras explícitas)
├── integrations/   → fontes e serviços externos
└── config/         → configuração e segredos
```

## 6. Stack

- TypeScript/Node (LTS), strict;
- Fastify (validação de fronteira embutida);
- Drizzle ORM;
- Zod (contratos e tipos derivados);
- pnpm monorepo;
- Docker na VPS.

## 7. Superfícies headless

- O contrato principal é REST (`/api/v1`), com schemas validados (Fastify+Zod).
- O CLI e o MCP server expõem **as mesmas capacidades** (casos de uso), sem
  duplicar regras de negócio.
- Desenhar capacidades semânticas (`buscar`, `deduplicar`, `importar_bibtex`,
  `criar_tarefa`), não CRUD cru — um tool do MCP = uma capacidade com schema.

## 8. Princípios herdados

- Produto = API/Core; interfaces são substituíveis.
- Cada tipo de dado tem um dono claro (single source of truth).
- IA auxilia o pesquisador; não escreve o trabalho acadêmico.
- Não antecipar funcionalidades; apenas evitar decisões que fechem portas.
- O CORE não depende de IA.
