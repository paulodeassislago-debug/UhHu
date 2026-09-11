# @uhhu/mcp — servidor MCP sobre o CORE

Servidor MCP (`uhhu-mcp`, stdio) com 11 tools semânticas sobre a mesma API
REST do CORE — mesma authZ (Bearer PAT via `UHHU_TOKEN`, mesmo
ActorContext server-side, mesmo 404 IDOR), mesmos DTOs/paginação e mesmo
envelope de erro PT-BR com `requestId`.

```sh
export UHHU_API_URL=http://127.0.0.1:3000  # default quando ausente
export UHHU_TOKEN=<PAT emitido via POST /auth/token>
pnpm --filter @uhhu/mcp start
```

## Tools (nomes exatos)

| Tool                      | Efeito                                             | Confirmação    |
| ------------------------- | -------------------------------------------------- | -------------- |
| `lab_create_project`      | cria 1 projeto                                     | `confirm:true` |
| `lab_list_projects`       | leitura paginada                                   | —              |
| `lab_create_search`       | cria 1 busca (não executa)                         | `confirm:true` |
| `lab_execute_search`      | cria 1 run + polling até o desfecho                | `confirm:true` |
| `lab_get_run`             | leitura                                            | —              |
| `lab_list_results`        | leitura paginada (`nextCursor`/`hasMore` verbatim) | —              |
| `lab_set_result_decision` | decisão UMA por grupo de dedup (D-46)              | `confirm:true` |
| `lab_get_corpus`          | leitura do corpus derivado                         | —              |
| `lab_export_project`      | monta exportação; retorna referência + conteúdo    | `confirm:true` |
| `lab_list_sources`        | leitura do registry                                | —              |
| `lab_get_source_health`   | leitura por fonte                                  | —              |

Sem `confirm:true` nas tools com efeito, a tool responde `confirm_required`
("Esta operação exige confirm:true explícito.") sem tocar na rede.

## Regras

- Sem tool de SQL genérico; sem acesso direto a tokens, tabelas ou banco
  (guard D-55: nenhum import de `@uhhu/db`/drizzle; tudo via HTTP).
- `lab_export_project` retorna `{ filename, contentType, sizeBytes,
contentJson | contentText }` — referência/conteúdo rotulado, nada gravado
  no banco.
- Erros seguem o envelope do servidor (`code/message/requestId`); a
  autoridade é sempre a do PAT — o sampling do agente não muda nada.
