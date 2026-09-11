// tests/smoke — CLI unitario: parse/store/tabela/client/guard (Phase 5, D-62/D-64–D-66).
//
// Sem PG e sem rede: `fetch` sempre mockado via `vi.stubGlobal`; HOME fake em
// tmpdir para o auth-store (os.homedir respeita $HOME no POSIX); NUNCA importa
// `uhhu.ts` (o top-level `void run()` leria o argv do vitest). Zero `any`.

import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliApiError, apiFetch, waitForJob } from '../../apps/cli/src/client.js';
import {
  CliAuthError,
  clearToken,
  credentialsPath,
  loadToken,
  saveToken,
} from '../../apps/cli/src/auth-store.js';
import { exitCodeForStatus, parseArgs, runSearchRun } from '../../apps/cli/src/commands.js';
import { printJson, printTable } from '../../apps/cli/src/table.js';

const ORIG_HOME = process.env['HOME'];
const ORIG_TOKEN = process.env['UHHU_TOKEN'];
const ORIG_API_URL = process.env['UHHU_API_URL'];

function makeHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'uhhu-cli-smoke-'));
  process.env['HOME'] = dir;
  return dir;
}

function errorEnvelopeJson(code: string, message: string, requestId: string): string {
  return JSON.stringify({ error: { code, message, details: {}, requestId } });
}

function jsonResponse(
  body: string,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json', ...(extraHeaders ?? {}) },
  });
}

beforeEach(() => {
  delete process.env['UHHU_TOKEN'];
  delete process.env['UHHU_API_URL'];
  makeHome();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
});

describe('table', () => {
  it('printTable alinha colunas com padEnd e contem header + linhas', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map((part) => String(part)).join(' '));
    });
    printTable(
      ['a', 'bb'],
      [
        ['x', 'yy'],
        ['zzz', 'w'],
      ],
    );
    spy.mockRestore();
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('a    bb');
    expect(lines[1]).toBe('x    yy');
    expect(lines[2]).toBe('zzz  w');
  });

  it('printJson sai JSON puro com 2 espacos, sem prefixo humano', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map((part) => String(part)).join(' '));
    });
    printJson({ id: 'abc', n: 2 });
    spy.mockRestore();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(JSON.stringify({ id: 'abc', n: 2 }, null, 2));
  });
});

describe('auth-store (HOME fake)', () => {
  it('UHHU_TOKEN precede o arquivo (from env)', async () => {
    await saveToken('http://127.0.0.1:3000', 'tok-arquivo');
    process.env['UHHU_TOKEN'] = 'tok-env-123';
    const loaded = await loadToken();
    expect(loaded.token).toBe('tok-env-123');
    expect(loaded.from).toBe('env');
  });

  it('H-02: base salva e usada quando UHHU_TOKEN esta setado (sem UHHU_API_URL/--api)', async () => {
    await saveToken('https://staging.exemplo.test', 'tok-arquivo');
    process.env['UHHU_TOKEN'] = 'tok-env-123';
    const loaded = await loadToken();
    expect(loaded.token).toBe('tok-env-123');
    expect(loaded.from).toBe('env');
    expect(loaded.baseUrl).toBe('https://staging.exemplo.test');
  });

  it('H-02: precedencia UHHU_API_URL > --api > base salva > default com token do env', async () => {
    await saveToken('https://staging.exemplo.test', 'tok-arquivo');
    process.env['UHHU_TOKEN'] = 'tok-env-123';
    // So salva → salva.
    expect((await loadToken()).baseUrl).toBe('https://staging.exemplo.test');
    // --api vence salva.
    expect((await loadToken('https://api-flag.exemplo.test')).baseUrl).toBe(
      'https://api-flag.exemplo.test',
    );
    // UHHU_API_URL vence tudo.
    process.env['UHHU_API_URL'] = 'https://env.exemplo.test';
    expect((await loadToken('https://api-flag.exemplo.test')).baseUrl).toBe(
      'https://env.exemplo.test',
    );
    expect((await loadToken()).baseUrl).toBe('https://env.exemplo.test');
  });

  it('H-02: sem arquivo e sem UHHU_API_URL, token do env cai no default', async () => {
    process.env['UHHU_TOKEN'] = 'tok-env-123';
    const loaded = await loadToken();
    expect(loaded.baseUrl).toBe('http://127.0.0.1:3000');
  });

  it('saveToken cria arquivo com mode 0o600 e loadToken le do arquivo', async () => {
    const path = await saveToken('http://127.0.0.1:3001', 'tok-arquivo-456');
    expect(path).toBe(credentialsPath());
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
    const loaded = await loadToken();
    expect(loaded.token).toBe('tok-arquivo-456');
    expect(loaded.baseUrl).toBe('http://127.0.0.1:3001');
    expect(loaded.from).toBe('file');
  });

  it('M-01: arquivo afrouxado (644) falha alto na leitura em vez de usar o PAT', async () => {
    const { chmodSync } = await import('node:fs');
    const path = await saveToken('http://127.0.0.1:3000', 'tok-600');
    chmodSync(path, 0o644);
    await expect(loadToken()).rejects.toThrow(/permissão insegura/);
  });

  it('saveToken nunca devolve o token (so o path)', async () => {
    const path = await saveToken('http://127.0.0.1:3000', 'segredo-total');
    expect(path).not.toContain('segredo-total');
    expect(path).toContain('credentials.json');
  });

  it('clearToken e idempotente; sem credencial, loadToken lanca CliAuthError', async () => {
    await saveToken('http://127.0.0.1:3000', 'tok-x');
    await clearToken();
    await clearToken();
    await expect(loadToken()).rejects.toBeInstanceOf(CliAuthError);
  });

  it('arquivo corrompido vira CliAuthError pedindo novo login', async () => {
    const { chmodSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(credentialsPath()), { recursive: true });
    writeFileSync(credentialsPath(), '{json quebrado', 'utf8');
    // M-01: o stat de permissao roda antes do parse — fixa 600 para exercitar
    // o caminho de JSON invalido (e nao o de permissao insegura).
    chmodSync(credentialsPath(), 0o600);
    await expect(loadToken()).rejects.toThrow(/login/);
  });

  it('M-02: UHHU_TOKEN com newline/espaco e aparado (paridade com MCP)', async () => {
    process.env['UHHU_TOKEN'] = 'tok-env-trim  \n';
    const loaded = await loadToken();
    expect(loaded.token).toBe('tok-env-trim');
    expect(loaded.from).toBe('env');
  });

  it('M-02: UHHU_TOKEN so com espacos e tratado como ausente', async () => {
    await saveToken('http://127.0.0.1:3001', 'tok-arquivo-789');
    process.env['UHHU_TOKEN'] = '   \n';
    const loaded = await loadToken();
    expect(loaded.from).toBe('file');
    expect(loaded.token).toBe('tok-arquivo-789');
  });

  it('M-02: UHHU_API_URL com espacos e aparado', async () => {
    process.env['UHHU_TOKEN'] = 'tok-env-123';
    process.env['UHHU_API_URL'] = '  https://env-trim.exemplo.test  ';
    const loaded = await loadToken();
    expect(loaded.baseUrl).toBe('https://env-trim.exemplo.test');
  });
});

describe('client apiFetch', () => {
  it('envelope 404 vira CliApiError com code NOT_FOUND verbatim', async () => {
    const seen: Array<{ url: string; auth: string; rid: string }> = [];
    vi.stubGlobal('fetch', async (input: unknown, init: unknown): Promise<Response> => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      let auth = '';
      let rid = '';
      if (typeof init === 'object' && init !== null && 'headers' in init) {
        const headers = (init as { headers: Record<string, string> }).headers;
        auth = headers['Authorization'] ?? '';
        rid = headers['X-Request-Id'] ?? '';
      }
      seen.push({ url, auth, rid });
      return jsonResponse(errorEnvelopeJson('NOT_FOUND', 'Recurso não encontrado.', 'r-1'), 404);
    });
    const err: unknown = await apiFetch('/api/v1/projects/x', {
      baseUrl: 'http://127.0.0.1:3000',
      token: 'tok-abc',
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(CliApiError);
    if (err instanceof CliApiError) {
      expect(err.status).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('Recurso não encontrado.');
      expect(err.requestId).toBe('r-1');
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]?.auth).toBe('Bearer tok-abc');
    expect(seen[0]?.rid.length).toBeGreaterThan(0);
  });

  it('Idempotency-Key so vai quando dado', async () => {
    const keys: Array<string | undefined> = [];
    vi.stubGlobal('fetch', async (_input: unknown, init: unknown): Promise<Response> => {
      let key: string | undefined = undefined;
      if (typeof init === 'object' && init !== null && 'headers' in init) {
        const headers = (init as { headers: Record<string, string> }).headers;
        key = headers['Idempotency-Key'];
      }
      keys.push(key);
      return jsonResponse('{"ok":true}', 200);
    });
    await apiFetch('/a', { baseUrl: 'http://x', token: 't', idempotencyKey: 'k-1' });
    await apiFetch('/a', { baseUrl: 'http://x', token: 't' });
    expect(keys).toEqual(['k-1', undefined]);
  });

  it('202 com corpo JSON devolve o run corrente (polling decide depois)', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> =>
      jsonResponse(JSON.stringify({ id: 'run-1', status: 'running' }), 202),
    );
    const res = await apiFetch<{ id: string; status: string }>('/api/v1/lab/searches/s/runs', {
      baseUrl: 'http://127.0.0.1:3000',
      token: 't',
      method: 'POST',
      body: {},
    });
    expect(res.status).toBe(202);
    expect(res.data.id).toBe('run-1');
  });

  it('falha de rede vira CliApiError de transporte (status 0, exit 1)', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> => {
      throw new Error('ECONNREFUSED');
    });
    const err: unknown = await apiFetch('/api/v1/projects', {
      baseUrl: 'http://127.0.0.1:3000',
      token: 't',
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(CliApiError);
    if (err instanceof CliApiError) {
      expect(err.status).toBe(0);
      expect(exitCodeForStatus(err.status)).toBe(1);
    }
  });

  it('export bruto: filename do content-disposition + corpo verbatim', async () => {
    vi.stubGlobal(
      'fetch',
      async (): Promise<Response> =>
        new Response('a,b\n1,2\n', {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="corpus-p1-20260911.csv"',
          },
        }),
    );
    const res = await apiFetch<string>('/api/v1/lab/projects/p1/export?format=csv', {
      baseUrl: 'http://127.0.0.1:3000',
      token: 't',
      raw: true,
    });
    expect(res.filename).toBe('corpus-p1-20260911.csv');
    expect(res.data).toBe('a,b\n1,2\n');
  });
});

describe('client waitForJob', () => {
  it('resolve no estado terminal e imprime transicoes com -v no stderr', async () => {
    const queue = ['running', 'running', 'succeeded'];
    vi.stubGlobal('fetch', async (): Promise<Response> => {
      const status = queue.shift() ?? 'succeeded';
      return jsonResponse(
        JSON.stringify({
          id: 'job-1',
          type: 'lab.search.execute',
          status,
          progress: null,
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
          resultRef: null,
          error: null,
        }),
        200,
      );
    });
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const job = await waitForJob('job-1', {
      baseUrl: 'http://127.0.0.1:3000',
      token: 't',
      pollIntervalMs: 5,
      timeoutMs: 5000,
      verbose: true,
    });
    spy.mockRestore();
    expect(job.status).toBe('succeeded');
    expect(writes.join('')).toContain('job job-1: running');
    expect(writes.join('')).toContain('job job-1: succeeded');
  });

  it('estoura timeout com mensagem PT-BR', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> =>
      jsonResponse(
        JSON.stringify({
          id: 'job-9',
          type: 'lab.search.execute',
          status: 'running',
          progress: null,
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
          resultRef: null,
          error: null,
        }),
        200,
      ),
    );
    await expect(
      waitForJob('job-9', {
        baseUrl: 'http://127.0.0.1:3000',
        token: 't',
        pollIntervalMs: 10,
        timeoutMs: 60,
      }),
    ).rejects.toThrow(/Timeout após/);
  });
});

describe('commands puros', () => {
  it('parseArgs entende --flag valor, --flag=valor, bool e posicionais', () => {
    // Nota: so as flags globais (--json/-v/--help) sao booleanas puras e o
    // parseGlobals nunca consome valor para elas; aqui, flag desconhecida
    // seguida de token sem traco e valor (todos os comandos so tem flags).
    const parsed = parseArgs(['run', 'extra', '--search', 'abc', '--limit=5', '--flag']);
    expect(parsed.positionals).toEqual(['run', 'extra']);
    expect(parsed.flags.get('search')).toBe('abc');
    expect(parsed.flags.get('limit')).toBe('5');
    expect(parsed.flags.get('flag')).toBe(true);
  });

  it('exitCodeForStatus mapeia 401/403→3, 404→4, 400/422→2, 429→5, 5xx→1', () => {
    expect(exitCodeForStatus(401)).toBe(3);
    expect(exitCodeForStatus(403)).toBe(3);
    expect(exitCodeForStatus(404)).toBe(4);
    expect(exitCodeForStatus(400)).toBe(2);
    expect(exitCodeForStatus(422)).toBe(2);
    expect(exitCodeForStatus(429)).toBe(5);
    expect(exitCodeForStatus(500)).toBe(1);
    expect(exitCodeForStatus(0)).toBe(1);
  });

  it('guard: package.json do cli sem @uhhu/db (defesa em profundidade D-55)', () => {
    const raw = readFileSync(join(process.cwd(), 'apps/cli/package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    expect(parsed).toBeTypeOf('object');
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('package.json do cli ilegivel');
    }
    const record = parsed as Record<string, unknown>;
    const names: string[] = [];
    for (const fieldName of ['dependencies', 'devDependencies']) {
      const deps: unknown = record[fieldName];
      if (typeof deps === 'object' && deps !== null) {
        names.push(...Object.keys(deps as Record<string, unknown>));
      }
    }
    expect(names).not.toContain('@uhhu/db');
    expect(names).not.toContain('drizzle-orm');
    expect(names).not.toContain('pg');
    expect(names).not.toContain('postgres');
  });
});

describe('commands runSearchRun fast path (H-01)', () => {
  it('201 failed vira CliApiError 500 (exit 1) — paridade com o polling 202', async () => {
    process.env['UHHU_TOKEN'] = 'tok-h01';
    vi.stubGlobal('fetch', async (): Promise<Response> =>
      jsonResponse(
        JSON.stringify({
          id: 'run-fast-failed',
          status: 'failed',
          error: { code: 'SOURCE_FAILED', message: 'Fonte falhou.' },
        }),
        201,
      ),
    );
    const err: unknown = await runSearchRun(['--search', 'search-1'], {
      json: true,
      verbose: false,
      timeoutMs: 60000,
      baseUrl: 'http://127.0.0.1:3000',
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(CliApiError);
    if (err instanceof CliApiError) {
      expect(err.status).toBe(500);
      expect(err.code).toBe('SOURCE_FAILED');
      expect(exitCodeForStatus(err.status)).toBe(1);
    }
  });

  it('201 cancelled vira CliApiError 500 com fallback RUN_FAILED', async () => {
    process.env['UHHU_TOKEN'] = 'tok-h01';
    vi.stubGlobal('fetch', async (): Promise<Response> =>
      jsonResponse(JSON.stringify({ id: 'run-fast-cancelled', status: 'cancelled' }), 201),
    );
    const err: unknown = await runSearchRun(['--search', 'search-1'], {
      json: true,
      verbose: false,
      timeoutMs: 60000,
      baseUrl: 'http://127.0.0.1:3000',
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(CliApiError);
    if (err instanceof CliApiError) {
      expect(err.status).toBe(500);
      expect(err.code).toBe('RUN_FAILED');
    }
  });

  it('201 succeeded nao lanca (exit 0)', async () => {
    process.env['UHHU_TOKEN'] = 'tok-h01';
    vi.stubGlobal('fetch', async (): Promise<Response> =>
      jsonResponse(JSON.stringify({ id: 'run-fast-ok', status: 'succeeded', error: null }), 201),
    );
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map((part) => String(part)).join(' '));
    });
    try {
      await runSearchRun(['--search', 'search-1'], {
        json: true,
        verbose: false,
        timeoutMs: 60000,
        baseUrl: 'http://127.0.0.1:3000',
      });
    } finally {
      spy.mockRestore();
    }
    expect(lines.join('\n')).toContain('run-fast-ok');
  });
});
