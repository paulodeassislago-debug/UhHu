// apps/mcp — cliente HTTP do CORE (D-55/D-69: so HTTPS contra a API, nunca PG).
//
// Espelho do padrao de apps/cli/src/client.ts (apps nao importam entre si):
// `mcpFetch` monta `Authorization: Bearer <PAT>` + `X-Request-Id`
// (randomUUID) por chamada + `Accept: application/json`, repassa
// `Idempotency-Key` (D-58) quando dado, e traduz o envelope de erro PT-BR em
// `McpToolError` verbatim (code/message/requestId, sem stack/SQL/tokens).
// `mcpWaitForJob` replica o polling D-56: GET /api/v1/jobs/:id a cada 2s ate o
// estado terminal, timeout default 600s. Token OBRIGATORIO via env
// `UHHU_TOKEN` (mesmo Bearer do CLI/REST); base via `UHHU_API_URL` (default
// http://127.0.0.1:3000). DTOs via `import type` de contracts; parse com
// `unknown` + narrowing — nenhum `any`.

import { randomUUID } from 'node:crypto';
import type { JobDTO } from '@uhhu/contracts';

export interface McpFetchOptions {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  // raw=true devolve o corpo como texto verbatim (export: referencia o
  // attachment byte a byte em vez de re-serializar o JSON parseado).
  raw?: boolean;
}

// Erro de configuracao local (sem rede tocada): UHHU_TOKEN ausente.
export class McpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpConfigError';
  }
}

// Erro de tool com o envelope PT-BR repassado verbatim (code/message do
// servidor + requestId para correlacao). Nunca carrega o PAT nem stack/SQL.
export class McpToolError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor(status: number, code: string, message: string, requestId: string) {
    super(message);
    this.name = 'McpToolError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function resolveBaseUrl(): string {
  const raw = process.env['UHHU_API_URL'];
  if (raw !== undefined && raw.trim().length > 0) {
    return raw.trim();
  }
  return 'http://127.0.0.1:3000';
}

function resolveToken(): string {
  const raw = process.env['UHHU_TOKEN'];
  if (raw === undefined || raw.trim().length === 0) {
    throw new McpConfigError('UHHU_TOKEN não configurado.');
  }
  return raw.trim();
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

interface ErrorEnvelopeLike {
  error?: {
    code?: unknown;
    message?: unknown;
    requestId?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseErrorEnvelope(text: string): { code: string; message: string; requestId: string } {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {
      code: 'INTERNAL_ERROR',
      message: 'Resposta de erro fora do formato esperado.',
      requestId: '',
    };
  }
  if (!isRecord(parsed)) {
    return {
      code: 'INTERNAL_ERROR',
      message: 'Resposta de erro fora do formato esperado.',
      requestId: '',
    };
  }
  const holder: unknown = parsed['error'];
  if (!isRecord(holder)) {
    return {
      code: 'INTERNAL_ERROR',
      message: 'Resposta de erro fora do formato esperado.',
      requestId: '',
    };
  }
  const envelope = holder as ErrorEnvelopeLike['error'];
  const code = typeof envelope?.code === 'string' ? envelope.code : 'INTERNAL_ERROR';
  const message =
    typeof envelope?.message === 'string' ? envelope.message : 'Erro interno. Tente novamente.';
  const requestId = typeof envelope?.requestId === 'string' ? envelope.requestId : '';
  return { code, message, requestId };
}

// Extrai o filename do `Content-Disposition: attachment; filename="..."` do
// servidor (D-59). Retorna so o basename higienizado (sem path) ou undefined.
export function parseContentDisposition(header: string | null): string | undefined {
  if (header === null || header.length === 0) {
    return undefined;
  }
  const match = /filename\*?=(?:"([^"]+)"|'([^']+)'|([^\s;]+))/i.exec(header);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const base = decoded.split('/').pop()?.split('\\').pop() ?? '';
  const clean = base.trim().replace(/[^A-Za-z0-9._-]/g, '_');
  if (clean.length === 0 || clean === '.' || clean === '..') {
    return undefined;
  }
  return clean;
}

export async function mcpFetch<T>(
  path: string,
  opts: McpFetchOptions = {},
): Promise<{ status: number; data: T; filename?: string; contentType?: string }> {
  const baseUrl = resolveBaseUrl();
  const token = resolveToken();
  const url = joinUrl(baseUrl, path);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Request-Id': randomUUID(),
  };
  let body: string | undefined = undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (opts.idempotencyKey !== undefined && opts.idempotencyKey.length > 0) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }
  let res: Response;
  try {
    const init: RequestInit = { method: opts.method ?? 'GET', headers };
    if (body !== undefined) {
      init.body = body;
    }
    res = await fetch(url, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new McpToolError(0, 'INTERNAL_ERROR', `Falha de rede ao contatar a API: ${message}`, '');
  }
  if (res.status === 204) {
    return { status: res.status, data: undefined as T };
  }
  if (res.status < 200 || res.status >= 300) {
    const text = await res.text().catch(() => '');
    const parsed = parseErrorEnvelope(text);
    throw new McpToolError(res.status, parsed.code, parsed.message, parsed.requestId);
  }
  const rawFilename = parseContentDisposition(res.headers.get('content-disposition'));
  const filenameArgs = rawFilename === undefined ? {} : { filename: rawFilename };
  const rawContentType = res.headers.get('content-type');
  const contentTypeArgs =
    rawContentType === null || rawContentType.length === 0 ? {} : { contentType: rawContentType };
  if (opts.raw === true) {
    const text = await res.text();
    return { status: res.status, data: text as unknown as T, ...filenameArgs, ...contentTypeArgs };
  }
  const contentType = rawContentType ?? '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    return { status: res.status, data: text as unknown as T, ...filenameArgs, ...contentTypeArgs };
  }
  const text = await res.text();
  if (text.length === 0) {
    return { status: res.status, data: undefined as T, ...filenameArgs, ...contentTypeArgs };
  }
  let data: unknown = null;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new McpToolError(
      res.status,
      'INTERNAL_ERROR',
      'Resposta da API fora do formato esperado.',
      '',
    );
  }
  return { status: res.status, data: data as T, ...filenameArgs, ...contentTypeArgs };
}

const TERMINAL_JOB_STATUS = new Set(['succeeded', 'partial', 'failed', 'cancelled']);

export interface McpWaitForJobOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

// Polling D-56: GET /api/v1/jobs/:id a cada 2s ate `succeeded|partial|failed|
// cancelled` (os estados terminais reais do JobDTO). Timeout default 600s.
export async function mcpWaitForJob(
  jobId: string,
  opts: McpWaitForJobOptions = {},
): Promise<JobDTO> {
  const timeoutMs = opts.timeoutMs ?? 600000;
  const intervalMs = opts.pollIntervalMs ?? 2000;
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > timeoutMs) {
      const secs = Math.round(timeoutMs / 1000);
      throw new McpToolError(
        0,
        'INTERNAL_ERROR',
        `Timeout após ${secs}s aguardando job ${jobId}.`,
        '',
      );
    }
    const { data } = await mcpFetch<JobDTO>(`/api/v1/jobs/${jobId}`, { method: 'GET' });
    const status: string = data.status;
    if (TERMINAL_JOB_STATUS.has(status)) {
      return data;
    }
    const elapsed = Date.now() - startedAt;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) {
      const secs = Math.round(timeoutMs / 1000);
      throw new McpToolError(
        0,
        'INTERNAL_ERROR',
        `Timeout após ${secs}s aguardando job ${jobId}.`,
        '',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
}
