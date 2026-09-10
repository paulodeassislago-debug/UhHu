---
tags:
  - uhhu
  - researcher
  - v2
  - periodicos
  - fontes
  - visao
date: 2026-09-07
status: visão exploratória (a validar)
tipo: análise de viabilidade v2
---

# UhHu! Lab — v2: Artigos de Periódicos Nacionais (análise de viabilidade)

> O UhHu Lab era chamado Researcher nos documentos anteriores.

> Pergunta exploratória de Paulo (06/09/2026): "é viável, em uma v2, incluir uma busca
> dentro dos indexadores dos periódicos CAPES, para incluir artigos de periódicos nacionais?"
> Resposta curta: **viável, mas o 'indexador de periódicos CAPES' não é a melhor fonte;
> o caminho é DOAJ (validado) + SciELO (a validar anti-bot) + DOI como chave de dedup.**

## 1. Fatos levantados por probe (06/09/2026)

| Fonte | Endpoint testado | Resultado |
|---|---|---|
| Portal Periódicos CAPES | `periodicos.capes.gov.br` | HTTP 403 (WAF) |
| SciELO (domínio .br) | `www.scielo.br/oai/`, `/api/`, `search.scielo.org/api.php`, `analytics.scielo.org/api` | Todos 403/HTML de challenge **BunnyShield** (proof-of-work `data-pow`) |
| SciELO OAI alternativo | `oai.scielo.br` | Não resolve (DNS) |
| SciELO rede | `www.scielo.org/oai/` | 302 (não resolvido no probe) |
| **DOAJ API v3** | `doaj.org/api/v3/search/articles/<q>` | **HTTP 200, sem token, JSON real** (ex.: artigo BR da HOLOS com DOI e ISSN) |

## 2. Por que o Portal de Periódicos CAPES NÃO é a fonte

- É um **metabuscador que delega a bases licenciadas de terceiros** (EBSCO, ProQuest, Web of Science…);
- conteúdo full-text exige **autenticação institucional (CAFe/IP)** — um produto distribuído não pode depender disso;
- metadados de bases licenciadas têm **restrições contratuais de terceiros** (zona cinzenta pior que BDTD/CAPES);
- 403/WAF na borda, sem API pública de busca de artigos.
- Único papel possível: **descoberta apontando para o acesso institucional** — não coleta. Fora do caminho distribuível.

## 3. As fontes que resolvem o problema de verdade

1. **DOAJ (Directory of Open Access Journals)** — **VALIDADO no probe** (200 sem token):
   - API v3 pública, JSON, sem chave; indexa periódicos de acesso aberto do mundo, incluindo **nacionais BR**;
   - oficial, estável, sem anti-bot — encaixa como fonte `Source` do Core sem modificação de arquitetura;
   - limite: só acesso aberto (não cobre periódicos pagos/embargados).
2. **SciELO** — o indexador nacional canônico de periódicos brasileiros (é o "BDTD dos artigos"):
   - cobre o que o Paulo imagina do CAPES, com acesso aberto;
   - **hoje atrás de BunnyShield (anti-bot POW) em toda a borda** — inviável com cookie simples como a BDTD; exige investigação dedicada (API da rede `scielo.org`, Analytics/API oficial, ou path institucional) — marcar como **prova de conceito pendente** antes de prometer.
3. **Crossref (DOI)** — API oficial; DOI é o identificador canônico de artigos; lista o que tem DOI (quase todos os periódicos BR que indexam DOI, inclusive SciELO). Bom para descoberta e **enriquecimento**.
4. **OpenAlex / Redalyc** — agregadores internacionais com API gratuita; cobrem parte da produção BR (OpenAlex cobre SciELO/Redalyc); úteis como auxiliares.

## 4. Impacto no Core (é pequeno — arquitetura já preparada)

- A interface `Source` do Researcher (search/enrich/registry) aceita novos adapters **sem mudança de Core**: `sources/doaj`, `sources/scielo`, `sources/crossref`.
- **Dedup**: para artigos, a **chave canônica muda para DOI** (identificador único, mais forte que título+ano+autor); a chave atual (título+ano+autor) permanece como fallback para itens sem DOI.
- `Result` ganha campos de artefato: **periódico, ISSN, volume, fascículo, páginas, DOI** (o modelo atual é de teses/dissertações).
- Filtros de artefato: periódico, área, ano — mesmos princípios (fonte honra o que pode; Core garante pós-filtro).
- Jornada: a Etapa 2 (Corpus) e Etapa 3 (Análise) são agnósticas de artefato — teses e artigos convivem no mesmo projeto (o que é desejável numa RSL mista).

## 5. Recomendação v2

1. **DOAJ como primeira fonte de artigos** (oficial, validada, custo de adapter baixo);
2. **SciELO como meta** — investigar anti-bot (é a fonte canônica nacional; se o BunnyShield for resolvível com o SourceClient + navegador headless — política atual NÃO prevê headless —, avaliar caminho institucional/API da rede);
3. **Crossref/OpenAlex como enriquecimento** (DOI);
4. **Portal Periódicos CAPES: fora** (licenças de terceiros + autorização institucional);
5. Padrão do projeto preservado: fontes não-oficiais com teste de contrato + circuit breaker + portas legais (LAI/parcerias).

## 6. Decisão de agora

- NÃO entra no v1. Registrar como **visão v2** (este documento) + pendência "validação SciELO anti-bot" quando o v1 estiver no ar.
- DOAJ sem necessidade de ação imediata — o adapter é barato e o shape já está validado.

## Relações

- [[UhHu_Researcher_v1_Spec]] (interface Source, dedup por chave canônica — base para o DOI)
- [[UhHu_Cobertura_BDTD_CAPES]] (mesma lógica de teste de cobertura, aqui para artigos)
- [[ADR007 - Visao de Produto Hub IA de Pesquisa]] (visão do hub: a produção científica brasileira inclui artigos)