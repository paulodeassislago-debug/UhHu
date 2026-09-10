---
tags:
  - uhhu
  - projeto
  - retomada
  - core
  - dev
  - code-server
date: 2026-09-09
status: ativo
tipo: snapshot de continuidade
---

# UhHu! — Contexto de Retomada (09/09/2026)

> Snapshot para iniciar a etapa DEV sem perder as decisões da sessão. O vault
> continua sendo a fonte da verdade documental; o código do produto ainda não
> foi iniciado.

## 1. Decisões consolidadas

- UhHu! é uma suite de apps: Lab, Lib, Note, Plan e Prof.
- O UhHu! CORE é o backend compartilhado, modular e headless da suite.
- REST, CLI e MCP serão superfícies dos mesmos casos de uso.
- Lab é o primeiro produto.
- O roadmap macro é: fundação → CORE v1 → Lab v1 → Lib v1 → Note v1 → Plan v1
  → Prof v1 → integração da suite → evolução.
- Plan e Prof formam um eixo posterior; Plan deve estabelecer o domínio de
  agenda/calendário antes de o Prof consumi-lo, evitando duplicação.
- Frontend padrão: React Native + Expo + TypeScript, com Android, iOS e Web como
  alvos e adaptação específica por plataforma quando necessário.
- Backend padrão: Node.js LTS + TypeScript strict + Fastify + Zod + Drizzle +
  PostgreSQL self-hosted.
- CLI e MCP permanecem no mesmo monorepo TypeScript.
- Tipos globais e schemas compartilhados ficam nos pacotes de contratos; `any` é
  proibido.
- Python, Go ou Rust ficam como portas abertas para workers especializados,
  somente quando uma necessidade concreta justificar.
- Segurança de desenvolvimento assistido por IA é gate desde o primeiro commit.
- Supabase é apenas material histórico do legado; não integra a arquitetura nova.

A decisão de stack reafirma o que já consta no ADR-003 (parcialmente vigente) e
no ADR-009. Não foi criado um ADR redundante.

## 2. Documentação vigente

- Visão da suite: [[UhHu_Suite_Visao_2026-09-09]].
- Roadmap geral: [[UhHu_Roadmap_Geral_2026-09-09]].
- Arquitetura: [[ADR009 - Core Compartilhado Modular e PostgreSQL]].
- Contrato inicial do CORE: [[UhHu_CORE_Contrato_Inicial]], ainda rascunho v0.1
  para validação por seções.
- Especificação do Lab: [[UhHu_Researcher_v1_Spec]], validada; Researcher é o
  nome histórico do Lab.
- Segurança: [[UhHu_Security_Notes]], `dev-docs/08-security-baseline.md` e
  `/projetos/UhHu/AGENTS.md`.
- Documentação limpa para desenvolvimento: `/projetos/UhHu/dev-docs/`.
- Codebase legada do Prof: `/projetos/UhHu/planner-docente`, somente pesquisa;
  clone limpo em `main` alinhado a `origin/main`.

## 3. Prontidão documental

A documentação necessária para iniciar o desenvolvimento existe e está
sincronizada:

- visão, ADRs, roadmap e contrato do CORE;
- spec do Lab e fatos dos adapters BDTD/CAPES;
- baseline de segurança e instruções para agentes;
- deployment notes com PostgreSQL, dev/prod separados e Docker;
- documentação DEV limpa e índice atualizado.

A etapa DEV pode começar com o esqueleto do monorepo e a fundação do CORE. O
contrato do CORE não deve ser tratado como totalmente congelado: os pontos em
aberto continuam sendo validados à medida que o primeiro slice real do Lab os
exercitar.

## 4. Verificação do code-server

Verificado em 09/09/2026:

- container `code-server`: ativo e `healthy`;
- `http://127.0.0.1:8443/healthz`: HTTP 200;
- smoke do OpenCode dentro do container: `OPENCODE_CS_SMOKE_OK`;
- gateway Hermes: ativo;
- clone legado `planner-docente`: `main...origin/main`, sem alterações;
- `/projetos/UhHu` no host: existe, dono `ubuntu:ubuntu`;
- `/projetos/UhHu`: ainda não é um repositório Git do produto, situação esperada
  antes do primeiro commit.

### Mount do projeto — resolvido

O container monta:

```text
/home/ubuntu → /home/coder/ubuntu
/projetos → /home/coder/projetos
```

O projeto UhHu está acessível em `/home/coder/projetos/UhHu`; `AGENTS.md`,
`dev-docs` e a raiz foram confirmados acessíveis e escrevíveis pelo usuário do
container. O compose foi alterado e o serviço foi recriado com sucesso.

## 5. Próxima etapa no DEV

Com o mount resolvido, a próxima sessão pode:

1. abrir `/home/coder/projetos/UhHu`;
2. criar o monorepo pnpm/TypeScript;
3. adicionar `AGENTS.md` e a documentação DEV ao contexto do repositório;
4. criar o esqueleto `core-api`, `core-worker` (se necessário), `cli`, `mcp` e
   pacotes compartilhados;
5. configurar TypeScript strict, contratos globais, Zod, Fastify, Drizzle e
   PostgreSQL dev;
6. instalar os gates de segurança antes do primeiro slice;
7. implementar o primeiro vertical slice do Lab;
8. executar testes reais e registrar descobertas no vault.

Nenhum código de produto foi criado ou alterado nesta sessão documental.

## 6. Pendências conhecidas

- validação final por seções do contrato do CORE;
- migrations PostgreSQL iniciais;
- compose dev/prod do CORE;
- CI e scanners do primeiro repositório;
- testes de contrato dos adapters BDTD/CAPES;
- vertical slice do Lab.

## Relações

- [[UhHu_Fase0_Status_e_Hibernacao]]
- [[UhHu_Roadmap_Geral_2026-09-09]]
- [[UhHu_CORE_Contrato_Inicial]]
- [[ADR009 - Core Compartilhado Modular e PostgreSQL]]
- [[UhHu_Deployment_Notes]]
- [[UhHu_Prof_Inventario_Codebase_2026-09-09]]
