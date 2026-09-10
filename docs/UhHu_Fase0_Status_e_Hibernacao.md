# UhHu! Fase 0 — Status Consolidado e Retomada

**Projeto:** UhHu!
**Data original:** 13/08/2026  
**Última atualização:** 09/09/2026  
**Status atual:** Fase 0 CONCLUÍDA (decisões de produto fechadas) · Projeto RETOMADO para a fundação do CORE e do UhHu Lab
**Função deste documento:** porta de entrada para retomada — ler isto primeiro, depois os ADRs e a análise do workflow.

---

## 1. Estado da Fase 0

A decisão do Paulo em 13/08/2026 encerrou a investigação inicial e colocou o
projeto em hibernação temporária. Em 09/09/2026, a suite foi retomada para a
fundação do CORE e do UhHu Lab. Nada foi perdido — o estado continua documentado
abaixo e nos ADRs.

## 2. O que a Fase 0 decidiu (consolidado)

| Decisão | Referência |
|---|---|
| UhHu! Core independente de Zotero; Zotero = autoridade bibliográfica quando integrado | ADR-001 |
| Storage abstraído (StorageProvider); PDF tem fonte física única; cache ≠ fonte de verdade | ADR-001 |
| Kerko não é dependência arquitetural | ADR-001 §7 |
| Stack: TS/Node + Fastify + PostgreSQL, Drizzle, Zod, monorepo, Docker | ADR-003 + ADR-009 |
| **CORE compartilhado modular; Lab, Lib, Note, Plan e Prof como módulos/clientes** | ADR-009 |
| Dev/prod separados, com bancos PostgreSQL distintos | ADR-008 + ADR-009 |
| Entrega de arquivos (proxy/signed-redirect) — aceita, mas **adiada** | ADR-004 |
| Modelo de produto Lib: catálogo + modo Zotero/WebDAV + OAuth de identidade | ADR-005 |
| **O produto é a API/Core; UIs são substituíveis** | Ecossistema §23 |
| Estante visual, quando necessária → **fork do Kerko** (nunca construir do zero) | Ecossistema §23 |
| **Primeiro produto = UhHu Lab (anteriormente Researcher)** (coletor + memória de pesquisas); Lib suspenso | ADR-006 |
| Fontes: **BDTD via API JSON VuFind** (OAI-PMH desativado) · CAPES (rest/busca) complementar, monitorada | ADR-006 + Análise Workflow |

## 3. O brainstorming de 13/08 — raciocínio registrado

1. **Gatilho:** Zotero mobile não suporta linked files (declaração oficial do Zotero Team) → a "autonomia" da Fase 0 (estante sobre PDFs do Nextcloud) desmanchou → o "nível 1" como app de estante ficou reduzido a quase nada.
2. **Filtros aplicados (o que matou candidatos):**
   - *Estante visual* → Kerko/fork já supre;
   - *App de notas / cadastro manual* → Zotero + Obsidian já suprem (plugin da comunidade, ex.: Zotero Integration de mgmeyers — desktop);
   - *Servir PDFs* → adiado (ADR-004 dorme);
   - *"Pacote integrado" (Zotero+Notas+Planner+IA+Obsidian)* → produto final, NÃO produto inicial (escopo grande, sincronização cara);
   - *Nível 1 "estante"* → eliminado pelo gatilho do Zotero mobile.
3. **O que sobrou (sem substituto no mercado):** o Core/API — modelo de dados unificado (Book/Document, Note, Project, Task), proveniência, integração automática entre ferramentas do pesquisador.
4. **A dor que deu origem ao produto real:** a produção da pós-graduação brasileira (CAPES/Sucupira, BDTD) não é integrada aos indexadores internacionais nem enxergada pelas IAs globais; as interfaces não exportam dados estruturados. Protótipo n8n validado (workflow "Pesquisa_Banco de Teses") → **UhHu Lab como primeiro produto** (nome anterior: Researcher).

## 4. Estado da documentação (vault/Projetos UhHU)

| Documento | Estado |
|---|---|
| UhHu_ecossistema_visao_arquitetura.md | Histórico; visão vigente da suite no addendum §24 e em [[UhHu_Suite_Visao_2026-09-09]] |
| ADR-001 a ADR-005 | Aceitos (ADR-004 adiado na prática; ADR-005 fora do caminho crítico) |
| ADR-006 — UhHu Lab como Primeiro Produto (ex-Researcher) | ACEITO 13/08/2026; nome atualizado em 09/09/2026 |
| ADR-009 — Core Compartilhado Modular e PostgreSQL | ACEITO 09/09/2026 |
| UhHu_Researcher_Analise_Workflow_CAPES.md | Base do adapter CAPES (payload, campos, riscos, mapeamento) |
| UhHu_Researcher_v1_Spec.md | Spec do UhHu Lab validada por seções em 06/09; infraestrutura revisada para CORE/PostgreSQL em 09/09 |
| UhHu_API_Initial_Spec.md / Vertical Slice | Referências históricas do Lib; não orientar implementação do CORE |
| UhHu_Security_Notes.md / UhHu_Deployment_Notes.md | Revisados em 09/09 para o CORE compartilhado |
| Pesquisa_Banco de Teses.json | Workflow n8n exportado, na pasta `n8n` do Nextcloud |

## 5. Lições de produto (vale relembrar na retomada)

- Teste da frase única: "O UhHu faz o que nenhuma combinação de Zotero + Obsidian + Kerko faz, que é ___" — se a resposta for só "integra tudo", o produto ainda não tem tese própria.
- UI madura que já existe = consome, não reinventa.
- Construir primeiro para resolver a dor real de Paulo; mercado depois ("quando estiver madura, descobrir se outros têm o mesmo problema").
- IA auxilia o pesquisador; nunca substitui (guardrails de autoria/proveniência).

## 6. Pendências para a retomada do desenvolvimento

- [ ] **Validar o contrato inicial do UhHu CORE** (`UhHu_CORE_Contrato_Inicial.md`, draft v0.1: capabilities, módulos, REST, CLI e MCP);
- [ ] **Migrations PostgreSQL** e modelo de dados inicial do CORE;
- [x] **Spec do UhHu Lab** (entidades, endpoints, contrato do adapter Source, critérios de aceitação — validada por seções em 06/09; infraestrutura revisada em 09/09);
- [ ] **Testes de contrato** dos adapters BDTD/CAPES;
- [ ] Reorientar/arquivar documentos históricos do Lib quando cada módulo entrar no roadmap;
- [ ] Monitorar API CAPES (contrato pode mudar sem aviso — Sucupira reformulada em set/2024; sobreviveu até aqui);
- [ ] Criar compose e ambientes PostgreSQL dev/prod separados.

As decisões de autenticação multiusuário e de ambiente estão no [[ADR008 - Multi-usuario e Ambientes Dev Prod]]. A decisão de arquitetura do CORE e persistência está no [[ADR009 - Core Compartilhado Modular e PostgreSQL]].

## 7. Como retomar o desenvolvimento

1. Ler este documento e o [[ADR009 - Core Compartilhado Modular e PostgreSQL]];
2. Elaborar o contrato inicial do CORE e o modelo de dados PostgreSQL;
3. Validar os contratos dos adapters e só então iniciar o vertical slice do UhHu Lab.

---

*Projeto documentado em 13/08/2026 e retomado em 09/09/2026. A Fase 0 está consolidada; o próximo trabalho é documental: contrato do CORE e preparação do UhHu Lab.*
