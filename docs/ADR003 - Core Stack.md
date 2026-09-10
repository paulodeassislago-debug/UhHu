ADR-003 — Core Stack (decisão histórica: TypeScript/Node + Fastify + SQLite/FTS5 + Docker)

Projeto: UhHu!
Produto: UhHu! Core/API
Fase: Fase 0 — Fundação e decisões
Status: Substituído parcialmente — [[ADR009 - Core Compartilhado Modular e PostgreSQL]]
Data: 13/08/2026
Tipo: Decisão arquitetural
Relacionados: [[ADR001 - UhhuLib]] · [[ADR002 - Resolução de Storage Reference]] · [[ADR009 - Core Compartilhado Modular e PostgreSQL]] · [[UhHu_ecossistema_visao_arquitetura]]

> A escolha de TypeScript/Node, Fastify, Zod, Drizzle, Docker, monorepo e API-first
> permanece vigente. A escolha de SQLite como banco principal e a topologia
> inicial descrita neste documento foram substituídas pelo ADR-009 em 09/09/2026.

1. Contexto

O ADR-001 definiu o UhHu! Core como camada independente (adapters de integração + storage abstração), e o ADR-002 definiu a resolução de storage references. A investigação do Zotero Adapter validou tecnicamente o fluxo Zotero Web API v3 → Core → Storage Provider.

Para implementar o Core, é necessário decidir a stack tecnológica. Requisitos conhecidos:

- serviço REST para múltiplos clientes (Web primeiro, Android depois);
- sincronização agendada com Zotero (?since= + agregado /fulltext) e validação de storage references;
- cache local de metadados e índice de busca full-text (FTS), sem duplicar PDFs;
- execução self-hosted em Docker na VPS (ambiente atual: Portainer, Nextcloud, Beszel);
- horizonte: multi-tenant (clientes com storage próprio), sem antecipar funcionalidades;
- ecossistema futuro: Lib, Planner, RSL sobre o mesmo Core (monorepo natural).

2. Decisão

2.1. Linguagem: TypeScript/Node em todo o ecossistema

O Core, a API e os clientes (React Native + Expo + TypeScript, decisão anterior) compartilham uma única linguagem e um único modelo de domínio (packages/models). Um único desenvolvedor mantém o ecossistema inteiro sem troca de contexto.

2.2. Framework HTTP: Fastify

- maduro, performático, plugins oficiais;
- validação de schema embutida (JSON Schema) — contratos de API verificáveis na fronteira;
- suporte nativo a streaming e HTTP Range (necessário para entrega de arquivos, ADR-004).

2.3. Banco (DECISÃO ORIGINAL, SUBSTITUÍDA POR ADR-009): SQLite (better-sqlite3) + FTS5, via Drizzle ORM

- SQLite resolvia metadados + busca full-text sem serviço extra;
- Drizzle permitia manter uma porta de migração para Postgres;
- a escolha era adequada ao cenário original de uso pessoal/single-instance.

Essa escolha não é mais a persistência oficial. A suite agora é multiusuário,
compartilha o CORE entre Lab/Lib/Note/Plan/Prof e usará PostgreSQL self-hosted;
SQLite fica reservado a cache, uso local e offline, conforme [[ADR009 - Core Compartilhado Modular e PostgreSQL]].

2.4. Validação de fronteira: Zod

Schemas de entrada/saída da API e dos adapters; tipos derivados compartilhados com packages/models.

2.5. Monorepo pnpm (estrutura inicial revisada pelo ADR-009)

O monorepo continua vigente. A estrutura original abaixo foi substituída pela
organização do CORE compartilhado modular:

```text
apps/
├── core-api/
├── lab/
├── core-worker/
├── cli/
└── mcp/

packages/
├── core/
├── contracts/
├── db/
├── modules/
├── integrations/
└── config/
```

A extração de novos apps ocorrerá por etapas; não haverá backend independente por
app no início.

2.6. Sincronização: em processo, sem Redis/BullMQ no início

O sincronizador roda no mesmo processo da API (node-cron ou equivalente simples). Redis/fila só quando houver demanda real (multi-instância, escala). Simplicidade é prioridade na Fase 1.

2.7. Runtime e entrega

- Node.js LTS (22.x), TypeScript strict;
- Docker na VPS (Dockerfile multi-stage), gerenciado pelo Portainer;
- [histórico] banco SQLite em volume persistente; a topologia vigente usa PostgreSQL em volume próprio por ambiente; segredos continuam fora do código (variáveis de ambiente/arquivo de segredos).

3. Consequências positivas

- uma única linguagem em todo o ecossistema (Core + clientes);
- busca full-text sem infraestrutura extra (FTS5);
- contrato de API validado na fronteira (Fastify + Zod);
- monorepo pronto para Lib/Planner/RSL e para os pacotes do ecossistema;
- porta de migração para Postgres mantida sem custo imediato;
- deploy simples e consistente com o ambiente Docker existente.

4. Consequências negativas / trade-offs

- Python (FastAPI) não é usado no Core — a camada de IA futura, se precisar de Python, será um serviço separado, nunca uma dependência do Core (princípio: o Core não depende de IA);
- SQLite não escala para escrita concorrente pesada — irrelevante no uso pessoal; mitigado pela porta Postgres;
- Drizzle adiciona uma camada de indireção — custo aceito para a migração futura;
- sem fila de tarefas, sincronizações longas ocupam o processo — aceitável no início (biblioteca pessoal), revisitado se necessário.

5. Critério de aceitação

Com esta stack, o Core deve ser capaz de:

- sincronizar catálogo e fulltext do Zotero via adapter (validação do ADR-002 reproduzida automaticamente);
- servir endpoints REST de documents/collections/search com schemas validados;
- resolver storage references e entregar arquivos conforme ADR-004;
- rodar em Docker na VPS com volume persistente.

6. Relação com a documentação anterior

Não contraria os ADRs 001/002. Implementa o ambiente de código previsto no documento de continuidade da Fase 0 ([[UhHu_Lib_Fase_0_Contexto_Atualizado]]), que definia a separação entre ambiente documental e ambiente de implementação.

7. Status

**SUBSTITUÍDO PARCIALMENTE — Fase 0 (09/09/2026).**

A stack de linguagem/framework, contratos, monorepo, Docker e Zod continua
válida. Banco/topologia: consultar [[ADR009 - Core Compartilhado Modular e PostgreSQL]].

8. Próximo documento

ADR-004 — Entrega de Arquivos (proxy/redirect por capacidade do provider), em elaboração.
