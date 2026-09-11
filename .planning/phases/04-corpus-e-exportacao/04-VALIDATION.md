---
phase: 4
slug: corpus-e-exportacao
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-11
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `04-RESEARCH.md` § Validation Architecture (vitest 3.0.5, smoke + integration).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.0.5 (workspace `smoke` + `integration`) |
| **Config file** | `vitest.config.ts` (raiz) — smoke `tests/smoke/**`, integration `tests/integration/**`, skip gracioso sem PG |
| **Quick run command** | `pnpm vitest run --project smoke` (ou `pnpm test` = tudo) |
| **Full suite command** | `pnpm test:integration` (exige `APP/MIGRATION_DATABASE_URL`; CI com `postgres:16-alpine`) |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck` + escopo de teste afetado (`-- lab-corpus`)
- **After every plan wave:** Run `pnpm test` (smoke+integration contra PG DEV)
- **Before `/gsd-verify-work`:** Full suite must be green + `curl-corpus.sh ALL PASS` + auditoria adversarial + checkpoint humano (padrão 03-06)
- **Max feedback latency:** 120 seconds

---

## Per-task Verification Map

| task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | LAB-06 (regressão) | — | N/A | integration (existente) | `pnpm test:integration -- lab-search-runs` | ✅ | ⬜ pending |
| 04-0X-0X | TBD | TBD | LAB-07 | T-04-IDOR | exact agrupa; fuzzy ≥0.9 → pending; veto lembrado | unit + integration | `pnpm vitest run --project smoke -- dedup` + `pnpm test:integration -- lab-corpus` | ❌ W0 | ⬜ pending |
| 04-0X-0X | TBD | TBD | LAB-08 | T-04-IDOR | decisão por grupo; corpus reflete na hora; pending fora | integration | `pnpm test:integration -- lab-corpus` | ❌ W0 | ⬜ pending |
| 04-0X-0X | TBD | TBD | LAB-09 | T-04-XSS | seed defaults; divergência sem mudar decisão | integration | `pnpm test:integration -- lab-corpus` | ❌ W0 | ⬜ pending |
| 04-0X-0X | TBD | TBD | LAB-10 | T-04-ENUM | 4 blocos exatos; overlap por chaves; último run | integration | `pnpm test:integration -- lab-corpus` | ❌ W0 | ⬜ pending |
| 04-0X-0X | TBD | TBD | LAB-11 | T-04-CSV/T-04-FILENAME | CSV 1 linha/grupo; BibTeX -a/-b; Content-Disposition | unit + integration | `pnpm test:integration -- lab-corpus` + `bash scripts/curl-corpus.sh` | ❌ W0 | ⬜ pending |
| 04-0X-0X | TBD | TBD | IDOR (rotas novas) | T-04-IDOR | dono/estranho/adulterado 404 em TODA rota com ID | integration + curl | `pnpm test:integration -- idor-matrix` + `curl-corpus.sh` | ❌ W0 (extensão) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/integration/lab-corpus.test.ts` — cobre LAB-07–LAB-11 + IDOR das rotas novas (harness = `lab-search-runs.test.ts`)
- [ ] `tests/integration/fixtures/dedup-overlap.json` — pares BDTD/CAPES: exatos, fuzzy (typo/pontuação), distintos mesmo autor, cross-ano
- [ ] `tests/unit/dedup-exports.test.ts` (ou casos no corpus test) — `normalizeTitle/canonicalKey/similarity/csvCell/escapeBibtex/slug` puros + adversariais (`=CMD`, `"`, `%`, `&`)
- [ ] `scripts/curl-corpus.sh` — molde `curl-lab.sh`: dedup→decisão→corpus→compare→export + 404s + 401
- [ ] `pnpm --filter @uhhu/core-api add fastest-levenshtein` (única dep nova)
- [ ] Migration 0003 (`drizzle-kit generate`, mold 0002): 8 tabelas lab com CHECKs, FKs cascade, UNIQUEs

*Planner MUST include these as Wave 0 / first-plan tasks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Busca viva BDTD+CAPES com corpus real | LAB-02–05/12 (regressão) | Rede real + julgamento humano (padrão 03-06) | Checkpoint humano do plano final: 1 busca viva, confirmar corpus com grupos + export |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
