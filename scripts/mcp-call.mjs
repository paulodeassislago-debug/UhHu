#!/usr/bin/env node
// scripts/mcp-call.mjs — helper stdio para chamar tools MCP na prova headless (05-05).
//
// Uso exclusivo da prova e do operador (sem segredos em argv alem do env):
//   UHHU_TOKEN=... UHHU_API_URL=... node scripts/mcp-call.mjs <tool> '<json-args>'
// Spawna `pnpm --filter @uhhu/mcp start` pelo canal stdio, chama a tool,
// imprime o JSON do resultado no stdout. Erro de validacao ou 4xx/5xx do
// servidor vira envelope no stderr com exit diferente de zero.
// O transporte herda so PATH/HOME mais TOKEN/URL — nenhuma var *DATABASE*
// e repassada, provando operacao sem banco direto.
// Pre-req: PG DEV migrado (`pnpm --filter @uhhu/db db:migrate` com .env.dev)
// mais servidor `pnpm --filter @uhhu/core-api start` com o mesmo env.
// Operar so contra localhost ou staging proprio.
/* global console, process: readonly */

import { Client } from '../apps/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport as StdioTransport } from '../apps/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

function usage() {
  console.error("Uso: UHHU_TOKEN=... UHHU_API_URL=... node scripts/mcp-call.mjs <tool> '<json-args>'");
}

const toolName = process.argv[2];
const rawArgs = process.argv[3] ?? '{}';
if (toolName === undefined || toolName.length === 0) {
  usage();
  process.exit(2);
}
let toolArgs = {};
try {
  const parsed = JSON.parse(rawArgs);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.error('Argumentos da tool devem ser um objeto JSON.');
    process.exit(2);
  }
  toolArgs = parsed;
} catch {
  console.error('Argumentos da tool com JSON invalido.');
  process.exit(2);
}

const token = process.env['UHHU_TOKEN'] ?? '';
if (token.length === 0) {
  console.error('UHHU_TOKEN nao configurado.');
  process.exit(3);
}
const apiUrl = process.env['UHHU_API_URL'] ?? 'http://127.0.0.1:3000';

const childEnv = {
  UHHU_TOKEN: token,
  UHHU_API_URL: apiUrl,
};
const pathValue = process.env['PATH'];
if (typeof pathValue === 'string' && pathValue.length > 0) {
  childEnv['PATH'] = pathValue;
}
const homeValue = process.env['HOME'];
if (typeof homeValue === 'string' && homeValue.length > 0) {
  childEnv['HOME'] = homeValue;
}

const clientTransport = new StdioTransport({
  command: 'pnpm',
  args: ['--filter', '@uhhu/mcp', 'start'],
  env: childEnv,
});

const client = new Client({ name: 'uhhu-prova-headless', version: '0.1.0' }, { capabilities: {} });

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function extractText(result) {
  if (!isRecord(result)) {
    return JSON.stringify(result);
  }
  const content = result['content'];
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0];
    if (isRecord(first) && typeof first['text'] === 'string') {
      return first['text'];
    }
  }
  return JSON.stringify(result);
}

let connectOk = false;
try {
  await client.connect(clientTransport);
  connectOk = true;
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Falha ao conectar no servidor MCP: ${message}`);
  process.exit(1);
}

try {
  const result = await client.callTool({ name: toolName, arguments: toolArgs });
  const text = extractText(result);
  if (isRecord(result) && result['isError'] === true) {
    console.error(text);
    await client.close();
    process.exit(1);
  }
  console.log(text);
  await client.close();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  try {
    await client.close();
  } catch {
    // ignora erro de fechamento apos falha
  }
  void connectOk;
  process.exit(1);
}
