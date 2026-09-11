---
phase: 03-buscas-e-adapters
plan: "03"
subsystem: integrations
tags: [bdtd, capes, vufind, adapters, post-filter, contract-tests, fixtures, zod]

# Dependency graph
requires:
  - phase: 03-buscas-e-adapters plan 01
    provides: [contratos lab (SearchFilters, DocType, RunMetrics), erros PT-BR SOURCE_*]
  - phase: 03-buscas-e-adapters plan 02
    provides: [SourceClient (jar/mutex/timeout/allowlist/challenge), registry (SourceDisabledError, oasisbr off), types (SearchDef/NormalizedItem/SourcePage)]
provides:
  - Adapters BDTD (VuFind) + CAPES (rest/busca) com search+enrich sob demanda
  - Pós-filtro Core redundante fonte+Core + descrição PT-BR
  - Contrato com fixtures (15 its, sem rede/PG) + sanitizeRaw de rawMetadata
affects: [03-04 lib execução (consome getSourceAdapter + postFilter), 03-05 rotas (RangeTooWideError→422, SourceDisabledError→400), 03-06 prova real]

# Tech tracking
tech-stack:
  added: []
  patterns: [adapters puros sobre SourceClient (sem fetch próprio), envelope-Zod + narrowing por campo, desafio→status (nunca throw), enrich parcial (nunca null total), fixtures como contrato congelado]
key-files:
  created: [packages/integrations/src/bdtd.ts, packages/integrations/src/capes.ts, packages/integrations/src/postFilter.ts, packages/integrations/src/adapters.ts, tests/integration/lab-sources-contract.test.ts, tests/integration/fixtures/bdtd-search.json, tests/integration/fixtures/capes-busca.json]
  modified: []
key-decisions:
  - "03-02 aterrissou commitado no meio da wave: zero duplicação — adapters importam types/sourceClient/registry reais (assunção paralela não foi necessária)"
  - "search* nunca lança por transporte/parse (failed/challenge como valor); só RangeTooWideError e termo vazio lançam (contrato de programação, antes da rede)"
  - "Ficha CAPES só em host público http(s) sem credencial (SSRF); BDTD/enrich seguro por construção (base constante + segmento encodado)"
  - "2 formatos no filtro BDTD = sem filtro de formato na fonte (AND impossível no VuFind); Core pós-filtra (D-32)"
  - "Ano unilateral na CAPES vira 1 filtro do ano informado; Core garante o intervalo (D-32)"
patterns-established:
  - "fetchInit local monta SourceFetchInit sem `undefined` explícito (exactOptionalPropertyTypes)"
  - "Teste de adapter = SourceClient real + fetchFn fake (Response/Headers nativos); fixtures no disco via process.cwd (tsconfig raiz tipa testes como CJS, sem import.meta)"
requirements-completed: [SRC-01, SRC-02, SRC-04, SRC-05]

# Metrics
duration: ~40min (estimativa — marco inicial não capturado)
completed: 2026-09-11
---

# Phase 3 Plan 3: Adapters BDTD/CAPES + pós-filtro + contrato Summary

**Busca traduzida nas duas fontes (VuFind lookfor+filter[] e rest/busca com Ano expandido), enrich sob demanda pronto para Phase 4, pós-filtro redundante e contrato de 15 its verde sem rede/PG**

## Performance

- **Duration:** ~40 min (estimativa)
- **Started:** ~2026-09-11T02:30Z (estimativa)
- **Completed:** 2026-09-11T03:08Z
- **Tasks:** 3
- **Files modified:** 7 (4 sources + 1 teste + 2 fixtures)

## Accomplishments

- `packages/integrations/src/bdtd.ts` (528 linhas): `ADAPTER_VERSION='bdtd/1.0-fase3'`; `searchBdtd` monta `lookfor` intacto + `type=AllFields` + `filter[]` de formato/ano + `page/limit` (clamp 5..50); envelope Zod `{resultCount, records[]}`; `enrichBdtd` na ficha `Record/<id>` (título/resumo/orientador/banca/programa/keywords via regex ancorada); `sanitizeRaw` recursivo com teto de profundidade (definição única — capes importa daqui)
- `packages/integrations/src/capes.ts` (560 linhas): `ADAPTER_VERSION='capes/1.0-fase3'`; `searchCapes` POST `rest/busca` com `termo` intacto, `Ano` expandido por ano (cap 30 → `RangeTooWideError` 422 antes da rede), `Grau Acadêmico` Mestrado/Doutorado, `Grande Área Conhecimento` (área), `Área Conhecimento` (programa), institution fora da fonte; sem-divulgação → `sourceUrl` null + flag; `enrichCapes` extrai `#resumo`/`#palavras`/`#download:link_download_arquivo` com validação SSRF da ficha
- `packages/integrations/src/postFilter.ts` (190 linhas): `postFilter` idempotente (ano null mantém; docType canônico incl. rótulos PT; institution/program/area substring sem acento) + `describePostFilter` PT-BR
- `packages/integrations/src/adapters.ts`: `getSourceAdapter('bdtd'|'capes')` → `{search, enrich, version}`; `oasisbr` lança o `SourceDisabledError` do registry; sem tocar `src/index.ts`
- Contrato: fixtures fiéis aos shapes de 06/09/2026 (BDTD `resultCount`+3 registros incl. 1 incompleto; CAPES `tesesDissertacoes`+3 incl. 1 sem-divulgação) e 15 its verdes SEM rede e SEM PG (fetchFn fake no SourceClient real)
- Gates: typecheck raiz+recursivo verde, eslint limpo, prettier limpo, `pnpm test` 35/35 (7 arquivos; PG pula gracioso offline), `rejectUnauthorized` zero e `any` zero no pacote

## task Commits

Each task was committed atomically:

1. **task 1: adapters BDTD e CAPES com enrich sob demanda** - `4fefac6` (feat)
2. **task 2: pós-filtro Core redundante fonte+Core** - `e2b1d92` (feat)
3. **task 3: fixtures + testes de contrato SRC-05 sem rede** - `72e7769` (test)
4. **fix pós-task 3: regex de keywords no plural** - `921a380` (fix)

## Files Created/Modified

- `packages/integrations/src/bdtd.ts` - search VuFind + enrich Record/ + sanitizeRaw (criado)
- `packages/integrations/src/capes.ts` - search rest/busca + enrich ficha + RangeTooWideError (criado)
- `packages/integrations/src/postFilter.ts` - pós-filtro + describe PT-BR (criado)
- `packages/integrations/src/adapters.ts` - getSourceAdapter bdtd/capes/oasisbr (criado)
- `tests/integration/lab-sources-contract.test.ts` - 15 its, 480 linhas (criado)
- `tests/integration/fixtures/bdtd-search.json` - VuFind com `resultCount` (criado)
- `tests/integration/fixtures/capes-busca.json` - rest/busca com `tesesDissertacoes` (criado)

## Decisions Made

- **Wave paralela convergiu sem shim:** o 03-02 commitou `types.ts/sourceClient.ts/registry.ts/package.json+zod` durante esta execução; os adapters importam os módulos reais (`./types.js`, `SourceClient`, `SourceDisabledError` do registry — mesmo `instanceof` no executor). Nenhuma duplicação de tipos, nenhum TODO de wiring para este plano.
- **Erros como valores no search:** transporte/parse/challenge/HTTP≥400 viram `SourcePage` (`failed`/`challenge`); só `RangeTooWideError` (422) e termo vazio lançam — ambos antes de qualquer rede. Executor 03-04 não precisa de try/catch por fonte para o caso comum.
- **SSRF em enrich:** BDTD seguro por construção (base constante + `encodeURIComponent`); CAPES valida ficha (http(s) + FQDN público + sem credencial) e resolve `href` relativo contra a ficha. `originUrl` só aceita http(s) (nunca `javascript:`/`data:`).
- **XSS armazenado:** abstracts de ficha passam por `stripHtml` (entidades decodificadas, tags removidas, cap 8000) antes de virarem `NormalizedItem.abstract`.
- **Teste sem `import.meta`:** o tsconfig raiz tipa `tests/**` como CJS (sem `"type":"module"` no package raiz); fixtures via `readFileSync(join(process.cwd(), ...))` — vitest/CI sempre rodam da raiz.
- **`HeadersInit` com `readonly string[]`:** fake de fetch junta multivalor com `', '` (convenção HTTP) em vez de estreitar com cast.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Regex de keywords não casava `Palavras-chave` (plural)**
- **Found during:** task 3 (2 its vermelhos)
- **Issue:** `KEYWORDS_PATTERN = /Palavra-?chaves?/` casa `Palavra-chave` mas não `Palavras-chave` (`-?` não consome o `s` do plural) → `rawMetadata.keywords` undefined
- **Fix:** `/Palavras?-?chaves?/` (casa singular/plural, com/sem hífen)
- **Files modified:** `packages/integrations/src/bdtd.ts`
- **Commit:** `921a380` (fix separado pós-task 3; 15/15 após o fix)

**2. [Rule 1 - Bug] Expectativa do teste estripava `tokenList` errado**
- **Found during:** task 3
- **Issue:** chave `tokenList` casa o padrão `/token/i` e é removida inteira (comportamento correto); o teste esperava `tokenList: [{id: 2}]`
- **Fix:** fixture do teste usa chave neutra `files: [{token, id}]` → `files: [{id}]`
- **Files modified:** `tests/integration/lab-sources-contract.test.ts`
- **Commit:** `72e7769`

**3. [Rule 3 - Blocking] `SourceFetchInit.fetchFn` sem `| undefined` (exactOptional)**
- **Found during:** task 1 (typecheck do pacote)
- **Issue:** `ctx.fetchFn` (`typeof fetch | undefined`) não é atribuível a `fetchFn?: typeof fetch` sob `exactOptionalPropertyTypes`
- **Fix:** helper local `fetchInit()` (bdtd.ts + capes.ts) que só inclui `fetchFn`/`body` quando definidos
- **Files modified:** `packages/integrations/src/bdtd.ts`, `packages/integrations/src/capes.ts`
- **Commit:** `4fefac6`

## Issues Encountered

- Nenhum blocker. A principal incógnita da wave (03-02 em paralelo) resolveu-se sozinha: quando os adapters ficaram prontos para importar, os módulos reais já estavam commitados (`925f4d8`/`b0d2799`).

## Auditoria adversarial (resumo — AGENTS.md)

Arquivo a arquivo antes do commit final: sem autorização decorativa/IDOR (sem rotas/ownerId neste plano — só tradução + filtro puro); sem confiança no navegador (termo validado não-vazio, paginação com clamp, ano com cap); sem segredos (grep `password|secret|api-key|Bearer` só encontra o sanitizador e dado dummy de teste); XSS mitigado (`stripHtml` + `httpString`); SSRF mitigado (allowlist no client + validação de ficha + URL construída de constante); sem `eval`/`Math.random`/`console.log`/`process.env`; regexes de enrich limitadas (classes negadas + quantificadores com teto — sem ReDoS aninhado); `sanitizeRaw` recursivo com teto de profundidade 10. **Nenhum achado a corrigir.**

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 03-04 (lib execução) desbloqueado: `getSourceAdapter` + `postFilter` + `describePostFilter` + `ADAPTER_VERSION`s + `RangeTooWideError`/`SourceDisabledError` com os tipos exatos que o executor precisa; challenge→`sourceStatus:'challenge'` pronto para renovar jar e retentar 1× (D-38).
- Enrich implementada e testada, fora do caminho do run (Phase 4 consome para elegíveis).
- Nenhum blocker. `pnpm test` workspace segue 35/35.

---
*Phase: 03-buscas-e-adapters*
*Completed: 2026-09-11*

## Self-Check: PASSED
- SUMMARY exists; commits 4fefac6 + e2b1d92 + 72e7769 + 921a380 exist; bdtd.ts contém vufind/api/v1/search; capes.ts contém rest/busca; teste tem 15 its verdes; fixtures contêm resultCount/tesesDissertacoes.
