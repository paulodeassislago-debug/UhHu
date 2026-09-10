# UhHu! — Fontes BDTD e CAPES (fatos operacionais)

> Shapes validados por probes reais (06/09/2026). Investigação completa no vault
> (`UhHu_BDTD_Adapter_Investigation.md`, `UhHu_Researcher_Analise_Workflow_CAPES.md`,
> `UhHu_Cobertura_BDTD_CAPES.md`). LER antes de mexer em qualquer adapter.

## Contexto legal e de política (resumo)

- Consumo programático de fontes públicas brasileiras: veredito compatível com
  LAI/LGPD/LDA/art. 154-A no documento de investigação da BDTD (§9).
- Fontes não oficiais: usar cortesia (batch + wait), UA identificado
  (`UhHu-Lab/<versão>`), circuit breaker. **Sem headless para burlar anti-bot.**
- A resposta a bloqueios é institucional (OAI oficial, LAI), nunca contorno.

## 1. BDTD (IBICT) — API VuFind 7.1.1

> O OAI-PMH da BDTD está **desativado** (HTTP 404 "OAI Server Not Configured").
> A fonte real é a API JSON do VuFind. Corrige a premissa original de OAI-PMH.

- Base de busca: `https://bdtd.ibict.br/vufind/api/v1/search`
- Parâmetros:
  - `lookfor=<termo>` + `type=AllFields|Author|Title`
  - `filter[]=format:"masterThesis"|"doctoralThesis"`
  - `filter[]=publishDate:[ANO_A TO ANO_B]`
  - paginação VuFind (`page`, `limit` conforme shape)
- Ficha/enriquecimento: `https://bdtd.ibict.br/vufind/Record/<id>` (HTML:
  orientador, banca, programa, palavras-chave, resumo).
- **Anti-bot:** cookie `OasisbrVerify` — sessão com cookie jar no SourceClient;
  renovação adaptativa quando a resposta vira HTML (challenge) em vez de JSON.
- Rate limit: sem limite duro observado (~15 chamadas em série); manter cortesia
  (batch ≤ 10 + pequeno wait), UA identificado.
- Shape validado: registro completo com todos os campos usados pelo `Result` do
  Lab (título, autor, ano, tipo, instituição, link, etc.).

## 2. CAPES — endpoint rest/busca (não oficial, monitorado)

- Endpoint: `POST https://catalogodeteses.capes.gov.br/catalogo-teses/rest/busca`
- Payload:

```json
{
  "termo": "\"frase exata\"",
  "filtros": [
    { "campo": "Ano", "valor": "2020" },
    { "campo": "Grau Acadêmico", "valor": "..." },
    { "campo": "Grande Àrea Conhecimento", "valor": "..." },
    { "campo": "Área Conhecimento", "valor": "..." },
    { "campo": "Área Avaliação", "valor": "..." }
  ],
  "pagina": 1,
  "registrosPorPagina": 20
}
```

- **Resposta: JSON** desde 06/09/2026 — `{ pagina, total, tesesDissertacoes: [...] }`
  (mínimo operacional: 5 registros por página).
- Regras de negócio observadas:
  - filtro de ano expandido: cada ano vira um filtro `{campo:"Ano", valor:"AAAA"}`;
  - termo com aspas literais = frase exata;
  - rate limit praticado: batch 10 + wait 2s;
  - trabalho sem divulgação autorizada → sinalizar (sem link de PDF).
- Enriquecimento por ficha HTML (GET no `link` do registro):
  - resumo → `<span id="resumo">`
  - palavras-chave → `<span id="palavras">`
  - PDF disponível → presença de `id="download:link_download_arquivo"`
- Riscos: API não oficial (pode quebrar a qualquer reformulação — Sucupira
  mudou em set/2024 e sobreviveu); scraping por IDs HTML é frágil a layout.
- TLS: problema de cadeia observado no probe → validar no deploy (não
  `rejectUnauthorized:false`).

## 3. Cobertura (por que as DUAS fontes)

- Prova individual com 60 títulos CAPES de "ensino de química": **57% ausentes
  na BDTD** (29/34 com resultCount=0). Amostra pequena, mas empírica.
- Consequência: BDTD + CAPES são obrigatórias no v1; dedup por interseção vira
  feature + relatório de cobertura ("só BDTD / só CAPES / ambas").

## 4. Registry de fontes (v1)

| Fonte | Nível | Estado | Nota |
|---|---|---|---|
| `bdtd` | não-oficial | habilitada | API VuFind validada |
| `capes` | não-oficial | habilitada | rest/busca validado (JSON) |
| `oasisbr` | não-oficial | **desabilitada** | porta aberta se IBICT voltar a servir |

## 5. Artigos (v2, fora do v1)

- DOAJ API v3: **validada** (200 sem token) — candidata a primeira fonte de artigos.
- SciELO: atrás de BunnyShield (anti-bot POW) — inviável hoje com cookie simples;
  investigação dedicada quando entrar.
- Portal Periódicos CAPES: **fora** (licenças de terceiros + autorização
  institucional CAFe/IP).
- Dedup de artigos: chave canônica passa a ser DOI (fallback título+ano+autor).
