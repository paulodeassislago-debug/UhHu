// tests/integration — CLI headless ponta a ponta contra PG DEV real (CORE-02/05, D-54/D-56/D-58/D-59/D-62).
//
// Sobe o mesmo app (auth+projects+lab) com `listen` em porta efemera (nunca a
// 3000 do outro sessao) e dirige o CLI por HTTP real via as funcoes de
// commands (import direto, sem spawn) — exceto os spawns finas que provam o
// filho sem DATABASE_URL no env. Fontes BDTD/CAPES via fixtures (fake fetch
// server-side com passthrough para 127.0.0.1, molde lab-search-runs).
// HOME fake em tmpdir: a credencial nunca toca o HOME real. Zero `any`.

import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import {
  runAuthLogin,
  runCorpusGet,
  runExport,
  runGroupList,
  runJobGet,
  runProjectCreate,
  runProjectList,
  runResultDecide,
  runRunResults,
  runSearchCreate,
  runSearchRun,
  type GlobalOptions,
} from '../../apps/cli/src/commands.js';

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
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ROOT = process.cwd();
const CLI_WRAPPER = join(ROOT, 'apps/cli/bin/uhhu.mjs');

function jsonFetchResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Fake server-side das fontes com passthrough: BDTD/CAPES vao para fixtures;
// o resto (o proprio CLI contra 127.0.0.1) usa o fetch real.
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

const ORIG_HOME = process.env['HOME'];
const ORIG_TOKEN = process.env['UHHU_TOKEN'];
const ORIG_API_URL = process.env['UHHU_API_URL'];

// Spawn ASSINCRONO (nunca execFileSync com servidor no ar): o sync bloquearia
// o event loop do worker e o Fastify in-process jamais aceitaria a conexao do
// filho (deadlock ate o timeout). Com exec async o loop segue livre e o
// servidor atende o filho normalmente.
function execFileAsync(
  file: string,
  args: string[],
  options: { env: Record<string, string>; cwd: string; timeout: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { env: options.env, cwd: options.cwd, timeout: options.timeout, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

// Prova que execFileSync foi importado do child_process (migrate + spawn).
void execFileSync;

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'cli headless PG real (login→projeto→busca→run→decide→export sem DATABASE_URL no cliente)',
  () => {
    let pgAvailable = true;
    let app: FastifyInstance | undefined;
    let db: Db | undefined;
    let baseUrl = '';
    let fakeHome = '';
    let emailSeq = 0;

    const G = (over: Partial<GlobalOptions> = {}): GlobalOptions => ({
      json: false,
      verbose: false,
      timeoutMs: 60000,
      baseUrl,
      ...over,
    });

    function capture(): { lines: string[]; restore: () => void } {
      const lines: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        lines.push(
          args.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '),
        );
      });
      return { lines, restore: () => spy.mockRestore() };
    }

    function firstUuid(text: string): string {
      const match = UUID_PATTERN.exec(text);
      if (match === null) {
        throw new Error(`uuid ausente na saida do CLI: ${text.slice(0, 200)}`);
      }
      return match[0];
    }

    async function bootstrapAdmin(name: string): Promise<{ email: string; cookie: string }> {
      if (app === undefined) {
        throw new Error('app nao inicializado');
      }
      emailSeq += 1;
      const email = `cli-dono-${emailSeq}@exemplo.test`;
      const boot = await app.inject({ method: 'POST', url: '/api/v1/auth/invites' });
      expect(boot.statusCode).toBe(201);
      const bootBody = boot.json() as { inviteToken: string };
      const reg = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { name, email, password: PASSWORD, inviteToken: bootBody.inviteToken },
        headers: { 'content-type': 'application/json' },
      });
      expect(reg.statusCode).toBe(201);
      const cookieValue = sessionCookieOf(reg.headers);
      expect(cookieValue).not.toBeNull();
      return { email, cookie: cookieValue ?? '' };
    }

    async function cliLogin(email: string): Promise<void> {
      const cap = capture();
      try {
        await runAuthLogin(
          ['--email', email, '--password', PASSWORD, '--device', 'cli-headless'],
          G(),
        );
      } finally {
        cap.restore();
      }
    }

    async function setupChain(): Promise<{ projectId: string; searchId: string; runId: string }> {
      const { email } = await bootstrapAdmin('Dono CLI');
      await cliLogin(email);
      let cap = capture();
      let projectId = '';
      try {
        await runProjectCreate(['--title', 'Projeto Headless'], G());
        projectId = firstUuid(cap.lines.join('\n'));
      } finally {
        cap.restore();
      }
      cap = capture();
      let searchId = '';
      try {
        await runSearchCreate(
          ['--project', projectId, '--term', '"ensino de química"', '--sources', 'bdtd,capes'],
          G(),
        );
        searchId = firstUuid(cap.lines.join('\n'));
      } finally {
        cap.restore();
      }
      cap = capture();
      let runId = '';
      try {
        await runSearchRun(['--search', searchId, '--idempotency-key', `cli-k-${emailSeq}`], G());
        const text = cap.lines.join('\n');
        expect(text).toMatch(/succeeded|partial/);
        runId = firstUuid(text);
      } finally {
        cap.restore();
      }
      return { projectId, searchId, runId };
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
          console.warn('[cli-headless] PG inalcançavel no migrate — pulando integracao (offline).');
          return;
        }
        throw err;
      }
      if (APP_URL === undefined) {
        pgAvailable = false;
        return;
      }
      fakeHome = mkdtempSync(join(tmpdir(), 'uhhu-cli-headless-'));
      process.env['HOME'] = fakeHome;
      delete process.env['UHHU_TOKEN'];
      delete process.env['UHHU_API_URL'];
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
      // Porta efemera: nunca a 3000 (stale server de outra sessao).
      await instance.listen({ port: 0, host: '127.0.0.1' });
      const addr = instance.server.address();
      if (typeof addr !== 'object' || addr === null || typeof addr.port !== 'number') {
        throw new Error('listen sem porta atribuida');
      }
      baseUrl = `http://127.0.0.1:${addr.port}`;
      app = instance;
    }, 60000);

    afterAll(async () => {
      globalThis.fetch = ORIGINAL_FETCH;
      if (ORIG_HOME === undefined) {
        delete process.env['HOME'];
      } else {
        process.env['HOME'] = ORIG_HOME;
      }
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

    it('CLI-01: auth login via comando salva PAT 600 sem vazar o token', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[cli-headless] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { email } = await bootstrapAdmin('Dono Login');
      const cap = capture();
      try {
        await runAuthLogin(
          ['--email', email, '--password', PASSWORD, '--device', 'cli-headless'],
          G(),
        );
      } finally {
        cap.restore();
      }
      const text = cap.lines.join('\n');
      const credPath = join(fakeHome, '.config', 'uhhu', 'credentials.json');
      const mode = statSync(credPath).mode & 0o777;
      expect(mode).toBe(0o600);
      const stored: unknown = JSON.parse(readFileSync(credPath, 'utf8'));
      if (typeof stored !== 'object' || stored === null) {
        throw new Error('credentials.json ilegivel');
      }
      const token = (stored as Record<string, unknown>)['token'];
      expect(typeof token).toBe('string');
      expect((token as string).length).toBeGreaterThan(0);
      // T-05-03-LEAK: o PAT nunca aparece no stdout.
      expect(text).not.toContain(token as string);
      expect(text).toContain('Salvo em');
    });

    it('CLI-02: project create + list --json contem o projeto', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[cli-headless] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { email } = await bootstrapAdmin('Dono Projeto');
      await cliLogin(email);
      let cap = capture();
      try {
        await runProjectCreate(['--title', 'Projeto Headless'], G());
      } finally {
        cap.restore();
      }
      cap = capture();
      try {
        await runProjectList([], G({ json: true }));
      } finally {
        cap.restore();
      }
      const parsed: unknown = JSON.parse(cap.lines.join('\n'));
      const items: unknown = (parsed as { items: unknown }).items;
      expect(Array.isArray(items)).toBe(true);
      const titles = (items as Array<{ title: string }>).map((item) => item.title);
      expect(titles).toContain('Projeto Headless');
    });

    it('CLI-03: search create + run (fixtures) com resultados bdtd+capes', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[cli-headless] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { runId } = await setupChain();
      const cap = capture();
      try {
        await runRunResults(['--run', runId, '--limit', '20'], G());
      } finally {
        cap.restore();
      }
      const text = cap.lines.join('\n');
      expect(text).toContain('bdtd');
      expect(text).toContain('capes');
    });

    it('CLI-04: replay idempotente com a mesma key devolve o mesmo run', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[cli-headless] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { searchId, runId } = await setupChain();
      const cap = capture();
      try {
        await runSearchRun(['--search', searchId, '--idempotency-key', `cli-k-${emailSeq}`], G());
      } finally {
        cap.restore();
      }
      expect(firstUuid(cap.lines.join('\n'))).toBe(runId);
    });

    it('CLI-05: group list + result decide eligible + corpus get', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[cli-headless] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { projectId } = await setupChain();
      let cap = capture();
      let groupId = '';
      try {
        await runGroupList(['--project', projectId], G());
        groupId = firstUuid(cap.lines.join('\n'));
      } finally {
        cap.restore();
      }
      cap = capture();
      try {
        await runResultDecide(['--result', groupId, '--decision', 'eligible'], G({ json: true }));
      } finally {
        cap.restore();
      }
      const decided: unknown = JSON.parse(cap.lines.join('\n'));
      expect((decided as { decision: string }).decision).toBe('eligible');
      cap = capture();
      try {
        await runCorpusGet(['--project', projectId], G());
      } finally {
        cap.restore();
      }
      expect(cap.lines.join('\n')).toContain(groupId);
    });

    it('CLI-06: export json salva corpus-*.json parseavel com projectId', async () => {
      if (!pgAvailable || app === undefined) {
        console.warn('[cli-headless] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const { projectId } = await setupChain();
      const outDir = mkdtempSync(join(tmpdir(), 'uhhu-cli-export-'));
      const cap = capture();
      try {
        await runExport(['--project', projectId, '--format', 'json', '--out', outDir], G());
      } finally {
        cap.restore();
      }
      expect(cap.lines.join('\n')).toMatch(/Salvo: .* \(\d+ bytes\)/);
      const files = readdirSync(outDir).filter(
        (name) => name.startsWith('corpus-') && name.endsWith('.json'),
      );
      expect(files).toHaveLength(1);
      const saved: unknown = JSON.parse(readFileSync(join(outDir, files[0] ?? ''), 'utf8'));
      expect(JSON.stringify(saved)).toContain(projectId);
    });

    it(
      'CLI-07: filho sem DATABASE_URL lista projetos e job get mostra terminal',
      { timeout: 150000 },
      async () => {
        if (!pgAvailable || app === undefined) {
          console.warn('[cli-headless] PG inalcançavel — teste pulado (offline).');
          return;
        }
        const { runId } = await setupChain();
        // PAT do arquivo (HOME fake); o filho recebe so BASE_URL + PAT —
        // nenhuma variavel *DATABASE* entra no env (prova T-05-03-BYPASS).
        const stored: unknown = JSON.parse(
          readFileSync(join(fakeHome, '.config', 'uhhu', 'credentials.json'), 'utf8'),
        );
        const pat = (stored as Record<string, unknown>)['token'];
        expect(typeof pat).toBe('string');
        const childEnv: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (typeof value === 'string' && !key.includes('DATABASE')) {
            childEnv[key] = value;
          }
        }
        childEnv['UHHU_TOKEN'] = pat as string;
        childEnv['UHHU_API_URL'] = baseUrl;
        expect(Object.keys(childEnv).some((key) => key.includes('DATABASE'))).toBe(false);

        const help = await execFileAsync('node', [CLI_WRAPPER, '--help'], {
          env: childEnv,
          cwd: ROOT,
          timeout: 90000,
        });
        expect(help.stdout).toContain('uhhu');

        const listed = await execFileAsync('node', [CLI_WRAPPER, 'project', 'list', '--json'], {
          env: childEnv,
          cwd: ROOT,
          timeout: 90000,
        });
        expect(listed.stdout).toContain('Projeto Headless');

        const cap = capture();
        try {
          await runJobGet(['--job', runId], G());
        } finally {
          cap.restore();
        }
        expect(cap.lines.join('\n')).toMatch(/succeeded|partial/);
      },
    );
  },
);
