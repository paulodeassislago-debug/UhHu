---
status: complete
phase: 09-corpus-exportacao-comparacao
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md, 09-03-SUMMARY.md, 09-04-SUMMARY.md, 09-05-SUMMARY.md, 09-06-SUMMARY.md]
started: 2026-09-13T15:30:37Z
updated: 2026-09-13T15:40:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Corpus contador vivo + vazio orientador
expected: Aba Corpus mostra header vivo `Corpus: N` (contagem do GET). Com elegíveis lista por grupo; sem elegíveis mostra `Nenhum item elegível ainda — trie os resultados primeiro`.
result: pass

### 2. Filtros tag/fonte/ano + vazio de filtro
expected: 3 filtros (tag texto, BDTD/CAPES toggle, ano numérico) com AND. Filtro sem match mostra `Nenhum item com estes filtros`. Contador NÃO muda ao filtrar.
result: pass

### 3. Seleção por grupo + Exportar seleção 3 formatos
expected: Checkbox por grupo inteiro (`Selecionar`/`Selecionado`), texto `Seleção: X de Y`. Botão `Exportar seleção` disabled sem seleção; com seleção exporta CSV/BibTeX/JSON via blob+anchor (web) / Share (nativo).
result: pass

### 4. Export completo + BibTeX MP + aviso vazio
expected: Botão `Exportar corpus completo` nos 3 formatos com attachment `corpus-*.csv|bib|json`. BibTeX do MP = `@mastersthesis` + `type={Mestrado profissional}`; master/doctoral sem marca. Seleção vazia em BibTeX mostra `Nada para exportar em BibTeX — selecione ao menos um item.` sem request.
result: pass

### 5. Compare 2-4 lado a lado + Por ano global
expected: Seleção de 2-4 buscas com contador `N selecionadas (2 a 4)`, botão Comparar só em 2..4. Tabela com Resultados/BDTD/CAPES/Sobreposição + bloco `Por ano (todas)` global. Vazio inicial `Marque 2+ estratégias para comparar`.
result: pass

### 6. ★ mais inclusiva + rota TabBar sem menos-ruído
expected: Coluna vencedora com `★ mais inclusiva` (empate = primeira). Nenhum texto `menos ruído` em tela ou código. Aba `Comparação` abre via TabBar.
result: pass

### 7. Referência selo + 1 toque + coluna destacada
expected: Card da referência mostra selo `Referência`; demais mostram `Usar como referência` (1 toque, sem confirmação). Troca persiste via PATCH. Compare destaca coluna `Referência`. Referência NÃO filtra corpus/resultados/export.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
