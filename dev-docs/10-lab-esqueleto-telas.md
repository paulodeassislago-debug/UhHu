---
tags:
  - uhhu
  - lab
  - telas
  - wireframe
  - frontend
  - esqueleto
date: 2026-09-10
status: rascunho (validar com Paulo)
tipo: esqueleto estrutural de telas (v1)
---

# UhHu! Lab — Esqueleto Estrutural de Telas (v1)

> Base: [[UhHu_Researcher_v1_Spec]] (validada 06/09/2026) · [[UhHu_Researcher_Jornada_de_Uso]]
> · [[UhHu_Suite_Visao_2026-09-09]] · [[ADR009 - Core Compartilhado Modular e PostgreSQL]].
> Este documento desenha a ARQUITETURA DE TELAS do Lab v1 — wireframes de baixa
> fidelidade, fluxos, estados e o mapeamento de cada elemento visual para o
> contrato do CORE. NÃO é design visual (paleta/tipografia/componentes): isso
> fica para depois da v1 funcional com uso real, conforme decisão de 10/09/2026.

## 0. Princípios do esqueleto

1. **Estrutura antes de estética** — aqui se decide navegação, hierarquia de
   informação e estados. Refinamento visual é etapa posterior.
2. **Tablet-first** — alvo principal de uso é o tablet do Paulo (jornada de
   leitura/triagem); web/PWA para beta por link. Telas desenhadas para toque e
   leitura confortável; não para o clássico desktop de escritório.
3. **O elemento visual é um contrato** — cada bloco de tela mapeia para um campo
   ou capability do CORE (seção "Mapeamento" de cada tela). Se o elemento não
   tem contrato, o contrato está incompleto; se o contrato não tem elemento, a
   tela está incompleta.
4. **Estados são parte do desenho** — vazio, carregando, erro, parcial e
   offline são desenhados no papel, não descobertos na implementação.
5. **Decisão é mutável e visível** — elegibilidade, tags e comparação são
   revisáveis a qualquer momento (re-PATCH); a UI nunca sugere que a escolha é
   definitiva.

## 1. Mapa de navegação

```
Login/Convite
   │
   ▼
Lista de Projetos ──► (criar/arquivar projeto)
   │
   ▼
Projeto (cabeçalho: pergunta de pesquisa + status)
   ├──► Aba Estratégias (busca) ──► Formulário de Busca ──► Execução ──► Resultados
   ├──► Aba Comparação (2–4 buscas lado a lado)
   ├──► Aba Corpus (elegíveis + filtros + exportar)
   └──► Aba Histórico de execuções (runs)
```

- Navegação por abas dentro do projeto (Estratégias / Comparação / Corpus) —
  evita fluxo linear obrigatório; o pesquisador alterna livremente entre
  comparar estratégias e triar corpus.
- O estado do projeto nunca é perdido pela navegação (abas preservam posição).

## 2. Tela: Login / Convite

- Blocos: campo email, campo senha, botão entrar; link "tenho convite" →
  campo token (registro com token de convite).
- Estados: erro de credencial; token inválido/expirado (mensagem clara);
  sessão expirada (redireciona para login com aviso, sem perder projeto atual).
- Sem cadastro aberto: registro é só por token de convite (ADR-008).

Mapeamento CORE:
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- registro por token (endpoint de convite)

## 3. Tela: Lista de Projetos

```
[ Nova pesquisa (+) ]
─────────────────────────────
● Escola e Cultura Digital   [ativo]
  pergunta: como professores da rede usam TDIC?
● Banco de Teses da CAPES    [ativo]
  pergunta: o que a produção 2019-2024 diz sobre EJA?
◌ Formação de Professores    [arquivado]
─────────────────────────────
```

- Card de projeto: título, pergunta de pesquisa (1 linha, truncada), status
  (ativo/arquivado), contagem leve (nº buscas, nº elegíveis) — opcional v1.
- Ações: criar (modal/página com título + pergunta), arquivar, reativar,
  abrir. Renomear/editar pergunta via edição no cabeçalho do projeto.
- Estado vazio: "Nenhum projeto ainda — comece uma pesquisa".

Mapeamento CORE (UC-01):
- `GET /api/v1/projects` · `POST /api/v1/projects` · `PATCH /api/v1/projects/:id`

## 4. Tela: Projeto (cabeçalho + abas)

```
< Voltar                                    [Editar pergunta] [Arquivar]
┌──────────────────────────────────────────────────────────────┐
│ Escola e Cultura Digital                                      │
│ Pergunta: como professores da rede usam TDIC?                 │
│ Status: ativo                              hoje, 14:32        │
└──────────────────────────────────────────────────────────────┘
[ Estratégias ] [ Comparação ] [ Corpus: 34 ]  ← abas (Corpus com contador)
──────────────────────────────────────────────────────────────
(conteúdo da aba ativa)
```

- Aba Corpus mostra contador de elegíveis (número vivo: re-PATCH atualiza na
  hora — UC-05). Isso materializa "corpus = view derivada" na UI: não existe
  tela de "criar corpus", existe a contagem que reflete decisões.

Mapeamento CORE (UC-01/04/08):
- `GET /api/v1/projects/:id` (detalhe + stats) · `GET /api/v1/projects/:id/corpus`

> **Adendo 12/09/2026 (pedido Paulo, verificação externa fase 7):** título e
> pergunta editam por lápis ✎ inline ao lado do texto (TextInput +
> Salvar/Cancelar, PATCH real via `projectsApi.update` existente; sem botão
> separado). Validação/limites seguem o contrato de update; mutabilidade
> visível imediata após PATCH.

## 5. Tela: Aba Estratégias (lista de buscas)

```
[ Nova estratégia de busca (+)
──────────────────────────────────────────────
● "ensino de química" AND "gamificação"
  BDTD + CAPES · 2020-2025 · tese,dissertação
  runs: 3 · último: hoje 10:12 · 214 resultados
    [Executar] [Comparar] [⋯]
● "TDIC" AND "formação de professores"
  BDTD · 2019-2024 · sem filtro de grau
  runs: 1 · último: 02/09 · 87 resultados
    [Executar] [Comparar] [⋯]
──────────────────────────────────────────────
```

- Cada Search é um card com: descritores/termos (legível, mostra operadores),
  resumo dos filtros, fontes selecionadas (BDTD/CAPES/ambas), última execução
  (data + contagem), ações: executar de novo (UC-09), comparar (marca para
  comparação), menu (editar, duplicar, excluir).
- **Excluir busca** é destrutivo (remove runs + resultados + decisões): pede
  confirmação explícita e avisa o que será apagado (UC-/API DELETE).
- Estado vazio: "Nenhuma estratégia — defina a primeira busca".

Mapeamento CORE (UC-02/03/09):
- `GET /api/v1/searches?projectId=` · `PATCH/DELETE /api/v1/searches/:id`
- `POST /api/v1/searches/:id/runs` (executar) · `GET /api/v1/searches/:id/runs`

## 6. Tela: Formulário de Busca (UC-02)

```
Nova estratégia de busca
──────────────────────────────────────────────
Termos/descritores
[ ensino de química        ] [AND ▾] [ "gamificação"  ]
(linhas de descritor com operador booleano entre elas: AND/OR/NOT)

Filtros
  Ano: [2020] — [2025]            (limite temporal, opcional)
  Tipo: [x] tese  [x] dissertação
  Área: (opcional, quando a fonte honra)
  Instituição: (opcional, pós-filtro Core quando a fonte não honra)
  Programa: (opcional, mesmo critério)

Fontes
  (x) BDTD   (x) CAPES      ← default: ambas marcadas
  [status das fontes: ambas operacionais]

[Salvar estratégia]  [Executar agora]
──────────────────────────────────────────────
```

- **Salvar ≠ Executar** (decisão 06/09): a busca é definição declarativa; o
  usuário pode só salvar, ou salvar e executar.
- Aviso de capacidade por fonte: se a fonte não honra um filtro (ex.: booleanos
  na CAPES), a UI mostra selo discreto "filtro garantido pelo Core (pós-filtro)".
- Estado da fonte (ok/degraded/offline) visível no formulário — evita executar
  sabendo que vai falhar (vem de `GET /api/v1/sources`).

Mapeamento CORE (UC-02/03):
- `POST /api/v1/searches` (definição) · `POST /api/v1/searches/:id/runs`
- `GET /api/v1/sources` (status das fontes)

## 7. Tela: Resultado de Execução (UC-03/09/07)

```
Execução #4 — "ensino de química" AND "gamificação"
BDTD + CAPES · hoje 10:12 · 214 resultados · [duração 42s]
[✓ ok | ! parcial | ✗ falha]   ← banner de estado do run

● 12 NOVOS desde a última execução                ← diferencial de novos

┌─────────────────────────────────────────────┐
│ Química lúdica: jogos no ensino de química  │
│ autora: Maria Silva · 2023 · tese           │
│ UFBA · Programa de Pós-Graduação em Quím.   │
│ [BDTD] [CAPES]  ·  ver ficha →              │
│ [elegível]  [não]  [indeciso] · tag: [revisar ▾] │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ Gamificação no ensino de ciências           │
│ João Pereira · 2021 · dissertação           │
│ [BDTD + CAPES — 2 origens ▸]                │  ← DedupGroup
│ [elegível]  [não]  [indeciso] · tag: [— ▾]  │
└─────────────────────────────────────────────┘
  (expandido: origem BDTD link, origem CAPES link, metadados divergentes,
   "versão mais completa: CAPES", [separar por fonte])
```

- **Card único = Result; card com N origens = DedupGroup** (UC-07). Grupo
  expansível mostra origens, links e diferenças de metadados; decisão opera no
  grupo com opção de divergência por fonte (`duplicate-divergence`).
- **Novos**: badge "NOVO" nos resultados que não existiam no run anterior
  (diff de reexecução, UC-09/UC-03).
- Decisão de elegibilidade embutida no card: 3 botões (elegível/não/indeciso) +
  tag opcional. Ação é imediata e reversível (UC-05).
- Ficha completa sob demanda: toque no item busca ficha (resumo completo,
  orientador, banca, palavras-chave) — **não** pré-carrega para 200 resultados
  (decisão contracts/fontes: enriquecimento sob demanda).
- Estados do run: `ok` (verde), `parcial` (amarelo — fonte caiu/fila estourou,
  com detalhe "CAPES não respondeu: resultados só da BDTD"), `falha` (vermelho
  + motivo: "fila cheia, tente mais tarde"), `cancelled`.
- Estado de carregamento: progresso por fonte ("buscando BDTD… 43/200"),
  cancelável.
- Paginação/incremental: lista longa carrega em blocos sem travar a triagem.

Mapeamento CORE (UC-03/07/09/05):
- `GET /api/v1/runs/:id/results` (com campo `novo`)
- `PATCH /api/v1/results/:id/decision` (estado + tag + motivo; `decidido_em`)
- `POST /api/v1/results/:id/duplicate-divergence`
- enriquecimento: `enrich(sourceId)` → ficha completa

## 8. Tela: Decisão de Elegibilidade e Tags (UC-05/06)

- Fluxo de triagem: o card de resultado é o centro (ver §7). Estilo PRISMA:
  elegível / não elegível / indeciso — vocabulário validado.
- **Motivo/tag**: associar tag opcional com autocomplete das tags do projeto e
  defaults sugeridos (`incluir`, `excluir`, `duplicado`, `indisponível`,
  `revisar` — UC-06).
- **Mutabilidade visível**: decisão muda com um toque; `decidido_em` atualiza
  sozinho; nunca há "tela de confirmação" para reverter — desfazer é a própria
  tela (basta tocar outro estado).
- Gestão de tags: tela/modal simples — criar, renomear, excluir, cor opcional.
- Nenhuma triagem em lote no v1 (decisão item a item); a UI não oferece
  "marcar todos elegíveis" — isso impediria a leitura que o método exige.

Mapeamento CORE (UC-05/06):
- `PATCH /api/v1/results/:id/decision` · `GET/POST/PATCH/DELETE` tags do projeto

## 9. Tela: Comparação entre Buscas (UC-04)

```
Comparação — selecione 2 a 4 estratégias        [ESCOLHER CRITÉRIO ▾]
────────────────────────────────────────────────────────────────────
                 | #A "ensino e química..." | #B "gamificação..." | #C ...
Resultados       |        214              |        87            |
Por ano          |  2020: 30 · …· 2025: 41 |  2019: 12 ·…         |
BDTD             |        132              |        87            |
CAPES            |        112              |         0            |
Só BDTD          |        102              |        87            |   ← cobertura
Só CAPES         |         82              |         0            |
Em ambas         |         30              |         0            |
Sobreposição     |        14%              |        —             |
────────────────────────────────────────────────────────────────────
  ★ Vencedora por critério (mais inclusiva / menos ruído): #A
```

- Tabela lado a lado de 2–4 buscas: total, distribuição por ano, por fonte,
  só-BDTD/só-CAPES/ambas (relatório de cobertura — decidido 06/09), %
  sobreposição.
- Destaque da "vencedora" por critério escolhido: mais inclusiva (maior total) /
  menos ruído (menor volume com alta sobreposição?) — critério definido pelo
  usuário; o destaque é orientação, nunca decisão automática.
- Ação "usar esta estratégia como base do corpus": marca a Search como
  referência do projeto (persistido como metadata do Project).
- Estado vazio: "Marque 2+ estratégias na aba Estratégias".
- Em tablet: tabela rolável horizontal com colunas fixas (primeira coluna = rótulos).

Mapeamento CORE (UC-04):
- `GET /api/v1/searches/:id/compare?with=...` (agregados por run/busca)
- métricas já materializadas em SearchRun (counts por ano/fonte)

## 10. Tela: Corpus (UC-08)

```
Corpus — Escola e Cultura Digital        [34 itens] [Exportar ▾]
──────────────────────────────────────────────────────────────
Filtros: [tag ▾] [fonte ▾] [ano ▾]
┌────────────────────────────────────────────────────────┐
│ [x] Química lúdica... · 2023 · tese · [BDTD+CAPES]     │
│     tags: revisar                                      │
│ [ ] Gamificação... · 2021 · dissertação · [BDTD]       │
│     tags: incluir                                      │
│ ...                                                    │
└────────────────────────────────────────────────────────┘
Seleção: 2 de 34  →  [Exportar seleção]  [Exportar corpus completo]
Exportar: (CSV | BibTeX | JSON)
```

- View derivada dos elegíveis (consistente com decisões a qualquer momento);
  filtros por tag/fonte/ano — leves, client-side ou via query.
- Seleção por checkbox + exportar seleção OU corpus completo (UC-08).
- BibTeX: `@phdthesis` para tese / `@mastersthesis` para dissertação
  (school=instituição, type=grau).
- Estado vazio: "Nenhum item elegível ainda — trie os resultados primeiro".

Mapeamento CORE (UC-08):
- `GET /api/v1/projects/:id/corpus` (view + filtros) ·
  `GET /api/v1/projects/:id/export?format=csv|bibtex|json&scope=selection|corpus`

## 11. Estados transversais (vale para todas as telas)

| Estado | Comportamento padrão |
|---|---|
| Vazio | Mensagem orientadora + ação principal (ex.: "crie a primeira estratégia") |
| Carregando | Skeletons por card; progresso por fonte na execução; nunca spinner infinito |
| Erro | Banner com motivo legível (fonte offline, fila cheia, timeout 60s) + ação (repetir / voltar) |
| Parcial | Banner âmbar: o que veio, o que faltou; decisões possíveis sobre o que veio |
| Offline (app nativo) | Aviso e leitura do último run em cache (SQLite local); sem triagem offline no v1 |

## 12. Regras de UI derivadas (para o futuro guia do front)

1. O verbo da tela reflete a semântica do domínio: "elegível/não elegível/
   indeciso", nunca "salvo/descartado"; "estratégia", "execução/run", "corpus".
2. Proveniência sempre visível num card expandido: busca → run → data → fonte.
3. Nada é irreversível na UI: excluir pede confirmação; decisão nunca pede.
4. A contagem do corpus é recalculada na hora (view derivada).
5. Sem IA na v1: nenhum elemento sugere síntese automática (filosofia do produto).

## 13. Fora do esqueleto (explícito)

- Design visual: paleta, tipografia, ícones, componentes rebuscados, animações.
- Tela de Análise (etapa 3 da jornada — fora do v1).
- Triagem em lote e síntese por IA.
- Tela de estante bibliográfica (Lib) e integrações cruzadas da suite.

## 14. Pendências VALIDADAS com Paulo (11/09/2026) — TODAS RESOLVIDAS

As 5 pendências foram fechadas em validação com Paulo em 11/09/2026:

1. **Modo comparação — critério "menos ruído": RESOLVIDO.** O v1 destaca
   apenas "mais inclusiva" (automaticamente); a vencedora final é escolhida
   MANUALMENTE pelo usuário (sem fórmula mágica). "Menos ruído" volta na v2,
   com taxa de elegibilidade pós-triagem (elegíveis ÷ triados, amostra mínima
   ~20) — decisão de Paulo, 11/09.
2. **Exportação — unidade de seleção: RESOLVIDO.** Seleção opera no GRUPO
   deduplicado inteiro (um trabalho = uma referência; BDTD+CAPES juntos). A
   divergência explícita por fonte já cria itens separados.
3. **Excluir busca — RESOLVIDO.** Mantém hard-delete com cascata (já
   implementado no CORE); a UI deve exibir diálogo de confirmação listando o
   que será apagado (nº de runs, resultados e decisões que serão perdidas).
   Sem soft-delete no v1.
4. **Estratégia de referência do corpus — RESOLVIDO.** Persistir
   `referenceSearchId` nullable no Project (a escolha feita na comparação fica
   na memória do projeto). **Campo novo no contrato CORE — adicionar em
   migrations.**
5. **Badge "NOVO" — RESOLVIDO.** Expor `isNew` por item no GET results,
   derivado on-read (mesma regra D-35 atual: ausente em TODOS os runs
   anteriores da busca), SEM coluna nova no banco; badge no card (visual).
   O contador `newCount` por run já existe. Decision: recomendação do Hermes
   aceita por Paulo, 11/09 — sem flag persistida (estado que envelhece).

## Relações

- [[UhHu_Researcher_v1_Spec]] — entidades, UCs, API e telas mínimas (base)
- [[UhHu_Researcher_Jornada_de_Uso]] — fluxo em 3 etapas
- [[UhHu_Suite_Visao_2026-09-09]] — visão da suite; Lab = 1º app
- [[UhHu_CORE_Contrato_Inicial]] — contrato a validar; este esqueleto alimenta
  a validação (elemento visual ↔ campo/capability)
- [[ADR009 - Core Compartilhado Modular e PostgreSQL]] — arquitetura