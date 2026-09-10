---
tags:
  - uhhu
  - suite
  - visao
  - core
  - plano-de-produto
date: 2026-09-09
status: canônico (validar com Paulo)
tipo: visão de produto consolidada
---

# UhHu! — Visão consolidada da Suite (09/09/2026)

> Documento canônico da suite. Consolida a conversa de 09/09/2026 em que Paulo
> fechou a visão de produto: **UhHu! é uma SUITE de apps, não um app**.
> Substitui snapshots anteriores como visão única de produto; os ADRs e specs
> continuam válidos como fundação técnica.

## 1. A tese central

> **UhHu! é uma suíte de aplicativos que compartilham um mesmo núcleo (UhHu! CORE).**
> O CORE é a API — construída desde o passo zero pensando na integração de toda a
> suite. Foco headless: a API deve ser integrada com IA (server MCP) e ter uma
> versão CLI.

Princípios herdados (não reabertos):

- Produto = API/Core; interfaces são substituíveis (ADR-007 §23).
- Cada tipo de dado tem um dono claro (single source of truth — §8 do ecossistema).
- IA auxilia o pesquisador; não substitui o pesquisador.
- Não antecipar funcionalidades; apenas evitar decisões que fechem portas.
- Lançar por partes: **um app de cada vez**, com o projeto maior sempre em mente.
- Horizonte: meses/anos, sem pressa.

## 2. Mapa da suite

| App | Papel | Correspondência na doc | Status |
|---|---|---|---|
| **UhHu! Lab** | Gerenciador de pesquisas e buscas da pesquisa científica brasileira | ex-**Researcher** (ADR-006/007; spec v1 validada 06/09) | **PRIMEIRO a desenvolver** — caminho crítico |
| **UhHu! Lib** | Gerenciador bibliográfico: integra Zotero, importa/exporta BibTeX, organiza bibliografia | ADR-001/002/004/005 (suspenso 13/08, reabilitado 06/09) | Fora do caminho crítico |
| **UhHu! Note** | Gerenciador de notas (inspiração Obsidian), integra Lib, Zotero e eventual Reader | — (novo na visão da suite) | **Decisão de Paulo: produto próprio desde o início** (09/09) |
| **UhHu! Plan** | Agenda inteligente, integra Google Calendar | ex-**Planner** (memória operacional) | Rascunho conceitual |
| **UhHu! Prof** | O mais destacado da suite; organização do trabalho docente; conversa diretamente com o Plan | ex-**UhHu! Planner Docente** (repo `planner-docente`, privado) | **REESCRITA decidida** — codebase antiga só pesquisa por ora |
| **UhHu! CORE** | A API da suite. Construída do zero pensando a integração de todos os apps. **Headless**: MCP server + CLI | Já é o pivô (ADR-007) | Fundação |

Diagrama conceitual:

```text
                        UHHU! CORE  (API headless)
                    REST  ·  MCP server  ·  CLI
                                │
        ┌───────────┬───────────┼───────────┬───────────┐
        │           │           │           │           │
      Lab         Lib         Note        Plan        Prof
   (pesquisas) (bibliografia) (notas)   (agenda)   (trabalho docente)
  [1º app]       [2º?]        [3º?]      [4º?]      [5º? — destaque comercial]
```

## 3. Decisões fechadas em 09/09/2026

1. **UhHu! Lab = novo nome comercial do Researcher** (hub de pesquisas BDTD/CAPES;
   spec v1 validada em 06/09 segue valendo como spec do Lab).
2. **UhHu! Prof = antigo "UhHu! Planner Docente"**, repo privado em
   `github.com/paulodeassislago-debug/planner-docente` (clonado em
   `/projetos/UhHu/planner-docente` na VPS).
3. **Reescrita do Prof decidida, porém NÃO iniciada.** Ordem de Paulo (09/09):
   *só pesquisa* da codebase antiga por enquanto. Inventário em
   [[UhHu_Prof_Inventario_Codebase_2026-09-09]].
4. **UhHu! Note nasce como produto próprio** (UI de notas independente do Obsidian),
   por decisão de Paulo. *Risco registrado pelo agente (sem anestesia): Obsidian já
   supre notas no workflow real; o Note só se justifica se a tese for integração com
   Lib/Zotero/Reader dentro da suite, não "mais um editor de notas".*
5. **Ordem de lançamento:** Lab → (demais apps), um de cada vez.

## 4. UhHu! CORE — o que nasce agora (fundação)

- Desenhado em **capacidades** (ações semânticas: `buscar`, `deduplicar`,
  `importar_bibtex`, `criar_tarefa`), não CRUD cru — isso é o que barateia
  MCP e CLI (um tool do MCP = uma capacidade com schema).
- Domínio único compartilhado entre os apps: `Project`, `Document`, `Note`,
  `Task`, `Search`, `Source`, proveniência. (Já esboçado em §12–13 do
  ecossistema; entidades de Researcher já validadas.)
- Contraprova da estrutura: **Prof conversa com Plan** só porque ambos falam a
  mesma língua (`Task`/`Agenda`) no Core.
- Auth multi-usuário (ADR-008) e fronteira dev/prod na VPS permanecem.

## 4b. Herança do Planner-Docente (decidido 09/09)

O antigo **UhHu! Planner Docente** é o ancestral de DOIS apps da suite. Cada um
herda uma fatia:

| App herdeiro | Herda do Planner-Docente |
|---|---|
| **UhHu! Plan** | Calendário acadêmico (calendarios_academicos, unidades, feriados), horários (horarios, turnos), e **integração Google Calendar** (aulas.google_calendar_event_id; profiles.is_google_calendar_connected + google_provider_refresh_token; edge functions google-calendar-sync / google-calendar-disconnect) |
| **UhHu! Prof** | Escolas, turmas, disciplinas, conteúdos, geração de aulas com validação de conflito, modelos de aula, sequências didáticas, tarefas por disciplina, biblioteca de arquivos |

> **Fato validado por extração do Supabase (09/09):** a codebase antiga JÁ tinha
> integração Google Calendar funcional — refresh token em `profiles`, eventos
> criados via OAuth2 em `aulas`, edge functions de sync/disconnect. Isso reduz o
> risco do Plan: o padrão de OAuth Google já foi implementado e testado antes.
> Substitui itens das pendências que previam "validar integração GC do zero".

## 4c. Arquitetura de runtime e persistência (decidido 09/09)

- O projeto permanece em **monorepo pnpm/TypeScript**.
- O primeiro runtime é um **UhHu CORE backend compartilhado e modular** (modular monolith), não um backend independente por app e não um gateway que apenas conecta cinco backends.
- Lab, Lib, Note, Plan e Prof são módulos/clientes do CORE. REST, CLI e MCP são superfícies dos mesmos casos de uso.
- Um `core-worker` poderá existir para buscas e sincronizações longas, sem se tornar um backend independente por app.
- **PostgreSQL self-hosted** é a persistência canônica, fora do Supabase, com bancos/instâncias separados para dev e produção e migrations versionadas no monorepo.
- SQLite fica reservado a cache, uso local e offline; não é a fonte de verdade do servidor.
- A extração de um módulo para serviço separado só ocorrerá diante de necessidade operacional comprovada.

Esta decisão está formalizada em [[ADR009 - Core Compartilhado Modular e PostgreSQL]]. O contrato inicial do CORE está em [[UhHu_CORE_Contrato_Inicial]] (rascunho v0.1, pendente de validação por seções).

## 5. Pendências

1. Validar este documento com Paulo (por seções, padrão do projeto).
2. Inventário da codebase do Prof → extração de features em spec (QUANDO Paulo
   autorizar; hoje: só pesquisa, ver [[UhHu_Prof_Inventario_Codebase_2026-09-09]]).
3. Gh CLI instalado e autenticado na VPS (conta paulodeassislago-debug,
   escopos repo/read:org/gist) — 09/09/2026.
4. Caminho de acesso do Paulo à Zorin permanece pendente (não necessário: repo
   já clonado via gh autenticado).
5. Note: definir relação com Obsidian e escopo do eventual Reader (risco de
   reverter a decisão 13/08 — Zotero Reader já resolve leitura/anotação).

## 6. Relações

- [[ADR006 - Researcher Primeiro Produto]] (Lab = Researcher, renomeado)
- [[ADR007 - Visao de Produto Hub IA de Pesquisa]] (visão hub; suite amplia)
- [[ADR008 - Multi-usuario e Ambientes Dev Prod]]
- [[ADR009 - Core Compartilhado Modular e PostgreSQL]]
- [[UhHu_Roadmap_Geral_2026-09-09]] (roadmap macro da suite, rascunho)
- [[UhHu_CORE_Contrato_Inicial]] (contrato v0.1, em validação)
- [[UhHu_Researcher_v1_Spec]] (spec do Lab, validada)
- [[UhHu_Prof_Inventario_Codebase_2026-09-09]] (pesquisa da codebase antiga)
- [[UhHu_ecossistema_visao_arquitetura]] (fundação conceitual)