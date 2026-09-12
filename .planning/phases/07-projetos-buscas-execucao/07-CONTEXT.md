# Phase 7: Projetos, buscas e execução - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

## Phase Boundary

Fase 7 entrega o miolo do slice vertical: CRUD de projetos na UI, lista de estratégias, formulário de busca fiel ao §6, execução com acompanhamento de run (polling) e histórico por estratégia — tudo contra o CORE existente, sem mudar contrato (nenhuma migration). Comparação (fase 9) e resultados/triagem (fase 8) ficam de fora; o run concluído desemboca num placeholder de resultados que a fase 8 constrói.

## Implementation Decisions

### Acompanhamento de execução
- **D-07:** Polling automático na tela de execução: progresso por fonte atualizando sozinho, botão Cancelar visível. Sem refresh manual.
- **D-08:** Sair da tela não abandona o run (vive no servidor): voltar mostra o estado atual; concluído exibe os resultados (placeholder fase 8). Sem "abandonar acompanhamento".

### Formulário de busca
- **D-09:** Termos em linhas adicionáveis com seletor AND/OR/NOT entre elas, fiel ao esqueleto §6. Sem campo de expressão livre.
- **D-10:** Filtros completos do §6 (ano, tipo, área/instituição/programa, fontes BDTD/CAPES) + selo "filtro garantido pelo Core" + status das fontes visível antes de executar. Salvar ≠ Executar mantido (dois CTAs).

### Histórico de runs
- **D-11:** Histórico mora como expansível dentro do card de cada estratégia (não é quarta aba — resolve a ambiguidade esqueleto §1 vs §4; 3 abas mantidas).
- **D-12:** Cada entrada mostra data/hora, status, total, novos desde o anterior, duração; parcial mostra o que faltou. Entrada toca para abrir os resultados do run (placeholder fase 8).

### Criar/gerir projeto
- **D-13:** Criar projeto via modal (título + pergunta), valida e volta à lista atualizada. Habilita o CTA hoje desabilitado na lista.
- **D-14:** Editar pergunta inline no cabeçalho do projeto (toque edita, salva); arquivar/reativar em menu do cabeçalho e da lista. Sem tela de configurações.

### OpenCode's Discretion
- Intervalo de polling e backoff, timeout de acompanhamento, paginação da lista de estratégias e do histórico, layout exato do modal e do expansível, mensagens de erro de validação do form, e divisão interna dos planos — respeitando TS strict, contratos em definição única, `any` proibido, estados §11 e scroll FlatList/ScrollView (lições da fase 6).

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Esqueleto e spec
- `dev-docs/10-lab-esqueleto-telas.md` §3 (lista/criar/arquivar projetos), §4 (cabeçalho + 3 abas), §5 (cards de estratégia + excluir com aviso), §6 (formulário completo), §7 (banner de run ok/parcial/falha + progresso por fonte + cancelável), §11 (estados) — contrato visual da fase
- `dev-docs/03-lab-spec-v1.md` §4 (UC-01/02/03/09), §5 (rotas searches/runs) — capacidades do CORE a consumir (já existem; sem mudança)

### Contrato e decisões
- `dev-docs/07-core-contract.md` §11.2 (rotas lab searches/runs/jobs), §14 (jobs: queued/running/terminal) — polling do app espelha estes estados
- `.planning/phases/03-buscas-e-adapters/03-CONTEXT.md` — D-28/D-30 (sync 25s→201, senão 202+polling Job=Run), D-39 (idempotência 24h, 10 runs/h)
- `.planning/phases/06-fundacao-app-auth-suporte-core/06-CONTEXT.md` — D-01..D-06 (auth, beta, Expo Go/Android, allowlist CORS)

### Código existente (integração)
- `apps/lab/app/projects.tsx` (FlatList + CTA criar desabilitado — habilitar), `apps/lab/app/project/[id].tsx` (cabeçalho + abas placeholder — construir Estratégias), `apps/lab/src/api/lab.ts` + `projects.ts` (client tipado — estender com searches/runs)
- `apps/core-api/src/routes/lab.ts` (rotas searches/runs/jobs existentes), `packages/contracts/src/lab.ts` (SearchDTO/RunDTO — definição única)

## Existing Code Insights

### Reusable Assets
- `projectsApi` + `labApi` (client tipado fase 6): estender com `searchesApi` (list/create/update/delete/run) e `runsApi` (get/list/poll/cancel) nos mesmos moldes (getToken, ApiError, paginação cursor)
- `Empty`/`ErrorBanner`/`CardSkeleton`/`PartialBanner` + tripwire `scroll-containers.test.ts`: toda tela/lista nova já nasce com estados §11 e contêiner rolável
- `useAuth` (getToken, markExpired, next): execução e forms herdam expiração com retorno

### Established Patterns
- Tela = ScrollView raiz / lista = FlatList; estados vazio/loading/erro-com-repetir por padrão; guards UX, auth no servidor
- Polling do CLI/MCP (fase 5, D-56: espera 25s + polling job): o app espelha a mesma máquina de estados, com progresso por fonte na UI

### Integration Points
- `POST /api/v1/lab/searches/:id/runs` (Idempotency-Key por execução), `GET .../runs` (histórico), `GET /api/v1/jobs/:id` ou run-get (polling), `DELETE /api/v1/lab/searches/:id` (diálogo de cascata com contagens da API), `POST/PATCH /api/v1/projects` (modal criar, inline editar, arquivar)

## Specific Ideas

No specific requirements — open to standard approaches.

## Deferred Ideas

None — discussion stayed within phase scope (quarta aba de histórico rejeitada em favor do expansível, D-11).

---

*Phase: 7-Projetos, buscas e execução*
*Context gathered: 2026-09-11*
