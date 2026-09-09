# Research Summary: UhHu! CORE v1 + Lab v1

**Reutilizada, não executada em 2026-09-09.** Subagents `gsd-project-researcher`/`synthesizer` indisponíveis (sem runtime Node neste container para `gsd-sdk`). A pesquisa de domínio do projeto já existe, validada com probes reais, e foi adotada como insumo — sem re-pesquisar a web.

## Fontes canônicas (ler antes de implementar)

- `dev-docs/04-fontes-bdtd-capes.md` — shapes operacionais BDTD VuFind 7.1.1 + CAPES `rest/busca` JSON; cookie `OasisbrVerify`; TLS CAPES com cadeia problemática (não hardcodar `rejectUnauthorized:false`); registry `bdtd|capes` on, `oasisbr` off.
- `docs/UhHu_BDTD_Adapter_Investigation.md` — investigação completa BDTD (§9: veredito LAI/LGPD/LDA/art. 154-A; OAI-PMH desativado 404; cortesia batch+wait, UA identificado, sem headless anti-bot).
- `docs/UhHu_Researcher_Analise_Workflow_CAPES.md` + `docs/UhHu_Researcher_Jornada_de_Uso.md` — workflow e jornada que originaram a spec.
- `docs/UhHu_Cobertura_BDTD_CAPES.md` — prova 57% ausência BDTD vs CAPES ("ensino de química", 60 títulos) → ambas as fontes obrigatórias + relatório de cobertura.
- `docs/UhHu_Zotero_Adapter_Investigation.md` — insumo futuro do Lib (fora do v1).
- `docs/UhHu_API_Initial_Spec.md` + `docs/UhHu_Lib_First_Vertical_Slice.md` — **históricos, não orientam o contrato** (ver 02-decisoes).
- `docs/UhHu_Prof_Inventario_Codebase_2026-09-09.md` + `dev-docs/06-legado-planner.md` — herança Plan/Prof (requisitos, nunca arquitetura).

## Stack (decidida, ADR-003 parcial + ADR-009)

TypeScript strict, Node LTS, Fastify (validação de fronteira), Zod (contratos→tipos), Drizzle (dialeto PG), pnpm monorepo, PostgreSQL self-hosted dev/prod separados, Docker na VPS, Argon2id, `packages/contracts` como fonte única de tipos. Sem見積もり de versão aqui — fixar no plano da Fase 1 com verificação em docs oficiais.

## Table stakes vs diferenciadores

- Table stakes: auth e-mail+senha+convite, isolamento ownerId, projetos/buscas/runs/resultados, paginação, erros padronizados, exportação.
- Diferenciadores: `SearchRun` temporal + comparação de estratégias, dedup transparente por interseção com divergência por fonte, proveniência reconstruível, `partial` sem perda, cobertura BDTD/CAPES.
- Anti-features: backend por app, SQLite servidor, Supabase novo, estante própria v1, IA escrevendo trabalho, PDFs no crítico, microsserviços antecipados.

## Pitfalls (com prevenção e fase)

1. IDOR em rota com ID → buscar sempre no escopo do ator + testes dono/estranho/adulterado (Fase 2, todas as fases).
2. Confiar em `localStorage`/`Origin`/`Referer`/campo do body p/ privilégio → ator derivado da sessão (Fase 2).
3. Segredo em bundle/Git/log/resposta → Gitleaks tree+histórico, scan de bundle, 600/secret manager (Fase 1).
4. BDTD/CAPES não oficiais quebram → testes de contrato no CI + circuit breaker + `partial` + via institucional (LAI/OAI), nunca contorno anti-bot (Fase 3).
5. TLS CAPES → validar cadeia no deploy; proibido `rejectUnauthorized:false` (Fase 3).
6. Enriquecer 1 req/resultado na busca → enrich sob demanda + batch só p/ elegíveis (Fase 3).
7. Fuzzy sem confirmação → UI confirma divergência (Fase 4).
8. Congelar schema Lib/Note/Plan/Prof cedo → só portas abertas; CORE v1 validado pelo Lab (todas).
9. Duplicar regra por superfície → CLI/MCP chamam mesmos casos de uso (Fase 5).
10. Refresh token em texto simples (lição do legado) → cifrado em repouso no contexto de integração (Fase 2/5).

## Decisão

Research dedicada adicional dispensada para este milestone; reativar `workflow.research` por fase quando entrar Lib (Zotero/BibTeX), Note, Plan/Prof (Google Calendar) ou artigos v2 (DOAJ/SciELO).
