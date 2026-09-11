// tests/integration — PATs por device contra PG real (05-02, D-60–D-63).
//
// Cobre: emissao via POST /auth/token (201 com raw hex64 UMA vez, sem cookie),
// listagem sem hash/raw, Bearer acessando lab/projects com os mesmos codigos
// do cookie, 401 generico unico (invalido/expirado/revogado/malformado),
// revogacao individual (Bearer seguinte 401, cookie intacto), IDOR via Bearer
// (dono/estranho/adulterado + UUID fantasma), lockout 5→15min compartilhado
// com o login, logout com Bearer revogando o PAT atual, logout-all revogando
// tudo e regressao da sessao cookie.
//
// SEM PG (env ausente ou inalcançavel): pula com graca, nunca falha — o CI
// com service postgres:16-alpine e que exerce este arquivo. NUNCA imprime
// connection string: so a causa curta.

import { execFileSync } from 'node:child_process';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, sql, type Db } from '@uhhu/db';
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
  personalAccessTokens,
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
const HEX64_PATTERN = /^[a-f0-9]{64}$/;

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

function errorOf(body: unknown): { code: string; message: string; requestId: string } {
  return (body as { error: { code: string; message: string; requestId: string } }).error;
}

function userOf(body: unknown): { id: string; email: string; role: string } {
  return (body as { user: { id: string; email: string; role: string } }).user;
}

function inviteOf(body: unknown): { inviteToken: string; expiresAt: string } {
  return body as { inviteToken: string; expiresAt: string };
}

function tokenOf(body: unknown): {
  token: string;
  id: string;
  deviceName: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
} {
  return body as {
    token: string;
    id: string;
    deviceName: string;
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
  };
}

function tokensOf(body: unknown): Record<string, unknown>[] {
  return (body as { tokens: Record<string, unknown>[] }).tokens;
}

interface ApiResponse {
  statusCode: number;
  headers: unknown;
  json(): unknown;
}

async function apiRequest(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  options: { body?: Record<string, unknown>; cookieValue?: string; bearer?: string } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(options.cookieValue !== undefined
      ? { cookie: `${COOKIE_NAME}=${options.cookieValue}` }
      : {}),
    ...(options.bearer !== undefined ? { authorization: `Bearer ${options.bearer}` } : {}),
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

async function bootstrapTwoUsers(app: FastifyInstance): Promise<{
  cookieA: string;
  cookieB: string;
  userA: { id: string; email: string };
  userB: { id: string; email: string };
}> {
  const first = await apiRequest(app, 'POST', '/api/v1/auth/invites');
  expect(first.statusCode).toBe(201);
  const regA = await apiRequest(app, 'POST', '/api/v1/auth/register', {
    body: {
      name: 'Ana Dona',
      email: 'ana@example.com',
      password: 'SenhaForte123!',
      inviteToken: inviteOf(first.json()).inviteToken,
    },
  });
  expect(regA.statusCode).toBe(201);
  const cookieA = sessionCookie(regA);
  expect(cookieA).not.toBeNull();
  if (cookieA === null) {
    throw new Error('bootstrap A sem cookie');
  }
  const invB = await apiRequest(app, 'POST', '/api/v1/auth/invites', {
    body: {},
    cookieValue: cookieA,
  });
  expect(invB.statusCode).toBe(201);
  const regB = await apiRequest(app, 'POST', '/api/v1/auth/register', {
    body: {
      name: 'Beto Estranho',
      email: 'beto@example.com',
      password: 'SenhaForte123!',
      inviteToken: inviteOf(invB.json()).inviteToken,
    },
  });
  expect(regB.statusCode).toBe(201);
  const cookieB = sessionCookie(regB);
  expect(cookieB).not.toBeNull();
  if (cookieB === null) {
    throw new Error('bootstrap B sem cookie');
  }
  const userA = userOf(regA.json());
  const userB = userOf(regB.json());
  return { cookieA, cookieB, userA, userB };
}

async function issueToken(
  app: FastifyInstance,
  email: string,
  password: string,
  deviceName: string,
): Promise<{ token: string; id: string }> {
  const res = await apiRequest(app, 'POST', '/api/v1/auth/token', {
    body: { email, password, deviceName },
  });
  expect(res.statusCode).toBe(201);
  const created = tokenOf(res.json());
  return { token: created.token, id: created.id };
}

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'pat-auth PG real (emissao/listagem/revogacao + Bearer + IDOR + lockout)',
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
          console.warn('[pat-auth] PG inalcançavel no migrate — pulando integracao (offline).');
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
      // Prova viva de que a migration 0004 existe no PG DEV (T-05-01-TAMPER).
      try {
        await database.execute(sql`select 1 from personal_access_tokens limit 1`);
      } catch (err: unknown) {
        if (isConnectionFailure(errorText(err))) {
          pgAvailable = false;
          console.warn('[pat-auth] PG inalcançavel no smoke da tabela — pulando (offline).');
          return;
        }
        throw err;
      }
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
      await db.delete(personalAccessTokens);
      await db.delete(invites);
      await db.delete(users);
    });

    it('emite PAT via POST /auth/token com raw hex64 UMA vez e sem cookie', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      await bootstrapTwoUsers(app);
      const res = await apiRequest(app, 'POST', '/api/v1/auth/token', {
        body: { email: 'ana@example.com', password: 'SenhaForte123!', deviceName: 'cli-casa' },
      });
      expect(res.statusCode).toBe(201);
      const created: unknown = res.json();
      expect(Object.keys(created as Record<string, unknown>).sort()).toEqual([
        'createdAt',
        'deviceName',
        'expiresAt',
        'id',
        'lastSeenAt',
        'token',
      ]);
      expect(tokenOf(created).token).toMatch(HEX64_PATTERN);
      expect(tokenOf(created).deviceName).toBe('cli-casa');
      const ttlMs =
        new Date(tokenOf(created).expiresAt).getTime() -
        new Date(tokenOf(created).createdAt).getTime();
      expect(ttlMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
      expect(ttlMs).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000);
      // Emissao por API nao cria cookie de sessao (CLI/MCP nunca usam cookie).
      expect(sessionCookie(res)).toBeNull();
      expect(res.headers).toBeDefined();
    });

    it('GET /auth/tokens lista o PAT sem expor hash nem raw', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { cookieA } = await bootstrapTwoUsers(app);
      const issued = await issueToken(app, 'ana@example.com', 'SenhaForte123!', 'cli-casa');
      const viaSession = await apiRequest(app, 'GET', '/api/v1/auth/tokens', {
        cookieValue: cookieA,
      });
      expect(viaSession.statusCode).toBe(200);
      const items = tokensOf(viaSession.json());
      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item).toBeDefined();
      if (item === undefined) {
        throw new Error('lista de PATs vazia');
      }
      expect(Object.keys(item).sort()).toEqual([
        'createdAt',
        'deviceName',
        'expiresAt',
        'id',
        'lastSeenAt',
      ]);
      expect(item['id']).toBe(issued.id);
      expect('token' in item).toBe(false);
      expect('tokenHash' in item).toBe(false);
      expect(JSON.stringify(viaSession.json())).not.toContain(issued.token);
      // Bearer tambem lista (requireAuth aceita sessao OU Bearer).
      const viaBearer = await apiRequest(app, 'GET', '/api/v1/auth/tokens', {
        bearer: issued.token,
      });
      expect(viaBearer.statusCode).toBe(200);
      expect(tokensOf(viaBearer.json())).toHaveLength(1);
    });

    it('Bearer acessa projects e lab/searches com os mesmos codigos do cookie', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { cookieA } = await bootstrapTwoUsers(app);
      const issued = await issueToken(app, 'ana@example.com', 'SenhaForte123!', 'cli-casa');
      const created = await apiRequest(app, 'POST', '/api/v1/projects', {
        body: { title: 'Projeto A' },
        cookieValue: cookieA,
      });
      expect(created.statusCode).toBe(201);
      const projectId = (created.json() as { id: string }).id;
      const viaCookie = await apiRequest(app, 'GET', '/api/v1/projects', {
        cookieValue: cookieA,
      });
      const viaBearer = await apiRequest(app, 'GET', '/api/v1/projects', {
        bearer: issued.token,
      });
      expect(viaCookie.statusCode).toBe(200);
      expect(viaBearer.statusCode).toBe(200);
      expect(viaBearer.json()).toEqual(viaCookie.json());
      const searchesCookie = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/searches?projectId=${projectId}`,
        { cookieValue: cookieA },
      );
      const searchesBearer = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/searches?projectId=${projectId}`,
        { bearer: issued.token },
      );
      expect(searchesCookie.statusCode).toBe(200);
      expect(searchesBearer.statusCode).toBe(200);
      expect(searchesBearer.json()).toEqual(searchesCookie.json());
    });

    it('Bearer invalido/malformado/ausente da o mesmo 401 generico', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      await bootstrapTwoUsers(app);
      const none = await apiRequest(app, 'GET', '/api/v1/auth/me');
      expect(none.statusCode).toBe(401);
      expect(errorOf(none.json()).code).toBe('UNAUTHENTICATED');
      const malformed = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: 'Bearer xyz-curto' },
      });
      expect(malformed.statusCode).toBe(401);
      expect(errorOf(malformed.json() as unknown).code).toBe('UNAUTHENTICATED');
      const unknown = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        bearer: 'a'.repeat(64),
      });
      expect(unknown.statusCode).toBe(401);
      expect(errorOf(unknown.json()).code).toBe('UNAUTHENTICATED');
      // Mesmo envelope do cookie invalido: sem distinguir motivo (requestId
      // difere por request, por desenho — compara code + message).
      expect(errorOf(unknown.json()).code).toBe(errorOf(none.json()).code);
      expect(errorOf(unknown.json()).message).toBe(errorOf(none.json()).message);
    });

    it('DELETE /auth/tokens/:id revoga; Bearer seguinte 401 e cookie intacto', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { cookieA } = await bootstrapTwoUsers(app);
      const issued = await issueToken(app, 'ana@example.com', 'SenhaForte123!', 'cli-casa');
      const before = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        bearer: issued.token,
      });
      expect(before.statusCode).toBe(200);
      const removed = await apiRequest(app, 'DELETE', `/api/v1/auth/tokens/${issued.id}`, {
        cookieValue: cookieA,
      });
      expect(removed.statusCode).toBe(204);
      const after = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        bearer: issued.token,
      });
      expect(after.statusCode).toBe(401);
      expect(errorOf(after.json()).code).toBe('UNAUTHENTICATED');
      // Sessao cookie segue valida (revogacao de PAT nao derruba sessao).
      const sessionOk = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        cookieValue: cookieA,
      });
      expect(sessionOk.statusCode).toBe(200);
      const listed = await apiRequest(app, 'GET', '/api/v1/auth/tokens', {
        cookieValue: cookieA,
      });
      expect(tokensOf(listed.json())).toHaveLength(0);
    });

    it('IDOR via Bearer: estranho recebe 404 em projeto/busca/run de A', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { cookieA, userA, userB } = await bootstrapTwoUsers(app);
      void userB;
      const patA = await issueToken(app, 'ana@example.com', 'SenhaForte123!', 'cli-a');
      const patB = await issueToken(app, 'beto@example.com', 'SenhaForte123!', 'cli-b');
      const created = await apiRequest(app, 'POST', '/api/v1/projects', {
        body: { title: 'Secreto de A' },
        cookieValue: cookieA,
      });
      expect(created.statusCode).toBe(201);
      const projectId = (created.json() as { id: string }).id;
      const search = await apiRequest(app, 'POST', '/api/v1/lab/searches', {
        body: { projectId, term: 'ensino de química' },
        bearer: patA.token,
      });
      expect(search.statusCode).toBe(201);
      const searchId = (search.json() as { id: string }).id;
      const inserted = await db
        .insert(labSearchRuns)
        .values({
          searchId,
          createdBy: userA.id,
          status: 'queued',
          termSnapshot: 'ensino de química',
          filtersSnapshot: {},
          sourcesSnapshot: ['bdtd'],
        })
        .returning({ id: labSearchRuns.id });
      const runId = inserted[0]?.id;
      expect(runId).toBeDefined();
      if (runId === undefined) {
        throw new Error('fixture de run nao inseriu');
      }
      for (const url of [
        `/api/v1/projects/${projectId}`,
        `/api/v1/lab/searches/${searchId}`,
        `/api/v1/lab/runs/${runId}`,
      ]) {
        const owner = await apiRequest(app, 'GET', url, { bearer: patA.token });
        expect(owner.statusCode).toBe(200);
        const stranger = await apiRequest(app, 'GET', url, { bearer: patB.token });
        expect(stranger.statusCode).toBe(404);
        expect(errorOf(stranger.json()).code).toBe('NOT_FOUND');
      }
      // Recurso de A intacto apos as sondagens de B.
      const intact = await apiRequest(app, 'GET', `/api/v1/projects/${projectId}`, {
        bearer: patA.token,
      });
      expect(intact.statusCode).toBe(200);
    });

    it('UUID fantasma via Bearer da 404 identico para dono e estranho', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      await bootstrapTwoUsers(app);
      const patA = await issueToken(app, 'ana@example.com', 'SenhaForte123!', 'cli-a');
      const patB = await issueToken(app, 'beto@example.com', 'SenhaForte123!', 'cli-b');
      for (const url of [
        `/api/v1/projects/${GHOST_UUID}`,
        `/api/v1/lab/searches/${GHOST_UUID}`,
        `/api/v1/lab/runs/${GHOST_UUID}`,
        `/api/v1/lab/results/${GHOST_UUID}`,
      ]) {
        for (const bearer of [patA.token, patB.token]) {
          const res = await apiRequest(app, 'GET', url, { bearer });
          expect(res.statusCode).toBe(404);
          expect(errorOf(res.json()).code).toBe('NOT_FOUND');
        }
      }
      // Revogar PAT de outro usuario tambem e 404 identico (sem enumeracao).
      const cross = await apiRequest(app, 'DELETE', `/api/v1/auth/tokens/${GHOST_UUID}`, {
        bearer: patB.token,
      });
      expect(cross.statusCode).toBe(404);
      const others = await apiRequest(app, 'DELETE', `/api/v1/auth/tokens/${patA.id}`, {
        bearer: patB.token,
      });
      expect(others.statusCode).toBe(404);
      expect(errorOf(others.json()).code).toBe('NOT_FOUND');
    });

    it('lockout compartilhado: 5 senhas erradas no /auth/token, 6ª da 429', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { cookieA } = await bootstrapTwoUsers(app);
      const inv = await apiRequest(app, 'POST', '/api/v1/auth/invites', {
        body: {},
        cookieValue: cookieA,
      });
      expect(inv.statusCode).toBe(201);
      const reg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Catarina Alvo',
          email: 'catarina@example.com',
          password: 'SenhaForte123!',
          inviteToken: inviteOf(inv.json()).inviteToken,
        },
      });
      expect(reg.statusCode).toBe(201);
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const bad = await apiRequest(app, 'POST', '/api/v1/auth/token', {
          body: {
            email: 'catarina@example.com',
            password: 'SenhaErrada123!',
            deviceName: 'cli-ataque',
          },
        });
        expect(bad.statusCode).toBe(401);
        expect(errorOf(bad.json()).code).toBe('INVALID_CREDENTIALS');
      }
      const locked = await apiRequest(app, 'POST', '/api/v1/auth/token', {
        body: {
          email: 'catarina@example.com',
          password: 'SenhaErrada123!',
          deviceName: 'cli-ataque',
        },
      });
      expect(locked.statusCode).toBe(429);
      expect(errorOf(locked.json()).code).toBe('ACCOUNT_LOCKED');
      // Senha certa tambem bloqueia (mesmo contador do login, D-63).
      const evenRight = await apiRequest(app, 'POST', '/api/v1/auth/token', {
        body: {
          email: 'catarina@example.com',
          password: 'SenhaForte123!',
          deviceName: 'cli-ataque',
        },
      });
      expect(evenRight.statusCode).toBe(429);
      expect(errorOf(evenRight.json()).code).toBe('ACCOUNT_LOCKED');
    });

    it('credencial invalida nao distingue e-mail inexistente de senha errada', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      await bootstrapTwoUsers(app);
      const noUser = await apiRequest(app, 'POST', '/api/v1/auth/token', {
        body: { email: 'fantasma@example.com', password: 'SenhaForte123!', deviceName: 'cli-x' },
      });
      const badPass = await apiRequest(app, 'POST', '/api/v1/auth/token', {
        body: { email: 'ana@example.com', password: 'SenhaErrada123!', deviceName: 'cli-x' },
      });
      expect(noUser.statusCode).toBe(401);
      expect(badPass.statusCode).toBe(401);
      expect(errorOf(noUser.json()).code).toBe('INVALID_CREDENTIALS');
      expect(errorOf(badPass.json()).code).toBe('INVALID_CREDENTIALS');
      expect(errorOf(noUser.json()).message).toBe(errorOf(badPass.json()).message);
    });

    it('logout com Bearer revoga o PAT atual sem derrubar a sessao', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { cookieA } = await bootstrapTwoUsers(app);
      const issued = await issueToken(app, 'ana@example.com', 'SenhaForte123!', 'cli-casa');
      const out = await apiRequest(app, 'POST', '/api/v1/auth/logout', {
        bearer: issued.token,
      });
      expect(out.statusCode).toBe(204);
      const after = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        bearer: issued.token,
      });
      expect(after.statusCode).toBe(401);
      const sessionOk = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        cookieValue: cookieA,
      });
      expect(sessionOk.statusCode).toBe(200);
    });

    it('H-03: logout com Bearer de A + cookie de B nao apaga a sessao de B (escopo ao ator)', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { cookieA, cookieB } = await bootstrapTwoUsers(app);
      const patA = await issueToken(app, 'ana@example.com', 'SenhaForte123!', 'cli-a');
      const out = await apiRequest(app, 'POST', '/api/v1/auth/logout', {
        bearer: patA.token,
        cookieValue: cookieB,
      });
      expect(out.statusCode).toBe(204);
      const afterPat = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        bearer: patA.token,
      });
      expect(afterPat.statusCode).toBe(401);
      const sessionB = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        cookieValue: cookieB,
      });
      expect(sessionB.statusCode).toBe(200);
      const sessionA = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        cookieValue: cookieA,
      });
      expect(sessionA.statusCode).toBe(200);
    });

    it('H-03: logout com cookie proprio apaga so a sessao atual', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { cookieA, cookieB } = await bootstrapTwoUsers(app);
      const out = await apiRequest(app, 'POST', '/api/v1/auth/logout', {
        cookieValue: cookieA,
      });
      expect(out.statusCode).toBe(204);
      const gone = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        cookieValue: cookieA,
      });
      expect(gone.statusCode).toBe(401);
      const other = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        cookieValue: cookieB,
      });
      expect(other.statusCode).toBe(200);
    });

    it('logout-all revoga sessoes e todos os PATs (sair de todas)', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { cookieA } = await bootstrapTwoUsers(app);
      const first = await issueToken(app, 'ana@example.com', 'SenhaForte123!', 'cli-casa');
      const second = await issueToken(app, 'ana@example.com', 'SenhaForte123!', 'cli-trabalho');
      const out = await apiRequest(app, 'POST', '/api/v1/auth/logout-all', {
        cookieValue: cookieA,
      });
      expect(out.statusCode).toBe(204);
      for (const token of [first.token, second.token]) {
        const res = await apiRequest(app, 'GET', '/api/v1/auth/me', { bearer: token });
        expect(res.statusCode).toBe(401);
      }
      const listed = await apiRequest(app, 'GET', '/api/v1/auth/tokens', {
        bearer: first.token,
      });
      expect(listed.statusCode).toBe(401);
    });

    it('sessao cookie continua funcionando apos todas as mudancas (regressao)', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[pat-auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { cookieA } = await bootstrapTwoUsers(app);
      const me = await apiRequest(app, 'GET', '/api/v1/auth/me', { cookieValue: cookieA });
      expect(me.statusCode).toBe(200);
      expect(userOf(me.json()).email).toBe('ana@example.com');
      const created = await apiRequest(app, 'POST', '/api/v1/projects', {
        body: { title: 'Cookie vive' },
        cookieValue: cookieA,
      });
      expect(created.statusCode).toBe(201);
      const listed = await apiRequest(app, 'GET', '/api/v1/projects', {
        cookieValue: cookieA,
      });
      expect(listed.statusCode).toBe(200);
      const login = await apiRequest(app, 'POST', '/api/v1/auth/login', {
        body: { email: 'ana@example.com', password: 'SenhaForte123!' },
      });
      expect(login.statusCode).toBe(200);
      expect(sessionCookie(login)).not.toBeNull();
    });
  },
);
