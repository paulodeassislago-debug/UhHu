// tests/integration — MCP headless ponta a ponta contra PG DEV real (CORE-02/05, D-67–D-70).
//
// Sobe o mesmo app (auth+projects+lab) com `listen` em porta efêmera (nunca a
// 3000 de outra sessão) e dirige as 11 tools via `callTool` direto — o lado
// MCP enxerga SÓ `UHHU_TOKEN`+`UHHU_API_URL` (as variáveis *DATABASE* são
// removidas do env durante a cadeia e restauradas depois, provando que o MCP
// nunca toca o banco). Fontes BDTD/CAPES via fixtures (fake fetch server-side
// com passthrough para 127.0.0.1, molde lab-search-runs). Zero `any`.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

function readDatabaseUrl(name: 'APP_DATABASE_URL' | 'MIGRATION_DATABASE_URL'): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const APP_URL = readDatabaseUrl('APP_DATABASE_URL');
const MIGRATION_URL = readDatabaseUrl('MIGRATION_DATABASE_URL');

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
const PASSWORD = 'SenhaForte123!';

function jsonFetchResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Fake server-side das fontes com passthrough: BDTD/CAPES vão para fixtures;
// o resto (o próprio MCP contra 127.0.0.1) usa o fetch real.
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

// Cookie de sessão do header set-cookie (o convite do 2º usuário em diante
// exige sessão admin — o 1º registro é aberto quando users está vazia).
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

function reqRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${what} fora do formato esperado`);
  }
  return value as Record<string, unknown>;
}

function reqString(record: Record<string, unknown>, key: string, what: string): string {
  const value: unknown = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${what}.${key} fora do formato esperado`);
  }
  return value;
}

function reqArray(record: Record<string, unknown>, key: string, what: string): unknown[] {
  const value: unknown = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`${what}.${key} fora do formato esperado`);
  }
  return value;
}

const ORIG_TOKEN = process.env['UHHU_TOKEN'];
const ORIG_API_URL = process.env['UHHU_API_URL'];

// Lado MCP do teste: SÓ UHHU_TOKEN + UHHU_API_URL no env — nenhuma variável
// *DATABASE* visível enquanto as tools executam (o servidor já tem seu pool;
// as tools só leem TOKEN/URL). Restaura tudo no finally.
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
  'mcp headless PG real (cadeia Etapa 2 por tools com o mesmo PAT e o mesmo 404)',
  () => {
    let pgAvailable = true;
    let app: FastifyInstance | undefined;
    let db: Db | undefined;
    let baseUrl = '';
    let emailSeq = 0;

    async function bootstrapUser(
      name: string,
      inviterCookie?: string,
    ): Promise<{ email: string; token: string; cookie: string }> {
      if (app === undefined) {
        throw new Error('app não inicializado');
      }
      emailSeq += 1;
      const email = `mcp-dono-${emailSeq}@exemplo.test`;
      const inviteHeaders: Record<string, string> =
        inviterCookie === undefined ? {} : { cookie: `${COOKIE_NAME}=${inviterCookie}` };
      const boot = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/invites',
        headers: inviteHeaders,
      });
      expect(boot.statusCode).toBe(201);
      const bootBody = reqRecord(boot.json() as unknown, 'convite');
      const reg = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name,
          email,
          password: PASSWORD,
          inviteToken: reqString(bootBody, 'inviteToken', 'convite'),
        },
        headers: { 'content-type': 'application/json' },
      });
      expect(reg.statusCode).toBe(201);
      const cookieValue = sessionCookieOf(reg.headers);
      expect(cookieValue).not.toBeNull();
      const issued = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/token',
        payload: { email, password: PASSWORD, deviceName: 'mcp-headless' },
        headers: { 'content-type': 'application/json' },
      });
      expect(issued.statusCode).toBe(201);
      const created = reqRecord(issued.json() as unknown, 'pat');
      return { email, token: reqString(created, 'token', 'pat'), cookie: cookieValue ?? '' };
    }

    async function setupChain(token: string): Promise<{
      projectId: string;
      searchId: string;
      runId: string;
    }> {
      const projectOut = await callTool('lab_create_project', {
        title: 'Projeto Headless MCP',
        confirm: true,
      });
      const projectId = reqString(reqRecord(projectOut, 'projeto'), 'id', 'projeto');
      const searchOut = await callTool('lab_create_search', {
        projectId,
        term: '"ensino de química"',
        sources: ['bdtd', 'capes'],
        confirm: true,
      });
      const searchId = reqString(reqRecord(searchOut, 'busca'), 'id', 'busca');
      const runOut = await callTool('lab_execute_search', {
        searchId,
        idempotencyKey: `mcp-k-${emailSeq}-${searchId.slice(0, 8)}`,
        confirm: true,
      });
      const run = reqRecord(runOut, 'run');
      const status = reqString(run, 'status', 'run');
      expect(['succeeded', 'partial']).toContain(status);
      void token;
      return { projectId, searchId, runId: reqString(run, 'id', 'run') };
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
          console.warn('[mcp-headless] PG inalcançável no migrate — pulando integração (offline).');
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
      // Porta efêmera: nunca a 3000 (servidor obsoleto de outra sessão).
      await instance.listen({ port: 0, host: '127.0.0.1' });
      const addr = instance.server.address();
      if (typeof addr !== 'object' || addr === null || typeof addr.port !== 'number') {
        throw new Error('listen sem porta atribuída');
      }
      baseUrl = `http://127.0.0.1:${addr.port}`;
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
      vi.unstubAllGlobals();
    });

    it('cadeia Etapa 2 via tools: projeto→busca→run ok|partial com o mesmo PAT', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[mcp-headless] PG inalcançável — teste pulado (offline).');
        return;
      }
      const { token } = await bootstrapUser('Dono MCP');
      await withMcpEnv(token, baseUrl, async () => {
        const chain = await setupChain(token);
        expect(chain.projectId.length).toBeGreaterThan(0);
        expect(chain.searchId.length).toBeGreaterThan(0);
        expect(chain.runId.length).toBeGreaterThan(0);
      });
    });

    it('lab_list_results devolve items + page com hasMore boolean', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[mcp-headless] PG inalcançável — teste pulado (offline).');
        return;
      }
      const { token } = await bootstrapUser('Dono Results');
      await withMcpEnv(token, baseUrl, async () => {
        const chain = await setupChain(token);
        const out = await callTool('lab_list_results', { runId: chain.runId, limit: 20 });
        const lista = reqRecord(out, 'lista');
        expect(Array.isArray(lista['items'])).toBe(true);
        expect(typeof lista['total']).toBe('number');
        const page = reqRecord(lista['page'], 'lista.page');
        expect(typeof page['hasMore']).toBe('boolean');
        expect(typeof page['limit']).toBe('number');
      });
    });

    it('decisão via tool entra no corpus (grupo eligible)', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[mcp-headless] PG inalcançável — teste pulado (offline).');
        return;
      }
      const { token } = await bootstrapUser('Dono Corpus');
      await withMcpEnv(token, baseUrl, async () => {
        const chain = await setupChain(token);
        const groupsRes = await app?.inject({
          method: 'GET',
          url: `/api/v1/lab/projects/${chain.projectId}/groups?limit=5`,
          headers: { authorization: `Bearer ${token}` },
        });
        expect(groupsRes?.statusCode).toBe(200);
        const groups = reqArray(
          reqRecord(groupsRes?.json() as unknown, 'grupos'),
          'items',
          'grupos',
        );
        expect(groups.length).toBeGreaterThan(0);
        const first = reqRecord(groups[0], 'grupos[0]');
        const decided = await callTool('lab_set_result_decision', {
          groupId: reqString(first, 'id', 'grupo'),
          decision: 'eligible',
          confirm: true,
        });
        expect(reqString(reqRecord(decided, 'grupo'), 'decision', 'grupo')).toBe('eligible');
        const corpus = await callTool('lab_get_corpus', { projectId: chain.projectId });
        const entries = reqArray(reqRecord(corpus, 'corpus'), 'items', 'corpus');
        expect(entries.length).toBeGreaterThan(0);
      });
    });

    it('lab_export_project retorna referência corpus-* com conteúdo', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[mcp-headless] PG inalcançável — teste pulado (offline).');
        return;
      }
      const { token } = await bootstrapUser('Dono Export');
      await withMcpEnv(token, baseUrl, async () => {
        const chain = await setupChain(token);
        const out = await callTool('lab_export_project', {
          projectId: chain.projectId,
          format: 'json',
          confirm: true,
        });
        const ref = reqRecord(out, 'exportação');
        expect(reqString(ref, 'filename', 'exportação').startsWith('corpus-')).toBe(true);
        expect(typeof ref['sizeBytes']).toBe('number');
        expect(ref['contentJson'] !== undefined || typeof ref['contentText'] === 'string').toBe(
          true,
        );
      });
    });

    it('lab_list_sources + lab_get_source_health com o mesmo PAT', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[mcp-headless] PG inalcançável — teste pulado (offline).');
        return;
      }
      const { token } = await bootstrapUser('Dono Sources');
      await withMcpEnv(token, baseUrl, async () => {
        const listed = await callTool('lab_list_sources', {});
        expect(Array.isArray(listed)).toBe(true);
        expect((listed as unknown[]).length).toBeGreaterThanOrEqual(2);
        const health = await callTool('lab_get_source_health', { source: 'bdtd' });
        expect(['ok', 'degraded', 'offline']).toContain(
          reqString(reqRecord(health, 'saúde'), 'status', 'saúde'),
        );
      });
    });

    it('IDOR: segundo usuário via tool em projeto alheio recebe NOT_FOUND', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[mcp-headless] PG inalcançável — teste pulado (offline).');
        return;
      }
      const owner = await bootstrapUser('Dono IDOR');
      let foreignProject = '';
      await withMcpEnv(owner.token, baseUrl, async () => {
        const chain = await setupChain(owner.token);
        foreignProject = chain.projectId;
      });
      const stranger = await bootstrapUser('Estranho IDOR', owner.cookie);
      await withMcpEnv(stranger.token, baseUrl, async () => {
        const err: unknown = await callTool('lab_get_corpus', {
          projectId: foreignProject,
        }).then(
          () => null,
          (caught: unknown) => caught,
        );
        expect(err).toBeInstanceOf(McpToolError);
        if (err instanceof McpToolError) {
          expect(err.status).toBe(404);
          expect(err.code).toBe('NOT_FOUND');
        } else {
          throw new Error('erro fora do tipo esperado');
        }
      });
    });

    it('lado MCP opera só com UHHU_TOKEN+UHHU_API_URL (sem *DATABASE* no env)', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[mcp-headless] PG inalcançável — teste pulado (offline).');
        return;
      }
      const { token } = await bootstrapUser('Dono Env');
      await withMcpEnv(token, baseUrl, async () => {
        expect(process.env['UHHU_TOKEN']).toBe(token);
        expect(process.env['UHHU_API_URL']).toBe(baseUrl);
        const listed = await callTool('lab_list_sources', {});
        expect(Array.isArray(listed)).toBe(true);
      });
    });
  },
);
