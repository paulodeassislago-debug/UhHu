# Aceites formais de seguranca (excecao D-13)

Nenhum aceite vigente.

Qualquer supressao futura de gate (Gitleaks, SAST, `pnpm audit`) EXIGE entrada
datada abaixo com prazo + responsavel. Supressao silenciosa via edicao do
workflow e indistinguivel de sabotagem e proibida.

| Data | Gate | Achado | Prazo | Responsavel | Status |
|------|------|--------|-------|-------------|--------|
| 2026-09-13 | `pnpm audit --audit-level high` | CVE-2025-71329 (JXL/HEIF DoS) + CVE-2025-71330 (ICNS DoS) em `image-size` transitiva via `metro@0.87.0` (861 paths, Expo SDK57 dev-only). Sem patch upstream (`patched <0.0.0`, 2.0.2 latest ainda vulneravel). Mitigação: `pnpm.overrides image-size ^2.0.2` (linha mantida; API `exports.default` compatível com metro, provado via `expo export` + suite lab) + `auditConfig.ignoreCves` só nestes 2 CVEs (CI segue fail-closed p/ todo o resto). Risco aceito: metro roda localmente sobre assets próprios, nunca input não-confiável. | 2026-12-13 (reavaliar em upgrade Expo/metro ou patch upstream) | Hermes | vigente |
