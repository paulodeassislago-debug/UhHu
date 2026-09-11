// apps/cli — comandos D-64 da cadeia total (contrato §18, D-54/D-64).
//
// Cada comando = validacao leve local + 1+ chamadas `apiFetch` (nunca PG,
// nunca SQL). Erros `CliApiError` sobem para o roteador (uhhu.ts), que
// imprime `Erro <CODE>: <message> (requestId <id>)` no stderr com exit por
// status. Nenhuma funcao aqui chama `process.exit` (testabilidade: a
// integracao importa estas funcoes direto).
//
// Comandos exatos D-64 (SEM renomear) + `project create` (mesmo padrao,
// exigido pela cadeia D-54): `auth login|logout`, `project list|create`,
// `lab search create|run`, `lab run results`, `lab result decide`,
// `lab export`, `job get` (+ `lab corpus get`, `lab search compare`,
// `lab source list` e o espelho Phase 4: groups/tags/divergencia/pin).

import { hostname } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CompareDTO,
  CorpusEntryDTO,
  DedupGroupDTO,
  JobDTO,
  PersonalAccessTokenCreated,
  ProjectDTO,
  ResultDTO,
  SearchDTO,
  SearchRunDTO,
} from '@uhhu/contracts';
import { CliApiError, apiFetch, waitForJob } from './client.js';
import { CliAuthError, clearToken, loadToken, saveToken } from './auth-store.js';
import { printJson, printTable } from './table.js';

export interface GlobalOptions {
  baseUrl?: string;
  json: boolean;
  verbose: boolean;
  idempotencyKey?: string;
  timeoutMs: number;
}

// Exit por status (documentado em --help e no README): 2xx=0, 401/403=3,
// 404=4, 422/400=2, 429=5, 5xx/rede/transporte=1.
export function exitCodeForStatus(status: number): number {
  if (status === 401 || status === 403) {
    return 3;
  }
  if (status === 404) {
    return 4;
  }
  if (status === 400 || status === 422) {
    return 2;
  }
  if (status === 429) {
    return 5;
  }
  return 1;
}

// Erro de uso (flag ausente/invalida, comando desconhecido): exit 2 com a
// dica de `--help` do comando no stderr (o roteador imprime).
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function field(value: unknown, key: string): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  return value[key];
}

function itemsOf(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  const items: unknown = field(value, 'items');
  if (Array.isArray(items)) {
    return items;
  }
  throw new CliApiError(0, 'INTERNAL_ERROR', 'Resposta da API fora do formato esperado.', '');
}

// Celula de tabela a partir de escalar/array/objeto (sem cor, sem `any`).
function cell(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cell(entry)).join(', ');
  }
  return JSON.stringify(value) ?? '-';
}

function short(value: unknown, max: number): string {
  const text = cell(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | boolean>;
}

// Parse manual de argv (zero deps): `--flag valor`, `--flag=valor` e
// `--flag` (bool). Flags desconhecidas passam (o servidor valida).
export function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  let index = 0;
  while (index < args.length) {
    const token = args[index] ?? '';
    if (token.startsWith('--') && token.length > 2) {
      const eq = token.indexOf('=');
      if (eq >= 0) {
        const name = token.slice(2, eq);
        flags.set(name, token.slice(eq + 1));
        index += 1;
        continue;
      }
      const name = token.slice(2);
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags.set(name, next);
        index += 2;
        continue;
      }
      flags.set(name, true);
      index += 1;
      continue;
    }
    positionals.push(token);
    index += 1;
  }
  return { positionals, flags };
}

function optFlag(parsed: ParsedArgs, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = parsed.flags.get(name);
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function reqFlag(parsed: ParsedArgs, usage: string, ...names: string[]): string {
  const value = optFlag(parsed, ...names);
  if (value === undefined) {
    throw new UsageError(`Flag obrigatória ausente: --${names[0] ?? ''}\n${usage}`);
  }
  return value;
}

function optEnum(
  parsed: ParsedArgs,
  allowed: readonly string[],
  usage: string,
  ...names: string[]
): string | undefined {
  const value = optFlag(parsed, ...names);
  if (value === undefined) {
    return undefined;
  }
  if (!allowed.includes(value)) {
    throw new UsageError(
      `Valor inválido para --${names[0] ?? ''}: ${value} (esperado: ${allowed.join('|')})\n${usage}`,
    );
  }
  return value;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value.length > 0) {
      search.set(key, value);
    }
  }
  const text = search.toString();
  return text.length > 0 ? `?${text}` : '';
}

interface Ctx {
  baseUrl: string;
  token: string;
}

async function ctx(globals: GlobalOptions): Promise<Ctx> {
  const loaded = await loadToken(globals.baseUrl);
  return { baseUrl: loaded.baseUrl, token: loaded.token };
}

function apiArgs(globals: GlobalOptions, creds: Ctx): {
  baseUrl: string;
  token: string;
  idempotencyKey?: string;
} {
  const out: { baseUrl: string; token: string; idempotencyKey?: string } = {
    baseUrl: creds.baseUrl,
    token: creds.token,
  };
  if (globals.idempotencyKey !== undefined) {
    out.idempotencyKey = globals.idempotencyKey;
  }
  return out;
}

function emit(globals: GlobalOptions, value: unknown, table: () => void): void {
  if (globals.json) {
    printJson(value);
    return;
  }
  table();
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

export const AUTH_LOGIN_USAGE =
  'Uso: uhhu auth login --email <e> --password <p> [--device <nome>] [--api <url>]';

export async function runAuthLogin(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const usage = AUTH_LOGIN_USAGE;
  const email = reqFlag(parsed, usage, 'email');
  const password = reqFlag(parsed, usage, 'password');
  const deviceName = optFlag(parsed, 'device') ?? hostname();
  const loaded = await loadToken(globals.baseUrl).catch((err: unknown) => {
    if (err instanceof CliAuthError) {
      return null;
    }
    throw err;
  });
  // M-02: trim por paridade com o MCP — env/flag com whitespace nao vira base
  // com espaco (falha de rede confusa).
  const flagBase =
    typeof globals.baseUrl === 'string' && globals.baseUrl.trim().length > 0
      ? globals.baseUrl.trim()
      : undefined;
  const envApiRaw = process.env['UHHU_API_URL'];
  const envApi =
    typeof envApiRaw === 'string' && envApiRaw.trim().length > 0 ? envApiRaw.trim() : undefined;
  const baseUrl = flagBase ?? envApi ?? loaded?.baseUrl ?? 'http://127.0.0.1:3000';
  const { data, status } = await apiFetch<PersonalAccessTokenCreated>('/api/v1/auth/token', {
    baseUrl,
    token: '',
    method: 'POST',
    body: { email, password, deviceName },
  });
  if (status !== 201) {
    throw new CliApiError(status, 'INTERNAL_ERROR', 'Resposta inesperada do servidor.', '');
  }
  const path = await saveToken(baseUrl, data.token);
  const shown = {
    id: data.id,
    deviceName: data.deviceName,
    createdAt: data.createdAt,
    lastSeenAt: data.lastSeenAt,
    expiresAt: data.expiresAt,
  };
  emit(globals, shown, () => {
    printTable(['id', 'dispositivo', 'expira em'], [[data.id, data.deviceName, data.expiresAt]]);
    console.log(`Salvo em ${path}`);
  });
}

export const AUTH_LOGOUT_USAGE = 'Uso: uhhu auth logout';

// `logout` revoga o PAT atual no servidor (POST /api/v1/auth/logout com
// Bearer) e apaga a credencial local. Sem a rota no servidor (404), segue e
// apaga o local com aviso. Sem credencial local = ok, exit 0.
export async function runAuthLogout(_args: string[], globals: GlobalOptions): Promise<void> {
  let creds: Ctx | null = null;
  try {
    creds = await ctx(globals);
  } catch (err) {
    if (!(err instanceof CliAuthError)) {
      throw err;
    }
  }
  if (creds !== null) {
    try {
      await apiFetch<unknown>('/api/v1/auth/logout', {
        baseUrl: creds.baseUrl,
        token: creds.token,
        method: 'POST',
      });
    } catch (err) {
      if (err instanceof CliApiError && err.status === 404) {
        process.stderr.write('Aviso: servidor sem rota de logout; credencial local apagada.\n');
      } else if (err instanceof CliApiError && (err.status === 401 || err.status === 403)) {
        process.stderr.write('Aviso: PAT já inválido no servidor; credencial local apagada.\n');
      } else {
        throw err;
      }
    }
  }
  await clearToken();
  if (globals.json) {
    printJson({ ok: true });
    return;
  }
  console.log('Sessão encerrada (credencial local apagada).');
}

// ---------------------------------------------------------------------------
// project
// ---------------------------------------------------------------------------

export const PROJECT_LIST_USAGE = 'Uso: uhhu project list [--limit <n>] [--status active|archived|all]';

export async function runProjectList(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const creds = await ctx(globals);
  const limit = optFlag(parsed, 'limit');
  const statusFilter = optEnum(parsed, ['active', 'archived', 'all'], PROJECT_LIST_USAGE, 'status');
  const { data } = await apiFetch<{ items: ProjectDTO[] }>(
    `/api/v1/projects${buildQuery({ limit, status: statusFilter })}`,
    { ...apiArgs(globals, creds), method: 'GET' },
  );
  const rows = itemsOf(data) as ProjectDTO[];
  emit(globals, data, () => {
    printTable(
      ['id', 'título', 'estado'],
      rows.map((project) => [project.id, project.title, project.status]),
    );
  });
}

export const PROJECT_CREATE_USAGE =
  'Uso: uhhu project create --title <título> [--question <pergunta>] [--description <texto>]';

export async function runProjectCreate(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const title = reqFlag(parsed, PROJECT_CREATE_USAGE, 'title');
  const researchQuestion = optFlag(parsed, 'question');
  const description = optFlag(parsed, 'description');
  const creds = await ctx(globals);
  const body: Record<string, string> = { title };
  if (researchQuestion !== undefined) {
    body['researchQuestion'] = researchQuestion;
  }
  if (description !== undefined) {
    body['description'] = description;
  }
  const { data } = await apiFetch<ProjectDTO>('/api/v1/projects', {
    ...apiArgs(globals, creds),
    method: 'POST',
    body,
  });
  emit(globals, data, () => {
    printTable(['id', 'título', 'estado'], [[data.id, data.title, data.status]]);
  });
}

// ---------------------------------------------------------------------------
// lab search
// ---------------------------------------------------------------------------

export const SEARCH_CREATE_USAGE =
  'Uso: uhhu lab search create --project <id> --term "<termo>" [--sources bdtd,capes] [--year-from <a>] [--year-to <a>] [--type masterThesis|doctoralThesis] [--area <a>] [--institution <i>] [--program <p>]';

export async function runSearchCreate(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const projectId = reqFlag(parsed, SEARCH_CREATE_USAGE, 'project');
  const term = reqFlag(parsed, SEARCH_CREATE_USAGE, 'term');
  const sourcesRaw = optFlag(parsed, 'sources');
  const yearFromRaw = optFlag(parsed, 'year-from');
  const yearToRaw = optFlag(parsed, 'year-to');
  const typeRaw = optFlag(parsed, 'type');
  const area = optFlag(parsed, 'area');
  const institution = optFlag(parsed, 'institution');
  const program = optFlag(parsed, 'program');
  const creds = await ctx(globals);
  const sources =
    sourcesRaw === undefined
      ? undefined
      : sourcesRaw
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
  const filters: Record<string, unknown> = {};
  if (yearFromRaw !== undefined) {
    const num = Number(yearFromRaw);
    if (!Number.isInteger(num)) {
      throw new UsageError(`--year-from inválido: ${yearFromRaw}\n${SEARCH_CREATE_USAGE}`);
    }
    filters['yearFrom'] = num;
  }
  if (yearToRaw !== undefined) {
    const num = Number(yearToRaw);
    if (!Number.isInteger(num)) {
      throw new UsageError(`--year-to inválido: ${yearToRaw}\n${SEARCH_CREATE_USAGE}`);
    }
    filters['yearTo'] = num;
  }
  if (typeRaw !== undefined) {
    filters['docTypes'] = typeRaw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  if (area !== undefined) {
    filters['area'] = area;
  }
  if (institution !== undefined) {
    filters['institution'] = institution;
  }
  if (program !== undefined) {
    filters['program'] = program;
  }
  const body: Record<string, unknown> = { projectId, term, filters };
  if (sources !== undefined) {
    body['sources'] = sources;
  }
  const { data } = await apiFetch<SearchDTO>('/api/v1/lab/searches', {
    ...apiArgs(globals, creds),
    method: 'POST',
    body,
  });
  emit(globals, data, () => {
    printTable(
      ['id', 'termo', 'fontes'],
      [[data.id, short(data.term, 50), data.sources.join(',')]],
    );
  });
}

export const SEARCH_RUN_USAGE = 'Uso: uhhu lab search run --search <id> [--idempotency-key <k>] [-v]';

function runMetricsTable(run: SearchRunDTO): void {
  const bdtd = run.metrics.perSource['bdtd'];
  const capes = run.metrics.perSource['capes'];
  printTable(
    ['run', 'estado', 'bdtd', 'capes', 'novos'],
    [
      [
        run.id,
        run.status,
        `${bdtd.returned}/${bdtd.total} (${bdtd.status})`,
        `${capes.returned}/${capes.total} (${capes.status})`,
        String(run.metrics.newCount),
      ],
    ],
  );
}

// POST runs: 201 = run final; 200 = replay idempotente; 202 = polling D-56 em
// GET /jobs/:id (Job=Run 1:1, o id do job e o id do run corrente).
// `failed|cancelled` apos o polling = exit 1 com o erro no stderr.
export async function runSearchRun(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const searchId = reqFlag(parsed, SEARCH_RUN_USAGE, 'search');
  const creds = await ctx(globals);
  const idempotencyKey = optFlag(parsed, 'idempotency-key') ?? globals.idempotencyKey;
  const base = { ...apiArgs(globals, creds), ...(idempotencyKey === undefined ? {} : { idempotencyKey }) };
  const { data, status } = await apiFetch<SearchRunDTO>(`/api/v1/lab/searches/${searchId}/runs`, {
    ...base,
    method: 'POST',
    body: {},
  });
  if (status === 202) {
    if (globals.verbose) {
      process.stderr.write(`run ${data.id}: ${data.status} (polling…)\n`);
    }
    const final = await waitForJob(data.id, {
      baseUrl: creds.baseUrl,
      token: creds.token,
      timeoutMs: globals.timeoutMs,
      verbose: globals.verbose,
    });
    if (final.status === 'failed' || final.status === 'cancelled') {
      const code = final.error?.code ?? 'RUN_FAILED';
      const message = final.error?.message ?? 'Execução terminou sem sucesso.';
      throw new CliApiError(500, code, message, '');
    }
    const { data: full } = await apiFetch<SearchRunDTO>(`/api/v1/lab/runs/${final.id}`, {
      ...apiArgs(globals, creds),
      method: 'GET',
    });
    emit(globals, full, () => runMetricsTable(full));
    return;
  }
  // Fast path (201 final ou 200 replay): mesmo mapeamento do polling — run
  // terminal `failed`/`cancelled` vira exit 1 (H-01: antes saia exit 0
  // dependendo do timing 201 vs 202).
  if (data.status === 'failed' || data.status === 'cancelled') {
    const code = data.error?.code ?? 'RUN_FAILED';
    const message = data.error?.message ?? 'Execução terminou sem sucesso.';
    throw new CliApiError(500, code, message, '');
  }
  emit(globals, data, () => runMetricsTable(data));
}

export const SEARCH_COMPARE_USAGE = 'Uso: uhhu lab search compare --search <id> --with <id1,id2[,…até 10]>';

export async function runSearchCompare(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const searchId = reqFlag(parsed, SEARCH_COMPARE_USAGE, 'search');
  const withIds = reqFlag(parsed, SEARCH_COMPARE_USAGE, 'with');
  const creds = await ctx(globals);
  const { data } = await apiFetch<CompareDTO>(
    `/api/v1/lab/searches/${searchId}/compare${buildQuery({ with: withIds })}`,
    { ...apiArgs(globals, creds), method: 'GET' },
  );
  emit(globals, data, () => {
    printTable(
      ['busca', 'total'],
      Object.entries(data.totals).map(([id, total]) => [short(id, 8), String(total)]),
    );
    printTable(
      ['par', 'sobreposição'],
      Object.entries(data.pairwiseOverlap).map(([pair, overlap]) => [pair, String(overlap)]),
    );
  });
}

// ---------------------------------------------------------------------------
// lab run results
// ---------------------------------------------------------------------------

export const RUN_RESULTS_USAGE = 'Uso: uhhu lab run results --run <id> [--limit <n>]';

export async function runRunResults(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const runId = reqFlag(parsed, RUN_RESULTS_USAGE, 'run');
  const limit = optFlag(parsed, 'limit');
  const creds = await ctx(globals);
  const { data } = await apiFetch<{ items: ResultDTO[]; total: number; newCount: number }>(
    `/api/v1/lab/runs/${runId}/results${buildQuery({ limit })}`,
    { ...apiArgs(globals, creds), method: 'GET' },
  );
  const rows = itemsOf(data) as ResultDTO[];
  emit(globals, data, () => {
    printTable(
      ['fonte', 'título', 'ano'],
      rows.map((result) => [result.source, short(result.title, 60), cell(result.year)]),
    );
  });
}

// ---------------------------------------------------------------------------
// lab result decide (+ espelho Phase 4: groups/tags/divergencia/pin)
// ---------------------------------------------------------------------------

export const RESULT_DECIDE_USAGE =
  'Uso: uhhu lab result decide --result <grupo-id> --decision eligible|ineligible|undecided [--reason <motivo>]';

// `--result` recebe o id do GRUPO de dedup (a decisao e UMA por grupo, D-46);
// o path espelha a rota Phase 4 `PUT /api/v1/lab/groups/:groupId/decision`.
export async function runResultDecide(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const groupId = reqFlag(parsed, RESULT_DECIDE_USAGE, 'result');
  const decision = optEnum(
    parsed,
    ['eligible', 'ineligible', 'undecided'],
    RESULT_DECIDE_USAGE,
    'decision',
  );
  if (decision === undefined) {
    throw new UsageError(`Flag obrigatória ausente: --decision\n${RESULT_DECIDE_USAGE}`);
  }
  const reason = optFlag(parsed, 'reason');
  const creds = await ctx(globals);
  const body: Record<string, string> = { decision };
  if (reason !== undefined) {
    body['reason'] = reason;
  }
  const { data } = await apiFetch<DedupGroupDTO>(`/api/v1/lab/groups/${groupId}/decision`, {
    ...apiArgs(globals, creds),
    method: 'PUT',
    body,
  });
  emit(globals, data, () => {
    printTable(
      ['grupo', 'decisão', 'estado'],
      [[data.id, data.decision, data.status]],
    );
  });
}

export const GROUP_LIST_USAGE =
  'Uso: uhhu lab group list --project <id> [--status confirmed|pending] [--limit <n>]';

export async function runGroupList(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const projectId = reqFlag(parsed, GROUP_LIST_USAGE, 'project');
  const statusFilter = optEnum(parsed, ['confirmed', 'pending'], GROUP_LIST_USAGE, 'status');
  const limit = optFlag(parsed, 'limit');
  const creds = await ctx(globals);
  const { data } = await apiFetch<{ items: DedupGroupDTO[] }>(
    `/api/v1/lab/projects/${projectId}/groups${buildQuery({ limit, status: statusFilter })}`,
    { ...apiArgs(globals, creds), method: 'GET' },
  );
  const rows = itemsOf(data) as DedupGroupDTO[];
  emit(globals, data, () => {
    printTable(
      ['grupo', 'confiança', 'estado', 'decisão', 'origens'],
      rows.map((group) => [
        group.id,
        group.confidence,
        group.status,
        group.decision,
        group.origins.join(','),
      ]),
    );
  });
}

export const GROUP_CONFIRM_USAGE = 'Uso: uhhu lab group confirm --group <id>';

export async function runGroupConfirm(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const groupId = reqFlag(parsed, GROUP_CONFIRM_USAGE, 'group');
  const creds = await ctx(globals);
  const { data } = await apiFetch<DedupGroupDTO>(`/api/v1/lab/groups/${groupId}/confirm`, {
    ...apiArgs(globals, creds),
    method: 'POST',
    body: {},
  });
  emit(globals, data, () => {
    printTable(['grupo', 'estado'], [[data.id, data.status]]);
  });
}

export const GROUP_REJECT_USAGE = 'Uso: uhhu lab group reject --group <id>';

export async function runGroupReject(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const groupId = reqFlag(parsed, GROUP_REJECT_USAGE, 'group');
  const creds = await ctx(globals);
  const { data } = await apiFetch<{ singles: DedupGroupDTO[] }>(
    `/api/v1/lab/groups/${groupId}/reject`,
    { ...apiArgs(globals, creds), method: 'POST', body: {} },
  );
  const singles: unknown = field(data, 'singles');
  const rows = Array.isArray(singles) ? (singles as DedupGroupDTO[]) : [];
  emit(globals, data, () => {
    printTable(
      ['grupo', 'estado'],
      rows.map((group) => [group.id, group.status]),
    );
  });
}

export const GROUP_DIVERGE_USAGE =
  'Uso: uhhu lab group diverge --group <id> --source bdtd|capes --note "<nota sem HTML>"';

export async function runGroupDiverge(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const groupId = reqFlag(parsed, GROUP_DIVERGE_USAGE, 'group');
  const source = optEnum(parsed, ['bdtd', 'capes'], GROUP_DIVERGE_USAGE, 'source');
  if (source === undefined) {
    throw new UsageError(`Flag obrigatória ausente: --source\n${GROUP_DIVERGE_USAGE}`);
  }
  const note = reqFlag(parsed, GROUP_DIVERGE_USAGE, 'note');
  const creds = await ctx(globals);
  const { data } = await apiFetch<DedupGroupDTO>(`/api/v1/lab/groups/${groupId}/divergence`, {
    ...apiArgs(globals, creds),
    method: 'PUT',
    body: { source, note },
  });
  emit(globals, data, () => {
    printTable(['grupo', 'estado'], [[data.id, data.status]]);
  });
}

export const GROUP_PIN_SET_USAGE =
  'Uso: uhhu lab group pin-set --group <id> --source bdtd|capes --source-id <sid>';

export async function runGroupPinSet(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const groupId = reqFlag(parsed, GROUP_PIN_SET_USAGE, 'group');
  const source = optEnum(parsed, ['bdtd', 'capes'], GROUP_PIN_SET_USAGE, 'source');
  if (source === undefined) {
    throw new UsageError(`Flag obrigatória ausente: --source\n${GROUP_PIN_SET_USAGE}`);
  }
  const sourceId = reqFlag(parsed, GROUP_PIN_SET_USAGE, 'source-id');
  const creds = await ctx(globals);
  const { data } = await apiFetch<DedupGroupDTO>(`/api/v1/lab/groups/${groupId}/pin`, {
    ...apiArgs(globals, creds),
    method: 'PUT',
    body: { source, sourceId },
  });
  emit(globals, data, () => {
    printTable(['grupo', 'estado'], [[data.id, data.status]]);
  });
}

export const GROUP_PIN_CLEAR_USAGE = 'Uso: uhhu lab group pin-clear --group <id>';

export async function runGroupPinClear(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const groupId = reqFlag(parsed, GROUP_PIN_CLEAR_USAGE, 'group');
  const creds = await ctx(globals);
  await apiFetch<unknown>(`/api/v1/lab/groups/${groupId}/pin`, {
    ...apiArgs(globals, creds),
    method: 'DELETE',
  });
  if (globals.json) {
    printJson({ ok: true });
    return;
  }
  console.log(`Pin removido do grupo ${groupId}.`);
}

export const TAG_LIST_USAGE = 'Uso: uhhu lab tag list --project <id>';

export async function runTagList(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const projectId = reqFlag(parsed, TAG_LIST_USAGE, 'project');
  const creds = await ctx(globals);
  const { data } = await apiFetch<unknown>(`/api/v1/lab/projects/${projectId}/tags`, {
    ...apiArgs(globals, creds),
    method: 'GET',
  });
  const rows = itemsOf(data);
  emit(globals, data, () => {
    printTable(
      ['id', 'nome'],
      rows.map((tag) => [cell(field(tag, 'id')), cell(field(tag, 'name'))]),
    );
  });
}

export const TAG_CREATE_USAGE =
  'Uso: uhhu lab tag create --project <id> --name <nome> [--color <cor>]';

export async function runTagCreate(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const projectId = reqFlag(parsed, TAG_CREATE_USAGE, 'project');
  const name = reqFlag(parsed, TAG_CREATE_USAGE, 'name');
  const color = optFlag(parsed, 'color');
  const creds = await ctx(globals);
  const body: Record<string, string> = { name };
  if (color !== undefined) {
    body['color'] = color;
  }
  const { data } = await apiFetch<unknown>(`/api/v1/lab/projects/${projectId}/tags`, {
    ...apiArgs(globals, creds),
    method: 'POST',
    body,
  });
  emit(globals, data, () => {
    printTable(['id', 'nome'], [[cell(field(data, 'id')), cell(field(data, 'name'))]]);
  });
}

export const GROUP_TAG_ATTACH_USAGE = 'Uso: uhhu lab group tag-attach --group <id> --tag <tag-id>';

export async function runGroupTagAttach(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const groupId = reqFlag(parsed, GROUP_TAG_ATTACH_USAGE, 'group');
  const tagId = reqFlag(parsed, GROUP_TAG_ATTACH_USAGE, 'tag');
  const creds = await ctx(globals);
  const { data } = await apiFetch<DedupGroupDTO>(`/api/v1/lab/groups/${groupId}/tags`, {
    ...apiArgs(globals, creds),
    method: 'POST',
    body: { tagId },
  });
  emit(globals, data, () => {
    printTable(['grupo', 'estado'], [[data.id, data.status]]);
  });
}

export const GROUP_TAG_DETACH_USAGE =
  'Uso: uhhu lab group tag-detach --group <id> --tag <tag-id>';

export async function runGroupTagDetach(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const groupId = reqFlag(parsed, GROUP_TAG_DETACH_USAGE, 'group');
  const tagId = reqFlag(parsed, GROUP_TAG_DETACH_USAGE, 'tag');
  const creds = await ctx(globals);
  await apiFetch<unknown>(`/api/v1/lab/groups/${groupId}/tags/${tagId}`, {
    ...apiArgs(globals, creds),
    method: 'DELETE',
  });
  if (globals.json) {
    printJson({ ok: true });
    return;
  }
  console.log(`Tag ${tagId} removida do grupo ${groupId}.`);
}

// ---------------------------------------------------------------------------
// lab corpus get / source list
// ---------------------------------------------------------------------------

export const CORPUS_GET_USAGE = 'Uso: uhhu lab corpus get --project <id> [--limit <n>]';

export async function runCorpusGet(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const projectId = reqFlag(parsed, CORPUS_GET_USAGE, 'project');
  const limit = optFlag(parsed, 'limit');
  const creds = await ctx(globals);
  const { data } = await apiFetch<{ items: CorpusEntryDTO[] }>(
    `/api/v1/lab/projects/${projectId}/corpus${buildQuery({ limit })}`,
    { ...apiArgs(globals, creds), method: 'GET' },
  );
  const rows = itemsOf(data) as CorpusEntryDTO[];
  emit(globals, data, () => {
    printTable(
      ['grupo', 'título', 'ano', 'origens'],
      rows.map((entry) => [
        entry.groupId,
        short(entry.title, 60),
        cell(entry.year),
        entry.origins.join(','),
      ]),
    );
  });
}

export const SOURCE_LIST_USAGE = 'Uso: uhhu lab source list';

export async function runSourceList(_args: string[], globals: GlobalOptions): Promise<void> {
  const creds = await ctx(globals);
  const { data } = await apiFetch<unknown[]>('/api/v1/lab/sources', {
    ...apiArgs(globals, creds),
    method: 'GET',
  });
  const rows = itemsOf(data);
  emit(globals, data, () => {
    printTable(
      ['fonte', 'nível', 'ativa'],
      rows.map((source) => [
        cell(field(source, 'name')),
        cell(field(source, 'level')),
        cell(field(source, 'enabled')),
      ]),
    );
  });
}

// ---------------------------------------------------------------------------
// lab export
// ---------------------------------------------------------------------------

export const EXPORT_USAGE =
  'Uso: uhhu lab export --project <id> --format csv|bibtex|json [--scope corpus|selection] [--selection <id1,id2>] [--out <dir>] [--idempotency-key <k>]';

// Baixa o attachment e salva com o filename do `content-disposition`
// (Content-Disposition) do servidor (D-59); fallback local
// `corpus-<projeto>-<AAAAMMDD>.<ext>`.
export async function runExport(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const projectId = reqFlag(parsed, EXPORT_USAGE, 'project');
  const format = optEnum(parsed, ['csv', 'bibtex', 'json'], EXPORT_USAGE, 'format');
  if (format === undefined) {
    throw new UsageError(`Flag obrigatória ausente: --format\n${EXPORT_USAGE}`);
  }
  const selection = optFlag(parsed, 'selection');
  const scope =
    optEnum(parsed, ['corpus', 'selection'], EXPORT_USAGE, 'scope') ??
    (selection === undefined ? 'corpus' : 'selection');
  if (scope === 'selection' && selection === undefined) {
    throw new UsageError(`--scope selection exige --selection <ids>\n${EXPORT_USAGE}`);
  }
  const outDir = optFlag(parsed, 'out') ?? process.cwd();
  const creds = await ctx(globals);
  const idempotencyKey = optFlag(parsed, 'idempotency-key') ?? globals.idempotencyKey;
  const base = { ...apiArgs(globals, creds), ...(idempotencyKey === undefined ? {} : { idempotencyKey }) };
  const { data, filename } = await apiFetch<string>(
    `/api/v1/lab/projects/${projectId}/export${buildQuery({ format, scope, selection })}`,
    { ...base, method: 'GET', raw: true },
  );
  const ext = format === 'bibtex' ? 'bib' : format;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const name = filename ?? `corpus-${projectId}-${date}.${ext}`;
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, name);
  await writeFile(path, data, 'utf8');
  const bytes = Buffer.byteLength(data, 'utf8');
  if (globals.json) {
    printJson({ path, bytes });
    return;
  }
  console.log(`Salvo: ${path} (${bytes} bytes)`);
}

// ---------------------------------------------------------------------------
// job get
// ---------------------------------------------------------------------------

export const JOB_GET_USAGE = 'Uso: uhhu job get --job <id>';

export async function runJobGet(args: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(args);
  const jobId = reqFlag(parsed, JOB_GET_USAGE, 'job');
  const creds = await ctx(globals);
  const { data } = await apiFetch<JobDTO>(`/api/v1/jobs/${jobId}`, {
    ...apiArgs(globals, creds),
    method: 'GET',
  });
  const progress =
    data.progress === null ? '-' : `${data.progress.doneSources}/${data.progress.totalSources}`;
  const ref = data.resultRef === null ? '-' : data.resultRef.runId;
  emit(globals, data, () => {
    printTable(['job', 'estado', 'progresso', 'ref'], [[data.id, data.status, progress, ref]]);
  });
}
