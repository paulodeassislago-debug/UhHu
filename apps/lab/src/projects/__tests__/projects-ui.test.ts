// apps/lab — testes de UI de projetos (07-01 task 2, sem rede).
//
// Cobre via global.fetch mockado (tipado como em client.test.ts):
// (a) update de pergunta vazia serializa `{ researchQuestion: null }` no body
// do PATCH (string vazia salva null — limpa a pergunta);
// (b) arquivar serializa `{ status: 'archived' }` no body do PATCH;
// (c) formatCorpusCount(3,false)==="3" e formatCorpusCount(100,true)==="100+".
// Sem `any` (unknown + narrowing; vi.fn tipado); sem segredo real.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectsApi } from '../../api/projects';
import { formatCorpusCount } from '../counts';

const BASE_URL = 'http://test.local';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

let lastUrl: unknown;
let lastInit: RequestInit | undefined;

function fakeProjectBody(): string {
  return JSON.stringify({
    id: PROJECT_ID,
    title: 'Projeto teste',
    researchQuestion: null,
    description: null,
    status: 'active',
    referenceSearchId: null,
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T00:00:00.000Z',
  });
}

function stubFetchOk(): void {
  lastUrl = undefined;
  lastInit = undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit): Promise<Response> => {
      lastUrl = url;
      lastInit = init;
      return new Response(fakeProjectBody(), {
        status: 200,
        headers: { 'x-request-id': 'req-test-1' },
      });
    }),
  );
}

function readJsonBody(init: RequestInit | undefined): Record<string, unknown> {
  const raw: unknown = init?.body;
  if (typeof raw !== 'string') {
    throw new Error('PATCH sem body JSON em string');
  }
  const parsed: unknown = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('PATCH body não é objeto JSON');
  }
  return parsed as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('projects UI PATCH serialization (07-01)', () => {
  it('pergunta vazia serializa { researchQuestion: null } no body do PATCH', async () => {
    stubFetchOk();
    const question: string = '   ';
    await projectsApi.update(
      PROJECT_ID,
      { researchQuestion: question.trim().length > 0 ? question.trim() : null },
      { baseUrl: BASE_URL },
    );
    expect(String(lastUrl)).toBe(`${BASE_URL}/api/v1/projects/${PROJECT_ID}`);
    expect(lastInit?.method).toBe('PATCH');
    const body = readJsonBody(lastInit);
    expect(body['researchQuestion']).toBeNull();
  });

  it("arquivar serializa { status: 'archived' } no body do PATCH", async () => {
    stubFetchOk();
    await projectsApi.update(PROJECT_ID, { status: 'archived' }, { baseUrl: BASE_URL });
    expect(String(lastUrl)).toBe(`${BASE_URL}/api/v1/projects/${PROJECT_ID}`);
    expect(lastInit?.method).toBe('PATCH');
    const body = readJsonBody(lastInit);
    expect(body['status']).toBe('archived');
  });

  it('formatCorpusCount formata contagem viva (sem total no servidor)', () => {
    expect(formatCorpusCount(3, false)).toBe('3');
    expect(formatCorpusCount(100, true)).toBe('100+');
  });
});
