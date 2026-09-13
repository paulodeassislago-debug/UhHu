// apps/lab — testes do client tipado (UI-04, 06-04 task 2).
//
// Cobre apiFetch com fetch mockado (sem rede real):
// - nativo com getToken: header Authorization presente + credentials include.
// - web sem token: só credentials include, sem Authorization.
// - 401 → ApiError com code/message/requestId verbatim do envelope.
// - x-request-id enviado em toda chamada.
// Sem `any` (unknown + narrowing; vi.fn tipado); sem segredo real.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '../client';

const BASE_URL = 'http://test.local';

let lastUrl: unknown;
let lastInit: RequestInit | undefined;

function jsonResponse(status: number, body: string, requestId?: string): Response {
  const headers = new Headers();
  if (requestId !== undefined) {
    headers.set('x-request-id', requestId);
  }
  return new Response(body, { status, headers });
}

function stubFetch(handler: (url: unknown, init?: RequestInit) => Promise<Response>): void {
  lastUrl = undefined;
  lastInit = undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit): Promise<Response> => {
      lastUrl = url;
      lastInit = init;
      return handler(url, init);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('nativo com getToken injeta Authorization Bearer + credentials include', async () => {
    stubFetch(async () => jsonResponse(200, '{"items":[],"page":{}}', 'req-ok-1'));
    const getToken = async (): Promise<string | null> => 'pat-test-123';
    const data = await apiFetch<{ items: unknown[] }>('/api/v1/projects?status=active', {
      baseUrl: BASE_URL,
      getToken,
    });
    expect(data.items).toEqual([]);
    expect(String(lastUrl)).toBe(`${BASE_URL}/api/v1/projects?status=active`);
    expect(lastInit?.credentials).toBe('include');
    const headers = new Headers(lastInit?.headers);
    expect(headers.get('authorization')).toBe('Bearer pat-test-123');
  });

  it('web sem token usa só credentials include, sem Authorization', async () => {
    stubFetch(async () => jsonResponse(200, '{"ok":true}', 'req-ok-2'));
    await apiFetch<{ ok: boolean }>('/api/v1/auth/me', { baseUrl: BASE_URL });
    expect(lastInit?.credentials).toBe('include');
    const headers = new Headers(lastInit?.headers);
    expect(headers.get('authorization')).toBeNull();
  });

  it('401 vira ApiError com code/message/requestId verbatim', async () => {
    const envelope =
      '{"error":{"code":"UNAUTHORIZED","message":"Autenticação necessária.","requestId":"req-401-1"}}';
    stubFetch(async () => jsonResponse(401, envelope, 'req-401-1'));
    try {
      await apiFetch<{ ok: boolean }>('/api/v1/auth/me', { baseUrl: BASE_URL });
      expect.unreachable('apiFetch deveria lançar ApiError em 401');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ApiError);
      if (error instanceof ApiError) {
        expect(error.status).toBe(401);
        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.message).toBe('Autenticação necessária.');
        expect(error.requestId).toBe('req-401-1');
      }
    }
  });

  it('envia x-request-id em toda chamada (sucesso e erro)', async () => {
    stubFetch(async () => jsonResponse(200, '{"ok":true}', 'req-ok-3'));
    await apiFetch<{ ok: boolean }>('/api/v1/auth/me', { baseUrl: BASE_URL });
    const okHeaders = new Headers(lastInit?.headers);
    const sentOk = okHeaders.get('x-request-id');
    expect(typeof sentOk).toBe('string');
    expect((sentOk ?? '').length).toBeGreaterThan(0);

    stubFetch(async () =>
      jsonResponse(
        500,
        '{"error":{"code":"INTERNAL_ERROR","message":"Erro interno.","requestId":""}}',
      ),
    );
    try {
      await apiFetch<{ ok: boolean }>('/api/v1/auth/me', { baseUrl: BASE_URL });
      expect.unreachable('apiFetch deveria lançar ApiError em 500');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ApiError);
    }
    const errHeaders = new Headers(lastInit?.headers);
    expect((errHeaders.get('x-request-id') ?? '').length).toBeGreaterThan(0);
  });
});
