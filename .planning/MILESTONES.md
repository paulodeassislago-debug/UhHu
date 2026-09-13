# Milestones: UhHu!

## v1.0 CORE v1 + Lab v1 — ✅ SHIPPED 2026-09-11

**Phases:** 1–5 (23 plans, 104 commits, 3 days 2026-09-09 → 2026-09-11)
**Tag:** v1.0

Pesquisador executa busca real BDTD/CAPES pelo CORE com isolamento, proveniência e histórico; revisa, decide, compara e exporta o corpus; mesma capability por REST, CLI e MCP sem duplicar regra.

- Fundação: monorepo pnpm/TS strict + PG DEV + CI fail-closed 6/6
- Plataforma: auth convite/sessão/lockout + IDOR 404 + UAT 4/4
- Buscas: runs temporais, partial sem perda, BDTD viva 893 resultados
- Corpus: dedup exact/fuzzy, decisões, compare, CSV/BibTeX/JSON
- Headless: PAT 30d, CLI 22 comandos, MCP 11 tools, ALL PASS 3 canais, gate Etapa 2 approved

**Gates finais:** suite 195/195 · typecheck 7/7 · Gitleaks hist 0 · SAST 0 · audit 0 · verificação 20/20 · review-fix 7/7

**Archives:** `milestones/v1.0-ROADMAP.md` · `milestones/v1.0-REQUIREMENTS.md`
**Known deferred items at close:** 2 (CAPES live re-test; REVIEW info I-01–I-05) — see v1.0-ROADMAP.md Issues Deferred.

## v1.1 Lab UI v1 — ✅ SHIPPED 2026-09-13

**Phases:** 6–9 (26 plans, 130+ commits, 3 days 2026-09-11 → 2026-09-13)
**Tag:** v1.1

Pesquisador usa o Lab por interface tablet-first (web/PWA beta + nativo) consumindo SOMENTE o CORE — do login ao corpus exportado.

- Fundação: scaffold Expo SDK57 + client tipado + auth cookie/PAT + CORS allowlist + estados §11
- Projetos/buscas/execução: modal, form §6, polling 2500ms, cascata hard-delete, histórico, lápis ✎ (UAT 4/4 tablet)
- Triagem: lista infinita + decisão mutável + dedup expansível + tags + ficha + lote incremental 100/fonte (UAT 3/3 tablet)
- Corpus/export/compare: contador vivo + filtros + 3 formatos por grupo inteiro + 2–4 com ★ + referência manual; gate beta + IDOR 16/16 + UAT 7/7

**Gates finais:** lab 121/121 · smoke 28/28 · PG 20/20 · typecheck+lint 0 · `any`/menos-ruído/expo-sharing 0 · auditorias 0 crit/0 high · audit toolchain 2 high dev-only aceitos

**Archives:** `milestones/v1.1-ROADMAP.md` · `milestones/v1.1-REQUIREMENTS.md`
**Audit:** `v1.1-MILESTONE-AUDIT.md` (tech_debt, sem blockers; 26/32 satisfied + 6/32 partial-formalidade)
**Known deferred items at close:** H-01 frozen-vs-live; corpus-100; getJob órfão; Nyquist 6–9; filtros de área Paulo 12/09 — see v1.1-ROADMAP.md Issues Deferred.
