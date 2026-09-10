# UhHu! — Infra, ambientes e segurança

> Estado: vigente (09/09/2026). Fontes: ADR-008, ADR-009, Security Notes,
> `08-security-baseline.md` e Deployment Notes revisados (vault).

## 1. Princípios

- UhHu! é self-hosted; **Supabase não faz parte da arquitetura** (auth,
  persistência, storage e jobs próprios + adapters explícitos).
- Docker é o caminho de referência na VPS; nenhuma decisão acopla o produto a
  uma topologia específica de proxy.
- Persistência canônica: **PostgreSQL self-hosted**, um banco/instância por
  ambiente (dev e prod nunca compartilham banco, volume, credenciais ou `.env`).
- O CORE não guarda cópias de PDFs no caminho normal (arquivos continuam em
  storage externo via adapter; servidor guarda referências/índices/credenciais).

## 2. Topologia de referência (VPS)

```text
Internet → nginx/TLS → UhHu CORE API (prod)
                          ├── PostgreSQL prod (volume próprio)
                          ├── core-worker (quando necessário)
                          ├── BDTD / CAPES (outbound)
                          ├── Google Calendar / Zotero / Nextcloud (outbound)
Dev (VPS local/tailnet) ─── PostgreSQL dev (separado)
```

- Prod: atrás de TLS; apenas em subdomínio/porta pública definida.
- Dev: restrito a localhost/tailnet; nunca 80/443.
- CLI e MCP são superfícies do CORE e usam as mesmas autorizações.

## 3. Ambientes

### Dev
- diretório/compose próprio; PostgreSQL dev separado; `.env` próprio;
- portas locais/tailnet; migrations aplicadas livremente após revisão;
- dados de teste sem dados sensíveis de produção.

### Prod
- diretório/compose próprio; PostgreSQL prod separado;
- segredos 600/secret manager; API atrás de nginx + TLS;
- migrations controladas; backup/restore do PostgreSQL documentados;
- logs sem tokens/cookies/senhas/URLs assinadas.

### Setup de roles do PostgreSQL — bloco revisado (FOUND-02, 2026-09-10)

O bloco mínimo (CREATE ROLE + GRANT em `public` + ALTER DEFAULT PRIVILEGES sem
`FOR ROLE`) **falha na prática**. Use sempre a versão completa abaixo como
superuser, em cada ambiente (dev e prod, com credenciais distintas):

```sql
CREATE ROLE uhhu_migrate LOGIN PASSWORD '<senha-migrate>';
CREATE ROLE uhhu_app LOGIN PASSWORD '<senha-app>';
GRANT CONNECT ON DATABASE uhhu_dev TO uhhu_migrate, uhhu_app;
-- o migrator do Drizzle cria o schema "drizzle": exige CREATE no database
-- (GRANT em schema public não cobre; pré-criar o schema não resolve no PG 16,
-- que checa o privilégio antes do IF NOT EXISTS):
GRANT CREATE ON DATABASE uhhu_dev TO uhhu_migrate;
GRANT USAGE, CREATE ON SCHEMA public TO uhhu_migrate;
GRANT USAGE ON SCHEMA public TO uhhu_app;
-- default privileges DEVEM citar FOR ROLE uhhu_migrate (sem isso, valem só
-- para objetos criados pelo superuser que executa o comando):
ALTER DEFAULT PRIVILEGES FOR ROLE uhhu_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO uhhu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE uhhu_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO uhhu_app;
-- retroativos (default privileges não valem para o passado):
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uhhu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO uhhu_app;
-- leitura da tabela de migrations pelo health check (FOUND-01):
GRANT USAGE ON SCHEMA drizzle TO uhhu_app;
GRANT SELECT ON drizzle.__drizzle_migrations TO uhhu_app;
```

Toda migration de DDL deve conceder DML a `uhhu_app` nas tabelas que criar
(regra permanente, não só setup).

## 4. Autenticação e autorização

- Contas e-mail+senha; hash **argon2id**; sessão httpOnly (Secure, SameSite) ou
  equivalente assinado.
- Registro beta por **token de convite** (gerar/revogar; revogado para de valer).
- Isolamento por `ownerId` (workspace no futuro): derivado da sessão, nunca do
  body; toda rota verifica ownership antes de ler/alterar/excluir. Modelo de
  ameaça principal: **IDOR**.
- Rate limiting em login/convite/busca/exportação/sincronização; CORS restrito.
- Credencial administrativa de instalação pode existir para operação/migrations,
  mas **não é identidade de usuário** (owner key antiga morreu como mecanismo).

## 5. Segredos

- Segredos em arquivo 600, secret manager ou env protegido; nunca no código,
  vault, imagem Docker ou migrations.
- Credenciais PostgreSQL separadas por ambiente.
- Chave mestre fora do banco para cifrar credenciais de integrações.
- Refresh tokens (Google, Zotero...) **cifrados em repouso** — nunca coluna de
  texto simples em `profiles` (lição do legado).
- Rotação/revogação documentadas; redaction de segredos em logs e erros.

## 6. Integrações (fronteira)

- São adapters do CORE, não fronteiras de autenticação.
- **Google Calendar:** conexão pertence ao contexto de integração/Plan; refresh
  token cifrado; evento externo relacionado por vínculo explícito, sem
  acoplamento obrigatório no modelo de aula (lição do legado).
- **Zotero:** chaves/credenciais no servidor; autoridade bibliográfica respeitada.
- **Nextcloud/WebDAV:** usuário de serviço dedicado + escopo mínimo.
- **BDTD/CAPES:** rate limit, circuit breaker, logs sem cookies.

## 7. Rede e transporte

- API só HTTPS em prod; proxy reverso com TLS; dev local/tailnet.
- Headers de segurança (HSTS, nosniff, Referrer-Policy, CSP no frontend).
- Rate limiting reforçado em login, convite, busca, exportação e sync.
- Limites de tamanho/timeout/cancelamento em requisições e uploads.

## 8. Arquivos (quando entrar no caminho crítico — Etapa 3 do Lab/Lib)

- Referência sempre autorizada por usuário/workspace.
- Proxy com streaming, sem persistir cópia no CORE; links assinados curtos e
  escopados; `Cache-Control` adequado; PDF nunca vira segunda fonte de verdade.

## 9. Operação

- Deploy: pull da versão → testes → build → migrations controladas → restart.
- Migrations destrutivas exigem backup e rollback.
- Monitoramento: API, banco, worker, estado dos adapters (ok/degraded/offline,
  últimas falhas, hits de challenge) — acessível ao operador.
- Segredos rotacionados sem vazar para shell/logs.
- **Backup do Nextcloud: não existe (risco aceito pelo dono — não insistir).**

## 10. Checklist antes de produção pública

- [ ] Testes de isolamento por ownerId automatizados (aceite: critério 2 do Lab v1).
- [ ] Convite: gerar/revogar/expirar; sessão: expirar/rotacionar.
- [ ] Backup/restore do PostgreSQL validados.
- [ ] Cifragem/rotação das conexões Google/Zotero/Nextcloud.
- [ ] CSP, CORS e headers revisados no primeiro deploy real.
- [ ] Compose dev/prod + volumes/portas definidos.
