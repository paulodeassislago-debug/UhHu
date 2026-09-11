// tests/integration — matriz IDOR dono/estranho/ID-adulterado (PLAT-04, T-02-04-03).
//
// Prova dupla (teste + scripts/curl-idor.sh) em leitura/alteracao/exclusao
// para PROJECTS + SESSIONS, com 2 usuarios (A dono, B estranho/stranger)
// via sessoes reais (cookies uhhu_session, sem stub):
// - leitura estranha 404, alteracao estranha 404, exclusao estranha 404 + dado intacto
// - ID UUID inexistente (adulterado) 404 com envelope; sem cookie 401
// - `ownerId` no body ignorado (POST/PATCH com ownerId do B prova que o
//   criado pertence a A — DTO sem owner, isolamento via lista/GET)
// - asserts checam `x-request-id` e ausencia de `stack|passwordHash|token`
//   no corpo (regex negativa, sem vazar segredo/SQL).
//
// SEM PG (env ausente ou inalcançavel): pula com graca, nunca falha — o CI
// com service postgres:16-alpine e que exerce este arquivo. NUNCA imprime
// connection string: so a causa curta.

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

interface TestProject {
  id: string;
  title: string;
  status: string;
}

function projectOf(body: unknown): TestProject {
  return body as TestProject;
}

interface TestSession {
  id: string;
  current: boolean;
}

function sessionsOf(body: unknown): TestSession[] {
  return (body as { sessions: TestSession[] }).sessions;
}

function listOf(body: unknown): { items: TestProject[] } {
  return body as { items: TestProject[] };
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

// Checa envelope de erro sem vazamento + x-request-id consistente.
function expectIsolatedError(res: ApiResponse, expectedCode: string): void {
  expect(headerValue(res, 'x-request-id')).toBeTruthy();
  const body: unknown = res.json();
  expect(errorOf(body).code).toBe(expectedCode);
  expect(typeof errorOf(body).requestId).toBe('string');
  const text = JSON.stringify(body).toLowerCase();
  expect(text).not.toMatch(/stack|passwordhash|password_hash|token|secret|sql/);
}

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'idor matrix PG real (dono/estranho/adulterado em projects+sessions)',
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
          console.warn('[idor-matrix] PG inalcançavel no migrate — pulando integracao (offline).');
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
      app = instance;
    }, 60000);

    afterAll(async () => {
      await app?.close();
    });

    beforeEach(async () => {
      if (!pgAvailable || db === undefined) {
        return;
      }
      // Wipe FK-safe (Phase 4: lab_* antes de projects/users).
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

    it('projects: stranger (estranho) recebe 404 em GET/PATCH/DELETE e dado intacto', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[idor-matrix] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');
      const stranger = await createMember(app, owner.cookie, 'Estranho B', 'b@example.com');

      const created = await apiRequest(app, 'POST', '/api/v1/projects', {
        body: { title: 'Segredo do dono' },
        cookieValue: owner.cookie,
      });
      expect(created.statusCode).toBe(201);
      expect(headerValue(created, 'x-request-id')).toBeTruthy();
      const dto = projectOf(created.json());

      // Leitura estranha -> 404 identico.
      const getB = await apiRequest(app, 'GET', `/api/v1/projects/${dto.id}`, {
        cookieValue: stranger.cookie,
      });
      expect(getB.statusCode).toBe(404);
      expectIsolatedError(getB, 'NOT_FOUND');

      // Alteracao estranha -> 404.
      const patchB = await apiRequest(app, 'PATCH', `/api/v1/projects/${dto.id}`, {
        body: { title: 'Tentativa de roubo' },
        cookieValue: stranger.cookie,
      });
      expect(patchB.statusCode).toBe(404);
      expectIsolatedError(patchB, 'NOT_FOUND');

      // Exclusao estranha (com confirm) -> 404.
      const delB = await apiRequest(app, 'DELETE', `/api/v1/projects/${dto.id}?confirm=true`, {
        cookieValue: stranger.cookie,
      });
      expect(delB.statusCode).toBe(404);
      expectIsolatedError(delB, 'NOT_FOUND');

      // Dado intacto: dono ainda le 200 com titulo original + lista do estranho vazia.
      const still = await apiRequest(app, 'GET', `/api/v1/projects/${dto.id}`, {
        cookieValue: owner.cookie,
      });
      expect(still.statusCode).toBe(200);
      expect(projectOf(still.json()).title).toBe('Segredo do dono');
      const listB = await apiRequest(app, 'GET', '/api/v1/projects', {
        cookieValue: stranger.cookie,
      });
      expect(listB.statusCode).toBe(200);
      expect(listOf(listB.json()).items.length).toBe(0);
    });

    it('sessions: stranger nao revoga sessao alheia (404) e sessao intacta', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[idor-matrix] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');
      const stranger = await createMember(app, owner.cookie, 'Estranho B', 'b@example.com');

      const listA = await apiRequest(app, 'GET', '/api/v1/auth/sessions', {
        cookieValue: owner.cookie,
      });
      expect(listA.statusCode).toBe(200);
      const idA = sessionsOf(listA.json())[0];
      expect(idA).not.toBeUndefined();
      if (idA === undefined) {
        throw new Error('lista do dono vazia');
      }

      // stranger tenta revogar sessao do dono -> 404 identico.
      const cross = await apiRequest(app, 'DELETE', `/api/v1/auth/sessions/${idA.id}`, {
        cookieValue: stranger.cookie,
      });
      expect(cross.statusCode).toBe(404);
      expectIsolatedError(cross, 'NOT_FOUND');

      // Sessao do dono intacta: /me ainda 200 com o mesmo cookie.
      const still = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        cookieValue: owner.cookie,
      });
      expect(still.statusCode).toBe(200);
      expect(headerValue(still, 'x-request-id')).toBeTruthy();
    });

    it('ID adulterado inexistente vira 404 com envelope; sem cookie vira 401', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[idor-matrix] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');

      // Projeto com UUID adulterado (nunca criado) -> 404.
      const ghostGet = await apiRequest(app, 'GET', `/api/v1/projects/${GHOST_UUID}`, {
        cookieValue: owner.cookie,
      });
      expect(ghostGet.statusCode).toBe(404);
      expectIsolatedError(ghostGet, 'NOT_FOUND');
      expect(errorOf(ghostGet.json()).message).toBe('Recurso não encontrado.');

      // Sessao com UUID adulterado -> 404 identico.
      const ghostDel = await apiRequest(app, 'DELETE', `/api/v1/auth/sessions/${GHOST_UUID}`, {
        cookieValue: owner.cookie,
      });
      expect(ghostDel.statusCode).toBe(404);
      expectIsolatedError(ghostDel, 'NOT_FOUND');

      // Sem cookie: leitura de projeto existente e lista de sessoes -> 401.
      const created = await apiRequest(app, 'POST', '/api/v1/projects', {
        body: { title: 'So do dono' },
        cookieValue: owner.cookie,
      });
      expect(created.statusCode).toBe(201);
      const dto = projectOf(created.json());
      const anonGet = await apiRequest(app, 'GET', `/api/v1/projects/${dto.id}`);
      expect(anonGet.statusCode).toBe(401);
      expectIsolatedError(anonGet, 'UNAUTHENTICATED');
      const anonSessions = await apiRequest(app, 'GET', '/api/v1/auth/sessions');
      expect(anonSessions.statusCode).toBe(401);
      expectIsolatedError(anonSessions, 'UNAUTHENTICATED');
    });

    it('ownerId do body e ignorado: POST/PATCH com ownerId do stranger ainda pertence ao dono', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[idor-matrix] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapAdmin(app, 'Dono A', 'dono-a@example.com');
      const stranger = await createMember(app, owner.cookie, 'Estranho B', 'b@example.com');

      // POST com ownerId do stranger (campo hostil): Zod strip ignora, cria para A.
      const created = await apiRequest(app, 'POST', '/api/v1/projects', {
        body: { title: 'Com ownerId injetado', ownerId: stranger.userId },
        cookieValue: owner.cookie,
      });
      expect(created.statusCode).toBe(201);
      const dto = projectOf(created.json());

      // PATCH com ownerId do stranger: tambem ignorado, titulo atualiza para o dono.
      const patched = await apiRequest(app, 'PATCH', `/api/v1/projects/${dto.id}`, {
        body: { title: 'Titulo legitimo', ownerId: stranger.userId },
        cookieValue: owner.cookie,
      });
      expect(patched.statusCode).toBe(200);
      expect(projectOf(patched.json()).title).toBe('Titulo legitimo');

      // Prova de posse: dono le 200; stranger recebe 404 e lista vazia.
      const getOwner = await apiRequest(app, 'GET', `/api/v1/projects/${dto.id}`, {
        cookieValue: owner.cookie,
      });
      expect(getOwner.statusCode).toBe(200);
      const getStranger = await apiRequest(app, 'GET', `/api/v1/projects/${dto.id}`, {
        cookieValue: stranger.cookie,
      });
      expect(getStranger.statusCode).toBe(404);
      expectIsolatedError(getStranger, 'NOT_FOUND');
      const listStranger = await apiRequest(app, 'GET', '/api/v1/projects', {
        cookieValue: stranger.cookie,
      });
      expect(listStranger.statusCode).toBe(200);
      expect(listOf(listStranger.json()).items.length).toBe(0);
    });
  },
);
