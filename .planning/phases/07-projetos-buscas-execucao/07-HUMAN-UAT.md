---
status: partial
phase: 07-projetos-buscas-execucao
source: [07-VERIFICATION.md]
started: 2026-09-12T01:00:00Z
updated: 2026-09-12T01:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Ponta a ponta no tablet via tailnet
expected: criar projeto → criar estratégia → executar busca real BDTD/CAPES até banner terminal (ok/parcial) — sem erro de build, sem redbox
result: [pending]

### 2. Sair e voltar no meio do run (D-08)
expected: run sobrevive no servidor; voltar mostra estado atual; sem execução duplicada ao retornar
result: [pending]

### 3. Polling em rede degradada (MD-01)
expected: respostas getRun fora de ordem nunca congelam a tela nem revertem estado terminal
result: [pending]

### 4. Diálogo de cascata + histórico com dados reais
expected: contagens exibidas; confirmar exclui (hard-delete); entrada do histórico abre o run
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
