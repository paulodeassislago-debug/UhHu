// tests/integration — lab corpus/revisao contra PG real (LAB-07/08/09, D-40..D-46).
//
// SKELETON (04-02): harness verde com 2 usuarios + migrate + wipe FK-safe.
// Expansao completa em 04-04 (LAB-07–LAB-11 + IDOR + guards).
//
// Harness Fastify em memoria + buildAuthRoutes + buildProjectRoutes +
// buildLabRoutes no mesmo app com cookie uhhu_session real; 2 usuarios
// (dono A, estranho B); asserts de x-request-id + regex negativa nos corpos;
// skip gracioso sem PG (nunca falha offline); NUNCA imprime connection string.

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

const OVERLAP_RAW = readFileSync(
  join(process.cwd(), 'tests/integration/fixtures/dedup-overlap.json'),
  'utf8',
);
const OVERLAP_DATA: unknown = JSON.parse(OVERLAP_RAW);

interface ApiResponse {
  statusCode: number;
  headers: unknown;
  json(): unknown;
}

async function apiRequest(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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

export const EXPORT_OVERFLOW_MESSAGE = 'Seleção excede o limite de 1000 grupos para exportação.';

function overlapCount(): number {
  if (!Array.isArray(OVERLAP_DATA)) {
    return 0;
  }
  return OVERLAP_DATA.length;
}

interface SeedItem {
  source: string;
  sourceId: string;
  title: string;
  authors: string[];
  year: number | null;
  docType?: string | undefined;
  institution?: string | undefined;
  abstract?: string | undefined;
}

async function seedRun(
  database: Db,
  searchId: string,
  userId: string,
  status: string,
  items: SeedItem[],
): Promise<{ runId: string; resultIds: string[] }> {
  const runs = await database
    .insert(labSearchRuns)
    .values({
      searchId,
      createdBy: userId,
      status,
      termSnapshot: 'seed',
      filtersSnapshot: {},
      sourcesSnapshot: ['bdtd', 'capes'],
    })
    .returning({ id: labSearchRuns.id });
  const run = runs[0];
  if (run === undefined) {
    throw new Error('seed run sem id');
  }
  const resultIds: string[] = [];
  let rank = 0;
  for (const item of items) {
    rank += 1;
    const rows = await database
      .insert(labResults)
      .values({
        runId: run.id,
        source: item.source,
        sourceId: item.sourceId,
        title: item.title,
        authors: item.authors,
        year: item.year,
        docType: item.docType ?? null,
        institution: item.institution ?? null,
        abstract: item.abstract ?? null,
        rawMetadata: { seed: true, source: item.source, sourceId: item.sourceId },
        rank,
      })
      .returning({ id: labResults.id });
    const row = rows[0];
    if (row === undefined) {
      throw new Error('seed result sem id');
    }
    resultIds.push(row.id);
  }
  return { runId: run.id, resultIds };
}

interface Ctx {
  adminCookie: string;
  strangerCookie: string;
  projectId: string;
  searchId: string;
  adminId: string;
}

async function setupCtx(app: FastifyInstance, n: number): Promise<Ctx> {
  const admin = await bootstrapAdmin(app, `Dona ${n}`, `dona-${n}@exemplo.test`);
  const stranger = await createMember(
    app,
    admin.cookie,
    `Estranho ${n}`,
    `estranho-${n}@exemplo.test`,
  );
  const projectId = await createProject(app, admin.cookie, `Projeto Corpus ${n}`);
  const search = await createSearch(app, admin.cookie, projectId, `termo ${n}`, {}, [
    'bdtd',
    'capes',
  ]);
  return {
    adminCookie: admin.cookie,
    strangerCookie: stranger.cookie,
    projectId,
    searchId: search.id,
    adminId: admin.userId,
  };
}

// Segundo contexto ISOLADO no mesmo teste: o bootstrap aberto so funciona sem
// usuarios; aqui cria um membro via cookie admin (dono diferente, projeto proprio).
async function setupExtra(app: FastifyInstance, adminCookie: string, n: number): Promise<Ctx> {
  const member = await createMember(app, adminCookie, `Extra ${n}`, `extra-${n}@exemplo.test`);
  const projectId = await createProject(app, member.cookie, `Projeto Extra ${n}`);
  const search = await createSearch(app, member.cookie, projectId, `termo extra ${n}`, {}, [
    'bdtd',
    'capes',
  ]);
  return {
    adminCookie: member.cookie,
    strangerCookie: adminCookie,
    projectId,
    searchId: search.id,
    adminId: member.userId,
  };
}

interface TestGroup {
  id: string;
  projectId: string;
  canonicalKey: string;
  confidence: string;
  status: string;
  canonicalResultId: string;
  memberIds: string[];
  decision: string;
  originCount: number;
  origins: string[];
}

function groupsOf(body: unknown): TestGroup[] {
  return (body as { items: TestGroup[] }).items;
}

function groupOf(body: unknown): TestGroup {
  return body as TestGroup;
}

function textOf(res: ApiResponse): string {
  const holder = res as unknown as { body?: unknown };
  if (typeof holder.body !== 'string') {
    throw new Error('resposta sem corpo texto');
  }
  return holder.body;
}

function headerText(res: ApiResponse, name: string): string {
  const value = headerValue(res, name);
  if (typeof value !== 'string') {
    throw new Error(`resposta sem header ${name}`);
  }
  return value;
}

// Prova que execFileSync foi importado do child_process (evita tree-shake
// remover o import usado no beforeAll do migrate).
void execFileSync;

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'lab corpus PG real (revisao por chave de conteudo — skeleton)',
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
          console.warn('[lab-corpus] PG inalcançavel no migrate — pulando integracao (offline).');
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

    afterEach(() => {
      // Sem stub de fetch neste skeleton (expansao 04-04 instala fakeFetch).
    });

    it('skeleton sobe com 2 usuarios e projeto', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      expect(overlapCount()).toBe(8);
      const admin = await bootstrapAdmin(app, 'Dona Corpus', 'dona-corpus@exemplo.test');
      const stranger = await createMember(app, admin.cookie, 'Estranho', 'estranho@exemplo.test');
      expect(stranger.userId).not.toBe(admin.userId);
      const projectId = await createProject(app, admin.cookie, 'Projeto Corpus');
      expect(projectId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      const probe = await apiRequest(app, 'GET', '/api/v1/projects', {
        cookieValue: admin.cookie,
      });
      expect(probe.statusCode).toBe(200);
      expectClean(probe);
      void labDedupGroups;
      void labRejectedPairs;
      void labCanonicalPins;
    });

    it('LAB-07: par exato BDTD+CAPES agrupa com N origens e proveniencia intacta', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 71);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
          docType: 'masterThesis',
          institution: 'Universidade de São Paulo',
        },
        {
          source: 'capes',
          sourceId: 'capes-exact-001',
          title: 'Educacao inclusiva e tecnologia assistiva!',
          authors: ['Maria Silva'],
          year: 2021,
          docType: 'masterThesis',
          institution: 'Universidade de Sao Paulo',
        },
      ]);
      const res = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      expect(res.statusCode).toBe(200);
      expectClean(res);
      const groups = groupsOf(res.json());
      expect(groups).toHaveLength(1);
      const g = groups[0];
      if (g === undefined) {
        throw new Error('grupo exato ausente');
      }
      expect(g.confidence).toBe('exact');
      expect(g.status).toBe('confirmed');
      expect(g.originCount).toBe(2);
      expect(g.origins).toEqual(['bdtd', 'capes']);
      expect(g.memberIds).toHaveLength(2);
      expect(g.canonicalKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it('LAB-07: fuzzy >=0.9 mesmo ano vira pending fora do corpus', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 72);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-fuzzy-002',
          title: 'Letramento digital nas escolas públicas',
          authors: ['Ana Souza', 'Bruno Lima'],
          year: 2022,
        },
        {
          source: 'capes',
          sourceId: 'capes-fuzzy-002',
          title: 'Letramento digital na escola publica',
          authors: ['Ana Souza', 'Bruno Lima'],
          year: 2022,
        },
      ]);
      const res = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      expect(res.statusCode).toBe(200);
      const groups = groupsOf(res.json());
      expect(groups).toHaveLength(1);
      expect(groups[0]?.status).toBe('pending');
      expect(groups[0]?.confidence).toBe('fuzzy');
      const corpus = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/corpus`, {
        cookieValue: ctx.adminCookie,
      });
      expect(corpus.statusCode).toBe(200);
      expect((corpus.json() as { items: unknown[] }).items).toHaveLength(0);
    });

    it('LAB-07: confirm entra no corpus apos eligible; reject divide em singles com veto', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 73);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-fuzzy-002',
          title: 'Letramento digital nas escolas públicas',
          authors: ['Ana Souza'],
          year: 2022,
        },
        {
          source: 'capes',
          sourceId: 'capes-fuzzy-002',
          title: 'Letramento digital na escola publica',
          authors: ['Ana Souza'],
          year: 2022,
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      const pending = groupsOf(listed.json())[0];
      if (pending === undefined) {
        throw new Error('grupo pending ausente');
      }
      const confirmed = await apiRequest(app, 'POST', `/api/v1/lab/groups/${pending.id}/confirm`, {
        cookieValue: ctx.adminCookie,
      });
      expect(confirmed.statusCode).toBe(200);
      expect(groupOf(confirmed.json()).status).toBe('confirmed');
      await apiRequest(app, 'PUT', `/api/v1/lab/groups/${pending.id}/decision`, {
        body: { decision: 'eligible' },
        cookieValue: ctx.adminCookie,
      });
      const corpus = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/corpus`, {
        cookieValue: ctx.adminCookie,
      });
      expect((corpus.json() as { items: unknown[] }).items).toHaveLength(1);
      // Segundo projeto: rejeicao divide + veto persiste em lab_rejected_pairs.
      const ctx2 = await setupExtra(app, ctx.adminCookie, 74);
      await seedRun(db, ctx2.searchId, ctx2.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-fuzzy-002',
          title: 'Letramento digital nas escolas públicas',
          authors: ['Ana Souza'],
          year: 2022,
        },
        {
          source: 'capes',
          sourceId: 'capes-fuzzy-002',
          title: 'Letramento digital na escola publica',
          authors: ['Ana Souza'],
          year: 2022,
        },
      ]);
      const listed2 = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${ctx2.projectId}/groups`,
        { cookieValue: ctx2.adminCookie },
      );
      const pending2 = groupsOf(listed2.json())[0];
      if (pending2 === undefined) {
        throw new Error('grupo pending do reject ausente');
      }
      const rejected = await apiRequest(app, 'POST', `/api/v1/lab/groups/${pending2.id}/reject`, {
        cookieValue: ctx2.adminCookie,
      });
      expect(rejected.statusCode).toBe(200);
      const singles = (rejected.json() as { singles: TestGroup[] }).singles;
      expect(singles).toHaveLength(2);
      const vetoRows = await db.select().from(labRejectedPairs);
      expect(vetoRows.length).toBeGreaterThanOrEqual(1);
      const veto = vetoRows[0];
      if (veto === undefined) {
        throw new Error('veto ausente');
      }
      expect(veto.keyA < veto.keyB).toBe(true);
      // Recompute nao reagrupa: ainda 2 singles, nenhum pending.
      const relisted = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${ctx2.projectId}/groups`,
        { cookieValue: ctx2.adminCookie },
      );
      const regrouped = groupsOf(relisted.json());
      expect(regrouped.filter((g) => g.status === 'pending')).toHaveLength(0);
      expect(regrouped).toHaveLength(2);
    });

    it('LAB-07: cross-ano nao fuzzy (Pitfall 3) e pin sobrevive a re-run', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 75);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-crossyear-004',
          title: 'Alfabetização científica no ensino médio',
          authors: ['Paula Mendes'],
          year: 2019,
        },
        {
          source: 'capes',
          sourceId: 'capes-crossyear-004',
          title: 'Alfabetização científica no ensino médio',
          authors: ['Paula Mendes'],
          year: 2023,
        },
      ]);
      const res = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      const groups = groupsOf(res.json());
      expect(groups).toHaveLength(2);
      expect(groups.filter((g) => g.status === 'pending')).toHaveLength(0);
      // Pin: fixa bdtd como canonica, novo run com mesmos sourceIds mantem o pin.
      const ctx2 = await setupExtra(app, ctx.adminCookie, 76);
      await seedRun(db, ctx2.searchId, ctx2.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
        },
        {
          source: 'capes',
          sourceId: 'capes-exact-001',
          title: 'Educacao inclusiva e tecnologia assistiva!',
          authors: ['Maria Silva'],
          year: 2021,
        },
      ]);
      const g1 = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx2.projectId}/groups`, {
        cookieValue: ctx2.adminCookie,
      });
      const exact = groupsOf(g1.json())[0];
      if (exact === undefined) {
        throw new Error('grupo exato do pin ausente');
      }
      const pinned = await apiRequest(app, 'PUT', `/api/v1/lab/groups/${exact.id}/pin`, {
        body: { source: 'bdtd', sourceId: 'bdtd-exact-001' },
        cookieValue: ctx2.adminCookie,
      });
      expect(pinned.statusCode).toBe(200);
      await seedRun(db, ctx2.searchId, ctx2.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
        },
        {
          source: 'capes',
          sourceId: 'capes-exact-001',
          title: 'Educacao inclusiva e tecnologia assistiva!',
          authors: ['Maria Silva'],
          year: 2021,
        },
      ]);
      const g2 = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx2.projectId}/groups`, {
        cookieValue: ctx2.adminCookie,
      });
      const after = groupsOf(g2.json());
      expect(after).toHaveLength(1);
      const canonId = after[0]?.canonicalResultId;
      if (typeof canonId !== 'string') {
        throw new Error('canonical ausente apos re-run');
      }
      const ficha = await apiRequest(app, 'GET', `/api/v1/lab/results/${canonId}`, {
        cookieValue: ctx2.adminCookie,
      });
      expect(ficha.statusCode).toBe(200);
      expect((ficha.json() as { sourceId: string }).sourceId).toBe('bdtd-exact-001');
    });

    it('LAB-08: decisao por grupo reflete na hora (eligible entra, ineligible some)', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 77);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
        },
        {
          source: 'capes',
          sourceId: 'capes-exact-001',
          title: 'Educacao inclusiva e tecnologia assistiva!',
          authors: ['Maria Silva'],
          year: 2021,
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      const g = groupsOf(listed.json())[0];
      if (g === undefined) {
        throw new Error('grupo LAB-08 ausente');
      }
      const corpusUrl = `/api/v1/lab/projects/${ctx.projectId}/corpus`;
      const before = await apiRequest(app, 'GET', corpusUrl, { cookieValue: ctx.adminCookie });
      expect((before.json() as { items: unknown[] }).items).toHaveLength(0);
      await apiRequest(app, 'PUT', `/api/v1/lab/groups/${g.id}/decision`, {
        body: { decision: 'eligible', reason: 'Dentro do escopo.' },
        cookieValue: ctx.adminCookie,
      });
      const after = await apiRequest(app, 'GET', corpusUrl, { cookieValue: ctx.adminCookie });
      const items = (after.json() as { items: Array<{ groupId: string; decision: string }> }).items;
      expect(items).toHaveLength(1);
      expect(items[0]?.decision).toBe('eligible');
      await apiRequest(app, 'PUT', `/api/v1/lab/groups/${g.id}/decision`, {
        body: { decision: 'ineligible' },
        cookieValue: ctx.adminCookie,
      });
      const gone = await apiRequest(app, 'GET', corpusUrl, { cookieValue: ctx.adminCookie });
      expect((gone.json() as { items: unknown[] }).items).toHaveLength(0);
    });

    it('LAB-08: pending nunca no corpus mesmo com decision eligible (Pitfall 5)', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 78);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-fuzzy-002',
          title: 'Letramento digital nas escolas públicas',
          authors: ['Ana Souza'],
          year: 2022,
        },
        {
          source: 'capes',
          sourceId: 'capes-fuzzy-002',
          title: 'Letramento digital na escola publica',
          authors: ['Ana Souza'],
          year: 2022,
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      const g = groupsOf(listed.json())[0];
      if (g === undefined) {
        throw new Error('pending LAB-08 ausente');
      }
      await apiRequest(app, 'PUT', `/api/v1/lab/groups/${g.id}/decision`, {
        body: { decision: 'eligible' },
        cookieValue: ctx.adminCookie,
      });
      const corpus = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/corpus`, {
        cookieValue: ctx.adminCookie,
      });
      expect((corpus.json() as { items: unknown[] }).items).toHaveLength(0);
    });

    it('LAB-09: seed cria os 5 defaults com color null + CRUD de tag no grupo', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 79);
      const tags = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/tags`, {
        cookieValue: ctx.adminCookie,
      });
      expect(tags.statusCode).toBe(200);
      const names = (tags.json() as Array<{ name: string; color: string | null }>)
        .map((t) => t.name)
        .sort();
      expect(names).toEqual(['duplicado', 'excluir', 'incluir', 'indisponível', 'revisar']);
      for (const t of tags.json() as Array<{ color: string | null }>) {
        expect(t.color).toBeNull();
      }
      const created = await apiRequest(app, 'POST', `/api/v1/lab/projects/${ctx.projectId}/tags`, {
        body: { name: 'quase' },
        cookieValue: ctx.adminCookie,
      });
      expect(created.statusCode).toBe(201);
      const tagId = (created.json() as { id: string }).id;
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      const g = groupsOf(listed.json())[0];
      if (g === undefined) {
        throw new Error('grupo de tag ausente');
      }
      const attached = await apiRequest(app, 'POST', `/api/v1/lab/groups/${g.id}/tags`, {
        body: { tagId },
        cookieValue: ctx.adminCookie,
      });
      expect(attached.statusCode).toBe(200);
      const detached = await apiRequest(app, 'DELETE', `/api/v1/lab/groups/${g.id}/tags/${tagId}`, {
        cookieValue: ctx.adminCookie,
      });
      expect(detached.statusCode).toBe(204);
    });

    it('LAB-09: divergencia CAPES nao altera a decisao do grupo', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 80);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
        },
        {
          source: 'capes',
          sourceId: 'capes-exact-001',
          title: 'Educacao inclusiva e tecnologia assistiva!',
          authors: ['Maria Silva'],
          year: 2021,
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      const g = groupsOf(listed.json())[0];
      if (g === undefined) {
        throw new Error('grupo de divergencia ausente');
      }
      await apiRequest(app, 'PUT', `/api/v1/lab/groups/${g.id}/decision`, {
        body: { decision: 'eligible' },
        cookieValue: ctx.adminCookie,
      });
      const div = await apiRequest(app, 'PUT', `/api/v1/lab/groups/${g.id}/divergence`, {
        body: { source: 'capes', note: 'metadados da CAPES diferem' },
        cookieValue: ctx.adminCookie,
      });
      expect(div.statusCode).toBe(200);
      expect(groupOf(div.json()).decision).toBe('eligible');
    });

    it('LAB-10: compare com ultimo run fixo, 4 blocos exatos e overlap por chaves', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 81);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
        },
        {
          source: 'capes',
          sourceId: 'capes-exact-001',
          title: 'Educacao inclusiva e tecnologia assistiva!',
          authors: ['Maria Silva'],
          year: 2021,
        },
        {
          source: 'bdtd',
          sourceId: 'bdtd-solo-009',
          title: 'Trabalho solo de 2020',
          authors: ['Rita Alves'],
          year: 2020,
        },
      ]);
      const searchB = await createSearch(app, ctx.adminCookie, ctx.projectId, 'termo b', {}, [
        'bdtd',
        'capes',
      ]);
      await seedRun(db, searchB.id, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
        },
      ]);
      const res = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/searches/${ctx.searchId}/compare?with=${searchB.id}`,
        { cookieValue: ctx.adminCookie },
      );
      expect(res.statusCode).toBe(200);
      expectClean(res);
      const body = res.json() as {
        searches: string[];
        totals: Record<string, number>;
        yearHistogram: Record<string, number>;
        bySource: Record<string, Record<string, number>>;
        pairwiseOverlap: Record<string, number>;
      };
      expect(body.searches).toEqual([ctx.searchId, searchB.id]);
      expect(body.totals[ctx.searchId]).toBe(3);
      expect(body.totals[searchB.id]).toBe(1);
      expect(body.yearHistogram).toEqual({ '2021': 3, '2020': 1 });
      expect(body.bySource[ctx.searchId]).toEqual({ bdtd: 2, capes: 1 });
      expect(body.bySource[searchB.id]).toEqual({ bdtd: 1, capes: 0 });
      expect(body.pairwiseOverlap[`${ctx.searchId}|${searchB.id}`]).toBe(1);
      expect('items' in body).toBe(false);
    });

    it('LAB-10: run failed contribui zeros no compare', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 82);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-solo-009',
          title: 'Trabalho solo de 2020',
          authors: ['Rita Alves'],
          year: 2020,
        },
      ]);
      const searchF = await createSearch(app, ctx.adminCookie, ctx.projectId, 'termo f', {}, [
        'bdtd',
        'capes',
      ]);
      await seedRun(db, searchF.id, ctx.adminId, 'failed', []);
      const res = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/searches/${ctx.searchId}/compare?with=${searchF.id}`,
        { cookieValue: ctx.adminCookie },
      );
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        totals: Record<string, number>;
        bySource: Record<string, Record<string, number>>;
        pairwiseOverlap: Record<string, number>;
      };
      expect(body.totals[searchF.id]).toBe(0);
      expect(body.bySource[searchF.id]).toEqual({ bdtd: 0, capes: 0 });
      expect(body.pairwiseOverlap[`${ctx.searchId}|${searchF.id}`]).toBe(0);
    });

    it('LAB-11: export CSV com header exato + attachment ASCII', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 83);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
          docType: 'masterThesis',
          institution: 'USP',
        },
        {
          source: 'capes',
          sourceId: 'capes-exact-001',
          title: 'Educacao inclusiva e tecnologia assistiva!',
          authors: ['Maria Silva'],
          year: 2021,
          docType: 'masterThesis',
          institution: 'USP',
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      const g = groupsOf(listed.json())[0];
      if (g === undefined) {
        throw new Error('grupo CSV ausente');
      }
      await apiRequest(app, 'PUT', `/api/v1/lab/groups/${g.id}/decision`, {
        body: { decision: 'eligible' },
        cookieValue: ctx.adminCookie,
      });
      const res = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${ctx.projectId}/export?format=csv&scope=corpus`,
        { cookieValue: ctx.adminCookie },
      );
      expect(res.statusCode).toBe(200);
      expect(headerText(res, 'content-type')).toContain('text/csv');
      // Header real: Content-Disposition attachment com filename ASCII (D-52).
      const disp = headerText(res, 'content-disposition');
      expect(disp).toMatch(
        /^attachment; filename="corpus-[a-z0-9-]+-[0-9]{4}-[0-9]{2}-[0-9]{2}\.csv"$/,
      );
      const lines = textOf(res).split('\n');
      expect(lines[0]).toBe(
        'groupId,canonicalKey,title,authors,year,docType,institution,decision,tags,originCount,origins',
      );
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('eligible');
    });

    it('LAB-11: export BibTeX com -a/-b, escapes e chaves balanceadas', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 84);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-tese-010',
          title: 'Genes & Desenvolvimento 100%',
          authors: ['Ana Souza'],
          year: 2020,
          docType: 'doctoralThesis',
          institution: 'USP',
        },
        {
          source: 'capes',
          sourceId: 'capes-diss-011',
          title: 'Trabalho solo de 2021',
          authors: ['Ana Souza'],
          year: 2021,
          docType: 'masterThesis',
          institution: 'USP',
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      for (const grp of groupsOf(listed.json())) {
        await apiRequest(app, 'PUT', `/api/v1/lab/groups/${grp.id}/decision`, {
          body: { decision: 'eligible' },
          cookieValue: ctx.adminCookie,
        });
      }
      const res = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${ctx.projectId}/export?format=bibtex&scope=corpus`,
        { cookieValue: ctx.adminCookie },
      );
      expect(res.statusCode).toBe(200);
      expect(headerText(res, 'content-type')).toContain('application/x-bibtex');
      expect(headerText(res, 'content-disposition')).toContain('attachment; filename="corpus-');
      const bib = textOf(res);
      expect(bib).toContain('@phdthesis{');
      expect(bib).toContain('@mastersthesis{');
      expect(bib).toContain('\\&');
      const opens = (bib.match(/\{/g) ?? []).length;
      const closes = (bib.match(/\}/g) ?? []).length;
      expect(opens).toBe(closes);
      // Colisao de chave: segundo entry (order 1) ganha sufixo -a.
      expect(bib).toContain('souza2020bdtd');
      expect(bib).toContain('souza2021capes-a');
    });

    it('LAB-11: export JSON com grupos + bruto + proveniencia e higiene', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 85);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
        },
        {
          source: 'capes',
          sourceId: 'capes-exact-001',
          title: 'Educacao inclusiva e tecnologia assistiva!',
          authors: ['Maria Silva'],
          year: 2021,
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      const g = groupsOf(listed.json())[0];
      if (g === undefined) {
        throw new Error('grupo JSON ausente');
      }
      await apiRequest(app, 'PUT', `/api/v1/lab/groups/${g.id}/decision`, {
        body: { decision: 'eligible' },
        cookieValue: ctx.adminCookie,
      });
      const res = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${ctx.projectId}/export?format=json&scope=corpus`,
        { cookieValue: ctx.adminCookie },
      );
      expect(res.statusCode).toBe(200);
      expect(headerText(res, 'content-type')).toContain('application/json');
      const body = JSON.parse(textOf(res)) as {
        projectId: string;
        groups: unknown[];
        provenance: { members: unknown[]; provenance: { project: { id: string } } };
      };
      expect(body.projectId).toBe(ctx.projectId);
      expect(body.groups).toHaveLength(1);
      expect(JSON.stringify(body.provenance)).toContain('bdtd-exact-001');
      expectClean({ statusCode: 200, headers: { 'x-request-id': 'x' }, json: () => body });
    });

    it('LAB-11: export selection explicita resolve grupos e resultIds', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 86);
      const seeded = await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
        },
        {
          source: 'capes',
          sourceId: 'capes-exact-001',
          title: 'Educacao inclusiva e tecnologia assistiva!',
          authors: ['Maria Silva'],
          year: 2021,
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      const g = groupsOf(listed.json())[0];
      if (g === undefined) {
        throw new Error('grupo selection ausente');
      }
      await apiRequest(app, 'PUT', `/api/v1/lab/groups/${g.id}/decision`, {
        body: { decision: 'eligible' },
        cookieValue: ctx.adminCookie,
      });
      const byGroup = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${ctx.projectId}/export?format=csv&scope=selection&selection=${g.id}`,
        { cookieValue: ctx.adminCookie },
      );
      expect(byGroup.statusCode).toBe(200);
      expect(textOf(byGroup).split('\n')).toHaveLength(2);
      const byResult = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${ctx.projectId}/export?format=csv&scope=selection&selection=${seeded.resultIds[0]}`,
        { cookieValue: ctx.adminCookie },
      );
      expect(byResult.statusCode).toBe(200);
      expect(textOf(byResult).split('\n')).toHaveLength(2);
    });

    it('LAB-11: overflow de selection (1001 UUIDs) vira 400 com mensagem DoS', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 87);
      const ids: string[] = [];
      for (let i = 0; i < 1001; i++) {
        ids.push(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
      }
      const res = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${ctx.projectId}/export?format=json&scope=selection&selection=${ids.join(',')}`,
        { cookieValue: ctx.adminCookie },
      );
      expect(res.statusCode).toBe(400);
      const body: unknown = res.json();
      expect(errorOf(body).code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(body)).toContain(EXPORT_OVERFLOW_MESSAGE);
    });

    it('LAB-11: overflow de corpus acima de 1000 grupos vira 400', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 88);
      const seeded = await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', []);
      void seeded;
      // 1001 grupos eligible via batch direto (run + results + groups + members + decisions).
      const runRows = await db
        .insert(labSearchRuns)
        .values({
          searchId: ctx.searchId,
          createdBy: ctx.adminId,
          status: 'succeeded',
          termSnapshot: 'overflow',
          filtersSnapshot: {},
          sourcesSnapshot: ['bdtd'],
        })
        .returning({ id: labSearchRuns.id });
      const run = runRows[0];
      if (run === undefined) {
        throw new Error('run overflow sem id');
      }
      const N = 1001;
      const resultVals = [];
      for (let i = 0; i < N; i++) {
        resultVals.push({
          runId: run.id,
          source: 'bdtd',
          sourceId: `overflow-${i}`,
          title: `Trabalho overflow numero ${i} titulo unico para chave`,
          authors: [`Autor Overflow ${i}`],
          year: 2000 + (i % 25),
          rawMetadata: { seed: true },
          rank: i + 1,
        });
      }
      const insertedResults = await db.insert(labResults).values(resultVals).returning({
        id: labResults.id,
        title: labResults.title,
        year: labResults.year,
        authors: labResults.authors,
      });
      const groupVals = insertedResults.map((r) => ({
        projectId: ctx.projectId,
        canonicalKey: `overflow-key-${r.id}`,
        confidence: 'single',
        status: 'confirmed' as const,
      }));
      const insertedGroups = await db.insert(labDedupGroups).values(groupVals).returning({
        id: labDedupGroups.id,
      });
      await db.insert(labDedupMembers).values(
        insertedGroups.map((gg, idx) => {
          const rr = insertedResults[idx];
          if (rr === undefined || gg === undefined) {
            throw new Error('overflow sem par');
          }
          return { groupId: gg.id, resultId: rr.id };
        }),
      );
      await db.insert(labGroupDecisions).values(
        insertedGroups.map((gg) => {
          if (gg === undefined) {
            throw new Error('overflow sem grupo');
          }
          return { groupId: gg.id, decision: 'eligible' };
        }),
      );
      const res = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${ctx.projectId}/export?format=csv&scope=corpus`,
        { cookieValue: ctx.adminCookie },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.json())).toContain(EXPORT_OVERFLOW_MESSAGE);
    });

    it('LAB-11: guards CSV-injection e filename malicioso no export', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const admin = await bootstrapAdmin(app, 'Dona Guard', 'dona-guard@exemplo.test');
      const projectId = await createProject(app, admin.cookie, 'Snapshots "../../etc" São Paulo');
      const search = await createSearch(app, admin.cookie, projectId, 'termo guard', {}, ['bdtd']);
      await seedRun(db, search.id, admin.userId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-evil-001',
          title: '=CMD("calc",1)',
          authors: ['Atacante'],
          year: 2021,
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${projectId}/groups`, {
        cookieValue: admin.cookie,
      });
      const g = groupsOf(listed.json())[0];
      if (g === undefined) {
        throw new Error('grupo guard ausente');
      }
      await apiRequest(app, 'PUT', `/api/v1/lab/groups/${g.id}/decision`, {
        body: { decision: 'eligible' },
        cookieValue: admin.cookie,
      });
      const res = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${projectId}/export?format=csv&scope=corpus`,
        { cookieValue: admin.cookie },
      );
      expect(res.statusCode).toBe(200);
      expect(textOf(res)).toContain("'=CMD");
      const disp = headerText(res, 'content-disposition');
      expect(disp).toMatch(
        /^attachment; filename="corpus-[a-z0-9-]+-[0-9]{4}-[0-9]{2}-[0-9]{2}\.csv"$/,
      );
      expect(disp).not.toContain('..');
      expect(disp).not.toContain('"../../etc"');
    });

    it('IDOR: estranho/adulterado/sem-cookie nas rotas novas', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 89);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      const g = groupsOf(listed.json())[0];
      if (g === undefined) {
        throw new Error('grupo IDOR ausente');
      }
      const ghost = '00000000-0000-4000-8000-000000000000';
      // Estranho → 404 identico em groups/corpus/compare/export.
      const s1 = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.strangerCookie,
      });
      expect(s1.statusCode).toBe(404);
      expectIsolatedError(s1, 'NOT_FOUND');
      const s2 = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/corpus`, {
        cookieValue: ctx.strangerCookie,
      });
      expect(s2.statusCode).toBe(404);
      expectIsolatedError(s2, 'NOT_FOUND');
      const s3 = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${ctx.projectId}/export?format=json&scope=corpus`,
        { cookieValue: ctx.strangerCookie },
      );
      expect(s3.statusCode).toBe(404);
      expectIsolatedError(s3, 'NOT_FOUND');
      const s4 = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/searches/${ctx.searchId}/compare?with=${ghost}`,
        { cookieValue: ctx.strangerCookie },
      );
      expect(s4.statusCode).toBe(404);
      expectIsolatedError(s4, 'NOT_FOUND');
      // Ghost com dono → 404; sem cookie → 401.
      const g1 = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ghost}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      expect(g1.statusCode).toBe(404);
      const a1 = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/corpus`);
      expect(a1.statusCode).toBe(401);
      expectIsolatedError(a1, 'UNAUTHENTICATED');
      const a2 = await apiRequest(app, 'POST', `/api/v1/lab/groups/${g.id}/confirm`);
      expect(a2.statusCode).toBe(401);
    });

    it('IDOR: ownerId injetado no body e ignorado; x-request-id sempre presente', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[lab-corpus] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const ctx = await setupCtx(app, 90);
      await seedRun(db, ctx.searchId, ctx.adminId, 'succeeded', [
        {
          source: 'bdtd',
          sourceId: 'bdtd-exact-001',
          title: 'Educação inclusiva e tecnologia assistiva',
          authors: ['Maria Silva'],
          year: 2021,
        },
      ]);
      const listed = await apiRequest(app, 'GET', `/api/v1/lab/projects/${ctx.projectId}/groups`, {
        cookieValue: ctx.adminCookie,
      });
      const g = groupsOf(listed.json())[0];
      if (g === undefined) {
        throw new Error('grupo inject ausente');
      }
      // Zod descarta ownerId desconhecido; decisao aplicada no grupo do dono.
      // (bucket lab-export 30/min/IP PLAT-05: nao disparado aqui; coberto pelo hook.)
      const injected = await apiRequest(app, 'PUT', `/api/v1/lab/groups/${g.id}/decision`, {
        body: { decision: 'eligible', ownerId: 'intruso' },
        cookieValue: ctx.adminCookie,
      });
      expect(injected.statusCode).toBe(200);
      expect(headerValue(injected, 'x-request-id')).toBeTruthy();
      expect(groupOf(injected.json()).projectId).toBe(ctx.projectId);
      const relisted = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${ctx.projectId}/groups`,
        { cookieValue: ctx.strangerCookie },
      );
      expect(relisted.statusCode).toBe(404);
    });
  },
);
