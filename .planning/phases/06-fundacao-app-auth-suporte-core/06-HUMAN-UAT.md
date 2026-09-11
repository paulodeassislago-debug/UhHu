---
status: approved
phase: 06-fundacao-app-auth-suporte-core
source: [06-VERIFICATION.md]
started: 2026-09-11T20:00:00Z
updated: 2026-09-11T21:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Tablet Android real via Expo Go
expected: scan QR on tailnet, navegar login→projetos→projeto→abas sem redbox; login PAT nativo exibe lista real; SecureStore guarda PAT; logout revoga; LISTA ROLA até o fim (nenhum conteúdo cortado)
result: [passed — 11/09/2026 re-teste após 06-05: lista rola até o fim no tablet + browser]

### 2. Web beta na origem aprovada (browser real)
expected: login via cookie httpOnly → /projects reais; sem cookie 401 PT-BR com aviso de expiração preservando next e retorno ao projeto após login; ACAO exata só na origem aprovada; LISTA ROLA até o fim
result: [passed — 11/09/2026 re-teste após 06-05: rolagem OK; aprovado pelo usuário ("aprovado")]

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
