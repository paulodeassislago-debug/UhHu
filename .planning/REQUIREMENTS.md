# Requirements: UhHu! v1.1 Lab UI v1

**Defined:** 2026-09-11
**Core Value:** Um pesquisador usa o Lab por interface tablet-first (web/PWA beta + nativo) consumindo SOMENTE o CORE — do login ao corpus exportado.

## v1.1 Requirements

Requirements for this milestone. Each maps to roadmap phases 6–9.

### App shell e client do CORE

- [x] **UI-01**: User abre o app em `apps/lab` (Expo + TypeScript strict) na web e no tablet e navega entre as 7 telas do esqueleto sem erro de build — done 06-02 (export web ok + Expo Go tailnet, sem EAS)
- [x] **UI-02**: App consome SOMENTE o CORE via client tipado derivado dos schemas compartilhados (`packages/contracts`), sem cópia local de tipos de domínio — done 06-02 (lado client; prova com dados reais em 06-04)
- [x] **UI-03**: User vê estados vazio / carregando (skeleton) / erro com ação / parcial em todas as telas, conforme §11 do esqueleto — done 06-04 (Empty/CardSkeleton/ErrorBanner/PartialBanner verbatim em login/projetos/projeto)
- [x] **UI-04**: Gates verdes para o app: typecheck strict, lint, testes, `any` proibido, bundle web sem segredos (Gitleaks + SAST + `pnpm audit`) — done 06-04 (typecheck+lint+vitest 7/7, any 0, dist grep 0, Gitleaks lab 0, audit só toolchain Expo)

### Autenticação

- [x] **UI-05**: User faz login com e-mail + senha na web/PWA (cookie httpOnly, mesmo fluxo browser existente) e vê a lista de projetos — done 06-03 (AuthProvider cookie + projects lista real)
- [x] **UI-06**: User registra conta com token de convite válido e recebe erro legível com token inválido/expirado — done 06-03 (registerSchema + envelope verbatim, sem oráculo)
- [x] **UI-07**: User autentica no app nativo via PAT por device (POST /auth/token, guardado em secure storage) com logout que revoga — done 06-03 (deviceName automático + SecureStore + revogação patId)
- [x] **UI-08**: User com sessão expirada é redirecionado ao login com aviso, sem perder o projeto atual — done 06-03 (expired + next interno via isSafeNext)

### Projetos

- [ ] **UI-09**: User vê a lista de projetos (título + pergunta truncada + status + contagens leves) e o estado vazio orientador
- [ ] **UI-10**: User cria projeto (título + pergunta), arquiva, reativa e edita a pergunta no cabeçalho
- [ ] **UI-11**: User navega no projeto por abas (Estratégias / Comparação / Corpus com contador vivo) sem perder posição

### Buscas e execução

- [ ] **UI-12**: User vê os cards de estratégia (termos legíveis, filtros, fontes, runs, última execução com contagem) e o estado vazio
- [ ] **UI-13**: User salva estratégia (só salvar) ou salva-e-executa, com selo "filtro garantido pelo Core" e status das fontes visível
- [ ] **UI-14**: User executa busca e acompanha o run com progresso por fonte (cancelável) até ok / parcial (banner âmbar com o que faltou) / falha (motivo + repetir) / cancelled
- [ ] **UI-15**: User exclui busca via diálogo que lista a cascata (nº de runs, resultados e decisões perdidas) antes do hard-delete
- [ ] **UI-16**: User consulta o histórico de execuções (runs) de uma busca

### Resultados e triagem

- [ ] **UI-17**: User vê cards de resultado (título, autores, ano, tipo, instituição/programa, fontes, proveniência busca → run → data → fonte)
- [ ] **UI-18**: User expande grupo deduplicado (origens, links, diferenças de metadados, "versão mais completa") e diverge por fonte quando precisar
- [ ] **UI-19**: User decide elegibilidade por card (elegível / não elegível / indeciso), mutável a qualquer toque, com `decidido_em` atualizado
- [ ] **UI-20**: User associa tag opcional com autocomplete (defaults incluir/excluir/duplicado/indisponível/revisar) e gerencia tags do projeto
- [ ] **UI-21**: User identifica itens novos do run via badge "NOVO" (regra D-35)
- [ ] **UI-22**: User abre a ficha completa do item sob demanda (sem pré-carregar a lista)

### Corpus e exportação

- [ ] **UI-23**: User vê o corpus como view derivada dos elegíveis, com contador consistente após cada decisão
- [ ] **UI-24**: User filtra o corpus por tag / fonte / ano e vê o estado vazio orientador
- [ ] **UI-25**: User seleciona itens por grupo deduplicado inteiro e exporta a seleção (CSV | BibTeX | JSON)
- [ ] **UI-26**: User exporta o corpus completo (CSV | BibTeX | JSON, BibTeX com `@phdthesis`/`@mastersthesis`)

### Comparação

- [ ] **UI-27**: User compara 2–4 estratégias lado a lado (total, por ano, por fonte, só-BDTD / só-CAPES / ambas, sobreposição)
- [ ] **UI-28**: User vê o destaque automático de "mais inclusiva" (sem "menos ruído" no v1.1)
- [ ] **UI-29**: User marca manualmente a estratégia de referência do projeto (persistida) e vê o estado vazio orientador

### Suporte no CORE (§14 + auth + CORS)

- [x] **UI-30**: `referenceSearchId` nullable no Project via migration versionada (leitura/escrita isolada por owner, GET expõe, PATCH persiste a escolha da comparação) — done 06-01
- [x] **UI-31**: GET results expõe `isNew` derivado on-read (ausente em TODOS os runs anteriores da busca, regra D-35), sem coluna nova — done 06-01
- [x] **UI-32**: Web beta carrega dados via CORS da API a partir da origem beta aprovada (sem enfraquecer auth; PAT/CORS testados via `curl`) — done 06-01 (lado servidor; prova beta com dados reais em 06-04)

## v1.2 Requirements

Deferred to a future milestone. Tracked but not in the current roadmap.

### Refinamento visual (pós-uso real)

- **UIV-01**: Paleta, tipografia e componentes refinados após v1 funcional com uso real
- **UIV-02**: Animações e polimento de transições

### Métrica de comparação v2

- **UIV-03**: Critério "menos ruído" com taxa de elegibilidade pós-triagem (amostra mínima ~20)

### Conveniência de triagem

- **UIV-04**: Triagem em lote (marcar vários de uma vez)
- **UIV-05**: Leitura do último run em cache local (SQLite) com aviso offline, sem triagem offline

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Etapa 3 Análise (arquivos/reader) | Fora do Lab v1; reabre ADR-004 quando entrar |
| IA/síntese, escrita acadêmica | Filosofia do produto: IA auxilia, não escreve; fora do v1 |
| Lib/Note/Plan/Prof UI | Um app por vez; Lab primeiro (ADR-006/007) |
| Integração Nextcloud | Sem necessidade real demonstrada |
| Triagem em lote no v1.1 | Impediria a leitura item a item que o método exige |
| "Menos ruído" automático no v1.1 | Decisão Paulo 11/09: sem fórmula mágica; manual + "mais inclusiva" |
| Soft-delete de busca | Decisão §14-3: hard-delete com diálogo de cascata |
| Coluna persistida para `isNew` | Decisão §14-5: estado que envelhece; derivado on-read |
| Colaboração no mesmo projeto, SSO/OAuth login | Fora do v1 (contrato §22) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| UI-01 | Phase 6 | Done (06-02) |
| UI-02 | Phase 6 | Done (06-02, lado client) |
| UI-03 | Phase 6 | Done (06-04) |
| UI-04 | Phase 6 | Done (06-04) |
| UI-05 | Phase 6 | Done (06-03) |
| UI-06 | Phase 6 | Done (06-03) |
| UI-07 | Phase 6 | Done (06-03) |
| UI-08 | Phase 6 | Done (06-03) |
| UI-30 | Phase 6 | Done (06-01) |
| UI-31 | Phase 6 | Done (06-01) |
| UI-32 | Phase 6 | Done (06-01, lado servidor) |
| UI-09 | Phase 7 | Pending |
| UI-10 | Phase 7 | Pending |
| UI-11 | Phase 7 | Pending |
| UI-12 | Phase 7 | Pending |
| UI-13 | Phase 7 | Pending |
| UI-14 | Phase 7 | Pending |
| UI-15 | Phase 7 | Pending |
| UI-16 | Phase 7 | Pending |
| UI-17 | Phase 8 | Pending |
| UI-18 | Phase 8 | Pending |
| UI-19 | Phase 8 | Pending |
| UI-20 | Phase 8 | Pending |
| UI-21 | Phase 8 | Pending |
| UI-22 | Phase 8 | Pending |
| UI-23 | Phase 9 | Pending |
| UI-24 | Phase 9 | Pending |
| UI-25 | Phase 9 | Pending |
| UI-26 | Phase 9 | Pending |
| UI-27 | Phase 9 | Pending |
| UI-28 | Phase 9 | Pending |
| UI-29 | Phase 9 | Pending |

**Coverage:**
- v1.1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-11*
*Last updated: 2026-09-11 after initial definition (scope from Hermes/Paulo instruction; questions dismissed with "go" — full scope assumed)*
