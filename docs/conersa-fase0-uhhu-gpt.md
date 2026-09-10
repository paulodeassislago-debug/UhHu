Resumo — Fase Zero do UhHu! Lib
1. Situação inicial

Você já possui:

VPS com bastante espaço disponível;
Nextcloud instalado;
WebDAV funcional;
cliente Nextcloud no computador pessoal;
Zotero 9.0.6 no Zorin OS.

O Zotero anteriormente utilizava o Koofr via WebDAV, mas esse modelo era diferente do que queremos para o UhHu! Lib.

Modelo anterior
Zotero
   ↓
PDF armazenado pelo Zotero
   ↓
WebDAV/Koofr
Modelo desejado
Nextcloud
   ↓
PDF físico
   ↓
Zotero Linked File

O Zotero não deve ser o proprietário físico do PDF.

2. Descoberta fundamental: Linked Files + Nextcloud

Foi configurado no Zotero o diretório-base dos anexos:

/home/paulo/NextCloud/UhHu Lib/Zotero Teste

Colocamos PDFs nessa pasta e configuramos o Zotero para trabalhar com eles como Linked Files.

Os testes foram positivos:

Zotero abre os PDFs;
Zotero Reader funciona;
marcações funcionam;
annotations funcionam;
a estrutura pode ser reproduzida em outro computador;
annotations e marcações continuam disponíveis no outro dispositivo.

Isso confirmou nossa hipótese central:

Se o serviço de nuvem disponibilizar a mesma estrutura de diretórios ao sistema operacional, o Zotero pode trabalhar com os arquivos como Linked Files sem precisar armazenar cópias dos PDFs.

3. Requisito fundamental do UhHu! Lib

Foi estabelecido um princípio que deve ser preservado:

O UhHu! Lib jamais deve duplicar fisicamente os PDFs.

Para uma biblioteca com milhares de documentos, seria péssimo ter:

Nextcloud
   └── PDF


Zotero
   └── cópia do PDF


UhHu!
   └── outra cópia do PDF

Queremos:

Storage
   └── PDF ← única cópia física


Zotero ──────► referência
UhHu! ───────► referência

O UhHu! deve referenciar o arquivo, não possuir uma segunda biblioteca física.

4. Nextcloud é o padrão, mas não deve ser uma dependência

Para o seu caso de uso, Nextcloud é o storage padrão.

Mas o produto UhHu! deverá ter horizonte para outros serviços:

Google Drive;
OneDrive;
Dropbox;
WebDAV;
eventualmente S3 etc.

Foi feita uma distinção importante:

Para Zotero + Linked Files

O serviço precisa fornecer uma estrutura de diretórios nativa ao sistema operacional.

Exemplo:

Nextcloud Desktop
       ↓
filesystem local
       ↓
Zotero Linked Files
Para o UhHu! em geral

Isso não é necessariamente necessário.

O UhHu! poderia acessar:

Google Drive
      ↑
     OAuth/API

sem montar o Drive como filesystem local.

Portanto, futuramente teremos uma abstração de Storage Provider.

5. Zotero não é dependência do UhHu!

Outra decisão importante:

Zotero é uma integração natural e prioritária, mas não é uma dependência conceitual do UhHu!

No seu caso de uso, a integração Zotero é praticamente necessária.

Mas o UhHu! deve continuar fazendo sentido sem Zotero.

A arquitetura desejada é aproximadamente:

                    UhHu! Core
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   Zotero Adapter   Storage Layer   outras integrações
          │              │
          ▼              ▼
       Zotero        Nextcloud
                     Google Drive
                     OneDrive
                     etc.

Ou seja:

Zotero Adapter, e não "Zotero dentro do núcleo".

6. UhHu! não será concorrente do Zotero

Também decidimos não tentar reproduzir o Zotero.

O UhHu! poderá trabalhar com:

autor;
ano;
título;
tags;
coleções;
identificadores;
classificação;
organização;
descoberta;
busca.

Mas não precisa reproduzir:

gerenciamento bibliográfico completo;
estilos de citação;
integração com editores de texto;
Zotero Reader;
annotations do Zotero;
todo o sistema bibliográfico do Zotero.

A ideia é:

Zotero
→ bibliografia, referências, leitura, annotations


UhHu!
→ organização, descoberta, integração e experiência


Storage
→ arquivos físicos
7. Investigação do Kerko

Inicialmente consideramos o Kerko como possível camada entre Zotero e UhHu!.

A investigação oficial mostrou que o Kerko:

trabalha com bibliotecas Zotero;
usa a Zotero Web API;
sincroniza metadados;
oferece busca;
oferece facets;
trabalha com tags e coleções;
possui recursos de full-text;
fornece uma interface web para navegação da biblioteca.

Porém percebemos uma sobreposição importante:

Grande parte do que o Kerko faz é justamente parte do espaço funcional que o UhHu! pretende ocupar.

Além disso, a implementação padrão do Kerko trabalha com attachments e mantém cópias locais, o que entra em tensão com nosso princípio de não duplicar PDFs.

8. A descoberta sobre full-text mudou a análise

Investigamos a documentação oficial do Zotero.

Descobrimos que:

Linked Files podem ser indexados

O Zotero consegue indexar PDFs que são Linked Files.

Portanto:

Nextcloud
   ↓
PDF
   ↓
Zotero Linked File
   ↓
Zotero Full-text Index
A Web API v3 fornece o full-text

A API do Zotero possui endpoints próprios para full-text.

Conceitualmente:

/items/<itemKey>/fulltext

e retorna conteúdo textual indexado, além de informações como páginas indexadas.

Também existe mecanismo de sincronização incremental do full-text.

Isso é extremamente importante porque significa que:

Não precisamos necessariamente baixar o PDF para obter seu conteúdo textual através do Zotero.

Podemos ter:

PDF
 ↓
Nextcloud


Full-text
 ↓
Zotero
 ↓
API
 ↓
UhHu!
9. Isso reduziu ainda mais a necessidade do Kerko

Chegamos então à pergunta:

O Kerko realmente ajuda ou é apenas uma camada redundante?

A conclusão provisória foi:

provavelmente é redundante.

A Zotero Web API já oferece matéria-prima suficiente para construir nossa própria integração:

Zotero API
├── metadata
├── collections
├── tags
├── attachments
└── full-text

Portanto podemos fazer:

Zotero
   ↓
Zotero Adapter
   ↓
UhHu! Core

em vez de:

Zotero
   ↓
Kerko
   ↓
UhHu!
10. Decisão sobre Kerko

Não descartamos o Kerko de maneira absoluta.

A decisão foi:

Kerko não será uma dependência arquitetural obrigatória.

Ele só deverá ser usado se demonstrar uma grande vantagem no backend que justifique:

dependência;
acoplamento;
manutenção;
risco futuro.

Se o Kerko desaparecer amanhã:

Kerko desaparece
       ↓
Zotero Adapter continua
       ↓
Zotero API
       ↓
UhHu! Core

A integração Zotero não deve quebrar.

Essa independência foi considerada mais importante do que simplesmente aproveitar uma solução existente.

11. Nova arquitetura conceitual

A arquitetura que emergiu da conversa é:

                         UHHU! CORE
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
   Zotero Adapter      Storage Layer       futuras integrações
          │                  │
          ▼                  ▼
       Zotero            Nextcloud
                         WebDAV
                         Drive
                         OneDrive
                         Dropbox

O frontend não deverá conversar diretamente com os serviços externos:

Frontend
   ↓
UhHu! API / Core
   ↓
Adapters / Providers
   ↓
serviços externos
12. Modelo conceitual inicial

Começamos a separar as entidades próprias do UhHu! das entidades externas.

Algo conceitualmente próximo de:

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

E uma integração pode acrescentar:

Document
└── integrations
      └── zotero
            └── itemKey

O itemKey do Zotero não deve ser a identidade fundamental do documento no UhHu!.

13. Full-text

No modo Zotero, a ideia atual é aproveitar o índice textual do Zotero:

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

Mas isso não significa que UhHu! ficará permanentemente dependente do Zotero para full-text.

No futuro, sem Zotero:

PDF
 ↓
UhHu! extractor
 ↓
UhHu! full-text index
14. Próximo passo definido

Depois de tudo isso, chegamos a um próximo experimento bastante específico:

Zotero Adapter experimental

Usar o PDF real que já está em:

/home/paulo/NextCloud/UhHu Lib/Zotero Teste

e testar a Zotero Web API v3.

Precisamos verificar:

identificação do item;
metadata;
tags;
coleções;
identificação do attachment;
identificação de Linked File;
full-text;
relação item ↔ attachment;
referência necessária para localizar o arquivo no Storage Provider.

Sem copiar o PDF.

O fluxo que queremos provar é:

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
15. O documento que tentamos produzir

A partir dessas decisões, tentamos criar:

ADR-001 — Fontes de Verdade e Desacoplamento de Integrações

O documento deveria formalizar:

UhHu! Core independente de Zotero;
Zotero como integração;
UhHu! não como concorrente do Zotero;
Storage como abstração;
Nextcloud como primeiro caso, não dependência;
PDFs como fonte física única;
cache não como fonte de verdade;
aproveitamento do full-text do Zotero;
Kerko como opcional;
frontend isolado dos serviços externos;
modelo conceitual próprio do UhHu!;
próximo experimento do Zotero Adapter.

Tentamos gerar o arquivo algumas vezes, mas a ferramenta de criação de arquivos estava indisponível. O conteúdo do ADR, entretanto, já foi elaborado.

Em uma frase

A principal descoberta da Fase Zero até aqui foi:

O UhHu! Lib deve ser uma camada independente de organização, descoberta e integração; Zotero é um adapter bibliográfico natural, Nextcloud é o storage padrão do nosso caso de uso, PDFs devem existir fisicamente uma única vez, e Kerko só merece entrar na arquitetura se provar uma vantagem de backend realmente significativa.

E o próximo passo técnico é parar de especular e provar, com nosso próprio PDF Linked File, o que conseguimos obter diretamente da Zotero Web API v3.
