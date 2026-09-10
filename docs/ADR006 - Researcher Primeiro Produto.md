ADR-006 — UhHu! Lab (ex-Researcher) como Primeiro Produto

Projeto: UhHu!
Produto: UhHu! Lab (anteriormente Researcher)
Fase: Fase 0 — Fundação e decisões
Status: Aceito; nome atualizado em 09/09/2026
Data: 13/08/2026
Tipo: Decisão de produto e arquitetura
Relacionados: [[UhHu_ecossistema_visao_arquitetura]] (§23) · [[ADR001 - UhhuLib]] · [[ADR003 - Core Stack]] · [[ADR009 - Core Compartilhado Modular e PostgreSQL]] · [[ADR005 - Modelo de Produto]] · [[UhHu_Lib_First_Vertical_Slice]] (suspenso)

1. Contexto

1.1. A descoberta do Zotero mobile (ADR-005 §4) reduziu o UhHu! Lib a uma UI substituível: o Kerko supre a estante, o Zotero supre o cadastro e as notas, o Obsidian supre a escrita (ecossistema §23). Conclusão consolidada: o produto é a API/Core — as UIs maduras são consumidas, não reinventadas.

1.2. Nova dor identificada (Paulo, 13/08/2026): a produção da pós-graduação brasileira (CAPES/Sucupira e BDTD) não é integrada aos indexadores científicos internacionais nem enxergada pelas IAs globais — não por língua ou relevância, mas porque os repositórios oficiais não exportam dados estruturados. O pesquisador (sobretudo nas humanidades) precisa navegar filtros pouco intuitivos do Catálogo de Teses e Dissertações da CAPES e/ou da BDTD e recebe uma lista de resultados sem exportação (nem mesmo CSV). Isso é uma dor imediata de milhares de pesquisadores brasileiros na construção de projetos e revisões sistemáticas.

1.3. Viabilidade já demonstrada: Paulo desenvolveu protótipo em n8n que chama a API interna da CAPES com o payload na estrutura correta e devolve resultados estruturados e categorizados, prontos para submissão a uma RSL.

1.4. Verificação de fontes (13/08/2026, atualizada 06/09/2026):
- BDTD (IBICT): na verificação original, expunha OAI-PMH — protocolo padrão, estável e documentado; metadados de acesso aberto; fonte-base recomendada. **Em 06/09/2026, probe real constatou que o OAI-PMH está desativado (HTTP 404 "OAI Server Not Configured")**; a BDTD agora roda VuFind 7.1.1 com API JSON (`/vufind/api/v1/search` + ficha `/vufind/Record/<id>`), validada e documentada em [[UhHu_BDTD_Adapter_Investigation]]. Fonte-base permanece a BDTD, agora via adaptador de API VuFind (não OAI-PMH).
- CAPES: nova Plataforma Sucupira lançada em set/2024 (parceria com RNP) com metabuscador de Teses e Dissertações. A API interna usada pelo protótipo não é oficial/documentada — risco de quebra a qualquer reformulação. Fonte complementar, com monitoramento.

2. Decisão

2.1. Inversão de produto: o primeiro produto do UhHu! é o **UhHu! Lab** (anteriormente Researcher) — não o Lib (que fica suspenso).

2.2. Escopo v1 (imediato):
a) Backend bem estruturado, desenhado como primeira materialização do UhHu Core compartilhado: entidades abstratas, proveniência, casos de uso próprios — para que Lib, Note, Plan e Prof futuros conversem com o mesmo núcleo;
b) Frontend amigável onde o usuário tem a memória de suas pesquisas (projetos, histórico de buscas, resultados salvos);
c) Coletor de fontes: BDTD (API VuFind, validada em [[UhHu_BDTD_Adapter_Investigation]]) como base; CAPES como complementar (payload do protótipo n8n), com camada de resiliência e monitoramento de quebra.

2.3. Fora do v1 (fases seguintes): triagem avançada, IA, extração e síntese de RSL. Filosofia preservada: a IA auxilia o pesquisador; não substitui o pesquisador (ecossistema §11).

3. Escopo v1 — funcionalidades

- Projetos: título, pergunta de pesquisa, datas, status;
- Buscas: execução (termos + filtros: área, instituição, programa, ano, tipo), historização (memória), reexecução;
- Resultados: estruturados (título, autor, instituição, programa, ano, resumo, URL, fonte), deduplicação por conteúdo (hash + similaridade), salvar/descartar/etiquetar;
- Exportação: CSV, BibTeX, JSON;
- Frontend: projetos → histórico de buscas → resultados → exportação.

4. Arquitetura (monorepo e CORE compartilhado, conforme [[ADR009 - Core Compartilhado Modular e PostgreSQL]])

apps/core-api/        → API Fastify do UhHu CORE compartilhado
apps/lab/             → app React Native/Expo do UhHu Lab (web/PWA para beta + nativo Android/iOS)
apps/core-worker/     → jobs longos, quando necessário; mesmo domínio e banco

packages/core/        → domínio e casos de uso
packages/models/      → tipos e entidades
packages/contracts/   → schemas Zod e contratos REST/MCP/CLI
packages/sources/     → adapters de fonte (bdtd, capes)
packages/db/          → Drizzle, PostgreSQL e migrations
packages/integrations/→ integrações da suite
packages/config/      → configuração e segredos

O Lab é o primeiro módulo/cliente do CORE. Não possui backend independente.
PostgreSQL self-hosted é a persistência canônica, com bancos separados para dev
e produção. SQLite fica reservado a cache, operação local e offline futuro.

Entidades do Core já exercitadas pelo v1: Project, Search, Result, Source, DedupGroup, Provenance (de onde veio cada resultado, quando, com quais filtros).

5. Critérios de aceitação (v1)

1. Busca real na BDTD devolve resultados estruturados (≥ 1 busca de teste);
2. Dedup identifica duplicatas entre fontes (hash/similaridade de título);
3. Exportação CSV/BibTeX/JSON do conjunto salvo;
4. Histórico de buscas por projeto persiste e permite reexecução;
5. Fronteira preservada: nenhum dado sensível de terceiros; metadados públicos de acesso aberto (BDTD) coletados via protocolo oficial.

6. Pendências / próximas decisões

- Estado atual do protótipo n8n (payload CAPES pós-Sucupira nova — validar);
- Contrato inicial do CORE e migrations PostgreSQL;
- Especificação final do UhHu Lab e testes de contrato dos adapters;
- Revisão dos documentos da Fase 0 reorientada pela visão da suite.

A autenticação multiusuário e a separação dev/prod foram decididas no [[ADR008 - Multi-usuario e Ambientes Dev Prod]]. A escolha de monorepo, CORE compartilhado e PostgreSQL foi formalizada no [[ADR009 - Core Compartilhado Modular e PostgreSQL]].

7. Consequências

- O vertical slice do Lib (UhHu_Lib_First_Vertical_Slice) fica suspenso; o próximo slice descreve o UhHu Lab v1;
- ADR-005 permanece válido como modelo de produto do Lib (futuro), mas fora do caminho crítico;
- O Core ganha seu primeiro caso de uso real — o que valida as entidades e a proveniência antes de qualquer UI de estante.

8. Status

ACEITO — Fase 0 (decisão de produto)

Referência atual para: primeiro produto, escopo v1 do UhHu Lab, papel das fontes (BDTD/CAPES), suspensão do Lib e relação do Lab com o CORE compartilhado.
