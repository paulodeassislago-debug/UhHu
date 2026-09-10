---
tags:
  - uhhu
  - researcher
  - spec
  - v1
  - core
date: 2026-09-06
status: validada (06/09/2026); arquitetura revisada em 09/09/2026
tipo: especificação de produto (v1)
---

# UhHu! Lab — Especificação v1 (anteriormente Researcher)

> Consolidado em 06/09/2026 a partir de: [[UhHu_Researcher_Jornada_de_Uso]] · [[ADR006 - Researcher Primeiro Produto]] · [[ADR007 - Visao de Produto Hub IA de Pesquisa]] · [[ADR008 - Multi-usuario e Ambientes Dev Prod]] · [[ADR009 - Core Compartilhado Modular e PostgreSQL]] · [[UhHu_BDTD_Adapter_Investigation]] · [[UhHu_Researcher_Analise_Workflow_CAPES]] · [[UhHu_Cobertura_BDTD_CAPES]] · [[ADR003 - Core Stack]].
> **Atualização 09/09/2026:** a especificação foi validada por seções em 06/09. A revisão atual apenas reorienta a infraestrutura para o CORE compartilhado/PostgreSQL e renomeia o produto para UhHu! Lab.
> Status: validada em 06/09/2026; arquitetura revisada em 09/09/2026. Nome anterior: "Researcher".

## 1. Objetivo

O UhHu! Lab é o primeiro produto do UhHu! (hub IA-powered de pesquisa de pós-graduação focado na produção científica brasileira). Ele dá ao pesquisador: coleta estruturada da BDTD e da CAPES, memória temporal das buscas, comparação entre estratégias de busca, seleção de corpus com critérios de elegibilidade, e exportação (CSV/BibTeX/JSON) — sem IA escrevendo por ele.

Jornada em 3 etapas (v1 = etapas 1 e 2; etapa 3 — Análise — fora do v1):

```
1. Busca   → exploração e comparação de estratégias
2. Corpus  → critérios de inclusão/exclusão, elegibilidade, tags
3. Análise → arquivo original + registro de análise (futuro; ADR-002/004 reabrem quando entrar)
```

## 2. Escopo v1

**Incluído:**
- Múltiplos projetos por usuário; múltiplas buscas por projeto; execuções versionadas com data/hora;
- Busca por **BDTD (API VuFind)** + **CAPES (rest/busca)** — as duas fontes são obrigatórias (cobertura parcial comprovada: ~57% de ausência da BDTD vs CAPES em "ensino de química");
- Filtros por busca: ano (limite temporal), tipo documental (tese/dissertação), fonte(s), área/instituição/programa. **Filtro é fundamental e garantido pelo Core**: cada fonte honra o que a API permite (ex.: BDTD honra formato+ano; CAPES honra ano+grau); quando a fonte não honra, o Core aplica **pós-filtro local** (título/resumo/ficha) para garantir o resultado declarado. **Redundância entre fonte e Core é aceita e desejada** — o Core é o garantidor, a fonte é otimização;
- Resultados estruturados com proveniência; dedup automático entre fontes (interseção) com transparência;
- Decisão de elegibilidade item a item (elegível / não elegível / indeciso); tags livres com defaults sugeridos; corpus = view derivada;
- Comparação entre buscas (métricas agregadas por execução);
- Exportação CSV / BibTeX / JSON (seleção ou todo o incluído);
- Multi-usuário com isolamento por ownerId (ADR-008); auth e-mail+senha;
- Instalação de referência: dev e prod na VPS, ambientes/bancos separados, git como fonte da verdade.

**Fora do v1:** etapa 3 (Análise/upload de arquivos), triagem avançada, IA/síntese, OAuth/SSO, colaboração no mesmo projeto (compartilhamento entre usuários), UI de estante (Lib).

**Porta aberta (não implementada no v1, mas registrada no registry de fontes):** Oasisbr como fonte opcional **desabilitável** — se o IBICT voltar a servir API/OAI, habilita-se por configuração sem mudança de código (padrão `Source` já prevê nível + flag).

## 3. Modelo de domínio

```
User           1..n  Project  1..n  Search  1..n  SearchRun  1..n  Result
Project        1..n  Tag (livres, autocomplete no projeto)
Result         n..m  DedupGroup (agrupamento por interseção)
Result         (decisão) e 1 (opcional) Tag de motivo
SearchRun      agrega métricas (counts por ano/fonte) no momento da execução
Corpus         = view derivada dos Results com decisão "elegível" (não é tabela própria)
```

Entidades:

| Entidade | Papel | Campos essenciais |
|---|---|---|
| `User` | dono de tudo | id, email, senha_hash (argon2), criado_em |
| `Project` | unidade de pesquisa | id, ownerId, título, pergunta_de_pesquisa, status (ativo/arquivado), criado_em |
| `Search` | definição declarativa | id, projectId, termo, operadores_booleanos, filtros (anos, tipo), **fontes (multi-select: BDTD, CAPES ou ambas; default = ambas)**, descritores, criado_em |
| `SearchRun` | EXECUÇÃO temporal | id, searchId, executado_em (data/hora), status (ok/parcial/falha), métricas (total_por_fonte, total_por_ano), resultados (FK) |
| `Result` | item encontrado | id, runId, source (BDTD/CAPES), sourceId (id da fonte), título, autor(es), ano, tipo, instituição (quando disponível), programa, resumo, link_origem, url, raw_metadata (JSON) |
| `DedupGroup` | interseção entre fontes | id, chave_canonica, confidence (exata/difusa), memberIds |
| `Decision` | elegibilidade do item no projeto (**mutável, editável pela UI re-PATCH**) | resultId, projectId, estado (elegível/não_elegível/indeciso), tagId opcional, motivo, decidido_em (atualizado a cada edição) |
| `Tag` | vocabulário livre do projeto | id, projectId, nome, cor (opcional), is_default |
| `Source` | registry de fontes | name, nível (oficial/não-oficial), habilitada (config por instalação) |

Proveniência garantida por: `Result.runId → SearchRun → Search` (com filtros e termos) + `Result.source/sourceId` (origem exata) + `executado_em`. Cada resultado sabe de que busca (definição), qual execução, quando, e de qual fonte veio.

## 4. Casos de uso (v1)

**UC-01 Criar projeto**: título + pergunta de pesquisa. (opcional status)
**UC-02 Definir busca**: termo/descritores + operadores booleanos + filtros (anos, tipo) + **escolha de fonte: BDTD, CAPES ou ambas (default ambas)**. A busca é salva como estratégia (não executa ainda).
**UC-03 Executar busca (uma ou várias fontes)**: cria `SearchRun` com data/hora; retorna resultados estruturados + agregados; resultados marcados como `novo` quando não existiam no run anterior da mesma Search.
**UC-04 Comparar buscas**: visão lado a lado de 2+ buscas (total, distribuição por ano, por fonte, sobreposição via DedupGroup) — **o propósito de múltiplas buscas é comparar e escolher uma delas** (a que melhor define o corpus); a sobreposição responde "esses termos trazem trabalhos diferentes?" e orienta a escolha.
**UC-05 Decidir elegibilidade / editar escolhas**: para cada resultado, marcar elegível / não elegível / indeciso; opcionalmente associar tag de motivo. **A decisão é mutável — o usuário pode editar as escolhas do corpus a qualquer momento pela UI** (re-PATCH no mesmo Result: mudar estado, trocar tag, atualizar motivo); `decidido_em` é atualizado a cada edição e o corpus (view derivada) reflete na hora. Decision persiste por projeto (mesmo se o run for reexecutado).
**UC-06 Gerenciar tags**: criar/renomear/excluir tags do projeto; defaults sugeridos: `incluir`, `excluir`, `duplicado`, `indisponível`, `revisar`.
**UC-07 Dedup automático**: ao agregar resultados de múltiplas fontes, agrupar duplicatas (interseção) em `DedupGroup` exibido como card único expansível com as origens e links; salvar/descartar opera no grupo, com opção de divergir por fonte.
**UC-08 Exportar**: CSV / BibTeX (`thesis`: school=instituição, type=grau) / JSON — da seleção atual ou de todo o incluído do projeto.
**UC-09 Reexecutar busca**: novo `SearchRun` da mesma `Search`; diff com run anterior → marca `novos`.
**UC-10 Isolamento**: usuário autenticado vê apenas seus projetos/corpus; rotas filtram por ownerId.

## 5. API (Fastify, REST)

Auth: e-mail+senha (argon2), sessão httpOnly (cookie). Penetração: `/auth/login`, `/auth/logout`, `/auth/me`; registro por token de convite (ADR-008 P2). Todas as rotas de dados exigem ownerId (derivado da sessão, nunca do body).

```
POST   /api/v1/projects                 criar projeto
GET    /api/v1/projects                 listar (do dono)
GET    /api/v1/projects/:id             detalhe + stats (buscas, runs, corpus)
PATCH  /api/v1/projects/:id             editar (título, pergunta, status)

POST   /api/v1/searches                 criar definição (Search)
GET    /api/v1/searches?projectId=      listar estratégias
PATCH  /api/v1/searches/:id             editar definição
DELETE /api/v1/searches/:id             deletar busca (UI) — seus SearchRuns e Results são removidos; decisões de corpus desses Result são apagadas junto
POST   /api/v1/searches/:id/runs        EXECUTAR (consulta fontes → cria SearchRun)
GET    /api/v1/searches/:id/runs        histórico de execuções + métricas
GET    /api/v1/searches/:id/compare?with=...   comparar execuções/buscas (agregados)

GET    /api/v1/runs/:id/results         resultados da execução (com status novo)
PATCH  /api/v1/results/:id/decision     marcou elegível/não/indeciso (+ tag/motivo)
POST   /api/v1/results/:id/duplicate-divergence   (opcional) separar do grupo

GET    /api/v1/projects/:id/corpus      view derivada (elegíveis) + filtros + tags
GET    /api/v1/projects/:id/export?format=csv|bibtex|json&scope=selection|corpus

GET    /api/v1/sources                  status das fontes (ok/degraded/offline, nível)
```

Fronteira: metadados públicos; nenhum PDF é baixado/copiado (ADR-001/004); links de origem preservados.

## 6. Contrato de fontes (packages/sources)

Interface única `Source` abstrata; implementações `bdtd` e `capes`; registry por instalação com nível (oficial/não-oficial) e flag habilitada (operador pode desabilitar não oficiais).

- `search(definicao, paginacao) → {total, results[], metrics}` — cada adapter traduz a intenção do usuário para o que a fonte honra:
  - **BDTD (VuFind)**: `lookfor` + `type=AllFields|Author|Title` + `filter[]=format:"masterThesis"|"doctoralThesis"` + `filter[]=publishDate:[A TO B]`; enriquecimento via ficha HTML (`/vufind/Record/<id>`: orientador, banca, programa, palavras-chave, resumo). Anti-bot: sessão com cookie `OasisbrVerify` (SourceClient).
  - **CAPES (rest/busca)**: `termo` (frase exata entre aspas) + `filtros` (Ano expandido ano a ano, Grau Acadêmico) + `pagina`/`registrosPorPagina` (mín. 5); resposta JSON; enriquecimento por ficha (span ids) quando aplicável.
- **Garantia de filtro no Core**: o adapter aplica na fonte o que ela honra; o Core aplica **pós-filtro local** do que falta (área/instituição/programa via metadados do Result/ficha) — redundância aceita e desejada (decisão 06/09). O Result final sempre reflete a definição declarada da busca;
- **Registry de fontes**: `bdtd` (não-oficial, habilitada), `capes` (não-oficial, habilitada), `oasisbr` (não-oficial, **desabilitada — porta aberta**, nivel registrado para ativação futura se IBICT voltar a servir).
- `enrich(sourceId) → Result` completo (ficha).
- **SourceClient (compartilhado por toda a instância, NÃO por usuário)** — ADR-008 + investigação BDTD §10:
  - sessão única (cookie jar) por fonte; renovação adaptativa por detecção de challenge (HTML em vez de JSON); mutex anti thundering herd; rate limit global (fila única; padrão batch ≤ 10 + wait 2s); circuit breaker (N falhas → degraded/offline + alerta operador); UA identificado `UhHu-Lab/<versão>`;
  - **timeout por busca na fila**: fila global protege a fonte, mas o usuário não espera indefinidamente — se a requisição não sair da fila em Xs (default 60s), a busca é cancelada com mensagem clara ("fila cheia, tente mais tarde"); run fica `parcial`;
  - **enriquecimento sob demanda**: a busca devolve o que a API dá (título, autor, ano, link, assuntos) sem ficha extra; a ficha completa (resumo, orientador, programa) é buscada **sob demanda** (clique no item) e em batch **apenas para os itens decididos elegíveis** (corpus). Busca de 200 resultados ≠ 200 requests de ficha;

## 7. Dedup por interseção (detalhe)

Objetivo: quando um mesmo trabalho aparece na BDTD e na CAPES, o usuário vê **um card** (preservando as origens) — e a busca informa a cobertura.

1. **Chave canônica**: normalização de título (lowercase, remoção de acentos/pontuação, colapso de espaços) + ano + autor(es) normalizados. Hash SHA-256 da chave.
2. **Agrupamento**: ao materializar um `SearchRun` multi-fonte, resultados com mesma chave → mesmo `DedupGroup` (confiança `exata`). Chaves quase idênticas (similaridade de título ≥ 0.9 — Jaccard/Levenshtein normalizado, mesmo ano) → agrupados com confiança `difusa`, assinalados na UI como "possíveis duplicatas — confirme".
3. **Transparência**: o card do grupo mostra: título único, N origens (ex.: "BDTD + CAPES"), links para cada origem, e a diferença de metadados quando houver (ex.: resumo presente num, ausente no outro — a versão mais completa é marcada).
4. **Operar no grupo**: decisão de elegibilidade aplica-se ao grupo inteiro; exceção explícita por fonte (`duplicate-divergence`) quando o usuário quer manter só a versão BDTD ou só a CAPES.
5. **Cobertura (função nova, da investigação de cobertura)**: por busca e por corpus, métricas "só BDTD / só CAPES / em ambas" — dá ao pesquisador a prova de exaustividade e expõe a lacuna de cobertura da(s) fonte(s).
6. **Proveniência intacta**: agrupar não apaga nada; cada Result conserva `source`, `sourceId`, `runId`, `link_origem`. Exportação do grupo = escolha de versão (padrão: a mais completa).

## 8. Exportação

- CSV: título, autor(es), ano, tipo, instituição, programa, orientador (quando houver), fonte(s), link(s), tags, decisão.
- BibTeX: **`@phdthesis` para tese / `@mastersthesis` para dissertação** (`author`, `title`, `school`=instituição, `type`=grau, `year`, `url`, `note`) — tipos nativos que JabRef/Zotero/BibTeX entendem diretamente; key = slug autor+ano+id da fonte.
- JSON: lista bruta (raw) com todas as proveniências e agrupamentos.
- Escopo: seleção da UI ou todo o corpus (elegíveis) do projeto.

## 9. Frontend (cross-platform, React Native)

**Decisão (06/09): React Native, cross-platform nativo desde o início** — atualiza a previsão "web (React)" do ADR-003/006 para o frontend.

- **Base única: React Native + Expo + react-native-web** — uma codebase que compila para:
  - **web/PWA** (beta imediata: colegas acessam por link no navegador, sem instalar nada);
  - **app nativo Android/iOS** (instalação via Expo/EAS; tablet do Paulo como primeiro target — jornada de leitura/corpus no tablet);
- O **backend não muda**: Fastify REST continua servindo web e nativo (API-first). Frontend é somente cliente.
- Telas mínimas do v1:
  - Login/convite (token) → lista de projetos;
  - Projeto → pergunta de pesquisa, estratégias de busca (Search), histórico de execuções (SearchRun);
  - Busca → formulário (termo, booleanos, filtros, fonte(s)), resultado da execução (lista agrupada com dedup), decisão de elegibilidade + tags;
  - **Modo comparação** (2–4 buscas): tabela com colunas total, por ano, por fonte, só-BDTD/só-CAPES/ambas, % sobreposição; destaque da "vencedora" por critério escolhido pelo usuário (mais inclusiva / menos ruído);
  - Results → cards com decisão, tags, expandir grupo de duplicatas, metadados da ficha (sob demanda);
  - Corpus → view dos elegíveis com filtros por tag/fonte/ano, botões de exportação.
- Build do web (beta): Expo web → estático servido pelo nginx do prod; app nativo: EAS build + distribuição (teste de beta via Expo).

Nota: a jornada do UhHu Lab é naturalmente mobile (buscar no tablet durante leitura/comparação), e o RN desde o início evita o retrabalho clássico "web depois app" — o custo é build/CI do Expo, assumido.

## 10. Infra e ambientes (ADR-008 + ADR-009)

- Monorepo pnpm: `apps/core-api` (API Fastify do CORE compartilhado) · `apps/lab` (app React Native/Expo) · `apps/core-worker` quando jobs longos exigirem processo separado; `packages/core|models|contracts|db|sources|integrations|config`.
- O Lab é o primeiro módulo/cliente do CORE e não possui backend independente. REST, CLI e MCP são superfícies dos mesmos casos de uso e contratos.
- PostgreSQL self-hosted é a persistência canônica; bancos/instâncias, volumes e credenciais separados para dev e produção. Migrations são versionadas no monorepo.
- SQLite + FTS5 fica reservado a cache, operação local/offline ou dados temporários; não é fonte de verdade do servidor. Busca textual do CORE deve ser implementada no dialeto PostgreSQL oficial.
- Dev e prod na VPS, diretórios/containers/portas/.env separados; prod atrás de nginx + TLS; dev apenas local/tailnet.
- Git privado como fonte da verdade; deploy = pull → build → migrations controladas → restart. CI: testes de contrato dos adapters + integração PostgreSQL.

## 11. Critérios de aceitação (v1)

1. Busca real na BDTD e na CAPES devolve resultados estruturados (≥1 busca de teste por fonte);
2. Dois usuários com contas distintas não enxergam projetos/buscas/corpus um do outro (ownerId testado);
3. Registro só com token de convite válido; token revogado para de funcionar;
4. Dedup identifica duplicatas entre fontes (hash + similaridade) e exibe grupo expansível com origens; divergência por fonte funciona;
5. Relatório de cobertura ("só BDTD / só CAPES / ambas") presente nas métricas da busca;
6. Busca versionada: reexecução cria novo SearchRun com marcação de `novos`; histórico temporal persiste;
7. Decisão de elegibilidade + tags persistem por projeto; corpus = view dos elegíveis consistente com as decisões;
8. Exportação CSV/BibTeX/JSON (seleção e corpus) com campos corretos;
9. Dev e prod rodam simultaneamente na VPS com bancos/portas/.env separados, sem interferência;
10. Segredos de prod não aparecem em dev nem no repositório; nenhum log com credenciais/cookies.

## 12. Riscos e pendências

- **[Monitorado]** API BDTD VuFind e CAPES rest/busca são não oficiais → teste de contrato no CI + circuit breaker + alerta operador; pedido formal ao IBICT (LAI) para reativação do OAI-PMH (upgrade sem quebra);
- **[Monitorado]** TLS da CAPES com problema de cadeia — validar no deploy (não hardcodar `rejectUnauthorized:false`);
- **[Resolvido]** nomes dos produtos principais: UhHu Lab, Lib, Note, Plan e Prof; a exposição pública ainda dependerá de revisão de marca;
- **[Horizonte — escalabilidade de coleta]** se o volume de buscas crescer (muitos usuários/instâncias), avaliar **serviço de roteamento distribuído de requisições (pool de IPs domésticos/multi-IP)** para não concentrar tráfego de datacenter num IP único — com a ressalva permanente: a resposta a bloqueios é institucional (OAI oficial, LAI), não escalada de contorno de anti-bot;
- **Relação com cobertura entre fontes** (07/09 reforço): o relatório de cobertura ("só BDTD / só CAPES / ambas") é o mecanismo que sustenta a decisão "qual busca entra no corpus" — se uma fonte degradar, o relatório continua fiel ao que foi coletado.
- **[Decidir/validar]** P1/P2 do ADR-008 (colaboração no mesmo projeto fora do v1; token de convite) — confirmado por default, revisitar;
- **[Futuro]** etapa 3 (Análise) reabre ADR-002/004 (storage WebDAV/zotero-inbox já provado) — não desenhar agora;
- **[Futuro]** Oasisbr como fonte agregada (rede/fonte oficial do IBICT) — quando BDTD+CAPES v1 estiverem no ar.

## 13. Próximos passos

1. Elaborar o contrato inicial do UhHu CORE (capabilities, módulos e superfícies REST/MCP/CLI);
2. Definir o modelo de dados e as migrations PostgreSQL;
3. Implementar testes de contrato das fontes (CI) com os shapes validados;
4. Vertical slice do UhHu Lab v1 (implementação, em ambiente de dev da VPS).

## Relações

- [[UhHu_Researcher_Jornada_de_Uso]] · [[ADR006 - Researcher Primeiro Produto]] · [[ADR007 - Visao de Produto Hub IA de Pesquisa]] · [[ADR008 - Multi-usuario e Ambientes Dev Prod]] · [[UhHu_BDTD_Adapter_Investigation]] · [[UhHu_Researcher_Analise_Workflow_CAPES]] · [[UhHu_Cobertura_BDTD_CAPES]] · [[ADR003 - Core Stack]]