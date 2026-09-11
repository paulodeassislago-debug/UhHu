---
status: partial
phase: 06-fundacao-app-auth-suporte-core
source: [06-VERIFICATION.md]
started: 2026-09-11T20:00:00Z
updated: 2026-09-11T20:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Tablet Android real via Expo Go
expected: scan QR on tailnet, navegar login→projetos→projeto→abas sem redbox; login PAT nativo exibe lista real; SecureStore guarda PAT; logout revoga
result: [pending]

### 2. Web beta na origem aprovada (browser real)
expected: login via cookie httpOnly → /projects reais; sem cookie 401 PT-BR com aviso de expiração preservando next e retorno ao projeto após login; ACAO exata só na origem aprovada
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
