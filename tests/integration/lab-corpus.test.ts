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

function overlapCount(): number {
  if (!Array.isArray(OVERLAP_DATA)) {
    return 0;
  }
  return OVERLAP_DATA.length;
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
  },
);
