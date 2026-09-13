---
phase: 07-projetos-buscas-execucao
plan: "04"
subsystem: ui
tags: [expo, react-native, vitest, searches, runs, hard-delete, cascade-dialog]
requires:
  - phase: 06-fundacao-app-auth-suporte-core
    provides: labApi tipado (deleteSearch com ?confirm=true, listRuns) + estados §11 + tripwire scroll-containers
  - phase: 07-projetos-buscas-execucao
    provides: 07-02 SearchCard com Excluir disabled + runs por card; 07-03 runStatusLabel/formatDurationMs + rota run.tsx
provides:
  - RunHistory expansível no card (D-11/D-12, UI-16: botão Histórico (N) +/▾, paginação limit 20 + Ver mais, entradas completas, toque abre o run)
  - Helpers puros formatRunWhen/summarizeRun + testes 8/8
  - DeleteSearchDialog de cascata (UI-15: runs/resultados/decisões antes do hard-delete, delete só após [Excluir] explícito)
  - SearchCard final da fase (histórico + excluir integrados, Comparar segue disabled fase 9)
affects: [08-resultados, 09-corpus-compare]

tech-stack:
  added: []
  patterns: [helpers puros em módulo sem imports nativos para teste no vitest (precedente searchTerm.ts), contagens do diálogo honestas sem endpoint novo (limit 100 + "+" se hasMore, decisões qualitativas), remoção local do card via onDeleted sem refetch]

key-files:
  created:
    - apps/lab/src/search/RunHistory.tsx
    - apps/lab/src/search/runHistory.ts
    - apps/lab/src/search/DeleteSearchDialog.tsx
    - apps/lab/src/search/__tests__/runHistory.test.ts
  modified:
    - apps/lab/src/search/SearchCard.tsx
    - apps/lab/app/project/[id]/strategies.tsx

key-decisions:
  - "Helpers formatRunWhen/summarizeRun em runHistory.ts puro (vitest não coleta imports de react-native/expo-router); RunHistory.tsx só consome"
  - "401 no diálogo/histórico aparece verbatim com retry, sem redirect — redirect de sessão expirada continua na lista de estratégias"
  - "onDeleted remove o card da lista local (sem refetch); Comparar segue disabled com hint da fase 9"

patterns-established:
  - "Histórico no card: fetch inicial limit 20 no mount (colapsado) + append manual com cursor sob 'Ver mais'; sem prefetch, sem auto-paginação"
  - "Cascata honesta: runs = items.length (+ se hasMore), resultados = soma coverage, decisões = texto qualitativo sem número (sem endpoint barato na fase 7)"

requirements-completed: [UI-15, UI-16]

duration: 4min
completed: 2026-09-12
---

# Phase 7 Plan 04: Cascata + histórico no card Summary

**Diálogo de hard-delete com cascata explícita (runs/resultados/decisões) e histórico de runs expansível dentro do card — excluir consciente e memória temporal consultável, sem quarta aba**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-09-12T00:38:17Z
- **Completed:** 2026-09-12T00:41:45Z
- **Tasks:** 2
- **Files modified:** 6 (4 criados, 2 modificados)

## Accomplishments

- User exclui busca somente após diálogo que lista a cascata: Nº de execuções, ~N resultados (soma da cobertura) e aviso de decisões/tags perdidas + "não pode ser desfeita (hard-delete)"; [Excluir] só então dispara o DELETE ?confirm=true (UI-15)
- User consulta o histórico expansível dentro do card da estratégia (sem quarta aba): botão `Histórico (N) ▸/▾`, entradas com data/hora, status PT, total, novos, duração e detalhe do parcial (fontes faltantes + motivo); toque abre o run (UI-16, D-11, D-12)
- Falha de contagem nunca bloqueia o diálogo ("contagem indisponível"); erro no histórico tem [tentar de novo]; vazio honesto "Nenhuma execução ainda"
- Suite do app toda verde: 40/40 (runHistory 8/8 novos); typecheck + eslint exit 0; zero `any`

## task Commits

Each task was committed atomically:

1. **task 1: RunHistory expansível com entradas completas** - `89841a3` (feat)
2. **task 2: diálogo de cascata + integração final do card** - `4e114b1` (feat)

**Plan metadata:** (docs commit após STATE/ROADMAP, ver final_commit)

## Files Created/Modified

- `apps/lab/src/search/runHistory.ts` - Helpers puros `formatRunWhen`/`summarizeRun` + tipo `RunSummary` (sem imports nativos, testável; zero `any`)
- `apps/lab/src/search/RunHistory.tsx` - `RunHistory({searchId, projectId, getToken})` (colapsado default, paginado 20 + Ver mais, toque → string `/project/<id>/run?runId=&searchId=`; reusa runStatusLabel/formatDurationMs)
- `apps/lab/src/search/__tests__/runHistory.test.ts` - Vitest puro sem rede/timers (8 testes: hoje/outra/inválida, total = soma, missing failed+skipped/só-uma, repasse newCount/janela)
- `apps/lab/src/search/DeleteSearchDialog.tsx` - `DeleteSearchDialog({search, visible, onClose, onDeleted, getToken})` (cascata honesta via listRuns limit 100, [Excluir] destrutivo disabled durante o DELETE, ApiError verbatim sem fechar, Modal transparent)
- `apps/lab/src/search/SearchCard.tsx` - Embute `<RunHistory>` + diálogo; [Excluir] habilitado no menu ⋯; hint 07-04 removido; Comparar segue disabled fase 9; nova prop `onDeleted`
- `apps/lab/app/project/[id]/strategies.tsx` - `handleDeleted` remove o card da lista local (sem refetch); repassa `onDeleted` ao card

## Decisions Made

- Helpers em `runHistory.ts` puro em vez de definidos no componente: o vitest do lab não coleta arquivos com imports de react-native/expo-router (padrão já estabelecido por `searchTerm.ts`); o componente importa e usa — definição única, sem duplicar regra.
- 401 no diálogo/histórico aparece verbatim com retry em vez de redirect: redirect surpresa a partir de um widget colapsável quebraria contexto; a lista de estratégias já trata sessão expirada (expired/next).
- `onDeleted` remove o card da lista local sem refetch (o DELETE já confirmou no servidor); `onChanged` continua para duplicar.
- Linha 3 da entrada aparece quando há fonte faltante OU run parcial (parcial sem faltante explícita mostra `faltou: —` + motivo quando presente).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Helpers puros extraídos para runHistory.ts (vitest não coleta componente RN)**

- **Found during:** task 1 (verify: `vitest run` falhava com `SyntaxError: Unexpected token 'typeof'` na coleta — import de expo-router/react-native pelo teste)
- **Issue:** O plano previa `formatRunWhen`/`summarizeRun` definidos em `RunHistory.tsx`, mas nenhum teste do lab importa componente com imports nativos (tripwire lê fonte como texto; `useRunPolling` passa porque importa só `react`)
- **Fix:** Criado `apps/lab/src/search/runHistory.ts` (puro, só `import type` do contrato) com os dois helpers + `RunSummary`; `RunHistory.tsx` importa/usa; teste importa do módulo puro. Critérios de grep continuam verdes (4/4/0/0)
- **Files modified:** `apps/lab/src/search/runHistory.ts` (novo), `RunHistory.tsx`, `__tests__/runHistory.test.ts`
- **Verification:** vitest 40/40 (runHistory 8/8); greps do plano OK; tsc + eslint exit 0
- **Committed in:** `89841a3` (parte do commit da task 1)

**2. [Rule 1 - Bug] Fábrica do teste engolia `finishedAt: null` explícito**

- **Found during:** task 1 (verify: 1 teste falhava — `expected ... to be null`)
- **Issue:** `overrides?.finishedAt ?? default` trata `null` explícito como ausente (nullish), impedindo testar run em andamento
- **Fix:** Checagem `!== undefined` em `startedAt`/`finishedAt` da fábrica (só-teste, sem impacto em produção)
- **Files modified:** `apps/lab/src/search/__tests__/runHistory.test.ts`
- **Verification:** vitest 40/40
- **Committed in:** `89841a3` (antes do commit da task 1)

**3. [Rule 3 - Blocking] strategies.tsx repassa onDeleted (prop nova exigida pelo card)**

- **Found during:** task 2 (nova prop `onDeleted` do plano quebraria o tsc no único consumidor do card)
- **Issue:** O plano listava só `DeleteSearchDialog.tsx` + `SearchCard.tsx`, mas `strategies.tsx` renderiza o card — sem `onDeleted`, typecheck falha
- **Fix:** `handleDeleted` com `setItems(filter id)` + prop no renderItem; comentário atualizado (só navegação/estado, sem regra de negócio)
- **Files modified:** `apps/lab/app/project/[id]/strategies.tsx`
- **Verification:** `tsc --noEmit` exit 0; eslint exit 0
- **Committed in:** `4e114b1` (parte do commit da task 2)

---

**Total deviations:** 3 auto-fixes (2 Rule 3, 1 Rule 1)
**Impact on plan:** Extração de módulo puro e prop no consumidor eram necessários para testes/typecheck; nenhum scope creep (sem rota de API, tabela ou superfície nova; contrato intocado; 0 dependências novas).

## Issues Encountered

- Paths do eslint sob `pnpm --filter`: o plano traz `eslint apps/lab/...`, mas o filter executa dentro de `apps/lab` — rodado com paths relativos (`src/search/...`), exit 0. Só invocação, sem mudança de código.
- Nenhum bloqueio. Auth gates não ocorreram (401 tratado como verbatim+retry nos widgets; expired/next segue na lista).

## Auditoria adversarial (AGENTS.md, antes de declarar concluído)

Arquivo por arquivo nos 6 tocados, cobrindo autorização decorativa, IDOR, confiança no navegador, segredos, XSS/input/upload/SSRF, sessões, webhooks, rate limit, SQL/command injection e isolamento:

- Autorização decorativa: diálogo nunca autoriza — só exibe contagens informativas e chama `deleteSearch` após toque explícito; guards seguem UX, decisão real no CORE owner-scoped.
- IDOR: exclusão e histórico operam só com ids já visíveis no card (search.id do DTO do servidor); contagens vêm de endpoint owner-scoped; 404 genérico do servidor sem distinguir alheio; erro verbatim do envelope.
- Navegador/storage: zero `localStorage`/`console`/`Math.random`/`eval(` nos 6 arquivos; token só via `getToken` injetado; `requestId` exibido é correlação, não segredo; termo renderizado verbatim em `Text` (RN escapa).
- Input/XSS: sem input novo (só botões/toques); `error.message` do servidor em `Text`; ids via `encodeURIComponent` no client existente; sem WebView/innerHTML/new Function.
- Sessões/webhooks/SQL: sem sessão própria, sem webhook, sem SQL no app (só CORE via fetch tipado + `unknown`/narrowing).
- Rate limit/DoS: Ver-mais manual com cursor limit 20 (T-07-04-03); diálogo busca contagens 1× por abertura (limit 100); [Excluir]/[Ver mais] disabled durante busy (sem duplo-tap); sem prefetch.
- Destrutivo com confirmação explícita (AGENTS.md safety): cascata + [Excluir] dedicado + aviso hard-delete; sem exclusão por gesto ambíguo.
- Resultado: 0 crit / 0 high no escopo do plano. Gates: typecheck lab exit 0, eslint (6 arquivos) exit 0, vitest 40/40 (runHistory 8/8 + tripwire 6/6), zero `any`, contrato intocado. `pnpm audit`/Gitleaks/SAST sem binário local — CI cobre (como na 07-01/07-02/07-03; plano adiciona 0 dependências).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Fase 7 FECHADA (4/4): projetos → estratégias → execução acompanhada → cascata + histórico. Card final: Executar/Editar/Duplicar/[Excluir real]/histórico expansível; Comparar segue disabled para a fase 9.
- Pronto para 08-resultados: entradas do histórico tocam para `/project/<id>/run?runId=&searchId=`; badge `N NOVOS` e placeholder honesto já na tela do run.
- Fluxo manual a provar em beta: excluir pede cascata com números → confirma some o card; cancela nada muda; erro mantém o diálogo aberto com mensagem verbatim; histórico expande com entradas completas e toque abre o run.

---

*Phase: 07-projetos-buscas-execucao*
*Completed: 2026-09-12*

## Self-Check: PASSED

- FOUND: apps/lab/src/search/RunHistory.tsx
- FOUND: apps/lab/src/search/runHistory.ts
- FOUND: apps/lab/src/search/DeleteSearchDialog.tsx
- FOUND: apps/lab/src/search/__tests__/runHistory.test.ts
- FOUND: .planning/phases/07-projetos-buscas-execucao/07-04-SUMMARY.md
- FOUND: 89841a3
- FOUND: 4e114b1
