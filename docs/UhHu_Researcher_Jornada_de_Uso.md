---
tags:
  - uhhu
  - researcher
  - jornada
  - fluxo-de-uso
  - spec
date: 2026-09-06
updated: 2026-09-09
status: ativo
tipo: fluxo de uso / jornada do usuário
---

# UhHu! Lab — Jornada do Usuário (v1)

> Base: sessão de 06/09/2026 com Paulo + [[ADR006 - Researcher Primeiro Produto]].
> Documento de fluxo de uso do UhHu Lab; alimenta a `UhHu_Researcher_v1_Spec.md`,
> cujo nome físico permanece histórico para preservar links.
> Nome anterior do produto: "Researcher".

## A jornada em três etapas

1. **Busca** — exploração e comparação de estratégias de busca;
2. **Corpus** — seleção com critérios de inclusão/exclusão (elegibilidade);
3. **Análise** — leitura, arquivo original e registro das análises (rascunho; detalhes em sessão futura).

---

## Etapa 1 — Busca

### Regras de negócio (validadas por Paulo, 06/09/2026)

- O usuário pode ter **um ou vários projetos**.
- Cada **projeto** pode ter **várias buscas**.
- Cada **busca** possui um conjunto de **premissas**: descritores/termos, operadores booleanos, filtros (ano, grau/tipo, área, instituição, programa), limite temporal, bases de dados (BDTD, CAPES — uma ou várias por busca).
- Cada busca é **salva individualmente na database com data e hora** — registrada temporalmente (snapshot por execução).
- **Propósito explícito**: o usuário compara buscas com parâmetros e termos diferentes para decidir qual melhor define o corpus da pesquisa.

### Entidades decorrentes

- `Project` (1..n por usuário): título, pergunta de pesquisa, status (ativo/arquivado).
- `Search` (1..n por projeto): **definição declarativa** da busca — query (descritores + booleanos), filtros, limite temporal, bases selecionadas. Não é uma execução; é a "estratégia".
- `SearchRun` (1..n por busca): **execução temporal** — data/hora, resultados do snapshot, métricas agregadas no momento da execução (nº resultados, distribuição por ano/fonte).
- `Result`: item encontrado (título, autor, instituição, programa, ano, resumo, link, fonte, URL) com proveniência (run + fonte).
- `DedupGroup`: duplicatas entre bases, agrupadas com transparência.

### Decisões tomadas

- Reexecução **versiona**: rodar a mesma busca cria novo `SearchRun`; resultados ausentes no run anterior são marcados como **novos**.
- Toda busca executada fica no **histórico do projeto** (memória); "salvar" é um ato sobre resultados, não sobre a busca.
- **Comparação entre buscas é requisito de primeira classe**: visão comparativa (nº de resultados, sobreposição, distribuições) para decidir qual estratégia entra no corpus. Viabilizada pelos agregados de cada `SearchRun`.

### Decisões tomadas (validadas por Paulo, 06/09/2026)

- Exportação: seleção + "todo o incluído do projeto"; CSV/BibTeX/JSON; BibTeX com entry type `thesis` (school = instituição, type = grau).
- Dedup: automático com transparência — grupo de duplicatas como card único, expansível; salvar/descartar opera no grupo com opção de divergir por base.

---

## Etapa 2 — Corpus

### Regras de negócio (validadas por Paulo, 06/09/2026)

- O usuário define **critérios de inclusão e exclusão** dos trabalhos (declarados no projeto) para decidir quais itens entram no corpus.
- A decisão é aplicada **item a item** sobre os resultados (lendo título/resumo).
- **Etiquetas (tags)** dão o vocabulário da decisão: livres, escolhidas pelo usuário, com sugestão de default pelo sistema.

### Entidades decorrentes

- Decisão de elegibilidade por item: **elegível / não elegível / indeciso** — terminologia de triagem de elegibilidade (estilo PRISMA) **validada por Paulo (06/09/2026)** como vocabulário do domínio (substitui "salvo/descartado").
- `Tag`: livre por projeto, com autocomplete das já usadas e defaults sugeridos.
- **Corpus = view derivada** dos itens elegíveis (não entidade paralela — evita divergência entre "salvo no corpus" e "marcado incluído").

---

## Etapa 3 — Análise (rascunho, fora do v1)

- **Upload do arquivo original** de cada trabalho: porta aberta — arquivo físico no Nextcloud (WebDAV); mecanismo zip+prop validado em produção (23/08) será o caminho do Core quando esta etapa entrar. ADR-002/004 reabrem **neste momento**, não antes ([[ADR007 - Visao de Produto Hub IA de Pesquisa]] §2.4).
- **Registro de informações sobre as análises** feitas de cada trabalho (campos e formato a definir em sessão futura).
- Não desenhar agora; apenas não fechar portas no modelo (ex.: `Result` não engessado contra futura ligação a arquivo/notas).

---

## Linguagem de busca e capacidade das fontes (fato a calibrar)

- O UhHu Lab normaliza uma **linguagem de busca própria**: descritores + operadores booleanos + campos + período.
- Cada adapter (BDTD via API VuFind, CAPES `rest/busca`) **traduz o que a fonte honra**; onde não honra (booleanos na CAPES não confirmados), a filtragem complementar é local (título/resumo).
- O schema nasce com a linguagem completa — o Core não é limitado pela fonte mais limitada.
- A API VuFind da BDTD foi validada em 06/09/2026; comportamento real de termos/booleanos e mudanças nas fontes continuam monitorados.

## Relações

- [[ADR006 - Researcher Primeiro Produto]] — UhHu Lab (ex-Researcher), escopo v1 e critérios de aceitação.
- [[ADR009 - Core Compartilhado Modular e PostgreSQL]] — arquitetura do CORE e persistência.
- [[UhHu_Researcher_Analise_Workflow_CAPES]] — fatos do adapter CAPES.
- [[ADR007 - Visao de Produto Hub IA de Pesquisa]] — visão do hub; este documento detalha a jornada do primeiro produto.
