---
tags:
  - uhhu
  - researcher
  - fontes
  - bdtd
  - capes
  - cobertura
  - investigacao
  - validado
date: 2026-09-06
status: validado
tipo: teste de cobertura entre fontes
---

# UhHu! — Cobertura BDTD × CAPES (teste comparativo, 06/09/2026)

> Teste executado por Hermes em 06/09/2026 (probe real nas duas plataformas), a pedido de Paulo,
> para responder: **"há trabalhos na plataforma da CAPES que não aparecem na BDTD?"**
> Resposta: **SIM — lacuna material (~57% dos títulos CAPES testados ausentes na BDTD).**
> Consequência: o Researcher v1 precisa das DUAS fontes (BDTD + CAPES); foco 100% em BDTD deixaria metade da produção da área de fora.

## 1. Pergunta e contexto

Paulo levantou a hipótese de a BDTD já agregar as fontes da CAPES/Sucupira (indício inicial: o índice BDTD
retorna ~1.141.114 registros no total, na ordem do universo Sucupira). Se confirmado, o Researcher poderia
focar 100% na busca BDTD e abandonar o adapter CAPES.

## 2. Metodologia

- **3 termos** (frases exatas entre aspas): `"Edgar Morin"`, `"ensino de química"`, `"pensamento complexo"`.
- **Limite temporal**: 2020–2023 (`filter[]=publishDate:[2020 TO 2023]` na BDTD; filtros `Ano` 2020..2023 na CAPES).
- **Comparação de totais**: `resultCount` (BDTD) × `total` (CAPES) por termo, com e sem filtro de doutorado.
- **Prova individual** (apenas `"ensino de química"` — a área de Paulo): 60 títulos CAPES (páginas 1, 3, 5 do ranking)
  verificados um a um na BDTD por `type=Title` (busca de título, n=5), com matching por normalização
  (minúsculas, sem acentos, sem pontuação; igualdade ou contenção).

## 3. Resultados — totais

| Termo (frase exata, 2020-2023) | CAPES total | BDTD total | CAPES dout. | BDTD dout. |
|---|---|---|---|---|
| "Edgar Morin" | 265 | 261 | 92 | 110 |
| "ensino de química" | **1.166** | **696** | 153 | 103 |
| "pensamento complexo" | 247 | 228 | 95 | 98 |

- Em 2 dos 3 termos os totais são próximos; em **"ensino de química" a BDTD tem ~40% menos** resultados que a CAPES.

## 4. Resultados — prova individual (60 títulos CAPES de "ensino de química")

- **26 presentes** na BDTD (match por título).
- **34 ausentes** — dos quais **29 com `resultCount=0`** (nenhum resultado similar na BDTD, mesmo fuzzy).
- **Taxa de ausência: 57%.**

Ressalva de honestidade metodológica: 5 dos 34 "ausentes" retornaram 1 resultado similar na BDTD (título
levemente divergente) — falso negativo do meu matching estrito. Mesmo no cenário mais otimista (contar esses 5
como presentes), a ausência fica em **~48%** — lacuna material em qualquer leitura.

## 5. Por que existe a lacuna

- A **CAPES/Sucupira** coleta de forma **obrigatória** os registros de conclusão dos PPGs (registro acadêmico).
- A **BDTD** depende de: depósito do texto completo no repositório institucional → harvest → indexação.
  Muitos PPGs não depositam na BDTD (texto embargado, não disponibilizado, repositório não conectado),
  então o trabalho existe na CAPES mas não na BDTD.
- Logo: BDTD não é um superconjunto da CAPES; são **coberturas com intersecção parcial**.

## 6. Consequências para o produto (Researcher v1)

1. **Manter as DUAS fontes no v1** (BDTD base + CAPES complementar) — decisão do ADR-006 confirmada e reforçada por evidência. Não focar 100% em BDTD.
2. **Dedup entre fontes é crítico e ganha função nova**: um trabalho presente nas duas deve aparecer uma vez (DedupGroup já previsto na jornada), e a interface pode informar de quais fontes veio.
3. **Oportunidade de produto**: relatório de cobertura por busca — "X trabalhos só na CAPES, Y só na BDTD, Z em ambas" — dá ao pesquisador confiança de que a busca é exaustiva e justifica a existência das duas fontes.
4. **CAPES deixa de ser só "complementar" e vira necessário**: a resiliência do adapter CAPES (testes de contrato, monitoramento) sobe de prioridade, pois sem ela ~50% da área de química fica fora.
5. A API CAPES mudou de resposta **XML → JSON** (observado neste teste) — atualizar o reference `2026-08-13-capes-adapter.md` e o contrato do adapter.

## 7. Adapter CAPES — atualização factual (06/09/2026)

- Resposta agora é **JSON** (`{pagina, registrosPorPagina, total, tesesDissertacoes:[...]}`), não XML como no reference de 13/08.
- Campos por item: `id`, `instituicao`, `nomePrograma`, `municipioPrograma`, `titulo`, `autor`, `dataDefesa`, `volumes`, `paginas`, `biblioteca`, `grauAcademico`, `link`.
- `registrosPorPagina` mínimo observado: 5 (1 retorna HTTP 500).
- `link` pode vir `undefined` (caminho legado) ou URL Sucupira-legado.
- Certificado TLS da API CAPES com problema de cadeia (curl exige `-k`); validar no deploy (não hardcodar `rejectUnauthorized:false`; documentar como risco de infra).

## Relações

- [[UhHu_BDTD_Adapter_Investigation]] — investigação da BDTD (mesma linha de trabalho)
- [[UhHu_Researcher_Analise_Workflow_CAPES]] — adapter CAPES (a atualizar: JSON)
- [[ADR006 - Researcher Primeiro Produto]] — duas fontes mantidas, agora com justificativa empírica
- [[UhHu_Researcher_Jornada_de_Uso]] — dedup entre fontes na Etapa 2 (Corpus)