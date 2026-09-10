---
tags: [uhhu, core, seguranca, suite]
date: 2026-09-09
status: revisado — baseline de segurança do CORE
---

# UhHu! CORE — Security Notes

**Projeto:** UhHu!  
**Produto:** UhHu! CORE / Suite  
**Documento:** UhHu_Security_Notes.md  
**Última revisão:** 09/09/2026  
**Status:** Baseline de segurança; requisitos de implementação  
**Base normativa:** [[ADR001 - UhhuLib]] · [[ADR004 - Entrega de Arquivos]] · [[ADR008 - Multi-usuario e Ambientes Dev Prod]] · [[ADR009 - Core Compartilhado Modular e PostgreSQL]]  
**Práticas incorporadas:** [[Segurança em Vibecoding]] · [[Os 5 vacilos de segurança de SaaS feitos com vibecoding (mano deyvin)]] · [[Prompt "Iluminati" — auditoria de SaaS inteiro com IA (mano deyvin)]]

> Esta revisão substitui as premissas de dono único e SQLite do documento de
> 13/08/2026. A versão anterior permanece no histórico do projeto; os requisitos
> abaixo são os aplicáveis ao CORE compartilhado.

## 1. Princípios

1. O CORE é self-hosted e deve ser seguro atrás de um proxy TLS, sem depender do
   Supabase.
2. O CORE não guarda cópias dos PDFs no caminho normal. Arquivos continuam em um
   storage externo definido por adapter; o servidor guarda referências, índices e
   credenciais protegidas.
3. O v1 é multiusuário: cada usuário só acessa os próprios dados; o desenho deve
   deixar espaço para workspaces e permissões futuras.
4. O isolamento é aplicado no caso de uso e na consulta ao banco. `owner_id` ou
   `workspace_id` deve ser derivado da sessão, nunca aceito cegamente do body.
5. Logs, backups, métricas e mensagens de erro não podem expor tokens, cookies,
   senhas, Authorization headers ou URLs assinadas.
6. O CORE não depende de IA. CLI, MCP e UIs usam as mesmas permissões e casos de
   uso da API.

Modelo de ameaça principal:

- acesso indevido entre usuários (IDOR);
- credenciais de autenticação comprometidas;
- brute force e abuso de endpoints de busca/sincronização;
- vazamento de tokens OAuth de integrações;
- acesso indevido a arquivos referenciados;
- alteração ou exclusão acidental de dados de produção;
- exposição de segredos em logs, imagens ou repositório.

## 2. Autenticação e autorização

### 2.1. Usuários

O CORE adotará, no v1, contas por e-mail e senha, com:

- hash de senha com Argon2id;
- sessão em cookie `httpOnly`, `Secure` e `SameSite` apropriado, ou mecanismo
  equivalente de sessão assinado;
- login, logout, recuperação/rotação de sessão e consulta do usuário atual;
- registro controlado por token de convite durante a beta;
- rate limiting e proteção contra enumeração de contas;
- CORS restrito às origens configuradas.

A identidade da sessão é a autoridade para determinar o usuário/workspace. Toda
rota de dados deve verificar ownership/permission antes de ler, alterar ou
excluir um recurso.

### 2.2. Credencial de operação

Uma credencial administrativa de instalação pode existir para operações locais,
migrations, manutenção e scripts, mas ela não substitui a identidade dos
usuários nem deve ser enviada às UIs comuns. Seu uso deve ser auditável e restrito.

A antiga `owner key` do documento v0 deixa de ser o mecanismo de autenticação do
produto multiusuário.

## 3. Segredos em repouso

- segredos em arquivo com permissão 600, secret manager ou variáveis protegidas;
- nenhum segredo no código, no vault, em imagem Docker commitada ou em migrations;
- credenciais PostgreSQL separadas entre dev e produção;
- chave mestre fora do banco para cifrar credenciais de integrações;
- refresh tokens de Google, Zotero ou outros providers cifrados em repouso,
  nunca armazenados como texto simples em `profiles`;
- rotação e revogação documentadas para tokens e credenciais administrativas;
- redaction de segredos em logs e respostas de erro.

## 4. Integrações

As integrações são adapters do CORE, não fronteiras de autenticação do produto.

- **Google Calendar:** a conexão pertence ao contexto de integração/Plan; o
  refresh token é cifrado; eventos externos são relacionados a itens internos
  por uma entidade de vínculo, não por acoplamento obrigatório no modelo de aula.
- **Zotero:** chaves e credenciais ficam no servidor, nunca no cliente; o Core
  respeita a autoridade bibliográfica definida nos ADRs anteriores.
- **Nextcloud/WebDAV:** usuário de serviço dedicado e credencial com escopo
  mínimo; o Core referencia/entrega arquivos segundo autorização.
- **BDTD/CAPES:** adapters sujeitos a rate limit, circuit breaker e logs sem
  cookies/credenciais.

Supabase Auth, RLS, Storage e Edge Functions não fazem parte da arquitetura nova.
As regras de segurança observadas no legado servem como material de migração e
não são copiadas automaticamente.

## 5. Rede e transporte

- API exposta somente por HTTPS em produção;
- proxy reverso (nginx, Caddy ou equivalente) com TLS;
- API interna vinculada à interface necessária, evitando exposição desnecessária;
- dev restrito à VPS local ou tailnet;
- headers de segurança no proxy e na aplicação;
- rate limiting reforçado em login, convite, busca, exportação e sincronizações;
- limites de tamanho, timeout e cancelamento para requisições e uploads.

## 6. Arquivos

Quando a entrega de arquivos entrar no caminho crítico:

- toda referência deve ser autorizada pelo usuário/workspace;
- modo proxy deve fazer streaming sem persistir cópia no CORE;
- links assinados devem expirar rapidamente e ter escopo mínimo;
- respostas de arquivo devem usar `Cache-Control` adequado;
- PDFs não podem tornar-se uma segunda fonte de verdade do UhHu!.

## 7. Banco e ambientes

- PostgreSQL é a persistência canônica do CORE;
- dev e produção usam bancos, credenciais, volumes e portas separados;
- migrations são versionadas e executadas de forma controlada;
- produção terá procedimento de backup e restore do banco;
- SQLite, quando existir, é cache/local/offline e não autoridade de dados;
- nenhum teste de isolamento deve depender apenas de filtros na UI.

## 8. Segurança no ciclo DEV assistido por IA

A segurança não é presumida porque o código compila ou funciona no browser. Toda
mudança feita com auxílio de IA passa por uma etapa explícita de revisão
adversarial antes do merge/release.

Práticas incorporadas do tema [[Segurança em Vibecoding]]:

- regra de negócio e autorização no backend, nunca somente no frontend;
- CORS, `Origin`, `Referer` e `localStorage` não são mecanismos de autorização;
- toda rota com ID verifica ownership/workspace no servidor (IDOR);
- todo input é hostil: Zod, limites, sanitização de HTML/Markdown, validação de
  uploads/URLs e queries parametrizadas;
- segredos nunca no cliente, bundle, Git, histórico, logs ou respostas;
- sessões, tokens, OTPs e IDs sensíveis usam geração criptograficamente segura;
- webhooks verificam assinatura, timestamp e replay;
- PostgreSQL não é exposto ao frontend; RLS, quando usado, é defesa em
  profundidade e não substitui autorização dos casos de uso;
- teste de abuso é feito com browser e `curl`, inclusive trocando IDs e headers.

### 8.1. Auditoria assistida por IA

A auditoria deve ser solicitada explicitamente e feita arquivo por arquivo/linha
por linha. O agente deve produzir achados com severidade, arquivo/linha,
pré-condição, impacto, explorabilidade somente em ambiente autorizado e teste de
correção. Deve listar também os controles que verificou e funcionam.

A IA não deve gerar patch automaticamente antes da revisão do relatório. Cada
correção precisa ser revisada e testada. Uma auditoria por IA é evidência auxiliar,
não certificação de segurança.

### 8.2. Ferramentas e gates

- Gitleaks: working tree, staged files e histórico Git;
- OpenGrep/SAST: JavaScript/TypeScript;
- `pnpm audit`: dependências de produção;
- typecheck, lint e testes de autorização/IDOR;
- integração contra PostgreSQL;
- scan do bundle frontend para segredos;
- OWASP ZAP baseline somente contra local/staging sob controle do UhHu;
- achado crítico/alto bloqueia merge/release até correção ou aceite formal com
  responsável e prazo.

### 8.3. Ética da auditoria

Auditar apenas código, máquinas e ambientes próprios ou autorizados. Código
open-source pode ser estudado dentro da licença, mas isso não autoriza atacar a
produção de terceiros. Pentest exige permissão prévia; achados externos são
reportados pelo canal apropriado, não explorados.

## 9. Auditoria e pendências

- [ ] implementar testes automatizados de isolamento por usuário/workspace;
- [ ] testar convite, revogação, expiração e rotação de sessão;
- [ ] definir política de retenção de logs e auditoria de operações sensíveis;
- [ ] definir backup/restore do PostgreSQL antes de produção pública;
- [ ] validar cifragem e rotação das conexões Google/Zotero/Nextcloud;
- [ ] revisar CSP, CORS e headers no primeiro deploy real;
- [ ] documentar política de versões e migrações destrutivas.

## 10. Referências

- [[ADR008 - Multi-usuario e Ambientes Dev Prod]]
- [[ADR009 - Core Compartilhado Modular e PostgreSQL]]
- [[ADR001 - UhhuLib]] · [[ADR004 - Entrega de Arquivos]]
- [[UhHu_Deployment_Notes]] · [[UhHu_Researcher_v1_Spec]]
- [[Segurança em Vibecoding]]
- [[Os 5 vacilos de segurança de SaaS feitos com vibecoding (mano deyvin)]]
- [[Prompt "Iluminati" — auditoria de SaaS inteiro com IA (mano deyvin)]]