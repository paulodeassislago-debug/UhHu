ADR-004 — Entrega de Arquivos (proxy e signed-redirect por capacidade do provider)

Projeto: UhHu!
Produto: UhHu! Lib (Core/API)
Fase: Fase 0 — Fundação e decisões
Status: Aceito
Data: 13/08/2026
Tipo: Decisão arquitetural
Relacionados: [[ADR001 - UhhuLib]] · [[ADR002 - Resolução de Storage Reference]] · [[ADR003 - Core Stack]]

1. Contexto

O ADR-001 estabeleceu que o frontend não conversa diretamente com serviços externos (Zotero, Nextcloud, Google Drive etc.) e que o PDF tem fonte física única no Storage Provider. O ADR-002 definiu como um storage reference vira locator concreto.

Falta decidir como o arquivo chega ao cliente. Dois cenários precisam ser atendidos simultaneamente:

- cenário atual (uso pessoal): o PDF está no Nextcloud local (mesma VPS, WebDAV em localhost) — proxy é barato e simples;
- cenário futuro (multi-tenant): cada cliente conecta o próprio cloud storage (Google Drive, OneDrive, Dropbox, S3) via OAuth — fazer o servidor intermediar todo o tráfego de arquivos custa banda, CPU e latência que escalam com o uso, não com o número de clientes. Inviabiliza o produto comercialmente.

Além disso, o Core nunca deve criar cópias persistentes de PDFs (ADR-001 §4; ADR-002 §2.5).

2. Decisão

2.1. Dois modos de entrega, decididos por capacidade do provider

Cada StorageProvider declara suas capacidades e o Core escolhe o mecanismo automaticamente. O cliente não participa da decisão: o endpoint é sempre o mesmo.

modos:
- PROXY: o Core autentica no storage com credencial de serviço e faz stream do arquivo ao cliente;
- SIGNED-REDIRECT: o Core gera um URL efêmero e escopado ao arquivo (ex.: Google Drive download link com token curto, S3 presigned URL, OneDrive/Dropbox temp link) e responde com redirect HTTP.

2.2. Contrato da interface StorageProvider

storageProvider
├── capabilities: {
│     proxy: bool,
│     signedRedirect: bool,
│     rangeSupported: bool   // suporte a HTTP Range no modo redirect
│   }
├── resolve(storageRef) → DownloadHandle
│     { mode: 'proxy' | 'redirect', url?, expiresAt? }
└── stream(storageRef, range?) → Readable   // usado no modo proxy

Regra de seleção:
- se capabilities.proxy e o storage for local/barato (WebDAV local, filesystem) → proxy;
- se capabilities.signedRedirect e o storage for remoto (Drive, S3, OneDrive) → redirect;
- se o provider não suportar nenhum dos dois → a conexão é inválida para entrega (erro explícito na configuração).

2.3. Endpoint único

GET /files/{storageRef}

O Core decide proxy vs. redirect internamente. O cliente nunca vê credenciais nem precisa conhecer a topologia do storage.

Para o PDF viewer, o cliente pode pedir o arquivo com Range; o Core encaminha conforme o modo:
- proxy: encaminha Range ao storage;
- redirect: se capabilities.rangeSupported, o redirect preserva o Range; senão, o Core cai para proxy (leitura) — o redirect permanece para download integral.

2.4. Thumbnails sempre via Core

Capas/previews são sempre servidas pelo modo proxy e cacheadas como imagens derivadas no Core (nunca cópias do PDF):
- hoje: previews do Nextcloud (/core/preview.png) reutilizados via proxy;
- futuro: geração própria no cache (ex.: primeira página) quando o provider não oferecer preview.

Thumbnails são cache (ADR-001 §5): se removidas, são regeneradas a partir do arquivo original.

2.5. Autenticação e autorização

- o acesso a /files exige autenticação do usuário dono da conexão (token da instalação hoje; identidade por usuário no futuro);
- credenciais do storage (OAuth, senha de app) vivem apenas no Core (criptografadas em repouso — ver Security Notes);
- links assinados: expiração curta (minutos), escopo restrito ao arquivo solicitado, emitidos pelo Core com a credencial de serviço;
- um storageRef de um usuário nunca é resolvível por outro usuário.

2.6. Não-duplicação de arquivos (regra explícita)

- o modo redirect impede, por construção, que o servidor tenha o arquivo — o cliente baixa direto do provedor;
- o modo proxy transmite em stream e não persiste o conteúdo;
- o Core não mantém cache de PDFs em nenhuma hipótese;
- PDF baixado para leitura offline no dispositivo do cliente é cache do dispositivo (ADR-001 §5), não posse do servidor.

3. Consequências positivas

- banda do servidor não escala com o tráfego de arquivos no cenário multi-tenant (redirect);
- custo zero no cenário atual (proxy para Nextcloud local);
- fronteira do ADR-001 §9 preservada: o cliente só recebe URLs emitidas pelo servidor, nunca credenciais;
- thumbnails independentes do provider, via Core;
- modelo pronto para novos providers sem alterar clientes.

4. Consequências negativas / trade-offs

- no redirect, a URL do provedor aparece no cliente — aceito: é efêmera, escopada ao arquivo e emitida pelo servidor;
- dependência do suporte do provider a links assinados/Range — declarado em capabilities e tratado com fallback para proxy;
- o servidor não pode cachear arquivos para performance — alinhado com o princípio de não-duplicação, aceito;
- implementação de OAuth por provider é trabalho adicional por integração (porém isolado no adapter do provider).

5. Critério de aceitação

- Cenário atual: GET /files/{storageRef} de um linked file do Nextcloud local entrega o PDF (com Range funcional) via proxy, sem criar cópia no Core;
- Cenário futuro (simulado): um provider com signedRedirect devolve redirect para URL efêmera do storage, sem tráfego pelo Core;
- thumbnails servidas via Core para ambos os casos;
- acesso não autenticado ou de outro usuário é rejeitado.

6. Relação com a documentação anterior

Complementa ADR-001 §9 (fronteira da API), ADR-002 (resolução de storage reference) e ADR-003 (stack: Fastify suporta streaming/Range). Nenhuma premissa anterior foi contrariada.

7. Status

ACEITO — Fase 0

Referência atual para: entrega de arquivos, capacidades de StorageProvider, thumbnails, autenticação de acesso a arquivos.

8. Próximo documento

UhHu_API_Initial_Spec.md (endpoints documents/collections/search/files/thumbnails/sync) e UhHu_Security_Notes.md (segredos, OAuth, HTTPS), com as decisões dos ADRs 001–004 embutidas.
