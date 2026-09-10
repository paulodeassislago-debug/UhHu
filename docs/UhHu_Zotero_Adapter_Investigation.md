---
tags: [uhhu, fase0, zotero, investigacao, adapter]
date: 2026-08-13
status: validado
---

# UhHu! — Zotero Web API v3: Investigação do Zotero Adapter

**Projeto:** UhHu!
**Produto:** UhHu! Lib (Fase 0)
**Documento:** UhHu_Zotero_Adapter_Investigation.md
**Data:** 13/08/2026 (sondagem pública + validação com biblioteca real)
**Status:** VALIDADO — critério de aceitação do ADR-001 §13 demonstrado na prática
**Relacionados:** [[ADR001 - UhhuLib]] · [[UhHu_Lib_Fase_0_Contexto_Atualizado]]

---

## 1. Objetivo

Validar experimentalmente o que a **Zotero Web API v3** consegue fornecer para alimentar o Zotero Adapter do UhHu!, conforme definido no ADR-001 (seções 12 e 16):

- metadata mínima (título, autores, ano, identificadores, tags, coleções, tipo);
- identificação de attachments e de **Linked Files**;
- **full-text** indexado;
- relação item ↔ attachment;
- referência necessária para localizar o arquivo físico no Storage Provider (Nextcloud).

**Restrição:** nenhum PDF é baixado ou copiado. Apenas leitura via API.

---

## 2. Método

Duas etapas:

**Etapa A — sondagem pública (sem chave):** bibliotecas públicas para mapear endpoints e formatos:
- `users/475425` ("Z public library", biblioteca de demonstração da documentação oficial);
- `groups/500643` ("DEB Library", biblioteca ativa com 2.916 itens e 900 fulltexts);
- `groups/2124507`, `groups/5312158` (amostras sem PDFs);
- `groups/2859` → 403 (privada/removida — controle negativo).

**Etapa B — validação com a biblioteca real (com chave de leitura):**
- usuário: `paulo.assis` (userID **20371492**);
- chave: escopo de leitura (library + files + notes), guardada em `~/.hermes/secrets/zotero_api_key` (local, fora do vault);
- item real testado: livro **"Complexidade, Saberes Científicos, Saberes da Tradição"** (ALMEIDA, Ceiça, 2010) — item `N77NQ47Q`, attachment Linked File `MFW6GPGG`.

---

## 3. Endpoints validados e formatos observados

### 3.1. Autenticação e identidade

```
GET /keys/current
```

Retorna o dono da chave — resolve o userID a partir da chave (útil no setup):

```json
{
  "key": "...",
  "userID": 20371492,
  "username": "paulo.assis",
  "access": {
    "user": { "library": true, "files": true, "notes": true },
    "groups": { "all": { "library": true, "write": false } }
  }
}
```

### 3.2. Lista de itens e coleções

```
GET /users/{userID}/items?limit=N&format=json
GET /users/{userID}/collections?limit=N&format=json
```

Headers relevantes: `total-results`, `link` (paginação `start`/`limit`), `last-modified-version`, `zotero-api-version`, `zotero-schema-version`.

Item (shape real, biblioteca de demonstração):

```json
{
  "key": "7VLLCTW7",
  "version": 3663,
  "library": { "type": "user", "id": 475425, "name": "Z public library" },
  "meta": { "creatorSummary": "Zotero", "numChildren": 2 },
  "data": {
    "itemType": "blogPost",
    "title": "...",
    "creators": [ { "creatorType": "author", "name": "Zotero" } ],
    "date": "", "DOI": "", "url": "...",
    "tags": [], "collections": [], "relations": {},
    "dateAdded": "...", "dateModified": "..."
  }
}
```

### 3.3. Children (attachments)

```
GET /users/{userID}/items/{itemKey}/children?format=json
```

### 3.4. Full-text

```
GET /users/{userID}/items/{itemKey}/fulltext
GET /users/{userID}/fulltext          (agregado: { itemKey: version })
```

| Caso | HTTP | Shape |
|---|---|---|
| PDF indexado | 200 | `{content, indexedPages, totalPages}` |
| Item web indexado | 200 | `{content, indexedChars, totalChars}` |
| Sem fulltext | 404 | `Not found` |

### 3.5. Sincronização incremental

```
GET /items?since={version}&limit=N
```

Retorna itens alterados após a versão. Combinável com `last-modified-version` e com o agregado `/fulltext` (itemKey → version) para detectar novidades de fulltext.

---

## 4. Validação com a biblioteca real (Paulo) — RESULTADOS

### 4.1. O item testado

| Campo | Valor observado |
|---|---|
| Item (livro) | `N77NQ47Q` — "Complexidade, Saberes Científicos, Saberes da Tradição" |
| Autores | ALMEIDA, Ceiça |
| itemType | book |
| Coleções | `TAACWSRJ` (Curso Whitehead) |
| Tags | vazias (o usuário não usa tags nos itens atuais) |
| data.date | vazio no Zotero (o "(2010)" está só no filename) |
| Attachment | `MFW6GPGG` — **linkMode: `linked_file`**, contentType: application/pdf |
| parentItem | `N77NQ47Q` |

### 4.2. O PATH do Linked File (descoberta central)

```
path: "attachments:Complexidade, Saberes Científicos, Saberes da Tradição - ALMEIDA Ceiça (2010).pdf"
```

Observações:

- o campo `path` tem o formato **`attachments:<nome do arquivo>`** — path **virtual**, relativo ao diretório-base de linked attachments configurado **localmente** no Zotero desktop (não sincronizado via API);
- o campo `filename` vem **null** para linked_file (o nome vive dentro do path);
- no caso real: diretório-base do Zotero = `/home/paulo/NextCloud/UhHu Lib/Zotero Teste` (Zorin), que corresponde à pasta **`UhHu Lib/Zotero Teste/`** no Nextcloud (WebDAV) — e ao diretório físico `files/UhHu Lib/Zotero Teste/` no datadirectory da VPS;
- o arquivo físico existe lá, com nome idêntico ao do path da API (22 MB), junto de um segundo PDF (25 MB) ainda não indexado como item.

**Implicação:** o elo `attachments:<filename>` → storage exige uma **configuração explícita** do mapeamento diretório-base do Zotero ↔ pasta WebDAV (não é derivável da API). No setup do Paulo: `attachments:` ⇒ `UhHu Lib/Zotero Teste/` no Nextcloud.

### 4.3. Full-text do Linked File

```
GET /users/20371492/items/MFW6GPGG/fulltext → HTTP 200
{
  "content": "Durante muito tempo fomos instruídos, no interior de nossa educação formal...",
  "indexedPages": 88,
  "totalPages": 88
}
```

**Hipótese do ADR-001 §6 confirmada:** o Zotero indexa Linked Files e a Web API v3 serve o fulltext, sem baixar o PDF.

Agregado da biblioteca real: **5 itens com fulltext** (`{P6ZTAAJY: 22, XEWQHBV2: 43, 874V5HJ5: 44, R8W4DKSW: 45, MFW6GPGG: 82}`).

### 4.4. Annotations (disponíveis, fora do escopo)

A API expõe annotations (`annotationType`: note/highlight, com `annotationText` e `parentItem`). Por decisão do ADR-001 §2.2, o UhHu! **não** duplica annotations — permanecem de responsabilidade do Zotero. Registrado apenas como dado disponível.

### 4.5. Critério de aceitação (ADR-001 §13) — DEMONSTRADO

```
Zotero
  ├── metadata ────────────► item N77NQ47Q (título, autor, coleção)     ✓
  ├── full-text ───────────► HTTP 200, 88 páginas indexadas             ✓
  └── attachment ref ───────► path "attachments:<filename>"             ✓
                              ▼
                        Zotero Adapter (Web API v3)                     ✓
                              ▼
                        UhHu! Core (conceitual)                          ✓
                              ▼
                        Storage Provider (Nextcloud/WebDAV)              ✓
                              ▼
                        PDF físico único em files/UhHu Lib/Zotero Teste/ ✓
```

**Nenhuma cópia do PDF foi criada em nenhuma etapa** — o arquivo permanece exclusivamente no Nextcloud.

---

## 5. Descobertas-chave (consolidadas)

1. **Full-text é binário: 200 ou 404** — depende da indexação prévia do Zotero (client desktop indexa automaticamente PDFs, inclusive Linked Files — confirmado).
2. **O agregado `/fulltext` é o "sinal de novidade"** — comparação itemKey→version com o cache local detecta o que mudou; combinável com `?since=`.
3. **Formato do fulltext difere por tipo** (PDF: `indexedPages/totalPages`; web: `indexedChars/totalChars`) — o adapter precisa normalizar.
4. **Path de linked file é virtual** (`attachments:<filename>`) — o mapeamento para o storage exige configuração explícita do diretório-base (ver §4.2). Este é o único ponto de configuração manual identificado.
5. **`filename` null em linked_file** — o nome vem do path.
6. **Metadata pode ser pobre** (ex.: `date` vazio no livro real; ano só no filename) — o adapter não deve assumir campos completos; filename é fonte complementar.
7. **403 sem chave para bibliotecas privadas**; `/keys/current` resolve userID a partir da chave.
8. **Sem necessidade de baixar PDF para texto** — confirmado com a biblioteca real.
9. **Bibliotecas públicas raramente têm linked_file** — a validação só era possível com a biblioteca real; feita.

---

## 6. Mapeamento Zotero → UhHu! Document (validado)

| Campo UhHu! Document | Fonte na Zotero Web API v3 | Validado? |
|---|---|---|
| identity (UhHu) | gerado pelo Core; `integrations.zotero.itemKey` | — |
| title | `data.title` | ✓ |
| authors | `data.creators[]` | ✓ |
| publication | campos por itemType (`publicationTitle`, `bookTitle`, ...) | parcial |
| dates | `data.date` (pode ser vazio!), `dateAdded`, `dateModified` | ✓ (com ressalva) |
| identifiers | `data.DOI`, `ISBN`, `ISSN`, `url` | parcial |
| tags | `data.tags[].tag` (no item pai) | ✓ (vazias no caso real) |
| collections | `data.collections[]` + `/collections` | ✓ |
| attachments | `/items/{key}/children` | ✓ |
| storage reference | `linkMode` + `path` (linked_file) + **config. dir.-base** | ✓ |
| fulltext | `/items/{key}/fulltext` | ✓ |
| version/proveniência | `version`, `dateAdded/Modified`, `Last-Modified-Version` | ✓ |

---

## 7. Implicações para o Zotero Adapter (decisões derivadas propostas)

1. Consumir **diretamente a Web API v3**, sem Kerko — confirmado viável na prática.
2. Sincronização de catálogo: `?since=` + `Last-Modified-Version` + paginação `Total-Results`/`Link`.
3. Sincronização de fulltext: agregado `/fulltext` como fonte de novidades; busca o `content` sob demanda (`/items/{key}/fulltext`).
4. Normalizar fulltext para um shape único UhHu!.
5. **Configuração obrigatória do adapter:** mapeamento `attachments:` (diretório-base do Zotero) ↔ pasta Storage/WebDAV. Proposta: campo de configuração `zotero.linkedFileBasePath` no UhHu! Core, com valor padrão do setup Paulo = `UhHu Lib/Zotero Teste`.
6. A resolução do arquivo pode validar o nome real no storage (case/unicode: o PDF no Nextcloud tem nome idêntico ao path — validado).
7. Não indexar annotations nem duplicar PDFs (ADR-001 §2.2 e §4).

---

## 8. Pendências e próximos passos

- [x] Sondagem pública (endpoints/formats)
- [x] Chave de leitura + userID (20371492)
- [x] Validação item real: linked_file, path, fulltext, item↔attachment
- [x] Correspondência path ↔ Nextcloud (arquivo físico localizado)
- [x] Critério de aceitação ADR-001 §13 demonstrado
- [ ] **Decidir formalização:** registrar o mapeamento `attachments:` → Storage como **ADR-002** ("Linked File Path Mapping") ou como seção do futuro spec da API
- [ ] Definir stack e desenho do UhHu! Core/API (próximo documento: `UhHu_API_Initial_Spec.md`)
- [ ] Decidir como o WebDAV servirá o PDF ao cliente (proxy autenticado vs. link temporário) — `UhHu_Security_Notes.md`

---

## 9. Referências

- Zotero Web API v3: https://www.zotero.org/support/dev/web_api/v3/start
- ADR-001 — Fontes de Verdade e Desacoplamento de Integrações ([[ADR001 - UhhuLib]])
- Contexto de continuidade da Fase 0 ([[UhHu_Lib_Fase_0_Contexto_Atualizado]])
