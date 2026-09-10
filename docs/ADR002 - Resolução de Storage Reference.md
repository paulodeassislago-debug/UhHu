ADR-002 — Resolução de Storage Reference (Linked File Path Mapping)

Projeto: UhHu!
Produto: UhHu! Lib
Fase: Fase 0 — Fundação e decisões
Status: Aceito
Data: 13/08/2026
Tipo: Decisão arquitetural
Relacionados: [[ADR001 - UhhuLib]] · [[UhHu_Zotero_Adapter_Investigation]]

1. Contexto

O ADR-001 estabeleceu que o UhHu! Core trabalha com Storage Provider como abstração independente, que os PDFs possuem fonte física única e que o Core nunca cria cópias persistentes dos arquivos.

A investigação do Zotero Adapter (UhHu_Zotero_Adapter_Investigation.md) validou na prática, com a biblioteca real, o comportamento da Zotero Web API v3 para attachments do tipo Linked File:

- o attachment do item real (livro "Complexidade, Saberes Científicos, Saberes da Tradição", ALMEIDA, Ceiça) retorna:

  linkMode: "linked_file"
  path: "attachments:Complexidade, Saberes Científicos, Saberes da Tradição - ALMEIDA Ceiça (2010).pdf"
  filename: null

- o campo filename é nulo para linked_file: o nome do arquivo vive dentro do campo path;
- o prefixo "attachments:" é virtual: aponta para o diretório-base de linked attachments, configurado localmente no Zotero desktop (Preferências > Avançado > Arquivos e Pastas), que não é sincronizado pela API;
- no setup real, o diretório-base do Zotero é /home/paulo/NextCloud/UhHu Lib/Zotero Teste (Zorin), correspondendo à pasta "UhHu Lib/Zotero Teste" no Nextcloud (WebDAV) — e o arquivo físico existe lá com nome idêntico ao do path (22 MB), o que confirmou a correspondência nome-a-nome;
- o fulltext desse linked file retorna HTTP 200 via API (88 páginas indexadas), sem baixar o PDF.

Conclusão da investigação: o path fornecido pela API é virtual e relativo; transformá-lo em um locator concreto no Storage Provider exige uma configuração explícita de mapeamento. Este ADR formaliza essa regra.

2. Decisão

2.1. Storage Reference é uma entidade estruturada do modelo UhHu!

O campo Document.attachments[].storageReference não é uma string opaca. Ele possui estrutura conhecida:

storageReference
├── connectionId        → qual conexão de storage (ver 2.4)
├── providerRef         → identificador do arquivo no provider
│                         (ex.: path virtual "attachments:<arquivo>.pdf")
└── resolvedLocator     → resultado da resolução (cache opcional)
                          (ex.: URL WebDAV, path físico, ou handle do provider)

2.2. Fatos da integração Zotero (não são decisões, são comportamento observado)

- linked_file: path no formato "attachments:<caminho relativo>"; filename null;
- o prefixo "attachments:" referencia o diretório-base local do Zotero;
- o caminho relativo pode conter subpastas (não observado no caso real, mas possível);
- imported_file: path ausente; o arquivo é servido por GET /items/<key>/file (não é alvo deste ADR, mas o storageReference deve suportar os dois casos).

2.3. Regra de resolução

Para attachments linked_file:

    "attachments:<p>"  →  <basePath> + "/" + <p>

onde basePath é o mapeamento configurado do diretório-base do Zotero para a pasta correspondente no Storage Provider, definido por conexão:

    config: connections.<id>.zoteroLinkedFileBasePath

Valor padrão no setup atual (Paulo):

    connections.default.zoteroLinkedFileBasePath = "UhHu Lib/Zotero Teste"
    (pasta no Nextcloud/WebDAV local)

A resolução produz um locator (ex.: URL WebDAV completa), nunca uma cópia do arquivo.

2.4. connectionId — a porta para multi-tenant não é fechada

O storageReference carrega connectionId desde o início, mesmo que a implementação atual tenha uma única conexão implícita ("default": Nextcloud local).

No futuro, cada usuário do UhHu! hospedado terá suas próprias conexões (Google Drive, OneDrive, Dropbox, S3, WebDAV), cada uma com:
- credenciais próprias (OAuth/senha de app, criptografadas em repouso);
- seu próprio mapeamento zoteroLinkedFileBasePath quando aplicável;
- escopos e permissões mínimos.

Não implementar multi-tenant agora; apenas manter o campo no modelo e a configuração por conexão.

2.5. Garantia de não-duplicação

Resolver uma storageReference jamais copia o arquivo para o Core. A resolução termina em um locator ou em um fluxo de leitura (stream), sem persistência.

2.6. Validação na sincronização

Durante a sincronização, o Core deve validar que o resolvedLocator corresponde a um arquivo existente no Storage Provider (stat/HEAD). Se o arquivo não existir (ex.: usuário mudou o diretório-base do Zotero sem atualizar a configuração), o item deve ser marcado com status "attachment_unresolved" e reportado — não silenciosamente ignorado.

3. Consequências positivas

- A resolução é testável e já foi demonstrada: path da API → arquivo real no Nextcloud, sem cópia;
- o desenho por conexão prepara multi-tenant sem refazer o modelo;
- a regra funciona para qualquer provider que exponha o arquivo por caminho (WebDAV, filesystem, S3-like);
- mantém o ADR-001 §4 (fonte física única) operacional: o Core só guarda referências.

4. Consequências negativas / trade-offs

- Exige configuração manual do mapeamento uma vez por conexão (custo pequeno, mitigado por padrão sensato e pela validação da seção 2.6);
- se o usuário mudar o diretório-base no Zotero e não atualizar a configuração, referências quebram — por isso a validação de existência é obrigatória e deve gerar alerta visível;
- providers cujo identificador não seja um caminho (ex.: Google Drive fileId) exigirão um mapeamento próprio do providerRef para o identificador real — previsto na estrutura (providerRef é opaco para o Core, interpretado pelo adapter do provider).

5. Critério de aceitação

Dado um item com attachment linked_file sincronizado do Zotero:

    storageReference.connectionId = "default"
    storageReference.providerRef  = "attachments:<arquivo>.pdf"
    storageReference.resolvedLocator = URL WebDAV completa do arquivo físico

com o arquivo existente no Storage Provider e nenhuma cópia criada pelo Core. Demonstrado manualmente na investigação; a implementação deve reproduzir o mesmo resultado automaticamente.

6. Relação com a documentação anterior

Este ADR torna operacional o ADR-001 §3 (Storage como abstração) e §4 (PDF: fonte física única), a partir dos fatos documentados em UhHu_Zotero_Adapter_Investigation.md §4.2. Nenhuma premissa do ADR-001 foi contrariada.

7. Status

ACEITO — Fase 0

Referência atual para: resolução de storage references, configuração de diretório-base de linked files, estrutura do modelo Document.attachments[].storageReference.

Se um experimento posterior contrariar estas premissas, deve ser produzido um novo ADR ou uma revisão deste documento.

8. Próximo documento

ADR-003 — Core Stack (TypeScript/Node + Fastify + SQLite/FTS5 + Docker) e ADR-004 — Entrega de Arquivos (proxy/redirect por capacidade do provider), ambos em elaboração.
