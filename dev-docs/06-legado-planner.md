# UhHu! — Herança do Planner-Docente (referência DEV)

> Estado: referência (09/09/2026). O antigo **UhHu! Planner Docente** é o
> ancestral de DOIS apps da suite. A codebase vive em
> `/projetos/UhHu/planner-docente` (repo privado `planner-docente`, clonado via
> gh) e o schema extraído do Supabase em `/projetos/UhHu/supabase-legacy-export`.
>
> **Reescrita NÃO iniciada** (ordem de Paulo: só pesquisa). Este documento é o
> mapa do que herdar e do que não copiar.

## 1. Divisão da herança

| App herdeiro | Herda do Planner-Docente |
|---|---|
| **UhHu! Plan** | Calendário acadêmico (calendarios_academicos, unidades), horários (horarios, turnos), **integração Google Calendar** (aulas.google_calendar_event_id; profiles.is_google_calendar_connected + refresh token; edge functions google-calendar-sync / google-calendar-disconnect) |
| **UhHu! Prof** | Escolas, turmas, disciplinas, conteúdos, geração de aulas com validação de conflito, modelos de aula, sequências didáticas, tarefas por disciplina, biblioteca de arquivos |

Fato validado por extração do Supabase (09/09): **a integração Google Calendar
já existia e funcionava** (OAuth2 refresh token → eventos em `aulas`). Isso
reduz o risco do Plan: o padrão OAuth Google já foi implementado uma vez.

## 2. Stack legada (para não repetir)

- React 19 + Vite 7 (JavaScript, sem TS) + React Router 7 + Supabase (auth,
  Postgres, storage) + TanStack Query + TipTap + geração .docx no cliente +
  deploy Vercel.
- Frontend sem TS; lógica de negócio acoplada à UI (services Supabase direto
  dos componentes); sem camada de API própria — o oposto do padrão UhHu! CORE.

## 3. Schema legado (17 tabelas public — referência de migração)

`escolas` · `turmas` · `disciplinas` · `conteudos` · `turnos` · `aulas` ·
`sequencias_didaticas` · `sequencia_aulas` · `tarefas` · `tarefas_arquivos` ·
`calendarios_academicos` · `unidades` · `horarios` · `arquivos` ·
`aulas_arquivos` · `profiles` · (mais storage/auxiliares)

Funções SQL relevantes: `handle_new_user` (trigger auth), `apagar_todas_aulas`,
`reset_user_data`, `create_task_and_template`, `find_or_create_conteudo`,
`import_modelo_to_aula`.

RLS: padrão uniforme `auth.uid() = user_id` (espelha a decisão de ownerId do CORE).

Storage: bucket `arquivos_usuarios` (privado), 12 objetos reais de teste/prova
— pode alimentar dados de exemplo (com autorização do dono).

## 4. Funcionalidades centrais a preservar (para as specs futuras)

- **Onboarding em 4 passos** (disciplinas → escolas → turmas → gerar aulas com
  preview de horário).
- CRUD de escolas/turmas/disciplinas/conteúdos/turnos; calendário acadêmico por
  escola; autocomplete de entidades.
- **Geração automática de aulas** com `checkScheduleConflict` e
  `validateHorariosVsTurno` (lógica de conflito é o coração do Prof).
- Modelos de aula (salvar/aplicar), sequências didáticas (criar/importar).
- Tarefas por disciplina: modelo → instância por aula → status.
- Biblioteca/repositório de arquivos vinculados (aula/tarefa).
- Exportação .docx: plano de curso, plano de aula, aula única.
- Dashboard: dados por usuário, aulas por mês, avaliações por unidade.
- Integração Google Calendar (conectar/desconectar/sincronizar aula→evento).

## 5. Lições do legado — o que NÃO copiar

- Supabase Auth/RLS/Storage/Edge Functions como plataforma.
- Refresh token em coluna simples de `profiles` → cifrado no CORE (módulo de
  integração), com rotação.
- `aulas.google_calendar_event_id` acoplado ao modelo de aula → no novo modelo,
  aula (Prof) e evento externo (Plan/integrations) são entidades com vínculo
  explícito; Prof funciona mesmo sem Google conectado.
- Schema sem migrations versionadas → migrations no monorepo desde o início.
- Frontend sem TS e com acesso direto ao banco → tudo atrás do CORE API.

## 6. Referência de arquivos

- Código legado: `/projetos/UhHu/planner-docente`
- Export do schema/edge functions: `/projetos/UhHu/supabase-legacy-export`
  (schema_*.json, auth_config.json, storage_buckets_api.json, edge-functions/*)
- Inventário detalhado no vault: `UhHu_Prof_Inventario_Codebase_2026-09-09.md`
- Visão da suite no vault: `UhHu_Suite_Visao_2026-09-09.md`

## 7. Próximo passo (documental, não iniciar código)

Quando Paulo autorizar: extrair as features acima em spec do Prof (e do Plan),
com o schema legado como material de pesquisa e o ADR-009 como arquitetura-alvo.
