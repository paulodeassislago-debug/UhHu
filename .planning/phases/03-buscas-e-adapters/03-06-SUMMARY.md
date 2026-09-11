---
phase: 03-buscas-e-adapters
plan: "06"
subsystem: testing
tags: [vitest, integration, postgres, idor, curl, security-audit, bdtd, capes, live-verification]

# Dependency graph
requires:
  - phase: 03-buscas-e-adapters plan 05
    provides: [superfície REST lab/jobs/health + throttle + boot único com semântica 201/202/200]
  - phase: 03-buscas-e-adapters plan 04
    provides: [lib searches owner-first, motor executeSearchRun sync/async/partial/diff/idempotência, erros tipados]
  - phase: 03-buscas-e-adapters plan 03
    provides: [adapters BDTD/CAPES + pós-filtro + contrato com fixtures (15 its, prova de corretude CAPES)]
  - phase: 02-plataforma-e-isolamento plan 04
    provides: [molde de prova: harness Fastify em memória, matriz IDOR dono/estranho/adulterado, script curl com assert_code]
provides:
  - Suite de integração lab contra PG real (busca→run→results→proveniência, partial, diff, idempotência, cancel, IDOR triplo)
  - scripts/curl-lab.sh executável com ALL PASS contra PG DEV
  - Auditoria adversarial da fase (0 crit/0 high) + gates verdes
  - Aprovação humana da busca viva BDTD (CAPES bloqueada no lado da fonte — re-teste no próximo ciclo)
affects: [Phase 4 corpus/exportação (runs/results/health provados como base), Phase 5 prova headless (mesmo molde de prova)]

# Tech tracking
tech-stack:
  added: []
  patterns: [prova no padrão 02-04 (teste + curl + auditoria + humano), adapters com fetchFn fake das fixtures 03-03 no teste (determinístico, sem rede), skip gracioso sem PG (nunca falha offline), checkpoint humano como única prova que exige rede externa]

key-files:
  created: [tests/integration/lab-search-runs.test.ts, scripts/curl-lab.sh]
  modified: [tests/integration/lab-search-runs.test.ts]

key-decisions:
  - "Checkpoint aprovado como 'approved with capes blocked': CAPES falhou rápido (61ms, sem challenge) por bloqueio no lado da fonte — não é bug de código; degradação graciosa para partial funcionou exatamente como projetado (D-37)"
  - "Contrato com fixtures (03-03, 15 its) permanece a prova de corretude da CAPES; re-teste ao vivo entra no próximo ciclo"
  - "Correções da auditoria restritas a crítico/alto (nenhum encontrado); médio/baixo registrados como advisory"

patterns-established:
  - "Teste de integração lab: harness Fastify em memória (auth+projects+lab) com cookie uhhu_session real, 2 usuários, asserts de x-request-id + regex negativa de vazamento (stack|passwordHash|token|set-cookie|cookie) em todos os its"
  - "curl-lab.sh: bootstrap→2 usuários→projeto→search→run→poll job→results→rerun(newCount)→cancel→health→4 provas 404 de estranho, cada passo com assert_code, final ALL PASS"

requirements-completed: [LAB-02, LAB-03, LAB-04, LAB-05, LAB-12, SRC-01, SRC-02, SRC-03, SRC-04, SRC-05, CORE-03, CORE-04]

# Metrics
duration: ~40min (tasks 1-2) + checkpoint humano
completed: 2026-09-11
---

# Phase 3 Plan 6: Prova da fase (integração PG + curl + auditoria + busca viva) Summary

**Fase 3 provada: integração lab contra PG real (9/9 its) + suite completa verde (42/42) + curl-lab.sh ALL PASS + auditoria 0 crit/0 high + checkpoint humano "approved with capes blocked" (BDTD viva com 893 resultados, CAPES bloqueada na fonte com partial íntegro)**

## Performance

- **Duration:** ~40 min (tasks autônomas 1-2) + janela de checkpoint humano
- **Started:** 2026-09-11 (tasks autônomas)
- **Completed:** 2026-09-11 (aprovação humana ~04:03Z)
- **Tasks:** 3 (2 auto + 1 checkpoint humano)
- **Files modified:** 2 (1 criado, 1 modificado)

## Accomplishments

- `tests/integration/lab-search-runs.test.ts` (criado, ~1100 linhas, 9/9 its verdes contra PG real): LAB-02 (search declarativa sem executar + snapshot temporal D-33), LAB-03+SRC-05 (run succeeded com coverage `{bdtd:2, capes:2}` + rerun com `newCount` D-35), LAB-05+D-37 (CAPES falha → `partial` com BDTD preservada; ambas falham → `failed`), LAB-04 (cadeia Result→Run→Search→Project + rawMetadata + source/sourceId), D-36 (results ordenados fonte+rank com cursor), CORE-03/D-39 (idempotência `Idempotent-Replayed`, 422 em body diferente, 429 no 11º run), CORE-04/D-29/D-30 (jobs espelham run, cancel com parciais, `oasisbr` → 400 SOURCE_DISABLED), LAB-12 (sources com oasisbr desabilitada, health ok), IDOR triplo (estranho→404, adulterado→404, sem cookie→401, ownerId/projectId do body ignorados)
- `scripts/curl-lab.sh` (criado, executável): bootstrap→2 usuários→projeto→search→run→poll→results→rerun→cancel→health→4 provas 404 de estranho — **ALL PASS** contra boot local + PG DEV
- Auditoria adversarial (roteiro §4 do security-baseline, só leitura primeiro): **0 crítico / 0 alto**; controles verificados (ownerId da sessão, 404 sem revelar existência, envelope PT-BR, sem segredos em logs/respostas)
- Checkpoint humano: **approved with capes blocked** — busca viva `"ensino de química"` reproduzida independentemente pelo orquestrador contra boot + PG DEV

## task Commits

Each task was committed atomically:

1. **task 1: integração lab contra PG real + curl-lab.sh** - `af41963` (feat)
2. **task 2: auditoria adversarial + gates da fase** - `10059fd` (fix: lint unused-var + prettier)
3. **task 3: checkpoint humano busca REAL BDTD+CAPES ao vivo** - aprovação registrada neste SUMMARY (sem commit de código — gate humano, evidência abaixo)

**Plan metadata:** (este commit docs, abaixo)

## Human Checkpoint Approval (task 3)

- **Verdict:** `approved with capes blocked` (resposta do orquestrador, 2026-09-11 ~04:03Z)
- **Reprodução independente:** `bash scripts/curl-lab.sh` → **ALL PASS** contra boot + PG DEV vivos
- **Evidência ao vivo observada:**
  - Run status: `partial`
  - `metrics.perSource`: `bdtd: ok (total 893, returned 20, durationMs 226)` / `capes: failed (total 0, returned 0, durationMs 61)`
  - `newCount`: 20
  - `metrics.coverage`: `{bdtd: 20, capes: 0}`
  - Erro: `SOURCE_UNAVAILABLE` — "Busca parcial: bdtd ok (20 resultados); capes indisponível. Resultados válidos foram preservados."
  - Health: `bdtd ok 2/2` / `capes offline 0/2`
  - `GET .../results` lista com `source/sourceId/rawMetadata`; registro BDTD verificado ao vivo (ex.: `UEL_38802803a4db862b574d4ec10b52885e` — "Utilização de aplicativos no ensino de química")
- **Interpretação (D-37):** CAPES falhou rápido (61ms, sem challenge) — bloqueio no lado da fonte, NÃO bug de código; a degradação graciosa para `partial` funcionou exatamente como projetado, preservando os 20 resultados válidos da BDTD
- **Prova de corretude CAPES:** o contrato com fixtures (03-03, 15 its) permanece válido; **re-teste ao vivo da CAPES entra no próximo ciclo**

## Autonomous Evidence (tasks 1-2)

- Integração lab: **9/9 its verdes** (`pnpm vitest run --project integration tests/integration/lab-search-runs.test.ts`)
- Suite completa: **42/42 verdes** (`pnpm test:integration`), zero skip com PG DEV no ar
- curl: **ALL PASS** (`bash scripts/curl-lab.sh` contra boot local + PG DEV)
- Gates: typecheck + lint + format + `pnpm audit --audit-level high` verdes; Gitleaks tree limpo; `any` proibido inclusive nos testes novos (verificado no lint)

## Files Created/Modified

- `tests/integration/lab-search-runs.test.ts` - integração lab contra PG real com adapters fake (fixtures 03-03), 9 its + IDOR triplo (criado na task 1, fix de lint/prettier na task 2)
- `scripts/curl-lab.sh` - prova manual executável do fluxo lab com assert_code por passo + ALL PASS (criado na task 1)

## Decisions Made

- Checkpoint aprovado como "approved with capes blocked": registrar o bloqueio CAPES como fato de fonte (61ms, sem challenge), não como defeito — o comportamento observado (partial + SOURCE_UNAVAILABLE + resultados preservados) é o comportamento especificado em D-37
- Fixtures 03-03 como prova de corretude CAPES até o re-teste ao vivo (próximo ciclo), sem re-tentativas em rajada contra a fonte bloqueada (cortesia: 1 busca, sem laço — T-03-06-02)
- Auditoria sem crítico/alto → nenhuma correção de código além do fix de lint; médio/baixo como advisory neste SUMMARY

## Deviations from Plan

None - plan executed exactly as written (tasks 1-2 commits `af41963` + `10059fd`; task 3 gate humano aprovado com CAPES bloqueada, cenário previsto no próprio `how-to-verify` passo 5 do checkpoint).

## Threat Model Compliance (T-03-06-01/02/03)

- T-03-06-01 (disclosure em logs): sem connection string, sem cookie, sem corpos de fonte nos asserts — verificado na auditoria
- T-03-06-02 (DoS no checkpoint): 1 busca de teste por fonte, sem laço nem rajada — honrado (nenhuma re-tentativa contra CAPES bloqueada)
- T-03-06-03 (repúdio): ALL PASS do curl + 9/9 + 42/42 + approval humano registrados aqui

## Issues Encountered

- **CAPES bloqueada ao vivo (fonte, não código):** falha em 61ms sem challenge, health `offline 0/2`. Resolvido por design: `partial` + `SOURCE_UNAVAILABLE` PT-BR + 20 resultados BDTD preservados. Re-teste ao vivo entra no próximo ciclo (não bloqueia o fechamento da fase — cenário previsto no plano).
- Nenhum outro issue: gates verdes de primeira após o fix de lint da task 2.

## Known Stubs

None - nenhum placeholder, mock pendente ou dado fictício nos arquivos entregues (os fakes de adapter vivem só dentro do teste, por exigência explícita do plano: nunca rede real no teste).

## User Setup Required

None - no external service configuration required (PG DEV e boot local já operacionais; nenhuma credencial nova).

## Next Phase Readiness

- **Phase 3 COMPLETA (6/6):** os 4 critérios do ROADMAP atendidos — busca real por fonte (humano: BDTD viva + CAPES por fixtures), runs temporais com diff (teste), partial+jobs+cancel (teste + vivo), proveniência+health (teste + vivo)
- Pronto para Phase 4 (corpus/exportação) sobre runs/results/health provados
- Único carry-over: **re-teste ao vivo da CAPES** no próximo ciclo (fonte estava bloqueada em 2026-09-11)

## Self-Check: PASSED

- FOUND: tests/integration/lab-search-runs.test.ts (1104 linhas)
- FOUND: scripts/curl-lab.sh (executável)
- FOUND: af41963 (task 1), FOUND: 10059fd (task 2)

---
*Phase: 03-buscas-e-adapters*
*Completed: 2026-09-11*
