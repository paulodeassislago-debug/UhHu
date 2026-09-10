---
tags: [uhhu, fase0, spec, api]
date: 2026-08-13
status: histórico — contrato do Lib, não vigente
---

# UhHu! API — Spec Inicial (v0, histórica)

**Projeto:** UhHu!
**Produto:** UhHu! Lib (fora do caminho crítico atual)
**Documento:** UhHu_API_Initial_Spec.md
**Data original:** 13/08/2026
**Status atual:** Referência histórica; o contrato vigente deve ser definido para o CORE compartilhado e o UhHu Lab
**Base normativa histórica:** [[ADR001 - UhhuLib]] · [[ADR002 - Resolução de Storage Reference]] · [[ADR003 - Core Stack]] · [[ADR004 - Entrega de Arquivos]] · [[UhHu_Zotero_Adapter_Investigation]]

> Esta spec foi escrita antes da suite global e do ADR-009. Ela contém premissas
> de catálogo do Lib, owner key e SQLite que não devem orientar a implementação.
> Consultar [[ADR009 - Core Compartilhado Modular e PostgreSQL]].

---

## 1. Princípios do contrato

1. O frontend **nunca** fala com Zotero, Nextcloud/WebDAV ou outros serviços externos (ADR-001 §9).
2. Os endpoints expõem conceitos UhHu! (Document, Collection, Tag, Attachment), não entidades do Zotero. A integração é um detalhe interno do adapter (ADR-001 §8).
3. A API serve **índice + referências + imagens derivadas**. Arquivos físicos, só no Storage Provider (ADR-002 §2.5, ADR-004 §2.6).
4. Cache é cache: o que a API devolve pode ser regenerado pela sincronização (ADR-001 §5).
5. Prefixo de versão: `/api/v1`.
6. Autenticação: token Bearer da instalação (operação/scripts — Security Notes §2) + **OAuth como camada de identidade** para catálogos compartilhados (ADR-005 §5). Identidade (login) ≠ conexão de storage (futuro).
7. Erros em formato uniforme: `{ "error": { "code", "message", "details?" } }`.
8. Paginação: `limit` (padrão 50, máx 100) + `start` (espelha o padrão da Zotero API, simplifica o adapter).

---

## 2. Modelos de dados (contrato)

### 2.1. Document

```json
{
  "id": "0195d5f0-9a3c-7c00-8000-000000000001",   // UUID v7 — identidade UhHu! (decisão Fase 0)
  "title": "Complexidade, Saberes Científicos, Saberes da Tradição",
  "itemType": "book",
  "creators": [
    { "type": "author", "name": "ALMEIDA, Ceiça" }
  ],
  "date": "",                        // pode vir vazio (fato observado no Zotero)
  "identifiers": { "doi": null, "isbn": null, "url": null },
  "tags": [],
  "collections": [ { "id": "0195d5f1-9a3c-7c00-8000-000000000001", "name": "Curso Whitehead" } ],
  "attachments": [
    {
      "id": "0195d5f2-9a3c-7c00-8000-000000000001",
      "kind": "linked_file",         // linked_file | imported_file | linked_url | imported_url
      "contentType": "application/pdf",
      "filename": "Complexidade, Saberes Científicos, Saberes da Tradição - ALMEIDA Ceiça (2010).pdf",
      "storageReference": {
        "connectionId": "default",
        "providerRef": "attachments:Complexidade, Saberes Científicos, Saberes da Tradição - ALMEIDA Ceiça (2010).pdf",
        "resolvedLocator": "https://nextcloud.local/remote.php/dav/files/admin/UhHu Lib/Zotero Teste/Complexidade, ... (2010).pdf",
        "status": "resolved"          // resolved | unresolved | missing
      },
      "fulltext": { "indexedPages": 88, "totalPages": 88, "available": true }
    }
  ],
  "integrations": {
    "zotero": { "itemKey": "N77NQ47Q", "libraryId": 20371492 }
  },
  "deepLinks": {
    "zotero": "zotero://select/library/items/N77NQ47Q"
  },
  "provenance": {
    "source": "zotero",
    "lastSyncedAt": "2026-08-13T20:10:00Z",
    "version": 82
  },
  "dates": {
    "added": "2026-08-13T20:10:00Z",
    "modified": "2026-08-13T20:10:00Z"
  }
}
```

Notas:
- `attachments[].filename` é **derivado** no Core para linked_file (a API do Zotero devolve null; o nome vive no path — ADR-002 §2.2);
- `fulltext.available: false` quando o Zotero não indexou (404 na origem);
- `storageReference.status = missing` quando a validação de existência falhou (ADR-002 §2.6) — o item permanece visível, marcado.

### 2.2. Collection

```json
{
  "id": "0195d5f1-9a3c-7c00-8000-000000000001",   // UUID v7 — identidade UhHu!
  "name": "Curso Whitehead",
  "parentId": null,                  // árvore
  "documentCount": 12,
  "integrations": {
    "zotero": { "collectionKey": "TAACWSRJ" }
  }
}
```

### 2.3. Tag

```json
{ "name": "complexidade", "documentCount": 3 }
```

### 2.4. SyncStatus

```json
{
  "state": "idle",                   // idle | running | error
  "lastRunAt": "2026-08-13T20:10:00Z",
  "lastVersion": 82,
  "catalogCount": 156,
  "fulltextCount": 5,
  "issues": [
    { "type": "attachment_unresolved", "documentId": "uhhu_doc_02", "detail": "arquivo não encontrado no storage" }
  ]
}
```

---

## 3. Endpoints

### 3.1. Catálogo

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/documents` | Lista com filtros e busca (abaixo) |
| GET | `/api/v1/documents/{id}` | Detalhe completo |
| GET | `/api/v1/collections` | Árvore de coleções |
| GET | `/api/v1/collections/{id}/documents` | Documentos de uma coleção |
| GET | `/api/v1/tags` | Tags com contagem |

Filtros de `GET /documents` (combináveis):

```
q=          busca full-text (FTS5) em título + autores + texto indexado
collection= id da coleção
tag=        nome da tag
author=     substring do autor
itemType=   book | journalArticle | ...
year=       ano
sort=       dateAdded | title | year   (default dateAdded)
order=      asc | desc
limit, start
```

Exemplo:

```
GET /api/v1/documents?q=complexidade&collection=TAACWSRJ&limit=20
```

Resposta (lista):

```json
{
  "items": [ { ...Document resumido (sem attachments.fulltext.content)... } ],
  "total": 42,
  "start": 0,
  "limit": 20
}
```

### 3.2. Busca (alias conceitual)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/search?q=...` | Igual a `GET /documents?q=...` — endpoint conceitual do ecossistema (Lib/Planner/RSL usam o mesmo contrato) |

### 3.3. Arquivos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/files/{attachmentId}` | Entrega do arquivo (proxy ou redirect, decidido pelo Core — ADR-004 §2.2/2.3). Suporta `Range`; content-type do original |
| GET | `/api/v1/thumbnails/{attachmentId}?size=400` | Imagem derivada (capa). Servida sempre via Core (proxy + cache) — ADR-004 §2.4 |

Comportamento:
- `GET /files/{attachmentId}` de um PDF → `application/pdf`, `Accept-Ranges: bytes`;
- quando o Core decide redirect: `302` com `Location` efêmero (nunca cacheado pelo cliente; `Cache-Control: no-store`);
- `GET /thumbnails/{attachmentId}`: se não houver preview gerado, gera sob demanda a partir do storage (Nextcloud preview hoje) e cacheia no Core; `Cache-Control` longo;
- 404 se `storageReference.status = missing`; 403 sem token válido.

### 3.4. Sincronização

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/v1/sync` | Dispara sincronização manual (assíncrona; 202 Accepted) |
| GET | `/api/v1/sync/status` | Estado atual (SyncStatus) |

Fluxo interno do sincronizador (ADR-003 §2.6, investigação §3.5/§4.3):
1. `?since=lastVersion` + paginação → catálogo incremental;
2. agregado `/fulltext` (itemKey → version) → detecta novidades → busca `content` sob demanda → upsert no FTS5;
3. valida storage references (stat/HEAD) → marca `missing`/`resolved`;
4. atualiza `lastVersion`, `lastRunAt` e issues.

### 3.5. Operacionais

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/health` | `{ "status": "ok", "db": true, "lastSync": "..." }` |

### 3.6. Catálogos compartilháveis (ADR-005 §3)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/v1/catalogs` | Cria catálogo (nome, visibilidade, e-mails autorizados) |
| GET | `/api/v1/catalogs/{id}` | Detalhe/edição do catálogo (dono) |
| PATCH | `/api/v1/catalogs/{id}` | Altera visibilidade / e-mails autorizados |
| GET | `/c/{slug}` | **Estante pública** — leitura sem auth (primeira iteração); com OAuth quando ativado; sem dados de integração |
| GET | `/api/v1/integrations/zotero` | Estado da conexão Zotero (status, aviso de duplicação WebDAV a exibir) |
| POST | `/api/v1/integrations/zotero` | Conecta Zotero (WebDAV obrigatório; confirmação do aviso) |
| POST | `/api/v1/catalogs/{id}/files` | **Pass-through** de arquivo: recebe, transfere ao destino (WebDAV Zotero), não persiste |

Regras: `GET /c/{slug}` nunca expõe credenciais nem storageReference internos — apenas o que a estante pública mostra (metadados + capas + links de leitura). O endpoint de pass-through obedece a ADR-005 §4.3: buffer temporário, descartado após a transferência.

---

## 4. Exemplos de fluxo

### 4.1. Abrir um documento da estante

```
1. GET /api/v1/documents?q=morin
   → items[0].id = <UUID v7>, attachments[0].id = <UUID v7>
2. GET /api/v1/thumbnails/<UUID v7>?size=400      → capa (grid)
3. GET /api/v1/files/<UUID v7>                    → PDF (Range ok) ou 302
4. link "Abrir no Zotero" → deepLinks.zotero     → zotero://select/library/items/N77NQ47Q
```

### 4.2. Sincronização agendada (node-cron, em processo)

```
POST /api/v1/sync → 202
GET  /api/v1/sync/status → idle, lastVersion=82, issues=[]
```

---

## 5. Fora de escopo (deliberadamente)

- criação/edição de metadados (POST/PUT em documents) — o Zotero permanece dono (ADR-001 §2.2); pode virar endpoint de "captura" futura sem quebrar contrato;
- upload de PDF (proibido por não-duplicação — ADR-001 §4);
- annotations (ADR-001 §2.2);
- OAuth de **conexão** de storage providers (Drive/OneDrive/etc.) — futuro (ADR-005 §5.2); a identidade OAuth para catálogos entra na iteração seguinte ao slice;
- endpoints de Planner/RSL (mesmo Core, contratos futuros).

---

## 6. Decisões derivadas registradas nesta spec

1. Paginação `limit/start` (espelha a Zotero API — simplifica o adapter; cursor pode ser adicionado depois sem quebra).
2. `filename` derivado no Core para linked_file (fato da integração, ADR-002 §2.2).
3. `fulltext.available` exposto no Document; o `content` não trafega na listagem (payload leve) — só via busca FTS5 (o FTS5 já indexa no Core; o cliente recebe snippets, não o texto inteiro, salvo endpoint futuro).
4. Deep links são derivados no Core a partir de `integrations.zotero.itemKey`.
5. Sincronização disparável manualmente (POST /sync); agendamento é responsabilidade do processo interno.
6. **IDs (decisão Fase 0):** `Document.id` e `Attachment.id` = UUID v7 (ordenáveis por tempo, sem colisão entre fontes futuras); `Collection.id` = UUID v7, preservando a chave de integração em `integrations.zotero.collectionKey` (ADR-001 §8: a key do Zotero não é a identidade ontológica); Tags identificadas por nome.
7. **Catálogo compartilhável (ADR-005):** estante pública `GET /c/{slug}` sem auth na primeira iteração; OAuth de identidade na iteração seguinte; visibilidade por decisão do dono (aberto a autenticados ou e-mails autorizados).
8. **Proveniência de metadados:** metadados gerados por IA (futuro, Nível C) entram com `source: ai_generated` + nível de confiança; escrita no Zotero apenas com revisão/consentimento (ADR-005 §6).

---

## 7. Pendências para a implementação (ambiente de código)

- [ ] Gerar OpenAPI formal (Fastify schema + Zod) a partir deste contrato;
- [ ] Decidir formato de snippets de busca (FTS5 highlight) — payload de `GET /documents?q=`;

- [ ] Estratégia de thumbnails quando o provider não tiver preview (geração própria — ADR-004 §2.4);
- [x] Security Notes ([[UhHu_Security_Notes]]) — concluída em 13/08/2026.
- [ ] OAuth de identidade: providers configuráveis + fallback local (ADR-005 §5.1) — iteração pós-slice.

---

## 8. Referências

- [[ADR001 - UhhuLib]] · [[ADR002 - Resolução de Storage Reference]] · [[ADR003 - Core Stack]] · [[ADR004 - Entrega de Arquivos]]
- [[UhHu_Zotero_Adapter_Investigation]] (fatos validados da Zotero Web API v3)
- [[UhHu_Lib_Fase_0_Contexto_Atualizado]] (roadmap e gates)
