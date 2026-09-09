# @uhhu/config — ambientes e segredos (DEV separado de prod)

Env validado com Zod por `NODE_ENV` (`packages/config/src/env.ts`).
Duas connection strings, nunca intercambiáveis:

| Variável                 | Role           | Privilégios                                             |
| ------------------------ | -------------- | ------------------------------------------------------- |
| `APP_DATABASE_URL`       | `uhhu_app`     | DML apenas: `SELECT/INSERT/UPDATE/DELETE` — **sem** DDL |
| `MIGRATION_DATABASE_URL` | `uhhu_migrate` | DDL (`CREATE/ALTER/DROP`) + DML no schema `public`      |

Princípio: **o servidor deriva tudo da sessão; connection string nunca vem
do cliente.** O boot (`apps/core-api`) usa só `APP_DATABASE_URL`; o
`db:migrate` (`packages/db`) usa só `MIGRATION_DATABASE_URL`.

## Setup na VPS (máquina com tailnet, D-06)

```bash
# 1. Subir o PG DEV (senha via env, nunca no arquivo)
export PG_DEV_PASSWORD='<senha-forte-do-postgres>'
docker compose -f compose.dev.yml up -d postgres-dev

# 2. Criar roles com menor privilégio (como superuser postgres)
docker compose -f compose.dev.yml exec postgres-dev psql -U postgres -d uhhu_dev <<'SQL'
CREATE ROLE uhhu_migrate LOGIN PASSWORD '<senha-migrate>';
CREATE ROLE uhhu_app LOGIN PASSWORD '<senha-app>';
GRANT CONNECT ON DATABASE uhhu_dev TO uhhu_migrate, uhhu_app;
GRANT USAGE, CREATE ON SCHEMA public TO uhhu_migrate;
GRANT USAGE ON SCHEMA public TO uhhu_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO uhhu_app;
SQL

# 3. Grants de DML para tabelas FUTURAS criadas pelo migrate rodam via migration
#    (toda migration de DDL concede DML a uhhu_app nas tabelas que criar).

# 4. Preencher `.env.dev` (chmod 600, nunca commitado) com as duas URLs.
```

Segredos vivem só em arquivo `600` ignorado + memória do processo; nunca em
código, Git, logs ou respostas (`dev-docs/05-infra.md` §5).
