---
phase: 07-projetos-buscas-execucao
plan: "01"
subsystem: ui
tags: [expo, react-native, zod, vitest, projects, modal, tabbar]
requires:
  - phase: 06-fundacao-app-auth-suporte-core
    provides: FlatList/ScrollView + estados §11 + projectsApi/labApi tipados + tripwire scroll-containers
provides:
  - ProjectModal reutilizável com validação Zod client-side
  - Lista de projetos gerenciável (criar/arquivar/reativar + filtro Ativos/Arquivados + contagem leve de buscas)
  - Cabeçalho de projeto editável inline + TabBar de 3 abas com contador vivo do corpus
  - Helper formatCorpusCount + testes de serialização PATCH sem rede
affects: [07-02 estrategias, 07-03 execucao, 07-04 cascata-historico, 08-resultados, 09-corpus-compare]

tech-stack:
  added: []
  patterns: [Modal criar via schema compartilhado + onCreated insere no topo sem refetch, PATCH status para arquivar/reativar sem tela de config, contador vivo sem total no servidor (items.length + "+" se hasMore), erro de enriquecimento omite a linha sem quebrar a tela]

key-files:
  created:
    - apps/lab/src/ui/ProjectModal.tsx
    - apps/lab/src/projects/counts.ts
    - apps/lab/src/projects/__tests__/projects-ui.test.ts
  modified:
    - apps/lab/app/projects.tsx
    - apps/lab/app/project/[id].tsx
    - packages/contracts/src/projects.ts

key-decisions:
  - "ProjectModal recebe getToken opcional por prop (fallback sem token no web cookie); onCreated insere no topo só quando o status combina com o filtro"
  - "Contagem por card via labApi.listSearches com cache por mount (Set em ref); erro omite a linha; elegíveis fora (UI-23/fase 9)"
  - "updateProjectSchema no update aceita researchQuestion/description null para limpar (alinhado a DTO + lib do servidor)"
  - "Comparação segue botão disabled com hint fase 9 (fora deste plano); TabBar ativa via prop opcional activeTab default none"

patterns-established:
  - "Criar via modal: createProjectSchema.parse no submit + primeira mensagem flatten em vermelho + ApiError verbatim com requestId"
  - "Arquivar/reativar = PATCH { status } + remove da lista do filtro atual; erro verbatim por card sem trocar a tela por erro global"
  - "Contador vivo = getCorpus limit 100 -> formatCorpusCount(items.length, hasMore); falha -> rótulo sem número"

requirements-completed: [UI-09, UI-10, UI-11]

duration: 5min
completed: 2026-09-12
---

# Phase 7 Plan 01: Projetos na UI Summary

**Modal criar-projeto com validação Zod, lista FlatList com arquivar/reativar + filtro e contagem de buscas, e cabeçalho editável com TabBar de 3 abas e Corpus vivo via getCorpus**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-12T00:17:45Z
- **Completed:** 2026-09-12T00:22:39Z
- **Tasks:** 2
- **Files modified:** 6 (3 criados, 3 modificados)

## Accomplishments

- User cria projeto via modal (título + pergunta) e a lista atualiza no topo sem reload manual (D-13, UI-09, UI-10)
- User edita a pergunta inline no cabeçalho e arquiva/reativa por menu/cabeçalho sem tela de configurações (D-14, UI-10)
- User navega por 3 abas (Estratégias / Comparação disabled fase 9 / Corpus com contador vivo) sem perder posição (UI-11)
- Testes de serialização PATCH (pergunta vazia → null, arquivar → status) + formatCorpusCount verdes; tripwire de scroll intacto (13/13 no app)

## task Commits

Each task was committed atomically:

1. **task 1: ProjectModal + lista de projetos gerenciável** - `1965da1` (feat)
2. **task 2: cabeçalho editável + TabBar com contador vivo + testes** - `4817ef0` (feat)

**Plan metadata:** (docs commit após STATE/ROADMAP, ver final_commit)

## Files Created/Modified

- `apps/lab/src/ui/ProjectModal.tsx` - Modal criar projeto com validação Zod client-side (createProjectSchema import + parse)
- `apps/lab/app/projects.tsx` - Lista com criar/arquivar/reativar + filtro Ativos/Arquivados + contagem leve + estados §11 em FlatList
- `apps/lab/app/project/[id].tsx` - Cabeçalho editável + TabBar de 3 abas + contador vivo do corpus
- `apps/lab/src/projects/counts.ts` - Helper formatCorpusCount(itemCount, hasMore)
- `apps/lab/src/projects/__tests__/projects-ui.test.ts` - Vitest sem rede (2 serializações PATCH + 2 asserts de contador)
- `packages/contracts/src/projects.ts` - update aceita researchQuestion/description null (desvio documentado)

## Decisions Made

- ProjectModal recebe `getToken` opcional por prop (web usa cookie sem token); `onCreated` insere no topo só quando o status combina com o filtro atual (criado active não invade a visão Arquivados).
- Contagem por card usa `labApi.listSearches(project.id, { limit: 100 })` com cache por mount (`Set` em ref, um fetch por projeto); erro de contagem omite a linha e nunca quebra a lista; nº de elegíveis fora (UI-23, fase 9, com comentário no código).
- Comparação segue botão disabled com hint "disponível na fase 9" (decisão do plano; fora deste slice); aba ativa via prop opcional `activeTab` (default `none` nesta tela).
- Contrato de update widened para nullable nos dois campos de texto (ver Desvios); título continua não-nulo; `referenceSearchId` inalterado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] updateProjectSchema rejeitava `{ researchQuestion: null }` e impedia limpar a pergunta**

- **Found during:** task 2 (cabeçalho editável + testes)
- **Issue:** O plano manda Salvar com `{ researchQuestion: value.trim().length > 0 ? value.trim() : null }` e o teste (a) exige `{ researchQuestion: null }` no body do PATCH, mas `updateProjectSchema = createProjectSchema.partial()` tipava `researchQuestion?: string` (sem null) — `projectsApi.update` faz `parse` antes do fetch, então null falhava no client com ZodError e nunca chegava ao PATCH. O servidor já suportava null (`apps/core-api/src/lib/projects.ts` aceita `researchQuestion?: string | null` e persiste/limpa; DTO é `string | null`).
- **Fix:** Reescrito o `updateProjectSchema` como objeto explícito mantendo as mesmas regras do create (title min/max, trims) mas com `researchQuestion`/`description` como `.nullable().optional()` só no update; create NÃO aceita null (inalterado). Backward-compatible (só alarga aceitação; nada antes válido vira inválido) e sem migration.
- **Files modified:** `packages/contracts/src/projects.ts`
- **Verification:** `pnpm --filter @uhhu/contracts run typecheck` exit 0; `pnpm --filter @uhhu/core-api exec tsc` exit 0; novo teste (a) passa com null no body; suite lab 13/13.
- **Committed in:** `4817ef0` (parte do commit da task 2)

**2. [Comando de verificação do plano com path errado] eslint via --filter com path raiz**

- **Found during:** task 1 (verify)
- **Issue:** O comando do plano `pnpm --filter @uhhu/lab exec eslint apps/lab/src/ui/ProjectModal.tsx ...` falha com "No files matching" porque, sob `--filter`, o cwd do pacote já é `apps/lab` (paths devem ser relativos ao pacote).
- **Fix:** Executado o equivalente correto `pnpm --filter @uhhu/lab exec eslint src/ui/ProjectModal.tsx app/projects.tsx ...` (mesmos arquivos, path relativo ao pacote). Typecheck do plano funcionou como escrito.
- **Files modified:** nenhum (só invocação)
- **Verification:** eslint exit 0 nos 5 arquivos do plano
- **Committed in:** n/a (sem mudança de código)

---

**Total deviations:** 1 auto-fix de código (Rule 1) + 1 ajuste de invocação de gate (sem código)
**Impact on plan:** O fix de contrato era necessário para a corretude do "limpar pergunta" e já refletia DTO + servidor; nenhum scope creep (sem rota, tabela ou superfície nova).

## Issues Encountered

- Nenhum bloqueio. Auth gates não ocorreram (testes mockados; telas preservam 401 → expired/next do padrão 06-03/06-04).

## Auditoria adversarial (AGENTS.md, antes de declarar concluído)

Arquivo por arquivo nos 6 tocados, cobrindo autorização decorativa, IDOR, confiança no navegador, segredos, XSS/input/upload/SSRF, sessões, rate limit, SQL/command injection e isolamento:

- Autorização decorativa: guards seguem UX; nenhuma decisão de privilégio no client; ownerId deriva do ator no servidor; 401 real dispara expired+next.
- IDOR: IDs fora do escopo retornam 404 idêntico no servidor; app trata 404 como "não encontrado" genérico sem distinguir "inexistente" de "alheio"; pertencimento application-level preservado.
- Navegador/storage: nenhum `localStorage`, role/owner em storage, segredo em bundle/código/Git/logs/respostas; token só via `getToken` injetado (web cookie httpOnly, nativo SecureStore); `next` interno fixo (`/projects`, `/project/<id>`), sem open redirect.
- Input/XSS: título/pergunta validados com Zod nos dois lados (client UX + servidor), trim + maxLength nos inputs; RN escapa `Text` por padrão; sem WebView/dangerouslySetInnerHTML/eval; corpos PATCH via `parse` dos schemas.
- Sessões/webhooks/rate-limit/SQL: sem sessão própria, sem webhook, sem query SQL no app (só CORE via fetch tipado + `unknown`/narrowing); erro de enriquecimento (contagens) nunca decide elegibilidade nem quebra a tela.
- Resultado: 0 crit / 0 high no escopo do plano. Gates: typecheck lab + contracts + core-api exit 0, eslint exit 0, vitest 13/13, zero `any` nos arquivos do plano, tripwire scroll intacto (FlatList em projects, ScrollView em [id], nenhum `.map(` fora de FlatList/renderItem).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pronto para 07-02 (cards de estratégia + formulário §6): projetos existem na UI com IDs reais; `labApi.listSearches` já usado para contagem leve (o formulário usará create/update).
- Comparação (hint fase 9) e elegíveis do corpus (UI-23) seguem fora, por desenho.
- Fluxo manual a provar em beta: criar via modal → aparece no topo; arquivar some de Ativos e aparece em Arquivados; pergunta edita e persiste após reload; Corpus mostra N vivo.

---
*Phase: 07-projetos-buscas-execucao*
*Completed: 2026-09-12*

## Self-Check: PASSED

- FOUND: apps/lab/src/ui/ProjectModal.tsx
- FOUND: apps/lab/app/projects.tsx
- FOUND: apps/lab/app/project/[id].tsx
- FOUND: apps/lab/src/projects/counts.ts
- FOUND: apps/lab/src/projects/__tests__/projects-ui.test.ts
- FOUND: 1965da1
- FOUND: 4817ef0
