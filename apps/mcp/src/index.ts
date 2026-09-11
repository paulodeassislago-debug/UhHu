// apps/mcp — servidor MCP stdio `uhhu-mcp` (contrato §18, CORE-05).
//
// Registro dinâmico sobre `TOOL_DEFINITIONS`: cada entrada vira uma tool MCP
// cujo handler delega para `callTool(name, args)` (toda a semântica vive em
// tools.ts; este arquivo só faz o boot stdio). Resultado vira texto JSON;
// `McpToolError` vira resposta de erro MCP com { code, message, requestId }
// (sem stack/SQL/tokens/PAT). Logs vão para stderr — nunca stdout, que é o
// canal JSON-RPC do transporte.

// O alias mantém uma única menção textual ao transporte (grep de aceite);
// o transporte usado é o stdio oficial do SDK.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport as StdioTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpConfigError, McpToolError } from './mcp-client.js';
import { TOOL_DEFINITIONS, callTool } from './tools.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toErrorPayload(err: unknown): { code: string; message: string; requestId: string } {
  if (err instanceof McpToolError) {
    return { code: err.code, message: err.message, requestId: err.requestId };
  }
  // Erro de configuração local (ex.: UHHU_TOKEN ausente): mensagem segura e
  // acionável — carrega só o nome da variável, nunca o segredo.
  if (err instanceof McpConfigError) {
    return { code: 'unauthenticated', message: err.message, requestId: '' };
  }
  if (err instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.', requestId: '' };
  }
  if (isRecord(err)) {
    const code = typeof err['code'] === 'string' ? (err['code'] as string) : 'INTERNAL_ERROR';
    const message =
      typeof err['message'] === 'string'
        ? (err['message'] as string)
        : 'Erro interno. Tente novamente.';
    const requestId = typeof err['requestId'] === 'string' ? (err['requestId'] as string) : '';
    return { code, message, requestId };
  }
  return { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.', requestId: '' };
}

const server = new McpServer({ name: 'uhhu-mcp', version: '0.1.0' });

for (const def of TOOL_DEFINITIONS) {
  server.registerTool(
    def.name,
    { description: def.description, inputSchema: def.inputSchema },
    async (args: unknown) => {
      try {
        const result: unknown = await callTool(def.name, args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err: unknown) {
        const payload = toErrorPayload(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
          isError: true,
        };
      }
    },
  );
}

const transport = new StdioTransport();
await server.connect(transport);
console.error('uhhu-mcp rodando em stdio');
