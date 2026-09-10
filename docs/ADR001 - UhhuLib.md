ADR-001 — Fontes de Verdade e Desacoplamento de Integrações

Projeto: UhHu!
Produto: UhHu! Lib
Fase: Fase 0 — Fundação e decisões
Status: Aceito
Data: 13/08/2026
Tipo: Decisão arquitetural

1. Contexto

O UhHu! Lib nasceu da necessidade de organizar e navegar uma biblioteca acadêmica de PDFs, inicialmente utilizando:

Zotero para gerenciamento bibliográfico, leitura, annotations e referências;
Nextcloud como armazenamento dos PDFs;
WebDAV/cliente desktop para disponibilizar os arquivos no sistema operacional;
UhHu! Lib como camada visual de organização, descoberta e acesso.

Os testes realizados na Fase 0 demonstraram que o Zotero 9.0.6 consegue trabalhar com Linked Files armazenados na árvore sincronizada pelo Nextcloud, inclusive permitindo leitura, marcações e annotations no Zotero Reader e acesso à mesma estrutura em outro dispositivo.

O contexto original do projeto previa o Kerko como camada intermediária entre Zotero e UhHu!. A investigação posterior, entretanto, demonstrou que a Zotero Web API v3 já disponibiliza metadados, informações de attachments e full-text indexado pelo Zotero.

Também foi constatado que o Kerko possui funções que se sobrepõem às competências que o UhHu! pretende desenvolver, especialmente busca, navegação e facetas.

Por isso, esta decisão revisa a arquitetura inicialmente imaginada.

2. Decisão
2.1. UhHu! Core é independente de Zotero

O Zotero é uma integração prioritária, natural e importante, mas não é uma dependência conceitual do UhHu! Lib nem do futuro UhHu! Core.

O UhHu! deve ser capaz, futuramente, de existir sem Zotero.

A integração Zotero será implementada por meio de um Zotero Adapter, responsável por traduzir os dados e capacidades do Zotero para os conceitos do UhHu!.

Conceitualmente:

                    UhHu! Core
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   Zotero Adapter   Storage Layer   outras integrações
          │              │
          ▼              ▼
       Zotero        Nextcloud
                     WebDAV
                     Google Drive
                     OneDrive
                     Dropbox
2.2. UhHu! não será um competidor do Zotero

O UhHu! não deve reproduzir as competências maduras do Zotero.

A responsabilidade bibliográfica completa permanece com o Zotero quando essa integração estiver presente.

O UhHu! precisa apenas de metadados suficientes para organização e descoberta, por exemplo:

título;
autor(es);
ano;
identificadores relevantes;
tags;
coleções;
tipo de documento;
referência aos arquivos.

Não faz parte do escopo do UhHu! reproduzir, como competência própria:

gerenciamento bibliográfico completo;
estilos de citação;
integração com processadores de texto;
gerenciamento avançado de referências;
Zotero Reader;
annotations do Zotero;
sincronização bibliográfica do Zotero.
Princípio

UhHu! complementa ferramentas bibliográficas; não busca substituí-las.

2.3. O Zotero permanece autoridade bibliográfica no modo integrado

Quando o usuário utilizar Zotero, os dados bibliográficos que o UhHu! consumir devem ser tratados como provenientes do Zotero.

A divisão de responsabilidades é:

Zotero
  → bibliografia, referências, leitura e annotations


Storage Provider
  → arquivos físicos


UhHu! Core
  → organização, descoberta, integração e experiência


Obsidian
  → elaboração do conhecimento

O UhHu! pode manter uma representação local/cache dos dados necessários à sua experiência, mas não deve criar uma segunda fonte conflitante para os dados cuja autoridade pertence ao Zotero.

3. Storage é uma abstração independente

O Nextcloud é o storage de referência do primeiro caso de uso, mas não deve ser uma dependência arquitetural do UhHu!.

O UhHu! deve trabalhar conceitualmente com uma abstração de StorageProvider ou equivalente.

Possíveis implementações futuras:

StorageProvider
├── Local filesystem
├── WebDAV
├── Nextcloud
├── S3-compatible
├── Google Drive
├── Dropbox
└── OneDrive
Importante

O requisito de que o serviço forneça uma árvore de arquivos nativa ao sistema operacional é uma exigência específica da integração:

Zotero + Linked Files

Não é requisito geral do UhHu! Lib.

Por exemplo:

Nextcloud Desktop
      ↓
filesystem local
      ↓
Zotero Linked Files

é necessário para o workflow Zotero validado.

Já o UhHu! poderá, futuramente, acessar um serviço como Google Drive ou OneDrive por API/OAuth, sem que esse serviço precise ser montado como filesystem local.

4. PDF: fonte física única

Esta é uma restrição fundamental.

O UhHu! Lib jamais deve criar cópias persistentes dos PDFs como parte de sua biblioteca.

No caso de uso atual:

                 Nextcloud
                     │
                     ▼
                  PDF físico
                  /arquivo.pdf
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
       Zotero              UhHu! Lib
   Linked File          referência ao arquivo

O UhHu! deve armazenar uma referência ao arquivo, e não uma segunda cópia física.

Isso evita a multiplicação de milhares de PDFs e mantém o storage externo como fonte física única.

5. Cache não é fonte de verdade

O UhHu! poderá utilizar cache local ou servidor para:

metadados;
índices de busca;
thumbnails;
informações derivadas;
eventualmente PDFs para uso offline.

Entretanto:

Cache é cache; não é uma nova fonte de verdade.

Particularmente:

PDF offline no UhHu!
       ≠
novo PDF pertencente ao UhHu!

Quando o cache for removido, o arquivo original deve continuar existindo no Storage Provider.

6. Full-text

No modo integrado ao Zotero, o UhHu! deve aproveitar, sempre que tecnicamente adequado, o full-text indexado pelo próprio Zotero, em vez de criar imediatamente um segundo pipeline de extração de PDFs.

O Zotero consegue indexar Linked Files e sua Web API v3 disponibiliza conteúdo full-text indexado.

Assim, conceitualmente:

PDF no Storage
      ↓
Zotero Linked File
      ↓
Zotero full-text index
      ↓
Zotero API
      ↓
Zotero Adapter
      ↓
UhHu! search/index

Isso não significa que o UhHu! será permanentemente dependente do índice do Zotero.

No futuro, quando funcionar sem Zotero, o UhHu! poderá possuir seu próprio pipeline de extração/indexação.

7. Kerko não é dependência arquitetural

O Kerko foi investigado como possível camada entre Zotero e UhHu!.

A conclusão da Fase 0 é:

Kerko não será uma dependência obrigatória do UhHu! Core nem da integração Zotero.

O Kerko pode ser reconsiderado se, durante a implementação, demonstrar uma vantagem substancial no backend, por exemplo:

redução significativa de complexidade;
mecanismo de indexação difícil de reproduzir;
sincronização significativamente melhor;
componentes reutilizáveis que tragam grande benefício.

Caso contrário, a integração Zotero deverá preferencialmente utilizar diretamente a Zotero Web API ou um adapter próprio.

Regra

Não introduzir uma dependência externa apenas porque ela já resolve uma parte do problema. A dependência precisa justificar seu custo e acoplamento por uma vantagem substancial.

Consequência

Se o Kerko perder suporte ou desaparecer:

Kerko desaparece
       ↓
UhHu! Zotero Adapter continua
       ↓
Zotero Web API
       ↓
UhHu! Core

A integração Zotero não deve quebrar por causa disso.

8. Modelo conceitual

O núcleo deve trabalhar com conceitos próprios do UhHu!, e não com entidades específicas de Zotero, Kerko ou Nextcloud.

Exemplo inicial:

Document
├── identity
├── title
├── authors
├── publication
├── dates
├── identifiers
├── tags
├── collections
└── attachments
      └── storage reference

A integração pode acrescentar informações específicas:

Document
└── integrations
      └── zotero
            └── itemKey

O itemKey do Zotero é uma referência de integração, não a identidade ontológica do documento no UhHu!.

9. Fronteira da API

O frontend não deve conversar diretamente com:

Zotero;
Nextcloud;
WebDAV;
Google Drive;
OneDrive;
outros serviços externos.

Fluxo:

Frontend
   ↓
UhHu API / Core
   ↓
Adapters / Providers
   ↓
serviços externos

Isso permite:

segurança;
cache;
controle de autenticação;
substituição de integrações;
múltiplos clientes;
Web e Android;
futura expansão para Planner e RSL.
10. Consequências positivas

Esta decisão permite:

Independência do Zotero

O UhHu! pode futuramente funcionar com:

Zotero;
outro gerenciador bibliográfico;
importação de metadados;
biblioteca nativa UhHu!.
Independência do storage

O mesmo núcleo pode trabalhar com:

Nextcloud;
WebDAV;
Google Drive;
OneDrive;
Dropbox;
filesystem local;
S3-compatible.
Independência do Kerko

A integração Zotero não depende de um projeto intermediário específico.

Evolução para o ecossistema UhHu!

O mesmo Core pode futuramente servir:

                    UhHu! Core
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
           Lib        Planner        RSL
11. Consequências negativas / trade-offs

A principal consequência é que o UhHu! terá de construir alguma infraestrutura própria que poderia ser obtida parcialmente através do Kerko.

Isso pode incluir:

indexação;
busca;
facetas;
sincronização de dados;
representação interna de documentos.

Entretanto, essa complexidade é aceita porque:

são competências centrais do produto;
precisamos de independência do Zotero;
precisamos de independência do storage;
não queremos acoplamento desnecessário;
o escopo inicial será deliberadamente pequeno.

Não devemos implementar tudo imediatamente.

12. Escopo da Fase 0 após esta decisão

O próximo experimento técnico será:

Zotero
  ↓
Zotero Web API v3
  ↓
Zotero Adapter experimental
  ↓
UhHu! Document

Utilizando um PDF Linked File já existente no laboratório:

/home/paulo/NextCloud/UhHu Lib/Zotero Teste

O experimento deverá verificar:

identificação do item;
metadata mínima;
tags;
coleções;
identificação do attachment;
identificação de que se trata de Linked File;
full-text indexado;
relação entre item e attachment;
referência necessária para localizar o arquivo no Storage Provider.

Não será criado nenhum mecanismo de cópia dos PDFs.

13. Critério de aceitação

A decisão será considerada tecnicamente validada quando conseguirmos demonstrar:

Zotero
  │
  ├── metadata ───────────┐
  ├── full-text ──────────┤
  └── attachment ref ─────┤
                          ▼
                    Zotero Adapter
                          │
                          ▼
                     UhHu! Core
                          │
                          ▼
                  Storage Provider
                          │
                          ▼
                       PDF

com o PDF físico permanecendo exclusivamente no storage.

14. Relação com a documentação anterior

Este ADR atualiza decisões preliminares registradas durante o brainstorm e na documentação da Fase 0.

Em especial, a documentação anterior apresentava Kerko como possível camada de indexação e como parte do primeiro vertical slice. A investigação realizada posteriormente demonstrou que isso não precisa ser uma decisão arquitetural.

O princípio mais amplo já existente permanece válido:

A API deve trabalhar com conceitos abstratos e não ficar amarrada a Zotero/Kerko/Nextcloud.

Este ADR torna esse princípio operacional.

15. Status

ACEITO — Fase 0

Esta decisão deve ser considerada a referência atual para:

arquitetura de integração Zotero;
armazenamento de PDFs;
papel do Kerko;
abstração de storage;
desenho inicial do UhHu! Core.

Se um experimento posterior contrariar estas premissas, deve ser produzido um novo ADR ou uma revisão deste documento.

16. Próximo documento

Próximo artefato recomendado:

UhHu_Zotero_Adapter_Investigation.md
Objetivo

Documentar experimentalmente o que a Zotero Web API v3 consegue fornecer para um Linked File real, incluindo:

metadata;
attachment;
full-text;
identificação do arquivo;
relação entre documento e storage;
sincronização/atualização.

O experimento deverá utilizar a biblioteca de teste já criada no ambiente real do UhHu! Lib.
