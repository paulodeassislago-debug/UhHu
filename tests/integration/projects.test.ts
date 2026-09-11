// tests/integration — projetos isolados por ownerId contra PG real (LAB-01, PLAT-03, CORE-01).
//
// Prova com Fastify em memoria + sessoes reais do 02-02 (buildAuthRoutes +
// buildProjectRoutes no mesmo app, cookie uhhu_session): CRUD feliz, isolamento
// dono/estranho/ID-adulterado (404 identico, sem vazar existencia), delete com
// confirmacao, arquivar/reativar e paginacao limit+cursor com clamp 100.
// SEM PG (env ausente ou inalcançavel): pula com graca, nunca falha — o CI com
// service postgres:16-alpine e que exerce este arquivo. NUNCA imprime
// connection string: so a causa curta.

import { execFileSync } from 'node:child_process';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '@uhhu/db';
import { invites, passwordResets, projects, sessions, users } from '@uhhu/db';
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
  researchQuestion: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function projectOf(body: unknown): TestProject {
  return body as TestProject;
}

interface TestPage {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

function listOf(body: unknown): { items: TestProject[]; page: TestPage } {
  return body as { items: TestProject[]; page: TestPage };
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

async function createProject(
  app: FastifyInstance,
  cookieValue: string,
  body: Record<string, unknown>,
): Promise<ApiResponse> {
  return apiRequest(app, 'POST', '/api/v1/projects', { body, cookieValue });
}

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'projects PG real (CRUD isolado, 404 estranho, confirmacao, paginacao)',
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
          console.warn('[projects] PG inalcançavel no migrate — pulando integracao (offline).');
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
      await db.delete(projects);
      await db.delete(passwordResets);
      await db.delete(sessions);
      await db.delete(invites);
      await db.delete(users);
    });

    it('CRUD feliz: cria/lista/le/atualiza com titulo obrigatorio e pagina', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[projects] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const admin = await bootstrapAdmin(app, 'Ada Admin', 'ada@example.com');

      // Sem titulo -> 400 VALIDATION_ERROR.
      const missing = await createProject(app, admin.cookie, { description: 'sem titulo' });
      expect(missing.statusCode).toBe(400);
      const missingBody: unknown = missing.json();
      expect(errorOf(missingBody).code).toBe('VALIDATION_ERROR');

      // Cria feliz -> 201 com DTO camelCase.
      const created = await createProject(app, admin.cookie, {
        title: 'Clima no semiárido',
        researchQuestion: 'Como varia a chuva?',
        description: 'Projeto inicial',
      });
      expect(created.statusCode).toBe(201);
      expect(headerValue(created, 'x-request-id')).toBeTruthy();
      const dto = projectOf(created.json());
      expect(typeof dto.id).toBe('string');
      expect(dto.title).toBe('Clima no semiárido');
      expect(dto.researchQuestion).toBe('Como varia a chuva?');
      expect(dto.description).toBe('Projeto inicial');
      expect(dto.status).toBe('active');

      // Le feliz -> 200.
      const got = await apiRequest(app, 'GET', `/api/v1/projects/${dto.id}`, {
        cookieValue: admin.cookie,
      });
      expect(got.statusCode).toBe(200);
      expect(projectOf(got.json()).title).toBe('Clima no semiárido');

      // Atualiza titulo+pergunta a qualquer momento (D-22) -> 200.
      const patched = await apiRequest(app, 'PATCH', `/api/v1/projects/${dto.id}`, {
        body: { title: 'Clima revisado', researchQuestion: 'Nova pergunta?' },
        cookieValue: admin.cookie,
      });
      expect(patched.statusCode).toBe(200);
      const patchedDto = projectOf(patched.json());
      expect(patchedDto.title).toBe('Clima revisado');
      expect(patchedDto.researchQuestion).toBe('Nova pergunta?');

      // Titulo vazio -> 400 VALIDATION_ERROR.
      const emptyTitle = await apiRequest(app, 'PATCH', `/api/v1/projects/${dto.id}`, {
        body: { title: '   ' },
        cookieValue: admin.cookie,
      });
      expect(emptyTitle.statusCode).toBe(400);
      const emptyBody: unknown = emptyTitle.json();
      expect(errorOf(emptyBody).code).toBe('VALIDATION_ERROR');

      // Lista pagina -> 200 com page.{limit,nextCursor,hasMore}.
      const listed = await apiRequest(app, 'GET', '/api/v1/projects', {
        cookieValue: admin.cookie,
      });
      expect(listed.statusCode).toBe(200);
      const page = listOf(listed.json());
      expect(page.items.length).toBe(1);
      expect(page.page.limit).toBe(20);
      expect(typeof page.page.hasMore).toBe('boolean');
      expect(page.page.nextCursor).toBeNull();
    });

    it('isolamento: estranho recebe 404 em GET/PATCH/DELETE sem vazar existencia', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[projects] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const admin = await bootstrapAdmin(app, 'User A', 'a@example.com');
      const other = await createMember(app, admin.cookie, 'User B', 'b@example.com');

      const created = await createProject(app, admin.cookie, { title: 'Segredo de A' });
      expect(created.statusCode).toBe(201);
      const dto = projectOf(created.json());

      // B GET -> 404 (nao 403, sem vazar existencia).
      const getB = await apiRequest(app, 'GET', `/api/v1/projects/${dto.id}`, {
        cookieValue: other.cookie,
      });
      expect(getB.statusCode).toBe(404);
      const getBBody: unknown = getB.json();
      expect(errorOf(getBBody).code).toBe('NOT_FOUND');

      // B PATCH -> 404.
      const patchB = await apiRequest(app, 'PATCH', `/api/v1/projects/${dto.id}`, {
        body: { title: 'Roubo' },
        cookieValue: other.cookie,
      });
      expect(patchB.statusCode).toBe(404);

      // B DELETE com confirm -> 404.
      const delB = await apiRequest(app, 'DELETE', `/api/v1/projects/${dto.id}?confirm=true`, {
        cookieValue: other.cookie,
      });
      expect(delB.statusCode).toBe(404);

      // A ainda le 200 (nao apagado por estranho) + lista de B vazia.
      const still = await apiRequest(app, 'GET', `/api/v1/projects/${dto.id}`, {
        cookieValue: admin.cookie,
      });
      expect(still.statusCode).toBe(200);
      const listB = await apiRequest(app, 'GET', '/api/v1/projects', {
        cookieValue: other.cookie,
      });
      expect(listB.statusCode).toBe(200);
      expect(listOf(listB.json()).items.length).toBe(0);
    });

    it('ID adulterado: UUID inexistente vira 404 com envelope e x-request-id', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[projects] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const admin = await bootstrapAdmin(app, 'Ada Admin', 'ada@example.com');
      const ghost = '123e4567-e89b-12d3-a456-426614174000';

      const got = await apiRequest(app, 'GET', `/api/v1/projects/${ghost}`, {
        cookieValue: admin.cookie,
      });
      expect(got.statusCode).toBe(404);
      expect(headerValue(got, 'x-request-id')).toBeTruthy();
      const body: unknown = got.json();
      // Envelope exato sem distinguir motivo (T-02-03-03).
      expect(errorOf(body).code).toBe('NOT_FOUND');
      expect(errorOf(body).message).toBe('Recurso não encontrado.');
      expect(typeof errorOf(body).requestId).toBe('string');

      // ID malformado tambem 404 identico.
      const malformed = await apiRequest(app, 'GET', '/api/v1/projects/nao-uuid', {
        cookieValue: admin.cookie,
      });
      expect(malformed.statusCode).toBe(404);
      const malformedBody: unknown = malformed.json();
      expect(errorOf(malformedBody).code).toBe('NOT_FOUND');
    });

    it('excluir exige confirmacao; arquivar oculta e permite reativar', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[projects] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const admin = await bootstrapAdmin(app, 'Ada Admin', 'ada@example.com');
      const created = await createProject(app, admin.cookie, { title: 'Para excluir' });
      expect(created.statusCode).toBe(201);
      const dto = projectOf(created.json());

      // Sem ?confirm=true -> 400 CONFIRMATION_REQUIRED.
      const noConfirm = await apiRequest(app, 'DELETE', `/api/v1/projects/${dto.id}`, {
        cookieValue: admin.cookie,
      });
      expect(noConfirm.statusCode).toBe(400);
      const noConfirmBody: unknown = noConfirm.json();
      expect(errorOf(noConfirmBody).code).toBe('CONFIRMATION_REQUIRED');

      // Com confirm=false tambem 400.
      const falseConfirm = await apiRequest(
        app,
        'DELETE',
        `/api/v1/projects/${dto.id}?confirm=false`,
        { cookieValue: admin.cookie },
      );
      expect(falseConfirm.statusCode).toBe(400);

      // Arquivar via PATCH some da lista default, aparece com status=archived.
      const archived = await apiRequest(app, 'PATCH', `/api/v1/projects/${dto.id}`, {
        body: { status: 'archived' },
        cookieValue: admin.cookie,
      });
      expect(archived.statusCode).toBe(200);
      expect(projectOf(archived.json()).status).toBe('archived');

      const defaultList = await apiRequest(app, 'GET', '/api/v1/projects', {
        cookieValue: admin.cookie,
      });
      expect(defaultList.statusCode).toBe(200);
      expect(listOf(defaultList.json()).items.length).toBe(0);

      const archivedList = await apiRequest(app, 'GET', '/api/v1/projects?status=archived', {
        cookieValue: admin.cookie,
      });
      expect(archivedList.statusCode).toBe(200);
      expect(listOf(archivedList.json()).items.length).toBe(1);

      // Reativa com active.
      const reactivated = await apiRequest(app, 'PATCH', `/api/v1/projects/${dto.id}`, {
        body: { status: 'active' },
        cookieValue: admin.cookie,
      });
      expect(reactivated.statusCode).toBe(200);
      expect(projectOf(reactivated.json()).status).toBe('active');

      // Exclui com ?confirm=true -> 204 e GET seguinte 404.
      const removed = await apiRequest(app, 'DELETE', `/api/v1/projects/${dto.id}?confirm=true`, {
        cookieValue: admin.cookie,
      });
      expect(removed.statusCode).toBe(204);
      const after = await apiRequest(app, 'GET', `/api/v1/projects/${dto.id}`, {
        cookieValue: admin.cookie,
      });
      expect(after.statusCode).toBe(404);
    });

    it('paginacao cursor: 25 projetos, limit+nextCursor/hasMore, clamp 100 e default 20', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[projects] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const admin = await bootstrapAdmin(app, 'Ada Admin', 'ada@example.com');

      for (let i = 0; i < 25; i += 1) {
        const res = await createProject(app, admin.cookie, {
          title: `Projeto ${String(i).padStart(2, '0')}`,
        });
        expect(res.statusCode).toBe(201);
      }

      // Primeira pagina limit=20 -> 20 items + hasMore + nextCursor.
      const first = await apiRequest(app, 'GET', '/api/v1/projects?limit=20', {
        cookieValue: admin.cookie,
      });
      expect(first.statusCode).toBe(200);
      const firstPage = listOf(first.json());
      expect(firstPage.items.length).toBe(20);
      expect(firstPage.page.limit).toBe(20);
      expect(firstPage.page.hasMore).toBe(true);
      expect(typeof firstPage.page.nextCursor).toBe('string');
      const cursor = firstPage.page.nextCursor;
      if (cursor === null) {
        throw new Error('primeira pagina sem nextCursor');
      }

      // Segue o cursor -> restantes + hasMore false.
      const second = await apiRequest(
        app,
        'GET',
        `/api/v1/projects?limit=20&cursor=${encodeURIComponent(cursor)}`,
        { cookieValue: admin.cookie },
      );
      expect(second.statusCode).toBe(200);
      const secondPage = listOf(second.json());
      expect(secondPage.items.length).toBe(5);
      expect(secondPage.page.hasMore).toBe(false);
      expect(secondPage.page.nextCursor).toBeNull();

      // Cursor malformado ignora e recomeca do inicio.
      const badCursor = await apiRequest(app, 'GET', '/api/v1/projects?limit=20&cursor=!!!', {
        cookieValue: admin.cookie,
      });
      expect(badCursor.statusCode).toBe(200);
      expect(listOf(badCursor.json()).items.length).toBe(20);

      // Limit 999 -> clamp 100 (maximo D-27).
      const clamped = await apiRequest(app, 'GET', '/api/v1/projects?limit=999', {
        cookieValue: admin.cookie,
      });
      expect(clamped.statusCode).toBe(200);
      const clampedPage = listOf(clamped.json());
      expect(clampedPage.page.limit).toBe(100);
      expect(clampedPage.items.length).toBe(25);
      expect(clampedPage.page.hasMore).toBe(false);

      // Default sem limit -> 20.
      const fallback = await apiRequest(app, 'GET', '/api/v1/projects', {
        cookieValue: admin.cookie,
      });
      expect(fallback.statusCode).toBe(200);
      const fallbackPage = listOf(fallback.json());
      expect(fallbackPage.page.limit).toBe(20);
      expect(fallbackPage.items.length).toBe(20);
    });
  },
);
