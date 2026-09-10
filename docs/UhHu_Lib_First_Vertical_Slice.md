---
tags: [uhhu, fase0, spec, vertical-slice]
date: 2026-08-13
status: suspenso — referência histórica do Lib; não é próximo slice
---

# UhHu! Lib — Primeiro Vertical Slice (v2, histórico)

**Projeto:** UhHu!
**Produto:** UhHu! Lib (fora do caminho crítico atual)
**Documento:** UhHu_Lib_First_Vertical_Slice.md
**Data:** 13/08/2026 (v2 — reorientado por [[ADR005 - Modelo de Produto]])
**Status:** SUSPENSO desde o pivô do Lab; não iniciar a partir deste documento
**Base normativa histórica:** [[UhHu_API_Initial_Spec]] · [[ADR001 - UhhuLib]] · [[ADR002 - Resolução de Storage Reference]] · [[ADR003 - Core Stack]] · [[ADR004 - Entrega de Arquivos]] · [[ADR005 - Modelo de Produto]] · [[UhHu_Security_Notes]]

> Este documento preserva o slice originalmente planejado para o Lib. Ele usa
> SQLite, owner key e uma topologia de catálogo que não são mais decisões
> vigentes. A arquitetura atual do CORE está em [[ADR009 - Core Compartilhado Modular e PostgreSQL]].

---

## 1. Objetivo

Validar de ponta a ponta o produto em seus dois modos, na ordem definida pelo ADR-005:

- **Estágio 1 — Modo Catálogo (nativo):** criar um catálogo, adicionar itens e compartilhar a estante via link;
- **Estágio 2 — Modo Zotero:** sincronizar com o Zotero via WebDAV (com aviso de duplicação), servindo arquivos do storage ao browser, sem duplicar PDFs no servidor.

Sem UI web nesta iteração: o alvo é a **API funcionando de ponta a ponta**, verificável via curl/browser, com dados reais (catálogo de teste e biblioteca Zotero).

## 2. Escopo

### 2.1. Esqueleto do monorepo (pnpm)

```
apps/api/               → Fastify + Core
packages/core/          → domínio, casos de uso, sincronizador
packages/models/        → entidades e tipos (Document, Collection, Attachment, StorageReference, Catalog)
packages/zotero-adapter/→ integração Zotero Web API v3
packages/storage/       → StorageProvider WebDAV/Nextcloud
packages/config/        → configuração e segredos
```

TypeScript strict, Zod nos schemas de fronteira, Drizzle + SQLite (FTS5).

### 2.2. Estágio 1 — Modo Catálogo (primeiro)

- CRUD de catálogos e itens (título, autores, ano, itemType, tags, coleções, capa via URL, **referência/URL de arquivo** — sem upload persistente);
- `GET /c/{slug}` — estante pública, leitura sem auth (primeira iteração); OAuth de identidade na iteração seguinte (ADR-005 §5.1);
- persistência em SQLite; UUID v7 conforme spec.

### 2.3. Estágio 2 — Modo Zotero

- **fluxo de conexão:** `POST /api/v1/integrations/zotero` exige confirmação do aviso de duplicação WebDAV (registro da confirmação no banco);
- **sincronizador** (one-shot `uhhu sync`): catálogo incremental (`?since=0`; `Last-Modified-Version` persistido), upsert Documents/Collections/Tags/Attachments, fulltext via agregado `/fulltext` → FTS5, validação de storage references (status `resolved | missing`), derivação de `filename` e `deepLinks.zotero`, idempotente;
- **API mínima:** `GET /documents` (q/collection/sort), `GET /documents/{id}`, `GET /collections`, `GET /files/{attachmentId}` (proxy com Range), `GET /thumbnails/{attachmentId}` (preview Nextcloud), `POST /sync`, `GET /sync/status`;
- **pass-through:** `POST /api/v1/catalogs/{id}/files` recebe o arquivo e transfere ao destino (WebDAV do Zotero) sem persistir — verificação de não-duplicação.

### 2.4. Auth e Docker

- API key de instalação (Bearer) para operação; CORS + rate limiting básicos;
- Dockerfile multi-stage + docker-compose (volume SQLite + segredos read-only) — conforme [[UhHu_Deployment_Notes]].

## 3. Critérios de aceitação

**Estágio 1:**
1. `POST /api/v1/catalogs` + itens → `GET /c/{slug}` renderiza a estante pública (JSON/HTML) sem auth;
2. catálogo persiste no SQLite; operações idempotentes.

**Estágio 2:**
3. `POST /api/v1/integrations/zotero` sem confirmação do aviso → erro; com confirmação → conectado;
4. `uhhu sync` popula o banco com itens reais (≥ 1 documento com attachment resolvido — imported_file via WebDAV e/ou o linked_file existente);
5. `GET /api/v1/documents?q=morin` retorna o documento real; `GET /api/v1/files/{id}` abre o PDF no browser (Range → 206 em request parcial); `GET /thumbnails/{id}?size=400` retorna imagem;
6. sem Bearer → 403;
7. **não-duplicação:** após sync e pass-through, nenhum arquivo permanece no volume do Core; o PDF continua apenas no Nextcloud;
8. sync reexecutada é idempotente (sem duplicar documentos).

## 4. Fora de escopo (deliberadamente)

- OAuth de identidade (iteração seguinte); redirect/signed links (ADR-004) — apenas proxy;
- UI web, busca avançada/facetas (Fase 2), deep links funcionais;
- IA de metadados e e-reader (direções Nível C — ADR-005 §6-7, com gate);
- OAuth de conexão de storage, Planner/RSL, Android.

## 5. Dependências do ambiente (pré-requisitos do deploy)

- [ ] usuário `uhhu-service` criado no Nextcloud e pasta `UhHu Lib` sob o espaço dele (Security Notes §4);
- [ ] senha de app do serviço → arquivo de segredos;
- [ ] token Zotero disponível (já em `~/.hermes/secrets/zotero_api_key`);
- [ ] chave mestra + owner key geradas no setup;
- [ ] domínio/subdomínio + nginx TLS (referência: `uhhu.profpauloassis.com.br`).

## 6. Riscos conhecidos

- fulltext do segundo PDF da pasta ainda não indexado no Zotero (o slice só exige um documento resolvido);
- se o Nextcloud exigir configuração de preview para PDFs grandes, validar o endpoint de thumbnail no primeiro deploy;
- o fluxo de migração do Zotero para WebDAV storage (imported files) é pré-requisito do Estágio 2 completo — o slice aceita validar com o linked_file existente enquanto a migração não ocorre.

## 7. Referências

- [[UhHu_API_Initial_Spec]] · [[ADR001 - UhhuLib]] · [[ADR002 - Resolução de Storage Reference]] · [[ADR003 - Core Stack]] · [[ADR004 - Entrega de Arquivos]] · [[ADR005 - Modelo de Produto]] · [[UhHu_Security_Notes]] · [[UhHu_Zotero_Adapter_Investigation]]
