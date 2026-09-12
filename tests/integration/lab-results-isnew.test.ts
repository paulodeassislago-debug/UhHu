// tests/integration — isNew derivado on-read no GET results (UI-31, §14-5, D-35).
//
// 1 search, run1 com item A, run2 com item A repetido + item B novo (inserts
// diretos via db, sem adapters/rede): assert A.isNew===false, B.isNew===true,
// newCount===1===count(isNew===true) no run2; GET unitário preenche igual.
// IDOR: estranho e uuid adulterado → 404 idêntico. Sem PG: pula com graça.
// NUNCA imprime connection string. `unknown` + narrowing, nunca `any`.

import { execFileSync } from 'node:child_process';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

function headerValue(res: { headers: unknown }, name: string): unknown {
  if (typeof res.headers !== 'object' || res.headers === null) {
    return undefined;
  }
  return (res.headers as Record<string, unknown>)[name];
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

interface TestResult {
  id: string;
  runId: string;
  source: string;
  sourceId: string;
  title: string;
  isNew: boolean;
}

function resultOf(body: unknown): TestResult {
  const record = body as Record<string, unknown>;
  const id = record['id'];
  const runId = record['runId'];
  const source = record['source'];
  const sourceId = record['sourceId'];
  const title = record['title'];
  const isNew = record['isNew'];
  if (
    typeof id !== 'string' ||
    typeof runId !== 'string' ||
    typeof source !== 'string' ||
    typeof sourceId !== 'string' ||
    typeof title !== 'string' ||
    typeof isNew !== 'boolean'
  ) {
    throw new Error('ResultDTO sem isNew booleano');
  }
  return { id, runId, source, sourceId, title, isNew };
}

interface TestResultPage {
  items: TestResult[];
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
  const items: TestResult[] = itemsRaw.map((entry: unknown) => {
    const row = entry as Record<string, unknown>;
    const id = row['id'];
    const runId = row['runId'];
    const source = row['source'];
    const sourceId = row['sourceId'];
    const title = row['title'];
    const isNew = row['isNew'];
    if (
      typeof id !== 'string' ||
      typeof runId !== 'string' ||
      typeof source !== 'string' ||
      typeof sourceId !== 'string' ||
      typeof title !== 'string' ||
      typeof isNew !== 'boolean'
    ) {
      throw new Error('item da pagina sem isNew booleano');
    }
    return { id, runId, source, sourceId, title, isNew };
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
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  options: { body?: Record<string, unknown>; cookieValue?: string } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(options.cookieValue !== undefined
      ? { cookie: `${COOKIE_NAME}=${options.cookieValue}` }
      : {}),
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

// Stack de prova sem adapters: runs/results inseridos direto no PG com o
// shape mínimo exigido pelo schema (status/metrics/snapshots). O GET exercita
// a derivação on-read — nenhum dado de teste carrega isNew persistido.
async function seedTwoRuns(db: Db, ownerId: string, searchId: string): Promise<{
  run1Id: string;
  run2Id: string;
  repeatedResultId: string;
  freshResultId: string;
}> {
  const baseMetrics = (newCount: number): Record<string, unknown> => ({
    perSource: {
      bdtd: { status: 'ok', total: 2, returned: 2, durationMs: 5 },
      capes: { status: 'skipped', total: 0, returned: 0, durationMs: 0 },
    },
    newCount,
    coverage: { bdtd: 2, capes: 0 },
  });
  const run1Rows = await db
    .insert(labSearchRuns)
    .values({
      searchId,
      createdBy: ownerId,
      status: 'succeeded',
      termSnapshot: '"isnew deterministico"',
      filtersSnapshot: {},
      sourcesSnapshot: ['bdtd'],
      metrics: baseMetrics(1),
      adapterVersions: {},
    })
    .returning({ id: labSearchRuns.id });
  const run1 = run1Rows[0];
  if (run1 === undefined) {
    throw new Error('insert run1 nao retornou linha');
  }
  await db.insert(labResults).values({
    runId: run1.id,
    source: 'bdtd',
    sourceId: 'isnew-a',
    title: 'Item A do primeiro run',
    authors: ['Autora A'],
    rawMetadata: { id: 'isnew-a' },
    rank: 0,
  });
  const run2Rows = await db
    .insert(labSearchRuns)
    .values({
      searchId,
      createdBy: ownerId,
      status: 'succeeded',
      termSnapshot: '"isnew deterministico"',
      filtersSnapshot: {},
      sourcesSnapshot: ['bdtd'],
      // Mesma semântica D-35 do lib: só B é inédito → newCount 1.
      metrics: baseMetrics(1),
      adapterVersions: {},
    })
    .returning({ id: labSearchRuns.id });
  const run2 = run2Rows[0];
  if (run2 === undefined) {
    throw new Error('insert run2 nao retornou linha');
  }
  const inserted = await db
    .insert(labResults)
    .values([
      {
        runId: run2.id,
        source: 'bdtd',
        sourceId: 'isnew-a',
        title: 'Item A repetido no segundo run',
        authors: ['Autora A'],
        rawMetadata: { id: 'isnew-a' },
        rank: 0,
      },
      {
        runId: run2.id,
        source: 'bdtd',
        sourceId: 'isnew-b',
        title: 'Item B inedito no segundo run',
        authors: ['Autora B'],
        rawMetadata: { id: 'isnew-b' },
        rank: 1,
      },
    ])
    .returning({ id: labResults.id, sourceId: labResults.sourceId });
  const repeated = inserted.find((row) => row.sourceId === 'isnew-a');
  const fresh = inserted.find((row) => row.sourceId === 'isnew-b');
  if (repeated === undefined || fresh === undefined) {
    throw new Error('insert dos results do run2 nao retornou linhas');
  }
  return {
    run1Id: run1.id,
    run2Id: run2.id,
    repeatedResultId: repeated.id,
    freshResultId: fresh.id,
  };
}

// D-15/H-01 (decisão Paulo 12/09 "só-anteriores"): 3 runs com executedAt
// explícito e ordenado (run1: A; run2: A+B; run3: A+C, metrics.newCount
// 1/1/1). Prova o histórico congelado: o run3 posterior NUNCA apaga o badge
// do run2, e count(isNew)===newCount nos 3 runs. Empate exato de executedAt
// é tratado como posterior (não-visto → isNew true).
async function seedThreeRuns(db: Db, ownerId: string, searchId: string): Promise<{
  run1Id: string;
  run2Id: string;
  run3Id: string;
  run1AId: string;
  run2AId: string;
  run2BId: string;
  run3AId: string;
  run3BId: string;
  run3CId: string;
}> {
  const baseMetrics = (newCount: number): Record<string, unknown> => ({
    perSource: {
      bdtd: { status: 'ok', total: 2, returned: 2, durationMs: 5 },
      capes: { status: 'skipped', total: 0, returned: 0, durationMs: 0 },
    },
    newCount,
    coverage: { bdtd: 2, capes: 0 },
  });
  const base = Date.parse('2026-09-01T10:00:00.000Z');
  const insertRun = async (executedAt: Date, newCount: number): Promise<string> => {
    const rows = await db
      .insert(labSearchRuns)
      .values({
        searchId,
        createdBy: ownerId,
        status: 'succeeded',
        termSnapshot: '"isnew tres runs"',
        filtersSnapshot: {},
        sourcesSnapshot: ['bdtd'],
        executedAt,
        metrics: baseMetrics(newCount),
        adapterVersions: {},
      })
      .returning({ id: labSearchRuns.id });
    const run = rows[0];
    if (run === undefined) {
      throw new Error('insert run nao retornou linha');
    }
    return run.id;
  };
  const insertResult = async (
    runId: string,
    sourceId: string,
    title: string,
    rank: number,
  ): Promise<string> => {
    const rows = await db
      .insert(labResults)
      .values({
        runId,
        source: 'bdtd',
        sourceId,
        title,
        authors: ['Autora Prova'],
        rawMetadata: { id: sourceId },
        rank,
      })
      .returning({ id: labResults.id });
    const row = rows[0];
    if (row === undefined) {
      throw new Error('insert result nao retornou linha');
    }
    return row.id;
  };
  const run1Id = await insertRun(new Date(base), 1);
  const run1AId = await insertResult(run1Id, 'isnew-3-a', 'Item A do primeiro run', 0);
  const run2Id = await insertRun(new Date(base + 60_000), 1);
  const run2AId = await insertResult(run2Id, 'isnew-3-a', 'Item A repetido no segundo run', 0);
  const run2BId = await insertResult(run2Id, 'isnew-3-b', 'Item B inedito no segundo run', 1);
  const run3Id = await insertRun(new Date(base + 120_000), 1);
  const run3AId = await insertResult(run3Id, 'isnew-3-a', 'Item A repetido no terceiro run', 0);
  // B repete no run3: com o anti-join antigo (todos os outros runs) isto
  // apagaria o badge do run2 (B.isNew false com newCount 1) — o bug D-15.
  // Com o fix só-anteriores, o run2 ignora o run3 e B segue NOVO nele.
  const run3BId = await insertResult(run3Id, 'isnew-3-b', 'Item B repetido no terceiro run', 1);
  const run3CId = await insertResult(run3Id, 'isnew-3-c', 'Item C inedito no terceiro run', 2);
  return { run1Id, run2Id, run3Id, run1AId, run2AId, run2BId, run3AId, run3BId, run3CId };
}

// Prova que execFileSync foi importado do child_process (evita tree-shake
// remover o import usado no beforeAll do migrate).
void execFileSync;

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'lab results isNew PG real (derivado on-read D-35, sem coluna, IDOR 404)',
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
          console.warn('[lab-results-isnew] PG inalcançavel no migrate — pulando (offline).');
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
    });

    it('D-15: run antigo mantem badge apos run posterior; badge ≡ contador nos 3 runs', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-results-isnew] PG inalcançavel — teste pulado (offline).');
        return;
      }
      // Narrowing de `let` não sobrevive dentro de closures: captura em const
      // para fetchPage/fetchSingle (TS2345 no typecheck raiz, gap 08-05).
      const api = app;
      const owner = await bootstrapAdmin(app, 'Dona IsNew', 'isnew@example.com');
      const created = await apiRequest(app, 'POST', '/api/v1/projects', {
        body: { title: 'Projeto isNew' },
        cookieValue: owner.cookie,
      });
      expect(created.statusCode).toBe(201);
      const projectId = (created.json() as { id: string }).id;

      const searchRes = await apiRequest(app, 'POST', '/api/v1/lab/searches', {
        body: {
          projectId,
          term: '"isnew deterministico"',
          filters: {},
          sources: ['bdtd'],
        },
        cookieValue: owner.cookie,
      });
      expect(searchRes.statusCode).toBe(201);
      const searchId = (searchRes.json() as { id: string }).id;

      const seed = await seedThreeRuns(db, owner.userId, searchId);

      const fetchPage = async (runId: string): Promise<TestResultPage> => {
        const res = await apiRequest(api, 'GET', `/api/v1/lab/runs/${runId}/results?limit=20`, {
          cookieValue: owner.cookie,
        });
        expect(res.statusCode).toBe(200);
        expect(headerValue(res, 'x-request-id')).toBeTruthy();
        return resultPageOf(res.json());
      };
      const bySourceId = (page: TestResultPage, sourceId: string): TestResult => {
        const item = page.items.find((entry) => entry.sourceId === sourceId);
        expect(item).toBeDefined();
        if (item === undefined) {
          throw new Error(`pagina sem o item ${sourceId}`);
        }
        return item;
      };

      // run1: A estreou aqui → isNew true; badge ≡ contador.
      const page1 = await fetchPage(seed.run1Id);
      expect(page1.total).toBe(1);
      expect(page1.newCount).toBe(1);
      expect(bySourceId(page1, 'isnew-3-a').isNew).toBe(true);
      expect(page1.items.filter((item) => item.isNew).length).toBe(page1.newCount);

      // run2 LIDO DEPOIS do run3 existir: A continua false, B continua true
      // (o run3 posterior NUNCA apaga o badge do run2 — histórico congelado).
      const page2 = await fetchPage(seed.run2Id);
      expect(page2.total).toBe(2);
      expect(page2.newCount).toBe(1);
      expect(bySourceId(page2, 'isnew-3-a').isNew).toBe(false);
      expect(bySourceId(page2, 'isnew-3-b').isNew).toBe(true);
      // Consistência obrigatória: newCount === count(isNew===true).
      expect(page2.items.filter((item) => item.isNew).length).toBe(page2.newCount);

      // run3: A visto antes → false; B visto no run2 → false; C inédito →
      // true; badge ≡ contador (só C é novo → newCount 1).
      const page3 = await fetchPage(seed.run3Id);
      expect(page3.total).toBe(3);
      expect(page3.newCount).toBe(1);
      expect(bySourceId(page3, 'isnew-3-a').isNew).toBe(false);
      expect(bySourceId(page3, 'isnew-3-b').isNew).toBe(false);
      expect(bySourceId(page3, 'isnew-3-c').isNew).toBe(true);
      expect(page3.items.filter((item) => item.isNew).length).toBe(page3.newCount);

      // GET unitário espelha a lista nos 3 runs.
      const fetchSingle = async (resultId: string): Promise<TestResult> => {
        const res = await apiRequest(api, 'GET', `/api/v1/lab/results/${resultId}`, {
          cookieValue: owner.cookie,
        });
        expect(res.statusCode).toBe(200);
        return resultOf(res.json());
      };
      expect((await fetchSingle(seed.run1AId)).isNew).toBe(true);
      expect((await fetchSingle(seed.run2AId)).isNew).toBe(false);
      expect((await fetchSingle(seed.run2BId)).isNew).toBe(true);
      expect((await fetchSingle(seed.run3AId)).isNew).toBe(false);
      expect((await fetchSingle(seed.run3BId)).isNew).toBe(false);
      expect((await fetchSingle(seed.run3CId)).isNew).toBe(true);
    });

    it('IDOR: estranho e id adulterado recebem 404 identico', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-results-isnew] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dona A', 'a-isnew@example.com');
      const stranger = await createMember(app, owner.cookie, 'Estranho B', 'b-isnew@example.com');
      const created = await apiRequest(app, 'POST', '/api/v1/projects', {
        body: { title: 'Projeto isolado' },
        cookieValue: owner.cookie,
      });
      expect(created.statusCode).toBe(201);
      const projectId = (created.json() as { id: string }).id;
      const searchRes = await apiRequest(app, 'POST', '/api/v1/lab/searches', {
        body: { projectId, term: '"isolamento isnew"', filters: {}, sources: ['bdtd'] },
        cookieValue: owner.cookie,
      });
      expect(searchRes.statusCode).toBe(201);
      const searchId = (searchRes.json() as { id: string }).id;
      const seed = await seedTwoRuns(db, owner.userId, searchId);

      const foreign = await apiRequest(app, 'GET', `/api/v1/lab/runs/${seed.run2Id}/results`, {
        cookieValue: stranger.cookie,
      });
      expect(foreign.statusCode).toBe(404);
      expect(errorOf(foreign.json()).code).toBe('NOT_FOUND');

      const foreignSingle = await apiRequest(app, 'GET', `/api/v1/lab/results/${seed.freshResultId}`, {
        cookieValue: stranger.cookie,
      });
      expect(foreignSingle.statusCode).toBe(404);
      expect(errorOf(foreignSingle.json()).code).toBe('NOT_FOUND');

      const ghost = await apiRequest(app, 'GET', `/api/v1/lab/runs/${GHOST_UUID}/results`, {
        cookieValue: owner.cookie,
      });
      expect(ghost.statusCode).toBe(404);
      expect(errorOf(ghost.json()).code).toBe('NOT_FOUND');

      const ghostSingle = await apiRequest(app, 'GET', `/api/v1/lab/results/${GHOST_UUID}`, {
        cookieValue: owner.cookie,
      });
      expect(ghostSingle.statusCode).toBe(404);
      expect(errorOf(ghostSingle.json()).code).toBe('NOT_FOUND');
    });
  },
);
