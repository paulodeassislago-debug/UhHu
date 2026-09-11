// tests/integration — lab busca→run→results→proveniência contra PG real (LAB-02–05/12, SRC-01–05, CORE-03/04).
//
// Harness Fastify em memória + buildAuthRoutes + buildProjectRoutes + buildLabRoutes
// no mesmo app com cookie uhhu_session real; 2 usuários (dono A, estranho B);
// asserts de x-request-id + regex negativa set-cookie|passwordHash|token nos corpos;
// skip gracioso sem PG (nunca falha offline); NUNCA imprime connection string.
//
// Adapters com fetch global fake (fixtures da 03-03) — determinístico, sem rede.
// A rota NUNCA expõe injeção de fetchFn (handoff 03-04 honrado: fetchFn é
// server-side, nunca vem do cliente). O lib usa `init.fetchFn ?? globalThis.fetch`,
// então o stub do `globalThis.fetch` neste teste equivale à injeção server-side
// de fetchFn — sem override de módulo, sem flag de produção, sem rede real.
// Cobertura real das fixtures: 3+3 itens
// (UECE-*/IFES-*/bdtd-003 + capes-101..103); snapshot BDTD real VuFind
// 2026-09-11 (primary-map, formats[], urls[], year=null).

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '@uhhu/db';
import {
  invites,
  labCanonicalPins,
  labDedupGroups,
  labDedupMembers,
  labDivergences,
  labGroupDecisions,
  labGroupTags,
  labIdempotencyKeys,
  labRejectedPairs,
  labResults,
  labSearches,
  labSearchRuns,
  labSourceEvents,
  labTags,
  passwordResets,
  projects,
  sessions,
  users,
} from '@uhhu/db';
import { COOKIE_NAME } from '../../apps/core-api/src/auth/session.js';
import { requestIdPlugin } from '../../apps/core-api/src/plugins/requestId.js';
import { errorHandler } from '../../apps/core-api/src/plugins/errorHandler.js';
import { buildAuthRoutes } from '../../apps/core-api/src/routes/auth.js';
import { buildProjectRoutes } from '../../apps/core-api/src/routes/projects.js';
import { buildLabRoutes } from '../../apps/core-api/src/routes/lab.js';

function readDatabaseUrl(name: 'APP_DATABASE_URL' | 'MIGRATION_DATABASE_URL'): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const APP_URL = readDatabaseUrl('APP_DATABASE_URL');
const MIGRATION_URL = readDatabaseUrl('MIGRATION_DATABASE_URL');

const GHOST_UUID = '00000000-0000-4000-8000-000000000000';

const BDTD_RAW = readFileSync(
  join(process.cwd(), 'tests/integration/fixtures/bdtd-search.json'),
  'utf8',
);
const CAPES_RAW = readFileSync(
  join(process.cwd(), 'tests/integration/fixtures/capes-busca.json'),
  'utf8',
);
const BDTD_DATA: unknown = JSON.parse(BDTD_RAW);
const CAPES_DATA: unknown = JSON.parse(CAPES_RAW);

// ---------------------------------------------------------------------------
// Fake fetch global (server-side, só teste): roteia por host para as fixtures.
// Modos: ok | capes-fail | both-fail | extra (bdtd +1 item novo p/ newCount).
// `fetchDelayMs` simula fonte lenta (100ms) sem travar a suite.
// ---------------------------------------------------------------------------

type FetchMode = 'ok' | 'capes-fail' | 'both-fail' | 'extra';

let fetchMode: FetchMode = 'ok';
let fetchDelayMs = 0;
const ORIGINAL_FETCH: typeof fetch = globalThis.fetch;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extraBdtdPayload(): unknown {
  const base = BDTD_DATA as { resultCount: number; records: Record<string, unknown>[] };
  // Item extra no shape REAL VuFind (primary-map + formats[] + urls[]).
  const extra: Record<string, unknown> = {
    id: 'bdtd-004',
    title: 'Item novo do rerun para diff de novos',
    authors: { primary: { 'Autor, Novo': [] }, secondary: [], corporate: [] },
    formats: ['masterThesis'],
    languages: ['por'],
    series: [],
    subjects: [],
    urls: [{ url: 'https://bdtd.ibict.br/vufind/Record/bdtd-004', desc: 'ficha' }],
  };
  return { resultCount: base.resultCount + 1, records: [...base.records, extra] };
}

function jsonFetchResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function fakeFetch(input: string | URL | Request): Promise<Response> {
  if (fetchDelayMs > 0) {
    await sleep(fetchDelayMs);
  }
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('bdtd.ibict.br')) {
    if (fetchMode === 'both-fail') {
      return jsonFetchResponse({ erro: 'bdtd fora' }, 500);
    }
    if (fetchMode === 'extra') {
      return jsonFetchResponse(extraBdtdPayload(), 200);
    }
    return jsonFetchResponse(BDTD_DATA, 200);
  }
  if (url.includes('catalogodeteses.capes.gov.br')) {
    if (fetchMode === 'capes-fail' || fetchMode === 'both-fail') {
      return jsonFetchResponse({ erro: 'capes fora' }, 500);
    }
    return jsonFetchResponse(CAPES_DATA, 200);
  }
  throw new Error(`fakeFetch: host inesperado (sem rede real no teste): ${url.slice(0, 80)}`);
}

function installFake(mode: FetchMode, delayMs = 0): void {
  fetchMode = mode;
  fetchDelayMs = delayMs;
  globalThis.fetch = fakeFetch as typeof fetch;
}

function errorText(err: unknown): string {
  const parts: string[] = [];
  parts.push(err instanceof Error ? err.message : String(err));
  if (typeof err === 'object' && err !== null) {
    const record = err as { stdout?: unknown; stderr?: unknown };
    for (const key of ['stdout', 'stderr'] as const) {
      const value: unknown = record[key];
      if (typeof value === 'string') {
        parts.push(value);
      } else if (Buffer.isBuffer(value)) {
        parts.push(value.toString('utf8'));
      }
    }
  }
  return parts.join('\n');
}

function isConnectionFailure(text: string): boolean {
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE/i.test(text);
}

function setCookieList(res: { headers: unknown }): string[] {
  if (typeof res.headers !== 'object' || res.headers === null) {
    return [];
  }
  const raw: unknown = (res.headers as Record<string, unknown>)['set-cookie'];
  if (typeof raw === 'string') {
    return [raw];
  }
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

function headerValue(res: { headers: unknown }, name: string): unknown {
  if (typeof res.headers !== 'object' || res.headers === null) {
    return undefined;
  }
  return (res.headers as Record<string, unknown>)[name];
}

function sessionCookie(res: { headers: unknown }): string | null {
  for (const item of setCookieList(res)) {
    const pair = item.split(';')[0];
    if (pair === undefined) {
      continue;
    }
    const cut = pair.indexOf('=');
    if (cut < 0) {
      continue;
    }
    if (pair.slice(0, cut).trim() === COOKIE_NAME && pair.slice(cut + 1).trim().length > 0) {
      return pair.slice(cut + 1).trim();
    }
  }
  return null;
}

function requireSessionCookie(res: { headers: unknown }): string {
  const value = sessionCookie(res);
  expect(value).not.toBeNull();
  if (value === null) {
    throw new Error('resposta sem cookie de sessao');
  }
  return value;
}

function errorOf(body: unknown): { code: string; message: string; requestId: string } {
  return (body as { error: { code: string; message: string; requestId: string } }).error;
}

function inviteOf(body: unknown): { inviteToken: string; expiresAt: string } {
  return body as { inviteToken: string; expiresAt: string };
}

function userOf(body: unknown): { id: string; email: string; role: string } {
  return (body as { user: { id: string; email: string; role: string } }).user;
}

interface TestSearch {
  id: string;
  projectId: string;
  term: string;
  filters: Record<string, unknown>;
  sources: string[];
}

function searchOf(body: unknown): TestSearch {
  return body as TestSearch;
}

interface TestRunMetrics {
  perSource: {
    bdtd: { status: string; total: number; returned: number; durationMs: number };
    capes: { status: string; total: number; returned: number; durationMs: number };
  };
  newCount: number;
  coverage: { bdtd: number; capes: number };
}

interface TestRun {
  id: string;
  searchId: string;
  status: string;
  termSnapshot: string;
  filtersSnapshot: Record<string, unknown>;
  sourcesSnapshot: string[];
  metrics: TestRunMetrics;
  error: { code: string; message: string } | null;
}

function runOf(body: unknown): TestRun {
  return body as TestRun;
}

interface TestResult {
  id: string;
  runId: string;
  source: string;
  sourceId: string;
  title: string;
  rawMetadata: Record<string, unknown>;
}

function resultOf(body: unknown): TestResult {
  return body as TestResult;
}

interface TestResultPage {
  items: TestResult[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
  total: number;
  newCount: number;
}

function resultPageOf(body: unknown): TestResultPage {
  return body as TestResultPage;
}

interface TestSearchPage {
  items: TestSearch[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
}

function searchPageOf(body: unknown): TestSearchPage {
  return body as TestSearchPage;
}

interface TestJob {
  id: string;
  type: string;
  status: string;
  progress: { doneSources: number; totalSources: number } | null;
  resultRef: { runId: string } | null;
  error: { code: string; message: string } | null;
}

function jobOf(body: unknown): TestJob {
  return body as TestJob;
}

interface ApiResponse {
  statusCode: number;
  headers: unknown;
  json(): unknown;
}

async function apiRequest(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  options: {
    body?: Record<string, unknown>;
    cookieValue?: string;
    idempotencyKey?: string;
  } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(options.cookieValue !== undefined
      ? { cookie: `${COOKIE_NAME}=${options.cookieValue}` }
      : {}),
    ...(options.idempotencyKey !== undefined ? { 'idempotency-key': options.idempotencyKey } : {}),
  };
  if (method === 'GET' || method === 'DELETE') {
    return app.inject({ method, url, headers });
  }
  const { body } = options;
  if (body === undefined) {
    return app.inject({ method, url, headers });
  }
  return app.inject({ method, url, payload: body, headers });
}

async function bootstrapAdmin(
  app: FastifyInstance,
  name: string,
  email: string,
): Promise<{ userId: string; cookie: string }> {
  const boot = await apiRequest(app, 'POST', '/api/v1/auth/invites');
  expect(boot.statusCode).toBe(201);
  const bootBody: unknown = boot.json();
  const reg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
    body: {
      name,
      email,
      password: 'SenhaForte123!',
      inviteToken: inviteOf(bootBody).inviteToken,
    },
  });
  expect(reg.statusCode).toBe(201);
  const regBody: unknown = reg.json();
  return { userId: userOf(regBody).id, cookie: requireSessionCookie(reg) };
}

async function createMember(
  app: FastifyInstance,
  adminCookie: string,
  name: string,
  email: string,
): Promise<{ userId: string; cookie: string }> {
  const inv = await apiRequest(app, 'POST', '/api/v1/auth/invites', {
    body: {},
    cookieValue: adminCookie,
  });
  expect(inv.statusCode).toBe(201);
  const invBody: unknown = inv.json();
  const reg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
    body: {
      name,
      email,
      password: 'SenhaForte123!',
      inviteToken: inviteOf(invBody).inviteToken,
    },
  });
  expect(reg.statusCode).toBe(201);
  const regBody: unknown = reg.json();
  return { userId: userOf(regBody).id, cookie: requireSessionCookie(reg) };
}

async function createProject(
  app: FastifyInstance,
  cookieValue: string,
  title: string,
): Promise<string> {
  const res = await apiRequest(app, 'POST', '/api/v1/projects', {
    body: { title },
    cookieValue,
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { id: string };
  return body.id;
}

async function createSearch(
  app: FastifyInstance,
  cookieValue: string,
  projectId: string,
  term: string,
  filters: Record<string, unknown>,
  sources: string[],
): Promise<TestSearch> {
  const res = await apiRequest(app, 'POST', '/api/v1/lab/searches', {
    body: { projectId, term, filters, sources },
    cookieValue,
  });
  expect(res.statusCode).toBe(201);
  expect(headerValue(res, 'x-request-id')).toBeTruthy();
  return searchOf(res.json());
}

// Checa envelope sem vazamento + x-request-id. Regex negativa cobre
// stack|passwordHash|token|set-cookie|cookie (inclui set-cookie|passwordHash|token).
function expectClean(res: ApiResponse): void {
  expect(headerValue(res, 'x-request-id')).toBeTruthy();
  const text = JSON.stringify(res.json()).toLowerCase();
  expect(text).not.toMatch(/stack|passwordhash|password_hash|token|secret|set-cookie|cookie/);
}

function expectIsolatedError(res: ApiResponse, expectedCode: string): void {
  expect(headerValue(res, 'x-request-id')).toBeTruthy();
  const body: unknown = res.json();
  expect(errorOf(body).code).toBe(expectedCode);
  expect(typeof errorOf(body).requestId).toBe('string');
  const text = JSON.stringify(body).toLowerCase();
  expect(text).not.toMatch(/stack|passwordhash|password_hash|token|secret|set-cookie|cookie/);
}

// Prova que execFileSync foi importado do child_process (evita tree-shake
// remover o import usado no beforeAll do migrate).
void execFileSync;

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'lab search runs PG real (busca→run→results→proveniência, partial, IDOR)',
  () => {
    let pgAvailable = true;
    let app: FastifyInstance | undefined;
    let db: Db | undefined;

    beforeAll(async () => {
      try {
        execFileSync('pnpm', ['--filter', '@uhhu/db', 'db:migrate'], {
          stdio: 'pipe',
          timeout: 60000,
        });
      } catch (err: unknown) {
        if (isConnectionFailure(errorText(err))) {
          pgAvailable = false;
          console.warn(
            '[lab-search-runs] PG inalcançavel no migrate — pulando integracao (offline).',
          );
          return;
        }
        throw err;
      }
      if (APP_URL === undefined) {
        pgAvailable = false;
        return;
      }
      const database = createDb(APP_URL);
      db = database;
      const instance = Fastify({ logger: false });
      await instance.register(cookie);
      await instance.register(async (child) => {
        await requestIdPlugin(child);
      });
      await instance.register(async (child) => {
        await errorHandler(child);
      });
      await instance.register(async (child) => {
        await buildAuthRoutes(child, database);
      });
      await instance.register(async (child) => {
        await buildProjectRoutes(child, database);
      });
      await instance.register(async (child) => {
        await buildLabRoutes(child, database);
      });
      app = instance;
    }, 60000);

    afterAll(async () => {
      globalThis.fetch = ORIGINAL_FETCH;
      await app?.close();
    });

    beforeEach(async () => {
      if (!pgAvailable || db === undefined) {
        return;
      }
      // Wipe FK-safe total (Phase 4: corpus antes de runs/searches/projects).
      await db.delete(labGroupTags);
      await db.delete(labDedupMembers);
      await db.delete(labCanonicalPins);
      await db.delete(labDivergences);
      await db.delete(labGroupDecisions);
      await db.delete(labRejectedPairs);
      await db.delete(labDedupGroups);
      await db.delete(labTags);
      await db.delete(labResults);
      await db.delete(labIdempotencyKeys);
      await db.delete(labSourceEvents);
      await db.delete(labSearchRuns);
      await db.delete(labSearches);
      await db.delete(projects);
      await db.delete(passwordResets);
      await db.delete(sessions);
      await db.delete(invites);
      await db.delete(users);
      installFake('ok', 0);
    });

    afterEach(() => {
      globalThis.fetch = ORIGINAL_FETCH;
    });

    it('LAB-02: cria search declarativa SEM executar + edita termo com snapshot congelado (D-33)', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');
      const projectId = await createProject(app, owner.cookie, 'Projeto lab 02');

      const search = await createSearch(
        app,
        owner.cookie,
        projectId,
        '"ensino de química"',
        { yearFrom: 2020, yearTo: 2024 },
        ['bdtd', 'capes'],
      );
      expect(search.term).toBe('"ensino de química"');

      const listed = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/searches?projectId=${search.projectId}`,
        {
          cookieValue: owner.cookie,
        },
      );
      expect(listed.statusCode).toBe(200);
      expectClean(listed);
      expect(searchPageOf(listed.json()).items.length).toBe(1);

      installFake('ok', 0);
      const runRes = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(runRes.statusCode).toBe(201);
      expectClean(runRes);
      const run = runOf(runRes.json());
      expect(run.termSnapshot).toBe('"ensino de química"');

      const patched = await apiRequest(app, 'PATCH', `/api/v1/lab/searches/${search.id}`, {
        body: { term: '"ensino de física"' },
        cookieValue: owner.cookie,
      });
      expect(patched.statusCode).toBe(200);
      expectClean(patched);
      expect(searchOf(patched.json()).term).toBe('"ensino de física"');

      const reread = await apiRequest(app, 'GET', `/api/v1/lab/runs/${run.id}`, {
        cookieValue: owner.cookie,
      });
      expect(reread.statusCode).toBe(200);
      expectClean(reread);
      expect(runOf(reread.json()).termSnapshot).toBe('"ensino de química"');
    });

    it('LAB-03+SRC-05: run ok nas duas fontes com coverage 3+3 + rerun com newCount 1 (D-35)', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');
      const projectId = await createProject(app, owner.cookie, 'Projeto lab 03');
      const search = await createSearch(app, owner.cookie, projectId, '"ensino de química"', {}, [
        'bdtd',
        'capes',
      ]);

      installFake('ok', 0);
      const first = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(first.statusCode).toBe(201);
      expectClean(first);
      const run1 = runOf(first.json());
      expect(run1.status).toBe('succeeded');
      expect(run1.metrics.coverage).toEqual({ bdtd: 3, capes: 3 });
      expect(run1.metrics.newCount).toBe(6);

      installFake('extra', 0);
      const second = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(second.statusCode).toBe(201);
      expectClean(second);
      const run2 = runOf(second.json());
      expect(run2.status).toBe('succeeded');
      expect(run2.id).not.toBe(run1.id);
      expect(run2.metrics.newCount).toBe(1);
      expect(run2.metrics.coverage.bdtd).toBe(4);
      expect(run2.metrics.coverage.capes).toBe(3);
    });

    it('LAB-05+D-37: CAPES falha vira partial com BDTD preservado; ambas falham vira failed', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');
      const projectId = await createProject(app, owner.cookie, 'Projeto lab 05');
      const search = await createSearch(app, owner.cookie, projectId, '"ensino de química"', {}, [
        'bdtd',
        'capes',
      ]);

      installFake('capes-fail', 0);
      const partialRes = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(partialRes.statusCode).toBe(201);
      expectClean(partialRes);
      const partial = runOf(partialRes.json());
      expect(partial.status).toBe('partial');
      expect(partial.metrics.perSource['bdtd'].status).toBe('ok');
      expect(partial.metrics.perSource['capes'].status).toBe('failed');

      const results = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/runs/${partial.id}/results?limit=20`,
        {
          cookieValue: owner.cookie,
        },
      );
      expect(results.statusCode).toBe(200);
      expectClean(results);
      const page = resultPageOf(results.json());
      expect(page.items.length).toBe(3);
      expect(page.items.every((item) => item.source === 'bdtd')).toBe(true);

      installFake('both-fail', 0);
      const failedRes = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(failedRes.statusCode).toBe(201);
      expectClean(failedRes);
      expect(runOf(failedRes.json()).status).toBe('failed');
    });

    it('LAB-04: cadeia Result→Run→Search→Project + rawMetadata integral + source/sourceId', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');
      const projectId = await createProject(app, owner.cookie, 'Projeto lab 04');
      const search = await createSearch(app, owner.cookie, projectId, '"ensino de química"', {}, [
        'bdtd',
        'capes',
      ]);

      installFake('ok', 0);
      const runRes = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(runRes.statusCode).toBe(201);
      const run = runOf(runRes.json());

      const resultsRes = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/runs/${run.id}/results?limit=20`,
        {
          cookieValue: owner.cookie,
        },
      );
      expect(resultsRes.statusCode).toBe(200);
      expectClean(resultsRes);
      const items = resultPageOf(resultsRes.json()).items;
      expect(items.length).toBe(6);
      const first = items[0];
      if (first === undefined) {
        throw new Error('run sem resultados');
      }
      expect(first.source).toBe('bdtd');
      expect(first.sourceId).toBe('UECE-0_286db9542bbce84c5cf658a269c2c9d2');

      const gotResult = await apiRequest(app, 'GET', `/api/v1/lab/results/${first.id}`, {
        cookieValue: owner.cookie,
      });
      expect(gotResult.statusCode).toBe(200);
      expectClean(gotResult);
      const result = resultOf(gotResult.json());
      expect(result.runId).toBe(run.id);
      expect(typeof result.rawMetadata).toBe('object');
      expect(Object.keys(result.rawMetadata).length).toBeGreaterThan(0);

      const gotRun = await apiRequest(app, 'GET', `/api/v1/lab/runs/${result.runId}`, {
        cookieValue: owner.cookie,
      });
      expect(gotRun.statusCode).toBe(200);
      expectClean(gotRun);
      expect(runOf(gotRun.json()).searchId).toBe(search.id);

      const gotSearch = await apiRequest(app, 'GET', `/api/v1/lab/searches/${search.id}`, {
        cookieValue: owner.cookie,
      });
      expect(gotSearch.statusCode).toBe(200);
      expectClean(gotSearch);
      expect(searchOf(gotSearch.json()).projectId).toBe(projectId);
    });

    it('D-36: GET results ordenado fonte+rank com cursor limit=1 sem repetir nem pular', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');
      const projectId = await createProject(app, owner.cookie, 'Projeto lab 36');
      const search = await createSearch(app, owner.cookie, projectId, '"ensino de química"', {}, [
        'bdtd',
        'capes',
      ]);

      installFake('ok', 0);
      const runRes = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(runRes.statusCode).toBe(201);
      const run = runOf(runRes.json());

      const seen = new Set<string>();
      let cursor: string | null | undefined;
      let pages = 0;
      const order: string[] = [];
      do {
        const suffix =
          cursor === undefined || cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
        const res = await apiRequest(
          app,
          'GET',
          `/api/v1/lab/runs/${run.id}/results?limit=1${suffix}`,
          {
            cookieValue: owner.cookie,
          },
        );
        expect(res.statusCode).toBe(200);
        expectClean(res);
        const page = resultPageOf(res.json());
        expect(page.items.length).toBe(1);
        const item = page.items[0];
        if (item === undefined) {
          throw new Error('pagina vazia com hasMore');
        }
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
        order.push(`${item.source}:${item.sourceId}`);
        cursor = page.page.nextCursor;
        pages += 1;
        if (pages > 10) {
          throw new Error('paginacao nao terminou em 10 paginas');
        }
      } while (cursor !== null);
      expect(seen.size).toBe(6);
      expect(order.slice(0, 3).every((entry) => entry.startsWith('bdtd:'))).toBe(true);
      expect(order.slice(3).every((entry) => entry.startsWith('capes:'))).toBe(true);
    });

    it('CORE-03/D-39: Idempotency-Key replay 200 + 422 em corpo diferente + 429 no 11º run', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');
      const projectId = await createProject(app, owner.cookie, 'Projeto lab idem');
      const search = await createSearch(app, owner.cookie, projectId, '"ensino de química"', {}, [
        'bdtd',
        'capes',
      ]);

      installFake('ok', 0);
      const key = 'idem-key-03-06-a';
      const first = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
        idempotencyKey: key,
      });
      expect(first.statusCode).toBe(201);
      expectClean(first);
      const run1 = runOf(first.json());

      const replay = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
        idempotencyKey: key,
      });
      expect(replay.statusCode).toBe(200);
      // Header `Idempotent-Replayed: true` (Fastify inject normaliza para minúsculas).
      const replayedHeader =
        headerValue(replay, 'idempotent-replayed') ?? headerValue(replay, 'Idempotent-Replayed');
      expect(replayedHeader).toBe('true');
      expectClean(replay);
      expect(runOf(replay.json()).id).toBe(run1.id);

      const edited = await apiRequest(app, 'PATCH', `/api/v1/lab/searches/${search.id}`, {
        body: { term: '"termo divergente para 422"' },
        cookieValue: owner.cookie,
      });
      expect(edited.statusCode).toBe(200);

      const conflict = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
        idempotencyKey: key,
      });
      expect(conflict.statusCode).toBe(422);
      expectIsolatedError(conflict, 'IDEMPOTENCY_CONFLICT');

      const projectRate = await createProject(app, owner.cookie, 'Projeto lab rate');
      const searchRate = await createSearch(
        app,
        owner.cookie,
        projectRate,
        '"rate limit 10/h"',
        {},
        ['bdtd', 'capes'],
      );
      installFake('ok', 0);
      // 2 runs já contam no usuário (first + replay não conta — replay não cria).
      // Precisamos de 10 no total: 1 existente + 9 aqui = 10; o próximo (11º) dá 429.
      // Para isolar a contagem, usa-se um segundo usuário só para o rate-limit.
      const rateOwner = await createMember(app, owner.cookie, 'Rate User', 'rate@example.com');
      const rateProject = await createProject(app, rateOwner.cookie, 'Projeto rate isolado');
      const rateSearch = await createSearch(
        app,
        rateOwner.cookie,
        rateProject,
        '"rate isolado"',
        {},
        ['bdtd', 'capes'],
      );
      for (let index = 0; index < 10; index += 1) {
        const res = await apiRequest(app, 'POST', `/api/v1/lab/searches/${rateSearch.id}/runs`, {
          cookieValue: rateOwner.cookie,
        });
        expect(res.statusCode).toBe(201);
      }
      const limited = await apiRequest(app, 'POST', `/api/v1/lab/searches/${rateSearch.id}/runs`, {
        cookieValue: rateOwner.cookie,
      });
      expect(limited.statusCode).toBe(429);
      expectIsolatedError(limited, 'RATE_LIMITED');
      void searchRate;
    });

    it('CORE-04/D-29/D-30: jobs espelha run + cancel de running preserva parciais + oasisbr 400 SOURCE_DISABLED', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');
      const projectId = await createProject(app, owner.cookie, 'Projeto lab jobs');

      installFake('ok', 100);
      const search = await createSearch(app, owner.cookie, projectId, '"ensino de química"', {}, [
        'bdtd',
        'capes',
      ]);
      const runRes = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(runRes.statusCode).toBe(201);
      expectClean(runRes);
      const run = runOf(runRes.json());

      const jobRes = await apiRequest(app, 'GET', `/api/v1/jobs/${run.id}`, {
        cookieValue: owner.cookie,
      });
      expect(jobRes.statusCode).toBe(200);
      expectClean(jobRes);
      const job = jobOf(jobRes.json());
      expect(job.status).toBe(run.status);
      expect(job.type).toBe('lab.search.execute');

      installFake('ok', 0);
      const runningRows = await db
        .insert(labSearchRuns)
        .values({
          searchId: search.id,
          createdBy: owner.userId,
          status: 'running',
          termSnapshot: search.term,
          filtersSnapshot: search.filters,
          sourcesSnapshot: search.sources,
          metrics: {
            perSource: {
              bdtd: { status: 'skipped', total: 0, returned: 0, durationMs: 0 },
              capes: { status: 'skipped', total: 0, returned: 0, durationMs: 0 },
            },
            newCount: 0,
            coverage: { bdtd: 0, capes: 0 },
          },
          adapterVersions: {},
        })
        .returning();
      const running = runningRows[0];
      if (running === undefined) {
        throw new Error('insert de running nao retornou linha');
      }
      await db.insert(labResults).values({
        runId: running.id,
        source: 'bdtd',
        sourceId: 'bdtd-cancel-1',
        title: 'Parcial preservada no cancel',
        authors: ['Autora'],
        rawMetadata: { id: 'bdtd-cancel-1' },
        rank: 0,
      });
      const cancelRes = await apiRequest(app, 'POST', `/api/v1/jobs/${running.id}/cancel`, {
        cookieValue: owner.cookie,
      });
      expect(cancelRes.statusCode).toBe(200);
      expectClean(cancelRes);
      expect(runOf(cancelRes.json()).status).toBe('cancelled');

      const afterCancel = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/runs/${running.id}/results?limit=20`,
        {
          cookieValue: owner.cookie,
        },
      );
      expect(afterCancel.statusCode).toBe(200);
      expectClean(afterCancel);
      expect(resultPageOf(afterCancel.json()).items.length).toBe(1);

      const oasisRows = await db
        .insert(labSearches)
        .values({
          projectId,
          term: '"teste oasisbr desabilitada"',
          filters: {},
          sources: ['oasisbr'],
        })
        .returning();
      const oasis = oasisRows[0];
      if (oasis === undefined) {
        throw new Error('insert oasisbr nao retornou linha');
      }
      const oasisRun = await apiRequest(app, 'POST', `/api/v1/lab/searches/${oasis.id}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(oasisRun.statusCode).toBe(400);
      expectIsolatedError(oasisRun, 'SOURCE_DISABLED');
    });

    it('LAB-12: GET /lab/sources lista 3 com oasisbr off + health ok com counts>0', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');

      const sources = await apiRequest(app, 'GET', '/api/v1/lab/sources', {
        cookieValue: owner.cookie,
      });
      expect(sources.statusCode).toBe(200);
      expectClean(sources);
      const list = sources.json() as { name: string; enabled: boolean }[];
      expect(list.length).toBe(3);
      const oasis = list.find((entry) => entry.name === 'oasisbr');
      expect(oasis?.enabled).toBe(false);

      const projectId = await createProject(app, owner.cookie, 'Projeto lab health');
      const search = await createSearch(app, owner.cookie, projectId, '"ensino de química"', {}, [
        'bdtd',
        'capes',
      ]);
      installFake('ok', 0);
      const runRes = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(runRes.statusCode).toBe(201);

      const healthBdtd = await apiRequest(app, 'GET', '/api/v1/lab/sources/bdtd/health', {
        cookieValue: owner.cookie,
      });
      expect(healthBdtd.statusCode).toBe(200);
      expectClean(healthBdtd);
      const bdtdHealth = healthBdtd.json() as {
        status: string;
        recent: { total: number; ok: number };
      };
      expect(bdtdHealth.status).toBe('ok');
      expect(bdtdHealth.recent.total).toBeGreaterThan(0);
      expect(bdtdHealth.recent.ok).toBeGreaterThan(0);

      const healthCapes = await apiRequest(app, 'GET', '/api/v1/lab/sources/capes/health', {
        cookieValue: owner.cookie,
      });
      expect(healthCapes.statusCode).toBe(200);
      expectClean(healthCapes);
    });

    it('IDOR lab: estranho 404 em search/run/result/job + PATCH/DELETE/POST run; adulterado 404; sem cookie 401', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');
      const stranger = await createMember(app, owner.cookie, 'Estranho B', 'b@example.com');
      const projectId = await createProject(app, owner.cookie, 'Segredo do dono');
      const search = await createSearch(app, owner.cookie, projectId, '"ensino de química"', {}, [
        'bdtd',
        'capes',
      ]);

      installFake('ok', 0);
      const runRes = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(runRes.statusCode).toBe(201);
      const run = runOf(runRes.json());
      const resultsRes = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/runs/${run.id}/results?limit=1`,
        {
          cookieValue: owner.cookie,
        },
      );
      expect(resultsRes.statusCode).toBe(200);
      const resultId = resultPageOf(resultsRes.json()).items[0]?.id;
      if (resultId === undefined) {
        throw new Error('run sem resultados para IDOR');
      }

      const getSearchB = await apiRequest(app, 'GET', `/api/v1/lab/searches/${search.id}`, {
        cookieValue: stranger.cookie,
      });
      expect(getSearchB.statusCode).toBe(404);
      expectIsolatedError(getSearchB, 'NOT_FOUND');

      const getRunB = await apiRequest(app, 'GET', `/api/v1/lab/runs/${run.id}`, {
        cookieValue: stranger.cookie,
      });
      expect(getRunB.statusCode).toBe(404);
      expectIsolatedError(getRunB, 'NOT_FOUND');

      const getResultB = await apiRequest(app, 'GET', `/api/v1/lab/results/${resultId}`, {
        cookieValue: stranger.cookie,
      });
      expect(getResultB.statusCode).toBe(404);
      expectIsolatedError(getResultB, 'NOT_FOUND');

      const getJobB = await apiRequest(app, 'GET', `/api/v1/jobs/${run.id}`, {
        cookieValue: stranger.cookie,
      });
      expect(getJobB.statusCode).toBe(404);
      expectIsolatedError(getJobB, 'NOT_FOUND');

      const patchB = await apiRequest(app, 'PATCH', `/api/v1/lab/searches/${search.id}`, {
        body: { term: '"roubo"' },
        cookieValue: stranger.cookie,
      });
      expect(patchB.statusCode).toBe(404);
      expectIsolatedError(patchB, 'NOT_FOUND');

      const delB = await apiRequest(
        app,
        'DELETE',
        `/api/v1/lab/searches/${search.id}?confirm=true`,
        {
          cookieValue: stranger.cookie,
        },
      );
      expect(delB.statusCode).toBe(404);
      expectIsolatedError(delB, 'NOT_FOUND');

      const postRunB = await apiRequest(app, 'POST', `/api/v1/lab/searches/${search.id}/runs`, {
        cookieValue: stranger.cookie,
      });
      expect(postRunB.statusCode).toBe(404);
      expectIsolatedError(postRunB, 'NOT_FOUND');

      const ghost = await apiRequest(app, 'GET', `/api/v1/lab/searches/${GHOST_UUID}`, {
        cookieValue: owner.cookie,
      });
      expect(ghost.statusCode).toBe(404);
      expectIsolatedError(ghost, 'NOT_FOUND');

      const anon = await apiRequest(app, 'GET', `/api/v1/lab/searches/${search.id}`);
      expect(anon.statusCode).toBe(401);
      expectIsolatedError(anon, 'UNAUTHENTICATED');

      const injected = await apiRequest(app, 'POST', '/api/v1/lab/searches', {
        body: {
          projectId,
          term: '"com ownerId injetado"',
          filters: {},
          sources: ['bdtd'],
          ownerId: stranger.userId,
        },
        cookieValue: owner.cookie,
      });
      expect(injected.statusCode).toBe(201);
      expectClean(injected);
      const injectedSearch = searchOf(injected.json());
      expect(injectedSearch.projectId).toBe(projectId);
      const checkB = await apiRequest(app, 'GET', `/api/v1/lab/searches/${injectedSearch.id}`, {
        cookieValue: stranger.cookie,
      });
      expect(checkB.statusCode).toBe(404);
    });
  },
);
