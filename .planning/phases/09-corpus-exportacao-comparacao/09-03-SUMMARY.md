---
phase: 09-corpus-exportacao-comparacao
plan: 03
subsystem: ui
tags: [corpus, export, csv, bibtex, json, blob, share, vitest, export-delivery]

# Dependency graph
requires:
  - phase: 09-corpus-exportacao-comparacao
    provides: corpus.tsx real com selectedIds por grupo inteiro (09-02)
  - phase: 09-corpus-exportacao-comparacao
    provides: labApi.exportProject raw verbatim + ExportFormat/ExportScope
provides:
  - exportDelivery puro (mime/slug/empty/download por plataforma, 6 its verdes)
  - corpus.tsx com barra exportar seleção (grupo inteiro) + corpus completo nos 3 formatos
affects: [09-06-gate-milestone]

# Tech tracking
tech-stack:
  added: []
  patterns: [Blob+anchor web e Share nativo sem dep nova, slug ASCII allowlist, BibTeX vazio avisa sem request, 401 expired+next]

key-files:
  created: [apps/lab/src/export/exportDelivery.ts, apps/lab/src/export/__tests__/exportDelivery.test.ts]
  modified: [apps/lab/app/project/[id]/corpus.tsx]

key-decisions:
  - "Seleção vazia nunca vira request: BibTeX avisa com texto exato, demais formatos retornam silenciosos (botão já desabilita)"
  - "Título do projeto via listById em efeito isolado com erro engolido — falha de título nunca quebra a lista"
  - "Retry de export reexecuta o último escopo/seleção capturados no toque, não o estado atual"

patterns-established:
  - "ExportFileExt local csv|bib|json com extForFile bibtex->bib; ExportFormat reutilizado de api/lab via import type"
  - "Strip de diacríticos por faixa numérica 0x0300-0x036f (sem glifo invisível no fonte)"

requirements-completed: [UI-25, UI-26]

# Metrics
duration: ~5min
completed: 2026-09-13
---

# Phase 9 Plan 03: Exportação na UI Summary

**Barra de exportar no corpus: seleção por grupo inteiro + corpus completo em CSV/BibTeX/JSON, com Blob+anchor na web, Share no nativo e aviso em BibTeX vazio**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-13T14:26:16Z
- **Completed:** 2026-09-13T14:31:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `exportDelivery.ts` puro com `mimeForFormat` (3 mimes fixos), `buildExportFilename` (slug ASCII próprio + fallback `projeto`), `isExportEmpty` (count 0 ou corpo em branco) e `downloadExportFile` (web Blob+anchor+revoke, nativo `Share.share`) — zero dep nova
- 6 its verdes cobrindo os 3 mimes, slug `São Paulo "../../etc"` → `corpus-sao-paulo-etc-<data>.csv` sem `..`/`/`/`"`, vazio com count 0 e cheio com corpo+count
- `corpus.tsx` com seção Exportar: 3 botões de formato (CSV/BibTeX/JSON, default csv) + `Seleção: X de Y` + `Exportar seleção` (disabled sem seleção) + `Exportar corpus completo`
- Raw do `exportProject` repassado verbatim ao `downloadExportFile` (nunca re-serializado); erro vira `ErrorBanner` verbatim + requestId com Repetir do último escopo; 401 vira expired+next do corpus
- Suite do lab 121/121 (115 + 6 novas); typecheck + eslint exit 0; `any` 0; `expo-sharing|expo-file-system` 0 em app/src/package.json; `.map(` 0 no corpus

## task Commits

Each task was committed atomically:

1. **task 1: entrega por plataforma sem dependencia nova** - `ce583cb` (feat)
2. **task 2: barra exportar selecao + completo no corpus** - `c36892d` (feat)

## Files Created/Modified

- `apps/lab/src/export/exportDelivery.ts` - `ExportFileExt` + 4 funções de entrega; `import { Platform, Share } from 'react-native'` estático; `import type { ExportFormat }` de api/lab
- `apps/lab/src/export/__tests__/exportDelivery.test.ts` - 6 its (mimes/slug/vazio); `react-native` sob `vi.mock` (Platform web + Share mock)
- `apps/lab/app/project/[id]/corpus.tsx` - estados format/projectTitle/exportBusy/exportError/exportRequestId/exportNotice/lastExport + efeito de título isolado + `runExport`/`handleExportSelection`/`handleExportComplete`/`handleRetryExport` + seção Exportar no header

## Decisions Made

- Seleção vazia nunca vira request: BibTeX mostra `Nada para exportar em BibTeX — selecione ao menos um item.` (texto exato do plano); csv/json vazios retornam silenciosos porque o botão já desabilita — evita 400 previsível do servidor
- Título do projeto via `projectsApi.listById` em efeito isolado com erro engolido (inclusive 401): falha de título nunca quebra a lista; a sessão expirada é tratada pelo GET do corpus
- Retry de export (`Repetir` no ErrorBanner) reexecuta o último `{scope, selection}` capturado no toque via `lastExport`, não o estado atual da seleção — retry fiel ao que falhou
- Strip de diacríticos por faixa numérica `0x0300–0x036f` em loop em vez de regex com caracteres combinantes literais — sem glifo invisível no fonte

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm --filter @uhhu/lab vitest run` não existe como script**
- **Found during:** task 1 (comando de verify do plano falha com "None of the selected packages has a vitest script")
- **Issue:** pacote lab não declara script `vitest`; comando do plano não roda
- **Fix:** verificação executada via `pnpm --filter @uhhu/lab exec vitest run` (mesmo desvio documentado no 09-02)
- **Files modified:** nenhum (só invocação)
- **Verification:** 6/6 verde via `exec`
- **Committed in:** ce583cb (código já testado pelo comando correto)

**2. [Rule 1 - Bug] Comentário continha os literais proibidos `expo-sharing`/`expo-file-system`**
- **Found during:** task 1 (gate repo-wide `grep -rn "expo-sharing\|expo-file-system" apps/lab/ = 0`)
- **Issue:** comentário "sem expo-sharing/file-system" tripa o grep literal do gate, mesmo sendo só menção
- **Fix:** reescrita para "(zero pacote extra)" sem os literais; código intocado
- **Files modified:** apps/lab/src/export/exportDelivery.ts
- **Verification:** `grep -rn` vazio em app/src + package.json
- **Committed in:** ce583cb (part of task 1 commit)

**3. [Rule 2 - Missing] Seleção vazia não-BibTeX geraria request 400 previsível**
- **Found during:** task 2 (handler de seleção do plano só previa o aviso BibTeX)
- **Issue:** botão desabilita, mas handler sem guarda geral enviaria `scope=selection` sem `selection` → 400 certo do servidor
- **Fix:** guarda geral `selectedIds.length === 0 → return` (com aviso só no ramo BibTeX) + `ErrorBanner` de export com `Repetir` via `lastExport`
- **Files modified:** apps/lab/app/project/[id]/corpus.tsx
- **Verification:** typecheck + eslint exit 0, suite 121/121
- **Committed in:** c36892d (part of task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 correctness/bug, 1 missing-critical)
**Impact on plan:** Todos necessários para gates verdes e corretude; sem scope creep (retry usa só estado já exigido pelo §11; guarda evita request inválido).

## Issues Encountered

- Nenhum bloqueio; nenhum gate de autenticação (testes sem rede, typecheck/eslint locais)

## Auditoria adversarial (AGENTS.md)

- **IDOR (T-09-03-01, mitigate):** `selection` montada SÓ de `selectedIds` renderizados pelo GET do próprio corpus; `projectId` só da rota; auth via `getToken`; owner deriva no servidor; 401 vira expired+next; sem input livre de ID — teste manual dono/estranho/adulterado fica para o 09-06
- **Injeção filename/mime (T-09-03-02, mitigate):** slug restrito a `[a-z0-9-]` (travessia/aspas viram `-`, fallback `projeto`); ext de union `csv|bib|json`; mime de mapa fixo; anchor por propriedade (sem HTML); título/data vão pelo slug/data numérica
- **DoS (T-09-03-03, accept):** corpus UI limitado a 100 + seleção limitada aos visíveis; `busy` trava duplo-toque; sem retry automático (só `Repetir` manual)
- **XSS/input:** tudo do servidor em `<Text>` (escapa por padrão); sem WebView/`dangerouslySetInnerHTML`/`eval`; raw nunca parseado como código
- **Segredos/sessões:** nenhum segredo em código/bundle; PAT só via `getToken` injetado; 401 limpa via `markExpired`
- **Gates executados:** `vitest run` lab 121/121; `tsc --noEmit` exit 0; `eslint` nos 3 arquivos exit 0; `grep -c "any"` = 0 nos 2 arquivos-fonte; `grep expo-sharing|expo-file-system` = 0 em app/src/package.json; `grep -c "\.map(" corpus.tsx` = 0; `grep referenceSearchId corpus.tsx` = 0

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pronto para 09-05 (Referência manual): export fechado não conflita (zero overlap: corpus vs strategies/compare)
- Pronto para 09-06 (Gate): slice corpus/export completo na UI; IDOR 4x4 + prova beta + UAT humana pendentes lá
- `isExportEmpty` disponível para futuros chamadores (BibTeX cheio/vazio programático); UI atual usa guarda de `selectedIds` por ser anterior ao request

---
*Phase: 09-corpus-exportacao-comparacao*
*Completed: 2026-09-13*

## Self-Check: PASSED
- FOUND: apps/lab/src/export/exportDelivery.ts (commit ce583cb)
- FOUND: apps/lab/src/export/__tests__/exportDelivery.test.ts (commit ce583cb)
- FOUND: apps/lab/app/project/[id]/corpus.tsx (commit c36892d)
- FOUND: ce583cb e c36892d em git log
- Suite lab 121/121 + typecheck exit 0 + eslint exit 0 verificados acima
