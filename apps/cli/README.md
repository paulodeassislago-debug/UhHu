# apps/cli — `@uhhu/cli`

CLI headless do CORE sobre os mesmos casos de uso do REST (contrato §18,
CORE-05). **Opera por API; nunca acessa PostgreSQL diretamente** (guard D-55
quebra se `apps/cli` importar `@uhhu/db`).

## Uso

```sh
pnpm --filter @uhhu/cli exec uhhu --help
uhhu auth login --email vo@exemplo.com --password '...' [--device lab-casa]
uhhu project list
uhhu lab search run --search <uuid> [-v]
uhhu lab export --project <uuid> --format json --out ./saida
```

- Auth PAT por device: `POST /api/v1/auth/token`; credencial em
  `$HOME/.config/uhhu/credentials.json` (mode `600`) ou env `UHHU_TOKEN`
  (precede o arquivo); `auth logout` revoga o PAT atual e apaga o arquivo.
- Base da API: flag global `--api <url>` > env `UHHU_API_URL` > default
  `http://127.0.0.1:3000`.
- Saída: tabela humana por default; `--json` sai JSON puro para scripts; `-v`
  mostra o progresso do polling no stderr.
- Polling D-56: após `lab search run`, se `202`, consulta `GET /jobs/:id` a
  cada 2s até `succeeded|partial|failed|cancelled` (timeout `--timeout`, s).
- Idempotência D-58: `--idempotency-key <k>` repassa o header em run e export.
- Códigos de saída: 0 ok; 2 validação/uso (400/422); 3 auth (401/403);
  4 não encontrado (404); 5 rate limit (429); 1 demais erros (5xx/rede).
