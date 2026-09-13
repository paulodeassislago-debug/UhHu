---
phase: 09-corpus-exportacao-comparacao
plan: 02
subsystem: ui
tags: [corpus, filter, flatlist, expo, vitest, corpus-view]

# Dependency graph
requires:
  - phase: 08-resultados-triagem
    provides: filtros AND D-17 + formatCorpusCount + molde load/401/FlatList de strategies
  - phase: 09-corpus-exportacao-comparacao
    provides: labApi.getCorpus + CorpusEntryDTO em definicao unica
provides:
  - filterCorpus puro tag/fonte/ano com semantica AND (7 its verdes)
  - corpus.tsx real com contador vivo + 3 filtros + FlatList + selecao por grupo inteiro + selectedIds
affects: [09-03-export-ui, 09-06-gate-milestone]

# Tech tracking
tech-stack:
  added: []
  patterns: [filtro puro AND sem rede, FlatList sem .map, 401 expired+next, Empty/ErrorBanner/CardSkeleton §11]

key-files:
  created: [apps/lab/src/corpus/corpusFilters.ts, apps/lab/src/corpus/__tests__/corpusFilters.test.ts]
  modified: [apps/lab/app/project/[id]/corpus.tsx]

key-decisions:
  - "Filtro vazio devolve copia na mesma ordem; year null nunca casa com numero"
  - "Contagem do GET (formatCorpusCount items.length/hasMore), nunca do filtro local"
  - "Selecao por groupId inteiro com selectedIds derivado para o 09-03, sem barra de exportar aqui"

patterns-established:
  - "CorpusFilter com exactOptionalPropertyTypes: montagem condicional sem undefined explicito"
  - "Origens BDTD+CAPES via loop sem .map para satisfazer tripwire scroll-containers"

requirements-completed: [UI-23, UI-24]

# Metrics
duration: ~4min
completed: 2026-09-13
---

# Phase 9 Plan 02: Corpus real Summary

**Aba Corpus como view derivada dos elegíveis com contador vivo, filtros AND tag/fonte/ano e seleção por grupo inteiro pronta para exportação**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-09-13T14:14:51Z
- **Completed:** 2026-09-13T14:18:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `filterCorpus` puro com AND tag/fonte/ano verde em 7 casos, sem rede ou UI
- `corpus.tsx` reescrito sobre `labApi.getCorpus` com contador vivo `formatCorpusCount(items.length, page.hasMore)`
- 3 filtros client-side (TextInput tag, 2 botões BDTD/CAPES toggle, TextInput ano com parse int e ignora NaN) via `filterCorpus`
- FlatList virtualizada por `groupId` com título + ano/`s/ano` + instituição + origens `BDTD+CAPES` + tags + `Selecionar`/`Selecionado` por grupo inteiro e `selectedIds` derivado
- Vazios orientadores (`Nenhum item elegível ainda — trie os resultados primeiro` / `Nenhum item com estes filtros`), skeleton ×3, erro verbatim + Repetir, 401 com expired+next

## task Commits

Each task was committed atomically:

1. **task 1: filtro puro do corpus com testes** - `51f3cc2` (feat)
2. **task 2: corpus.tsx real com contador vivo e filtros** - `a7d1aca` (feat)

## Files Created/Modified

- `apps/lab/src/corpus/corpusFilters.ts` - `CorpusFilter` + `filterCorpus` AND puro (`tags.includes` / `origins.includes` / `year ===`), vazio devolve cópia; `import type` de contracts
- `apps/lab/src/corpus/__tests__/corpusFilters.test.ts` - 7 its (vazio devolve tudo, só-tag, só-fonte, só-ano, AND que zera, year null não casa, array vazio)
- `apps/lab/app/project/[id]/corpus.tsx` - tela real: GET corpus limit 100, header vivo, filtros, FlatList groupId, seleção Set + selectedIds, §11 completo, 401 expired+next

## Decisions Made

- Filtro vazio devolve cópia na mesma ordem (não a mesma referência — teste prova `not.toBe`): evita mutação acidental do array do GET
- Contagem sempre do GET (`items.length` + `page.hasMore`), nunca de `visible.length`: honra "corpus = view derivada" e evita contagem que muda ao filtrar (só muda após decisão + refetch)
- Seleção por `groupId` inteiro com `Set<string>` + `selectedIds = Array.from(selected)`: D-14-2 um trabalho uma referência; barra de exportar fica para o 09-03 que lê este estado
- `formatOrigins`/`formatYear`/`formatInstitution`/`formatTags` sem `.map`: tripwire scroll-containers exige zero `.map(` na tela; loops + `join` satisfazem sem enfraquecer nada

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] exactOptionalPropertyTypes rejeita undefined explícito no filtro**
- **Found during:** task 2 (corpus.tsx, `tsc` TS2379 em `{ tag: tagFilter, ... }` com `string | undefined`)
- **Issue:** `CorpusFilter { tag?: string }` com `exactOptionalPropertyTypes: true` não aceita `{ tag: undefined }` explícito; objeto literal com os 3 campos opcionais falha no typecheck
- **Fix:** montagem condicional do filtro (`const filter: CorpusFilter = {}; if (x !== undefined) filter.x = x;`) + `import type { CorpusFilter }`; `filterCorpus` intocado
- **Files modified:** apps/lab/app/project/[id]/corpus.tsx
- **Verification:** `tsc --noEmit -p tsconfig.json` exit 0, `eslint` exit 0
- **Committed in:** a7d1aca (part of task 2 commit)

**2. [Rule 1 - Bug] grep `any` acusava comentários com a palavra proibida**
- **Found during:** task 1 (gate `grep -c "any" = 0`)
- **Issue:** comentários continham a palavra `any` entre crases (falso-positivo literal do grep, não uso do tipo)
- **Fix:** reescrita dos comentários para "sem tipo proibido" sem a sequência de letras; código intocado
- **Files modified:** apps/lab/src/corpus/corpusFilters.ts, apps/lab/src/corpus/__tests__/corpusFilters.test.ts
- **Verification:** `grep -c "any"` = 0 nos 2 arquivos + `vitest run src/corpus` 7/7
- **Committed in:** 51f3cc2 (part of task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 correctness/bug, Rules 1)
**Impact on plan:** Ambos necessários para gates verdes (typecheck strict + grep literal). Sem scope creep; interface `CorpusFilter` segue a do plano.

## Issues Encountered

- `pnpm --filter @uhhu/lab vitest run` sem `exec` falha ("None of the selected packages has a vitest script") — comando correto é `pnpm --filter @uhhu/lab exec vitest run`; verificação do plano executada via `exec`

## Auditoria adversarial (AGENTS.md)

- **Autorização/IDOR (T-09-02-01, mitigate):** `projectId` só da rota (`useLocalSearchParams`), auth via `getToken`/cookie repassado a `getCorpus`; 401 vira `markExpired` + redirect `/login?expired=1&next=/project/<id>/corpus`; demais erros viram `ErrorBanner` verbatim sem distinguir 404 alheio; owner deriva do ator no servidor
- **XSS (T-09-02-02, mitigate):** título/tags/instituição só em `Text` (escapa por padrão); sem WebView/`dangerouslySetInnerHTML`/`eval`; links/divergências não renderizados aqui
- **Filtro spoofing (T-09-02-03, accept):** filtro é UX puro sobre elegíveis do servidor; referência nunca entra no filtro (`grep -c referenceSearchId` = 0); D-25 honrado
- **Input hostil:** `tagInput` só `trim` local, nunca vai à rede; `yearInput` com `parseInt` + `isSafeInteger`, NaN ignorado (volta a `undefined` = todos); `projectId` vazio nem faz request (erro local `Projeto inválido.`)
- **Segredos/sessões:** nenhum segredo em código/bundle; PAT só via `getToken` injetado (SecureStore no provider); 401 limpa via `markExpired`
- **Gates executados:** `vitest run src/corpus` 7/7 verde; `tsc --noEmit` exit 0; `eslint` exit 0; `grep -c "\.map(" corpus.tsx` = 0; `grep -c "any"` = 0; `grep -c exportProject/Share/expo-sharing/expo-file-system/referenceSearchId` = 0/0/0/0/0

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pronto para 09-03 (Export UI): `selected: Set<string>` + `selectedIds: string[]` já derivam a seleção por grupo inteiro; 09-03 só adiciona a barra (formatos CSV/BibTeX/JSON, blob+anchor web e nativo)
- Sem bloqueios; 09-04 (Wave 1 paralelo) não conflita (zero overlap: compare vs corpus)
- BibTeX do MP (09-01) já marcado no servidor; corpus exibe sem precisar de `docType` aqui

---
*Phase: 09-corpus-exportacao-comparacao*
*Completed: 2026-09-13*

## Self-Check: PASSED
- FOUND: apps/lab/src/corpus/corpusFilters.ts (commit 51f3cc2)
- FOUND: apps/lab/src/corpus/__tests__/corpusFilters.test.ts (commit 51f3cc2)
- FOUND: apps/lab/app/project/[id]/corpus.tsx (commit a7d1aca)
- FOUND: 51f3cc2 e a7d1aca em git log
- Suite src/corpus 7/7 + typecheck exit 0 + eslint exit 0 verificados acima
