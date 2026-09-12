---
phase: 07-projetos-buscas-execucao
plan: "02"
subsystem: ui
tags: [expo, react-native, zod, vitest, searches, runs, sources-health, idempotency]
requires:
  - phase: 06-fundacao-app-auth-suporte-core
    provides: FlatList/ScrollView + estados §11 + labApi tipado + tripwire scroll-containers
  - phase: 07-projetos-buscas-execucao
    provides: 07-01 ProjectModal/TabBar patterns + lista gerenciável de projetos
provides:
  - Helper searchTerm (linhas AND/OR/NOT → termo pass-through do contrato, split quote-aware)
  - SearchForm §6 com selo Core + status das fontes + salvar vs salvar-e-executar
  - Tela search-form (criar/editar + execute com Idempotency-Key por toque)
  - SearchCard §5 com runs/última execução reais + Executar/Duplicar
  - Tela strategies em FlatList + tripwire estendido (6 telas)
affects: [07-03 execucao-polling, 07-04 cascata-historico, 08-resultados, 09-corpus-compare]

tech-stack:
  added: []
  patterns: [linhas AND/OR/NOT compostas no client via buildSearchTerm + parse createSearchSchema antes do POST, Idempotency-Key globalThis.crypto.randomUUID() por toque sem auto-retry em 429, saúde das fontes informativa sem bloquear o form, runs por card com fallback "histórico indisponível"]

key-files:
  created:
    - apps/lab/src/search/searchTerm.ts
    - apps/lab/src/search/SearchForm.tsx
    - apps/lab/src/search/SearchCard.tsx
    - apps/lab/app/project/[id]/search-form.tsx
    - apps/lab/src/search/__tests__/searchTerm.test.ts
  modified:
    - apps/lab/app/project/[id]/strategies.tsx
    - apps/lab/src/ui/__tests__/scroll-containers.test.ts
    - apps/lab/app/_layout.tsx

key-decisions:
  - "splitSearchTerm quote-aware (AND/OR/NOT dentro de frase exata nunca divide) em vez de split regex ingênuo"
  - "Pré-validação PT-BR de ano/fonte no form antes do parse do contrato (mensagens default do Zod para min/array seriam em inglês)"
  - "SearchCard usa useAuth/useRouter internamente para 401 (getToken + onChanged via props, como no plano)"
  - "Registro search-form no Stack do _layout (título Buscar), como strategies/corpus"

patterns-established:
  - "Salvar vs salvar-e-executar: form valida local (termo + createSearchSchema.parse) e devolve payload; a tela decide create/update + execute + navegação"
  - "Executar em qualquer superfície: executeSearch com idempotencyKey por toque + push string da rota do run; 429/422 verbatim sem navegação"
  - "Resumo de filtros monta só com filtros presentes (vazio → 'sem filtros'); total do run = coverage.bdtd + coverage.capes"

requirements-completed: [UI-12, UI-13]

duration: 5min
completed: 2026-09-12
---

# Phase 7 Plan 02: Estratégias na UI Summary

**Linhas AND/OR/NOT compostas em termo pass-through do contrato, formulário §6 com selo Core + salvar/salvar-e-executar, e cards de estratégia com runs reais em FlatList**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-12T00:25:06Z
- **Completed:** 2026-09-12T00:29:48Z
- **Tasks:** 2
- **Files modified:** 8 (5 criados, 3 modificados)

## Accomplishments

- User monta a busca em linhas com AND/OR/NOT (sem expressão livre) e o app compõe o termo válido do contrato, com frase exata automática para texto com espaço (D-09, UI-13)
- User salva a estratégia OU salva-e-executa, vendo o selo "filtro garantido pelo Core (pós-filtro)" + status operacional/degradada/offline por fonte antes de executar (D-10, UI-13)
- User vê cards de estratégia com termos legíveis, filtros, fontes, nº de runs e última execução (data + total + ok/verbatim), com Executar/Duplicar reais e Comparar/Excluir desabilitados com hints de fase (UI-12)
- Nenhum campo novo no contrato (linhas compõem o `term` pass-through; tese→doctoralThesis sem inversão); Idempotency-Key por toque, sem auto-retry em 429

## task Commits

Each task was committed atomically:

1. **task 1: helper searchTerm + formulário §6 com salvar/salvar-e-executar** - `df7c5e1` (feat)
2. **task 2: lista de estratégias com cards + tripwire estendido** - `76bdd54` (feat)

**Plan metadata:** (docs commit após STATE/ROADMAP, ver final_commit)

## Files Created/Modified

- `apps/lab/src/search/searchTerm.ts` - `TermRow` + `buildSearchTerm`/`splitSearchTerm` (split quote-aware, zero `any`)
- `apps/lab/src/search/SearchForm.tsx` - Form §6 controlado (linhas em FlatList aninhada, filtros, fontes + selo, 2 CTAs, erro PT-BR sem API)
- `apps/lab/app/project/[id]/search-form.tsx` - Tela criar/editar (saúde via listSources+getSourceHealth, save→back, save&run→execute+push run)
- `apps/lab/src/search/__tests__/searchTerm.test.ts` - Vitest sem rede (10 testes: composição, NOT/OR, descarte de vazia, aspas, round-trip)
- `apps/lab/src/search/SearchCard.tsx` - Card §5 (runs via listRuns, Executar/Duplicar reais, Comparar/Excluir disabled com hints)
- `apps/lab/app/project/[id]/strategies.tsx` - Reescrita: FlatList + Nova estratégia (+) + vazio/skeleton/erro (placeholder substituído)
- `apps/lab/src/ui/__tests__/scroll-containers.test.ts` - Tripwire estendido (strategies FlatList + search-form ScrollView, 5 testes)
- `apps/lab/app/_layout.tsx` - Registro `project/[id]/search-form` no Stack (desvio documentado)

## Decisions Made

- splitSearchTerm quote-aware (scanner com estado inQuotes) em vez de split regex ingênuo: `"A AND B" AND C` reabre em 2 linhas sem quebrar a frase exata; round-trip coberto em teste.
- Pré-validação PT-BR de ano (inteiro 1800–2100) e fonte mínima (1) no SearchForm antes do `createSearchSchema.parse`: mensagens default do Zod para `.min()` de número/array seriam em inglês; o parse do contrato continua como gate final (ordem yearFrom≤yearTo etc.).
- SearchCard consome `useAuth()`/`useRouter()` internamente para o 401 (markExpired + next da aba) e navegação; `getToken` + `onChanged` via props exatamente como no plano.
- Rota do run como string template `` `/project/${id}/run?runId=&searchId=` `` (tela chega na 07-03, sem import); Editar usa push objeto (rota existente search-form).
- Sem paginação na lista de estratégias neste plano (limit 100, como contagens 07-01); paginação é discricionariedade aberta e a 07-04/08 podem revisitar se o volume exigir.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registro da rota search-form no Stack do _layout**

- **Found during:** task 1 (tela search-form criada; strategies/corpus têm Screen explícito com título)
- **Issue:** `_layout.tsx` registra `project/[id]/strategies` e `project/[id]/corpus` com títulos, mas o plano não incluía o registro da nova rota `project/[id]/search-form` — sem ele a tela funciona (file-based) mas sem título consistente no Stack.
- **Fix:** Adicionado `<Stack.Screen name="project/[id]/search-form" options={{ title: 'Buscar' }} />` (só navegação, sem regra de negócio).
- **Files modified:** `apps/lab/app/_layout.tsx`
- **Verification:** `tsc --noEmit` exit 0; eslint exit 0
- **Committed in:** `76bdd54` (parte do commit da task 2)

**2. [Ajuste de gate, sem código] Tokens de aceitação em comentários quebravam os greps do plano**

- **Found during:** task 1 (verify)
- **Issue:** Comentários citavam `booleanOperators` ("sem campo …") e `Math.random` ("sem …"), mas os critérios exigem contagem 0 desses tokens nos arquivos — o grep não distingue código de comentário.
- **Fix:** Reescritos os 3 comentários sem os tokens literais ("nenhum campo novo no contrato", "aleatório seguro do runtime"). Comportamento idêntico.
- **Files modified:** `searchTerm.ts`, `SearchForm.tsx`, `search-form.tsx` (só comentários)
- **Verification:** greps do plano retornam 0; testes 25/25
- **Committed in:** `df7c5e1` (antes do commit da task 1)

---

**Total deviations:** 1 auto-fix de código (Rule 3) + 1 ajuste de comentário para gate (sem comportamento)
**Impact on plan:** Registro de rota era necessário para consistência de navegação; nenhum scope creep (sem rota de API, tabela ou superfície nova; contrato intocado).

## Issues Encountered

- `exactOptionalPropertyTypes`: `initial={initial ?? undefined}` no search-form falhou no tsc (TS2375) — resolvido com spread condicional `{...(initial !== null ? { initial } : {})}` (padrão compatível com o strict do monorepo).
- Nenhum bloqueio. Auth gates não ocorreram (telas preservam 401 → expired/next do padrão 06-03/06-04).

## Auditoria adversarial (AGENTS.md, antes de declarar concluído)

Arquivo por arquivo nos 8 tocados, cobrindo autorização decorativa, IDOR, confiança no navegador, segredos, XSS/input/upload/SSRF, sessões, webhooks, rate limit, SQL/command injection e isolamento:

- Autorização decorativa: guards seguem UX; nenhuma decisão de privilégio no client; 401 real dispara expired+next em search-form, strategies e SearchCard (execute/duplicar).
- IDOR: pertencimento application-level no servidor; app nunca distingue "inexistente" de "alheio" (erro verbatim genérico); SearchCard deriva projectId do DTO do servidor, não do param.
- Navegador/storage: nenhum `localStorage`, role/owner em storage, segredo em bundle/código/Git/logs; token só via `getToken` injetado; `next` construído internamente (`/project/<id>/...`), sem open redirect.
- Input/XSS: termo/filtros validados com Zod nos dois lados (client UX + servidor revalida); trim + maxLength em todos os inputs; RN escapa `Text` por padrão; sem WebView/innerHTML/eval/new Function; composição do termo é concatenação pura (quote-aware, sem interpretar operadores).
- Sessões/webhooks/SQL: sem sessão própria, sem webhook, sem SQL no app (só CORE via fetch tipado + `unknown`/narrowing).
- Rate limit/DoS: 429 verbatim sem auto-retry; CTAs desabilitados durante busy (sem duplo-tap); Idempotency-Key única por toque (replay vira 200 sem novo run).
- Resultado: 0 crit / 0 high no escopo do plano. Gates: typecheck lab exit 0, eslint exit 0 (8 arquivos), vitest 25/25 (searchTerm 10/10 + tripwire 5/5), zero `any`, `Math.random` 0, contrato intocado (0 ocorrências de contrato/migration nos arquivos do plano). `pnpm audit --prod`: 4 vulns (2 moderate + 2 high) em deps transitivas de toolchain pré-existentes (image-size, uuid, decode-uri-component) — plano adiciona 0 dependências. Gitleaks/SAST sem binário local — CI cobre (como na 07-01).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pronto para 07-03 (execução: polling por fonte + cancelar + banners): Executar (card e form) já cria o run e navega para `/project/[id]/run?runId=&searchId=`; a tela do run consome `getRun`/`getJob`/`cancelJob` do `labApi` existente.
- Pronto para 07-04 (cascata + histórico expansível): Excluir segue disabled com hint "diálogo de cascata na 07-04"; runs por card já listam via `listRuns` (o expansível detalha por entrada).
- Fluxo manual a provar em beta: criar estratégia em linhas → card aparece com termos legíveis; Executar agora → run criado e navega (tela do run chega na 07-03).

---

*Phase: 07-projetos-buscas-execucao*
*Completed: 2026-09-12*

## Self-Check: PASSED

- FOUND: apps/lab/src/search/searchTerm.ts
- FOUND: apps/lab/src/search/SearchForm.tsx
- FOUND: apps/lab/src/search/SearchCard.tsx
- FOUND: apps/lab/app/project/[id]/search-form.tsx
- FOUND: apps/lab/app/project/[id]/strategies.tsx
- FOUND: apps/lab/src/search/__tests__/searchTerm.test.ts
- FOUND: df7c5e1
- FOUND: 76bdd54
