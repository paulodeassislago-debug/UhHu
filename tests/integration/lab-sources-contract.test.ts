// tests/integration — contrato dos adapters BDTD/CAPES com fixtures (SRC-05).
//
// Teste puro de adapter com `fetchFn` fake injetado no SourceClient real: SEM PG
// e SEM rede — roda sempre, nunca pula. As fixtures congelam os shapes das
// fontes observados em 06/09/2026 (dev-docs/04-fontes-bdtd-capes.md §1–§2) +
// snapshot real VuFind 2026-09-11 (prova viva checkpoint 04-05):
// BDTD VuFind `{resultCount, records[]}` com registros reais
// `{authors:{primary:{Nome:[]}}, formats[], id, title, urls[]}` — SEM
// publishDate/ano na busca (year=null por desenho, só via ficha/enrich).
// CAPES rest/busca `{pagina, total, tesesDissertacoes[]}`.
// Imports por PATH RELATIVO com extensão `.js` sob NodeNext (molde
// projects.test.ts que usa `../../apps/...`).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSourceAdapter } from '../../packages/integrations/src/adapters.js';
import {
  ADAPTER_VERSION as BDTD_VERSION,
  enrichBdtd,
  sanitizeRaw,
  searchBdtd,
} from '../../packages/integrations/src/bdtd.js';
import {
  ADAPTER_VERSION as CAPES_VERSION,
  RangeTooWideError,
  enrichCapes,
  searchCapes,
} from '../../packages/integrations/src/capes.js';
import { describePostFilter, postFilter } from '../../packages/integrations/src/postFilter.js';
import { SourceDisabledError } from '../../packages/integrations/src/registry.js';
import { SourceClient } from '../../packages/integrations/src/sourceClient.js';
import type {
  NormalizedItem,
  SearchDef,
  SourceClientContext,
} from '../../packages/integrations/src/types.js';

// Fixtures lidas do disco (CWD do repo — o vitest sempre roda da raiz via
// `pnpm test`; sem `import.meta` porque o tsconfig raiz tipa testes como CJS).
const BDTD_FIXTURE = readFileSync(
  join(process.cwd(), 'tests/integration/fixtures/bdtd-search.json'),
  'utf8',
);
const CAPES_FIXTURE = readFileSync(
  join(process.cwd(), 'tests/integration/fixtures/capes-busca.json'),
  'utf8',
);

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

function first<T>(arr: T[]): T {
  const item = arr[0];
  if (item === undefined) {
    throw new Error('lista vazia onde se esperava 1+ itens');
  }
  return item;
}

function makeFakeFetch(handler: (req: CapturedRequest) => Response): {
  fetchFn: typeof fetch;
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers;
    if (rawHeaders instanceof Headers) {
      rawHeaders.forEach((value: string, key: string) => {
        headers[key] = value;
      });
    } else if (Array.isArray(rawHeaders)) {
      for (const pair of rawHeaders) {
        const key = pair[0];
        const value = pair[1];
        if (key !== undefined && value !== undefined) {
          headers[key] = value;
        }
      }
    } else if (typeof rawHeaders === 'object' && rawHeaders !== null) {
      for (const [key, value] of Object.entries(rawHeaders)) {
        headers[key] = typeof value === 'string' ? value : value.join(', ');
      }
    }
    const captured: CapturedRequest = {
      url,
      method: (init?.method ?? 'GET').toUpperCase(),
      headers,
      body: typeof init?.body === 'string' ? init.body : null,
    };
    requests.push(captured);
    return handler(captured);
  };
  return { fetchFn, requests };
}

function testContext(fetchFn: typeof fetch): SourceClientContext {
  return { signal: new AbortController().signal, fetchFn };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

describe('contrato BDTD (fixture VuFind)', () => {
  it('monta lookfor+type+filter[] e normaliza total e itens', async () => {
    const { fetchFn, requests } = makeFakeFetch(() => jsonResponse(JSON.parse(BDTD_FIXTURE)));
    const def: SearchDef = {
      term: '"ensino de química"',
      yearFrom: 2020,
      yearTo: 2022,
      docTypes: ['masterThesis'],
    };
    const page = await searchBdtd(
      new SourceClient('bdtd'),
      def,
      { page: 2, perPage: 20 },
      testContext(fetchFn),
    );

    const called = first(requests);
    expect(called.method).toBe('GET');
    const url = new URL(called.url);
    expect(url.hostname).toBe('bdtd.ibict.br');
    expect(url.pathname).toBe('/vufind/api/v1/search');
    expect(url.searchParams.get('lookfor')).toBe('"ensino de química"');
    expect(url.searchParams.get('type')).toBe('AllFields');
    expect(url.searchParams.getAll('filter[]')).toContain('format:"masterThesis"');
    expect(url.searchParams.getAll('filter[]')).toContain('publishDate:[2020 TO 2022]');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('20');

    expect(page.sourceStatus).toBe('ok');
    expect(page.total).toBe(7120);
    expect(page.items).toHaveLength(3);
    const item = first(page.items);
    expect(item.sourceId).toBe('UECE-0_286db9542bbce84c5cf658a269c2c9d2');
    expect(item.title).toContain('Quimica Experimental');
    expect(item.authors).toEqual(['Fernandes, Jorge Luis Reis']);
    expect(item.year).toBeNull();
    expect(item.docType).toBe('masterThesis');
    expect(item.institution).toBeNull();
    expect(item.originUrl).toBe(
      'https://siduece.uece.br/siduece/trabalhoAcademicoPublico.jsf?id=47824',
    );
    expect(item.sourceUrl).toBeNull();
  });

  it('regressão shape real VuFind: primary-map, formats[], urls[], sem ano (04-05/1)', async () => {
    const { fetchFn } = makeFakeFetch(() => jsonResponse(JSON.parse(BDTD_FIXTURE)));
    const page = await searchBdtd(
      new SourceClient('bdtd'),
      { term: 'ensino de quimica' },
      { page: 1, perPage: 20 },
      testContext(fetchFn),
    );
    expect(page.sourceStatus).toBe('ok');
    // Snapshot real 2026-09-11: 20/20 vinham com authors=[] e docType=null no
    // mapper antigo — agora o mapa primary vira autores e formats[] vira tipo.
    const [firstItem, secondItem] = page.items;
    if (firstItem === undefined || secondItem === undefined) {
      throw new Error('fixture real deveria ter 2+ registros');
    }
    expect(firstItem.authors).toEqual(['Fernandes, Jorge Luis Reis']);
    expect(firstItem.docType).toBe('masterThesis');
    expect(firstItem.year).toBeNull();
    expect(secondItem.authors).toEqual(['Seabra, Alessandro da Cruz']);
    expect(secondItem.docType).toBe('masterThesis');
    expect(secondItem.year).toBeNull();
    expect(secondItem.originUrl).toBe('https://repositorio.ifes.edu.br/handle/123456789/3029');
    // rawMetadata preserva o shape real para proveniência/enrich futuro.
    const raw = firstItem.rawMetadata;
    expect(typeof raw['authors']).toBe('object');
    expect(Array.isArray(raw['formats'])).toBe(true);
  });

  it('sem docTypes/anos não envia filter[] (fonte aberta, Core filtra depois)', async () => {
    const { fetchFn, requests } = makeFakeFetch(() => jsonResponse(JSON.parse(BDTD_FIXTURE)));
    const page = await searchBdtd(
      new SourceClient('bdtd'),
      { term: 'química' },
      { page: 1, perPage: 20 },
      testContext(fetchFn),
    );
    const url = new URL(first(requests).url);
    expect(url.searchParams.getAll('filter[]')).toEqual([]);
    expect(page.sourceStatus).toBe('ok');
  });

  it('registro com campos ausentes vira null sem lançar', async () => {
    const { fetchFn } = makeFakeFetch(() => jsonResponse(JSON.parse(BDTD_FIXTURE)));
    const page = await searchBdtd(
      new SourceClient('bdtd'),
      { term: 'teste' },
      { page: 1, perPage: 20 },
      testContext(fetchFn),
    );
    expect(page.items).toHaveLength(3);
    const partial = page.items[2];
    if (partial === undefined) {
      throw new Error('fixture deveria ter 3 registros');
    }
    expect(partial.sourceId).toBe('bdtd-003');
    expect(partial.year).toBeNull();
    expect(partial.authors).toEqual([]);
    expect(partial.docType).toBeNull();
    expect(partial.institution).toBeNull();
    expect(partial.originUrl).toContain('Record/bdtd-003');
  });

  it('HTML de challenge vira sourceStatus challenge (executor retenta 1×)', async () => {
    const { fetchFn } = makeFakeFetch(() =>
      htmlResponse('<html><body>OasisbrVerify challenge</body></html>'),
    );
    const page = await searchBdtd(
      new SourceClient('bdtd'),
      { term: 'química' },
      { page: 1, perPage: 20 },
      testContext(fetchFn),
    );
    expect(page.sourceStatus).toBe('challenge');
    expect(page.items).toEqual([]);
    expect(page.total).toBeNull();
  });

  it('envelope sem records vira failed (partial no executor)', async () => {
    const { fetchFn } = makeFakeFetch(() => jsonResponse({ resultCount: 5 }));
    const page = await searchBdtd(
      new SourceClient('bdtd'),
      { term: 'química' },
      { page: 1, perPage: 20 },
      testContext(fetchFn),
    );
    expect(page.sourceStatus).toBe('failed');
    expect(page.items).toEqual([]);
  });

  it('perPage com clamp 5..50 (200→50, 2→5)', async () => {
    const { fetchFn, requests } = makeFakeFetch(() => jsonResponse(JSON.parse(BDTD_FIXTURE)));
    const client = new SourceClient('bdtd');
    await searchBdtd(client, { term: 'a' }, { page: 1, perPage: 200 }, testContext(fetchFn));
    await searchBdtd(client, { term: 'a' }, { page: 1, perPage: 2 }, testContext(fetchFn));
    expect(
      new URL(requests[0] === undefined ? '' : requests[0].url).searchParams.get('limit'),
    ).toBe('50');
    const second = requests[1];
    if (second === undefined) {
      throw new Error('segunda chamada não registrada');
    }
    expect(new URL(second.url).searchParams.get('limit')).toBe('5');
  });
});

describe('contrato CAPES (fixture rest/busca)', () => {
  it('POST com termo intacto, Ano expandido e filtros por campo', async () => {
    const { fetchFn, requests } = makeFakeFetch(() => jsonResponse(JSON.parse(CAPES_FIXTURE)));
    const def: SearchDef = {
      term: '"ensino de química"',
      yearFrom: 2020,
      yearTo: 2022,
      docTypes: ['masterThesis'],
      area: 'Ensino',
      program: 'Química',
    };
    const page = await searchCapes(
      new SourceClient('capes'),
      def,
      { page: 1, perPage: 20 },
      testContext(fetchFn),
    );

    const called = first(requests);
    expect(called.method).toBe('POST');
    expect(new URL(called.url).pathname).toBe('/catalogo-teses/rest/busca');
    if (called.body === null) {
      throw new Error('POST rest/busca sem corpo');
    }
    const raw: unknown = JSON.parse(called.body);
    const payload = raw as {
      termo: string;
      filtros: { campo: string; valor: string }[];
      pagina: number;
      registrosPorPagina: number;
    };
    expect(payload.termo).toBe('"ensino de química"');
    expect(payload.pagina).toBe(1);
    expect(payload.registrosPorPagina).toBeGreaterThanOrEqual(5);
    const anos = payload.filtros.filter((f) => f.campo === 'Ano').map((f) => f.valor);
    expect(anos).toEqual(['2020', '2021', '2022']);
    expect(payload.filtros).toContainEqual({ campo: 'Grau Acadêmico', valor: 'Mestrado' });
    expect(payload.filtros).toContainEqual({ campo: 'Grande Área Conhecimento', valor: 'Ensino' });
    expect(payload.filtros).toContainEqual({ campo: 'Área Conhecimento', valor: 'Química' });

    expect(page.sourceStatus).toBe('ok');
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(3);
    const item = first(page.items);
    expect(item.sourceId).toBe('capes-101');
    expect(item.docType).toBe('masterThesis');
    expect(item.year).toBe(2022);
    expect(item.authors).toEqual(['Carlos Mendes']);
    expect(item.sourceUrl).toBe('https://catalogodeteses.capes.gov.br/catalogo-teses/ficha/101');
  });

  it('sem-divulgação zera sourceUrl e marca flag (com divulgação tem link)', async () => {
    const { fetchFn } = makeFakeFetch(() => jsonResponse(JSON.parse(CAPES_FIXTURE)));
    const page = await searchCapes(
      new SourceClient('capes'),
      { term: 'química' },
      { page: 1, perPage: 20 },
      testContext(fetchFn),
    );
    const restricted = page.items[1];
    if (restricted === undefined) {
      throw new Error('fixture deveria ter 3 registros');
    }
    expect(restricted.sourceId).toBe('capes-102');
    expect(restricted.sourceUrl).toBeNull();
    expect(restricted.rawMetadata['semDivulgacao']).toBe(true);
    expect(restricted.authors).toEqual(['Paula Rocha', 'Rui Alves']);
    const open = first(page.items);
    expect(open.sourceUrl).not.toBeNull();
  });

  it('range >30 anos lança RangeTooWideError antes de qualquer rede', async () => {
    const { fetchFn, requests } = makeFakeFetch(() => jsonResponse(JSON.parse(CAPES_FIXTURE)));
    await expect(
      searchCapes(
        new SourceClient('capes'),
        { term: 'química', yearFrom: 1900, yearTo: 2000 },
        { page: 1, perPage: 20 },
        testContext(fetchFn),
      ),
    ).rejects.toThrowError(RangeTooWideError);
    expect(requests).toHaveLength(0);
  });
});

describe('sanitizeRaw', () => {
  it('remove cookie/authorization/token/session inclusive aninhados', () => {
    const cleaned = sanitizeRaw({
      title: 'mantido',
      cookie: 'sessao=abc',
      nested: { Authorization: 'Bearer x', ok: 1 },
      tags: ['a', { session: 's', keep: true }],
      files: [{ token: 't', id: 2 }],
    });
    expect(cleaned).toEqual({
      title: 'mantido',
      nested: { ok: 1 },
      tags: ['a', { keep: true }],
      files: [{ id: 2 }],
    });
  });
});

describe('postFilter (redundância fonte+Core)', () => {
  const items: NormalizedItem[] = [
    {
      sourceId: 'a',
      title: 'T1',
      authors: ['X'],
      year: 2021,
      docType: 'masterThesis',
      institution: 'Universidade Federal do Vale',
      program: 'Ensino',
      abstract: null,
      originUrl: null,
      sourceUrl: null,
      rawMetadata: {},
    },
    {
      sourceId: 'b',
      title: 'T2',
      authors: [],
      year: null,
      docType: 'Mestrado',
      institution: 'Instituto Federal',
      program: null,
      abstract: null,
      originUrl: null,
      sourceUrl: null,
      rawMetadata: {},
    },
    {
      sourceId: 'c',
      title: 'T3',
      authors: [],
      year: 2015,
      docType: 'doctoralThesis',
      institution: 'Outra',
      program: null,
      abstract: null,
      originUrl: null,
      sourceUrl: null,
      rawMetadata: {},
    },
  ];

  it('ano mantém null, docType mapeia rótulo, institution é substring', () => {
    const def: SearchDef = {
      term: 'q',
      yearFrom: 2020,
      yearTo: 2022,
      docTypes: ['masterThesis'],
      institution: 'federal',
    };
    const result = postFilter(items, def);
    expect(result.kept.map((item) => item.sourceId)).toEqual(['a', 'b']);
    expect(result.dropped).toBe(1);
  });

  it('describePostFilter resume em PT-BR para métricas/logs', () => {
    const text = describePostFilter({
      term: 'q',
      yearFrom: 2020,
      yearTo: 2024,
      docTypes: ['masterThesis', 'doctoralThesis'],
      institution: 'USP',
    });
    expect(text).toContain('pós-filtro');
    expect(text).toContain('2020');
    expect(text).toContain('2024');
    expect(text).toContain('Mestrado');
    expect(describePostFilter({ term: 'q' })).toBe('pós-filtro: sem filtros');
  });
});

describe('adapters (registro + versões)', () => {
  it('expõe search/enrich/version por fonte e bloqueia oasisbr', () => {
    const bdtd = getSourceAdapter('bdtd');
    expect(bdtd.version).toBe(BDTD_VERSION);
    expect(bdtd.version).toBe('bdtd/1.1-fase4');
    expect(typeof bdtd.search).toBe('function');
    expect(typeof bdtd.enrich).toBe('function');
    const capes = getSourceAdapter('capes');
    expect(capes.version).toBe(CAPES_VERSION);
    expect(capes.version).toBe('capes/1.0-fase3');
    expect(() => getSourceAdapter('oasisbr')).toThrowError(SourceDisabledError);
  });
});

describe('enrich sob demanda (fichas HTML)', () => {
  const BDTD_FICHA = [
    '<html><head><title>Ensino de química :: BDTD</title></head><body>',
    '<div>Orientador: Maria Silva</div>',
    '<div>Programa de Pós-Graduação em Ensino de Ciências: PPGEC</div>',
    '<div>Palavras-chave: química; ensino; laboratório</div>',
    '<div id="resumo">Este trabalho investiga o ensino de química.</div>',
    '</body></html>',
  ].join('');
  const CAPES_FICHA = [
    '<html><head><title>Ficha CAPES</title></head><body>',
    '<span id="resumo">Resumo da tese sobre ensino.</span>',
    '<span id="palavras">ensino; química</span>',
    '<a id="download:link_download_arquivo" href="/arquivos/123.pdf">Download</a>',
    '</body></html>',
  ].join('');
  const FICHA_URL = 'https://catalogodeteses.capes.gov.br/catalogo-teses/ficha/123';

  it('enrichBdtd extrai resumo/programa/orientador; vazio vira parcial', async () => {
    const { fetchFn } = makeFakeFetch(() => htmlResponse(BDTD_FICHA));
    const ctx = testContext(fetchFn);
    const item = await enrichBdtd(new SourceClient('bdtd'), 'bdtd-001', ctx);
    expect(item.sourceId).toBe('bdtd-001');
    expect(item.title).toContain('Ensino de química');
    expect(item.abstract).toContain('investiga o ensino');
    expect(item.program).toBe('PPGEC');
    expect(item.rawMetadata['orientador']).toBe('Maria Silva');
    expect(item.rawMetadata['keywords']).toEqual(['química', 'ensino', 'laboratório']);

    const { fetchFn: emptyFn } = makeFakeFetch(() => htmlResponse('<html></html>'));
    const partial = await enrichBdtd(new SourceClient('bdtd'), 'bdtd-999', testContext(emptyFn));
    expect(partial.abstract).toBeNull();
    expect(partial.title).toBe('');
    expect(String(partial.rawMetadata['recordUrl'])).toContain('Record/');
  });

  it('enrichCapes extrai resumo/palavras/download; sem anchor zera sourceUrl', async () => {
    const { fetchFn } = makeFakeFetch(() => htmlResponse(CAPES_FICHA));
    const item = await enrichCapes(new SourceClient('capes'), FICHA_URL, testContext(fetchFn));
    expect(item.abstract).toContain('Resumo da tese');
    expect(item.rawMetadata['keywords']).toEqual(['ensino', 'química']);
    expect(item.sourceUrl).toBe('https://catalogodeteses.capes.gov.br/arquivos/123.pdf');

    const { fetchFn: noAnchorFn } = makeFakeFetch(() =>
      htmlResponse('<html><body>nada</body></html>'),
    );
    const noAnchor = await enrichCapes(
      new SourceClient('capes'),
      FICHA_URL,
      testContext(noAnchorFn),
    );
    expect(noAnchor.sourceUrl).toBeNull();
    expect(noAnchor.abstract).toBeNull();
  });
});
