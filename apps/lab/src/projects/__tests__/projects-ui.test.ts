// apps/lab — testes de UI de projetos (07-01 task 2 + 07-06 lápis inline, sem rede).
//
// Cobre via global.fetch mockado (tipado como em client.test.ts):
// (a) update de pergunta vazia serializa `{ researchQuestion: null }` no body
// do PATCH (string vazia salva null — limpa a pergunta);
// (b) arquivar serializa `{ status: 'archived' }` no body do PATCH;
// (c) formatCorpusCount(3,false)==="3" e formatCorpusCount(100,true)==="100+".
// (07-06, pedido Paulo 12/09/2026 — lápis ✎ inline):
// (d) título serializa `{ title }` no body do PATCH;
// (e) título vazio/whitespace é rejeitado pelo schema (validação local bloqueia
// sem request — fetch nunca chamado);
// (f) fonte de project/[id].tsx tem ✎ no título e na pergunta, sem botão
// separado, com Salvar/Cancelar para ambos e PATCH existente.
// Sem `any` (unknown + narrowing; vi.fn tipado); sem segredo real.

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateProjectSchema } from '@uhhu/contracts';
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

function readDetailSource(): string {
  return readFileSync(new URL('../../../app/project/[id].tsx', import.meta.url), 'utf8');
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe('project header inline pencils (07-06)', () => {
  it('título com ✎ abre edição e Salvar chama update com { title }', async () => {
    stubFetchOk();
    await projectsApi.update(PROJECT_ID, { title: 'Novo título' }, { baseUrl: BASE_URL });
    expect(String(lastUrl)).toBe(`${BASE_URL}/api/v1/projects/${PROJECT_ID}`);
    expect(lastInit?.method).toBe('PATCH');
    const body = readJsonBody(lastInit);
    expect(body['title']).toBe('Novo título');
    const source: string = readDetailSource();
    expect(source.includes('handleStartTitleEdit'), 'título deve ter handler de abertura').toBe(
      true,
    );
    expect(source.includes('handleSaveTitle'), 'título deve ter handler de save').toBe(true);
    expect(source.includes('Editar título'), 'lápis do título deve ter label acessível').toBe(
      true,
    );
  });

  it('validação local bloqueia título vazio sem request', () => {
    stubFetchOk();
    const emptyTitle: string = '   ';
    const parsed = updateProjectSchema.safeParse({ title: emptyTitle });
    expect(parsed.success, 'schema deve rejeitar título só-espaços').toBe(false);
    expect(lastUrl, 'nenhum PATCH deve ter sido emitido na validação local').toBeUndefined();
    const overlong: string = 'x'.repeat(201);
    expect(updateProjectSchema.safeParse({ title: overlong }).success).toBe(false);
  });

  it('Cancelar do título descarta sem request (sem PATCH no handler)', () => {
    const source: string = readDetailSource();
    expect(source.includes('handleCancelTitleEdit'), 'título deve ter handler de cancelar').toBe(
      true,
    );
    const start: number = source.indexOf('function handleCancelTitleEdit');
    const end: number = source.indexOf('async function handleSaveTitle', start);
    expect(start >= 0 && end > start, 'handlers de título devem existir em ordem').toBe(true);
    const cancelBody: string = source.slice(start, end);
    expect(cancelBody.includes('setEditingTitle(false)'), 'cancelar volta ao modo leitura').toBe(
      true,
    );
    expect(cancelBody.includes('projectsApi.update'), 'cancelar não chama PATCH').toBe(false);
    expect(cancelBody.includes('fetch('), 'cancelar não faz fetch direto').toBe(false);
  });

  it('botão separado ausente; ✎ inline no título e na pergunta', () => {
    const source: string = readDetailSource();
    expect(countOccurrences(source, '✎') >= 2, 'título + pergunta devem ter ✎').toBe(true);
    expect(source.includes('Editar pergunta'), 'botão separado deve ter sido removido').toBe(
      false,
    );
    expect(countOccurrences(source, 'projectsApi.update') >= 2, 'título + pergunta via PATCH').toBe(
      true,
    );
    expect(source.includes('Pergunta:'), 'label Pergunta: deve restar').toBe(true);
    expect(source.includes('maxLength={200}'), 'título respeita limite do contrato').toBe(true);
  });
});
