---
tags: [uhhu, core, deploy, devops, suite]
date: 2026-09-09
status: revisado — topologia de referência do CORE
---

# UhHu! CORE — Deployment Notes

**Projeto:** UhHu!  
**Produto:** UhHu! CORE / Suite  
**Documento:** UhHu_Deployment_Notes.md  
**Última revisão:** 09/09/2026  
**Status:** Topologia de referência; requisitos de implementação  
**Base normativa:** [[ADR008 - Multi-usuario e Ambientes Dev Prod]] · [[ADR009 - Core Compartilhado Modular e PostgreSQL]] · [[UhHu_Security_Notes]]

> Esta revisão substitui a topologia histórica baseada no UhHu! Lib, em SQLite e
> em owner key. O deploy novo é do CORE compartilhado, fora do Supabase.

## 1. Princípio

O UhHu! deve continuar self-hostável. Docker é o caminho de referência na VPS,
mas o CORE não deve depender de uma topologia específica de proxy. A arquitetura
inicial é um modular monolith com processos auxiliares somente quando houver
necessidade comprovada.

## 2. Topologia de referência na VPS

```text
Internet
   │ HTTPS (TLS)
   ▼
nginx / reverse proxy
   ├── UhHu API (produção, porta interna)
   ├── UhHu Lab web (quando separado do API)
   └── UhHu dev (somente localhost/tailnet)

UhHu CORE API ───── PostgreSQL prod (Docker/volume próprio)
       │
       ├── Core worker (quando necessário)
       ├── BDTD / CAPES (outbound)
       ├── Google Calendar (outbound)
       ├── Zotero (outbound)
       └── Nextcloud/WebDAV (outbound ou localhost)

Ambiente dev ───── PostgreSQL dev (banco/volume/credenciais distintos)
```

Produção e dev não compartilham banco, volume, `.env`, credenciais ou portas
públicas. Dev fica restrito à VPS local ou tailnet; produção fica atrás de TLS.

## 3. Componentes

| Componente | Papel |
|---|---|
| UhHu CORE API (Fastify/Node LTS) | REST, autenticação, casos de uso e módulos da suite |
| PostgreSQL | Persistência canônica; um banco/instância separado por ambiente |
| Core worker | Buscas longas, sincronizações e jobs; inicialmente opcional |
| Monorepo pnpm | Código, contratos, módulos, migrations e testes |
| CLI / MCP | Adaptadores headless para os casos de uso do CORE |
| nginx + TLS | Proxy, certificados, headers e rate limiting |
| Integrações | BDTD, CAPES, Google Calendar, Zotero e Nextcloud |
| SQLite eventual | Cache/local/offline; nunca fonte canônica do servidor |

Supabase não é dependência do deploy novo. Auth, persistência, storage e jobs
serão providos pelo próprio ecossistema UhHu e por adapters explícitos.

## 4. Ambientes

### Dev

- diretório/compose separado;
- PostgreSQL dev separado;
- `.env` e credenciais de dev próprias;
- portas acessíveis somente localmente ou pela tailnet;
- migrations aplicadas livremente após revisão;
- dados de teste sem dados sensíveis de produção.

### Produção

- diretório/compose separado;
- PostgreSQL prod separado;
- segredos com permissão 600 ou secret manager;
- API atrás de nginx + TLS;
- migrations aplicadas de maneira controlada;
- backup e restore do PostgreSQL documentados;
- logs sem tokens, cookies, senhas ou URLs assinadas.

## 5. Passos de instalação de referência

1. Criar os diretórios e compose independentes de dev e prod.
2. Criar PostgreSQL com volume persistente e credenciais distintas por ambiente.
3. Configurar o arquivo de segredos do ambiente; nunca commitar `.env` ou tokens.
4. Executar as migrations versionadas do CORE.
5. Configurar autenticação multiusuário, convites e sessão segura.
6. Configurar nginx/TLS e restringir dev à interface local/tailnet.
7. Subir `core-api` e, quando necessário, `core-worker`.
8. Executar health checks e testes de isolamento antes de disponibilizar o Lab.
9. Configurar adapters e seus limites de timeout/rate limit.
10. Validar backup/restore antes de considerar o ambiente de produção pronto.

## 6. Operação

- atualização: pull de versão revisada → testes → build → migrations controladas
  → restart do ambiente;
- migrations destrutivas exigem backup e procedimento de rollback;
- logs e métricas monitoram API, banco, worker e estado dos adapters;
- produção nunca usa o banco ou as credenciais de dev;
- exportações e jobs longos devem ter timeout, status e possibilidade de retry;
- segredos são rotacionados sem aparecer no histórico do shell ou nos logs.

## 7. Requisitos genéricos de self-host

- Node.js LTS ou container equivalente;
- PostgreSQL compatível com o dialeto oficial do CORE;
- Docker/Podman opcional, conforme o deploy;
- proxy com TLS;
- armazenamento persistente para PostgreSQL;
- rotina de backup/restore;
- segredos via arquivo protegido ou secret manager;
- storage externo configurado apenas quando o módulo de arquivos for ativado.

## 8. Pendências

- [ ] escolher nomes finais de containers, portas e volumes;
- [ ] criar compose dev/prod do CORE;
- [ ] definir estratégia de backup PostgreSQL na VPS;
- [ ] definir quando o worker deixa de rodar no processo da API;
- [ ] configurar observabilidade e alertas;
- [ ] formalizar o procedimento de deploy e rollback.

## 9. Referências

- [[ADR009 - Core Compartilhado Modular e PostgreSQL]]
- [[ADR008 - Multi-usuario e Ambientes Dev Prod]]
- [[UhHu_Security_Notes]] · [[UhHu_Researcher_v1_Spec]]
- [[ADR004 - Entrega de Arquivos]]