# Phase 6: Fundação do app + auth + suporte CORE - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-11
**Phase:** 6-Fundação do app + auth + suporte CORE
**Areas discussed:** Provisionar PAT nativo, Acesso beta + CORS, Escopo nativo fase 6

---

## Provisionar PAT nativo

| Option | Description | Selected |
|--------|-------------|----------|
| Login no app → PAT | App pede e-mail+senha, troca por PAT via POST /auth/token e guarda em secure storage. Zero infra extra. | ✓ |
| Gerar na web e copiar | Gerar na sessão web e digitar/copiar o token no tablet. Útil se o login nativo travar. | |
| QR code | Web exibe QR com o PAT; app escaneia e armazena. Mais peças (câmera, encoder). | |

**User's choice:** Login no app → PAT (Recommended)
**Notes:** CORE já suporta (POST /auth/token recebe e-mail+senha+deviceName, D-60/D-63 verificado no código).

## Como identificar o device no PAT

| Option | Description | Selected |
|--------|-------------|----------|
| Automático por device | deviceName automático (modelo + data); reinstalação = novo PAT, antigos revogáveis na web futuramente. | ✓ |
| Nome digitado | Usuário digita um nome ('tablet Paulo') na hora do login. | |

**User's choice:** Automático por device (Recommended)
**Notes:** Revogação via web diferida (futura).

---

## Onde roda o web beta

| Option | Description | Selected |
|--------|-------------|----------|
| VPS dev + tailnet | Expo web servido na VPS dev, acesso via tailnet/local. CORS fecha numa origem interna. Sem exposição pública. | ✓ |
| Link público beta | Subdomínio público com TLS via nginx. Exige hardening + rate limit revisado antes. | |
| Local primeiro | Expo web local no container; tablet acessa via LAN/tailnet. Zero deploy. | |

**User's choice:** VPS dev + tailnet (Recommended)
**Notes:** Nenhuma.

## Postura do CORS

| Option | Description | Selected |
|--------|-------------|----------|
| Allowlist exata | CORS allowlist com origem(ns) exata(s) do beta; resto bloqueado. Teste via curl com Origin adulterado. | ✓ |
| Permissivo em dev | Espelhar Origin em dev para iterar rápido; travar antes do beta com colegas. | |

**User's choice:** Allowlist exata (Recommended)
**Notes:** Verificado que o CORE hoje não tem plugin CORS (apps/core-api/src/index.ts) — UI-32 cria do zero.

---

## Nativo na fase 6: Expo Go vs EAS

| Option | Description | Selected |
|--------|-------------|----------|
| Expo Go + web | Login→PAT→projetos validado no Expo Go + web; EAS entra quando houver target/testador. | ✓ |
| EAS build já | APK/AAB ou dev-client já na fase 6. Soma conta EAS + build + assinatura ao escopo. | |

**User's choice:** Expo Go + web (Recommended)
**Notes:** Nenhuma.

## Alvos nativos da fase 6

| Option | Description | Selected |
|--------|-------------|----------|
| Android primeiro | Tablet do Paulo primeiro; iOS entra quando houver device/testador. | ✓ |
| Android + iOS | Ambos desde a fase 6. | |

**User's choice:** Android primeiro (Recommended)
**Notes:** Nenhuma.

---

## OpenCode's Discretion

SDK Expo/versão, template, metro+pnpm, estrutura do app, client HTTP, estado/data-fetching, ordem interna dos planos.

## Deferred Ideas

None — EAS, iOS, revogação de PATs pela web e link público ficaram como decisões de escopo (ver CONTEXT.md D-02/D-03/D-05/D-06), não ideias soltas.
