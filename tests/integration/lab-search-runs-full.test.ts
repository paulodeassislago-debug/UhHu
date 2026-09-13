// tests/integration — lote INICIAL por run (08-07, decisão Paulo 12/09
// REVISADA — substitui o eager 08-06 sem teto).
//
// Run inicial = 1 lote: BDTD pág.1 limit=100 + CAPES págs.1-2 ×50 (=100 por
// fonte) com totalKnown da fonte exposto (`perSource.total` = page.total da
// pág.1: BDTD resultCount, CAPES total). Fixtures: BDTD total 250, CAPES
// total 120 → run armazena 200 (100+100) com hasMore implícito
// (stored < total). Rank contínuo por fonte 0..99. Cancel no meio do lote
// preserva a página em voo e termina `cancelled` — disparo determinístico:
// stub lento (400ms por página) + cancel após observar o run `running`.
// Sem PG: pula com graça. NUNCA imprime connection string. `unknown` +
// narrowing, nunca `any`.

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

// Lote inicial 08-07: BDTD total 250 (pág.1 de 100 no lote inicial), CAPES
// total 120 (págs.1-2 de 50 no lote inicial → 100).
const BDTD_TOTAL = 250;
const CAPES_TOTAL = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Registros no shape REAL VuFind (primary-map + formats[] + urls[]).
function fullBdtdRecords(count: number): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  for (let index = 0; index < count; index += 1) {
    const padded = String(index).padStart(3, '0');
    records.push({
      id: `full-bdtd-${padded}`,
      title: `Trabalho completo ${padded} sobre revisao sistematica`,
      authors: { primary: { [`Autor, Numero${padded}`]: [] }, secondary: [], corporate: [] },
      formats: ['masterThesis'],
      urls: [{ url: `https://bdtd.ibict.br/vufind/Record/full-bdtd-${padded}`, desc: 'ficha' }],
    });
  }
  return records;
}

// Registros no shape REAL CAPES rest/busca (id + titulo + autor).
function fullCapesRecords(count: number): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  for (let index = 0; index < count; index += 1) {
    const padded = String(index).padStart(3, '0');
    records.push({
      id: `full-capes-${padded}`,
      titulo: `Tese completa ${padded} sobre revisao sistematica`,
      autor: `Autora Capes ${padded}`,
    });
  }
  return records;
}

const BDTD_RECORDS = fullBdtdRecords(BDTD_TOTAL);
const CAPES_RECORDS = fullCapesRecords(CAPES_TOTAL);

let fetchDelayMs = 0;
const ORIGINAL_FETCH: typeof fetch = globalThis.fetch;

function jsonFetchResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Stub global server-side (só teste): BDTD pagina por `page`/`limit` da URL,
// CAPES por `pagina`/`registrosPorPagina` do corpo POST; qualquer outro host
// é erro (sem rede real no teste).
async function fakeBatchFetch(input: string | URL | Request, init?: unknown): Promise<Response> {
  if (fetchDelayMs > 0) {
    await sleep(fetchDelayMs);
  }
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('bdtd.ibict.br')) {
    const parsed = new URL(url);
    const page = Number.parseInt(parsed.searchParams.get('page') ?? '1', 10);
    const limit = Number.parseInt(parsed.searchParams.get('limit') ?? '100', 10);
    const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : 100;
    const start = (safePage - 1) * safeLimit;
    const slice = BDTD_RECORDS.slice(start, start + safeLimit);
    return jsonFetchResponse({ resultCount: BDTD_TOTAL, records: slice, status: 'OK' }, 200);
  }
  if (url.includes('catalogodeteses.capes.gov.br')) {
    let pagina = 1;
    let porPagina = 50;
    if (typeof init === 'object' && init !== null && 'body' in init) {
      const body: unknown = (init as { body?: unknown }).body;
      if (typeof body === 'string') {
        try {
          const payload = JSON.parse(body) as Record<string, unknown>;
          const rawPag = payload['pagina'];
          const rawPer = payload['registrosPorPagina'];
          if (typeof rawPag === 'number' && Number.isSafeInteger(rawPag) && rawPag > 0) {
            pagina = rawPag;
          }
          if (typeof rawPer === 'number' && Number.isSafeInteger(rawPer) && rawPer > 0) {
            porPagina = rawPer;
          }
        } catch {
          pagina = 1;
        }
      }
    }
    const start = (pagina - 1) * porPagina;
    const slice = CAPES_RECORDS.slice(start, start + porPagina);
    return jsonFetchResponse({ total: CAPES_TOTAL, tesesDissertacoes: slice }, 200);
  }
  throw new Error(`fakeBatchFetch: host inesperado (sem rede real no teste): ${url.slice(0, 80)}`);
}

function installBatchFake(delayMs = 0): void {
  fetchDelayMs = delayMs;
  globalThis.fetch = fakeBatchFetch as typeof fetch;
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

interface TestResultItem {
  id: string;
  sourceId: string;
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
    if (typeof id !== 'string' || typeof sourceId !== 'string') {
      throw new Error('item da pagina sem id/sourceId');
    }
    return { id, sourceId };
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

// Prova que execFileSync foi importado do child_process (evita tree-shake
// remover o import usado no beforeAll do migrate).
void execFileSync;

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'lab search runs PG real (lote inicial 08-07: 100/fonte + totalKnown, cancel de batch)',
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
          console.warn('[lab-search-runs-full] PG inalcançavel no migrate — pulando (offline).');
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
      installBatchFake(0);
    });

    afterEach(() => {
      globalThis.fetch = ORIGINAL_FETCH;
    });

    it('08-07: run inicial armazena 1 lote (BDTD 100 + CAPES 2x50) com totalKnown e hasMore', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs-full] PG inalcançavel — teste pulado (offline).');
        return;
      }
      // Narrowing de `let` não sobrevive dentro de closures: captura em const
      // para os helpers (TS2345 no typecheck raiz, gap 08-05).
      const api = app;
      const database = db;
      const owner = await bootstrapAdmin(api, 'Dona Lote', 'lote@example.com');
      const created = await apiRequest(api, 'POST', '/api/v1/projects', {
        body: { title: 'Projeto lote inicial' },
        cookieValue: owner.cookie,
      });
      expect(created.statusCode).toBe(201);
      const projectId = (created.json() as { id: string }).id;

      const searchRes = await apiRequest(api, 'POST', '/api/v1/lab/searches', {
        body: {
          projectId,
          term: '"revisao sistematica em lote"',
          filters: {},
          sources: ['bdtd', 'capes'],
        },
        cookieValue: owner.cookie,
      });
      expect(searchRes.statusCode).toBe(201);
      const searchId = (searchRes.json() as { id: string }).id;

      installBatchFake(0);
      const runRes = await apiRequest(api, 'POST', `/api/v1/lab/searches/${searchId}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(runRes.statusCode).toBe(201);
      const run = runOf(runRes.json());
      // Lote inicial completa `succeeded` bem abaixo do teto de 60s/lote.
      expect(run.status).toBe('succeeded');
      const bdtd = run.metrics.perSource.bdtd;
      expect(bdtd.status).toBe('ok');
      // totalKnown da fonte (BDTD resultCount da pág.1), 100 armazenados.
      expect(bdtd.total).toBe(250);
      expect(bdtd.returned).toBe(100);
      expect(bdtd.pagesFetched).toBe(1);
      expect(bdtd.pagesTotal).toBe(3);
      const capes = run.metrics.perSource.capes;
      expect(capes.status).toBe('ok');
      // CAPES total da pág.1, 2×50 no lote inicial.
      expect(capes.total).toBe(120);
      expect(capes.returned).toBe(100);
      expect(capes.pagesFetched).toBe(2);
      expect(capes.pagesTotal).toBe(3);
      expect(run.metrics.newCount).toBe(200);
      expect(run.metrics.coverage.bdtd).toBe(100);
      expect(run.metrics.coverage.capes).toBe(100);
      // hasMore implícito: armazenados < totalKnown nas duas fontes.
      expect(bdtd.returned).toBeLessThan(bdtd.total);
      expect(capes.returned).toBeLessThan(capes.total);

      // Coleta via GET results paginado (limit 100 → 2 páginas): 200 itens.
      const seenIds: string[] = [];
      let cursor: string | null = null;
      let guard = 0;
      do {
        const suffix = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
        const res = await apiRequest(
          api,
          'GET',
          `/api/v1/lab/runs/${run.id}/results?limit=100${suffix}`,
          { cookieValue: owner.cookie },
        );
        expect(res.statusCode).toBe(200);
        const page = resultPageOf(res.json());
        for (const item of page.items) {
          seenIds.push(item.id);
        }
        cursor = page.page.nextCursor;
        guard += 1;
        if (guard > 5) {
          throw new Error('paginacao de results nao terminou em 5 paginas');
        }
      } while (cursor !== null);
      expect(seenIds.length).toBe(200);

      // Rank contínuo por fonte 0..99 (leitura direta; rank não é DTO).
      const allRows = await database.select().from(labResults);
      const runRows = allRows.filter((row) => row.runId === run.id);
      expect(runRows.length).toBe(200);
      for (const source of ['bdtd', 'capes'] as const) {
        const ranks = runRows
          .filter((row) => row.source === source)
          .map((row) => row.rank)
          .sort((a, b) => a - b);
        expect(ranks.length).toBe(100);
        for (let index = 0; index < 100; index += 1) {
          expect(ranks[index]).toBe(index);
        }
      }
      const sourceIds = new Set(runRows.map((row) => `${row.source}|${row.sourceId}`));
      expect(sourceIds.size).toBe(200);
    });

    it('08-07: cancel no meio do lote preserva a pagina em voo e termina cancelled', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs-full] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const api = app;
      const database = db;
      const owner = await bootstrapAdmin(api, 'Dono Cancela Lote', 'cancela-lote@example.com');
      const created = await apiRequest(api, 'POST', '/api/v1/projects', {
        body: { title: 'Projeto cancel de batch' },
        cookieValue: owner.cookie,
      });
      expect(created.statusCode).toBe(201);
      const projectId = (created.json() as { id: string }).id;

      const searchRes = await apiRequest(api, 'POST', '/api/v1/lab/searches', {
        body: {
          projectId,
          term: '"cancelamento no meio do lote"',
          filters: {},
          sources: ['bdtd'],
        },
        cookieValue: owner.cookie,
      });
      expect(searchRes.statusCode).toBe(201);
      const searchId = (searchRes.json() as { id: string }).id;

      // Stub lento: 400ms na página única do lote BDTD (100); o cancel abaixo
      // cai dentro do fetch com folga (primeiro sleep de 100ms garante o
      // motor já dentro do fetch da página 1).
      installBatchFake(400);
      const runPromise = apiRequest(api, 'POST', `/api/v1/lab/searches/${searchId}/runs`, {
        cookieValue: owner.cookie,
      });
      await sleep(100);
      let targetId: string | null = null;
      for (let attempt = 0; attempt < 40 && targetId === null; attempt += 1) {
        const rows = await database.select().from(labSearchRuns);
        const found = rows.find((row) => row.searchId === searchId && row.status === 'running');
        if (found !== undefined) {
          targetId = found.id;
        } else {
          await sleep(50);
        }
      }
      expect(targetId).not.toBeNull();
      if (targetId === null) {
        throw new Error('run running nao observado para cancel');
      }
      const cancelRes = await apiRequest(api, 'POST', `/api/v1/jobs/${targetId}/cancel`, {
        cookieValue: owner.cookie,
      });
      expect(cancelRes.statusCode).toBe(200);

      const runRes = await runPromise;
      expect(runRes.statusCode).toBe(201);
      const run = runOf(runRes.json());
      expect(run.id).toBe(targetId);
      expect(run.status).toBe('cancelled');
      // Página em voo preservada (100 do lote BDTD).
      expect(run.metrics.perSource.bdtd.returned).toBe(100);
      expect(run.metrics.perSource.bdtd.pagesFetched).toBe(1);

      const resultsRes = await apiRequest(
        api,
        'GET',
        `/api/v1/lab/runs/${targetId}/results?limit=100`,
        { cookieValue: owner.cookie },
      );
      expect(resultsRes.statusCode).toBe(200);
      expect(resultPageOf(resultsRes.json()).total).toBe(100);
    });
  },
);
