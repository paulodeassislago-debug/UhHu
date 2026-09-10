---
tags:
  - uhhu
  - adr
  - core
  - arquitetura
  - monorepo
  - postgresql
date: 2026-09-09
status: aceito
tipo: decisão arquitetural
---

# ADR-009 — Core compartilhado modular e PostgreSQL

**Projeto:** UhHu!  
**Produto:** UhHu! Suite / UhHu! CORE  
**Fase:** Fundação da suite  
**Status:** ACEITO  
**Data:** 09/09/2026  
**Tipo:** Decisão de arquitetura e persistência  
**Relacionados:** [[ADR003 - Core Stack]] · [[ADR008 - Multi-usuario e Ambientes Dev Prod]] · [[ADR006 - Researcher Primeiro Produto]] · [[UhHu_Suite_Visao_2026-09-09]] · [[UhHu_Researcher_v1_Spec]]

> Esta decisão revisa a escolha de SQLite como banco principal feita no ADR-003
> e mantida no ADR-008. A escolha de TypeScript/Node, Fastify, Zod, Drizzle,
> Docker, monorepo e API-first permanece válida.

## 1. Contexto

A visão de produto foi ampliada: o UhHu! é uma suite composta por Lab, Lib,
Note, Plan e Prof, construída sobre o UhHu! CORE. O CORE deve ser headless,
servindo REST, CLI e MCP, e os apps serão lançados um por vez.

O Planner-Docente legado também revelou uma fronteira natural entre Plan e Prof:
calendários/horários/Google Calendar de um lado; escolas, turmas, aulas,
sequências e tarefas pedagógicas de outro. O Lab, Lib e Note acrescentam outros
contextos, mas precisam compartilhar identidade, contratos e referências.

As decisões anteriores foram tomadas para um cenário menor, principalmente
single-instance e pessoal, com SQLite + FTS5. Entretanto, o v1 do Lab já foi
decidido como multiusuário, com ambientes dev/prod separados, e a suite terá
sincronizações, workers e múltiplos clientes.

A extração do legado confirmou que o schema histórico também é PostgreSQL. Isso
facilita o reaproveitamento conceitual, mas não justifica copiar o schema ou a
arquitetura Supabase sem revisão.

## 2. Decisão

### 2.1. Monorepo permanece como organização do código

O UhHu! será desenvolvido em um **monorepo pnpm/TypeScript**. O monorepo
compartilhará contratos, tipos, módulos de domínio, migrations, integrações,
clientes e testes.

Monorepo não significa que todos os apps serão uma única UI nem impede processos
ou deploys separados no futuro.

### 2.2. Um CORE backend compartilhado, modular

Inicialmente haverá um **UhHu! CORE API** compartilhado, com Fastify, autenticação
comum, casos de uso e acesso à persistência. Lab, Lib, Note, Plan e Prof serão
módulos de domínio e clientes da API; não haverá um backend independente por app
no início.

O CORE não será uma API-gateway fina que apenas encaminha requisições para cinco
backends. Ele será o backend principal da suite e dono das regras de integração.

### 2.3. Módulos com fronteiras explícitas

O backend será um modular monolith no início, com módulos de domínio como:

- `platform`: usuários, workspaces, autenticação e permissões;
- `lab`: projetos de pesquisa, buscas, execuções, resultados e deduplicação;
- `lib`: documentos bibliográficos, coleções, BibTeX e adapter Zotero;
- `note`: notas, links e referências a documentos;
- `plan`: agenda, calendários, horários e conexões de calendário externo;
- `prof`: escolas, turmas, disciplinas, aulas, sequências e tarefas pedagógicas;
- `integrations`: Zotero, Google Calendar, Nextcloud, BDTD e CAPES.

Cada módulo será dono de suas regras e tabelas. O acesso entre módulos ocorrerá
por casos de uso, contratos ou eventos explícitos — não por leitura direta das
tabelas internas de outro módulo.

Entidades com nomes semelhantes não serão unificadas sem validação semântica.
Por exemplo, uma tarefa pedagógica do Prof e uma tarefa operacional do Plan podem
se relacionar sem serem necessariamente a mesma entidade.

### 2.4. REST, CLI e MCP serão superfícies do mesmo CORE

O CORE exporá uma API REST como contrato principal. O CLI e o server MCP serão
adaptadores para os mesmos casos de uso e contratos do CORE, sem duplicar regras
de negócio.

Quando houver necessidade de tarefas longas — buscas, sincronizações ou
processamento — poderá existir um `core-worker` separado como processo, mantendo
o mesmo monorepo, domínio e banco. Isso não constitui um backend independente por
app.

### 2.5. PostgreSQL como persistência canônica

O CORE usará **PostgreSQL self-hosted**, fora do Supabase, como banco oficial da
suite. Dev e produção terão bancos/instâncias separados desde o início.

As migrations serão versionadas no repositório. O modelo do legado será usado
como material de pesquisa e migração, não como schema intocável.

PostgreSQL é escolhido por:

- multiusuário e concorrência de escrita;
- transações, constraints, foreign keys e locks;
- persistência de buscas, resultados, decisões e proveniência;
- jobs de sincronização do Plan e dos adapters do Lab;
- JSONB para metadados brutos de fontes externas;
- recursos de busca textual e indexação;
- compatibilidade conceitual com o legado Planner-Docente;
- menor risco de uma migração no momento em que a suite já estiver grande.

### 2.6. SQLite fica reservado para uso local

SQLite não será o banco canônico do CORE. Poderá ser utilizado quando houver
necessidade concreta de:

- cache local;
- catálogo offline;
- armazenamento local do CLI ou de uma aplicação desktop;
- dados temporários ou testes unitários isolados.

Não haverá dois dialetos tratados como fontes de verdade equivalentes. Testes de
integração do CORE usarão PostgreSQL para refletir o ambiente oficial.

### 2.7. Extração futura de serviços depende de evidência

Um módulo só poderá ser extraído para um backend/serviço independente quando
houver necessidade comprovada de escala, isolamento, ciclo de deploy, segurança,
equipe ou disponibilidade. A extração deverá preservar contratos do CORE e ser
feita sem transformar prematuramente a suite em uma arquitetura de microsserviços.

### 2.8. Reaproveitamento do Planner-Docente

Serão reaproveitados, após análise:

- vocabulário e relações de escolas, turmas, disciplinas e aulas para o Prof;
- calendários acadêmicos, horários e turnos para o Plan;
- conhecimento da integração OAuth/Google Calendar;
- regras de geração de aulas, conflitos, modelos e sequências;
- exportação e demais funcionalidades que sobreviverem à especificação.

Não serão copiados diretamente como arquitetura nova:

- autenticação e RLS específicos do Supabase;
- Edge Functions como fronteira de negócio;
- armazenamento de refresh token em coluna simples de perfil;
- acoplamento de `google_calendar_event_id` diretamente ao modelo de aula;
- ausência de migrations versionadas.

## 3. Consequências positivas

- Um único contrato de identidade e autorização para toda a suite.
- Lab, Plan e Prof podem compartilhar referências sem sincronização entre bancos.
- REST, CLI e MCP expõem os mesmos casos de uso e não criam três implementações.
- O monorepo facilita mudanças coordenadas e versionamento dos contratos.
- O PostgreSQL atende melhor ao multiusuário já decidido e aos workers futuros.
- O conhecimento do schema PostgreSQL legado pode ser aproveitado sem manter a
  dependência do Supabase.
- Um módulo continua extraível no futuro porque suas fronteiras são explícitas.

## 4. Consequências negativas / trade-offs

- PostgreSQL exige um serviço, volume, migrations e rotina de backup; SQLite era
  operacionalmente mais simples.
- Um CORE compartilhado exige disciplina para não virar um monólito acoplado.
- O desenho modular e os contratos entre contextos custam mais trabalho inicial.
- A operação de dev/prod exige bancos separados e cuidado no deploy.
- Offline não será obtido automaticamente pelo banco principal; exigirá cache e
  sincronização deliberados quando entrar no escopo.
- A migração do legado exigirá separar conceitos que antes estavam combinados,
  especialmente aula, evento de calendário, perfil e credencial.

## 5. Critérios de aceitação

1. O Lab funciona consumindo o CORE API compartilhado, sem um backend Lab
   independente.
2. O CORE serve autenticação, contratos e persistência PostgreSQL para os módulos
   ativos, com isolamento por usuário/workspace.
3. Dev e produção usam bancos PostgreSQL distintos.
4. Migrations e schema do CORE são versionados no monorepo.
5. CLI e MCP conseguem invocar casos de uso do CORE sem duplicar regras de
   negócio.
6. O módulo Prof consegue ser implementado a partir do legado sem depender do
   Supabase.
7. Plan e Prof conseguem relacionar aulas/itens de agenda por contrato explícito,
   sem exigir que cada um mantenha um backend próprio.
8. SQLite, quando usado, é claramente cache/local e não fonte canônica.

## 6. Relação com documentação anterior

- Substitui a escolha de SQLite como banco principal do [[ADR003 - Core Stack]].
- Substitui a cláusula de SQLite como persistência do v1 em [[ADR008 - Multi-usuario e Ambientes Dev Prod]].
- Mantém a decisão de monorepo, TypeScript/Node, Fastify, Zod, Drizzle e Docker
  do ADR-003.
- Complementa [[ADR006 - Researcher Primeiro Produto]]: Researcher é agora
  **UhHu! Lab**, o primeiro cliente/módulo do CORE compartilhado.
- Reorienta a arquitetura da [[UhHu_Researcher_v1_Spec]] para `core-api` +
  PostgreSQL.
- Formaliza a visão de suite de [[UhHu_Suite_Visao_2026-09-09]].

## 7. Status

**ACEITO — Fase de fundação da suite (09/09/2026).**

Esta é a referência atual para organização do monorepo, topologia inicial do
backend e escolha de persistência do UhHu! CORE.

## 8. Próximo documento

Revisar a especificação do UhHu! Lab e elaborar o contrato inicial do CORE antes
de qualquer implementação.