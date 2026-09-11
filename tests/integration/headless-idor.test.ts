// tests/integration — matriz IDOR das superficies novas headless (05-05, D-57).
//
// Cobre dono/estranho/adulterado/ausente nas 8 superficies novas do slice
// headless (PAT list/revoke, export, corpus, compare, results, decision,
// run get, job get) via REST Bearer e via tools MCP e comando CLI onde cabe:
// - GET /auth/tokens: B lista so os proprios, sem hash
// - DELETE /auth/tokens/:id: B em PAT de A vira 404, fantasma 404
// - export/corpus/compare/results/decision/run/job de projeto de A por B
//   (Bearer e cookie) vira 404; fantasma vira 404; sem credencial vira 401
// - MCP lab_get_corpus/lab_export_project com PAT de B em projeto de A
//   vira NOT_FOUND; CLI lab corpus get com PAT de B joga 404
// - asserts checam x-request-id e ausencia de stack/hash em corpo
//
// Fontes BDTD/CAPES via fixtures (fake fetch server-side com passthrough
// para 127.0.0.1, molde cli-headless). Servidor em porta efemera para as
// tools MCP via HTTP real; REST via inject com Bearer. Skip gracioso sem PG.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  labSearchRuns,
  labSearches,
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
import { callTool } from '../../apps/mcp/src/tools.js';
import { McpToolError } from '../../apps/mcp/src/mcp-client.js';
import { CliApiError } from '../../apps/cli/src/client.js';
import { runCorpusGet } from '../../apps/cli/src/commands.js';

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

const ORIGINAL_FETCH: typeof fetch = globalThis.fetch;

function jsonFetchResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('bdtd.ibict.br')) {
    return jsonFetchResponse(BDTD_DATA, 200);
  }
  if (url.includes('catalogodeteses.capes.gov.br')) {
    return jsonFetchResponse(CAPES_DATA, 200);
  }
  return ORIGINAL_FETCH(input, init);
}

function installFake(): void {
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

function headerValue(res: { headers: unknown }, name: string): unknown {
  if (typeof res.headers !== 'object' || res.headers === null) {
    return undefined;
  }
  return (res.headers as Record<string, unknown>)[name];
}

function sessionCookieOf(headers: unknown): string | null {
  if (typeof headers !== 'object' || headers === null) {
    return null;
  }
  const raw: unknown = (headers as Record<string, unknown>)['set-cookie'];
  const list: string[] =
    typeof raw === 'string'
      ? [raw]
      : Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === 'string')
        : [];
  for (const item of list) {
    const pair = item.split(';')[0] ?? '';
    const cut = pair.indexOf('=');
    if (cut >= 0 && pair.slice(0, cut).trim() === COOKIE_NAME) {
      const value = pair.slice(cut + 1).trim();
      if (value.length > 0) {
        return value;
      }
    }
  }
  return null;
}

function errorOf(body: unknown): { code: string; message: string; requestId: string } {
  return (body as { error: { code: string; message: string; requestId: string } }).error;
}

function inviteOf(body: unknown): { inviteToken: string } {
  return body as { inviteToken: string };
}

function userOf(body: unknown): { id: string; email: string } {
  return (body as { user: { id: string; email: string } }).user;
}

function tokenOf(body: unknown): { token: string; id: string } {
  return body as { token: string; id: string };
}

function tokensOf(body: unknown): Record<string, unknown>[] {
  return (body as { tokens: Record<string, unknown>[] }).tokens;
}

function idOf(body: unknown): string {
  return (body as { id: string }).id;
}

function itemsOf(body: unknown): Record<string, unknown>[] {
  return (body as { items: Record<string, unknown>[] }).items;
}

function strField(record: Record<string, unknown>, key: string): string {
  const value: unknown = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`campo ${key} ausente`);
  }
  return value;
}

interface ApiResponse {
  statusCode: number;
  headers: unknown;
  json(): unknown;
}

async function apiRequest(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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

function expectIsolatedError(res: ApiResponse, expectedCode: string): void {
  expect(headerValue(res, 'x-request-id')).toBeTruthy();
  const body: unknown = res.json();
  expect(errorOf(body).code).toBe(expectedCode);
  expect(typeof errorOf(body).requestId).toBe('string');
  const text = JSON.stringify(body).toLowerCase();
  expect(text).not.toMatch(/stack|passwordhash|password_hash|tokenhash|secret|sql/);
}

const ORIG_TOKEN = process.env['UHHU_TOKEN'];
const ORIG_API_URL = process.env['UHHU_API_URL'];

async function withMcpEnv<T>(token: string, baseUrl: string, fn: () => Promise<T>): Promise<T> {
  const saved = new Map<string, string>();
  for (const key of Object.keys(process.env)) {
    if (key.includes('DATABASE')) {
      const value = process.env[key];
      if (value !== undefined) {
        saved.set(key, value);
      }
      delete process.env[key];
    }
  }
  const prevToken = process.env['UHHU_TOKEN'];
  const prevUrl = process.env['UHHU_API_URL'];
  process.env['UHHU_TOKEN'] = token;
  process.env['UHHU_API_URL'] = baseUrl;
  try {
    const leaked = Object.keys(process.env).filter((key) => key.includes('DATABASE'));
    expect(leaked).toEqual([]);
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      process.env[key] = value;
    }
    if (prevToken === undefined) {
      delete process.env['UHHU_TOKEN'];
    } else {
      process.env['UHHU_TOKEN'] = prevToken;
    }
    if (prevUrl === undefined) {
      delete process.env['UHHU_API_URL'];
    } else {
      process.env['UHHU_API_URL'] = prevUrl;
    }
  }
}

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'headless idor PG real (superficies novas PAT/export/corpus/compare/results/decision/run/job)',
  () => {
    let pgAvailable = true;
    let app: FastifyInstance | undefined;
    let db: Db | undefined;
    let baseUrl = '';
    void mkdtempSync;

    async function bootstrapTwoUsers(): Promise<{
      cookieA: string;
      cookieB: string;
      patA: { token: string; id: string };
      patB: { token: string; id: string };
    }> {
      if (app === undefined) {
        throw new Error('app nao inicializado');
      }
      const first = await apiRequest(app, 'POST', '/api/v1/auth/invites');
      expect(first.statusCode).toBe(201);
      const regA = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Dona Headless',
          email: 'dona-headless@example.com',
          password: 'SenhaForte123!',
          inviteToken: inviteOf(first.json()).inviteToken,
        },
      });
      expect(regA.statusCode).toBe(201);
      const cookieA = sessionCookieOf(regA.headers);
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
          name: 'Estranho Headless',
          email: 'estranho-headless@example.com',
          password: 'SenhaForte123!',
          inviteToken: inviteOf(invB.json()).inviteToken,
        },
      });
      expect(regB.statusCode).toBe(201);
      const cookieB = sessionCookieOf(regB.headers);
      expect(cookieB).not.toBeNull();
      if (cookieB === null) {
        throw new Error('bootstrap B sem cookie');
      }
      const tokA = await apiRequest(app, 'POST', '/api/v1/auth/token', {
        body: {
          email: 'dona-headless@example.com',
          password: 'SenhaForte123!',
          deviceName: 'cli-a',
        },
      });
      expect(tokA.statusCode).toBe(201);
      const tokB = await apiRequest(app, 'POST', '/api/v1/auth/token', {
        body: {
          email: 'estranho-headless@example.com',
          password: 'SenhaForte123!',
          deviceName: 'cli-b',
        },
      });
      expect(tokB.statusCode).toBe(201);
      return {
        cookieA,
        cookieB,
        patA: tokenOf(tokA.json()),
        patB: tokenOf(tokB.json()),
      };
    }

    async function setupChain(patA: string): Promise<{
      projectId: string;
      searchId: string;
      search2Id: string;
      runId: string;
      groupId: string;
    }> {
      if (app === undefined) {
        throw new Error('app nao inicializado');
      }
      const proj = await apiRequest(app, 'POST', '/api/v1/projects', {
        body: { title: 'Projeto IDOR headless' },
        bearer: patA,
      });
      expect(proj.statusCode).toBe(201);
      const projectId = idOf(proj.json());
      const search = await apiRequest(app, 'POST', '/api/v1/lab/searches', {
        body: { projectId, term: '"ensino de química"', sources: ['bdtd', 'capes'] },
        bearer: patA,
      });
      expect(search.statusCode).toBe(201);
      const searchId = idOf(search.json());
      const search2 = await apiRequest(app, 'POST', '/api/v1/lab/searches', {
        body: { projectId, term: '"educação básica"', sources: ['bdtd', 'capes'] },
        bearer: patA,
      });
      expect(search2.statusCode).toBe(201);
      const search2Id = idOf(search2.json());
      const run = await apiRequest(app, 'POST', `/api/v1/lab/searches/${searchId}/runs`, {
        body: {},
        bearer: patA,
      });
      expect([201, 202]).toContain(run.statusCode);
      const runId = idOf(run.json());
      const groups = await apiRequest(app, 'GET', `/api/v1/lab/projects/${projectId}/groups?limit=5`, {
        bearer: patA,
      });
      expect(groups.statusCode).toBe(200);
      const list = itemsOf(groups.json());
      expect(list.length).toBeGreaterThan(0);
      const first = list[0];
      if (first === undefined) {
        throw new Error('grupos vazios apos run com fixtures');
      }
      return { projectId, searchId, search2Id, runId, groupId: strField(first, 'id') };
    }

    beforeAll(async () => {
      try {
        execFileSync('pnpm', ['--filter', '@uhhu/db', 'db:migrate'], {
          stdio: 'pipe',
          timeout: 60000,
        });
      } catch (err: unknown) {
        if (isConnectionFailure(errorText(err))) {
          pgAvailable = false;
          console.warn('[headless-idor] PG inalcançavel no migrate — pulando (offline).');
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
      await instance.listen({ port: 0, host: '127.0.0.1' });
      const addr = instance.server.address();
      if (typeof addr !== 'object' || addr === null || typeof addr.port !== 'number') {
        throw new Error('listen sem porta atribuida');
      }
      baseUrl = `http://127.0.0.1:${addr.port}`;
      void tmpdir;
      app = instance;
    }, 60000);

    afterAll(async () => {
      globalThis.fetch = ORIGINAL_FETCH;
      if (ORIG_TOKEN === undefined) {
        delete process.env['UHHU_TOKEN'];
      } else {
        process.env['UHHU_TOKEN'] = ORIG_TOKEN;
      }
      if (ORIG_API_URL === undefined) {
        delete process.env['UHHU_API_URL'];
      } else {
        process.env['UHHU_API_URL'] = ORIG_API_URL;
      }
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
      await db.delete(personalAccessTokens);
      await db.delete(passwordResets);
      await db.delete(sessions);
      await db.delete(invites);
      await db.delete(users);
      installFake();
    });

    afterEach(() => {
      globalThis.fetch = ORIGINAL_FETCH;
    });

    it('tokens: estranho lista so os proprios, sem hash', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[headless-idor] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { patA, patB } = await bootstrapTwoUsers();
      const listA = await apiRequest(app, 'GET', '/api/v1/auth/tokens', { bearer: patA.token });
      expect(listA.statusCode).toBe(200);
      expect(tokensOf(listA.json())).toHaveLength(1);
      const listB = await apiRequest(app, 'GET', '/api/v1/auth/tokens', { bearer: patB.token });
      expect(listB.statusCode).toBe(200);
      expect(tokensOf(listB.json())).toHaveLength(1);
      expect(strField(tokensOf(listB.json())[0] as Record<string, unknown>, 'id')).toBe(patB.id);
      expect(JSON.stringify(listB.json())).not.toContain(patA.token);
      expect(JSON.stringify(listB.json())).not.toContain(patB.token);
      const anon = await apiRequest(app, 'GET', '/api/v1/auth/tokens');
      expect(anon.statusCode).toBe(401);
      expectIsolatedError(anon, 'UNAUTHENTICATED');
      void userOf;
    });

    it('tokens: estranho deletando PAT alheio vira 404, fantasma 404', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[headless-idor] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { patA, patB } = await bootstrapTwoUsers();
      const cross = await apiRequest(app, 'DELETE', `/api/v1/auth/tokens/${patA.id}`, {
        bearer: patB.token,
      });
      expect(cross.statusCode).toBe(404);
      expectIsolatedError(cross, 'NOT_FOUND');
      const ghostOwner = await apiRequest(app, 'DELETE', `/api/v1/auth/tokens/${GHOST_UUID}`, {
        bearer: patA.token,
      });
      expect(ghostOwner.statusCode).toBe(404);
      expectIsolatedError(ghostOwner, 'NOT_FOUND');
      const ghostStranger = await apiRequest(app, 'DELETE', `/api/v1/auth/tokens/${GHOST_UUID}`, {
        bearer: patB.token,
      });
      expect(ghostStranger.statusCode).toBe(404);
      expectIsolatedError(ghostStranger, 'NOT_FOUND');
      const still = await apiRequest(app, 'GET', '/api/v1/auth/me', { bearer: patA.token });
      expect(still.statusCode).toBe(200);
    });

    it('export: dono 200, estranho 404, adulterado 404, ausente 401', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[headless-idor] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { cookieA, cookieB, patA, patB } = await bootstrapTwoUsers();
      const chain = await setupChain(patA.token);
      const ownerBearer = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${chain.projectId}/export?format=json&scope=corpus`,
        { bearer: patA.token },
      );
      expect(ownerBearer.statusCode).toBe(200);
      const ownerCookie = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${chain.projectId}/export?format=json&scope=corpus`,
        { cookieValue: cookieA },
      );
      expect(ownerCookie.statusCode).toBe(200);
      const strangerBearer = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${chain.projectId}/export?format=json&scope=corpus`,
        { bearer: patB.token },
      );
      expect(strangerBearer.statusCode).toBe(404);
      expectIsolatedError(strangerBearer, 'NOT_FOUND');
      const strangerCookie = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${chain.projectId}/export?format=json&scope=corpus`,
        { cookieValue: cookieB },
      );
      expect(strangerCookie.statusCode).toBe(404);
      expectIsolatedError(strangerCookie, 'NOT_FOUND');
      const ghost = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${GHOST_UUID}/export?format=json&scope=corpus`,
        { bearer: patA.token },
      );
      expect(ghost.statusCode).toBe(404);
      expectIsolatedError(ghost, 'NOT_FOUND');
      const anon = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${chain.projectId}/export?format=json&scope=corpus`,
      );
      expect(anon.statusCode).toBe(401);
      expectIsolatedError(anon, 'UNAUTHENTICATED');
    });

    it('corpus: dono 200, estranho 404, adulterado 404, ausente 401', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[headless-idor] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { patA, patB } = await bootstrapTwoUsers();
      const chain = await setupChain(patA.token);
      const owner = await apiRequest(app, 'GET', `/api/v1/lab/projects/${chain.projectId}/corpus`, {
        bearer: patA.token,
      });
      expect(owner.statusCode).toBe(200);
      const stranger = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/projects/${chain.projectId}/corpus`,
        { bearer: patB.token },
      );
      expect(stranger.statusCode).toBe(404);
      expectIsolatedError(stranger, 'NOT_FOUND');
      const ghost = await apiRequest(app, 'GET', `/api/v1/lab/projects/${GHOST_UUID}/corpus`, {
        bearer: patA.token,
      });
      expect(ghost.statusCode).toBe(404);
      expectIsolatedError(ghost, 'NOT_FOUND');
      const anon = await apiRequest(app, 'GET', `/api/v1/lab/projects/${chain.projectId}/corpus`);
      expect(anon.statusCode).toBe(401);
      expectIsolatedError(anon, 'UNAUTHENTICATED');
    });

    it('compare: dono 200, estranho 404, adulterado 404, ausente 401', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[headless-idor] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { patA, patB } = await bootstrapTwoUsers();
      const chain = await setupChain(patA.token);
      const owner = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/searches/${chain.searchId}/compare?with=${chain.search2Id}`,
        { bearer: patA.token },
      );
      expect(owner.statusCode).toBe(200);
      const stranger = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/searches/${chain.searchId}/compare?with=${chain.search2Id}`,
        { bearer: patB.token },
      );
      expect(stranger.statusCode).toBe(404);
      expectIsolatedError(stranger, 'NOT_FOUND');
      const ghost = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/searches/${GHOST_UUID}/compare?with=${chain.search2Id}`,
        { bearer: patA.token },
      );
      expect(ghost.statusCode).toBe(404);
      expectIsolatedError(ghost, 'NOT_FOUND');
      const anon = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/searches/${chain.searchId}/compare?with=${chain.search2Id}`,
      );
      expect(anon.statusCode).toBe(401);
      expectIsolatedError(anon, 'UNAUTHENTICATED');
    });

    it('results: dono 200, estranho 404, adulterado 404, ausente 401', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[headless-idor] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { patA, patB } = await bootstrapTwoUsers();
      const chain = await setupChain(patA.token);
      const owner = await apiRequest(app, 'GET', `/api/v1/lab/runs/${chain.runId}/results?limit=5`, {
        bearer: patA.token,
      });
      expect(owner.statusCode).toBe(200);
      const stranger = await apiRequest(
        app,
        'GET',
        `/api/v1/lab/runs/${chain.runId}/results?limit=5`,
        { bearer: patB.token },
      );
      expect(stranger.statusCode).toBe(404);
      expectIsolatedError(stranger, 'NOT_FOUND');
      const ghost = await apiRequest(app, 'GET', `/api/v1/lab/results/${GHOST_UUID}`, {
        bearer: patA.token,
      });
      expect(ghost.statusCode).toBe(404);
      expectIsolatedError(ghost, 'NOT_FOUND');
      const anon = await apiRequest(app, 'GET', `/api/v1/lab/runs/${chain.runId}/results?limit=5`);
      expect(anon.statusCode).toBe(401);
      expectIsolatedError(anon, 'UNAUTHENTICATED');
    });

    it('decision: dono decide eligible, estranho 404, adulterado 404, ausente 401', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[headless-idor] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { patA, patB } = await bootstrapTwoUsers();
      const chain = await setupChain(patA.token);
      const owner = await apiRequest(app, 'PUT', `/api/v1/lab/groups/${chain.groupId}/decision`, {
        body: { decision: 'eligible' },
        bearer: patA.token,
      });
      expect(owner.statusCode).toBe(200);
      const stranger = await apiRequest(
        app,
        'PUT',
        `/api/v1/lab/groups/${chain.groupId}/decision`,
        { body: { decision: 'ineligible' }, bearer: patB.token },
      );
      expect(stranger.statusCode).toBe(404);
      expectIsolatedError(stranger, 'NOT_FOUND');
      const ghost = await apiRequest(app, 'PUT', `/api/v1/lab/groups/${GHOST_UUID}/decision`, {
        body: { decision: 'eligible' },
        bearer: patA.token,
      });
      expect(ghost.statusCode).toBe(404);
      expectIsolatedError(ghost, 'NOT_FOUND');
      const anon = await apiRequest(app, 'PUT', `/api/v1/lab/groups/${chain.groupId}/decision`, {
        body: { decision: 'eligible' },
      });
      expect(anon.statusCode).toBe(401);
      expectIsolatedError(anon, 'UNAUTHENTICATED');
    });

    it('run get + job get: dono 200, estranho 404, adulterado 404, ausente 401', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[headless-idor] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { patA, patB } = await bootstrapTwoUsers();
      const chain = await setupChain(patA.token);
      for (const url of [`/api/v1/lab/runs/${chain.runId}`, `/api/v1/jobs/${chain.runId}`]) {
        const owner = await apiRequest(app, 'GET', url, { bearer: patA.token });
        expect(owner.statusCode).toBe(200);
        const stranger = await apiRequest(app, 'GET', url, { bearer: patB.token });
        expect(stranger.statusCode).toBe(404);
        expectIsolatedError(stranger, 'NOT_FOUND');
      }
      const ghostRun = await apiRequest(app, 'GET', `/api/v1/lab/runs/${GHOST_UUID}`, {
        bearer: patA.token,
      });
      expect(ghostRun.statusCode).toBe(404);
      expectIsolatedError(ghostRun, 'NOT_FOUND');
      const ghostJob = await apiRequest(app, 'GET', `/api/v1/jobs/${GHOST_UUID}`, {
        bearer: patA.token,
      });
      expect(ghostJob.statusCode).toBe(404);
      expectIsolatedError(ghostJob, 'NOT_FOUND');
      const anonRun = await apiRequest(app, 'GET', `/api/v1/lab/runs/${chain.runId}`);
      expect(anonRun.statusCode).toBe(401);
      expectIsolatedError(anonRun, 'UNAUTHENTICATED');
      const anonJob = await apiRequest(app, 'GET', `/api/v1/jobs/${chain.runId}`);
      expect(anonJob.statusCode).toBe(401);
      expectIsolatedError(anonJob, 'UNAUTHENTICATED');
    });

    it('MCP estranho via callTool em projeto alheio vira NOT_FOUND sem vazar', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[headless-idor] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { patA, patB } = await bootstrapTwoUsers();
      const chain = await setupChain(patA.token);
      await withMcpEnv(patB.token, baseUrl, async () => {
        const errCorpus: unknown = await callTool('lab_get_corpus', {
          projectId: chain.projectId,
        }).then(
          () => null,
          (caught: unknown) => caught,
        );
        expect(errCorpus).toBeInstanceOf(McpToolError);
        if (errCorpus instanceof McpToolError) {
          expect(errCorpus.status).toBe(404);
          expect(errCorpus.code).toBe('NOT_FOUND');
          expect(errCorpus.requestId.length).toBeGreaterThan(0);
        }
        const errExport: unknown = await callTool('lab_export_project', {
          projectId: chain.projectId,
          format: 'json',
          confirm: true,
        }).then(
          () => null,
          (caught: unknown) => caught,
        );
        expect(errExport).toBeInstanceOf(McpToolError);
        if (errExport instanceof McpToolError) {
          expect(errExport.status).toBe(404);
          expect(errExport.code).toBe('NOT_FOUND');
        }
        const errGhost: unknown = await callTool('lab_get_corpus', {
          projectId: GHOST_UUID,
        }).then(
          () => null,
          (caught: unknown) => caught,
        );
        expect(errGhost).toBeInstanceOf(McpToolError);
        if (errGhost instanceof McpToolError) {
          expect(errGhost.status).toBe(404);
        }
      });
      const intact = await apiRequest(app, 'GET', `/api/v1/lab/projects/${chain.projectId}/corpus`, {
        bearer: patA.token,
      });
      expect(intact.statusCode).toBe(200);
    });

    it('CLI estranho via comando em projeto alheio joga 404 com envelope', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[headless-idor] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { patA, patB } = await bootstrapTwoUsers();
      const chain = await setupChain(patA.token);
      const prevToken = process.env['UHHU_TOKEN'];
      const prevUrl = process.env['UHHU_API_URL'];
      process.env['UHHU_TOKEN'] = patB.token;
      process.env['UHHU_API_URL'] = baseUrl;
      try {
        const leaked = Object.keys(process.env).filter((key) => key.includes('DATABASE'));
        expect(leaked.length).toBeGreaterThan(0);
        const filtered: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (typeof value === 'string' && !key.includes('DATABASE')) {
            filtered[key] = value;
          }
        }
        expect(Object.keys(filtered).some((key) => key.includes('DATABASE'))).toBe(false);
        let caught: unknown = null;
        try {
          await runCorpusGet(['--project', chain.projectId], {
            json: true,
            verbose: false,
            timeoutMs: 60000,
          });
        } catch (err: unknown) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(CliApiError);
        if (caught instanceof CliApiError) {
          expect(caught.status).toBe(404);
          expect(caught.code).toBe('NOT_FOUND');
          expect(caught.requestId.length).toBeGreaterThan(0);
        }
        const ghostCaught: unknown = await runCorpusGet(['--project', GHOST_UUID], {
          json: true,
          verbose: false,
          timeoutMs: 60000,
        }).then(
          () => null,
          (err: unknown) => err,
        );
        expect(ghostCaught).toBeInstanceOf(CliApiError);
      } finally {
        if (prevToken === undefined) {
          delete process.env['UHHU_TOKEN'];
        } else {
          process.env['UHHU_TOKEN'] = prevToken;
        }
        if (prevUrl === undefined) {
          delete process.env['UHHU_API_URL'];
        } else {
          process.env['UHHU_API_URL'] = prevUrl;
        }
      }
    });
  },
);
