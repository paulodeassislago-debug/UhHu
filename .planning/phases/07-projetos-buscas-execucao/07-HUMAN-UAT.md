---
status: approved
phase: 07-projetos-buscas-execucao
source: [07-VERIFICATION.md]
started: 2026-09-12T01:00:00Z
updated: 2026-09-12T14:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Ponta a ponta no tablet via tailnet
expected: criar projeto → criar estratégia → executar busca real BDTD/CAPES até banner terminal (ok/parcial) — sem erro de build, sem redbox
result: [passed — 12/09/2026 browser headless (EXECUTAR AGORA → /run, BDTD 20 itens, banner parcial correto) + tablet do Paulo, aprovado]

### 2. Sair e voltar no meio do run (D-08)
expected: run sobrevive no servidor; voltar mostra estado atual; sem execução duplicada ao retornar
result: [passed — 12/09/2026 tablet do Paulo, aprovado]

### 3. Polling em rede degradada (MD-01)
expected: respostas getRun fora de ordem nunca congelam a tela nem revertem estado terminal
result: [passed — 12/09/2026 tablet do Paulo, aprovado]

### 4. Diálogo de cascata + histórico com dados reais
expected: contagens exibidas; confirmar exclui (hard-delete); entrada do histórico abre o run
result: [passed — 12/09/2026 tablet do Paulo, aprovado]

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
