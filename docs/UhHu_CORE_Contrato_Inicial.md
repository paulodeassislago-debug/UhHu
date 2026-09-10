---
tags:
  - uhhu
  - core
  - contrato
  - api
  - headless
  - suite
date: 2026-09-09
status: rascunho para validação por seções
tipo: contrato arquitetural e de API
---

# UhHu! CORE — Contrato Inicial

**Projeto:** UhHu!  
**Produto:** UhHu! CORE / UhHu! Suite  
**Versão do contrato:** 0.1  
**Status:** Rascunho para validação por seções  
**Data:** 09/09/2026  
**Base normativa:** [[ADR009 - Core Compartilhado Modular e PostgreSQL]] · [[ADR008 - Multi-usuario e Ambientes Dev Prod]] · [[ADR006 - Researcher Primeiro Produto]] · [[UhHu_Security_Notes]] · [[UhHu_Suite_Visao_2026-09-09]] · [[UhHu_Researcher_v1_Spec]]

> Este documento define a fronteira inicial do CORE antes da implementação. Ele
> não é código, não é ainda um OpenAPI gerado e não tenta especificar todos os
> módulos da suite. O primeiro consumidor real será o UhHu Lab.

## 1. Propósito

O UhHu CORE é o backend compartilhado e headless da suite. Ele deve:

- oferecer uma API própria, independente do Supabase e das UIs;
- centralizar identidade, autorização, persistência e proveniência;
- executar casos de uso dos módulos Lab, Lib, Note, Plan e Prof;
- integrar fontes e serviços externos por adapters;
- oferecer REST como contrato de transporte principal;
- permitir CLI e MCP sem duplicar regras de negócio;
- preservar fronteiras para que um módulo possa ser extraído no futuro, se houver
  necessidade operacional comprovada.

O CORE não é um simples gateway. Ele é o backend principal da suite e dono das
regras de integração.

## 2. Escopo deste contrato

### Incluído

- contexto de identidade e autorização;
- convenções comuns da API;
- módulos e fronteiras de domínio;
- capabilities/casos de uso headless;
- contrato inicial do Lab v1;
- jobs assíncronos e integrações;
- persistência e ambientes;
- REST, CLI e MCP como superfícies do mesmo núcleo;
- versionamento, erros, idempotência e proveniência.

### Não incluído

- UI de qualquer app;
- implementação do Reader;
- síntese ou autoria acadêmica por IA;
- colaboração complexa em projetos;
- sincronização offline completa;
- entrega de PDFs como caminho crítico do Lab v1;
- schema final de todos os módulos futuros;
- arquitetura de microsserviços desde o primeiro dia.

## 3. Princípios normativos

1. **Uma regra de negócio, uma implementação:** REST, CLI e MCP chamam os mesmos
   casos de uso.
2. **API antes da UI:** nenhum frontend acessa banco ou serviço externo diretamente.
3. **CORE compartilhado:** não criar um backend independente para cada app no
   início.
4. **Modularidade explícita:** módulo só acessa outro por contrato, caso de uso
   ou evento definido.
5. **Fonte de verdade clara:** PostgreSQL é a fonte canônica do servidor; caches
   não são autoridades.
6. **Proveniência:** resultados, integrações e decisões importantes devem manter
   origem e contexto temporal.
7. **Segurança por contexto:** usuário/workspace vem da sessão, nunca de um campo
   confiado no body.
8. **IA não é dependência do CORE:** agentes usam o CORE; o CORE não precisa de IA
   para funcionar.
9. **Não antecipação:** registrar portas abertas sem implementar futuros módulos
   por especulação.

### 3.1. Segurança desde o primeiro commit

Código produzido com auxílio de IA só pode entrar no CORE depois de revisão
adversarial, testes e scanners. Os controles mínimos são:

- regra de negócio e autorização no backend; frontend/localStorage/Origin/Referer
  nunca decidem privilégio;
- toda operação por ID verifica `ownerId`/`workspaceId` no servidor (IDOR), com
  testes para usuário dono, usuário estranho e ID adulterado via `curl`;
- PostgreSQL não é exposto à UI; RLS, se usado, é defesa em profundidade e não
  substitui autorização nos casos de uso;
- todo input passa por Zod, limites, queries parametrizadas, sanitização de
  HTML/Markdown, validação de uploads/URLs e proteção contra SSRF/path traversal;
- segredos não entram em código, bundle, Git/histórico, logs ou respostas;
- sessões, tokens, OTPs e IDs sensíveis usam geração criptograficamente segura;
- webhooks verificam assinatura, timestamp e replay; rate limits são testados;
- Gitleaks, OpenGrep/SAST, `pnpm audit`, typecheck, lint, testes de autorização e
  integração PostgreSQL entram no CI;
- OWASP ZAP só é executado contra local/staging sob controle do UhHu;
- auditoria assistida por IA produz relatório antes de qualquer patch automático;
  correção e aceite exigem revisão humana.

O procedimento completo está em [[UhHu_Security_Notes]] e em
`dev-docs/08-security-baseline.md`.

## 4. Arquitetura de runtime

```text
UhHu Lab UI ───────┐
UhHu Lib UI ───────┤
UhHu Note UI ──────┤
UhHu Plan UI ──────┤
UhHu Prof UI ──────┤
CLI ───────────────┤── UhHu CORE API ─── PostgreSQL
MCP server ────────┘          │
                              ├── adapters de fontes
                              ├── Google Calendar
                              ├── Zotero
                              ├── Nextcloud/WebDAV
                              └── core-worker (quando necessário)
```

O runtime inicial é um **modular monolith**:

- `core-api`: processo Fastify que expõe REST e executa os casos de uso;
- `core-worker`: processo opcional, no mesmo monorepo/domínio/banco, para buscas,
  sincronizações e jobs longos;
- PostgreSQL: persistência canônica;
- adapters: fronteiras com serviços externos;
- UIs/CLI/MCP: clientes ou adaptadores do CORE.

O `core-worker` não é um backend independente do Lab, Plan ou Prof. Ele é uma
forma de separar execução longa do processo HTTP quando isso se tornar necessário.

## 5. Organização do monorepo

```text
apps/
├── core-api/       # Fastify + REST
├── lab/            # UhHu Lab: Expo/web/nativo
├── core-worker/    # jobs longos, quando necessário
├── cli/            # cliente headless
└── mcp/            # servidor/adaptador MCP

packages/
├── core/           # contexto, capabilities e casos de uso
├── contracts/      # schemas Zod, DTOs e contratos públicos
├── db/             # Drizzle, PostgreSQL e migrations
├── modules/        # platform, lab, lib, note, plan, prof
├── integrations/   # BDTD, CAPES, Zotero, Google, Nextcloud
└── config/         # configuração não sensível e resolução de segredos
```

Não é necessário materializar todas as pastas antes do Lab. A estrutura é uma
fronteira arquitetural, não uma lista de código a ser criado imediatamente.

## 6. Contextos e propriedade dos dados

### 6.1. `platform`

Responsável por:

- usuários;
- workspaces/contas;
- sessões;
- convites;
- permissões;
- identificação do ator da requisição.

No v1, cada usuário terá um espaço pessoal isolado. O modelo deve permitir que
um workspace venha a conter membros e permissões no futuro, sem implementar
colaboração agora.

### 6.2. `lab`

Responsável por:

- projetos de pesquisa;
- estratégias de busca;
- execuções temporais;
- resultados;
- grupos de duplicatas;
- decisões de elegibilidade;
- tags de projeto;
- corpus derivado;
- exportações;
- registry e execução das fontes de pesquisa.

### 6.3. `lib`

Responsável futuramente por:

- documentos bibliográficos;
- coleções;
- BibTeX;
- relação com Zotero;
- referências bibliográficas para outros módulos.

O Lib não é o primeiro slice e não deve reintroduzir a UI de estante como
fundamento do CORE.

### 6.4. `note`

Responsável futuramente por:

- notas próprias;
- links entre notas;
- referências a documentos, resultados e projetos;
- integração com Obsidian e eventual Reader.

A entidade `Note` não deve ser implementada agora apenas para preencher o modelo
futuro.

### 6.5. `plan`

Responsável futuramente por:

- agenda;
- calendários acadêmicos;
- itens de planejamento;
- horários e turnos;
- conexões com calendários externos.

### 6.6. `prof`

Responsável futuramente por:

- escolas;
- turmas;
- disciplinas;
- conteúdos;
- aulas;
- modelos e sequências didáticas;
- tarefas pedagógicas;
- exportações de planos docentes.

### 6.7. `integrations`

Responsável por adapters e conexões com:

- BDTD;
- CAPES;
- Zotero;
- Google Calendar;
- Nextcloud/WebDAV;
- outros serviços aprovados posteriormente.

Credenciais e tokens pertencem ao contexto de integração, não às UIs nem a
entidades de perfil genéricas.

## 7. Núcleo compartilhado mínimo

O CORE deve compartilhar apenas abstrações que tenham semântica realmente comum:

- `User`;
- `Workspace`/conta pessoal;
- `ActorContext`;
- `ResourceRef`;
- identificadores opacos;
- timestamps UTC;
- paginação;
- erros;
- `Job`;
- `Provenance`;
- eventos de integração, quando implementados.

Uma `ResourceRef` representa uma referência entre módulos sem transformar os
módulos em um único modelo:

```json
{
  "module": "lab",
  "resourceType": "result",
  "resourceId": "01J..."
}
```

Entidades com nomes semelhantes não são automaticamente a mesma entidade. Uma
tarefa pedagógica do Prof pode relacionar-se a um item operacional do Plan sem
ser a mesma tabela. Uma aula do Prof pode gerar um vínculo com um evento do Plan,
sem carregar a implementação do Google Calendar.

## 8. Identidade, autorização e isolamento

### 8.1. Identidade

- login v1 por e-mail e senha;
- senha armazenada com Argon2id;
- registro beta controlado por token de convite;
- sessão de browser por cookie `httpOnly`, `Secure` e `SameSite` adequado;
- CLI/MCP devem usar uma credencial Bearer própria para clientes não-browser;
  o formato, ciclo de vida e rotação dessa credencial serão fechados antes da
  implementação dessas superfícies.

### 8.2. Escopo

Cada requisição autenticada carrega um `ActorContext` interno:

```text
ActorContext
├── userId
├── workspaceId
├── roles/scopes
├── requestId
└── authMethod
```

No v1, `workspaceId` pode representar o espaço pessoal do usuário. A API não
aceita `ownerId` de entrada para decidir autorização; o servidor deriva o dono da
sessão e verifica o recurso antes de qualquer operação.

### 8.3. Regra de isolamento

- toda entidade de usuário tem escopo de owner/workspace;
- toda leitura, alteração e exclusão verifica o escopo;
- IDs de outro usuário devem resultar em `404` ou resposta equivalente sem
  revelar existência indevida;
- nenhum filtro de UI substitui autorização no CORE;
- testes automatizados de IDOR são obrigatórios.

## 9. Convenções gerais da API

### 9.1. Transporte e versão

- REST sobre HTTPS em produção;
- prefixo: `/api/v1`;
- JSON UTF-8;
- datas em ISO 8601 UTC;
- IDs opacos (UUID; a escolha do gerador concreto fica na implementação);
- JSON público em camelCase; banco em snake_case;
- `X-Request-Id` aceito/gerado e propagado para logs sem segredos.

### 9.2. HTTP status

| Status | Uso |
|---|---|
| `200` | leitura ou operação concluída |
| `201` | recurso criado |
| `202` | operação aceita para execução assíncrona |
| `204` | operação concluída sem corpo |
| `400` | requisição malformada |
| `401` | ausência/invalidade de autenticação |
| `403` | autenticado, mas sem permissão |
| `404` | recurso inexistente ou não visível no escopo |
| `409` | conflito de estado/idempotência |
| `422` | dados semanticamente inválidos |
| `429` | rate limit |
| `500` | erro interno |
| `502/503` | integração/fonte indisponível ou degradada |

### 9.3. Erros

Toda falha pública deve seguir este formato:

```json
{
  "error": {
    "code": "SOURCE_UNAVAILABLE",
    "message": "A fonte CAPES está temporariamente indisponível.",
    "details": {},
    "requestId": "01J..."
  }
}
```

`message` é seguro para o cliente. Stack traces, tokens, cookies, SQL e URLs
assinadas nunca entram na resposta.

### 9.4. Paginação

Coleções devem aceitar:

- `limit` com limite máximo definido pelo módulo;
- cursor ou paginação equivalente;
- filtros declarados no contrato;
- ordenação estável.

A resposta deve informar o próximo cursor quando houver mais dados:

```json
{
  "items": [],
  "page": {
    "limit": 50,
    "nextCursor": "...",
    "hasMore": true
  }
}
```

### 9.5. Idempotência

Operações que criam efeitos externos ou jobs longos aceitam `Idempotency-Key`:

- execução de busca;
- exportação;
- sincronização;
- criação de evento externo;
- operações de importação.

A mesma chave, dentro da janela definida, não pode criar duas execuções ou dois
eventos externos.

## 10. Modelo de capability

O contrato interno do CORE é orientado a capabilities, não a CRUD exposto sem
semântica.

Cada capability possui:

```text
Capability
├── name
├── module
├── inputSchema
├── outputSchema
├── authorization
├── sideEffects
├── idempotency
├── executionMode (sync | async)
└── version
```

Interface conceitual:

```text
execute(capabilityName, input, ActorContext)
  → Result | JobReference
```

A camada HTTP, o CLI e o MCP adaptam entrada/saída, mas não implementam regra de
negócio paralela.

### Capabilities iniciais do Lab

```text
platform.session.get
platform.project.create
platform.project.list
platform.project.get
platform.project.update

lab.search.create
lab.search.list
lab.search.update
lab.search.delete
lab.search.execute
lab.search.compare
lab.run.get
lab.run.list
lab.run.results.list
lab.result.decision.update
lab.result.duplicate.diverge
lab.corpus.get
lab.project.export
lab.source.list
lab.source.health
```

Capabilities futuras, registradas apenas como direção:

```text
lib.bibliography.importBibtex
lib.bibliography.exportBibtex
lib.document.syncZotero
note.note.create
plan.agenda.createItem
plan.calendar.sync
prof.lesson.generate
prof.lesson.checkConflict
prof.sequence.apply
```

## 11. REST inicial do CORE/Lab

### 11.1. Plataforma

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
POST   /api/v1/auth/invites              (admin da instalação)
POST   /api/v1/auth/register             (convite válido)

GET    /api/v1/workspaces/current
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:projectId
PATCH  /api/v1/projects/:projectId
```

`Project` é o ponto de ancoragem do Lab v1. A possibilidade de outros módulos
referenciarem um projeto não obriga todos os módulos a usarem a mesma semântica
interna.

### 11.2. UhHu Lab

As rotas do Lab são namespaceadas para deixar a fronteira explícita:

```text
POST   /api/v1/lab/searches
GET    /api/v1/lab/searches?projectId=
GET    /api/v1/lab/searches/:searchId
PATCH  /api/v1/lab/searches/:searchId
DELETE /api/v1/lab/searches/:searchId
POST   /api/v1/lab/searches/:searchId/runs
GET    /api/v1/lab/searches/:searchId/runs
GET    /api/v1/lab/searches/:searchId/compare?with=

GET    /api/v1/lab/runs/:runId
GET    /api/v1/lab/runs/:runId/results
GET    /api/v1/lab/results/:resultId
PATCH  /api/v1/lab/results/:resultId/decision
POST   /api/v1/lab/results/:resultId/duplicate-divergence

GET    /api/v1/lab/projects/:projectId/corpus
GET    /api/v1/lab/projects/:projectId/export?format=csv|bibtex|json&scope=selection|corpus
GET    /api/v1/lab/sources
GET    /api/v1/lab/sources/:sourceName/health

GET    /api/v1/jobs/:jobId
POST   /api/v1/jobs/:jobId/cancel
```

A execução de busca pode responder:

- `201` com um `SearchRun` concluído, se terminar dentro do limite síncrono;
- `202` com um `SearchRun` em `queued`/`running` e uma referência a `Job`, se
  continuar em worker;
- `200/201` com status `partial` quando uma fonte falhar e a execução preservar
  resultados parciais.

O cliente deve sempre consultar o estado do `SearchRun`, não presumir que toda
busca é síncrona.

### 11.3. Rotas futuras

As fronteiras públicas reservadas são:

```text
/api/v1/lib/...
/api/v1/note/...
/api/v1/plan/...
/api/v1/prof/...
```

Nenhuma dessas rotas entra no primeiro vertical slice sem uma spec própria.

## 12. Contrato de domínio do Lab

### `Project`

```text
id
ownerId/workspaceId
name/title
researchQuestion
status: active | archived
createdAt
updatedAt
```

### `Search`

Definição declarativa da estratégia, não uma execução:

```text
id
projectId
term
booleanOperators
filters
sources: bdtd | capes | [bdtd, capes]
createdAt
updatedAt
```

### `SearchRun`

Snapshot temporal de uma execução:

```text
id
searchId
status: queued | running | ok | partial | failed | cancelled
executedAt?
startedAt?
finishedAt?
metrics
error?
```

### `Result`

Item encontrado por uma fonte:

```text
id
runId
source
sourceId
title
authors
year
documentType
institution?
program?
abstract?
originUrl
sourceUrl?
rawMetadata
createdAt
```

### `DedupGroup`

Agrupamento transparente de registros que representam o mesmo trabalho:

```text
id
runId
canonicalKey
confidence: exact | fuzzy
memberResultIds
```

### `Decision`

Decisão de elegibilidade, mutável e pertencente ao projeto:

```text
resultId
authoritativeProjectId
state: eligible | ineligible | undecided
reasonTagId?
reason?
decidedAt
updatedAt
```

### `Tag`

```text
id
projectId
name
color?
isDefault
```

O corpus não é uma tabela de cópia: é uma visão derivada dos resultados com
decisão `eligible`.

## 13. Proveniência

Todo resultado precisa permitir a reconstrução do caminho que o produziu:

```text
Result
  └── runId → SearchRun
                 └── searchId → Search
                                  └── projectId → Project
```

Além disso, deve preservar:

```text
Provenance
├── source
├── sourceId
├── retrievedAt
├── adapterName
├── adapterVersion?
├── originUrl
└── rawMetadata/reference
```

Deduplicar não apaga origens. Exportar um grupo deve permitir identificar quais
fontes contribuíram e qual versão foi escolhida.

Decisões e eventos externos futuros devem carregar `actorId`, `workspaceId`,
`occurredAt` e a referência do recurso afetado quando isso entrar no escopo.

## 14. Jobs e execução assíncrona

Jobs são recursos observáveis do CORE:

```text
Job
├── id
├── type
├── status: queued | running | succeeded | partial | failed | cancelled
├── progress?
├── createdAt
├── startedAt?
├── finishedAt?
├── resultRef?
├── error?
└── retryCount
```

Regras:

- jobs longos não bloqueiam indefinidamente a requisição HTTP;
- timeout de fila deve ser explícito;
- retry precisa ser idempotente;
- erro de uma fonte pode produzir `partial`, não apagar resultados válidos;
- logs do job nunca contêm credenciais/cookies;
- a fila global de fontes protege BDTD/CAPES contra concorrência abusiva;
- Redis/filas externas não são requisito do primeiro slice; o worker pode começar
  com mecanismo simples no mesmo ecossistema.

## 15. Contrato de adapters

### 15.1. Fonte de pesquisa

```text
SourceAdapter
├── name
├── level: official | unofficial
├── enabled
├── search(definition, page, SourceClientContext)
│     → SearchPage
├── enrich(sourceId, SourceClientContext)
│     → EnrichedResult
└── health()
      → SourceHealth
```

`SearchPage` deve normalizar a fonte para o domínio do Lab:

```text
SearchPage
├── total?
├── page
├── results[]
├── metrics
└── sourceStatus
```

O adapter honra os filtros que a fonte suporta. O CORE aplica pós-filtro local
quando necessário para garantir o contrato declarado ao usuário.

### 15.2. SourceClient

BDTD e CAPES usam um `SourceClient` compartilhado por instância, não uma sessão
independente por usuário:

- cookie jar por fonte;
- renovação adaptativa ao detectar challenge;
- mutex contra thundering herd;
- rate limit global;
- circuit breaker;
- timeout de fila (60s como referência inicial);
- UA identificado `UhHu-Lab/<versão>`;
- nenhuma credencial/cookie retorna ao cliente.

### 15.3. Outras integrações

As integrações futuras seguem a mesma ideia de adapter:

```text
BibliographyAdapter  → Zotero / BibTeX
CalendarAdapter      → Google Calendar
StorageAdapter       → Nextcloud/WebDAV e outros storage
NotesAdapter         → Obsidian / Note
```

O adapter traduz o serviço externo para o modelo/capability do CORE. A UI não
conhece o protocolo externo.

## 16. Plan e Prof: contrato de relação

A herança do Planner-Docente é dividida:

```text
Prof Lesson
    │
    └── Plan CalendarLink
            │
            └── External Calendar Event (Google)
```

Consequências contratuais:

- uma aula pode existir sem conexão Google;
- um evento Google pode ser criado/atualizado por uma capability do Plan;
- o identificador externo não deve ser a identidade da aula;
- refresh tokens pertencem ao contexto de integração e são cifrados;
- uma tarefa pedagógica do Prof não vira automaticamente uma tarefa operacional
  do Plan;
- as fronteiras públicas futuras são `/prof/...` e `/plan/...`, sobre o mesmo
  CORE e a mesma identidade.

Funcionalidades do Prof herdadas do legado — geração de aulas, conflitos,
modelos, sequências e tarefas — só entram após spec própria. Nenhuma lógica do
legado Supabase é transportada como arquitetura.

## 17. Persistência

- PostgreSQL self-hosted é a persistência canônica do CORE;
- dev e produção têm bancos/instâncias, volumes, credenciais e `.env` separados;
- migrations são versionadas no monorepo;
- Drizzle usa o dialeto PostgreSQL oficial;
- índices de busca e metadados JSON devem ser projetados para PostgreSQL;
- SQLite não é banco do servidor; pode ser cache/local/offline/desktop;
- testes de integração rodam contra PostgreSQL;
- nenhuma UI acessa o banco diretamente.

## 18. REST, CLI e MCP

### REST

É o contrato público principal, com schemas Zod na fronteira e OpenAPI derivado
quando a implementação começar.

### CLI

O CLI deve operar o CORE por API, não por acesso direto ao PostgreSQL:

```text
uhhu auth login
uhhu project list
uhhu lab search create
uhhu lab search run
uhhu lab run results
uhhu lab result decide
uhhu lab export
uhhu job get
```

Os comandos são nomes de experiência; cada comando aponta para uma capability
existente.

### MCP

O MCP deve expor tools semânticas, com schema de entrada/saída e autorização:

```text
lab_create_project
lab_list_projects
lab_create_search
lab_execute_search
lab_get_run
lab_list_results
lab_set_result_decision
lab_get_corpus
lab_export_project
lab_list_sources
```

Regras:

- sem tool de SQL genérico;
- sem acesso direto a tokens ou tabelas;
- tool informa limites, efeitos colaterais e proveniência;
- o ator do agente é submetido às mesmas permissões da API;
- sampling/IA do agente não altera a autoridade dos dados do CORE.

## 19. Versionamento e compatibilidade

- versão pública inicial: `/api/v1`;
- mudanças aditivas e campos opcionais podem permanecer em v1;
- remoção, mudança semântica incompatível ou alteração de autorização exige
  nova versão ou período de depreciação explícito;
- schemas Zod e testes de contrato são parte do versionamento;
- capabilities também possuem versão quando sua semântica mudar;
- respostas de fontes externas nunca são expostas como contrato público bruto.

## 20. Requisitos não funcionais iniciais

- timeout em toda chamada externa;
- rate limit por usuário/instância conforme o módulo;
- circuit breaker para fontes não confiáveis;
- cancelamento de jobs longos;
- request ID em logs e respostas de erro seguras;
- métricas de fonte: `ok`, `degraded`, `offline`, falhas recentes e challenges;
- nenhum segredo em logs, respostas, imagens Docker ou repositório;
- health check sem revelar configuração sensível;
- produção atrás de TLS; dev somente local/tailnet;
- backups e restore do PostgreSQL definidos antes de produção pública.

## 21. Critérios de aceitação do contrato

1. Uma capability do Lab pode ser executada pelo REST e testada sem depender da
   UI.
2. CLI e MCP, quando implementados, chamam a mesma capability sem duplicar regra.
3. Dois usuários não conseguem ler, alterar ou excluir recursos um do outro.
4. Uma busca multi-fonte preserva `source`, `sourceId`, `runId` e métricas de
   cobertura.
5. Uma busca pode terminar em `ok`, `partial`, `failed` ou `cancelled` sem
   perder o histórico da execução.
6. Duplicação entre fontes vira grupo transparente e não destrói proveniência.
7. Jobs longos têm estado consultável e retry idempotente.
8. PostgreSQL dev e prod são distintos; migrations estão no monorepo.
9. O Lab funciona sem backend próprio e sem Supabase.
10. Plan e Prof podem relacionar aula/evento por contrato sem banco ou backend
    separado.
11. Nenhum módulo acessa diretamente as tabelas internas de outro módulo.
12. O schema do contrato pode gerar schemas Zod/OpenAPI sem ambiguidades críticas.
13. Cada rota/capability que recebe identificador possui testes de isolamento e
    tentativa de ID adulterado.
14. O CI rejeita segredo detectado, dependência vulnerável sem tratamento ou
    achado crítico/alto sem aceite formal.
15. Auditorias assistidas por IA geram relatório antes de alteração automática,
    e as correções têm teste e revisão humana.

## 22. Decisões ainda abertas

Estas questões não bloqueiam a forma geral do CORE, mas devem ser fechadas antes
da implementação correspondente:

1. formato final e rotação da credencial Bearer do CLI/MCP;
2. implementação concreta de `Workspace` versus owner pessoal no primeiro schema;
3. sessão HTTP: armazenamento e revogação detalhados;
4. cursor/paginação final e limites por coleção;
5. momento em que o worker deixa o processo da API;
6. mecanismo de outbox/eventos entre módulos;
7. política de backup/restore PostgreSQL na VPS;
8. contrato de entrega de arquivos na Etapa 3;
9. spec própria do Plan e do Prof;
10. quando o Lib/Note entram no caminho crítico.

## 23. Próxima sequência documental

1. Validar este contrato por seções com Paulo.
2. Produzir o modelo de dados/migrations PostgreSQL do CORE e do Lab.
3. Definir schemas Zod e o OpenAPI inicial.
4. Definir testes de contrato das capabilities e dos adapters.
5. Só então implementar o vertical slice do UhHu Lab.

## 24. Relações

- [[ADR009 - Core Compartilhado Modular e PostgreSQL]]
- [[ADR008 - Multi-usuario e Ambientes Dev Prod]]
- [[ADR006 - Researcher Primeiro Produto]]
- [[ADR007 - Visao de Produto Hub IA de Pesquisa]]
- [[UhHu_Suite_Visao_2026-09-09]]
- [[UhHu_Researcher_v1_Spec]]
- [[UhHu_Prof_Inventario_Codebase_2026-09-09]]
