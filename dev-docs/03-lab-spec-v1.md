# UhHu! Lab — Especificação v1

> Estado: validada por seções com Paulo em 06/09/2026; infraestrutura revisada
> em 09/09/2026 (CORE compartilhado + PostgreSQL). Texto completo original no
> vault (`UhHu_Researcher_v1_Spec.md` — nome físico histórico).

## 1. Objetivo

O UhHu! Lab dá ao pesquisador: coleta estruturada da produção científica
brasileira (BDTD e CAPES), memória temporal das buscas, comparação entre
estratégias de busca, seleção de corpus com critérios de elegibilidade e
exportação — **sem IA escrevendo por ele**.

Jornada em 3 etapas (v1 = etapas 1 e 2):

```text
1. Busca   → exploração e comparação de estratégias
2. Corpus  → critérios de inclusão/exclusão, elegibilidade, tags
3. Análise → arquivo original + registro de análise (futuro)
```

## 2. Escopo v1

Incluído:

- Múltiplos projetos por usuário; múltiplas buscas por projeto; execuções
  versionadas com data/hora (SearchRun temporal).
- Busca por **BDTD (API VuFind)** + **CAPES (rest/busca)** — as duas fontes são
  obrigatórias (cobertura parcial comprovada: ~57% de ausência da BDTD vs CAPES
  em amostra de "ensino de química").
- Filtros por busca (ano, tipo documental, fonte(s), área/instituição/programa).
  **O Core garante o filtro**: cada fonte honra o que sua API permite; o Core
  aplica pós-filtro local do que falta (redundância fonte+Core é desejada).
- Resultados estruturados com proveniência; dedup automático entre fontes com
  transparência.
- Decisão de elegibilidade item a item (elegível / não elegível / indeciso);
  tags; corpus = view derivada.
- Comparação entre buscas (métricas agregadas por execução).
- Exportação CSV / BibTeX / JSON.
- Multi-usuário com isolamento por ownerId (ADR-008); auth e-mail+senha;
  registro por token de convite.
- Instalação de referência: dev e prod na VPS, ambientes e bancos separados,
  git como fonte da verdade.

Fora do v1: etapa 3 (Análise/arquivos), triagem avançada, IA/síntese, OAuth/SSO,
colaboração no mesmo projeto, UI de estante (Lib).

Porta aberta: Oasisbr como fonte opcional desabilitável (registry de fontes já
prevê nível + flag).

## 3. Modelo de domínio

```text
User          1..n Project  1..n Search  1..n SearchRun  1..n Result
Project       1..n Tag
Result        n..m DedupGroup
Result        1 Decision (elegibilidade, mutável)
Corpus        = view derivada dos Results "elegível"
```

| Entidade | Papel | Campos essenciais |
|---|---|---|
| `User` | dono | id, email, senha_hash (argon2), criado_em |
| `Project` | unidade de pesquisa | id, ownerId, título, pergunta_de_pesquisa, status, criado_em |
| `Search` | definição declarativa (estratégia) | id, projectId, termo, booleanos, filtros, fontes (BDTD/CAPES/ambas; default ambas) |
| `SearchRun` | execução temporal | id, searchId, executado_em, status (ok/parcial/falha), métricas |
| `Result` | item encontrado | id, runId, source, sourceId, título, autores, ano, tipo, instituição, programa, resumo, link_origem, url, raw_metadata (JSON) |
| `DedupGroup` | interseção entre fontes | id, chave_canonica, confidence (exata/difusa), memberIds |
| `Decision` | elegibilidade (**mutável**) | resultId, projectId, estado, tagId?, motivo?, decidido_em |
| `Tag` | vocabulário livre do projeto | id, projectId, nome, cor?, is_default |

Proveniência: `Result.runId → SearchRun → Search` (filtros/termos) +
`Result.source/sourceId` + `executado_em`.

## 4. Casos de uso

- **UC-01** Criar projeto (título + pergunta).
- **UC-02** Definir busca (estratégia salva, não executa).
- **UC-03** Executar busca → SearchRun; novos = ausentes no run anterior.
- **UC-04** Comparar 2+ buscas (totais, anos, fontes, sobreposição) — propósito
  de múltiplas buscas é escolher a estratégia do corpus.
- **UC-05** Decidir elegibilidade / editar (mutável; corpus reflete na hora).
- **UC-06** Gerenciar tags (defaults: incluir, excluir, duplicado, indisponível, revisar).
- **UC-07** Dedup automático (card único expansível; operar no grupo; divergir por fonte).
- **UC-08** Exportar CSV/BibTeX/JSON (seleção ou corpus).
- **UC-09** Reexecutar busca (novo run + diff).
- **UC-10** Isolamento por ownerId.

## 5. API (REST, Fastify)

Auth: e-mail+senha, sessão httpOnly, registro por convite. `ownerId` sempre da
sessão, nunca do body.

```text
POST   /api/v1/projects
GET    /api/v1/projects
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id

POST   /api/v1/lab/searches
GET    /api/v1/lab/searches?projectId=
GET    /api/v1/lab/searches/:searchId
PATCH  /api/v1/lab/searches/:searchId
DELETE /api/v1/lab/searches/:searchId
POST   /api/v1/lab/searches/:searchId/runs          (executar)
GET    /api/v1/lab/searches/:searchId/runs
GET    /api/v1/lab/searches/:searchId/compare?with=

GET    /api/v1/lab/runs/:runId/results
PATCH  /api/v1/lab/results/:resultId/decision
POST   /api/v1/lab/results/:resultId/duplicate-divergence

GET    /api/v1/lab/projects/:projectId/corpus
GET    /api/v1/lab/projects/:projectId/export?format=csv|bibtex|json&scope=selection|corpus
GET    /api/v1/lab/sources
```

Fronteira: metadados públicos; nenhum PDF baixado/copiado; links de origem preservados.

## 6. Contrato de fontes

Interface única `Source`; implementações `bdtd` e `capes`; registry por
instalação (nível oficial/não-oficial + flag habilitada).

- `search(definicao, paginacao) → {total, results[], metrics}`
- `enrich(sourceId) → Result` completo (ficha), **sob demanda** e em batch
  apenas para elegíveis — nunca 1 request por resultado na busca.
- **SourceClient compartilhado por instância (não por usuário):** sessão única
  (cookie jar) por fonte, renovação adaptativa anti-challenge, mutex anti
  thundering herd, rate limit global (batch ≤ 10 + wait 2s), circuit breaker,
  UA `UhHu-Lab/<versão>`, timeout de fila (60s default → run `parcial`).
- Garantia de filtro: fonte honra o que pode; Core pós-filtra localmente.

Ver `04-fontes-bdtd-capes.md` para os shapes validados.

## 7. Dedup por interseção

1. Chave canônica: título normalizado + ano + autores → hash SHA-256.
2. Mesma chave → DedupGroup `exata`; similaridade ≥ 0.9 → `difusa` (UI pede confirmação).
3. Card transparente: título único, N origens, links, diferenças de metadados.
4. Decisão opera no grupo; `duplicate-divergence` mantém versão de fonte específica.
5. Relatório de cobertura: só BDTD / só CAPES / ambas (prova de exaustividade).
6. Proveniência intacta: agrupar não apaga `source/sourceId/runId/link`.

## 8. Exportação

- CSV: campos completos + tags + decisão.
- BibTeX: `@phdthesis` (tese) / `@mastersthesis` (dissertação); school=instituição,
  type=grau; key = slug autor+ano+id fonte.
- JSON: lista bruta com proveniência e agrupamentos.
- Escopo: seleção ou todo o corpus do projeto.

## 9. Frontend

- **React Native + Expo + react-native-web** — uma codebase para web/PWA (beta
  por link) e nativo Android/iOS (EAS). Backend é API-first; frontend é só cliente.
- Telas v1: login/convite → projetos → estratégias/histórico → execução com
  dedup → elegibilidade/tags → modo comparação (2–4 buscas) → corpus → exportação.

## 10. Infra

- Monorepo pnpm: `apps/core-api` (CORE compartilhado) · `apps/lab` (Expo) ·
  `apps/core-worker` quando necessário; packages `core|models|contracts|db|sources|integrations|config`.
- Lab é o primeiro módulo/cliente do CORE; sem backend independente.
- PostgreSQL canônico; bancos dev/prod separados; migrations versionadas.
- Dev/prod na VPS separados; prod atrás de nginx+TLS; dev local/tailnet.
- Git privado; deploy = pull → build → migrations → restart. CI: testes de
  contrato dos adapters + integração PostgreSQL.

## 11. Critérios de aceitação (v1)

1. Busca real na BDTD e na CAPES devolve resultados estruturados (≥1 busca de teste por fonte).
2. Dois usuários não enxergam dados um do outro (ownerId testado).
3. Registro só com token de convite válido; revogado para de funcionar.
4. Dedup identifica duplicatas entre fontes e exibe grupo expansível; divergência por fonte funciona.
5. Relatório de cobertura presente nas métricas da busca.
6. Busca versionada: reexecução cria novo SearchRun com `novos`; histórico persiste.
7. Decisão + tags persistem por projeto; corpus consistente.
8. Exportação CSV/BibTeX/JSON correta (seleção e corpus).
9. Dev e prod rodam simultaneamente na VPS sem interferência.
10. Segredos de prod ausentes de dev/repo; nenhum log com credenciais.

## 12. Riscos monitorados

- BDTD VuFind e CAPES rest/busca são não oficiais → teste de contrato no CI +
  circuit breaker + alerta; pedido formal ao IBICT (LAI) para OAI oficial.
- TLS da CAPES com problema de cadeia → não hardcodar `rejectUnauthorized:false`.
- Volume futuro → roteamento distribuído é resposta a bloqueio institucional,
  não contorno de anti-bot.
