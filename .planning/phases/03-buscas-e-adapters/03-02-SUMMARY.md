---
phase: 03-buscas-e-adapters
plan: "02"
subsystem: integrations
tags: [source-client, registry, health, bdtd, capes, drizzle, postgres, ssrf, circuit-breaker]

# Dependency graph
requires:
  - phase: 03-buscas-e-adapters plan 01
    provides: [SourceHealthDTO + LabSource em packages/contracts, tabela lab_source_events + migration 0002 viva em PG DEV]
provides:
  - Pacote `@uhhu/integrations` com SourceClient compartilhado (jar, mutex, batch<=10+2s, breaker, timeout 15s, UA, allowlist SSRF)
  - Registry bdtd+capes habilitadas / oasisbr desabilitada + SourceDisabledError
  - computeSourceHealth/recordSourceEvent com thresholds fixos (0 / <0.5 / >=0.5), sem segredos
affects: [03-03 adapters, 03-04 lib execução, 03-05 rotas sources/health]

# Tech tracking
tech-stack:
  added: []
  patterns: [SourceClient unico por fonte construido pelo registry, fetchFn injetavel para testes sem rede, health por janela 50 eventos/1h]

key-files:
  created: [packages/integrations/src/types.ts, packages/integrations/src/sourceClient.ts, packages/integrations/src/registry.ts, packages/integrations/src/health.ts]
  modified: [packages/integrations/package.json, packages/integrations/tsconfig.json, packages/integrations/src/index.ts, pnpm-lock.yaml]

key-decisions:
  - "Dep workspace @uhhu/contracts no integrations (Rule 2): SourceHealthDTO tem definição única nos contracts; duplicar local violaria o AGENTS.md"
  - "Challenge conta como falha no breaker (5 consecutivos abrem 60s): fonte em bot-block ativo não deve ser martelada"
  - "Barrel sem health na task 1, com health na task 2: exportar antes de existir quebraria o gate typecheck da task 1"

patterns-established:
  - "Resultado de fetch carrega durationMs para logs seguros {source, status, durationMs}; este pacote nunca loga jar/corpo"
  - "Challenge renova o jar (limpa) e retorna challenged:true; o retry único é dever do chamador (adapter)"

requirements-completed: [SRC-03, SRC-04, LAB-12]

# Metrics
duration: ~4min
completed: 2026-09-11
---

# Phase 3 Plan 2: SourceClient + registry + health Summary

**SourceClient compartilhado por fonte (jar/mutex/batch≤10+2s/breaker/timeout 15s/UA/allowlist SSRF) + registry bdtd+capes/oasisbr-off + health ok|degraded|offline por janela 50ev/1h, tudo provado vivo contra PG DEV**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-09-11T02:55:48Z
- **Completed:** 2026-09-11T02:59:03Z
- **Tasks:** 2
- **Files modified:** 8 (6 pacote + pnpm-lock.yaml + SUMMARY)

## Accomplishments

- `src/sourceClient.ts` (242 linhas): `UH_HU_UA`, allowlist `bdtd.ibict.br`+`catalogodeteses.capes.gov.br` com `SourceHostBlockedError`, mutex por fonte, batch≤10+wait 2s, timeout 15s via `AbortSignal.any`, detecção de challenge (`OasisbrVerify` ou HTML onde se esperava JSON) com limpeza do jar, breaker 5 falhas→60s (`SourceCircuitOpenError`), zero `rejectUnauthorized`
- `src/registry.ts`: `SOURCE_REGISTRY` bdtd+capes `enabled:true`, oasisbr `enabled:false` + `SourceDisabledError`; `getAdapter` entrega client+meta (instância única por fonte); `listSources` para `GET /lab/sources`
- `src/types.ts`: `SourceName`, `SourcePage`, `NormalizedItem`, `SourceAdapter`, `SearchDef`, `SourceClientContext` com `fetchFn` injetável
- `src/health.ts`: `computeSourceHealth` (janela últimos 50 OU última 1h; 0 ev→ok; failureRate 0→ok, <0.5→degraded, ≥0.5→offline; challenge conta em challenges E failed) + `recordSourceEvent`; retorno só counts+status+checkedAt
- Provas reais: SourceClient exercitado com fetch mockado (SSRF bloqueado sem chamar fetch, UA+jar, challenge limpa jar, breaker abre no 6º erro, abort propagado) — ALL PASS; health exercitado contra PG DEV real (ok→degraded a 0.2→offline a 0.5, evento >1h fora da janela, tabela limpa ao final) — ALL PASS

## task Commits

Each task was committed atomically:

1. **task 1: pacote + SourceClient compartilhado + registry** - `925f4d8` (feat)
2. **task 2: health ok|degraded|offline a partir de eventos** - `16b4613` (feat)

**Plan metadata:** `b0d2799` (docs: complete plan)

## Files Created/Modified

- `packages/integrations/package.json` - `@uhhu/integrations` (deps zod + contracts/db workspace + drizzle-orm; devDep tsx) (criado)
- `packages/integrations/tsconfig.json` - idêntico ao de `@uhhu/db` (criado)
- `packages/integrations/src/types.ts` - SourceName/SourcePage/NormalizedItem/SourceAdapter/SearchDef/SourceClientContext (criado)
- `packages/integrations/src/sourceClient.ts` - fetch corticado por fonte (criado, 242 linhas)
- `packages/integrations/src/registry.ts` - bdtd+capes on, oasisbr off (criado)
- `packages/integrations/src/health.ts` - computeSourceHealth + recordSourceEvent (criado)
- `packages/integrations/src/index.ts` - barrel types+sourceClient+registry+health, sem adapters (criado)
- `pnpm-lock.yaml` - link do novo pacote workspace (modificado)

## Decisions Made

- Dep `@uhhu/contracts: workspace:*` além do trio do plano (zod/db/drizzle-orm): `computeSourceHealth` retorna `SourceHealthDTO`, cuja definição única vive nos contracts — duplicar o tipo localmente violaria a regra de tipos compartilhados do AGENTS.md.
- Challenge conta como falha consecutiva no breaker: 1 challenge isolado é fluxo normal (renova jar + 1 retry do adapter resolve); 5 seguidos indicam bot-block ativo e o circuito protege a fonte por 60s.
- `recordSourceEvent` aceita `LabSource` (inclui oasisbr) como `computeSourceHealth`: health de fonte desabilitada computa (0 eventos→ok); o CHECK do banco restringe inserts a bdtd|capes, decisão de schema da 03-01 mantida.
- Nenhum log dentro do pacote: o resultado carrega `durationMs` para o chamador logar `{source, status, durationMs}` — jar/corpo nunca tocam stdout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Dependência `@uhhu/contracts` adicionada ao package.json**
- **Found during:** task 2 (health precisa retornar `SourceHealthDTO`)
- **Issue:** plano listava só zod + `@uhhu/db` + drizzle-orm; sem contracts, o DTO seria duplicado localmente (viola AGENTS.md: definição única compartilhada)
- **Fix:** `"@uhhu/contracts": "workspace:*"` em dependencies; `import type { LabSource, SourceHealthDTO, SourceHealthStatus }`
- **Files modified:** packages/integrations/package.json, packages/integrations/src/health.ts
- **Verification:** typecheck verde; `pnpm install` sem erro
- **Committed in:** 16b4613 (task 2 commit)

**2. [Rule 1 - Bug] `RequestInit.body` condicional sob `exactOptionalPropertyTypes`**
- **Found during:** task 1 (typecheck falhou: `string | undefined` não atribuível a `BodyInit`)
- **Issue:** `body: init.body` incondicional quebra o strict do monorepo
- **Fix:** constrói `RequestInit` sem body e só atribui quando `!== undefined`
- **Files modified:** packages/integrations/src/sourceClient.ts
- **Verification:** `pnpm --filter @uhhu/integrations run typecheck` verde
- **Committed in:** 925f4d8 (task 1 commit)

**3. [Rule 3 - Blocking/sequencing] Barrel em duas etapas (health só na task 2)**
- **Found during:** task 1 (index exportando `./health.js` inexistente quebraria o gate typecheck do commit da task 1)
- **Issue:** plano pedia barrel completo já na task 1, mas health.ts só nasce na task 2
- **Fix:** task 1 exporta types+sourceClient+registry; task 2 acrescenta health
- **Files modified:** packages/integrations/src/index.ts
- **Verification:** typecheck verde em ambos os commits
- **Committed in:** 925f4d8 + 16b4613

---

**Total deviations:** 3 auto-fixed (1 missing critical, 1 bug, 1 blocking/sequencing)
**Impact on plan:** Todos necessários para corretude/strict/gates verdes. Sem scope creep; nenhum arquivo do 03-03 tocado.

## Issues Encountered

- Meu script de health errou a aritmética (esperei offline com 2/6; challenge conta 1x em failed, não 2x): implementação estava certa per spec, corrigi o script e re-provei (offline a 4/8=0.5). Lixo zero: tabela `lab_source_events` verificada com 0 linhas ao final.
- Barrel puxa `@uhhu/db`→`@uhhu/config` (env parse no import): teste unitário do SourceClient importa os módulos diretos; barrel/rotas reais rodam com env — mesmo padrão de `@uhhu/db`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 03-03 (adapters) desbloqueado: `SourceAdapter`+`SourceClientContext`+`SourceClient`+`getAdapter` prontos; contrato de retry (1 retry com jar novo após `challenged:true`) e `SourceFetchInit.accept:'json'` definidos.
- 03-04 (executor) desbloqueado: `recordSourceEvent` pronto para cada tentativa; `computeSourceHealth` pronto para as rotas 03-05.
- Nenhum blocker. Sem conflito com 03-03 (toca só bdtd/capes/postFilter/adapters+tests; este plano deteve o barrel sem exportar adapters).

---
*Phase: 03-buscas-e-adapters*
*Completed: 2026-09-11*

## Self-Check: PASSED
- SUMMARY exists; commits 925f4d8 + 16b4613 exist; sourceClient.ts 242 linhas (>=100); rejectUnauthorized zero; health sem cookie/Authorization/DATABASE_URL; lab_source_events com 0 linhas residuais.
