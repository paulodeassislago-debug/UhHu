---
tags:
  - uhhu
  - projeto
  - retomada
  - researcher
  - core
  - continuidade
date: 2026-09-06
status: ativo
tipo: snapshot de continuidade
---

# UhHu! — Contexto de Retomada

> Snapshot para iniciar uma nova sessão persistente. Elaborado a partir da documentação existente em `Projetos/UhHu/`; não houve consulta à web.

## 1. Estado atual

A última decisão consolidada está em [[UhHu_Fase0_Status_e_Hibernacao]]:

- A Fase 0 foi considerada concluída em 13/08/2026.
- O projeto foi colocado em hibernação por decisão de Paulo.
- O primeiro produto deixou de ser o UhHu! Lib.
- O projeto foi reorientado para o UhHu! Lab (anteriormente Researcher).
- A documentação antiga do Lib continua útil como fundamento arquitetural, mas não representa mais o caminho crítico.

Formulação central:

> O produto é a API/Core; as interfaces são substituíveis.

## 2. Origem do projeto

O problema original era melhorar a organização e a descoberta visual da biblioteca acadêmica:

- Zotero para bibliografia, leitura, annotations e referências;
- Nextcloud/WebDAV como armazenamento dos PDFs;
- Obsidian para elaboração do conhecimento;
- UhHu! Lib como estante visual, com capas, busca, filtros e navegação.

Princípio fundamental:

> O UhHu! deve referenciar os PDFs, não criar uma segunda biblioteca física.

Divisão de responsabilidades:

| Componente | Papel |
|---|---|
| Zotero | Autoridade bibliográfica e annotations |
| Nextcloud/WebDAV | Arquivos físicos |
| Obsidian | Conhecimento elaborado |
| UhHu! Core | Integração, domínio, proveniência e casos de uso |
| UhHu! Lib | Interface de descoberta — hoje suspensa |
| IA | Assistente, nunca autora do trabalho acadêmico |

Fontes: [[UhHu_Lib_Fase_0_Contexto_Atualizado]] e [[UhHu_ecossistema_visao_arquitetura]].

## 3. Gatilho da mudança

A descoberta de que o Zotero Mobile não suporta Linked Files destruiu a premissa inicial de construir uma estante autônoma sobre os PDFs do Nextcloud.

Raciocínio:

1. O mobile é requisito importante.
2. Linked Files não funcionam no mobile do Zotero.
3. A arquitetura baseada em PDF externo + Linked File não resolve todo o workflow.
4. Kerko já supre boa parte da função de estante, busca e facetas.
5. Zotero já supre cadastro, bibliografia e leitura.
6. Obsidian já supre elaboração e notas.
7. Construir outra UI de biblioteca teria pouca tese própria.

Resultado:

- UhHu! Lib ficou suspenso como produto.
- Se uma estante visual for necessária, o caminho preferencial é adaptar/forkar o Kerko, não construir uma UI do zero.
- O valor próprio do UhHu! está no Core/API, na integração e na memória do processo de pesquisa.

Essa decisão está na seção 23 de [[UhHu_ecossistema_visao_arquitetura]] e consolidada em [[ADR006 - Researcher Primeiro Produto]].

## 4. Primeiro produto: UhHu! Lab (ex-Researcher)

A nova dor identificada foi:

> A produção acadêmica brasileira, especialmente CAPES/Sucupira e BDTD, é difícil de pesquisar, não é bem exportada em formatos estruturados e não está integrada aos fluxos modernos de pesquisa.

O protótipo n8n `Pesquisa_Banco de Teses` demonstrou que era possível:

- consultar a API interna do catálogo da CAPES;
- paginar os resultados;
- extrair dados estruturados;
- acessar a ficha HTML de cada trabalho;
- recuperar resumo, palavras-chave e disponibilidade do PDF;
- produzir uma saída organizada para uma revisão de literatura.

O UhHu! Lab deve transformar esse protótipo em produto próprio, com memória persistente das pesquisas.

### Escopo v1

- Projetos de pesquisa;
- pergunta de pesquisa;
- histórico de buscas;
- filtros;
- reexecução de buscas;
- resultados estruturados;
- deduplicação;
- salvar, descartar e etiquetar resultados;
- proveniência: fonte, data, filtros e busca que originaram cada resultado;
- exportação CSV, BibTeX e JSON.

### Entidades iniciais

```text
Project
Search
Result
Source
DedupGroup
Provenance
```

### Fontes

- BDTD via OAI-PMH: fonte primária, oficial e estável;
- CAPES via endpoint interno `rest/busca`: fonte complementar, útil, mas não oficial e sujeita a quebras.

Documentação: [[ADR006 - Researcher Primeiro Produto]] e [[UhHu_Researcher_Analise_Workflow_CAPES]].

## 5. Validação técnica do Zotero Adapter

A investigação da Zotero Web API v3 foi feita com a biblioteca real e está marcada como validada em [[UhHu_Zotero_Adapter_Investigation]].

A API entrega:

- metadados;
- autores;
- coleções;
- attachments;
- identificação de `linked_file`;
- full-text indexado;
- relação item ↔ attachment;
- versões para sincronização incremental.

Caso real testado:

```text
Item: N77NQ47Q
Título: Complexidade, Saberes Científicos, Saberes da Tradição
Attachment: MFW6GPGG
Tipo: linked_file
```

O Zotero retornou:

```text
attachments:<nome-do-arquivo>.pdf
```

Foi confirmado que:

- `filename` pode vir como `null` em `linked_file`;
- o nome está embutido em `path`;
- o caminho é virtual;
- é necessário configurar explicitamente o mapeamento entre o diretório-base do Zotero e o storage;
- o full-text do PDF foi recuperado pela API sem baixar ou copiar o PDF;
- o PDF físico permaneceu exclusivamente no Nextcloud.

A decisão formal está em [[ADR002 - Resolução de Storage Reference]].

## 6. Stack arquitetural (revisada em 09/09/2026)

O [[ADR003 - Core Stack]] continua válido para TypeScript/Node, Fastify, Zod,
Drizzle, Docker e monorepo, mas a persistência e a topologia foram revisadas
pelo [[ADR009 - Core Compartilhado Modular e PostgreSQL]].

```text
apps/
├── core-api/       → UhHu CORE compartilhado (Fastify + REST)
├── lab/            → cliente UhHu Lab (Expo/web/nativo)
├── core-worker/    → jobs longos quando necessário
├── cli/            → superfície headless
└── mcp/            → superfície MCP

packages/
├── core/           → domínio e casos de uso
├── contracts/      → schemas e contratos REST/MCP/CLI
├── db/             → Drizzle + PostgreSQL + migrations
├── integrations/   → fontes e serviços externos
└── modules/        → Lab, Lib, Note, Plan e Prof
```

O CORE é um backend compartilhado modular; não há um backend independente por
app no início. PostgreSQL self-hosted é o banco canônico, com dev e produção
separados. SQLite fica reservado a cache, uso local e offline futuro.

## 7. Documentos antigos a reorientar

Estes documentos foram escritos para o Lib:

- [[UhHu_API_Initial_Spec]];
- [[UhHu_Lib_First_Vertical_Slice]];
- [[UhHu_Security_Notes]];
- [[UhHu_Deployment_Notes]].

Eles descrevem catálogo de biblioteca, sincronização Zotero, entrega de PDFs, thumbnails, OAuth, modo catálogo compartilhável e deploy do Lib.

A nota de status registra que precisam ser:

1. reorientados para o Researcher; ou
2. arquivados como documentação histórica do Lib.

Os ADRs 001–005 continuam como fundamentos, mas o ADR-006 define o caminho crítico atual.

## 8. Pendências reais para a retomada

1. Elaborar o contrato inicial do CORE: capabilities, módulos, autenticação, REST, CLI e MCP.
2. Definir e versionar o modelo de dados/migrations PostgreSQL do CORE, usando o legado apenas como material de pesquisa.
3. Implementar testes de contrato dos adapters BDTD/CAPES.
4. Só depois iniciar a implementação do vertical slice do UhHu Lab.

A autenticação multiusuário e a fronteira de dev/prod já foram decididas no
[[ADR008 - Multi-usuario e Ambientes Dev Prod]]. A arquitetura do monorepo, o
CORE compartilhado e o PostgreSQL estão decididos no [[ADR009 - Core Compartilhado Modular e PostgreSQL]].

## 9. Próximo artefato correto

O próximo artefato não é código nem uma nova UI:

```text
UhHu_CORE_Contrato_Inicial.md
```

Base:

- [[ADR009 - Core Compartilhado Modular e PostgreSQL]];
- [[UhHu_Researcher_v1_Spec]] (agora spec do UhHu Lab);
- [[UhHu_Researcher_Analise_Workflow_CAPES]];
- [[UhHu_Zotero_Adapter_Investigation]];
- [[ADR003 - Core Stack]].

Sequência documental:

```text
visão da suite + ADRs
  ↓
contrato do CORE compartilhado
  ↓
modelo de domínio e migrations PostgreSQL
  ↓
contratos dos adapters
  ↓
testes BDTD/CAPES
  ↓
implementação do UhHu Lab
```

## 10. Ramo paralelo

Também existe [[Jogo de Cartas - Funções Orgânicas (Projeto UhHu)]], criada em 21/08/2026, sobre um recurso didático de Química Orgânica: jogo de cartas, piloto com turma do 3º ano e possível digitalização futura.

Esse material parece ser um ramo educacional paralelo associado ao nome UhHu!, mas não altera as decisões arquiteturais do UhHu! Lab/Core.

## 11. Atualização de 09/09/2026 — decisão arquitetural da suite

Paulo confirmou a visão global da suite e a seguinte arquitetura:

- monorepo pnpm/TypeScript;
- UhHu CORE como backend compartilhado, headless e modular;
- Lab, Lib, Note, Plan e Prof como módulos/clientes, sem backend independente por app no início;
- REST, CLI e MCP como superfícies dos mesmos casos de uso;
- PostgreSQL self-hosted como banco canônico, fora do Supabase;
- bancos, volumes e credenciais separados entre dev e produção;
- SQLite somente para cache, uso local e offline;
- extração de serviços apenas quando houver necessidade operacional comprovada.

A decisão está formalizada em [[ADR009 - Core Compartilhado Modular e PostgreSQL]].

## Síntese

> O UhHu! começou como uma estante visual para a biblioteca do Zotero, descobriu que essa função era amplamente substituível, e pivotou para uma infraestrutura de pesquisa cujo primeiro produto é o UhHu Lab (anteriormente Researcher): memória persistente e coleta estruturada de pesquisas na BDTD e CAPES, com proveniência e sem transformar a IA em autora.
