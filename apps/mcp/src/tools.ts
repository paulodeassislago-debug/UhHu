// apps/mcp — tools semânticas sobre a API REST (contrato §18, CORE-05).
//
// Cada tool = 1 endpoint REST existente com a mesma authZ (Bearer PAT via
// env, ActorContext server-side, mesmo 404 IDOR); schemas de input espelham
// os query/body Zod das rotas. Nenhuma tool toca banco: tudo passa por
// `mcpFetch`/`mcpWaitForJob` (guard D-55). Erros viram `McpToolError`
// { code, message, requestId } sem stack/SQL/tokens.
//
// Task 1 (scaffold): somente `lab_list_sources` funcional + o mecanismo
// `TOOL_DEFINITIONS`/`callTool` que a task 2 estende para as 11 tools sem
// mudar o index.ts. Descriptions citam a capability §10 correspondente.

import { z } from 'zod';
import { mcpFetch, McpToolError } from './mcp-client.js';

export const TOOL_NAMES = ['lab_list_sources'] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: z.ZodRawShape;
}

const LAB_LIST_SOURCES_DESCRIPTION = [
  'Lista as fontes de pesquisa do registry (capability lab.source.list).',
  'Efeitos: somente leitura, sem efeitos colaterais.',
  'Proveniência: registry de fontes do CORE (nome, nível, habilitação).',
  'Limites: não executa buscas; para executar use lab_execute_search.',
].join('\n');

async function labListSources(): Promise<unknown[]> {
  const { data } = await mcpFetch<unknown[]>('/api/v1/lab/sources', { method: 'GET' });
  return data;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'lab_list_sources',
    description: LAB_LIST_SOURCES_DESCRIPTION,
    inputSchema: {},
  },
];

// Despacha a tool pelo nome verbatim: valida os args com Zod ANTES de
// qualquer E/S e delega ao handler, que chama a API via `mcpFetch`.
// Nome desconhecido ou args inválidos = McpToolError sem chamar a API.
export async function callTool(name: string, args: unknown): Promise<unknown> {
  const def = TOOL_DEFINITIONS.find((entry) => entry.name === name);
  if (def === undefined) {
    throw new McpToolError(0, 'NOT_FOUND', `Tool desconhecida: ${name}.`, '');
  }
  const parsed = z.object(def.inputSchema).safeParse(args);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first === undefined ? 'verifique os parâmetros.' : first.message;
    throw new McpToolError(0, 'VALIDATION_ERROR', `Argumentos inválidos: ${detail}`, '');
  }
  switch (def.name) {
    case 'lab_list_sources': {
      return labListSources();
    }
  }
}
