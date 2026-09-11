// apps/lab — fetch wrapper tipado do CORE (UI-02, definição única).
//
// Toda resposta é dado hostil até validada; o client nunca decide privilégio
// (ownerId deriva do ator no servidor; guards do app são UX, AGENTS.md).
// - Base pública SOMENTE via EXPO_PUBLIC_API_BASE_URL (fallback dev
//   http://127.0.0.1:3000; NUNCA URL de prod hardcoded, NUNCA segredo EXPO_PUBLIC).
// - Web usa cookie httpOnly via `credentials: 'include'` SEMPRE; nativo injeta
//   `Authorization: Bearer <PAT>` via getToken (token vive em SecureStore em
//   06-03; aqui o client recebe por injeção, sem importar SecureStore direto).
// - Erros PT-BR verbatim do envelope { error: { code, message, requestId } }.
// - Parse com `unknown` + narrowing; sem tipo `any`; sem armazenamento do
//   navegador para privilégio/owner; sem postgres/drizzle/storage externo;
//   paths sempre do contrato §11.

import { ERROR_CATALOG } from '@uhhu/contracts';
import type { ErrorCode } from '@uhhu/contracts';

// Provedor de PAT injetado pelo chamador (nativo: SecureStore em 06-03).
// Web não precisa (cookie httpOnly); retorna null quando ausente.
export type TokenProvider = () => Promise<string | null>;

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  getToken?: TokenProvider;
  idempotencyKey?: string;
  baseUrl?: string;
  // raw=true devolve o corpo como texto verbatim (export CSV/BibTeX/JSON:
  // salva o attachment byte a byte em vez de re-serializar o JSON parseado).
  raw?: boolean;
}

// Erro de API com o envelope PT-BR repassado verbatim (code/message do
// servidor + requestId para correlação). Nunca carrega o PAT.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor(status: number, code: string, message: string, requestId: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function getApiBaseUrl(): string {
  const raw: unknown = process.env['EXPO_PUBLIC_API_BASE_URL'];
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim().replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:3000';
}

// Base pública resolvida no import (env de build); apiFetch resolve por chamada
// via getApiBaseUrl() para respeitar overrides de teste via opts.baseUrl.
export const API_BASE_URL: string = getApiBaseUrl();

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
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
      code: 'INTERNAL_ERROR' satisfies ErrorCode,
      message: ERROR_CATALOG['INTERNAL_ERROR'],
      requestId: '',
    };
  }
  if (!isRecord(parsed)) {
    return {
      code: 'INTERNAL_ERROR' satisfies ErrorCode,
      message: ERROR_CATALOG['INTERNAL_ERROR'],
      requestId: '',
    };
  }
  const holder: unknown = parsed['error'];
  if (!isRecord(holder)) {
    return {
      code: 'INTERNAL_ERROR' satisfies ErrorCode,
      message: ERROR_CATALOG['INTERNAL_ERROR'],
      requestId: '',
    };
  }
  const codeRaw: unknown = holder['code'];
  const messageRaw: unknown = holder['message'];
  const requestIdRaw: unknown = holder['requestId'];
  const code = typeof codeRaw === 'string' && codeRaw.length > 0 ? codeRaw : 'INTERNAL_ERROR';
  const message =
    typeof messageRaw === 'string' && messageRaw.length > 0
      ? messageRaw
      : ERROR_CATALOG['INTERNAL_ERROR'];
  const requestId = typeof requestIdRaw === 'string' ? requestIdRaw : '';
  return { code, message, requestId };
}

function newRequestId(): string | null {
  try {
    const holder: unknown = (globalThis as unknown as Record<string, unknown>)['crypto'];
    if (!isRecord(holder)) {
      return null;
    }
    const fn: unknown = holder['randomUUID'];
    if (typeof fn !== 'function') {
      return null;
    }
    const out: unknown = (fn as () => unknown).call(holder);
    return typeof out === 'string' && out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, opts?: ApiFetchOptions): Promise<T> {
  const baseUrl = typeof opts?.baseUrl === 'string' && opts.baseUrl.length > 0 ? opts.baseUrl : getApiBaseUrl();
  const url = joinUrl(baseUrl, path);
  const method = typeof opts?.method === 'string' && opts.method.length > 0 ? opts.method : 'GET';

  const headers: Record<string, string> = { Accept: 'application/json' };
  const hasBody = opts?.body !== undefined;
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  const requestId = newRequestId();
  if (requestId !== null) {
    headers['x-request-id'] = requestId;
  }
  if (typeof opts?.idempotencyKey === 'string' && opts.idempotencyKey.length > 0) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }
  if (typeof opts?.getToken === 'function') {
    const token: string | null = await opts.getToken();
    if (typeof token === 'string' && token.length > 0) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    const init: RequestInit = {
      method,
      headers,
      credentials: 'include',
      ...(hasBody ? { body: JSON.stringify(opts?.body) } : {}),
    };
    response = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'INTERNAL_ERROR', ERROR_CATALOG['INTERNAL_ERROR'], requestId ?? '');
  }

  const responseRequestId =
    typeof response.headers.get === 'function'
      ? (response.headers.get('x-request-id') ?? requestId ?? '')
      : (requestId ?? '');

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const text = await response.text();

  if (!response.ok) {
    const parsed = parseErrorEnvelope(text);
    throw new ApiError(
      response.status,
      parsed.code,
      parsed.message,
      parsed.requestId !== '' ? parsed.requestId : responseRequestId,
    );
  }

  if (opts?.raw === true) {
    return text as unknown as T;
  }

  if (text.length === 0) {
    return undefined as unknown as T;
  }

  let data: unknown = null;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      response.status,
      'INTERNAL_ERROR',
      ERROR_CATALOG['INTERNAL_ERROR'],
      responseRequestId,
    );
  }
  return data as unknown as T;
}
