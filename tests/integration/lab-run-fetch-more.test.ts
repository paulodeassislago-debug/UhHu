// tests/integration — BUSCAR MAIS incremental (08-07, decisão Paulo 12/09
// REVISADA — substitui o eager 08-06).
//
// Fonte BDTD fake com total 250 em páginas de 100 (100+100+50): run inicial
// = 100 armazenados + totalKnown 250 + hasMore; fetch-more → 200;
// fetch-more → 250 + hasMore false; 4º fetch-more → nada novo, hasMore false
// (idempotente, sem dupes: count segue 250). isNew dos itens dos lotes 2-3 =
// true (run corrente; D-15 só-anteriores) e newCount do run == count(isNew)
// após CADA lote (recomputo provado). IDOR: estranho + fantasma → 404
// idêntico no fetch-more; rota sem auth → 401. Sem PG: pula com graça.
// NUNCA imprime connection string. `unknown` + narrowing, nunca `any`.

import { execFileSync } from 'node:child_process';
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

// Incremental 08-07: 250 itens em páginas de 100 → 100+100+50 (3 lotes).
const INCREMENTAL_TOTAL = 250;
const BATCH_SIZE = 100;

function incrementalBdtdRecords(count: number): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  for (let index = 0; index < count; index += 1) {
    const padded = String(index).padStart(3, '0');
    records.push({
      id: `incr-bdtd-${padded}`,
      title: `Trabalho incremental ${padded} sobre revisao sistematica`,
      authors: { primary: { [`Autor, Lote${padded}`]: [] }, secondary: [], corporate: [] },
      formats: ['masterThesis'],
      urls: [{ url: `https://bdtd.ibict.br/vufind/Record/incr-bdtd-${padded}`, desc: 'ficha' }],
    });
  }
  return records;
}

const INCREMENTAL_RECORDS = incrementalBdtdRecords(INCREMENTAL_TOTAL);

const ORIGINAL_FETCH: typeof fetch = globalThis.fetch;

function jsonFetchResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Stub global server-side (só teste): BDTD pagina por `page`/`limit` da URL
// com total 250; qualquer outro host é erro (sem rede real no teste).
async function fakeIncrementalFetch(input: string | URL | Request): Promise<Response> {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('bdtd.ibict.br')) {
    const parsed = new URL(url);
    const page = Number.parseInt(parsed.searchParams.get('page') ?? '1', 10);
    const limit = Number.parseInt(parsed.searchParams.get('limit') ?? '100', 10);
    const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : BATCH_SIZE;
    const start = (safePage - 1) * safeLimit;
    const slice = INCREMENTAL_RECORDS.slice(start, start + safeLimit);
    return jsonFetchResponse({ resultCount: INCREMENTAL_TOTAL, records: slice, status: 'OK' }, 200);
  }
  throw new Error(
    `fakeIncrementalFetch: host inesperado (sem rede real no teste): ${url.slice(0, 80)}`,
  );
}

function installIncrementalFake(): void {
  globalThis.fetch = fakeIncrementalFetch as typeof fetch;
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

interface TestSourceMetrics {
  status: string;
  total: number;
  returned: number;
  durationMs: number;
  pagesFetched?: number;
  pagesTotal?: number | null;
}

interface TestRun {
  id: string;
  searchId: string;
  status: string;
  metrics: {
    perSource: { bdtd: TestSourceMetrics; capes: TestSourceMetrics };
    newCount: number;
    coverage: { bdtd: number; capes: number };
  };
}

function runOf(body: unknown): TestRun {
  return body as TestRun;
}

interface TestFetchMore {
  added: { bdtd: number; capes: number };
  hasMore: { bdtd: boolean; capes: boolean };
  newCount: number;
  returned: number;
  total: number;
}

function fetchMoreOf(body: unknown): TestFetchMore {
  const record = body as Record<string, unknown>;
  const added = record['added'] as { bdtd: number; capes: number };
  const hasMore = record['hasMore'] as { bdtd: boolean; capes: boolean };
  const newCount = record['newCount'];
  const returned = record['returned'];
  const total = record['total'];
  if (
    typeof added !== 'object' ||
    added === null ||
    typeof added.bdtd !== 'number' ||
    typeof added.capes !== 'number' ||
    typeof hasMore !== 'object' ||
    hasMore === null ||
    typeof hasMore.bdtd !== 'boolean' ||
    typeof hasMore.capes !== 'boolean' ||
    typeof newCount !== 'number' ||
    typeof returned !== 'number' ||
    typeof total !== 'number'
  ) {
    throw new Error('resposta do fetch-more com shape inesperado');
  }
  return { added, hasMore, newCount, returned, total };
}

interface TestResultItem {
  id: string;
  sourceId: string;
  isNew: boolean;
}

interface TestResultPage {
  items: TestResultItem[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
  total: number;
  newCount: number;
}

function resultPageOf(body: unknown): TestResultPage {
  const record = body as Record<string, unknown>;
  const itemsRaw = record['items'];
  const page = record['page'] as { limit: number; nextCursor: string | null; hasMore: boolean };
  const total = record['total'];
  const newCount = record['newCount'];
  if (!Array.isArray(itemsRaw) || typeof total !== 'number' || typeof newCount !== 'number') {
    throw new Error('pagina de results com shape inesperado');
  }
  const items: TestResultItem[] = itemsRaw.map((entry: unknown) => {
    const row = entry as Record<string, unknown>;
    const id = row['id'];
    const sourceId = row['sourceId'];
    const isNew = row['isNew'];
    if (typeof id !== 'string' || typeof sourceId !== 'string' || typeof isNew !== 'boolean') {
      throw new Error('item da pagina sem id/sourceId/isNew');
    }
    return { id, sourceId, isNew };
  });
  return { items, page, total, newCount };
}

interface ApiResponse {
  statusCode: number;
  headers: unknown;
  json(): unknown;
}

async function apiRequest(
  app: FastifyInstance,
  method: 'GET' | 'POST',
  url: string,
  options: { body?: Record<string, unknown>; cookieValue?: string } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(options.cookieValue !== undefined
      ? { cookie: `${COOKIE_NAME}=${options.cookieValue}` }
      : {}),
  };
  if (method === 'GET') {
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
  const reg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
    body: {
      name,
      email,
      password: 'SenhaForte123!',
      inviteToken: inviteOf(boot.json()).inviteToken,
    },
  });
  expect(reg.statusCode).toBe(201);
  return { userId: userOf(reg.json()).id, cookie: requireSessionCookie(reg) };
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
  const reg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
    body: {
      name,
      email,
      password: 'SenhaForte123!',
      inviteToken: inviteOf(inv.json()).inviteToken,
    },
  });
  expect(reg.statusCode).toBe(201);
  return { userId: userOf(reg.json()).id, cookie: requireSessionCookie(reg) };
}

// Prova que execFileSync foi importado do child_process (evita tree-shake
// remover o import usado no beforeAll do migrate).
void execFileSync;

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'lab run fetch-more PG real (incremental 08-07: 250 em 100+100+50, isNew/newCount por lote, IDOR)',
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
          console.warn('[lab-run-fetch-more] PG inalcançavel no migrate — pulando (offline).');
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
      installIncrementalFake();
    });

    afterEach(() => {
      globalThis.fetch = ORIGINAL_FETCH;
    });

    it('08-07: 250 via 3 lotes (100+100+50) com hasMore, isNew e newCount por lote', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-run-fetch-more] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const api = app;
      const owner = await bootstrapAdmin(api, 'Dono Incremental', 'incremental@example.com');
      const created = await apiRequest(api, 'POST', '/api/v1/projects', {
        body: { title: 'Projeto incremental' },
        cookieValue: owner.cookie,
      });
      expect(created.statusCode).toBe(201);
      const projectId = (created.json() as { id: string }).id;

      const searchRes = await apiRequest(api, 'POST', '/api/v1/lab/searches', {
        body: {
          projectId,
          term: '"busca incremental sob demanda"',
          filters: {},
          sources: ['bdtd'],
        },
        cookieValue: owner.cookie,
      });
      expect(searchRes.statusCode).toBe(201);
      const searchId = (searchRes.json() as { id: string }).id;

      // Conta isNew em TODAS as páginas do run (badge≡contador por lote).
      const countIsNew = async (runId: string): Promise<{ total: number; fresh: number }> => {
        let cursor: string | null = null;
        let total = 0;
        let fresh = 0;
        let guard = 0;
        do {
          const suffix = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
          const res = await apiRequest(
            api,
            'GET',
            `/api/v1/lab/runs/${runId}/results?limit=100${suffix}`,
            { cookieValue: owner.cookie },
          );
          expect(res.statusCode).toBe(200);
          const page = resultPageOf(res.json());
          total = page.total;
          for (const item of page.items) {
            if (item.isNew) {
              fresh += 1;
            }
          }
          cursor = page.page.nextCursor;
          guard += 1;
          if (guard > 5) {
            throw new Error('paginacao de results nao terminou em 5 paginas');
          }
        } while (cursor !== null);
        return { total, fresh };
      };
      const fetchMore = async (runId: string): Promise<{ status: number; body: TestFetchMore }> => {
        const res = await apiRequest(api, 'POST', `/api/v1/lab/runs/${runId}/fetch-more`, {
          cookieValue: owner.cookie,
        });
        expect(res.statusCode).toBe(200);
        return { status: res.statusCode, body: fetchMoreOf(res.json()) };
      };

      // Lote 1 (run inicial): 100 armazenados + totalKnown 250 + hasMore.
      installIncrementalFake();
      const runRes = await apiRequest(api, 'POST', `/api/v1/lab/searches/${searchId}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(runRes.statusCode).toBe(201);
      const run = runOf(runRes.json());
      expect(run.status).toBe('succeeded');
      expect(run.metrics.perSource.bdtd.status).toBe('ok');
      expect(run.metrics.perSource.bdtd.total).toBe(250);
      expect(run.metrics.perSource.bdtd.returned).toBe(100);
      expect(run.metrics.newCount).toBe(100);
      const lote1 = await countIsNew(run.id);
      expect(lote1.total).toBe(100);
      expect(lote1.fresh).toBe(100);
      expect(lote1.fresh).toBe(run.metrics.newCount);

      // Lote 2: +100 → 200, hasMore segue true, isNew true nos novos.
      const second = await fetchMore(run.id);
      expect(second.body.added.bdtd).toBe(100);
      expect(second.body.added.capes).toBe(0);
      expect(second.body.hasMore.bdtd).toBe(true);
      expect(second.body.returned).toBe(200);
      expect(second.body.total).toBe(250);
      expect(second.body.newCount).toBe(200);
      const lote2 = await countIsNew(run.id);
      expect(lote2.total).toBe(200);
      expect(lote2.fresh).toBe(200);
      expect(lote2.fresh).toBe(second.body.newCount);

      // Lote 3: +50 → 250, hasMore false (fonte esgotada).
      const third = await fetchMore(run.id);
      expect(third.body.added.bdtd).toBe(50);
      expect(third.body.hasMore.bdtd).toBe(false);
      expect(third.body.returned).toBe(250);
      expect(third.body.total).toBe(250);
      expect(third.body.newCount).toBe(250);
      const lote3 = await countIsNew(run.id);
      expect(lote3.total).toBe(250);
      expect(lote3.fresh).toBe(250);
      expect(lote3.fresh).toBe(third.body.newCount);

      // 4º fetch-more: idempotente — nada novo, hasMore false, sem dupes.
      const fourth = await fetchMore(run.id);
      expect(fourth.body.added.bdtd).toBe(0);
      expect(fourth.body.hasMore.bdtd).toBe(false);
      expect(fourth.body.returned).toBe(250);
      expect(lote3.total).toBe(250);
      const rows = await db.select().from(labResults);
      expect(rows.filter((row) => row.runId === run.id).length).toBe(250);
    });

    it('08-07: IDOR no fetch-more (estranho + fantasma 404; sem auth 401)', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-run-fetch-more] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const api = app;
      const owner = await bootstrapAdmin(api, 'Dona Fetch', 'fetch@example.com');
      const stranger = await createMember(
        api,
        owner.cookie,
        'Estranho Fetch',
        'stranger-fetch@example.com',
      );
      const created = await apiRequest(api, 'POST', '/api/v1/projects', {
        body: { title: 'Projeto fetch-more isolado' },
        cookieValue: owner.cookie,
      });
      expect(created.statusCode).toBe(201);
      const projectId = (created.json() as { id: string }).id;
      const searchRes = await apiRequest(api, 'POST', '/api/v1/lab/searches', {
        body: { projectId, term: '"isolamento fetch-more"', filters: {}, sources: ['bdtd'] },
        cookieValue: owner.cookie,
      });
      expect(searchRes.statusCode).toBe(201);
      const searchId = (searchRes.json() as { id: string }).id;

      installIncrementalFake();
      const runRes = await apiRequest(api, 'POST', `/api/v1/lab/searches/${searchId}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(runRes.statusCode).toBe(201);
      const runId = (runRes.json() as { id: string }).id;

      const foreign = await apiRequest(api, 'POST', `/api/v1/lab/runs/${runId}/fetch-more`, {
        cookieValue: stranger.cookie,
      });
      expect(foreign.statusCode).toBe(404);
      expect(errorOf(foreign.json()).code).toBe('NOT_FOUND');

      const ghost = await apiRequest(api, 'POST', `/api/v1/lab/runs/${GHOST_UUID}/fetch-more`, {
        cookieValue: owner.cookie,
      });
      expect(ghost.statusCode).toBe(404);
      expect(errorOf(ghost.json()).code).toBe('NOT_FOUND');

      const noAuth = await apiRequest(api, 'POST', `/api/v1/lab/runs/${runId}/fetch-more`);
      expect(noAuth.statusCode).toBe(401);
    });
  },
);
