---
tags:
  - uhhu
  - roadmap
  - suite
  - produto
  - core
date: 2026-09-09
status: rascunho para validação
tipo: roadmap geral de produto
---

# UhHu! — Roadmap Geral da Suite

> Prévia de alto nível para orientar o projeto inteiro. Este documento não é um
> cronograma, não fixa datas e não substitui o roadmap próprio de cada app.
> Ele organiza dependências, gates de lançamento e a ordem de aprendizado.

## 1. Princípio do roadmap

O UhHu! será construído durante meses ou anos, lançando um app por vez, mas
preservando desde o primeiro commit a visão da suite. O centro do produto é o
[[UhHu_CORE_Contrato_Inicial|UhHu! CORE]]: um backend compartilhado, modular e
headless, com REST, CLI e MCP como superfícies dos mesmos casos de uso.

A ordem abaixo significa:

- prioridade de produto e dependência arquitetural;
- sequência recomendada de validação no mundo real;
- gates para iniciar a etapa seguinte;
- não uma promessa de calendário nem uma obrigação de terminar todo o futuro
  antes de lançar algo útil.

O CORE não deve ser um framework vazio tentando prever todos os apps. O CORE v1
deve fornecer a fundação compartilhada e ser validado por um primeiro caso real
do Lab. As entidades e capacidades futuras só entram quando houver necessidade
semântica comprovada.

## 2. Sequência macro provisória

| Etapa | Foco | Resultado esperado | Estado |
|---|---|---|---|
| 0 | Fundação documental e preparação técnica | Decisões, contrato, segurança, monorepo e ambientes prontos | Em andamento |
| 1 | UhHu! CORE v1 | Núcleo compartilhado headless, multiusuário e modular | Próxima etapa |
| 2 | UhHu! Lab v1 | Primeiro app lançável: pesquisa BDTD/CAPES com memória e proveniência | Depois do CORE mínimo |
| 3 | UhHu! Lib v1 | Bibliografia integrada ao Zotero e BibTeX | Depois do Lab validado |
| 4 | UhHu! Note v1 | Notas conectadas a pesquisas e referências bibliográficas | Depois do Lib inicial |
| 5 | UhHu! Plan v1 | Agenda, horários, calendários e Google Calendar | Eixo Plan/Prof |
| 6 | UhHu! Prof v1 | Organização do trabalho docente sobre os contratos do CORE e do Plan | Eixo Plan/Prof |
| 7 | UhHu! Suite integrada v1 | Fluxos cruzados e experiência coerente entre os apps | Depois dos apps-base |
| 8 | Evolução da suite | Reader, IA, offline e eventuais extrações justificadas por evidência | Horizonte futuro |

## 3. Etapa 0 — Fundação documental e preparação

### Objetivo

Transformar a visão da suite em contratos verificáveis antes de produzir
funcionalidades de produto em escala.

### Entregas

- visão consolidada da suite: Lab, Lib, Note, Plan e Prof;
- [[ADR009 - Core Compartilhado Modular e PostgreSQL]] aceito;
- contrato inicial do CORE validado por seções;
- baseline de segurança, `AGENTS.md` e gates para desenvolvimento assistido por
  IA;
- monorepo pnpm/TypeScript definido;
- PostgreSQL self-hosted com dev e produção separados;
- modelo inicial e migrations versionadas;
- CI mínimo com typecheck, lint, testes, análise de segredos e SAST;
- critérios para autenticação, ownership, workspace, jobs e versionamento de
  contratos.

### Gate de saída

A etapa termina quando um desenvolvedor consegue iniciar o ambiente de dev,
executar o CORE contra PostgreSQL, validar a autenticação/isolamento e chamar
uma capability mínima sem depender de uma UI ou do Supabase.

A documentação histórica do projeto permanece no vault; a documentação limpa de
consumo DEV permanece em `/projetos/UhHu/dev-docs/`.

## 4. Etapa 1 — UhHu! CORE v1

### Objetivo

Entregar a fundação real e reutilizável de toda a suite, sem criar backends
separados por app.

### Escopo macro

- `platform`: usuários, autenticação, sessões, workspaces e permissões;
- ownership e isolamento server-side em todas as operações por identificador;
- contratos compartilhados em TypeScript/Zod/OpenAPI, com tipos globais como
  fonte única;
- convenções REST: erros, paginação, idempotência, versionamento e capabilities;
- fronteiras explícitas entre `lab`, `lib`, `note`, `plan`, `prof` e
  `integrations`;
- PostgreSQL, Drizzle, migrations, transações e testes de integração;
- jobs e `core-worker` somente onde houver operação longa real;
- observabilidade mínima, auditoria e tratamento de falhas;
- REST como superfície principal e uma superfície CLI/MCP mínima para provar
  que os mesmos casos de uso podem ser usados headlessly;
- security gates definidos em `08-security-baseline.md` e
  `/projetos/UhHu/AGENTS.md`.

### Não faz parte do CORE v1

- implementar antecipadamente todas as funcionalidades do Prof, Plan, Note ou
  Lib;
- criar cinco bancos ou cinco backends;
- transformar o CORE em gateway de backends;
- introduzir microsserviços sem necessidade comprovada;
- colocar IA como dependência para o CORE funcionar;
- congelar um modelo universal para conceitos que ainda podem ter semânticas
  diferentes, como `Task`, `Document` ou `Event`.

### Gate de saída

- dois usuários não conseguem atravessar o isolamento um do outro;
- contratos podem ser consumidos por REST e por pelo menos uma superfície
  headless sem duplicar regra de negócio;
- migrations reproduzem o banco de dev;
- typecheck, testes de autorização, scanners e revisão humana passam;
- uma capability mínima do Lab é executável sem frontend.

## 5. Etapa 2 — UhHu! Lab v1

### Objetivo

Lançar o primeiro produto da suite: um gerenciador de pesquisas e buscas sobre a
produção científica brasileira, começando por BDTD e CAPES.

### Escopo macro

- projetos de pesquisa;
- buscas versionadas e `SearchRun` temporal;
- execução multi-fonte com BDTD e CAPES;
- resultados com `source`, `sourceId`, `runId` e proveniência;
- estados de execução `ok`, `partial`, `failed` e `cancelled`;
- deduplicação transparente, preservando divergência e origem por fonte;
- decisões de elegibilidade: elegível, não elegível e indeciso;
- tags, seleção e comparação entre buscas;
- exportação BibTeX de teses/dissertações selecionadas e incluídas;
- frontend inicial consumindo somente o CORE;
- retry, rate limit, timeout e circuit breaker dos adapters;
- suporte ao uso multiusuário desde o início.

### Fora do Lab v1

- triagem avançada por IA;
- escrita automática de trabalho acadêmico;
- Reader completo;
- tentar substituir Zotero ou Obsidian;
- garantir cobertura total da produção brasileira a partir de duas fontes.

### Gate de saída

Um pesquisador consegue criar um projeto, executar uma busca em BDTD/CAPES,
acompanhar uma execução parcial ou concluída, revisar resultados, identificar
duplicatas, registrar decisões e exportar um corpus com proveniência, sem
precisar manipular o banco ou uma automação externa.

O detalhe funcional vigente está em [[UhHu_Researcher_v1_Spec]], que representa
o Lab antes da mudança de nome.

## 6. Etapa 3 — UhHu! Lib v1

### Objetivo

Oferecer uma camada bibliográfica própria da suite, mantendo Zotero como
integração/autoridade quando conectado e evitando reinventar ferramentas que já
funcionam.

### Escopo macro

- documentos bibliográficos e metadados normalizados;
- coleções, etiquetas e organização bibliográfica;
- importação e exportação BibTeX com round-trip verificável;
- adapter Zotero com sincronização e tratamento de conflitos;
- envio de resultados selecionados do Lab para a biblioteca;
- proveniência da origem do registro e distinção entre cache e fonte de verdade;
- contratos para referências consumíveis pelo Note;
- abstração de storage sem assumir que o PDF será servido pelo Lib v1.

### Decisões de contenção

- não construir uma estante visual do zero quando Kerko ou um fork puder atender;
- não transformar o Lib em cópia do Zotero;
- não colocar arquivos/PDFs no caminho crítico antes de reabrir as decisões de
  storage e entrega;
- não deslocar a autoridade bibliográfica do Zotero sem uma razão demonstrada.

### Gate de saída

Um item vindo do Lab ou do Zotero pode ser importado, organizado, exportado e
referenciado novamente sem perda silenciosa de metadados, identificadores ou
proveniência.

## 7. Etapa 4 — UhHu! Note v1

### Objetivo

Criar um espaço próprio de elaboração conectado ao Lab e ao Lib, e não apenas
mais um editor de notas genérico.

### Escopo macro a validar

- notas em formato aberto e exportável;
- referências explícitas a documentos do Lib, resultados do Lab, projetos e
  outras notas;
- links bidirecionais ou grafo somente se resolverem uma necessidade real;
- citações e contexto bibliográfico derivados do Lib;
- organização por projeto de pesquisa;
- integração com Zotero por meio do Lib;
- importação/exportação que evite aprisionamento no UhHu.

### Risco de produto

Obsidian já resolve uma parte relevante do uso real de notas. O Note só se
justifica se a integração nativa entre pesquisa, bibliografia, notas e eventual
leitura produzir uma vantagem concreta que não seja apenas trocar o editor.

### Gate de saída

O usuário consegue transformar um resultado de pesquisa ou documento
bibliográfico em uma nota contextualizada, manter a referência sem duplicação e
exportar o conteúdo sem perder autoria, links ou metadados essenciais.

## 8. Etapa 5 — UhHu! Plan v1

### Objetivo

Entregar a agenda inteligente da suite e estabelecer o vocabulário de tempo,
calendário e compromissos que será consumido pelo Prof.

### Escopo macro

- calendários acadêmicos, unidades, feriados e períodos;
- horários, turnos e disponibilidade;
- itens de agenda e tarefas operacionais, com semântica própria claramente
  separada de tarefas pedagógicas do Prof;
- integração OAuth segura com Google Calendar;
- sincronização idempotente e rastreável;
- relação explícita entre item interno e evento externo;
- funcionamento útil mesmo sem Google Calendar conectado;
- capabilities consumíveis por REST, CLI e MCP.

### Gate de saída

O usuário consegue planejar uma agenda, detectar conflitos, sincronizar com o
Google Calendar de forma segura e idempotente, recuperar falhas e continuar
usando o Plan sem depender da integração externa.

## 9. Etapa 6 — UhHu! Prof v1

### Objetivo

Reescrever o antigo Planner-Docente como o app de organização do trabalho
profissional docente, aproveitando requisitos reais do legado, mas sem copiar sua
arquitetura Supabase.

### Escopo macro a reespecificar

- escolas, turmas e disciplinas;
- conteúdos e planejamento;
- aulas e geração automática com validação de conflitos;
- modelos de aula e sequências didáticas;
- tarefas pedagógicas;
- relações com itens do Plan;
- biblioteca/arquivos apenas conforme contrato do Lib e do storage;
- exportações e documentos que sobreviverem à validação de uso;
- operação sem Google Calendar, com integração opcional pelo Plan.

### Regra sobre o legado

A codebase `planner-docente` e o export do Supabase são material de pesquisa e
extração de requisitos. O Prof será reescrito do zero, com TypeScript, contratos
compartilhados, PostgreSQL, autorização no CORE e migrations versionadas.

### Por que o Plan vem primeiro dentro deste eixo

O Prof conversa diretamente com o Plan, mas não deve absorver ou duplicar o
domínio de agenda. Construir primeiro o núcleo do Plan estabiliza calendário,
horários, conflitos e a relação com eventos externos. O Prof continua sendo um
app de destaque; a ordem evita que sua reescrita carregue uma segunda agenda
incompatível.

### Gate de saída

Um professor consegue organizar seu contexto escolar, planejar e gerar aulas,
registrar sequências e tarefas, detectar conflitos e relacionar o trabalho
pedagógico à agenda do Plan, mantendo o sistema funcional mesmo sem Google
Calendar.

## 10. Etapa 7 — UhHu! Suite integrada v1

### Objetivo

Depois que os apps individuais provarem valor, transformar a suite em uma
experiência coerente, sem obrigar todos os apps a serem implementados ao mesmo
tempo.

### Fluxos prioritários

1. Lab → Lib: resultado selecionado vira registro bibliográfico preservando
   fonte, identificadores e proveniência.
2. Lib → Note: documento vira referência/citação em uma nota.
3. Lab → Note: projeto, resultado ou decisão é contextualizado em notas.
4. Plan ↔ Prof: agenda, horários, aulas e tarefas se relacionam por contrato,
   sem banco compartilhado informal.
5. CORE → CLI/MCP: as capabilities úteis ficam disponíveis para automação e IA
   com schemas, permissões, confirmação de ações destrutivas e auditoria.
6. Identidade/workspace: o usuário percebe uma suite, com isolamento e
   autorização consistentes.

### Gate de saída

Os fluxos cruzados funcionam sem cópia manual frágil, sem chamadas diretas de uma
UI para o banco de outro módulo e sem regras divergentes entre REST, CLI e MCP.

## 11. Etapa 8 — Evolução posterior

Somente depois de uso real e evidência suficiente:

- Reader próprio, caso Zotero e ferramentas existentes não atendam ao fluxo
  integrado;
- assistência de IA para busca, organização, síntese e navegação, sempre com
  proveniência, revisão humana e limites de autoria;
- modo offline/desktop, usando SQLite apenas como armazenamento local/cache com
  sincronização deliberada;
- integrações adicionais, como Nextcloud, conforme necessidade real;
- extração de módulos para serviços independentes somente por necessidade
  operacional comprovada;
- recursos de colaboração e workspaces compartilhados além do modelo inicial.

## 12. Roadmap próprio de cada app

Cada etapa deve gerar ou atualizar um documento específico antes da
implementação. O roadmap do app deve conter, no mínimo:

1. tese do produto e dor que não é resolvida adequadamente pelas ferramentas
   existentes;
2. usuário-alvo e jornada principal;
3. escopo v1 e não-escopo explícito;
4. capacidades do CORE utilizadas ou adicionadas;
5. entidades sob responsabilidade do módulo e contratos com outros módulos;
6. integrações externas e comportamento quando estiverem indisponíveis;
7. superfícies REST, CLI, MCP e frontend;
8. tipos globais compartilhados e regras de frontend;
9. ameaças, autorização, isolamento, dados sensíveis e gates de segurança;
10. critérios de aceitação, métricas de validação e gate de lançamento;
11. estratégia de migrations, jobs, observabilidade e rollback;
12. aprendizados pós-implementação e mudanças documentais necessárias.

## 13. Regras para mudar a ordem

A ordem pode mudar se a evidência mudar, mas a mudança deve ser registrada com
motivo explícito. Exemplos aceitáveis:

- uma dor de usuário tornar o Plan mais urgente que o Lib;
- uma integração do Lib bloquear materialmente o Lab;
- validação mostrar que o Note não tem tese própria;
- uma necessidade operacional justificar separar um serviço;
- o legado revelar um requisito crítico para o Prof que precise ser resolvido
  antes do Plan.

Não são motivos suficientes:

- vontade de começar pela tela mais atraente;
- facilidade de gerar uma UI sem contrato;
- pressão para implementar IA antes de haver dados e proveniência;
- copiar código legado para obter sensação de progresso;
- criar microserviços ou schemas futuros sem necessidade demonstrada.

## 14. Próximos passos imediatos

1. Validar este roadmap macro com Paulo.
2. Concluir a validação por seções do contrato do CORE.
3. Criar o roadmap/spec operacional do CORE v1.
4. Montar o modelo inicial e as migrations PostgreSQL.
5. Criar o monorepo mínimo com os gates de segurança antes do primeiro slice.
6. Revalidar o contrato dos adapters BDTD/CAPES.
7. Implementar o primeiro vertical slice do UhHu! Lab.

## 15. Relações

- [[UhHu_Suite_Visao_2026-09-09]]
- [[ADR009 - Core Compartilhado Modular e PostgreSQL]]
- [[UhHu_CORE_Contrato_Inicial]]
- [[UhHu_Researcher_v1_Spec]]
- [[UhHu_Prof_Inventario_Codebase_2026-09-09]]
- [[UhHu_Security_Notes]]
- [[UhHu_Deployment_Notes]]
