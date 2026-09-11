// tests/smoke — contrato das tools MCP (05-04, D-67/D-68/D-69/D-70).
//
// Sem PG, sem rede: o `fetch` global é stubado por teste. Cobre: (a) lista
// com exatamente os 11 nomes verbatim; (b) cada tool com efeito SEM
// `confirm:true` rejeita com `confirm_required` e NÃO chama fetch;
// (c) com confirm, cada tool chama o path REST esperado; (d) descriptions
// com Efeitos+Proveniência+Limites; (e) guard sem-db de apps/mcp
// (package.json + varredura src, molde do guard 05-01); (f) erro 404 da API
// vira erro com requestId, sem stack/token. Zero `any`.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOL_DEFINITIONS, TOOL_NAMES, callTool } from '../../apps/mcp/src/tools.js';
import { McpToolError } from '../../apps/mcp/src/mcp-client.js';

const ROOT = process.cwd();
const FAKE_TOKEN = 'tok-fake-para-smoke-sem-rede';
const FAKE_API_URL = 'http://127.0.0.1:9';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SEARCH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RUN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const GROUP_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const EXPECTED_TOOLS = [
  'lab_create_project',
  'lab_list_projects',
  'lab_create_search',
  'lab_execute_search',
  'lab_get_run',
  'lab_list_results',
  'lab_set_result_decision',
  'lab_get_corpus',
  'lab_export_project',
  'lab_list_sources',
  'lab_get_source_health',
];

const EFFECT_TOOLS: Array<{ name: string; args: Record<string, unknown> }> = [
  { name: 'lab_create_project', args: { title: 'Projeto X' } },
  {
    name: 'lab_create_search',
    args: { projectId: PROJECT_ID, term: 'química' },
  },
  { name: 'lab_execute_search', args: { searchId: SEARCH_ID } },
  {
    name: 'lab_set_result_decision',
    args: { groupId: GROUP_ID, decision: 'eligible' },
  },
  { name: 'lab_export_project', args: { projectId: PROJECT_ID, format: 'csv' } },
];

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

function jsonRes(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function errRes(code: string, message: string, requestId: string, status: number): Response {
  return jsonRes({ error: { code, message, details: {}, requestId } }, status);
}

// Stub de fetch com gravador de chamadas (o client do MCP usa o fetch
// global; aqui nenhuma chamada sai do processo).
function installFetch(handler: (call: RecordedCall) => Response): RecordedCall[] {
  const calls: RecordedCall[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown = undefined;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body) as unknown;
      } catch {
        body = init.body;
      }
    }
    const call: RecordedCall = { url, method, body };
    calls.push(call);
    return handler(call);
  };
  vi.stubGlobal('fetch', fake);
  return calls;
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

const ORIG_TOKEN = process.env['UHHU_TOKEN'];
const ORIG_API_URL = process.env['UHHU_API_URL'];

beforeEach(() => {
  process.env['UHHU_TOKEN'] = FAKE_TOKEN;
  process.env['UHHU_API_URL'] = FAKE_API_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
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

describe('mcp tools — contrato', () => {
  it('expõe exatamente as 11 tools com os nomes verbatim', () => {
    expect([...TOOL_NAMES].sort()).toEqual([...EXPECTED_TOOLS].sort());
    expect(TOOL_DEFINITIONS.map((def) => def.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  it('lab_create_project sem confirm rejeita confirm_required sem fetch', async () => {
    const calls = installFetch(() => jsonRes({}));
    const err: unknown = await callTool('lab_create_project', { title: 'Projeto X' }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(McpToolError);
    if (err instanceof McpToolError) {
      expect(err.code).toBe('confirm_required');
      expect(err.message).toContain('confirm:true');
    }
    expect(calls.length).toBe(0);
  });

  it('lab_create_search sem confirm rejeita confirm_required sem fetch', async () => {
    const calls = installFetch(() => jsonRes({}));
    const err: unknown = await callTool('lab_create_search', {
      projectId: PROJECT_ID,
      term: 'química',
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(McpToolError);
    if (err instanceof McpToolError) {
      expect(err.code).toBe('confirm_required');
    }
    expect(calls.length).toBe(0);
  });

  it('lab_execute_search sem confirm rejeita confirm_required sem fetch', async () => {
    const calls = installFetch(() => jsonRes({}));
    const err: unknown = await callTool('lab_execute_search', { searchId: SEARCH_ID }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(McpToolError);
    if (err instanceof McpToolError) {
      expect(err.code).toBe('confirm_required');
    }
    expect(calls.length).toBe(0);
  });

  it('lab_set_result_decision sem confirm rejeita confirm_required sem fetch', async () => {
    const calls = installFetch(() => jsonRes({}));
    const err: unknown = await callTool('lab_set_result_decision', {
      groupId: GROUP_ID,
      decision: 'eligible',
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(McpToolError);
    if (err instanceof McpToolError) {
      expect(err.code).toBe('confirm_required');
    }
    expect(calls.length).toBe(0);
  });

  it('lab_export_project sem confirm rejeita confirm_required sem fetch', async () => {
    const calls = installFetch(() => jsonRes({}));
    const err: unknown = await callTool('lab_export_project', {
      projectId: PROJECT_ID,
      format: 'csv',
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(McpToolError);
    if (err instanceof McpToolError) {
      expect(err.code).toBe('confirm_required');
    }
    expect(calls.length).toBe(0);
  });

  it('confirm:false explícito também rejeita sem fetch', async () => {
    const calls = installFetch(() => jsonRes({}));
    const err: unknown = await callTool('lab_create_project', {
      title: 'Projeto X',
      confirm: false,
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(McpToolError);
    if (err instanceof McpToolError) {
      expect(err.code).toBe('confirm_required');
    }
    expect(calls.length).toBe(0);
  });

  it('lab_create_project com confirm chama POST /api/v1/projects', async () => {
    const calls = installFetch(() => jsonRes({ id: PROJECT_ID, title: 'Projeto X' }, 201));
    const out = await callTool('lab_create_project', { title: 'Projeto X', confirm: true });
    expect(calls.length).toBe(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toContain('/api/v1/projects');
    expect(reqString(reqRecord(out, 'projeto'), 'id', 'projeto')).toBe(PROJECT_ID);
  });

  it('lab_list_projects com paginação chama GET /api/v1/projects', async () => {
    const calls = installFetch(() =>
      jsonRes({ items: [], page: { limit: 20, nextCursor: null, hasMore: false } }),
    );
    await callTool('lab_list_projects', { limit: 20 });
    expect(calls.length).toBe(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toContain('/api/v1/projects?');
    expect(calls[0]?.url).toContain('limit=20');
  });

  it('lab_create_search com confirm chama POST /api/v1/lab/searches', async () => {
    const calls = installFetch(() => jsonRes({ id: SEARCH_ID }, 201));
    await callTool('lab_create_search', {
      projectId: PROJECT_ID,
      term: 'química',
      confirm: true,
    });
    expect(calls.length).toBe(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toContain('/api/v1/lab/searches');
  });

  it('lab_execute_search 201 retorna o run direto', async () => {
    const calls = installFetch(() => jsonRes({ id: RUN_ID, status: 'succeeded' }, 201));
    const out = await callTool('lab_execute_search', { searchId: SEARCH_ID, confirm: true });
    expect(reqString(reqRecord(out, 'run'), 'status', 'run')).toBe('succeeded');
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toContain(`/api/v1/lab/searches/${SEARCH_ID}/runs`);
  });

  it('lab_execute_search 202 faz polling em jobs e lê o run final', async () => {
    const calls = installFetch((call) => {
      if (call.url.includes('/api/v1/jobs/')) {
        return jsonRes({ id: RUN_ID, status: 'succeeded' });
      }
      if (call.url.includes(`/api/v1/lab/runs/${RUN_ID}`)) {
        return jsonRes({ id: RUN_ID, status: 'succeeded' });
      }
      return jsonRes({ id: RUN_ID, status: 'running' }, 202);
    });
    const out = await callTool('lab_execute_search', { searchId: SEARCH_ID, confirm: true });
    expect(reqString(reqRecord(out, 'run'), 'status', 'run')).toBe('succeeded');
    expect(calls.some((call) => call.url.includes('/api/v1/jobs/'))).toBe(true);
    expect(calls.some((call) => call.url.includes(`/api/v1/lab/runs/${RUN_ID}`))).toBe(true);
  });

  it('lab_get_run chama GET /api/v1/lab/runs/:runId', async () => {
    const calls = installFetch(() => jsonRes({ id: RUN_ID, status: 'succeeded' }));
    await callTool('lab_get_run', { runId: RUN_ID });
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toContain(`/api/v1/lab/runs/${RUN_ID}`);
  });

  it('lab_list_results chama GET results com paginação verbatim', async () => {
    const calls = installFetch(() =>
      jsonRes({
        items: [],
        page: { limit: 20, nextCursor: null, hasMore: false },
        total: 0,
        newCount: 0,
      }),
    );
    const out = await callTool('lab_list_results', { runId: RUN_ID, limit: 20 });
    expect(calls[0]?.url).toContain(`/api/v1/lab/runs/${RUN_ID}/results`);
    const page = reqRecord(reqRecord(out, 'lista')['page'], 'lista.page');
    expect(typeof page['hasMore']).toBe('boolean');
  });

  it('lab_set_result_decision com confirm chama PUT decision', async () => {
    const calls = installFetch(() => jsonRes({ id: GROUP_ID, decision: 'eligible' }));
    const out = await callTool('lab_set_result_decision', {
      groupId: GROUP_ID,
      decision: 'eligible',
      confirm: true,
    });
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.url).toContain(`/api/v1/lab/groups/${GROUP_ID}/decision`);
    expect(reqString(reqRecord(out, 'grupo'), 'decision', 'grupo')).toBe('eligible');
  });

  it('lab_get_corpus chama GET /api/v1/lab/projects/:id/corpus', async () => {
    const calls = installFetch(() =>
      jsonRes({ items: [], page: { limit: 20, nextCursor: null, hasMore: false } }),
    );
    await callTool('lab_get_corpus', { projectId: PROJECT_ID });
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toContain(`/api/v1/lab/projects/${PROJECT_ID}/corpus`);
  });

  it('lab_export_project csv retorna referência rotulada com filename do servidor', async () => {
    const calls = installFetch(
      () =>
        new Response('titulo;ano\nA;2020\n', {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="corpus-teste.csv"',
          },
        }),
    );
    const out = await callTool('lab_export_project', {
      projectId: PROJECT_ID,
      format: 'csv',
      confirm: true,
    });
    expect(calls[0]?.url).toContain(`/api/v1/lab/projects/${PROJECT_ID}/export`);
    const ref = reqRecord(out, 'exportação');
    expect(reqString(ref, 'filename', 'exportação')).toBe('corpus-teste.csv');
    expect(typeof ref['contentText']).toBe('string');
    expect(typeof ref['sizeBytes']).toBe('number');
  });

  it('lab_export_project json retorna contentJson parseado', async () => {
    installFetch(() => jsonRes([{ titulo: 'A' }], 200, { 'content-type': 'application/json' }));
    const out = await callTool('lab_export_project', {
      projectId: PROJECT_ID,
      format: 'json',
      confirm: true,
    });
    const ref = reqRecord(out, 'exportação');
    expect(Array.isArray(ref['contentJson'])).toBe(true);
    expect(reqString(ref, 'filename', 'exportação').startsWith('corpus-')).toBe(true);
  });

  it('lab_list_sources chama GET /api/v1/lab/sources', async () => {
    const calls = installFetch(() => jsonRes([{ name: 'bdtd' }, { name: 'capes' }]));
    const out = await callTool('lab_list_sources', {});
    expect(calls[0]?.url).toContain('/api/v1/lab/sources');
    expect(Array.isArray(out)).toBe(true);
  });

  it('lab_get_source_health chama GET /api/v1/lab/sources/:name/health', async () => {
    const calls = installFetch(() =>
      jsonRes({ source: 'bdtd', status: 'ok', checkedAt: 'x', recent: {} }),
    );
    await callTool('lab_get_source_health', { source: 'bdtd' });
    expect(calls[0]?.url).toContain('/api/v1/lab/sources/bdtd/health');
  });

  it('toda description declara Efeitos, Proveniência e Limites', () => {
    expect(TOOL_DEFINITIONS.length).toBe(11);
    for (const def of TOOL_DEFINITIONS) {
      expect(def.description, def.name).toContain('Efeitos:');
      expect(def.description, def.name).toContain('Proveniência:');
      expect(def.description, def.name).toContain('Limites:');
    }
  });

  it('apps/mcp sem dependência nem import de banco (guard D-55 lado MCP)', () => {
    const pkgPath = join(ROOT, 'apps/mcp/package.json');
    expect(existsSync(pkgPath)).toBe(true);
    const parsed: unknown = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const record = reqRecord(parsed, 'package.json');
    const names: string[] = [];
    for (const field of ['dependencies', 'devDependencies'] as const) {
      const deps: unknown = record[field];
      if (typeof deps === 'object' && deps !== null) {
        names.push(...Object.keys(deps as Record<string, unknown>));
      }
    }
    for (const forbidden of ['@uhhu/db', 'drizzle-orm', 'postgres', 'pg']) {
      expect(names, `apps/mcp depende de ${forbidden}`).not.toContain(forbidden);
    }
    const srcDir = join(ROOT, 'apps/mcp/src');
    const files: string[] = readdirSync(srcDir).filter((entry) => {
      const full = join(srcDir, entry);
      return entry.endsWith('.ts') && statSync(full).isFile();
    });
    expect(files.length).toBeGreaterThan(0);
    for (const entry of files) {
      const body = readFileSync(join(srcDir, entry), 'utf8');
      expect(body, entry).not.toContain('@uhhu/db');
      expect(body, entry).not.toContain('drizzle-orm');
      expect(body, entry).not.toMatch(/CREATE\s+TABLE/i);
      expect(body, entry).not.toMatch(/\bSELECT\b.+?\bFROM\b/is);
    }
  });

  it('erro 404 da API vira erro com requestId, sem stack nem token', async () => {
    installFetch(() => errRes('NOT_FOUND', 'Recurso não encontrado.', 'req-123', 404));
    const err: unknown = await callTool('lab_get_run', { runId: RUN_ID }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(McpToolError);
    if (err instanceof McpToolError) {
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('Recurso não encontrado.');
      expect(err.requestId).toBe('req-123');
      const leaked = JSON.stringify({
        code: err.code,
        message: err.message,
        requestId: err.requestId,
      });
      expect(leaked).not.toContain(FAKE_TOKEN);
      expect(leaked).not.toContain('SELECT');
    } else {
      throw new Error('erro fora do tipo esperado');
    }
  });

  it('tool desconhecida rejeita sem chamar a API', async () => {
    const calls = installFetch(() => jsonRes({}));
    const err: unknown = await callTool('lab_nope', {}).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(McpToolError);
    expect(calls.length).toBe(0);
  });
});

describe('mcp tools — confirm em todas as com efeito', () => {
  it.each(EFFECT_TOOLS)('$name exige confirm:true', async ({ name, args }) => {
    const calls = installFetch(() => jsonRes({}));
    const err: unknown = await callTool(name, args).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(McpToolError);
    if (err instanceof McpToolError) {
      expect(err.code).toBe('confirm_required');
    }
    expect(calls.length).toBe(0);
  });
});
