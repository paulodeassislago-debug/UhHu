# UhHu! — Visão e arquitetura inicial do ecossistema

> Documento histórico de visão conceitual. A visão vigente da suite e da arquitetura está no addendum §24 e em [[UhHu_Suite_Visao_2026-09-09]].

---

## 1. Contexto e problema original

A necessidade inicial surgiu da gestão da biblioteca acadêmica do doutorado.

- A VPS possui aproximadamente **200 GB** de armazenamento, com apenas cerca de **35 GB usados**, deixando ampla margem para armazenar a biblioteca de PDFs.
- O **Nextcloud já está instalado na VPS** e conectado ao Obsidian via WebDAV.
- A ideia é manter o **Nextcloud como “casa” dos PDFs**.
- O Zotero é considerado a ferramenta principal para:
  - leitura;
  - highlights;
  - annotations;
  - notas;
  - referências bibliográficas;
  - sincronização entre dispositivos.
- O Obsidian é usado como espaço de elaboração e organização do conhecimento.
- O problema percebido no Zotero é principalmente a **experiência de organização e descoberta visual da biblioteca**: interface menos intuitiva, pouca sensação de “estante”, filtros e navegação visual inferiores ao que foi construído anteriormente no Notion.
- O Omnivore havia sido usado como referência de experiência, especialmente como biblioteca visual, mas foi descontinuado.
- O Readwise Reader também foi citado como referência de experiência de leitura/anotação multiplataforma, mas é considerado caro.

---

## 2. Insight central: não substituir o Zotero

A conclusão foi que o melhor caminho não é construir outro Zotero nem tentar reproduzir o Zotero Reader.

A divisão de responsabilidades desejada é:

| Sistema | Responsabilidade |
|---|---|
| **Zotero** | Fonte de verdade bibliográfica; leitura; highlights; annotations; notas; referências |
| **Nextcloud/WebDAV** | Armazenamento dos PDFs |
| **Kerko** | Indexação, busca e facetas sobre a biblioteca Zotero |
| **UhHu! Lib** | Interface visual, descoberta, organização e navegação da biblioteca |
| **Obsidian** | Elaboração do conhecimento e notas |
| **UhHu API/Core** | Camada de integração entre os componentes |
| **IA futura** | Assistência transversal, sem assumir autoria do pesquisador |

Princípio:

> **Zotero é o instrumento de trabalho; Obsidian é o espaço de elaboração; Nextcloud é o arquivo; UhHu! Lib é a estante; a API UhHu! é a infraestrutura que conecta tudo.**

---

## 3. Arquitetura inicial do UhHu! Lib

A arquitetura imaginada:

```text
                         ZOTERO
                   fonte de verdade
                         │
                    Zotero Sync
                         │
          ┌──────────────┴──────────────┐
          │                             │
          ▼                             ▼
    Zotero Cloud                   Nextcloud
    metadata/notes                 PDFs/WebDAV
          │                             │
          └──────────────┬──────────────┘
                         │
                    UhHu! API
                         │
               ┌─────────┼─────────┐
               ▼         ▼         ▼
             Kerko   Attachment   futuro
                     Gateway
                         │
                         ▼
                    UhHu! Lib
                   Web + Android
```

A recomendação foi **não fazer o frontend conversar diretamente com Zotero/Kerko/Nextcloud**.

Em vez disso:

```text
Frontend
   ↓
UhHu API
   ↓
Zotero / Kerko / Nextcloud / outros serviços
```

Vantagens:

- segurança;
- cache;
- melhor performance;
- abstração das tecnologias internas;
- possibilidade de substituir Kerko futuramente;
- possibilidade de adicionar novos serviços sem modificar os clientes;
- abertura para futuros aplicativos.

---

## 4. React Native + Expo

Foi considerada a ideia de construir o frontend com **React Native + Expo + TypeScript**, permitindo:

- Web;
- Android;
- grande compartilhamento de código;
- um único modelo de domínio;
- hooks e lógica compartilhados;
- design system compartilhado.

A ideia não é necessariamente produzir uma UI idêntica em todos os dispositivos, mas compartilhar a lógica e adaptar a experiência à plataforma.

Arquitetura possível:

```text
apps/
├── web/
└── mobile/

packages/
├── api/
├── models/
├── search/
├── filters/
├── ui/
└── config/
```

O PDF viewer próprio não precisa ser prioridade. O Zotero Reader deve continuar sendo a experiência principal de leitura e anotação.

---

## 5. Offline

A capacidade offline é particularmente importante.

Cenário desejado:

1. Usuário viaja com o tablet.
2. Zotero já possui dados e PDFs necessários localmente.
3. Usuário lê e anota offline.
4. Ao recuperar internet, o Zotero sincroniza.
5. Ao abrir o computador, as notas/annotations aparecem.
6. O workflow com Obsidian continua funcionando.

O UhHu! Lib pode futuramente ter dois níveis de offline:

### Offline Level 1 — catálogo

Cache local de:

- títulos;
- autores;
- capas;
- tags;
- coleções;
- abstracts;
- status;
- favoritos.

### Offline Level 2 — documentos

Download seletivo dos PDFs para leitura offline.

Regra importante:

> PDF offline no UhHu! deve ser tratado como **cache**, não como uma nova fonte de verdade.

Não criar uma segunda sincronização bidirecional de PDFs/annotations. Zotero continua sendo responsável pelas annotations e notas.

---

## 6. Deep links para Zotero

Foi considerado requisito importante que o UhHu! Lib consiga abrir o Zotero automaticamente.

No desktop, a ideia é utilizar o esquema/deep link do Zotero, por exemplo:

```text
zotero://select/library/items/ITEMKEY
```

No Android, utilizar o mecanismo de deep links disponível para abrir o aplicativo Zotero.

Na página de um item, a UX poderia ter:

```text
[ 📖 Ler ]
[ 🟠 Abrir no Zotero ]
[ 📝 Abrir no Obsidian ]
```

A intenção é:

- **Ler** → experiência de leitura do UhHu! quando fizer sentido;
- **Abrir no Zotero** → Zotero Desktop/Android;
- **Abrir no Obsidian** → nota correspondente.

Isso reforça a filosofia de que o UhHu! é um hub e não um substituto do Zotero.

---

## 7. Zotero na VPS?

Conclusão: **não hospedar um “Zotero Server” como núcleo da arquitetura**.

Preferência:

- Zotero como cliente nos dispositivos;
- Zotero Cloud para sincronização dos dados bibliográficos;
- Nextcloud na VPS para os PDFs;
- UhHu! API/Kerko como camada de serviços complementares.

Motivo principal:

> Não reinventar sincronização, conflitos, metadados e annotations quando o Zotero já resolve isso.

A VPS deve ser infraestrutura complementar, não uma tentativa de substituir o ecossistema Zotero.

---

## 8. Regra de ouro: Single Source of Truth

Cada tipo de dado deve ter um dono claro.

| Dado | Fonte/dono |
|---|---|
| Bibliografia | Zotero |
| Coleções | Zotero |
| Tags bibliográficas | Zotero |
| Annotations | Zotero |
| Notas de leitura | Zotero |
| PDFs | Nextcloud/WebDAV |
| Conhecimento elaborado | Obsidian |
| Índice de pesquisa | Kerko |
| Cache | UhHu API/app |
| Interface visual | UhHu! Lib |
| IA/recomendações | serviços futuros |

Objetivo:

> Evitar três bancos de dados parcialmente sincronizados contendo versões diferentes da mesma coisa.

---

# 9. Mudança conceitual: de UhHu! Lib para UhHu! Core

Durante a conversa surgiu uma ideia mais ampla.

O UhHu! Lib não deveria ser tratado como o centro arquitetural definitivo.

Ele deve ser:

> **o primeiro aplicativo construído sobre uma infraestrutura maior.**

A arquitetura conceitual passou a ser:

```text
                         UHHU!
                           │
                     Research Core
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
          Lib           Planner           RSL
```

Portanto, mesmo que inicialmente o Core seja pequeno, a API deve ser desenhada de maneira que futuros aplicativos possam utilizá-la.

---

## 10. UhHu! como ecossistema

A visão futura imaginada:

### UhHu! Lib

**Memória bibliográfica**

Pergunta central:

> “O que eu tenho e o que existe na minha biblioteca?”

Funções:

- biblioteca visual;
- busca;
- filtros;
- autores;
- temas;
- coleções;
- capas;
- PDFs;
- integração Zotero;
- integração Obsidian.

### UhHu! Planner

**Memória operacional**

Pergunta central:

> “O que preciso fazer e onde estou?”

A ideia surgiu originalmente como uma ferramenta para professores, mas a visão pode evoluir para planejamento acadêmico e projetos de pesquisa.

### UhHu! RSL

**Infraestrutura para revisão sistemática**

Pergunta central:

> “O que existe na literatura relevante para esta pergunta de pesquisa?”

Possíveis fontes futuras:

- CAPES;
- BDTD;
- SciELO;
- repositórios institucionais;
- outros repositórios nacionais e internacionais.

Fluxo conceitual:

```text
Pergunta de pesquisa
        ↓
Estratégia de busca
        ↓
Fontes / repositórios
        ↓
Resultados
        ↓
Deduplicação
        ↓
Triagem
        ↓
Critérios de inclusão/exclusão
        ↓
Corpus
        ↓
Extração
        ↓
Síntese
```

---

# 11. Filosofia do UhHu! RSL

Este ponto foi explicitamente definido como importante.

A IA **não deve escrever o texto acadêmico do pesquisador**.

A IA deve ajudar a:

- organizar;
- filtrar;
- encontrar referências;
- deduplicar;
- classificar;
- extrair campos;
- relacionar documentos;
- apontar possíveis lacunas;
- auxiliar na navegação do corpus.

A intenção é construir **guardrails explícitos** contra a transformação da ferramenta em “autor automático” de uma RSL.

Filosofia:

> **A IA auxilia o pesquisador; não substitui o pesquisador.**

Outro princípio desejado é a **rastreabilidade/proveniência**.

Idealmente, o sistema poderia informar:

- de onde veio um resultado;
- quando foi encontrado;
- por que foi sugerido;
- qual critério levou à inclusão/exclusão;
- qual fonte bibliográfica originou o registro.

Assim, a IA atua como **assistente de decisão metodológica**, e não como caixa-preta geradora de conclusões.

---

# 12. Entidades futuras do Research Core

A API não deve ser modelada exclusivamente em termos de Zotero/Kerko/Nextcloud.

É melhor trabalhar com conceitos abstratos.

Exemplos possíveis:

```text
/documents
/projects
/collections
/people
/sources
/tasks
/notes
/search
```

Uma entidade `Document` poderia futuramente representar:

```text
Document
├── identity
├── title
├── authors
├── publication
├── dates
├── identifiers
├── files
├── tags
├── collections
├── annotations
├── notes
├── projects
└── provenance
```

A implementação concreta pode vir de Zotero, Kerko ou outros sistemas.

---

# 13. Projects como entidade de primeira classe

Uma possibilidade futura particularmente importante é o conceito de `Project`.

Um projeto poderia conter:

```text
Project
├── documents
├── tasks
├── notes
├── searches
├── collections
├── RSLs
└── results
```

Exemplo:

```text
Projeto: Doutorado
├── Biblioteca relacionada
├── RSLs
├── Notas
├── Tarefas
├── Planejamento
└── Referências
```

Isso permitiria conectar naturalmente:

**Lib + Planner + RSL**

sem transformar os aplicativos em um único “superapp”.

---

# 14. Proveniência

A noção de proveniência pode se tornar uma característica importante do UhHu!.

Exemplo futuro:

```text
Documento X
│
├── encontrado em: CAPES
├── encontrado em: BDTD
├── importado em: data
├── adicionado ao Zotero
├── associado à RSL X
├── lido em: data
├── anotado no Zotero
├── nota criada no Obsidian
└── associado ao projeto "Tese"
```

Não é necessário implementar isso agora.

Mas a API deve evitar decisões que impossibilitem esse tipo de rastreabilidade no futuro.

---

# 15. IA como camada transversal

A IA não deve ser um componente exclusivo do RSL.

Visão futura:

```text
                    Research Core
                         │
            ┌────────────┼────────────┐
            │            │            │
           Lib        Planner        RSL
            │            │            │
            └────────────┼────────────┘
                         │
                      AI Layer
```

Exemplos futuros:

### Lib AI

- busca semântica;
- documentos relacionados;
- exploração do acervo;
- perguntas sobre o corpus.

### Planner AI

- identificar tarefas bloqueadas;
- relacionar tarefas a documentos/projetos;
- auxiliar planejamento.

### RSL AI

- apoio à triagem;
- classificação;
- extração;
- relacionamento entre estudos.

A IA consulta o ecossistema; ela não deve ser dona dos dados.

---

# 16. Possível integração futura com MCP

A arquitetura pode futuramente oferecer:

```text
                Research Core
                     │
             ┌───────┴───────┐
             │               │
          REST API          MCP
             │               │
       aplicações         agentes
```

Ferramentas futuras poderiam incluir:

```text
search_documents()
get_document()
list_project_documents()
search_rsl()
list_tasks()
find_related_sources()
```

Sempre com permissões e limites explícitos.

Não é necessário implementar agora; é apenas uma direção que a arquitetura não deve impedir.

---

# 17. Visão de produto futura

A ideia de eventual distribuição do UhHu! surgiu depois da arquitetura pessoal.

Filosofia:

> **“Vamos construir exatamente a ferramenta que Paulo precisa para sua pesquisa; quando ela estiver madura, vamos descobrir se outras pessoas têm o mesmo problema.”**

Não começar como SaaS imaginário.

Primeiro resolver problemas reais.

Depois descobrir se existe uma categoria de produto.

---

## Modelo conceitual de distribuição

### Nível A — UhHu! Lib Basic / Local

Open source e autossuficiente.

Pode funcionar no servidor/PC/NAS do usuário.

O usuário escolhe o próprio storage:

- Google Drive;
- Dropbox;
- OneDrive;
- WebDAV;
- Nextcloud;
- S3-compatible;
- filesystem local;
- outros conectores.

A ideia é ter uma abstração:

```text
StorageAdapter
├── Local filesystem
├── WebDAV
├── Nextcloud
├── S3
├── Google Drive
├── Dropbox
└── OneDrive
```

### Nível B — UhHu! Integrated

Experiência completa com:

```text
Zotero
+
WebDAV/Nextcloud
+
Obsidian
+
UhHu! Lib
```

### Nível C — UhHu! AI / AI Pro

Serviço pago de IA hospedado na infraestrutura UhHu!.

Possíveis recursos:

- busca semântica;
- embeddings;
- RAG;
- comparação de documentos;
- pesquisa sobre o acervo;
- relações entre autores/temas;
- assistência de pesquisa;
- API/MCP;
- modelos mais avançados.

Princípio desejado:

> O usuário não deve ficar refém do serviço pago.

Se parar de usar o serviço de IA, o UhHu! Core/Lib, os dados e as integrações continuam funcionando.

---

# 18. Open source e integrações

A intenção é que o núcleo do UhHu! seja open source.

É importante, entretanto, não dizer simplesmente que “todo o ecossistema usado pelo UhHu! é open source”, porque integrações como Obsidian são proprietárias.

Formulação melhor:

> **UhHu! é open source e integra-se a ferramentas abertas e proprietárias escolhidas pelo usuário.**

Também ficou registrada a necessidade futura de fazer um **mapa de licenças e dependências**, especialmente para:

- Zotero;
- Kerko;
- Nextcloud;
- bibliotecas React Native;
- componentes de IA;
- integração com Obsidian.

Além disso, o uso da marca “Zotero” deve ser tratado separadamente das licenças de software.

---

# 19. Marca

Nome conceitual escolhido:

# **UhHu!**

Primeiro produto:

# **UhHu! Lib**

Outros produtos imaginados:

- **UhHu! Planner**
- **UhHu! RSL**

Possível posicionamento futuro:

> **UhHu! — Your open research ecosystem.**

Ou, em espírito:

> **Ferramentas para o seu próprio workflow de pesquisa.**

A marca não deve tentar se apresentar como “Zotero++”. A relação pode ser comunicada como integração:

> UhHu! Lib works with Zotero, Nextcloud, WebDAV and Obsidian.

---

# 20. Princípios arquiteturais que vale preservar

1. **Zotero continua sendo a autoridade bibliográfica.**
2. **Nextcloud/storage continua sendo a casa dos PDFs.**
3. **UhHu! não deve duplicar funções maduras sem necessidade.**
4. **A API deve ser própria e desacoplada das implementações internas.**
5. **O UhHu! Lib é o primeiro consumidor da API, não necessariamente o centro dela.**
6. **O Core deve trabalhar com entidades/conceitos, não apenas com APIs específicas de Zotero/Kerko.**
7. **Offline deve ser considerado desde o início, especialmente no Android.**
8. **PDFs offline são cache; não criar uma segunda fonte de verdade.**
9. **Deep links para Zotero são parte importante da experiência.**
10. **Projetos podem futuramente conectar Lib, Planner e RSL.**
11. **Proveniência e rastreabilidade são especialmente importantes para pesquisa acadêmica.**
12. **IA deve ser uma camada auxiliar, não autora do trabalho acadêmico.**
13. **O Core não deve depender da IA.**
14. **O software open source deve continuar útil sem o serviço pago de IA.**
15. **Não antecipar funcionalidades futuras; apenas evitar decisões que fechem portas.**
16. **Construir primeiro para resolver problemas reais do próprio workflow.**

---

# 21. Filosofia geral do UhHu!

A visão que emergiu da conversa pode ser resumida assim:

> **UhHu! não é uma coleção de aplicativos de produtividade nem uma IA que faz tudo. É uma infraestrutura aberta para o workflow intelectual do pesquisador, sobre a qual diferentes ferramentas especializadas podem ser construídas.**

Uma possível divisão conceitual:

| Ferramenta | Pergunta |
|---|---|
| **UhHu! Lib** | O que eu tenho e o que existe na minha biblioteca? |
| **UhHu! Planner** | O que estou fazendo e onde estou? |
| **UhHu! RSL** | O que existe na literatura relevante para minha pergunta? |
| **Zotero** | Quais são minhas fontes, evidências e annotations? |
| **Obsidian** | O que eu penso sobre tudo isso? |
| **UhHu! Core** | Como essas coisas se conectam? |
| **UhHu! AI** | Como posso ajudar o pesquisador a navegar esse ecossistema? |

A ideia central não é construir “uma IA que substitui o pesquisador”.

É construir um ecossistema em que:

> **o pesquisador permanece no centro, as ferramentas cuidam da infraestrutura e a IA ajuda sem assumir autoria ou autoridade.**

---

## 22. Próximo passo concreto

> ⚠️ **REVISTO EM 13/08/2026 — ver §23.** O milestone abaixo (UI do Lib como primeiro produto) foi superado pela decisão de que o produto é a API/Core: a UI de estante é substituível (Kerko/Zotero/Obsidian suprem) e não deve ser construída como produto. O §23 substitui este passo concreto.

Apesar da visão futura, o foco atual permanece deliberadamente pequeno:

### Primeiro construir o UhHu! Lib para uso pessoal.

Primeiro milestone:

```text
Zotero
   ↓
Kerko
   ↓
UhHu API
   ↓
Web
```

Com:

- grid de capas;
- busca;
- filtros;
- autores;
- tags;
- coleções;
- página do documento;
- thumbnails;
- abertura do PDF;
- deep link para Zotero.

Depois:

```text
UhHu API
   ├── Web
   └── Android
```

Depois:

- offline;
- cache;
- download seletivo de PDFs;
- integração mais profunda com Obsidian.

Só posteriormente considerar:

- UhHu! Planner;
- UhHu! RSL;
- AI Layer;
- MCP;
- distribuição pública.

**Regra de escopo:** a visão futura deve influenciar a arquitetura, mas não deve transformar o primeiro produto em um projeto gigantesco.

---

## Frase para lembrar o espírito do projeto

> **“Vamos construir exatamente a ferramenta que Paulo precisa para sua pesquisa; quando ela estiver madura, vamos descobrir se outras pessoas têm o mesmo problema.”**

---

# 23. Decisão 13/08/2026 — O produto é a API/Core

## Contexto: o gatilho

A declaração do Zotero Team (dstillman, fórum oficial, 15/07/2024) — *"The mobile apps support stored files synced via Zotero Storage or WebDAV. They don't and won't support linked files."* — derrubou a premissa de autonomia da Fase 0: o fluxo validado (Linked Files na árvore do Nextcloud + leitura/anotação no Zotero) não sobrevive no mobile, que é requisito inegociável (Paulo).

Consequência em cadeia:

1. A autoridade dos arquivos precisou ser transferida ao Zotero (stored files via Zotero Storage/WebDAV) — o UhHu! não controla mais a topologia dos arquivos (ADR-005 §4);
2. Com isso, a "autonomia" pensada na Fase 0 (UhHu! como estante sobre PDFs do Nextcloud) desmanchou;
3. O "nível 1" como app (cadastrar livro, estante, notas) ficou reduzido a praticamente nada: **o Kerko supre a estante com busca; o Zotero supre o cadastro e as notas por item; o Obsidian supre as notas** — todos maduros e já existentes.

## Decisão

- **O produto do UhHu! é a API/Core**: o modelo de dados unificado (Book/Document, Note, Project, Task), a proveniência e a integração automática entre as ferramentas do pesquisador.
- **As UIs são substituíveis**: quando uma UI madura existir, o Core a consome — não a reinventa. Para a estante visual, o caminho concreto é um **fork do Kerko** (busca, facetas e coleções já prontos) com tema próprio — não há necessidade de construir UI de estante do zero.
- O primeiro cliente do Core é o **Researcher** (ver [[ADR006 - Researcher Primeiro Produto]]): backend Core-ready + frontend com memória de pesquisas sobre a produção da pós-graduação brasileira (BDTD/CAPES). O Lib fica suspenso como produto (estante, quando necessária → fork do Kerko).

## Consequências

- O §22 está desatualizado (ver aviso acima): nenhuma UI de estante será construída como produto; se a estante for necessária, o Kerko é candidato.
- A consolidação da revisão completa dos documentos (ADR-005 v2, spec, vertical slice, security, deployment) fica pendente — próxima etapa da Fase 0.

---

# 24. Revisão de 09/09/2026 — Suite, Core compartilhado e PostgreSQL

A visão foi ampliada: o UhHu! é uma **suite de aplicativos** composta por UhHu
Lab, Lib, Note, Plan e Prof, sobre o UhHu CORE.

A decisão vigente é:

- o projeto permanece em monorepo pnpm/TypeScript;
- o CORE é um backend compartilhado, headless e modular (modular monolith);
- não haverá backend independente por app no início;
- o CORE não será apenas um gateway que encaminha chamadas para backends;
- REST, CLI e MCP são superfícies dos mesmos casos de uso do CORE;
- um worker pode ser separado como processo para jobs longos, sem criar um
  backend independente por produto;
- PostgreSQL self-hosted é a persistência canônica, fora do Supabase;
- dev e produção usam bancos, volumes, credenciais e ambientes separados;
- SQLite fica reservado a cache, uso local e offline;
- a extração futura de um módulo para serviço independente depende de evidência
  operacional, não de antecipação.

Esta revisão substitui a escolha de SQLite como banco principal descrita neste
documento e formaliza a arquitetura em [[ADR009 - Core Compartilhado Modular e PostgreSQL]].
O primeiro módulo/cliente é o **UhHu Lab**, anteriormente chamado Researcher.
Plan e Prof herdam partes distintas do Planner-Docente; suas fronteiras devem ser
preservadas mesmo dentro do CORE compartilhado.

