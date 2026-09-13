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

## Milestone: v1.1 — Lab UI v1

**Shipped:** 2026-09-13
**Phases:** 4 (6–9) | **Plans:** 26 | **Sessions:** ~8 (plan 9, execute 9 em 3 waves, UAT 9, secure 9, audit, close ×3 com 1 abort)

### What Was Built
- App Expo + auth web/PAT + CORS + estados §11 + prova beta (Phase 6, UAT approved)
- Projetos/buscas/runs com polling, cascata, histórico, UUID cross-platform, lápis ✎ (Phase 7, UAT 4/4 tablet)
- Triagem infinita + decisão mutável + tags + ficha + lote incremental 100/fonte + decisões CAPES/MP definitivas (Phase 8, UAT 3/3 tablet)
- Corpus vivo + export 3 formatos + compare 2–4 + referência manual + gate beta/IDOR/UAT (Phase 9, UAT 7/7)

### What Worked
- UAT humana no tablet do Paulo por fase pegou o que teste não pega (rolagem, BUSCAR MAIS, selo Referência)
- Gate 09-06 com beta LIVE + matriz IDOR 16/16 fechou o milestone com prova, não com promessa
- Decisões Paulo 12/09 capturadas em 08-09/09-CONTEXT viraram comportamento testado (MP, termo cru, Ano-only)
- Auditoria de milestone antes do close reconciliou UI-23..28 sem re-trabalho de código

### What Was Inefficient
- Close tentado 2× antes da hora (sem audit; abort consciente) — o gate de audit existe por motivo
- Servidor beta mantido vivo entre sessões; dataset de prova reconstruído após truncate da suite
- `gsd-sdk` ausente neste container — orquestração manual com edições diretas de STATE/ROADMAP

### Patterns Established
- `selectedIds` por groupId inteiro como contrato entre lista e export (09-02 → 09-03)
- Helpers puros + testes antes da tela (filterCorpus, exportDelivery, compareHelpers)
- Slots condicionais col0..col3 em vez de FlatList aninhada (zero `.map` no JSX)
- Evidência beta em `/tmp/opencode/<fase>-evidence/` com headers literais

### Key Lessons
1. Checkbox de REQUIREMENTS só vale se o executor atualiza no fechamento do plano — drift reconciliado no audit/close, não na fase.
2. Tablet + tailnet são o ambiente de verdade do Lab; curl prova o servidor, nunca o fluxo do navegador.
3. run longo eager assusta — lote incremental + BUSCAR MAIS respeita a atenção do pesquisador.

### Cost Observations
- Model mix: opencode + Muse Spark (planner/executor/checker/auditor); sem medição fina
- Sessions: ~8; Notable: 26 plans em 3 dias; gargalo segue verificação humana + decisões de produto

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~10 | 5 | Baseline GSD (discuss→plan→execute→verify) com checkpoints humanos por fase |
| v1.1 | ~8 | 4 | Audit-milestone antes do close + gate beta/IDOR/UAT na fase final |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 195 | suite+integração PG real | fastest-levenshtein, MCP SDK 1.30.0 |
| v1.1 | lab 121 + smoke 28 + PG 20 (fase 9); monorepo 214 | UATs 06/07/08 approved + 09 7/7; IDOR 16/16 | zero deps novas (expo-crypto 57.0.3 version-aligned) |

### Top Lessons (Verified Across Milestones)

1. Prova viva contra fonte/servidor real antes de aprovar fase com integração externa.
