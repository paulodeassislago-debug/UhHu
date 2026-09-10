ADR-005 — Modelo de Produto: Catálogo Nativo e Sincronização Zotero/WebDAV

Projeto: UhHu!
Produto: UhHu! Lib
Fase: Fase 0 — Fundação e decisões
Status: Aceito
Data: 13/08/2026
Tipo: Decisão de produto e arquitetura
Relacionados: [[ADR001 - UhhuLib]] · [[ADR002 - Resolução de Storage Reference]] · [[ADR003 - Core Stack]] · [[ADR004 - Entrega de Arquivos]] · [[UhHu_API_Initial_Spec]] · [[UhHu_Security_Notes]] · [[UhHu_Lib_First_Vertical_Slice]] · [[UhHu_ecossistema_visao_arquitetura]]

1. Contexto

A exigência de leitura e anotação em dispositivos mobile é inegociável (Paulo). A declaração do Zotero Team (dstillman, fórum oficial, 15/07/2024) estabelece o limite técnico do ecossistema:

> "The mobile apps support stored files synced via Zotero Storage or WebDAV. They don't and won't support linked files."

Isso invalida o modelo "Linked Files + pasta humana no Nextcloud" como modelo padrão (o Zotero mobile não abre linked files) e força a decisão de produto que o ADR-001 havia adiado: o UhHu! é concorrente ou companheiro do Zotero?

Decisão tomada em conjunto: **companheiro**, com a experiência de usuário definida em torno das regras de negócio do Zotero — e o escopo do produto explicitado em dois modos de catálogo, com duas direções futuras de monetização (IA de metadados e e-reader).

2. Posicionamento: aplicação companheira (não concorrente)

2.1. O Zotero define as regras de negócio da experiência de leitura:
- arquivos: Zotero Storage ou WebDAV (regra mobile);
- annotations: children de attachments (regra da API);
- bibliografia: dono único (Zotero).

2.2. O UhHu! diferencia onde o Zotero é fraco: descoberta, organização visual, busca, relacionamento — e, no futuro, experiência de leitura própria, sempre sincronizada com o Zotero.

2.3. Independência futura (biblioteca nativa UhHu! sem Zotero) permanece como possibilidade arquitetural (ADR-001 §10), não como investimento presente. A decisão de produto não fecha essa porta; apenas não a paga agora.

3. Modo Catálogo (nativo — produto inicial)

3.1. O UhHu! Lib, sozinho, é uma ferramenta de organização de biblioteca no estilo da antiga estante do Notion: o usuário cria o catálogo (itens, coleções, capas, metadados) e o UhHu! fornece um **link** para esse catálogo.

3.2. Arquivos: apenas **referências/URLs** — o servidor não hospeda PDFs no modo catálogo (ADR-001 §4 preservado; o arquivo permanece na casa do dono).

3.3. Catálogo compartilhável: o dono decide a visibilidade — aberto a qualquer pessoa autenticada ou restrito a e-mails autorizados.

4. Modo Zotero (sincronização)

4.1. A sincronização com o Zotero **exige WebDAV** (regra de negócio do Zotero).

4.2. **Aviso obrigatório ao usuário:** o Zotero duplicará toda a biblioteca no diretório em que o serviço WebDAV aponta. Esse comportamento é do Zotero (stored files), não do UhHu! — mas a UX de conexão deve comunicá-lo claramente antes do vínculo.

4.3. Quando o cliente opta por incluir o catálogo no Zotero, **todo o catálogo é incluído no Zotero, arquivos inclusive**. Nesse fluxo, os arquivos **passam temporariamente pelo servidor, apenas para a transferência** (pass-through), sem persistência (regra do ADR-001 §4 e ADR-004 §2.6).

5. Autenticação e compartilhamento

5.1. **OAuth como camada de identidade** (login): providers configuráveis — Google primeiro; GitHub/OpenID depois; **fallback local** (usuário/senha ou token) para self-host que não queira provedor externo.

5.2. Distinção explícita e permanente: **OAuth de identidade** (quem é o usuário) ≠ **OAuth de conexão** (acesso ao storage do cliente — Drive/OneDrive/etc., futuro, ADR-004).

5.3. A API key de instalação (Security Notes §2) permanece como credencial de operação/scripts.

6. Direção futura — IA de metadados (Nível C, pago)

Serviço pago que escaneia o repositório do cliente e produz metadados. Os metadados **moram no UhHu** (enriquecimento do catálogo) e são sincronizados com o Zotero **se o cliente quiser**.

Regras obrigatórias (para não ferir os princípios do projeto):
a) **Proveniência:** todo metadado gerado por IA é marcado (source: ai_generated, nível de confiança);
b) **Revisão humana:** a IA propõe; o usuário aceita/edita; a escrita no Zotero (via API) ocorre apenas com consentimento explícito — o Zotero continua fonte de verdade;
c) **Zero toque no arquivo quando integrado ao Zotero:** a IA consome o fulltext via API;
d) No modo catálogo puro: PDF passa temporariamente pelo servidor e é descartado após a extração.

Fora do escopo v1. A arquitetura não fecha a porta: o modelo Document já carrega provenance.

7. Direção futura — E-reader com anotações sincronizadas (Nível C+, pago)

7.1. Lacuna identificada: UX de leitura moderna (estilo Readwise) + integração profunda com o Zotero + preço acessível — Readwise é caro e não se integra de verdade ao Zotero; o Zotero Reader integra mas tem UX mediana; LiquidText/MarginNote são iPad-only.

7.2. **Regra de ouro:** o e-reader do UhHu! nunca é segunda fonte de annotations. Toda anotação feita no viewer sincroniza com o Zotero via API (children do tipo annotation) e aparece no Zotero desktop/mobile. O UhHu! compete na experiência de leitura, não na autoridade dos dados.

7.3. **Gate:** o e-reader só inicia depois que Modo Catálogo e Modo Zotero estiverem operacionais (o leitor sem catálogo é só mais um leitor de PDF).

7.4. Monetização (esboço): leitor básico incluso; **sincronização de anotações multiplataforma + IA de metadados** como núcleo do plano pago. Anotação cria retenção; IA de metadados justifica a assinatura.

8. Consequências positivas

- Mobile + annotations restaurados via WebDAV (regra do Zotero), sem código nosso;
- dois modos de entrada no produto (catálogo leve → Zotero), com migração natural;
- camada paga com valor claro (IA + Reader) sem ferir princípios;
- compartilhamento sem gestão própria de usuários (OAuth);
- aviso de duplicação transforma o comportamento do Zotero em transparência de produto.

9. Consequências negativas / trade-offs

- Modo Catálogo sem arquivos hospedados limita o catálogo a referências (aceito — coerente com não-duplicação);
- OAuth adiciona dependência de provedores externos (mitigado pelo fallback local);
- e-reader é o componente de maior custo de engenharia do projeto — controlado pelo gate (§7.3);
- o aviso de duplicação do Zotero pode assustar usuários na conexão — necessário: é transparência (UX de conexão deve ser clara e informativa).

10. Impacto na documentação existente

- [[UhHu_API_Initial_Spec]]: endpoints de catálogo compartilhável + OAuth de identidade + proveniência de metadados (revisão em curso);
- [[UhHu_Lib_First_Vertical_Slice]]: reorientado — Modo Catálogo primeiro, Modo Zotero em seguida (revisão em curso);
- [[UhHu_Security_Notes]]: OAuth de identidade como evolução da autenticação (revisão em curso);
- [[ADR001 - UhhuLib]] §2.2: reforçado — "não competidor" agora é decisão de produto explícita.

11. Critério de aceitação

1. Um usuário cria um catálogo, adiciona itens e compartilha o link; outro usuário autenticado (OAuth) acessa a estante (ou e-mails autorizados, quando restrito);
2. O fluxo de conexão com o Zotero exibe o aviso de duplicação WebDAV antes do vínculo;
3. A sincronização funciona com arquivos passando temporariamente pelo servidor, sem persistência (verificável: nenhum arquivo novo permanece no servidor após o fluxo);
4. Metadados gerados por IA (quando disponível) são marcados e revisáveis antes de qualquer escrita no Zotero.

12. Status

ACEITO — Fase 0

Referência atual para: modelo de produto, modos de catálogo, autenticação por identidade, direções de monetização (IA de metadados, e-reader) e gates de entrada.

13. Próximo documento

Revisões da spec, do vertical slice e da security notes, conforme §10.
