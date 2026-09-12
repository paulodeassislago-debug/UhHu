---
phase: 07-projetos-buscas-execucao
plan: "03"
subsystem: ui
tags: [expo, react-native, vitest, polling, runs, cancel, banners]
requires:
  - phase: 06-fundacao-app-auth-suporte-core
    provides: labApi tipado (getRun/cancelJob/executeSearch) + estados §11 + tripwire scroll-containers
  - phase: 07-projetos-buscas-execucao
    provides: 07-02 Executar navegando para /project/[id]/run?runId=&searchId= + PartialBanner/ErrorBanner/CardSkeleton
provides:
  - Hook useRunPolling (polling 2500ms com parada em terminal/timeout-240/unmount, sem encerrar no servidor)
  - Helpers isTerminalStatus/runStatusLabel/formatDurationMs + testes 6/6
  - Tela run.tsx §7 (progresso por fonte + Cancelar só em polling + 4 banners de desfecho + repetir)
  - Tripwire estendido (7 telas) + rota Execução no Stack
affects: [07-04 cascata-historico, 08-resultados, 09-corpus-compare]

tech-stack:
  added: []
  patterns: [polling fixo 2500ms + teto 240 tentativas + 3 erros seguidos → erro com retry manual, cleanup de unmount limpa só o timer (D-08), blocos por fonte explícitos sem iteração (tripwire), 401 imediato no hook com redirect expired/next da tela]

key-files:
  created:
    - apps/lab/src/search/useRunPolling.ts
    - apps/lab/src/search/__tests__/runPolling.test.ts
    - apps/lab/app/project/[id]/run.tsx
  modified:
    - apps/lab/src/ui/__tests__/scroll-containers.test.ts
    - apps/lab/app/_layout.tsx

key-decisions:
  - "Hook expõe retry além dos 4 campos do plano (repetição manual imediata nas faixas de erro/timeout, sem auto-retry infinito)"
  - "401 vira 'error' imediato no hook (sem esperar 3 polls) para a tela redirecionar ao login sem delay"
  - "Efeito de auth da tela ignora quando expired=true (evita clobber do ?expired=1 pelo redirect duplo com o efeito de 401)"
  - "Repetir/Executar-novamente só renderiza com searchId presente; next pós-login carrega runId + searchId"

patterns-established:
  - "Polling de run: getRun imediato + setInterval fixo + para em terminal/teto/unmount; erro mantém último run e conta falhas seguidas"
  - "Tela de execução deriva tudo do SearchRunDTO do getRun (banner nunca presume 'ok'; loading mostra skeleton)"
  - "runId da query validado local (formato uuid) antes de qualquer request; inválido → banner local sem rede"

requirements-completed: [UI-14]

duration: 4min
completed: 2026-09-12
---

# Phase 7 Plan 03: Execução com acompanhamento Summary

**Polling automático do run (2500ms até terminal/timeout, sem encerrar no servidor) e tela de execução §7 com progresso por fonte, Cancelar só em polling e banners ok/parcial/falha/cancelada com repetir**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-09-12T00:32:17Z
- **Completed:** 2026-09-12T00:36:05Z
- **Tasks:** 2
- **Files modified:** 5 (3 criados, 2 modificados)

## Accomplishments

- User acompanha o run com progresso por fonte atualizando sozinho (BDTD/CAPES: "buscando…" → "N itens · Nms" / "pulada" / "falhou") e botão Cancelar visível só em polling, sem refresh manual (D-07, UI-14)
- User entende o desfecho pelos 4 banners: ok discreto / parcial âmbar (o que veio + o que faltou com motivo) / falha (motivo verbatim + Repetir com nova Idempotency-Key) / cancelada + Executar novamente (UI-14)
- User sai da tela no meio do run sem encerrar no servidor e ao voltar vê o estado atual (cleanup limpa só o timer; D-08)
- runId hostil (ausente/malformado) vira banner local "Execução inválida" sem request; 401 redireciona a expired/next preservando runId+searchId

## task Commits

Each task was committed atomically:

1. **task 1: hook useRunPolling + helpers testáveis** - `637b0ca` (feat)
2. **task 2: tela de execução com progresso, cancelar e banners** - `e585c41` (feat)

**Plan metadata:** (docs commit após STATE/ROADMAP, ver final_commit)

## Files Created/Modified

- `apps/lab/src/search/useRunPolling.ts` - `useRunPolling(runId, getToken)` + `isTerminalStatus`/`runStatusLabel`/`formatDurationMs` + constantes 2500ms/240 (zero `any`, `import type` do contrato)
- `apps/lab/src/search/__tests__/runPolling.test.ts` - Vitest puro sem rede/timers (6 testes: 6 status, 6 rótulos PT, duração 42s/—/em-andamento)
- `apps/lab/app/project/[id]/run.tsx` - Tela §7 (ScrollView raiz, cabeçalho, blocos por fonte explícitos, Cancelar, 4 banners, rodapé fase 8 + badge NOVOS)
- `apps/lab/src/ui/__tests__/scroll-containers.test.ts` - Tripwire estendido (run.tsx ScrollView + anti-map, 6 testes; asserções existentes intocadas)
- `apps/lab/app/_layout.tsx` - Registro `project/[id]/run` no Stack (título Execução; desvio documentado)

## Decisions Made

- Hook expõe `retry: () => void` além dos 4 campos do plano: as faixas de erro (3 falhas seguidas) e timeout exigem "Repetir manual = retry imediato" e remontar a rota seria mais frágil; aditivo, sem quebrar o contrato do plano.
- 401 vira `pollState: 'error'` imediato no hook em vez de contar 3 polls: repetir um request sem sessão só queima 5s e atrasa o redirect expired/next.
- Efeito de auth da tela pula quando `expired === true`: sem o guarda, o efeito de 401 (markExpired + replace com `expired=1`) e o efeito de user-null (replace só com `next`) disparariam no mesmo ciclo e o segundo apagaria o flag de sessão expirada.
- Repetir/Executar-novamente só renderiza com `searchId` presente (sem searchId não há como re-executar; a tela nunca inventa id); `next` pós-login carrega `runId + searchId` (o plano abrevia com `...`).
- Duração viva com `Date.now()` no render: cada poll re-renderiza a cada 2.5s, então o contador anda sozinho sem timer próprio.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registro da rota run no Stack do _layout**

- **Found during:** task 2 (tela run.tsx criada; strategies/search-form têm Screen explícito com título)
- **Issue:** O plano não incluía o registro da nova rota `project/[id]/run` — sem ele a tela funciona (file-based) mas sem título consistente no Stack.
- **Fix:** Adicionado `<Stack.Screen name="project/[id]/run" options={{ title: 'Execução' }} />` (só navegação, sem regra de negócio).
- **Files modified:** `apps/lab/app/_layout.tsx`
- **Verification:** `tsc --noEmit` exit 0; eslint exit 0
- **Committed in:** `e585c41` (parte do commit da task 2)

**2. [Rule 1 - Bug] Helper não usado quebrava o lint**

- **Found during:** task 2 (verify: `eslint .` 1 error)
- **Issue:** `sourceDisplayName` ficou sem uso (os blocos por fonte usam títulos BDTD/CAPES estáticos, exigência do anti-map) → `@typescript-eslint/no-unused-vars`.
- **Fix:** Removido o helper; blocos seguem explícitos e literais.
- **Files modified:** `apps/lab/app/project/[id]/run.tsx`
- **Verification:** eslint exit 0; tsc exit 0; vitest 32/32
- **Committed in:** `e585c41` (antes do commit da task 2)

**3. [Ajuste de gate, sem código] Critério `grep cancel == 0` do plano é insatisfatível pelo próprio plano**

- **Found during:** task 1 (verify)
- **Issue:** O critério exige `grep -c "cancelJob\|cancel" == 0`, mas o `<interfaces>` do plano obriga o literal de status `'cancelled'` e o rótulo PT `"cancelada"` — ambos contêm `cancel`. Qualquer implementação fiel falha o grep literal.
- **Fix:** Nenhuma mudança de código (implementação fiel mantida); invariante real provado separadamente: `grep -n "cancelJob"` retorna SÓ 2 comentários D-08 (nunca importado/chamado) e `grep -n "cancel("` retorna 0.
- **Files modified:** nenhum
- **Verification:** matches de `cancel` no hook: linhas 17/194 (comentários D-08) + 44 (literal `'cancelled'`) + 54 (rótulo `'cancelada'`); `cancel(` 0 ocorrências
- **Committed in:** n/a (documentação)

---

**Total deviations:** 2 auto-fixes de código (1 Rule 3, 1 Rule 1) + 1 ajuste de gate documentado (sem comportamento)
**Impact on plan:** Registro de rota e remoção de helper eram necessários para consistência/lint; nenhum scope creep (sem rota de API, tabela ou superfície nova; contrato intocado).

## Issues Encountered

- Nenhum bloqueio. Auth gates não ocorreram (401 tratado como expired/next do padrão 06-03/07-02; sem credencial manual necessária).

## Auditoria adversarial (AGENTS.md, antes de declarar concluído)

Arquivo por arquivo nos 5 tocados, cobrindo autorização decorativa, IDOR, confiança no navegador, segredos, XSS/input/upload/SSRF, sessões, webhooks, rate limit, SQL/command injection e isolamento:

- Autorização decorativa: guards seguem UX; nenhuma decisão de privilégio no client; cancelar/repetir passam pelo servidor owner-scoped; 401 → expired+next em todos os fluxos (poll, cancelar, repetir).
- IDOR: runId da query nunca autoriza nada no client; formato uuid validado localmente antes de qualquer request (inválido/alheio → banner local ou 404 genérico do servidor, sem distinguir "inexistente" de "alheio"); mensagens de erro exibidas verbatim do envelope.
- Navegador/storage: nenhum `localStorage`, role/owner em storage, segredo em bundle/código/Git/logs; token só via `getToken` injetado; `next` construído internamente (`/project/<id>/run?...`), sem open redirect; grep confirma zero `console.`/`localStorage`/`Math.random`/`eval(` nos arquivos do plano.
- Input/XSS: runId/searchId validados (uuid); `termSnapshot` e `error.message` renderizados em `Text` (RN escapa por padrão); sem WebView/innerHTML/eval/new Function.
- Sessões/webhooks/SQL: sem sessão própria, sem webhook, sem SQL no app (só CORE via fetch tipado + `unknown`/narrowing; ids via `encodeURIComponent` no client existente).
- Rate limit/DoS: polling fixo 2500ms + teto 240 + para em terminal + máx 3 erros seguidos com retry só manual (T-07-03-01); botões Cancelar/Repetir desabilitados durante busy (sem duplo-tap); repetir usa Idempotency-Key única por toque via `globalThis.crypto.randomUUID()` (sem `Math.random`); 429 verbatim sem auto-retry.
- Resultado: 0 crit / 0 high no escopo do plano. Gates: typecheck lab exit 0, eslint lab exit 0, vitest 32/32 (runPolling 6/6 + tripwire 6/6), zero `any`, contrato intocado (0 dependências novas). `pnpm audit --prod`: 4 vulns (2 moderate + 2 high) em deps transitivas de toolchain pré-existentes — idênticas às da 07-02, plano adiciona 0 dependências. Gitleaks/SAST sem binário local — CI cobre (como na 07-01/07-02).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pronto para 07-04 (cascata + histórico expansível): runs listados por card (07-02) agora abrem execução acompanhada; repetir gera run novo que aparece no histórico.
- Pronto para 08-resultados: rodapé terminal com placeholder honesto "Resultados — lista de itens na fase 8" + badge `N NOVOS` (métrica já disponível, lista chega na fase 8).
- Fluxo manual a provar em beta: Executar → progresso por fonte move sozinho → Cancelar muda para cancelada; run parcial mostra âmbar com o que faltou; sair no meio e voltar retoma o estado (sem novo run).

---

*Phase: 07-projetos-buscas-execucao*
*Completed: 2026-09-12*

## Self-Check: PASSED

- FOUND: apps/lab/src/search/useRunPolling.ts
- FOUND: apps/lab/src/search/__tests__/runPolling.test.ts
- FOUND: apps/lab/app/project/[id]/run.tsx
- FOUND: .planning/phases/07-projetos-buscas-execucao/07-03-SUMMARY.md
- FOUND: 637b0ca
- FOUND: e585c41
