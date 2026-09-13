// tests/integration — busca COMPLETA por run (08-06, decisão Paulo 12/09).
//
// Fonte BDTD fake com total 120 em 3 páginas (50+50+20, perPage 50): o run
// armazena os 120 com rank global 0..119 contínuo e único, `returned===120`,
// `pagesFetched===3`; rerun na mesma search → `newCount===0` (D-35 com busca
// completa). Cancel no meio do loop preserva a página 1 (50) e termina
// `cancelled` (parcial D-37) — disparo determinístico: stub lento (400ms por
// página) + cancel após observar o run `running` no banco (janela de ~1.2s,
// sem flakiness de corrida).
//
// Timeout 30min: prova por construção — o loop de 3 páginas rápidas completa
// `succeeded` bem abaixo do teto (o teto antigo de 60s também passaria aqui;
// a trava real é o `RUN_QUEUE_TIMEOUT_MS = 30 * 60_000` do lib, coberta pelo
// gate de grep do plano). Sem PG: pula com graça. NUNCA imprime connection
// string. `unknown` + narrowing, nunca `any`.

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

// Busca completa 08-06: 120 itens em páginas de 50 → 50+50+20 (3 páginas).
const FULL_TOTAL = 120;
const FULL_PER_PAGE = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// 120 registros no shape REAL VuFind (primary-map + formats[] + urls[]).
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

const FULL_RECORDS = fullBdtdRecords(FULL_TOTAL);

let fetchDelayMs = 0;
const ORIGINAL_FETCH: typeof fetch = globalThis.fetch;

function jsonFetchResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Stub global server-side (só teste): BDTD pagina por `page`/`limit` da URL
// com total 120; qualquer outro host é erro (sem rede real no teste).
async function fakeFullFetch(input: string | URL | Request): Promise<Response> {
  if (fetchDelayMs > 0) {
    await sleep(fetchDelayMs);
  }
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('bdtd.ibict.br')) {
    const parsed = new URL(url);
    const page = Number.parseInt(parsed.searchParams.get('page') ?? '1', 10);
    const limit = Number.parseInt(parsed.searchParams.get('limit') ?? '50', 10);
    const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : FULL_PER_PAGE;
    const start = (safePage - 1) * safeLimit;
    const slice = FULL_RECORDS.slice(start, start + safeLimit);
    return jsonFetchResponse({ resultCount: FULL_TOTAL, records: slice, status: 'OK' }, 200);
  }
  throw new Error(`fakeFullFetch: host inesperado (sem rede real no teste): ${url.slice(0, 80)}`);
}

function installFullFake(delayMs = 0): void {
  fetchDelayMs = delayMs;
  globalThis.fetch = fakeFullFetch as typeof fetch;
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
  'lab search runs full PG real (busca completa 120/120, rerun, cancel mid-loop)',
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
      installFullFake(0);
    });

    afterEach(() => {
      globalThis.fetch = ORIGINAL_FETCH;
    });

    it('08-06: fonte de 120 itens armazena os 120 (3 paginas de 50) com rank 0..119 + rerun newCount 0', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs-full] PG inalcançavel — teste pulado (offline).');
        return;
      }
      // Narrowing de `let` não sobrevive dentro de closures: captura em const
      // para os helpers (TS2345 no typecheck raiz, gap 08-05).
      const api = app;
      const database = db;
      const owner = await bootstrapAdmin(api, 'Dona Completa', 'completa@example.com');
      const created = await apiRequest(api, 'POST', '/api/v1/projects', {
        body: { title: 'Projeto busca completa' },
        cookieValue: owner.cookie,
      });
      expect(created.statusCode).toBe(201);
      const projectId = (created.json() as { id: string }).id;

      const searchRes = await apiRequest(api, 'POST', '/api/v1/lab/searches', {
        body: {
          projectId,
          term: '"revisao sistematica completa"',
          filters: {},
          sources: ['bdtd'],
        },
        cookieValue: owner.cookie,
      });
      expect(searchRes.statusCode).toBe(201);
      const searchId = (searchRes.json() as { id: string }).id;

      installFullFake(0);
      const runRes = await apiRequest(api, 'POST', `/api/v1/lab/searches/${searchId}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(runRes.statusCode).toBe(201);
      const run = runOf(runRes.json());
      // 3 páginas rápidas completam `succeeded` bem abaixo do teto de 30min
      // (o teto nunca aborta loop saudável; trava real no lib).
      expect(run.status).toBe('succeeded');
      const bdtd = run.metrics.perSource.bdtd;
      expect(bdtd.status).toBe('ok');
      expect(bdtd.total).toBe(120);
      expect(bdtd.returned).toBe(120);
      expect(bdtd.pagesFetched).toBe(3);
      expect(bdtd.pagesTotal).toBe(3);
      expect(run.metrics.newCount).toBe(120);
      expect(run.metrics.coverage.bdtd).toBe(120);

      // Coleta via GET results paginado (limit 100 → 2 páginas): 120 itens.
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
      expect(seenIds.length).toBe(120);

      // Rank global contínuo e único 0..119 (leitura direta; rank não é DTO).
      const allRows = await database.select().from(labResults);
      const runRows = allRows.filter((row) => row.runId === run.id);
      expect(runRows.length).toBe(120);
      const ranks = runRows.map((row) => row.rank).sort((a, b) => a - b);
      for (let index = 0; index < 120; index += 1) {
        expect(ranks[index]).toBe(index);
      }
      const sourceIds = new Set(runRows.map((row) => row.sourceId));
      expect(sourceIds.size).toBe(120);

      // Rerun na mesma search: busca completa de novo, nada novo (D-35).
      const rerunRes = await apiRequest(api, 'POST', `/api/v1/lab/searches/${searchId}/runs`, {
        cookieValue: owner.cookie,
      });
      expect(rerunRes.statusCode).toBe(201);
      const rerun = runOf(rerunRes.json());
      expect(rerun.status).toBe('succeeded');
      expect(rerun.id).not.toBe(run.id);
      expect(rerun.metrics.perSource.bdtd.returned).toBe(120);
      expect(rerun.metrics.newCount).toBe(0);
    });

    it('08-06: cancel no meio do loop preserva a pagina 1 (50) e termina cancelled', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-search-runs-full] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const api = app;
      const database = db;
      const owner = await bootstrapAdmin(api, 'Dono Cancela', 'cancela@example.com');
      const created = await apiRequest(api, 'POST', '/api/v1/projects', {
        body: { title: 'Projeto cancel mid-loop' },
        cookieValue: owner.cookie,
      });
      expect(created.statusCode).toBe(201);
      const projectId = (created.json() as { id: string }).id;

      const searchRes = await apiRequest(api, 'POST', '/api/v1/lab/searches', {
        body: {
          projectId,
          term: '"cancelamento no meio do loop"',
          filters: {},
          sources: ['bdtd'],
        },
        cookieValue: owner.cookie,
      });
      expect(searchRes.statusCode).toBe(201);
      const searchId = (searchRes.json() as { id: string }).id;

      // Stub lento: 400ms por página → run dura ~1.2s; o cancel abaixo cai
      // dentro da página 1 com folga (sem corrida flaky: primeiro sleep de
      // 100ms garante o motor já dentro do fetch da página 1).
      installFullFake(400);
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
      // Página 1 preservada (50), páginas 2-3 nunca coletadas (parcial D-37).
      expect(run.metrics.perSource.bdtd.returned).toBe(50);
      expect(run.metrics.perSource.bdtd.pagesFetched).toBe(1);

      const resultsRes = await apiRequest(
        api,
        'GET',
        `/api/v1/lab/runs/${targetId}/results?limit=100`,
        { cookieValue: owner.cookie },
      );
      expect(resultsRes.statusCode).toBe(200);
      expect(resultPageOf(resultsRes.json()).total).toBe(50);
    });
  },
);
