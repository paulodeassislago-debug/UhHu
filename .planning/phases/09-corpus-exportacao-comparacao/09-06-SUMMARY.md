---
phase: 09-corpus-exportacao-comparacao
plan: 06
subsystem: api
tags: [gate, beta, corpus, export, compare, idor, expo, bibtex]

# Dependency graph
requires:
  - phase: 09-corpus-exportacao-comparacao
    provides: [CORE BibTeX MP type={Mestrado profissional} (09-01), Corpus real na UI (09-02), Export UI 3 formatos (09-03), Compare 2-4 + mais inclusiva (09-04), Referencia manual (09-05)]
provides:
  - Gate do milestone: slice vertical login->corpus/export/compare provado na web beta com dados reais
  - Matriz IDOR 4x4 (16/16) + auditoria adversarial 0 crit/0 high + aceite humano UAT
affects: [milestone-v1.1-close]

# Tech tracking
tech-stack:
  added: []
  patterns: [gate literals recorded verbatim in SUMMARY, beta proof via curl attachment headers, IDOR matrix owner/stranger/tampered/anon]

key-files:
  created: []
  modified: [apps/core-api/src/lib/corpus.ts, apps/core-api/src/lib/searches.ts]

key-decisions:
  - "parseDocType passa a preservar professionalMaster (fix Rule 1) — sem ele o type={Mestrado profissional} do 09-01 era anulado no corpus"
  - "pnpm audit com 2 high aceito como toolchain Expo dev-only pré-existente (mesmo aceite desde 06-02, sem patch upstream)"
  - "UAT humana approved — milestone v1.1 pronto para encerrar"

patterns-established:
  - "parseDocType allowlist estrita espelha o enum DocType de contracts (server-side, sem input cru)"
  - "Prova beta registra headers literais Content-Disposition attachment + BibTeX MP como selo fim-a-fim"

requirements-completed: [UI-23, UI-24, UI-25, UI-26, UI-27, UI-28, UI-29]

# Metrics
duration: ~45min (task 1 beta+gates+fix + checkpoint UAT + finalizacao)
completed: 2026-09-13
---

# Phase 9 Plan 6: Gate do milestone Summary

**Slice vertical login->corpus/export/compare provado na beta LIVE (API :3009, web :8081, Projeto Corpus 90) com 3 attachments, compare 4 blocos, IDOR 16/16, auditoria 0 crit/0 high e UAT humana approved**

## Performance

- **Duration:** ~45 min (task 1 com beta+gates+fix; checkpoint humano; finalizacao SUMMARY+STATE/ROADMAP)
- **Started:** 2026-09-13T14:38:00Z
- **Completed:** 2026-09-13T15:30:00Z
- **Tasks:** 2 (task 1 auto + checkpoint human-verify approved)
- **Files modified:** 2

## Accomplishments

- Gates do app verdes com saidas literais: typecheck exit 0, lint 0 errors, lab vitest 121/121, smoke dedup-exports 28/28, 3 greps de proibidos = 0
- Beta LIVE provada com dados reais (Projeto Corpus 90): corpus com 1 elegivel professionalMaster + 3 exports com `Content-Disposition: attachment` + BibTeX do MP com `type={Mestrado profissional}` + compare de 2 buscas com 4 blocos
- Matriz IDOR 4x4 completa: 16/16 com dono 200 / estranho 404 / adulterado 404 / sem-auth 401 em corpus/export/compare/PATCH reference
- Auditoria adversarial 0 crit / 0 high; UAT humana **approved** — milestone v1.1 pronto para encerrar

## Task Commits

Each task was committed atomically:

1. **task 1: gates + prova beta do slice vertical** - `d72b6ab` (fix)
2. **task 2: checkpoint human-verify (blocking)** - approved pelo humano (UAT passes), sem commit de codigo

## Files Created/Modified

- `apps/core-api/src/lib/corpus.ts` - `parseDocType` passa a aceitar `professionalMaster` (antes derrubava para null)
- `apps/lab/app/project/[id]/corpus.tsx` - provado na beta (sem alteracao neste plano)
- `apps/lab/app/project/[id]/compare.tsx` - provado na beta (sem alteracao neste plano)

## Decisions Made

- parseDocType preserva `professionalMaster` para honrar o enum DocType de contracts e a marcacao BibTeX do 09-01 (ver Deviations).
- `pnpm audit` com 2 high aceito como toolchain Expo dev-only pré-existente (image-size via @expo/cli, esbuild, uuid@7 via xcode — mesmo aceite desde 06-02, sem patch upstream; runtime de producao nao afetado).
- UAT humana approved encerra o gate; re-testes UAT paralelos (06/07/08) seguem em fila propria sem bloquear o milestone.

## Gates literais (revalidados na finalizacao, 2026-09-13 ~12:27-12:30 hora local)

```
> @uhhu/lab@0.1.0 typecheck — tsc --noEmit -p tsconfig.json
EXIT: 0

> @uhhu/lab lint — 1 problem (0 errors, 1 warning: Unused eslint-disable directive)
EXIT: 0

vitest run src/corpus src/export src/compare — Test Files 3 passed (3), Tests 21 passed (21)
vitest run (lab cheio) — Test Files 15 passed (15), Tests 121 passed (121)
vitest run tests/smoke/dedup-exports.test.ts — Test Files 1 passed (1), Tests 28 passed (28)

grep -rn "as any\|: any\|@ts-ignore" apps/lab/src/corpus apps/lab/src/export apps/lab/src/compare apps/lab/app/project/ | wc -l  → 0
grep -rn "expo-sharing\|expo-file-system" apps/lab/ | wc -l  → 0
grep -rin "menos.*ru" apps/lab/app/project/[id]/compare.tsx apps/lab/src/compare/ | wc -l  → 0

beta LIVE — GET /health :3009 → 200; GET / :8081 → 200
pnpm audit — 7 vulns (5 moderate + 2 high, todas toolchain Expo dev-only, ver Decisions)
```

## Prova beta — Projeto Corpus 90 (evidencia em /tmp/opencode/09-06-evidence/)

- Projeto `79c87cc7-cab6-4932-a0cb-82cb76507eb7` ("Projeto Corpus 90"), 1 grupo elegivel vivo:
  `Educação inclusiva e tecnologia assistiva`, Maria Silva, 2021, `professionalMaster`, bdtd.
- Corpus (`corpus90b.json`): `docType: "professionalMaster"` preservado de ponta a ponta (prova do fix).
- 3 attachments com headers literais:
  - `content-disposition: attachment; filename="corpus-projeto-corpus-90-2026-09-13.csv"` + `content-type: text/csv; charset=utf-8`
  - `content-disposition: attachment; filename="corpus-projeto-corpus-90-2026-09-13.bib"` + `content-type: application/x-bibtex; charset=utf-8`
  - `content-disposition: attachment; filename="corpus-projeto-corpus-90-2026-09-13.json"` + `content-type: application/json; charset=utf-8`
- BibTeX do MP (`09-06-corpus.bib`):
  ```bibtex
  @mastersthesis{silva2021bdtd,
    title={Educação inclusiva e tecnologia assistiva},
    author={Maria Silva},
    year={2021},
    note={decision:eligible},
    type={Mestrado profissional}
  }
  ```
- CSV com `docType=professionalMaster`; JSON com `provenance` (projeto + 2 buscas + member).
- Compare (`09-06-compare.json`, 2 buscas `be608e98…` × `3f8507af…`): 4 blocos presentes —
  `totals`, `yearHistogram`, `bySource`, `pairwiseOverlap`.

## Matriz IDOR 4x4 (16/16, executada na beta durante a task 1)

| Superficie | Dono | Estranho | Adulterado | Sem auth |
|---|---|---|---|---|
| GET corpus | 200 | 404 | 404 | 401 |
| GET export (csv/bibtex/json) | 200 | 404 | 404 | 401 |
| GET compare | 200 | 404 | 404 | 401 |
| PATCH referenceSearchId | 200 | 404 | 404 | 401 |

Padrao: owner do ator no servidor em todas as superficies; IDs fora do escopo viram 404 (sem oracle); sem cookie/PAT vira 401. 16/16 conforme T-09-06-01.

## Auditoria adversarial (AGENTS.md, por arquivo)

- **apps/core-api/src/lib/corpus.ts (`parseDocType`):** allowlist por igualdade estrita contra literais do enum DocType; entrada é valor server-side (linha do banco), nunca cru do request; sem query/SQL, sem log, sem segredo; mudanca só amplia um ramo `===` existente. Sem IDOR (funcao pura de parse, authZ intacta nas rotas).
- **apps/core-api/src/lib/searches.ts (`parseSearchFilters` + `parseDocType`):** mesmo padrao — filtro `docTypes` aceita o terceiro literal do enum; `unknown` + narrowing preservado; sem `eval`/`Math.random`/construcao dinamica; sem reflexo em HTML/Markdown (XSS n/a); rate limit/sessao intocados.
- **Superficies beta (corpus/export/compare/reference):** sem confiança no navegador (owner sempre do ator); sem segredo em bundle (gates `any 0`, sem expo-sharing/file-system); logs só com requestId; CORS allowlist exata inalterada.
- Achados: **0 crit / 0 high.** Gitleaks/SAST sem binario local — cobertos pelo CI (mesmo registro dos planos 09-01..09-05).

## Threat Flags

None — nenhuma superficie nova; fix e provas dentro do threat model do plano (T-09-06-01 IDOR mitigado 16/16, T-09-06-02 segredos/logs mitigado, audit toolchain aceito como pré-existente).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] parseDocType derrubava professionalMaster para null**
- **Found during:** task 1 (gates + prova beta do slice vertical)
- **Issue:** `parseDocType` em `corpus.ts` e `searches.ts` só aceitava `masterThesis|doctoralThesis`, anulando o terceiro valor MP (08-09) e a marcacao `type={Mestrado profissional}` do 09-01 no corpus/export.
- **Fix:** allowlist estrita passa a incluir `professionalMaster` nos 3 pontos (corpus parseDocType + searches parseSearchFilters + searches parseDocType), espelhando o enum DocType de contracts.
- **Files modified:** apps/core-api/src/lib/corpus.ts, apps/core-api/src/lib/searches.ts
- **Verification:** corpus beta com `docType: professionalMaster` + BibTeX com `type={Mestrado profissional}`; sem regressao
- **Committed in:** d72b6ab (task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Correcao necessaria para corretude fim-a-fim do MP; sem scope creep.

## Issues Encountered

None alem do desvio acima (resolvido inline na task 1).

## User Setup Required

None - no external service configuration required.

## Checkpoint humano

- **Tipo:** human-verify (blocking) — corpus/export/compare + auditoria.
- **Resposta:** **approved** — "UAT passes, finalize SUMMARY + STATE/ROADMAP updates."
- **Evidencia de UAT:** beta LIVE (API :3009, web :8081, Projeto Corpus 90) + arquivos em /tmp/opencode/09-06-evidence/.

## Next Phase Readiness

- Phase 9 completa 6/6; milestone v1.1 (fases 6-9) pronto para encerrar via transicao de fase/milestone.
- Fila paralela intacta: re-testes UAT 06/07/08 + carry-over v1.0 (adendo §10, bin `uhhu`, info I-01–I-05, re-teste CAPES) — fora do caminho critico.
- Divida conhecida deste plano: Gitleaks/SAST locais sem binario (CI cobre); audit toolchain Expo com 2 high dev-only aceitos.

---
*Phase: 09-corpus-exportacao-comparacao*
*Completed: 2026-09-13*

## Self-Check: PASSED (2/2 files FOUND, 1/1 commits FOUND)
