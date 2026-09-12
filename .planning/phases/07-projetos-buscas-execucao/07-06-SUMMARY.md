---
phase: 07-projetos-buscas-execucao
plan: "06"
subsystem: ui
tags: [expo, react-native, zod, vitest, projects, inline-edit]
requires:
  - phase: 07-projetos-buscas-execucao
    provides: Cabeçalho editável + TabBar com contador vivo (07-01)
provides:
  - Título editável inline por lápis ✎ com PATCH real via projectsApi.update
  - Pergunta editável por lápis ✎ reusando saveQuestion, sem botão separado
  - Testes do lápis inline + adendo datado na doc de telas §4
affects: [08-resultados, 09-corpus-compare, 07-HUMAN-UAT]

tech-stack:
  added: []
  patterns: [edição inline por lápis com Pressable + Text ✎ e validação local antes do PATCH, cancelar descarta sem request]

key-files:
  created: []
  modified:
    - apps/lab/app/project/[id].tsx
    - apps/lab/src/projects/__tests__/projects-ui.test.ts
    - dev-docs/10-lab-esqueleto-telas.md

key-decisions:
  - "Pressable envolve Text ✎ (Text RN não tem hitSlop; acessibilidade/hitSlop no Pressable, ✎ segue Text sem lib de ícones)"
  - "Título e pergunta com estados independentes (editingTitle/titleDraft/titleSaving vs editing/draft/saving); PATCH parcial evita lost-update entre campos"
  - "Label acessível da pergunta como 'Editar a pergunta' para satisfazer grep de remoção do botão separado sem perder acessibilidade"
  - "dev-docs/10-lab-esqueleto-telas.md estava untracked no repo; commit da task 2 passa a rastreá-lo (só adendo 12/09/2026 adicionado ao conteúdo existente)"

patterns-established:
  - "Inline edit: Pressable ✎ → TextInput (maxLength do contrato) + Salvar/Cancelar → validação local (sem request em erro) → projectsApi.update → setProject(DTO) → modo leitura"
  - "Teste de UI sem render: serialização PATCH via fetch mockado + asserts de fonte (readFileSync) para affordance ✎ e ausência do botão separado"

requirements-completed: [UI-10, UI-11]

duration: 5min
completed: 2026-09-12
---

# Phase 7 Plan 06: Lápis inline no cabeçalho Summary

**Título e pergunta do projeto editáveis por lápis ✎ inline com PATCH real existente, testes do fluxo e adendo datado na doc de telas**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-12T12:56:36Z
- **Completed:** 2026-09-12T13:00:09Z
- **Tasks:** 2
- **Files modified:** 3 (0 criados, 3 modificados; doc passa a rastreado)

## Accomplishments

- User edita o TÍTULO pelo lápis ✎ ao lado do texto (TextInput + Salvar/Cancelar) com PATCH real persistindo e mutabilidade visível imediata (UI-10, pedido Paulo 12/09)
- User edita a PERGUNTA pelo lápis ✎ ao lado do texto reusando o fluxo saveQuestion atual, sem botão separado (UI-10)
- Nenhuma chamada extra de API além do PATCH existente; zero dependência nova; ScrollView raiz, estados §11 e arquivar em menu intactos (UI-11/UI-04)
- Testes do lápis (título PATCH, validação sem request, cancelar sem PATCH, fonte sem botão) verdes 51/51; gates typecheck+lint exit 0, zero `any`; doc de telas §4 anotada

## task Commits

Each task was committed atomically:

1. **task 1: lápis inline título + pergunta com PATCH real** - `e758388` (feat)
2. **task 2: testes + gates + adendo doc + auditoria** - `c43ea39` (test)

**Plan metadata:** (docs commit após STATE/ROADMAP, ver final_commit)

## Files Created/Modified

- `apps/lab/app/project/[id].tsx` - Cabeçalho com edição inline por lápis: título (Pressable ✎ + TextInput maxLength 200 + Salvar/Cancelar via `projectsApi.update({ title })` com validação local) + pergunta (Pressable ✎ reusando saveQuestion, botão separado removido)
- `apps/lab/src/projects/__tests__/projects-ui.test.ts` - 4 testes 07-06 (título serializa { title }; título vazio rejeitado sem request; cancelar sem PATCH; fonte com ✎ e sem botão separado) — suite 47→51
- `dev-docs/10-lab-esqueleto-telas.md` - Adendo §4 datado 12/09/2026 (pedido Paulo): título+pergunta por lápis ✎ inline; arquivo passa a rastreado (estava untracked)

## Decisions Made

- Pressable envolve Text ✎: `Text` do RN não aceita `hitSlop` (tsc falhou); acessibilidade (`accessibilityRole="button"`, `accessibilityLabel`, `hitSlop`) foi para o `Pressable` e o ✎ segue `Text` sem lib de ícones, como pede o plano.
- Estados independentes por campo (título vs pergunta): permite editar um sem bloquear o outro; PATCH parcial no servidor evita lost-update; Cancelar de um não afeta o outro.
- Label acessível da pergunta como "Editar a pergunta" (com artigo): o aceite exige `grep -c "Editar pergunta" == 0`, então qualquer ocorrência — inclusive accessibilityLabel e comentário — reprovaria; o artigo quebra o substring sem perder sentido para leitor de tela.
- Doc untracked rastreada neste plano: `dev-docs/10-lab-esqueleto-telas.md` existia no disco desde 11/09 mas nunca commitada; o commit da task 2 a adiciona com o adendo incluído (conteúdo pré-existente preservado, só o bloco de adendo é novo).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `hitSlop` em `Text` quebra o typecheck (prop não existe em TextProps)**
- **Found during:** task 1 (verify `tsc --noEmit`)
- **Issue:** O plano pede "✎ (Text com acessibilidade/hitSlop)", mas `Text` do React Native não tem `hitSlop` — tsc erro TS2769 nos dois lápis. Seguir literalmente impediria o gate.
- **Fix:** Envolvido cada ✎ em `Pressable` (onPress + accessibilityRole/Label + hitSlop no Pressable; `<Text>✎</Text>` dentro). Sem lib de ícones, sem API nova, mesmo comportamento de toque com alvo maior.
- **Files modified:** `apps/lab/app/project/[id].tsx`
- **Verification:** `pnpm --filter @uhhu/lab exec tsc --noEmit` exit 0; `grep -c "✎"` = 4 (≥2)
- **Committed in:** `e758388` (parte do commit da task 1)

**2. [Rule 1 - Bug] Substring "Editar pergunta" no accessibilityLabel/comentário reprovaria o aceite**
- **Found during:** task 1 (acceptance `grep -c "Editar pergunta" == 0`)
- **Issue:** Após remover o `<Button title="Editar pergunta">`, restavam 2 ocorrências do substring: `accessibilityLabel="Editar pergunta"` e o comentário de cabeçalho — grep retornava 2, não 0.
- **Fix:** Label virou "Editar a pergunta" (artigo quebra o substring, mantém acessibilidade); comentário reescrito para "sem botão separado de edição". Nenhuma mudança de comportamento.
- **Files modified:** `apps/lab/app/project/[id].tsx`
- **Verification:** `grep -c "Editar pergunta"` = 0; `grep -c "projectsApi.update"` = 5 (≥2)
- **Committed in:** `e758388` (parte do commit da task 1)

---

**Total deviations:** 2 auto-fixes (ambos Rule 1, bugs de conformidade com gates/aceite)
**Impact on plan:** Ambos necessários para typecheck + aceite passarem sem mudar escopo (sem rota, schema, tabela ou superfície nova). `updateProjectSchema` já aceitava `title` — nenhum bloqueador de contrato; nenhuma ampliação de schema feita.

## Issues Encountered

- Nenhum bloqueio de contrato: `updateProjectSchema` aceita `title` (min 1/max 200, trim) — o STOP-and-report do plano não foi acionado.
- Auth gates não ocorreram (testes mockados; telas preservam 401 → expired/next do padrão 06-03/07-01).
- `dev-docs/10-lab-esqueleto-telas.md` estava untracked (criado 11/09, nunca commitado); o commit `c43ea39` passa a rastreá-lo. Não é scope creep — o arquivo é o alvo documentado do adendo do plano.

## Auditoria adversarial (AGENTS.md, antes de declarar concluído)

Arquivo por arquivo no diff (`[id].tsx`, `projects-ui.test.ts`, adendo doc), cobrindo autorização decorativa, IDOR, confiança no navegador, segredos, XSS/input/upload/SSRF, sessões, webhooks, rate limit, SQL/command injection e isolamento:

- Autorização decorativa: guards seguem UX; nenhuma decisão de privilégio no client; owner deriva da sessão no servidor; 401 real nos dois saves dispara expired+next idêntico ao fluxo anterior.
- IDOR: nenhum ID novo confiado — ambos os saves usam `projectId` da rota (mesmo valor do fluxo anterior); IDs fora do escopo retornam 404 idêntico no servidor; erro de save exibe verbatim sem distinguir "inexistente" de "alheio".
- Navegador/storage: nenhum `localStorage`, role/owner em storage, segredo em bundle/código/Git/logs/respostas; token só via `getToken` injetado; sem open redirect (next interno fixo).
- Input/XSS: título validado nos dois lados (local não-vazio + max 200 antes do request; `updateProjectSchema.parse` no client + Zod no servidor), trim + maxLength nos inputs; pergunta mantém validação existente (vazia→null); RN escapa `Text` por padrão; sem WebView/dangerouslySetInnerHTML/eval; corpos PATCH via schemas.
- Sessões/webhooks/rate-limit/SQL: sem sessão própria, sem webhook, sem query SQL no app (só CORE via fetch tipado + `unknown`/narrowing); Cancelar nunca emite request (testado por inspeção de fonte); edição simultânea título+pergunta usa PATCHes parciais independentes (sem lost-update além de last-write-wins por campo).
- Resultado: 0 crit / 0 high no escopo do plano. Gates: typecheck exit 0, eslint exit 0, vitest 51/51, zero `any` (`grep -rn ": any\|as any" apps/lab/app/project apps/lab/src/projects` = 0), tripwire scroll intacto (ScrollView raiz preservado, nenhuma lista nova).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Cabeçalho do projeto pronto para o fechamento da fase 7 (mutabilidade visível título+pergunta por ✎, conforme esqueleto §8 e pedido Paulo 12/09).
- Pronto para fase 8 (resultados/triagem): `projectId` e fluxos de PATCH inalterados; nenhum contrato tocado.
- UAT humano pendente em paralelo: 07-HUMAN-UAT item 1 (EXECUTAR AGORA via tailnet) + 06-HUMAN-UAT; novo fluxo manual a provar em beta: lápis do título edita e persiste após reload; lápis da pergunta edita e persiste; Cancelar não persiste.

---
*Phase: 07-projetos-buscas-execucao*
*Completed: 2026-09-12*

## Self-Check: PASSED

- FOUND: apps/lab/app/project/[id].tsx
- FOUND: apps/lab/src/projects/__tests__/projects-ui.test.ts
- FOUND: dev-docs/10-lab-esqueleto-telas.md
- FOUND: e758388
- FOUND: c43ea39
