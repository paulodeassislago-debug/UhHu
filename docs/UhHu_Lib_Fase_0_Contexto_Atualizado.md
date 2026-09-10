# UhHu! Lib — Contexto de Continuidade | Fase 0 (histórico)

> Documento histórico do ciclo inicial do Lib. A arquitetura vigente da suite é
> o CORE compartilhado modular com PostgreSQL, conforme [[ADR009 - Core Compartilhado Modular e PostgreSQL]].
> O próximo produto é o UhHu Lab; este documento não autoriza iniciar o slice do Lib.

**Projeto:** UhHu!  
**Chat de origem:** UhHU Lib - Primeiro Brainstorm  
**Próximo chat:** UhHu! Lib - Fase 0  
**Data:** 12/08/2026  
**Status:** Documento histórico; Fase 0 do Lib encerrada e fora do caminho crítico atual

---

# 1. Propósito deste documento

Este documento é o contexto de continuidade para iniciar a **Fase 0 do UhHu! Lib**.

Ele consolida:

- a visão construída no primeiro brainstorm;
- decisões arquiteturais já tomadas;
- limites de escopo;
- princípios do projeto;
- roadmap;
- e, especialmente, a divisão entre **ambiente documental** e **ambiente de implementação**.

A biblioteca do projeto deve ser considerada a **memória persistente e fonte da verdade do projeto**.

> **Conversas são sessões de trabalho. Documentos são memória do projeto.**

---

# 2. Regra fundamental de workflow

Foi definida uma separação explícita entre dois ambientes.

## Este ambiente de ChatGPT

É o **ambiente de desenvolvimento documental e conceitual**.

Aqui serão desenvolvidos:

- contexto;
- arquitetura;
- decisões;
- ADRs;
- requisitos;
- especificações funcionais;
- especificações de UX;
- contratos de API;
- modelos de dados;
- roadmaps;
- planos de implementação;
- planos de testes;
- documentação;
- pesquisa técnica;
- trade-offs;
- visão futura;
- registros de decisões.

O objetivo principal aqui **não é escrever o código do produto**.

## Ambiente separado de código

Será utilizado para:

- implementação;
- código;
- testes;
- debugging;
- refactoring;
- execução;
- deployment;
- experimentação diretamente no software.

O ambiente de código poderá receber os documentos produzidos aqui como especificações.

Se a implementação revelar que alguma decisão precisa mudar, essa descoberta deve voltar para a documentação.

Fluxo:

```text
Problema
   ↓
Discussão
   ↓
Decisão
   ↓
Documento
   ↓
Implementação
   ↓
Descoberta
   ↓
Documento atualizado
   ↓
Nova implementação
```

---

# 3. Princípio da documentação

> **Se uma informação for importante para o futuro do projeto, ela não deve existir somente em uma conversa.**

Decisões importantes devem ser consolidadas em documentos e adicionadas à biblioteca do projeto.

A biblioteca funciona como:

> **memória persistente + fonte da verdade do projeto.**

Isso permite separar conversas por assunto/fase sem perder continuidade.

---

# 4. Problema original

A necessidade inicial surgiu da gestão da biblioteca acadêmica do doutorado.

A VPS possui aproximadamente:

- 200 GB de armazenamento;
- cerca de 35 GB usados atualmente.

Existe, portanto, ampla margem para armazenar a biblioteca de PDFs.

O Nextcloud já está instalado na VPS e conectado ao Obsidian via WebDAV.

Decisão:

> **A casa dos PDFs é o Nextcloud.**

---

# 5. Papel de cada ferramenta

| Ferramenta | Papel |
|---|---|
| **Zotero** | Fonte de verdade bibliográfica; leitura; highlights; annotations; notas; referências |
| **Nextcloud/WebDAV** | Armazenamento dos PDFs |
| **Kerko** | Indexação, busca e facetas da biblioteca Zotero |
| **UhHu! Lib** | Interface visual e descoberta da biblioteca |
| **Obsidian** | Elaboração do conhecimento e notas |
| **UhHu! API/Core** | Camada de integração |
| **IA futura** | Assistência transversal, sem substituir o pesquisador |

Princípio:

> **Zotero é o instrumento de trabalho; Obsidian é o espaço de elaboração; Nextcloud é o arquivo; UhHu! Lib é a estante; UhHu! Core é a infraestrutura de integração.**

---

# 6. Por que UhHu! Lib?

O Zotero é excelente para:

- leitura;
- highlights;
- annotations;
- notas;
- referências;
- sincronização.

Mas sua organização visual da biblioteca é considerada menos intuitiva.

O UhHu! Lib deve oferecer uma experiência semelhante à biblioteca construída anteriormente no Notion:

- capas;
- estante visual;
- busca;
- filtros dinâmicos;
- autor;
- tema;
- ano;
- coleções;
- descoberta;
- interface agradável.

O objetivo não é substituir o Zotero.

> **UhHu! Lib é uma camada de experiência visual sobre o ecossistema Zotero.**

---

# 7. Arquitetura conceitual

Arquitetura inicial:

```text
                         ZOTERO
                   fonte de verdade
                         │
                    Zotero Sync
                         │
          ┌──────────────┴──────────────┐
          │                             │
          ▼                             ▼
      Metadados                     Nextcloud
                                    PDFs/WebDAV
          │                             │
          └──────────────┬──────────────┘
                         │
                    UhHu! API
                         │
               ┌─────────┼─────────┐
               ▼         ▼         ▼
             Kerko   Attachments   futuro
                         │
                         ▼
                    UhHu! Lib
                   Web + Android
```

Regra:

```text
Frontend
   ↓
UhHu API
   ↓
Zotero / Kerko / Nextcloud / outros serviços
```

O frontend não deve depender diretamente das implementações internas dos serviços.

---

# 8. UhHu! Core

O primeiro brainstorm revelou que o Lib não deve ser tratado como o centro arquitetural definitivo.

A visão é:

```text
                    UHHU!
                      │
                Research Core
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
      Lib          Planner          RSL
```

O UhHu! Lib é:

> **o primeiro aplicativo construído sobre o Core.**

A API deve ser pequena no início, mas não deve ficar amarrada conceitualmente ao Zotero ou Kerko.

---

# 9. Entidades abstratas futuras

A API deve trabalhar progressivamente com conceitos como:

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

Possível entidade `Document`:

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

Não implementar tudo agora.

Princípio:

> **Não antecipar funcionalidades futuras; apenas evitar decisões que fechem portas.**

---

# 10. Single Source of Truth

| Dado | Fonte/dono |
|---|---|
| Bibliografia | Zotero |
| Coleções | Zotero |
| Tags bibliográficas | Zotero |
| Annotations | Zotero |
| Notas de leitura | Zotero |
| PDFs | Nextcloud/WebDAV |
| Conhecimento elaborado | Obsidian |
| Índice | Kerko |
| Cache | UhHu API/app |
| Interface | UhHu! Lib |

Não criar uma segunda fonte de verdade para PDFs ou annotations.

PDF offline no UhHu! deve ser tratado como **cache**.

---

# 11. Plataforma

Foi considerada a utilização de:

**React Native + Expo + TypeScript**

para compartilhar lógica entre:

- Web;
- Android.

A experiência pode ser adaptada à plataforma.

Primeiro cliente: **Web**.

Android: etapa posterior.

---

# 12. Offline

Offline é requisito importante.

Cenário:

1. Paulo viaja com o tablet.
2. Zotero possui dados necessários localmente.
3. Paulo lê e anota offline.
4. Ao recuperar internet, Zotero sincroniza.
5. O computador recebe as alterações.
6. O Obsidian continua integrado ao workflow.

No UhHu!:

### Nível 1

Cache local de:

- metadata;
- capas;
- tags;
- coleções;
- abstracts.

### Nível 2

Download seletivo de PDFs.

Não criar sincronização paralela de annotations.

---

# 13. Deep links para Zotero

O UhHu! Lib deverá conseguir abrir o Zotero.

Desktop:

```text
zotero://select/library/items/ITEMKEY
```

No Android, utilizar o mecanismo de deep linking disponível para o aplicativo.

UX desejada:

```text
[ 📖 Ler ]
[ 🟠 Abrir no Zotero ]
[ 📝 Abrir no Obsidian ]
```

O UhHu! deve ser um hub, não um substituto do Zotero Reader.

---

# 14. Zotero na VPS

Decisão atual:

> **Não transformar a VPS em um servidor Zotero.**

Preferência:

- Zotero como cliente nos dispositivos;
- Zotero Cloud para sincronização bibliográfica;
- Nextcloud na VPS para PDFs;
- Kerko/UhHu API como serviços complementares.

---

# 15. Primeiro vertical slice

A primeira cadeia completa a validar:

```text
Zotero
  ↓
Kerko
  ↓
UhHu API
  ↓
UhHu Web
  ↓
PDF / attachment
  ↓
Zotero deep link
```

Se isso funcionar, teremos colocado o primeiro tijolo real do UhHu!.

---

# 16. Fase 0 — objetivo

A Fase 0 **não é ainda a construção do produto**.

É uma fase de investigação e validação técnica.

Pergunta central:

> **A infraestrutura Zotero + Nextcloud/WebDAV + Kerko funciona suficientemente bem para servir de fundação ao UhHu! Lib?**

---

# 17. Questões técnicas da Fase 0

Investigar:

1. Como está instalado o Nextcloud na VPS?
2. Como os PDFs estão armazenados atualmente?
3. Como o Zotero está configurado?
4. Qual versão do Zotero está sendo utilizada?
5. Onde estão os attachments atualmente?
6. Como configurar o Kerko na VPS?
7. Kerko consegue enxergar/indexar os attachments?
8. Como disponibilizar os PDFs de forma segura?
9. Como gerar/obter thumbnails/capas?
10. Como usar primeira página do PDF como fallback?
11. Como a UhHu API consumirá o Kerko?
12. Qual stack será usada para a API?
13. Qual stack será usada para o frontend Web?
14. Como proteger API e arquivos?
15. Qual estratégia de deployment será usada?
16. Quais são as implicações de licenciamento?
17. Quais decisões precisam virar ADRs?

**Regra:** antes de escrever código, entender e validar a infraestrutura existente.

---

# 18. O que produzir na Fase 0

O ambiente documental deverá produzir principalmente:

### Documento de arquitetura

```text
UhHu_Core_Architecture.md
```

### ADRs

Exemplos:

```text
ADR-001 — Source of Truth
ADR-002 — PDF Storage
ADR-003 — Kerko as Search Layer
ADR-004 — UhHu API Boundary
ADR-005 — Frontend Stack
```

Os números/títulos são apenas exemplos; devem ser definidos conforme a investigação.

### Especificações

Possíveis documentos:

```text
UhHu_API_Initial_Spec.md
UhHu_Lib_First_Vertical_Slice.md
UhHu_Security_Notes.md
UhHu_Deployment_Notes.md
```

Não criar documentos desnecessários apenas para preencher uma estrutura.

---

# 19. Roadmap geral

## Fase 0 — Fundação e decisões

Validar:

- Zotero;
- Nextcloud/WebDAV;
- attachments;
- Kerko;
- thumbnails;
- PDFs;
- deep links;
- API;
- segurança;
- licenças.

---

## Fase 1 — Minha biblioteca

Construir para uso pessoal:

- UhHu API v0;
- UhHu Web v0;
- biblioteca;
- busca;
- filtros;
- item;
- PDF;
- deep link Zotero.

---

## Fase 2 — UX visual

- capas;
- primeira página como fallback;
- grid/lista;
- preview;
- filtros dinâmicos;
- autores;
- temas;
- coleções.

---

## Fase 3 — Android

- React Native/Expo;
- biblioteca;
- busca;
- filtros;
- item;
- PDF;
- deep links.

---

## Fase 4 — Offline

- cache;
- SQLite/local DB;
- metadata;
- capas;
- PDFs selecionados.

---

## Fase 5 — Integrações profundas

- Zotero;
- Nextcloud;
- Obsidian;
- deep links;
- referências;
- workflow de leitura/anotação.

---

## Fase 6 — UhHu! Lib v1

Critério:

> **Paulo usaria o UhHu! Lib diariamente em vez do sistema anterior?**

---

## Fase 7 — Distribuição

Preparar:

- configuração;
- Docker;
- deployment;
- storage adapters;
- documentação;
- backup;
- instalação.

---

## Fase 8 — Open Source

Possível organização:

```text
uhhu-core
uhhu-api
uhhu-lib-web
uhhu-lib-mobile
docs
```

Antes da distribuição:

- mapear licenças;
- mapear dependências;
- verificar marcas;
- documentar instalação.

---

# 20. Futuro — UhHu! Planner

Originalmente pensado como ferramenta para professores.

A visão pode evoluir para planejamento de:

- pesquisa;
- projetos;
- atividades acadêmicas;
- produção intelectual.

Possível conexão:

```text
Planner
   │
   ├── Projects
   ├── Tasks
   ├── Deadlines
   └── Documents
             ↓
          UhHu Lib
```

Não faz parte da Fase 0.

---

# 21. Futuro — UhHu! RSL

Visão:

> **Infraestrutura para revisão sistemática e pesquisa bibliográfica rastreável.**

Fontes futuras possíveis:

- CAPES;
- BDTD;
- SciELO;
- repositórios institucionais;
- outras fontes.

Fluxo:

```text
Pergunta
 ↓
Estratégia
 ↓
Busca
 ↓
Resultados
 ↓
Deduplicação
 ↓
Triagem
 ↓
Inclusão/exclusão
 ↓
Corpus
 ↓
Extração
 ↓
Síntese
```

---

# 22. Filosofia de IA no UhHu! RSL

Decisão conceitual explícita:

> **A IA não escreverá nenhuma linha do texto acadêmico do pesquisador.**

A IA pode ajudar a:

- encontrar;
- organizar;
- filtrar;
- classificar;
- deduplicar;
- extrair;
- relacionar;
- sugerir;
- apontar lacunas;
- navegar o corpus.

A IA não deve:

- escrever a RSL;
- substituir a análise;
- fabricar referências;
- assumir autoridade sobre conclusões.

Devem existir **guardrails explícitos**.

Aproximação desejada:

> **IA como assistente de decisão metodológica, não como autora.**

---

# 23. Proveniência futura

Uma característica potencialmente importante:

```text
Documento X
├── encontrado em CAPES
├── encontrado em BDTD
├── importado em data
├── associado à RSL X
├── lido em data
├── anotado no Zotero
└── nota criada no Obsidian
```

Não implementar agora.

Apenas evitar que a arquitetura impossibilite isso.

---

# 24. IA como camada transversal

Futuramente:

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

A IA não deve ser dependência estrutural do Core.

O sistema deve funcionar sem IA.

---

# 25. MCP futuro

Possibilidade:

```text
                Research Core
                     │
             ┌───────┴───────┐
             │               │
          REST API          MCP
             │               │
       aplicações         agentes
```

Possíveis ferramentas:

```text
search_documents()
get_document()
list_project_documents()
search_rsl()
list_tasks()
find_related_sources()
```

Não implementar na Fase 0.

---

# 26. Princípios do projeto

1. Construir primeiro para resolver problemas reais.
2. Cada fase deve ser útil mesmo sem a próxima.
3. Não construir um superapp.
4. Cada aplicativo deve resolver uma experiência específica.
5. UhHu Core conecta os aplicativos.
6. Zotero é a autoridade bibliográfica.
7. Nextcloud é a casa dos PDFs.
8. Obsidian é o espaço de elaboração.
9. UhHu! Lib é a camada visual.
10. IA é auxiliar, não autora.
11. Não antecipar funcionalidades futuras.
12. Evitar decisões que fechem portas.
13. Documentação é memória persistente.
14. A biblioteca do projeto é fonte da verdade.
15. Conversas são sessões de trabalho.
16. Código é desenvolvido em ambiente separado.
17. Este ambiente produz principalmente documentos, especificações e decisões.

---

# 27. Gates

O roadmap não deve ser uma sequência rígida.

Usar gates:

### Gate 1

> Consigo acessar corretamente minha biblioteca?

### Gate 2

> A interface é melhor para mim que o Zotero para navegar no acervo?

### Gate 3

> Consigo usar no Android?

### Gate 4

> Consigo usar sem internet?

### Gate 5

> O UhHu! virou parte real do meu workflow?

### Gate 6

> Outra pessoa conseguiria instalar?

### Gate 7

> Existe um produto aqui?

---

# 28. Divisão de trabalho

## Paulo

**Product owner / pesquisador / usuário**

Define:

- problemas;
- prioridades;
- experiência;
- comportamento desejado;
- validação;
- critérios de sucesso.

## ChatGPT neste ambiente

**Arquiteto / analista / parceiro de documentação**

Ajuda a:

- pesquisar tecnologias;
- estruturar problemas;
- comparar alternativas;
- desenhar arquitetura;
- produzir documentos;
- registrar decisões;
- produzir especificações;
- questionar trade-offs;
- manter continuidade documental.

**Não é o ambiente principal de implementação.**

## Ambiente separado de código

Responsável por:

- implementação;
- testes;
- debugging;
- refactoring;
- execução;
- deployment.

---

# 29. Próximo chat

Nome:

> **UhHu! Lib - Fase 0**

A conversa deve começar a partir deste documento.

Objetivo:

> **Investigar tecnicamente a fundação Zotero + Nextcloud/WebDAV + Kerko + UhHu API.**

Primeiro resultado esperado:

> **Um conjunto pequeno de documentos que permita ao ambiente de código implementar o primeiro vertical slice sem depender do histórico do brainstorm.**

---

# 30. Frases de continuidade

> **O UhHu! Lib é o primeiro tijolo do UhHu!, não o produto final.**

> **Conversas são sessões de trabalho; documentos são memória do projeto.**

> **A biblioteca do projeto é a fonte da verdade.**

> **O ambiente documental define o que e por que construir; o ambiente de código implementa como construir.**

> **Vamos construir exatamente a ferramenta que Paulo precisa para sua pesquisa; quando ela estiver madura, vamos descobrir se outras pessoas têm o mesmo problema.**
