// apps/cli — bin `uhhu`: roteador argv → comandos (parse manual, zero deps).
//
// Flags globais: `--api <url>`, `--json`, `-v`, `--idempotency-key <k>`,
// `--timeout <s>`, `--help`. Erros `CliApiError` viram stderr
// `Erro <CODE>: <message> (requestId <id>)` + exit por status (401/403→3,
// 404→4, 400/422→2, 429→5, 5xx/rede→1). Opera por API; nunca PG.

import {
  AUTH_LOGIN_USAGE,
  AUTH_LOGOUT_USAGE,
  CORPUS_GET_USAGE,
  EXPORT_USAGE,
  GROUP_CONFIRM_USAGE,
  GROUP_DIVERGE_USAGE,
  GROUP_LIST_USAGE,
  GROUP_PIN_CLEAR_USAGE,
  GROUP_PIN_SET_USAGE,
  GROUP_REJECT_USAGE,
  GROUP_TAG_ATTACH_USAGE,
  GROUP_TAG_DETACH_USAGE,
  JOB_GET_USAGE,
  PROJECT_CREATE_USAGE,
  PROJECT_LIST_USAGE,
  RESULT_DECIDE_USAGE,
  RUN_RESULTS_USAGE,
  SEARCH_COMPARE_USAGE,
  SEARCH_CREATE_USAGE,
  SEARCH_RUN_USAGE,
  SOURCE_LIST_USAGE,
  TAG_CREATE_USAGE,
  TAG_LIST_USAGE,
  UsageError,
  exitCodeForStatus,
  runAuthLogin,
  runAuthLogout,
  runCorpusGet,
  runExport,
  runGroupConfirm,
  runGroupDiverge,
  runGroupList,
  runGroupPinClear,
  runGroupPinSet,
  runGroupReject,
  runGroupTagAttach,
  runGroupTagDetach,
  runJobGet,
  runProjectCreate,
  runProjectList,
  runResultDecide,
  runRunResults,
  runSearchCompare,
  runSearchCreate,
  runSearchRun,
  runSourceList,
  runTagCreate,
  runTagList,
  type GlobalOptions,
} from './commands.js';
import { CliApiError } from './client.js';
import { CliAuthError } from './auth-store.js';

const GENERAL_HELP = `uhhu — CLI headless do CORE (opera por API, nunca acessa PostgreSQL diretamente)

Uso: uhhu [--api <url>] [--json] [-v] <comando> [opções]

Comandos (cadeia Etapa 2):
  auth login                    autentica com PAT por device (POST /auth/token)
  auth logout                   revoga o PAT atual e apaga a credencial local
  project list                  lista projetos (--limit, --status)
  project create                cria projeto (--title, --question)
  lab search create             cria busca (--project, --term, filtros)
  lab search run                executa busca com polling D-56 (--search, -v)
  lab search compare            compara buscas (--search, --with)
  lab run results               resultados de um run (--run, --limit)
  lab result decide             decisão de elegibilidade (--result, --decision)
  lab corpus get                corpus do projeto (--project, --limit)
  lab export                    baixa o attachment (--project, --format, --out)
  lab source list               fontes do registry
  lab group list                grupos de dedup (--project, --status)
  lab group confirm             confirma grupo fuzzy (--group)
  lab group reject              rejeita grupo (--group)
  lab group diverge             anota divergência (--group, --source, --note)
  lab group pin-set             fixa canônico (--group, --source, --source-id)
  lab group pin-clear           solta pin (--group)
  lab group tag-attach          anexa tag (--group, --tag)
  lab group tag-detach          solta tag (--group, --tag)
  lab tag list                  tags do projeto (--project)
  lab tag create                cria tag (--project, --name, --color)
  job get                       estado de um job (--job)

Flags globais:
  --api <url>              base da API (default http://127.0.0.1:3000, ou UHHU_API_URL)
  --json                   saída JSON pura (sem tabela humana)
  -v                       verboso (progresso do polling no stderr)
  --idempotency-key <k>    repassa o header Idempotency-Key (run e export)
  --timeout <s>            timeout do polling em segundos (default 600)
  --help                   esta ajuda (ou a do comando: uhhu <cmd> --help)

Códigos de saída: 0 ok; 2 validação/uso; 3 auth (401/403); 4 não encontrado;
5 rate limit (429); 1 demais erros (5xx/rede).`;

const COMMAND_HELP: Record<string, string> = {
  'auth login': AUTH_LOGIN_USAGE,
  'auth logout': AUTH_LOGOUT_USAGE,
  'project list': PROJECT_LIST_USAGE,
  'project create': PROJECT_CREATE_USAGE,
  'lab search create': SEARCH_CREATE_USAGE,
  'lab search run': SEARCH_RUN_USAGE,
  'lab search compare': SEARCH_COMPARE_USAGE,
  'lab run results': RUN_RESULTS_USAGE,
  'lab result decide': RESULT_DECIDE_USAGE,
  'lab corpus get': CORPUS_GET_USAGE,
  'lab export': EXPORT_USAGE,
  'lab source list': SOURCE_LIST_USAGE,
  'lab group list': GROUP_LIST_USAGE,
  'lab group confirm': GROUP_CONFIRM_USAGE,
  'lab group reject': GROUP_REJECT_USAGE,
  'lab group diverge': GROUP_DIVERGE_USAGE,
  'lab group pin-set': GROUP_PIN_SET_USAGE,
  'lab group pin-clear': GROUP_PIN_CLEAR_USAGE,
  'lab group tag-attach': GROUP_TAG_ATTACH_USAGE,
  'lab group tag-detach': GROUP_TAG_DETACH_USAGE,
  'lab tag list': TAG_LIST_USAGE,
  'lab tag create': TAG_CREATE_USAGE,
  'job get': JOB_GET_USAGE,
};

type Handler = (args: string[], globals: GlobalOptions) => Promise<void>;

const ROUTES: Record<string, Handler> = {
  'auth login': runAuthLogin,
  'auth logout': runAuthLogout,
  'project list': runProjectList,
  'project create': runProjectCreate,
  'lab search create': runSearchCreate,
  'lab search run': runSearchRun,
  'lab search compare': runSearchCompare,
  'lab run results': runRunResults,
  'lab result decide': runResultDecide,
  'lab corpus get': runCorpusGet,
  'lab export': runExport,
  'lab source list': runSourceList,
  'lab group list': runGroupList,
  'lab group confirm': runGroupConfirm,
  'lab group reject': runGroupReject,
  'lab group diverge': runGroupDiverge,
  'lab group pin-set': runGroupPinSet,
  'lab group pin-clear': runGroupPinClear,
  'lab group tag-attach': runGroupTagAttach,
  'lab group tag-detach': runGroupTagDetach,
  'lab tag list': runTagList,
  'lab tag create': runTagCreate,
  'job get': runJobGet,
};

export function parseGlobals(argv: string[]): {
  globals: GlobalOptions;
  help: boolean;
  rest: string[];
} {
  const globals: GlobalOptions = {
    json: false,
    verbose: false,
    timeoutMs: 600000,
  };
  let help = false;
  const rest: string[] = [];
  let index = 0;
  const takeValue = (flag: string): string => {
    const inline = flag.indexOf('=');
    if (inline >= 0) {
      return flag.slice(inline + 1);
    }
    const next = argv[index + 1];
    if (next === undefined || next.length === 0) {
      throw new UsageError(`Flag ${flag} exige um valor.\n${GENERAL_HELP}`);
    }
    index += 1;
    return next;
  };
  while (index < argv.length) {
    const token = argv[index] ?? '';
    if (token === '--api') {
      globals.baseUrl = takeValue(token);
    } else if (token.startsWith('--api=')) {
      globals.baseUrl = token.slice('--api='.length);
    } else if (token === '--json') {
      globals.json = true;
    } else if (token === '-v' || token === '--verbose') {
      globals.verbose = true;
    } else if (token === '--idempotency-key') {
      globals.idempotencyKey = takeValue(token);
    } else if (token.startsWith('--idempotency-key=')) {
      globals.idempotencyKey = token.slice('--idempotency-key='.length);
    } else if (token === '--timeout') {
      const raw = takeValue(token);
      const secs = Number(raw);
      if (!Number.isFinite(secs) || secs <= 0) {
        throw new UsageError(`--timeout inválido: ${raw} (esperado: segundos > 0)`);
      }
      globals.timeoutMs = Math.floor(secs * 1000);
    } else if (token.startsWith('--timeout=')) {
      const raw = token.slice('--timeout='.length);
      const secs = Number(raw);
      if (!Number.isFinite(secs) || secs <= 0) {
        throw new UsageError(`--timeout inválido: ${raw} (esperado: segundos > 0)`);
      }
      globals.timeoutMs = Math.floor(secs * 1000);
    } else if (token === '--help' || token === '-h') {
      help = true;
    } else {
      rest.push(token);
    }
    index += 1;
  }
  return { globals, help, rest };
}

// Casa o prefixo mais longo de `rest` contra ROUTES/COMMAND_HELP
// (`lab search run` antes de `lab search`; `job get` antes de `job`).
function matchRoute(rest: string[]): { key: string; depth: number } | null {
  for (let depth = Math.min(3, rest.length); depth >= 1; depth -= 1) {
    const key = rest.slice(0, depth).join(' ');
    if (ROUTES[key] !== undefined || COMMAND_HELP[key] !== undefined) {
      return { key, depth };
    }
  }
  return null;
}

export async function main(argv: string[]): Promise<void> {
  const { globals, help, rest } = parseGlobals(argv);
  if (rest.length === 0) {
    console.log(GENERAL_HELP);
    return;
  }
  const matched = matchRoute(rest);
  if (matched === null) {
    throw new UsageError(`Comando desconhecido: ${rest.join(' ')}\n${GENERAL_HELP}`);
  }
  if (help) {
    console.log(COMMAND_HELP[matched.key] ?? GENERAL_HELP);
    return;
  }
  const handler = ROUTES[matched.key];
  if (handler === undefined) {
    throw new UsageError(`Comando desconhecido: ${rest.join(' ')}\n${GENERAL_HELP}`);
  }
  await handler(rest.slice(matched.depth), globals);
}

async function run(): Promise<void> {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    if (err instanceof CliApiError) {
      const rid = err.requestId.length > 0 ? ` (requestId ${err.requestId})` : '';
      process.stderr.write(`Erro ${err.code}: ${err.message}${rid}\n`);
      process.exitCode = exitCodeForStatus(err.status);
      return;
    }
    if (err instanceof CliAuthError) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 3;
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Erro interno: ${message}\n`);
    process.exitCode = 1;
  }
}

void run();
