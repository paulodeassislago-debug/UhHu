---
tags:
  - uhhu
  - prof
  - planner-docente
  - inventario
  - pesquisa
date: 2026-09-09
status: pesquisa (sem decisão de reescrita)
tipo: inventário de codebase legada
---

# UhHu! Prof — Inventário da codebase legada (planner-docente)

> **Escopo autorizado por Paulo (09/09/2026): SÓ PESQUISA.** Nenhuma linha de
> reescrita. Este documento é o inventário da codebase antiga do UhHu! Prof
> (ex-UhHu! Planner Docente) para futura extração de funcionalidades.

## 1. Localização e acesso

- Repo (GitHub, **privado**): `github.com/paulodeassislago-debug/planner-docente`
- Descrição: "Aplicação de planejamento para professores"
- Último push: 2025-08-20 (12 commits)
- Clone na VPS: `/projetos/UhHu/planner-docente`
- Acesso: gh CLI autenticado (conta paulodeassislago-debug) — instalado 09/09/2026

## 2. Stack observada

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 7 (JavaScript, não TS) + React Router 7 |
| Dados | **Supabase** (auth + Postgres + storage) via `@supabase/supabase-js` |
| Estado/requisições | TanStack React Query 5 |
| Editor | TipTap 3 (starter-kit) |
| Exportação | `docx` (geração de .docx no cliente) + file-saver |
| UI | CSS modules + react-modal + react-toastify |
| Deploy | Vercel (`vercel.json` com rewrite SPA) |

## 3. Modelo de dados observado (tabelas Supabase citadas nos services)

`escolas` · `turmas` · `disciplinas` · `conteudos` · `turnos` ·
`aulas` · `sequencias_didaticas` · `sequencia_aulas` · `tarefas` ·
`calendarios_academicos` · `arquivos` · `aulas_arquivos`

**Sem migrações SQL no repo** (`.temp` apenas) → o schema vive no projeto
Supabase, não versionado. Isso é um risco de reescrita a registrar.

## 4. Funcionalidades por área (extraídas do código)

### Onboarding (wizard 4 passos)
1. Disciplinas → 2. Escolas → 3. Turmas → 4. Gerar aulas (com preview de horário).
`OnboardingCheck` bloqueia o app até completar. (Supabase auth UI: email+senha e
Google provider.)

### Escolas / Turmas / Disciplinas
- CRUD de escolas, turmas, turnos por escola, disciplinas, conteúdos por disciplina.
- Calendário acadêmico por escola (feriados/eventos).
- Autocomplete para entidades relacionadas.

### Aulas
- Geração de aulas (automática) por turma e por escola.
- Modelos de aula (salvar aula como modelo; aplicar modelo a aula).
- Sequências didáticas (criar, importar sequência, aulas da sequência).
- **Validação de conflito de horário** (`checkScheduleConflict`) e
  validação de horários contra turno (`validateHorariosVsTurno`).
- Edição de aula (TipTap), anexar/desanexar arquivos, exclusão em lote.

### Tarefas
- Modelos de tarefa por disciplina; criar instância de tarefa a partir de modelo,
  atrelada a aula; atualizar status; excluir.

### Biblioteca / Repositório
- Arquivos por usuário, upload, vínculo arquivo↔aula.
- Modelos e sequências como "biblioteca" reutilizável.

### Exportação (docx)
- `generatePlanoDeCursoDocx`, `generatePlanoDeAulaDocx`, `generateSingleAulaDocx`.

### Dashboard
- Dados estáticos por usuário; aulas por calendário (mês); avaliações por unidade.

## 5. Observações de engenharia (fatos, não críticas)

- Frontend sem TypeScript; lógica de negócio fortemente acoplada à UI
  (services chamando Supabase direto de componentes).
- Sem camada de API própria (Supabase SDK direto no cliente) — o oposto do
  padrão UhHu! CORE (tudo atrás da API).
- Duplicação de rota `/exportar` no App.jsx (bug menor legado).
- AuthContext mínimo; sessão via Supabase.
- 12 commits; sem histórico de branches/PRs (desenvolvimento solo).
- `docx` gerado no cliente (não no servidor).

## 6. O que isso sugere para a reescrita futura (sem decidir)

- Features docentes centrais: **geração de aulas com validação de conflito**,
  **modelos/sequências didáticas**, **tarefas por disciplina**, **exportação
  docx** — provavelmente o núcleo a preservar.
- O acoplamento Supabase→UI reforça a tese do CORE como camada única.
- Schema não versionado = precisa ser reconstruído ou exportado do projeto
  Supabase antes de qualquer reescrita.

## 7. Relações

- [[UhHu_Suite_Visao_2026-09-09]] (posição do Prof na suite)
- [[ADR007 - Visao de Produto Hub IA de Pesquisa]]
- [[ADR008 - Multi-usuario e Ambientes Dev Prod]]