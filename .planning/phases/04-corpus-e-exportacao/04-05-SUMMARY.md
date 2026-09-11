---
phase: 04-corpus-e-exportacao
plan: 05
subsystem: api
tags: [rest, curl, dedup, corpus, export, idor, vufind, human-verify]

# Dependency graph
requires:
  - phase: 04-corpus-e-exportacao
    provides: [04-01 dedup/exports puros, 04-02 migration 0003 + schema, 04-03 lib corpus, 04-04 rotas + export + 20 its]
  - phase: 03-buscas-e-adapters
    provides: [runs temporais BDTD/CAPES, LAB-06 results+ficha]
provides:
  - curl-corpus.sh ALL PASS vivo (dedup→decisao→corpus→compare→3 exports + IDOR + LAB-06)
  - mapper BDTD real VuFind (primary-map, formats[], urls[]) + fixture snapshot vivo
  - suite 10 arquivos / 90 testes verde + typecheck raiz + 6 workspaces
  - checkpoint humano "approved" com busca viva BDTD 7120 resultados
affects: [05-prova-headless, 05-02 rotas via execute(), auditoria adversarial]

# Tech tracking
tech-stack:
  added: []
  patterns: [fixture snapshot vivo da fonte, wipe FK-safe total em todo teste de integracao, decisao ano-null documentada no codigo]

key-files:
  created: [scripts/curl-corpus.sh]
  modified: [packages/integrations/src/bdtd.ts, apps/core-api/src/lib/dedup.ts, apps/core-api/src/lib/corpus.ts, package.json, scripts/curl-corpus.sh, tests/integration/fixtures/bdtd-search.json, tests/integration/lab-sources-contract.test.ts, tests/integration/lab-search-runs.test.ts, tests/integration/auth.test.ts, tests/integration/projects.test.ts, tests/integration/idor-matrix.test.ts]

key-decisions:
  - "BDTD/search nunca retorna ano: year=null por desenho, fuzzy bloqueado com ano null, exact por titulo+autores, compare sinaliza 'desconhecido'; enrich so on-demand, nunca no run"
  - "ADAPTER_VERSION bdtd/1.0-fase3 -> bdtd/1.1-fase4 (mudanca semantica do mapper, proveniencia honesta)"
  - "Root linka @uhhu/contracts via workspace (mesmo padrao do @uhhu/db) em vez de paths hack"
  - "curl-corpus.sh exige banco vazio para bootstrap 201 (pre-condicao documentada no header)"

patterns-established:
  - "Regressao de shape real: fixture = snapshot vivo da API + teste que falharia no mapper antigo"
  - "Stale server check: EADDRINUSE em porta de prova = matar arvore da porta antes de concluir falso-positivo"

requirements-completed: [LAB-06, LAB-07, LAB-08, LAB-09, LAB-10, LAB-11]

# Metrics
duration: ~150min (executor 04-01-04-05t1 + checkpoint/fixes nesta sessao)
completed: 2026-09-11
---

# Phase 4 Plan 5: Prova curl + checkpoint humano Summary

**Fluxo corpus ponta a ponta provado vivo via REST (run BDTD real → grupo pending → confirm → eligible → corpus → compare 4 blocos → CSV/BibTeX/JSON attachment + IDOR 404/401), com mapper BDTD corrigido para o shape real VuFind e suite 90/90 verde antes do "approved"**

## Performance

- **Duration:** ~150min (11 tasks 04-01–04-04 + curl 04-05t1 pelo executor; checkpoint + 3 fixes + revalidacao nesta sessao)
- **Started:** 2026-09-11T05:15:00Z
- **Completed:** 2026-09-11T12:25:00Z
- **Tasks:** 2 (task 1 auto pelo executor, task 2 checkpoint humano + correcoes)
- **Files modified:** 12

## Accomplishments

- `scripts/curl-corpus.sh` ALL PASS vivo: run 201 sync BDTD/CAPES → groups pending → confirm → decision eligible → corpus reflete na hora → compare 4 blocos sem `items` → 3 exports attachment + selection → 5 provas IDOR (estranho 404×3, fantasma 404, sem-cookie 401) + regressao LAB-06 (results + ficha com rawMetadata)
- Checkpoint humano "approved" (Hermes/Paulo): migrate OK, `pnpm test` 89/89 entao, curl ALL PASS, busca viva BDTD 7120 resultados run succeeded
- 3 issues do checkpoint corrigidas e re-provadas: mapper BDTD shape real (autores 0/20→5/5, docType 0/20→5/5 ao vivo), decisao ano-null explicita, `pnpm typecheck` raiz verde
- Suite final **10 arquivos / 90 testes** (+1 regressao shape real), typecheck raiz + 6 workspaces verde, eslint limpo

## Task Commits

1. **task 1: curl-corpus.sh prova end-to-end + IDOR + regressao LAB-06** - `565daf7` (test, pelo executor)
2. **task 2: checkpoint humano + 3 correcoes + revalidacao** - working tree (nao commitado; para revisar antes do commit — ver Files Created/Modified)

## Files Created/Modified

- `scripts/curl-corpus.sh` - criado em `565daf7`; header com pre-condicao banco-vazio (fix task 2)
- `packages/integrations/src/bdtd.ts` - authorsFrom mapa VuFind primary/secondary/corporate, canonicalDocType itera `formats[]`, originUrl de `urls[]`, `ADAPTER_VERSION bdtd/1.1-fase4`
- `tests/integration/fixtures/bdtd-search.json` - snapshot vivo (UECE/IFES reais, resultCount 7120) + registro minimo edge
- `tests/integration/lab-sources-contract.test.ts` - expects reais + teste regressao `04-05/1` + versao `1.1-fase4`
- `tests/integration/lab-search-runs.test.ts` - expects IDs reais + extra payload shape real + wipe FK-safe total
- `apps/core-api/src/lib/dedup.ts`, `apps/core-api/src/lib/corpus.ts` - decisao ano-null documentada (fuzzy blocking + bucket 'desconhecido')
- `package.json` + `pnpm-lock.yaml` - `@uhhu/contracts: workspace:*` no root (fix TS2307)
- `tests/integration/auth.test.ts`, `projects.test.ts`, `idor-matrix.test.ts` - wipe FK-safe Phase 4 (fix FK `lab_search_runs_created_by_users_id_fk` em banco compartilhado)

## Decisions Made

- Enrich leve de ano em paralelo ao run **rejeitado**: violaria 03-lab-spec-v1 §6 (nunca 1 request por resultado; batch so para elegiveis) e a cortesia batch ≤10 + wait. Ano BDTD so via ficha on-demand futura.
- Exact com year=null mantido (titulo+autores identicos agrupam; transparente + divergivel) em vez de nunca agrupar nulls: evita perder todo dedup BDTD↔BDTD; risco residual (mesmo titulo/autor, anos distintos) fica visivel e corrigivel por divergence/pin.
- Bump de versao do adapter em vez de fix silencioso: runs congelam `adapter_versions`; provar que o mapper mudou.
- Nao commitar os fixes nesta sessao: mudancas de contrato de teste + fixture merecem revisao humana no diff antes do push (branch protection exige 6 checks de todo modo).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mapper BDTD lia shape inventado (checkpoint 04-05/1)**
- **Found during:** task 2 (busca viva humana: 20/20 authors=[] docType=null)
- **Issue:** `authorsFrom` nao extraia chaves do mapa `primary`; `docType` lia `format` singular (real: `formats[]`); `originUrl` ignorava `urls[]`; fixture inventada (`authors` array, `format` singular, `publishDate`) escondia o bug.
- **Fix:** Parser do mapa VuFind + `formats[]` + `urls[]`; fixture = snapshot vivo; regressao que falharia no mapper antigo.
- **Files modified:** packages/integrations/src/bdtd.ts, tests/integration/fixtures/bdtd-search.json, lab-sources-contract.test.ts, lab-search-runs.test.ts
- **Verification:** 16/16 contract + prova viva 5/5 autores e tipos preenchidos
- **Committed in:** working tree (pendente)

**2. [Rule 2 - Missing] Sem decisao explicita para ano BDTD null (checkpoint 04-05/2)**
- **Found during:** task 2 (canonicalKey so-titulo: risco de agrupar/omitir errado BDTD∩CAPES + compare ano vazio)
- **Issue:** Comportamento existia (fuzzy blocking, bucket 'desconhecido') mas nao estava decidido/documentado.
- **Fix:** Decisao registrada em dedup.ts/corpus.ts/bdtd.ts (aceitar null, bloquear fuzzy, sinalizar, enrich on-demand futuro).
- **Files modified:** apps/core-api/src/lib/dedup.ts, apps/core-api/src/lib/corpus.ts
- **Verification:** suite verde + compare com bucket 'desconhecido' exercitado
- **Committed in:** working tree (pendente)

**3. [Rule 1 - Bug] `pnpm typecheck` raiz vermelho = job gates do CI vermelho (checkpoint 04-05/3)**
- **Found during:** task 2 (`TS2307 @uhhu/contracts` em tests/smoke/dedup-exports.test.ts; vitest mascarava porque import type e apagado)
- **Issue:** Root nao linkava `@uhhu/contracts` (so `@uhhu/db`).
- **Fix:** `workspace:*` no root devDependencies + `pnpm install`.
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `pnpm typecheck` raiz + 6 workspaces verde
- **Committed in:** working tree (pendente)

**4. [Rule 1 - Bug] Wipe pre-Phase-4 quebrava suite em banco compartilhado**
- **Found during:** revalidacao (`delete from users` violava `lab_search_runs_created_by_users_id_fk`)
- **Issue:** auth/projects/idor-matrix/lab-search-runs nao limpavam tabelas `lab_*` da Phase 4.
- **Fix:** Wipe FK-safe total (ordem lab-corpus.test.ts) nos 4 arquivos.
- **Files modified:** tests/integration/auth.test.ts, projects.test.ts, idor-matrix.test.ts, lab-search-runs.test.ts
- **Verification:** suite 90/90 apos TRUNCATE + run completo
- **Committed in:** working tree (pendente)

**5. [Rule 4 - Stale] Servidor :3001 obsoleto servia prova falsa**
- **Found during:** revalidacao (resultados vivos com authors=[] apos o fix)
- **Issue:** Instancia :3001 do executor (08:24, codigo pre-fix) ocupava a porta; meu start falhava EADDRINUSE silencioso e o curl batia no servidor velho.
- **Fix:** Morta somente a arvore :3001 (preservado :3000 PID 126777); fresh server + TRUNCATE + curl re-executado → autores 5/5.
- **Files modified:** nenhum (operacional)
- **Verification:** prova viva pos-fix com tipos/autores preenchidos

---

**Total deviations:** 5 auto-fixed (3 bugs do checkpoint, 1 bug de suite, 1 operacional)
**Impact on plan:** Sem scope creep; todos os fixes dentro do goal da fase (prova honesta do corpus). Nenhum fix muda contrato publico alem do bump de versao do adapter (proveniêcia).

## Issues Encountered

- CAPES seguiu indisponivel/bloqueada no periodo (run `partial` com BDTD preservada — D-37 funcionou como desenhado; re-teste CAPES segue carry-over como na Phase 3).
- Rate-limit/BDTD challenge em rajada de buscas manuais (retry apos espera resolveu; cortesia mantida, sem contorno).
- Script curl nao e resiliente a banco populado pela suite (bootstrap 401 + registro 400 → login 401): mitigado via pre-condicao documentada + TRUNCATE com role migrate; robustez total do script fica para Phase 5 se necessario.

## Threat Flags

Auditoria adversarial completa arquivo-a-arquivo (dedup/exports/corpus/lab/rateLimit/schema) + scanners era criterio do checkpoint: cobertura automatizada executada — `expectClean` (regex negativa set-cookie|passwordHash|token) em todos os corpos de integracao, CSV-injection guard + filename traversal + BibTeX balanceado em its, `pnpm audit` (ver CI), Gitleaks tree+historico (ver CI). Auditoria adversarial assistida por IA arquivo-a-arquivo formal antes de patch automatico segue devida na Phase 5 (05-05) para as superficies novas (PAT/CLI/MCP); nenhum segredo em codigo/logs/respostas introduzido nestes fixes (somente nomes de autores publicos em fixture).

## Self-Check: PASSED (curl ALL PASS pos-fix + suite 90/90 + typecheck 7/7 + eslint limpo + busca viva 5/5 autores/tipos)

## Next Phase Readiness

- Phase 4 FECHADA: LAB-06–LAB-11 completos; Phase 5 (prova headless) ja planejada (5 plans/4 waves) e depende exatamente destes handlers — pronta para `/gsd-execute-phase 5`.
- Pendente (fora do gate): commit dos fixes da task 2 + push (CI de 6 checks vai exercer typecheck raiz que o checkpoint pegou).
- :3000 preservado; :3001 desligado apos a prova; DB DEV com dados da prova curl (suite faz wipe FK-safe, sem interferencia).

---
*Phase: 04-corpus-e-exportacao*
*Completed: 2026-09-11*
