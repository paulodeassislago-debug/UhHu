#!/usr/bin/env tsx
// apps/cli — bin `uhhu` (stub da task 1; comandos chegam na task 2).
//
// Opera por API; nunca acessa PostgreSQL diretamente.

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`uhhu — CLI headless do CORE (opera por API, nunca acessa PostgreSQL diretamente)

Uso: uhhu [--api <url>] [--json] [-v] <comando> [opções]

Comandos (cadeia Etapa 2):
  auth login|logout        autentica com PAT por device
  project list|create      projetos do usuário
  lab search create|run    buscas declarativas e execuções
  lab run results          resultados de um run
  lab result decide        decisão de elegibilidade
  lab export               baixa o attachment do corpus/seleção
  job get                  estado de um job (polling D-56)

Flags globais:
  --api <url>              base da API (default http://127.0.0.1:3000, ou UHHU_API_URL)
  --json                   saída JSON pura (sem tabela humana)
  -v                       verboso (progresso do polling no stderr)
  --idempotency-key <k>    repassa o header Idempotency-Key (run e export)
  --timeout <s>            timeout do polling em segundos (default 600)
  --help                   esta ajuda

Códigos de saída: 0 ok; 2 validação/uso; 3 auth (401/403); 4 não encontrado;
5 rate limit (429); 1 demais erros (5xx/rede).`);
  process.exit(0);
}

console.error('uhhu: comandos chegam na task 2 — use --help.');
process.exit(2);
