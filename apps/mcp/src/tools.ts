// apps/mcp — 11 tools semânticas sobre a API REST (contrato §18, CORE-05).
//
// Cada tool = 1 endpoint REST existente com a mesma authZ (Bearer PAT via
// env, ActorContext server-side, mesmo 404 IDOR); schemas de input espelham
// os query/body Zod das rotas (reuso direto dos schemas de contracts +
// `confirm` nas com efeito). Nenhuma tool toca banco: tudo passa por
// `mcpFetch`/`mcpWaitForJob` (guard D-55; sem tool SQL/genérica). Erros viram
// `McpToolError` { code, message, requestId } sem stack/SQL/tokens.
// Descriptions citam a capability §10 correspondente.
//
// Confirm D-68: create_project, create_search, execute_search,
// set_result_decision e export_project exigem `confirm: z.literal(true)`;
// sem confirm válido = erro `confirm_required` PT-BR sem chamar a API.
// DTOs/paginação D-70: mesmos DTOs camelCase, limit+cursor, nextCursor/hasMore
// verbatim, envelope PT-BR com requestId preservado.

import { z } from 'zod';
import {
  corpusQuerySchema,
  createProjectSchema,
  createSearchSchema,
  decisionInputSchema,
  exportQuerySchema,
  labSourceSchema,
  paginationQuerySchema,
  resultsQuerySchema,
  type CorpusEntryDTO,
  type DedupGroupDTO,
  type PageInfo,
  type ProjectDTO,
  type ResultDTO,
  type SearchDTO,
  type SearchRunDTO,
  type SourceHealthDTO,
} from '@uhhu/contracts';
import { mcpFetch, McpToolError, mcpWaitForJob } from './mcp-client.js';

export const TOOL_NAMES = [
  'lab_create_project',
  'lab_list_projects',
  'lab_create_search',
  'lab_execute_search',
  'lab_get_run',
  'lab_list_results',
  'lab_set_result_decision',
  'lab_get_corpus',
  'lab_export_project',
  'lab_list_sources',
  'lab_get_source_health',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: z.ZodRawShape;
  requiresConfirm: boolean;
  run: (input: unknown) => Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

// Idempotency-Key D-58 (mesma allowlist das rotas; malformada = 400 do
// servidor, nunca ignorada em silêncio).
const IDEMPOTENCY_KEY_SCHEMA = z
  .string()
  .regex(/^[A-Za-z0-9_.:~-]{1,128}$/, 'Chave de idempotência inválida.');

const CONFIRM_SCHEMA = z.literal(true);
const UUID_SCHEMA = z.string().uuid();

const createProjectInputSchema = createProjectSchema.extend({ confirm: CONFIRM_SCHEMA });

const listProjectsInputSchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
});

const createSearchInputSchema = createSearchSchema.extend({ confirm: CONFIRM_SCHEMA });

const executeSearchInputSchema = z.object({
  searchId: UUID_SCHEMA,
  idempotencyKey: IDEMPOTENCY_KEY_SCHEMA.optional(),
  confirm: CONFIRM_SCHEMA,
});

const getRunInputSchema = z.object({ runId: UUID_SCHEMA });

const listResultsInputSchema = resultsQuerySchema.extend({ runId: UUID_SCHEMA });

const setResultDecisionInputSchema = decisionInputSchema.extend({
  groupId: UUID_SCHEMA,
  confirm: CONFIRM_SCHEMA,
});

const getCorpusInputSchema = corpusQuerySchema.extend({ projectId: UUID_SCHEMA });

const exportProjectInputSchema = z.object({
  projectId: UUID_SCHEMA,
  format: exportQuerySchema.shape.format,
  scope: exportQuerySchema.shape.scope.optional(),
  selection: exportQuerySchema.shape.selection,
  idempotencyKey: IDEMPOTENCY_KEY_SCHEMA.optional(),
  confirm: CONFIRM_SCHEMA,
});

const listSourcesInputSchema = z.object({});

const getSourceHealthInputSchema = z.object({ source: labSourceSchema });

async function runCreateProject(input: unknown): Promise<ProjectDTO> {
  const parsed = createProjectInputSchema.parse(input);
  const body: Record<string, unknown> = { title: parsed.title };
  if (parsed.researchQuestion !== undefined) {
    body['researchQuestion'] = parsed.researchQuestion;
  }
  if (parsed.description !== undefined) {
    body['description'] = parsed.description;
  }
  const { data } = await mcpFetch<ProjectDTO>('/api/v1/projects', { method: 'POST', body });
  return data;
}

async function runListProjects(input: unknown): Promise<{ items: ProjectDTO[]; page: PageInfo }> {
  const parsed = listProjectsInputSchema.parse(input);
  const { data } = await mcpFetch<{ items: ProjectDTO[]; page: PageInfo }>(
    `/api/v1/projects${buildQuery({ limit: parsed.limit, cursor: parsed.cursor, status: parsed.status })}`,
    { method: 'GET' },
  );
  return data;
}

async function runCreateSearch(input: unknown): Promise<SearchDTO> {
  const parsed = createSearchInputSchema.parse(input);
  const { data } = await mcpFetch<SearchDTO>('/api/v1/lab/searches', {
    method: 'POST',
    body: {
      projectId: parsed.projectId,
      term: parsed.term,
      filters: parsed.filters,
      sources: parsed.sources,
    },
  });
  return data;
}

// POST runs: 201 = run final; 200 = replay idempotente; 202 = polling D-56 em
// GET /jobs/:id (Job=Run 1:1) e depois GET do run completo — mesmo fluxo do
// REST/CLI. Retorna o run em qualquer desfecho (ok|partial|failed|cancelled):
// o recurso foi criado e o agente precisa do id + erro para reagir.
async function runExecuteSearch(input: unknown): Promise<SearchRunDTO> {
  const parsed = executeSearchInputSchema.parse(input);
  const base = parsed.idempotencyKey === undefined ? {} : { idempotencyKey: parsed.idempotencyKey };
  const { data, status } = await mcpFetch<SearchRunDTO>(
    `/api/v1/lab/searches/${parsed.searchId}/runs`,
    { ...base, method: 'POST', body: {} },
  );
  if (status !== 202) {
    return data;
  }
  const final = await mcpWaitForJob(data.id);
  const { data: full } = await mcpFetch<SearchRunDTO>(`/api/v1/lab/runs/${final.id}`, {
    method: 'GET',
  });
  return full;
}

async function runGetRun(input: unknown): Promise<SearchRunDTO> {
  const parsed = getRunInputSchema.parse(input);
  const { data } = await mcpFetch<SearchRunDTO>(`/api/v1/lab/runs/${parsed.runId}`, {
    method: 'GET',
  });
  return data;
}

async function runListResults(input: unknown): Promise<{
  items: ResultDTO[];
  page: PageInfo;
  total: number;
  newCount: number;
}> {
  const parsed = listResultsInputSchema.parse(input);
  const { data } = await mcpFetch<{
    items: ResultDTO[];
    page: PageInfo;
    total: number;
    newCount: number;
  }>(
    `/api/v1/lab/runs/${parsed.runId}/results${buildQuery({ limit: parsed.limit, cursor: parsed.cursor })}`,
    { method: 'GET' },
  );
  return data;
}

// `--result` do CLI = id do GRUPO de dedup (decisão UMA por grupo, D-46); o
// path espelha a rota Phase 4 `PUT /api/v1/lab/groups/:groupId/decision`.
async function runSetResultDecision(input: unknown): Promise<DedupGroupDTO> {
  const parsed = setResultDecisionInputSchema.parse(input);
  const body: Record<string, unknown> = { decision: parsed.decision };
  if (parsed.reason !== undefined) {
    body['reason'] = parsed.reason;
  }
  const { data } = await mcpFetch<DedupGroupDTO>(`/api/v1/lab/groups/${parsed.groupId}/decision`, {
    method: 'PUT',
    body,
  });
  return data;
}

async function runGetCorpus(input: unknown): Promise<{ items: CorpusEntryDTO[]; page: PageInfo }> {
  const parsed = getCorpusInputSchema.parse(input);
  const { data } = await mcpFetch<{ items: CorpusEntryDTO[]; page: PageInfo }>(
    `/api/v1/lab/projects/${parsed.projectId}/corpus${buildQuery({ limit: parsed.limit, cursor: parsed.cursor, status: parsed.status })}`,
    { method: 'GET' },
  );
  return data;
}

interface ExportReference {
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentJson?: unknown;
  contentText?: string;
}

// Export D-59: retorna REFERÊNCIA + conteúdo rotulado (JSON → objeto
// parseado; CSV/BibTeX → texto), nunca binário sem rótulo; nada é gravado
// no banco pelo MCP (o arquivo, se preciso, o chamador salva).
async function runExportProject(input: unknown): Promise<ExportReference> {
  const parsed = exportProjectInputSchema.parse(input);
  const scope = parsed.scope ?? (parsed.selection === undefined ? 'corpus' : 'selection');
  if (scope === 'selection' && parsed.selection === undefined) {
    throw new McpToolError(
      0,
      'VALIDATION_ERROR',
      'Argumentos inválidos: scope selection exige selection com os ids.',
      '',
    );
  }
  const base = parsed.idempotencyKey === undefined ? {} : { idempotencyKey: parsed.idempotencyKey };
  const { data, filename, contentType } = await mcpFetch<string>(
    `/api/v1/lab/projects/${parsed.projectId}/export${buildQuery({ format: parsed.format, scope, selection: parsed.selection })}`,
    { ...base, method: 'GET', raw: true },
  );
  const ext = parsed.format === 'bibtex' ? 'bib' : parsed.format;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const reference: ExportReference = {
    filename: filename ?? `corpus-${parsed.projectId}-${date}.${ext}`,
    contentType: contentType ?? 'application/octet-stream',
    sizeBytes: Buffer.byteLength(data, 'utf8'),
  };
  if (parsed.format === 'json') {
    try {
      reference.contentJson = JSON.parse(data) as unknown;
    } catch {
      reference.contentText = data;
    }
  } else {
    reference.contentText = data;
  }
  return reference;
}

async function runListSources(input: unknown): Promise<unknown[]> {
  listSourcesInputSchema.parse(input);
  const { data } = await mcpFetch<unknown[]>('/api/v1/lab/sources', { method: 'GET' });
  return data;
}

async function runGetSourceHealth(input: unknown): Promise<SourceHealthDTO> {
  const parsed = getSourceHealthInputSchema.parse(input);
  const { data } = await mcpFetch<SourceHealthDTO>(`/api/v1/lab/sources/${parsed.source}/health`, {
    method: 'GET',
  });
  return data;
}

const CONFIRM_NOTE = 'Tool com efeito: passe confirm:true explícito.';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'lab_create_project',
    description: [
      'Cria um projeto de pesquisa (capability platform.project.create).',
      CONFIRM_NOTE,
      'Efeitos: cria 1 projeto no workspace do dono do PAT.',
      'Proveniência: projeto → workspace do ator (ownerId server-side).',
      'Limites: título até 200 caracteres; sem colaboração em v1.',
    ].join('\n'),
    inputSchema: createProjectInputSchema.shape,
    requiresConfirm: true,
    run: runCreateProject,
  },
  {
    name: 'lab_list_projects',
    description: [
      'Lista projetos do workspace com paginação (capability platform.project.list).',
      'Efeitos: somente leitura, sem efeitos colaterais.',
      'Proveniência: workspace do ator; fora do escopo não aparece (404/ausência idênticos).',
      'Limites: limit 1–100 (default 20); cursor opaco com nextCursor/hasMore.',
    ].join('\n'),
    inputSchema: listProjectsInputSchema.shape,
    requiresConfirm: false,
    run: runListProjects,
  },
  {
    name: 'lab_create_search',
    description: [
      'Cria uma busca declarativa no projeto (capability lab.search.create).',
      CONFIRM_NOTE,
      'Efeitos: cria 1 busca vinculada ao projeto; não executa.',
      'Proveniência: busca → projeto → workspace do ator.',
      'Limites: termo até 500 caracteres; fontes bdtd|capes (oasisbr é 400 no servidor).',
    ].join('\n'),
    inputSchema: createSearchInputSchema.shape,
    requiresConfirm: true,
    run: runCreateSearch,
  },
  {
    name: 'lab_execute_search',
    description: [
      'Executa uma busca e aguarda o run (capability lab.search.execute).',
      CONFIRM_NOTE,
      'Efeitos: cria 1 run + resultados; 202 vira polling de jobs até o desfecho.',
      'Proveniência: run → busca → projeto; métricas por fonte preservadas.',
      'Limites: idempotencyKey opcional evita re-execução; desfecho ok|partial|failed|cancelled.',
    ].join('\n'),
    inputSchema: executeSearchInputSchema.shape,
    requiresConfirm: true,
    run: runExecuteSearch,
  },
  {
    name: 'lab_get_run',
    description: [
      'Lê um run de busca pelo id (capability lab.run.get).',
      'Efeitos: somente leitura, sem efeitos colaterais.',
      'Proveniência: run → busca → projeto; 404 idêntico fora do escopo.',
      'Limites: para acompanhar execução longa, consulte o progresso do run retornado.',
    ].join('\n'),
    inputSchema: getRunInputSchema.shape,
    requiresConfirm: false,
    run: runGetRun,
  },
  {
    name: 'lab_list_results',
    description: [
      'Lista resultados de um run com paginação (capability lab.run.results.list).',
      'Efeitos: somente leitura, sem efeitos colaterais.',
      'Proveniência: resultado → run → busca → projeto, com fonte e metadados.',
      'Limites: limit 1–100 (default 20); nextCursor/hasMore repassados verbatim.',
    ].join('\n'),
    inputSchema: listResultsInputSchema.shape,
    requiresConfirm: false,
    run: runListResults,
  },
  {
    name: 'lab_set_result_decision',
    description: [
      'Registra a decisão de elegibilidade do grupo (capability lab.result.decision.update).',
      CONFIRM_NOTE,
      'Efeitos: define eligible|ineligible|undecided UMA vez por grupo de dedup (D-46).',
      'Proveniência: grupo → projeto; groupId é o id do grupo, não do resultado.',
      'Limites: motivo até 500 caracteres; decisão é mutável e pertence ao projeto.',
    ].join('\n'),
    inputSchema: setResultDecisionInputSchema.shape,
    requiresConfirm: true,
    run: runSetResultDecision,
  },
  {
    name: 'lab_get_corpus',
    description: [
      'Lê o corpus derivado do projeto (capability lab.corpus.get).',
      'Efeitos: somente leitura, sem efeitos colaterais.',
      'Proveniência: visão derivada dos grupos com decisão eligible.',
      'Limites: limit 1–100 (default 20); filtro opcional por status confirmed|pending.',
    ].join('\n'),
    inputSchema: getCorpusInputSchema.shape,
    requiresConfirm: false,
    run: runGetCorpus,
  },
  {
    name: 'lab_export_project',
    description: [
      'Exporta o corpus/seleção do projeto (capability lab.project.export).',
      CONFIRM_NOTE,
      'Efeitos: monta a exportação e retorna referência + conteúdo; nada é gravado no banco.',
      'Proveniência: entradas → grupos eligible do projeto, com origens por fonte.',
      'Limites: formatos csv|bibtex|json; scope selection exige selection; idempotencyKey opcional.',
    ].join('\n'),
    inputSchema: exportProjectInputSchema.shape,
    requiresConfirm: true,
    run: runExportProject,
  },
  {
    name: 'lab_list_sources',
    description: [
      'Lista as fontes de pesquisa do registry (capability lab.source.list).',
      'Efeitos: somente leitura, sem efeitos colaterais.',
      'Proveniência: registry de fontes do CORE (nome, nível, habilitação).',
      'Limites: não executa buscas; para executar use lab_execute_search.',
    ].join('\n'),
    inputSchema: listSourcesInputSchema.shape,
    requiresConfirm: false,
    run: runListSources,
  },
  {
    name: 'lab_get_source_health',
    description: [
      'Lê a saúde de uma fonte (capability lab.source.health).',
      'Efeitos: somente leitura, sem efeitos colaterais.',
      'Proveniência: eventos recentes do CORE por fonte.',
      'Limites: estados ok|degraded|offline; oasisbr responde desabilitada no servidor.',
    ].join('\n'),
    inputSchema: getSourceHealthInputSchema.shape,
    requiresConfirm: false,
    run: runGetSourceHealth,
  },
];

// Despacha a tool pelo nome verbatim: exige confirm:true ANTES de qualquer
// E/S nas tools com efeito, valida os args com Zod e delega ao `run`, que
// chama a API via `mcpFetch`. Nome desconhecido, confirm ausente ou args
// inválidos = McpToolError sem chamar a API.
export async function callTool(name: string, args: unknown): Promise<unknown> {
  const def = TOOL_DEFINITIONS.find((entry) => entry.name === name);
  if (def === undefined) {
    throw new McpToolError(0, 'NOT_FOUND', `Tool desconhecida: ${name}.`, '');
  }
  if (def.requiresConfirm) {
    const marker = isRecord(args) ? args['confirm'] : undefined;
    if (marker !== true) {
      throw new McpToolError(
        0,
        'confirm_required',
        'Esta operação exige confirm:true explícito.',
        '',
      );
    }
  }
  const parsed = z.object(def.inputSchema).safeParse(args);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first === undefined ? 'verifique os parâmetros.' : first.message;
    throw new McpToolError(0, 'VALIDATION_ERROR', `Argumentos inválidos: ${detail}`, '');
  }
  try {
    return await def.run(parsed.data);
  } catch (err: unknown) {
    if (err instanceof McpToolError) {
      throw err;
    }
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      const detail = first === undefined ? 'verifique os parâmetros.' : first.message;
      throw new McpToolError(0, 'VALIDATION_ERROR', `Argumentos inválidos: ${detail}`, '');
    }
    throw err;
  }
}
