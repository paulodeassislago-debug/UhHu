# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — CORE v1 + Lab v1

**Shipped:** 2026-09-11
**Phases:** 5 | **Plans:** 23 | **Sessions:** ~10

### What Was Built
- Monorepo pnpm/TS strict + PostgreSQL DEV + CI fail-closed (Phase 1)
- Auth/isolamento ownerId + IDOR adversarial + UAT 4/4 (Phase 2)
- Buscas reais BDTD/CAPES com runs temporais, partial e proveniência (Phase 3)
- Corpus com dedup/decisões/compare/exportação + mapper BDTD real (Phase 4)
- Capabilities execute() + PAT + CLI/MCP nos mesmos casos de uso, gate Etapa 2 (Phase 5)

### What Worked
- Checkpoints humanos com prova viva pegaram bugs reais (shape VuFind inventado, typecheck raiz, servidor obsoleto)
- Fixtures = snapshots vivos da fonte + teste de regressão que falharia no código antigo
- Wipe FK-safe total em todo teste de integração eliminou flakes em banco compartilhado
- Subagentes sequenciais com stage explícito por arquivo mantiveram working tree revisável

### What Was Inefficient
- Traceability REQUIREMENTS das Fases 2–3 nunca atualizada no fechamento (reconciliada só no arquivo)
- Prova contra servidor obsoleto (EADDRINUSE silencioso) gerou um ciclo de re-prova na Fase 4 e outro na 5
- Planos 05-03/05-04 previam arquivos (tsconfig, wrappers) fora do files_modified — fricção recorrente no escopo

### Patterns Established
- Pré-condição de banco documentada no header de scripts de prova + TRUNCATE com role migrate
- Bump de ADAPTER_VERSION em mudança semântica de mapper (proveniência honesta)
- REVIEW-FIX com testes de regressão por finding antes do ship do milestone
- Verificar servidor fresco via /health antes de concluir prova viva

### Key Lessons
1. Todo script de prova deve asserir a versão do código servido (health/version) antes do ALL PASS — servidor obsoleto é falso-positivo silencioso.
2. Fixture inventada esconde bug de mapper — snapshot vivo da API é obrigatório para adapters.
3. Typecheck da raiz ≠ typecheck dos pacotes — o job gates do CI é o que vale; vitest mascara erros de `import type`.
4. Não commitar planning-state junto com código sem avisar — hunks de STATE/ROADMAP em commits de plano confundem o log.

### Cost Observations
- Model mix: opencode + Muse Spark executor/review/verifier subagents; sem medição fina por modelo
- Sessions: ~10 (init, 5 discuss/plan, 5 execute, checkpoints, review-fix, verify, close)
- Notable: fases 2–5 executadas cada uma em 1 dia; gargalo foi verificação humana, não execução

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~10 | 5 | Baseline GSD (discuss→plan→execute→verify) com checkpoints humanos por fase |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 195 | suite+integração PG real | fastest-levenshtein, MCP SDK 1.30.0 |

### Top Lessons (Verified Across Milestones)

1. Prova viva contra fonte/servidor real antes de aprovar fase com integração externa.
