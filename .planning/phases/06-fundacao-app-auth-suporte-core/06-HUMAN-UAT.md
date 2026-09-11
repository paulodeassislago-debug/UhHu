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
expected: scan QR on tailnet, navegar login→projetos→projeto→abas sem redbox; login PAT nativo exibe lista real; SecureStore guarda PAT; logout revoga; LISTA ROLA até o fim (nenhum conteúdo cortado)
result: [pending — mesmo root cause do item 2 se aplica ao nativo (View não rola); re-testar após 06-05]

### 2. Web beta na origem aprovada (browser real)
expected: login via cookie httpOnly → /projects reais; sem cookie 401 PT-BR com aviso de expiração preservando next e retorno ao projeto após login; ACAO exata só na origem aprovada; LISTA ROLA até o fim
result: [issue — 11/09/2026: lista NÃO rola. body.scrollHeight=1668 vs clientHeight=493, overflowY=hidden, zero scroll containers. Causa: projects.tsx View+map sem ScrollView/FlatList. Login/auth aprovados (24 itens reais, link /project/[id] ok). Gap plan 06-05 aberto.]

## Summary

total: 2
passed: 0
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps
