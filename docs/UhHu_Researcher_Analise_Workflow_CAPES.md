# UhHu! Lab — Análise do Workflow CAPES (protótipo n8n; histórico)

**Projeto:** UhHu! · **Produto:** UhHu Lab (ex-Researcher; ADR-006)
**Data original:** 13/08/2026
**Última atualização:** 09/09/2026
**Fonte:** `Pesquisa_Banco de Teses.json` (workflow n8n exportado, pasta `n8n` no Nextcloud)
**Status:** análise base para o adapter CAPES (`packages/sources/capes`)

> O workflow é evidência histórica do comportamento da CAPES. O destino atual
> não é Google Sheets/Docs: é o CORE compartilhado com PostgreSQL, conforme
> [[ADR009 - Core Compartilhado Modular e PostgreSQL]].

---

## 1. Fluxo do protótipo (22 nós)

```
entrada_bubble (webhook POST — frontend Bubble)
  → Nomeador (título do doc: "termo (ini-fim) data/hora")
  → Montador Payload (pagina 1)
  → HTTP Request → POST /catalogo-teses/rest/busca
  → XML (resposta XML → JSON: ResultadoConsulta)
  → Calculadora de Páginas (total ÷ 20 → páginas 2..N)
  → Loop Over Items:
      → Montador Payload1 (pagina atual) → HTTP Request1 → XML1
  → Merge (todas as páginas)
  → Edit Fields1 (listaDeTrabalhos = ResultadoConsulta.tesesDissertacoes.tesesDissertacoes)
  → Split Out (um item por trabalho)
  → Loop Over Items1 (batch 10):
      → Espião (GET $json.link — ficha HTML do trabalho)
      → Wait 2s (rate limit)
      → Detetive (extrai resumo, palavras-chave, possui_link da ficha)
      → Merge1 (enriquece trabalho por id)
      → Code2 (carimba divulgacaoAutorizada do form)
      → Divulgação Autorizada? (possui_link true?)
          ├─ sim → Edit Fields
          └─ não → Incluir não divulgados? (divulgacaoAutorizada == "no")
                    └─ sim → Edit Fields2 (Link = "O Trabalho não possui divulgação autorizada")
      → Merge2 → Formatador (decode HTML/acentos → bloco markdown)
      → Append row in sheet (Google Sheets "Pesquisa RSL")
  → Compilador Final (todos os blocos → markdown)
  → Update a document (Google Docs)
```

## 2. Payload da API CAPES (validado em produção)

```
POST https://catalogodeteses.capes.gov.br/catalogo-teses/rest/busca
Content-Type: application/json

{
  "termo": "\"Edgar Morin\"",          // aspas literais = frase exata
  "filtros": [
    { "campo": "Ano", "valor": "2020" },        // intervalo expandido ano a ano
    { "campo": "Grau Acadêmico", "valor": "..." },
    { "campo": "Grande Àrea Conhecimento", "valor": "..." },
    { "campo": "Área Conhecimento", "valor": "..." },
    { "campo": "Área Avaliação", "valor": "..." }
  ],
  "pagina": 1,
  "registrosPorPagina": 20
}
```

Resposta: **JSON** (desde 06/09/2026; o documento original registrava XML apesar do request JSON), estrutura `{ pagina, total, tesesDissertacoes: [...] }`. O mínimo operacional observado é de 5 registros por página.

## 3. Campos de cada trabalho (Result)

Vindos do XML da busca: `id`, `autor`, `titulo`, `nomePrograma`, `instituicao`, `grauAcademico`, `link` (ficha).

Enriquecidos pela ficha HTML (GET no `link`):
- `resumo` — `<span id="resumo">...</span>` (texto limpo de tags);
- `palavras_chave` — `<span id="palavras">...</span>`;
- `possui_link` — presença de `id="download:link_download_arquivo"` (PDF disponível/divulgado).

## 4. Regras de negócio observadas

- Filtro de Ano é expandido: cada ano do intervalo vira um filtro `{campo:"Ano", valor:"AAAA"}`;
- Termo sempre com aspas literais (busca de frase);
- Rate limit praticado: batch de 10 itens + wait 2s entre fichas;
- Trabalho sem divulgação autorizada: Link substituído pela string "O Trabalho não possui divulgação autorizada" (quando incluído);
- Título do documento de saída: `termo (anoIni-anoFim) dd/MM/yyyy HH:mm`.

## 5. Riscos / fragilidades (documentar no adapter)

- API `rest/busca` é **não oficial** (endpoint interno do catálogo) — monitorar quebras (a Plataforma Sucupira foi reformulada em set/2024; o protótipo segue funcionando);
- Extração por **IDs HTML** (`span id="resumo"`, `id="download:link_download_arquivo"`) — frágil a mudanças de layout;
- Sem dedup entre fontes (não há segunda fonte no protótipo);
- Destinos são Google Sheets/Docs — sem persistência própria nem exportação estruturada (CSV/BibTeX/JSON).

## 6. Mapeamento para o produto (Researcher v1 — ADR-006)

| Peça do protótipo | Destino no produto |
|---|---|
| Montador Payload / HTTP / XML | `packages/sources/capes` (adapter: buscar(filtros) → Result[]) |
| Detetive (ficha HTML) | `packages/sources/capes` (enrich: resumo, palavras_chave, possui_link) |
| ResultadoConsulta.tesesDissertacoes | Entidade `Result` do Core (id, autor, titulo, programa, instituicao, grau, ano, link, resumo, palavras_chave, possui_link, fonte=CAPES) |
| Webhook entrada_bubble | API `POST /api/v1/searches` (Project + Search: termo + filtros) |
| Loop/paginação/rate limit | Lógica interna do adapter (batch 10, wait 2s, páginas de 20) |
| Sheets/Docs | Persistência própria do UhHu CORE (PostgreSQL) + exportação CSV/BibTeX/JSON |
| — (inexistente) | Fonte BDTD via API JSON VuFind + dedup entre fontes + memória de buscas |
