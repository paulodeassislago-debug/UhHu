// apps/cli — cliente HTTP do CORE (D-55/D-66: so HTTPS contra a API, nunca PG).
//
// `apiFetch` monta `Authorization: Bearer <PAT>` + `X-Request-Id` (randomUUID)
// por chamada + `Accept: application/json`, repassa `Idempotency-Key` (D-58)
// quando dado, e traduz o envelope de erro PT-BR em `CliApiError` verbatim.
// `waitForJob` replica o polling D-56: GET /api/v1/jobs/:id a cada 2s ate o
// estado terminal, timeout default 600s. DTOs via `import type` de contracts;
// parse com `unknown` + narrowing — nenhum `any`.

import { randomUUID } from 'node:crypto';
import type { JobDTO } from '@uhhu/contracts';

export interface ApiOptions {
  baseUrl: string;
  token: string;
  idempotencyKey?: string;
  verbose?: boolean;
  timeoutMs?: number;
}

export type ApiFetchArgs = ApiOptions & {
  method?: string;
  body?: unknown;
};

// Erro de API com o envelope PT-BR repassado verbatim (code/message do
// servidor + requestId para correlacao). Nunca carrega o PAT.
export class CliApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor(status: number, code: string, message: string, requestId: string) {
    super(message);
    this.name = 'CliApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
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
    return { code: 'INTERNAL_ERROR', message: 'Resposta de erro fora do formato esperado.', requestId: '' };
  }
  if (!isRecord(parsed)) {
    return { code: 'INTERNAL_ERROR', message: 'Resposta de erro fora do formato esperado.', requestId: '' };
  }
  const holder: unknown = parsed['error'];
  if (!isRecord(holder)) {
    return { code: 'INTERNAL_ERROR', message: 'Resposta de erro fora do formato esperado.', requestId: '' };
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
  return clean.length > 0 ? clean : undefined;
}

export async function apiFetch<T>(
  path: string,
  opts: ApiFetchArgs,
): Promise<{ status: number; data: T; filename?: string }> {
  const url = joinUrl(opts.baseUrl, path);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${opts.token}`,
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
    throw new CliApiError(0, 'INTERNAL_ERROR', `Falha de rede ao contatar a API: ${message}`, '');
  }
  if (res.status === 204) {
    return { status: res.status, data: undefined as T };
  }
  if (res.status < 200 || res.status >= 300) {
    const text = await res.text().catch(() => '');
    const parsed = parseErrorEnvelope(text);
    throw new CliApiError(res.status, parsed.code, parsed.message, parsed.requestId);
  }
  const rawFilename = parseContentDisposition(res.headers.get('content-disposition'));
  const filenameArgs = rawFilename === undefined ? {} : { filename: rawFilename };
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    return { status: res.status, data: text as unknown as T, ...filenameArgs };
  }
  const text = await res.text();
  if (text.length === 0) {
    return { status: res.status, data: undefined as T, ...filenameArgs };
  }
  let data: unknown = null;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new CliApiError(
      res.status,
      'INTERNAL_ERROR',
      'Resposta da API fora do formato esperado.',
      '',
    );
  }
  return { status: res.status, data: data as T, ...filenameArgs };
}

const TERMINAL_JOB_STATUS = new Set(['succeeded', 'partial', 'failed', 'cancelled']);

export interface WaitForJobArgs extends ApiOptions {
  pollIntervalMs?: number;
}

// Polling D-56: GET /api/v1/jobs/:id a cada 2s ate `succeeded|partial|failed|
// cancelled` (os estados terminais reais do JobDTO; o plano os chama
// `ok|partial|failed|cancelled`). Timeout default 600s. Com `verbose`, cada
// transicao imprime `job <id>: <status>` no stderr (stdout fica puro p/ --json).
export async function waitForJob(jobId: string, opts: WaitForJobArgs): Promise<JobDTO> {
  const timeoutMs = opts.timeoutMs ?? 600000;
  const intervalMs = opts.pollIntervalMs ?? 2000;
  const startedAt = Date.now();
  let last: string | null = null;
  for (;;) {
    if (Date.now() - startedAt > timeoutMs) {
      const secs = Math.round(timeoutMs / 1000);
      throw new Error(`Timeout após ${secs}s aguardando job ${jobId}.`);
    }
    const { data } = await apiFetch<JobDTO>(`/api/v1/jobs/${jobId}`, {
      baseUrl: opts.baseUrl,
      token: opts.token,
    });
    const status: string = data.status;
    if (opts.verbose === true && status !== last) {
      process.stderr.write(`job ${jobId}: ${status}\n`);
      last = status;
    }
    if (TERMINAL_JOB_STATUS.has(status)) {
      return data;
    }
    const elapsed = Date.now() - startedAt;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) {
      const secs = Math.round(timeoutMs / 1000);
      throw new Error(`Timeout após ${secs}s aguardando job ${jobId}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
}
