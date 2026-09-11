# UhHu Lab (apps/lab)

Cliente UhHu! Lab — Expo + TypeScript strict (web + nativo), consumindo SOMENTE o CORE.

Sem backend próprio. Tipos de domínio SOMENTE via `import type` de `@uhhu/contracts`.
Sem `any`. Regras de negócio e autorização ficam no CORE; o app só fornece UX.

## Como rodar na web

```bash
pnpm --filter @uhhu/lab web
# ou export estático:
pnpm --filter @uhhu/lab exec expo export --platform web
```

## Como abrir no Expo Go via tailnet (D-05, sem EAS)

```bash
pnpm --filter @uhhu/lab start
```

1. Tablet e VPS dev na mesma tailnet (D-03).
2. Escaneie o QR no Expo Go (Android primeiro, D-06).
3. Sem conta EAS, sem assinatura, sem store na fase 6.

## Variáveis

- `EXPO_PUBLIC_API_BASE_URL` — base pública da API (ex.: `http://127.0.0.1:3000` em dev).
  ÚNICA variável com prefixo `EXPO_PUBLIC`. Nenhum segredo/token vai para o bundle.

## Rotas do esqueleto (dev-docs/10 §1–§4)

- `/` — redirect para /login ou /projects conforme sessão (auth em 06-03)
- `/login` — email+senha+entrar+link convite (POST /api/v1/auth/login)
- `/register` — token de convite (POST /api/v1/auth/register)
- `/projects` — lista + CTA criar (GET /api/v1/projects)
- `/project/[id]` — cabeçalho pergunta+status + abas (GET /api/v1/projects/:id)
- `/project/[id]/strategies` — aba Estratégias (GET /api/v1/lab/searches?projectId=)
- `/project/[id]/corpus` — aba Corpus com contador vivo (GET /api/v1/lab/projects/:id/corpus)
