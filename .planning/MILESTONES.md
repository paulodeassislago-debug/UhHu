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
