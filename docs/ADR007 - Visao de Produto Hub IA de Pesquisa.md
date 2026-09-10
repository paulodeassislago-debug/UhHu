ADR-007 — Visão de Produto: Hub IA de Pesquisa de Pós-Graduação (produção científica brasileira)

Projeto: UhHu!
Produto: UhHu! Suite — UhHu Lab (ex-Researcher), Lib, Note, Plan e Prof
Fase: Fase 0/1 — Fundação e decisões
Status: Aceito; nomenclatura e arquitetura global revisadas em 09/09/2026
Data: 06/09/2026
Tipo: Decisão de produto e visão
Relacionados: [[ADR006 - Researcher Primeiro Produto]] · [[ADR009 - Core Compartilhado Modular e PostgreSQL]] · [[ADR001 - UhhuLib]] · [[ADR002 - Resolução de Storage Reference]] (adiado → reaberto) · [[ADR004 - Entrega de Arquivos]] (adiado → reaberto) · [[ADR005 - Modelo de Produto]] · [[UhHu_ecossistema_visao_arquitetura]] (§23/§24) · [[UhHu_Suite_Visao_2026-09-09]] · [[UhHu_Contexto_Retomada_2026-09-06]]

> Este ADR continua válido para o pivô de produto e a reabilitação do Lib. A
> visão global posterior transformou o hub em uma suite e fechou a nomenclatura:
> Researcher passou a UhHu Lab; a arquitetura do CORE está no ADR-009.

1. Contexto

1.1. Em 06/09/2026, na sessão de retomada, Paulo revisou a visão do projeto a partir de um fato novo e provado: **é possível gerenciar os arquivos fisicamente desde que estejam em um serviço WebDAV**. O formato proprietário do Zotero (`<key>.zip` + `<key>.prop`) já foi escrito por nós diretamente no WebDAV do Nextcloud, em produção, e aceito pelo ecossistema Zotero — não é mais especulação nem dependência do cliente desktop.

1.2. Fatos que sustentam 1.1:
- 17/08/2026: inspeção da pasta WebDAV `zotero/` no Nextcloud (12 itens, 87MB) confirmou o formato real produzido pelo cliente Zotero desktop (zip com PDF + prop XML com `<mtime>`/`<hash>`).
- 23/08/2026: pipeline `~/bin/zotero_ingest.py` (cron Inbox-Biblioteca) implementado e validado em produção: cria item + attachment `imported_file` via Zotero Web API v3, escreve zip/prop no WebDAV, verifica (GET pai, children, md5 interno == hash do .prop). Skill `zotero-inbox` documenta o fluxo.

1.3. Consequência para a decisão de 13/08 (ADR-006): o Lib foi suspenso porque a estante visual sobre linked files morria no mobile do Zotero. Com `imported_file` + sync WebDAV (não `linked_file`), o bloqueio técnico central cai: o arquivo pode viver no Nextcloud (WebDAV) e ser sincronizado pelo Zotero inclusive em mobile. O teste E2E "mobile baixando arquivo ingerido por nós" segue em aberto (passo de validação barato), mas o mecanismo de escrita está provado.

1.4. Paulo reafirmou uma visão maior: o UhHu! deve ser pensado como **suite de aplicativos sobre um CORE headless**, começando pelo UhHu Lab (anteriormente Researcher) como hub IA-powered para a pesquisa de pós-graduação com foco na produção científica brasileira — coleta, organização, proveniência, leitura assistida e memória de pesquisa. Lib, Note, Plan e Prof entram por etapas, um produto de cada vez.

2. Decisão

2.1. **Visão do produto**: o UhHu! é uma suite de aplicativos sobre o UhHu CORE, com foco inicial em um hub IA-powered de pesquisa de pós-graduação voltado à produção científica brasileira (BDTD, CAPES/Sucupira e futuras fontes nacionais). O UhHu Lab (ex-Researcher) cuida de coleta + memória; Lib cuida de bibliografia; Note cuida de notas; Plan e Prof cuidam de planejamento e trabalho docente. Todos conversam com o mesmo núcleo, sempre com a filosofia "a IA auxilia, não escreve o trabalho acadêmico".

2.2. **O UhHu Lab permanece o primeiro produto e o caminho crítico** (reafirma ADR-006). O hub/suite não antecipa funcionalidades: cada peça entra quando o Core tiver base real.

2.3. **O Lib é reabilitado como peça do hub**, não mais suspenso em definitivo, com base no fato WebDAV provado (1.1–1.3). Ressalva do teste do Kerko mantida: não reinventar UI de estante; o valor próprio do Lib é a gestão física dos arquivos (Core → WebDAV → Zotero) com proveniência, não a interface.

2.4. **ADR-002 e ADR-004 saem do gelo**, mas só entram no caminho crítico após o UhHu Lab v1 estar no ar (evitar antecipação). A validação mobile E2E (1.3) é pré-requisito barato para quando o Lib entrar.

2.5. **Nomenclatura dos produtos**: Paulo definiu os nomes da suite para público brasileiro: UhHu Lab, UhHu Lib, UhHu Note, UhHu Plan e UhHu Prof. A exposição pública ainda depende de revisão de marca e posicionamento, mas os nomes deixam de ser uma pendência arquitetural.

3. Consequências positivas

- Tese de nicho real: a produção científica brasileira (literatura cinzenta em português, BDTD/CAPES) é mal servida por indexadores internacionais e não exporta dados estruturados; um hub nacional IA-powered tem dor e público claros.
- O Lib deixa de ser premissa morta e vira peça crescente do hub, com mecanismo já provado em produção.
- A arquitetura do CORE compartilhado (ADR-009) acomoda Lab, Lib, Note, Plan e Prof por módulos, sem exigir backends independentes.
- A visão unifica os produtos e dá narrativa comercial (horizonte de distribuição, premissa do ADR-005).

4. Consequências negativas / trade-offs

- Risco de escopo: "suite" convida a fazer tudo; o antídoto é o caminho crítico fixo (UhHu Lab v1) e a regra "uma peça por vez, validada no uso real".
- Um CORE compartilhado exige fronteiras modulares, contratos explícitos e disciplina para não virar um monólito acoplado.
- O mecanismo WebDAV está provado no desktop; o mobile segue como validação pendente explícita (não tratá-la como fato consumado).
- O teste do Kerko permanece: UI de estante é substituível; se Lib exigir UI, avaliar adaptação/fork do Kerko antes de construir.

5. Critérios de aceitação (visão)

1. UhHu Lab v1 no ar com BDTD + CAPES (critérios do ADR-006 §5);
2. Prova de conceito de arquivo via Core → WebDAV → Zotero aceito no desktop e no mobile (E2E pendente de 1.3);
3. Nomes dos cinco produtos registrados: Lab, Lib, Note, Plan e Prof;
4. Nenhuma feature de produto adicional entra antes do UhHu Lab v1 validado (regra de não antecipação).

6. Relação com documentação anterior

- Substitui a leitura estrita de "Lib suspenso" do ADR-006 §2.1/§7 para "Lib reabilitado como peça do hub" (ADR-006 segue válido em produto/escopo do UhHu Lab e caminho crítico).
- Reabre ADR-002 (storage reference) e ADR-004 (entrega de arquivos) como documentos de referência futura, fora do caminho crítico.
- ADR-005 (modelo de produto) permanece válido como modelo do Lib futuro.
- ADR-009 formaliza a arquitetura global: monorepo, CORE compartilhado modular e PostgreSQL self-hosted.
- Ecossistema §23/§24 ("o produto é a API/Core" e suite sobre o CORE) permanece o fundamento.

7. Status

ACEITO — Fase 0/1 (decisão de produto e visão)

Referência atual para: visão da suite/hub, papel do Lib, nomenclatura dos produtos e regra de não antecipação. A arquitetura do CORE está no ADR-009.