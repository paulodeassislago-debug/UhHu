// apps/core-api — fachada de capabilities sobre execute() (05-02, D-60–D-63, CORE-02).
//
// `buildExecutor(db)` monta o executor com o mapa COMPLETO do registry §10 v1
// (20 nomes de `packages/contracts`, definicao unica) mais as extensoes
// transicionais 05-02 (abaixo). As rotas REST (lab/projects) sao adaptadores
// finos sobre `execute()` — NENHUMA rota importa `lib/*` direto; todo acesso
// a caso de uso passa por este modulo.
//
// Validacao: cada entrada do mapa revalida o nucleo com o schema de contracts
// correspondente (`safeParse` → CapabilityValidationError PT-BR, mesmo code
// VALIDATION_ERROR que a rota retornava). Resultados `null`/`[]`/`false` do
// lib passam intactos para a rota traduzir em 404 como antes — nenhum status
// muda. Erros tipados do lib viram HTTP via `toHttpError` (codigos identicos
// aos atuais); desconhecido retorna null (caller relanca → 500 global).
//
// EXTENSOES TRANSICIONAIS 05-02 (desvio documentado no SUMMARY): o registry
// §10 v1 nao cobre leituras unitarias (search/result get), cancelamento,
// confirm/reject de grupos, tags, pins nem delete de projeto — mas o criterio
// do plano exige zero import de lib/* nas rotas e execute() como unico
// caminho. Estas 14 entradas extras vivem num mapa local com allowlist
// explicita (fail-closed preservado: nome fora do registry + extras lanca
// UnknownCapabilityError identico ao do core) e delegam 1:1 ao `*ForActor`
// como as demais. Incorporar ao contrato §10 (adendo + versao) fica para um
// plano futuro com atualizacao da documentacao (AGENTS.md: sem mudar o CORE
// silenciosamente).
//
// `sendExport` (serializacao de attachment) tambem vive aqui pelo mesmo
// motivo: os serializadores puros moram em `lib/exports.js` e as rotas nao
// podem importa-los direto.

import { z } from 'zod';
import type { FastifyReply } from 'fastify';
import {
  buildEnvelope,
  createProjectSchema,
  createSearchSchema,
  createTagSchema,
  decisionInputSchema,
  divergenceInputSchema,
  exportQuerySchema,
  labSourceSchema,
  paginationQuerySchema,
  pinInputSchema,
  updateProjectSchema,
  updateSearchSchema,
  type CorpusEntryDTO,
  type ErrorEnvelope,
  type ExportQuery,
} from '@uhhu/contracts';
import {
  createExecutor,
  UnknownCapabilityError,
  type ActorContext,
  type CapabilityExecutor,
  type CapabilityHandler,
  type CapabilityName,
} from '@uhhu/core';
import { computeSourceHealth, listSources, SourceDisabledError } from '@uhhu/integrations';
import { eq } from 'drizzle-orm';
import { users, type Db } from '@uhhu/db';
import {
  createProject,
  deleteProjectForActor,
  getProjectForActor,
  listProjectsForActor,
  updateProjectForActor,
} from './lib/projects.js';
import {
  createSearchForActor,
  deleteSearchForActor,
  getResultForActor,
  getRunForActor,
  getSearchForActor,
  listResultsForActor,
  listRunsForActor,
  listSearchesForActor,
  updateSearchForActor,
} from './lib/searches.js';
import {
  cancelRunForActor,
  executeSearchRun,
  IdempotencyConflictError,
  RunRateLimitedError,
} from './lib/searchRuns.js';
import {
  attachTagForActor,
  clearPinForActor,
  compareSearchesForActor,
  computeDedupGroupsForActor,
  confirmGroupForActor,
  createTagForActor,
  detachTagForActor,
  ensureDefaultTags,
  EXPORT_MAX_GROUPS,
  getCorpusForActor,
  getExportProvenanceForActor,
  listExportMembersForActor,
  listTagsForActor,
  rejectGroupForActor,
  resolveSelectionGroupsForActor,
  setDivergenceForActor,
  setGroupDecisionForActor,
  setPinForActor,
  type ExportMemberRaw,
  type ExportProvenance,
} from './lib/corpus.js';
import { exportFilename, toBibTeX, toCSV, toExportJSON } from './lib/exports.js';

// Re-exportados para as rotas estreitarem o `unknown` do execute() sem
// importar `lib/*` (gate do plano). Sao so tipos — zero runtime.
export type { ListProjectsResult } from './lib/projects.js';
export type { ListResultsResult, ListRunsResult, ListSearchesResult } from './lib/searches.js';
export type { CancelRunResult, ExecuteSearchRunResult } from './lib/searchRuns.js';
export type {
  CorpusListResult,
  ExportMemberRaw,
  ExportProvenance,
  ProjectTag,
} from './lib/corpus.js';

// ---------------------------------------------------------------------------
// Erro → HTTP (codigos e mensagens identicos aos das rotas; nenhum status muda).
// ---------------------------------------------------------------------------

export class CapabilityValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  readonly statusCode = 400;

  constructor(readonly details: unknown) {
    super('Dados inválidos.');
    this.name = 'CapabilityValidationError';
  }
}

export interface HttpErrorMapping {
  status: number;
  envelope: ErrorEnvelope;
}

export function toHttpError(error: unknown, requestId: string): HttpErrorMapping | null {
  if (error instanceof CapabilityValidationError) {
    return {
      status: error.statusCode,
      envelope: buildEnvelope('VALIDATION_ERROR', requestId, error.details),
    };
  }
  if (error instanceof SourceDisabledError) {
    return { status: 400, envelope: buildEnvelope('SOURCE_DISABLED', requestId, {}) };
  }
  if (error instanceof IdempotencyConflictError) {
    return { status: 422, envelope: buildEnvelope('IDEMPOTENCY_CONFLICT', requestId, {}) };
  }
  if (error instanceof RunRateLimitedError) {
    return { status: 429, envelope: buildEnvelope('RATE_LIMITED', requestId, {}) };
  }
  if (error instanceof UnknownCapabilityError) {
    return { status: 500, envelope: buildEnvelope('INTERNAL_ERROR', requestId, {}) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validacao do nucleo (segunda camada; a rota ja validou a fronteira HTTP).
// ---------------------------------------------------------------------------

function parseOrThrow<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new CapabilityValidationError(parsed.error.flatten());
  }
  return parsed.data;
}

const idInputSchema = z.object({ id: z.string() });

const projectIdInputSchema = z.object({ projectId: z.string() });

const projectListInputSchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'archived', 'all']).optional(),
});

const projectScopedListSchema = paginationQuerySchema.extend({ projectId: z.string() });
const searchScopedListSchema = paginationQuerySchema.extend({ searchId: z.string() });
const runScopedListSchema = paginationQuerySchema.extend({ runId: z.string() });

const projectUpdateInputSchema = z.object({ id: z.string(), patch: updateProjectSchema });
const searchUpdateInputSchema = z.object({ id: z.string(), patch: updateSearchSchema });

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:~-]{1,128}$/;

const searchExecuteInputSchema = z.object({
  searchId: z.string(),
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN).optional(),
});

const compareInputSchema = z.object({
  searchId: z.string(),
  with: z.array(z.string().uuid()).min(1).max(10),
});

const decisionUpdateInputSchema = z.object({ groupId: z.string(), input: decisionInputSchema });
const divergeUpdateInputSchema = z.object({ groupId: z.string(), input: divergenceInputSchema });
const pinSetInputSchema = z.object({ groupId: z.string(), input: pinInputSchema });

const tagCreateInputSchema = z.object({
  projectId: z.string(),
  input: createTagSchema,
});

const groupTagInputSchema = z.object({ groupId: z.string(), tagId: z.string() });

const exportInputSchema = exportQuerySchema.extend({ projectId: z.string() });

const sourceHealthInputSchema = z.object({ source: labSourceSchema });

// ---------------------------------------------------------------------------
// Mapa do registry §10 v1 (20 nomes; o tipo Record exige a lista completa —
// faltar entrada falha o typecheck por construcao).
// ---------------------------------------------------------------------------

function registryHandlers(db: Db): Record<CapabilityName, CapabilityHandler> {
  return {
    'platform.session.get': async (_input, actor) => {
      const rows = await db.select().from(users).where(eq(users.id, actor.userId)).limit(1);
      const user = rows[0];
      if (user === undefined) {
        return null;
      }
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role === 'admin' ? 'admin' : 'member',
        createdAt: user.createdAt.toISOString(),
      };
    },
    'platform.project.create': async (input, actor) => {
      return createProject(db, actor, parseOrThrow(createProjectSchema, input));
    },
    'platform.project.list': async (input, actor) => {
      const data = parseOrThrow(projectListInputSchema, input);
      return listProjectsForActor(db, actor, {
        limit: data.limit,
        cursor: data.cursor,
        status: data.status ?? 'active',
      });
    },
    'platform.project.get': async (input, actor) => {
      const data = parseOrThrow(idInputSchema, input);
      return getProjectForActor(db, actor, data.id);
    },
    'platform.project.update': async (input, actor) => {
      const data = parseOrThrow(projectUpdateInputSchema, input);
      return updateProjectForActor(db, actor, data.id, data.patch);
    },
    'lab.search.create': async (input, actor) => {
      return createSearchForActor(db, actor, parseOrThrow(createSearchSchema, input));
    },
    'lab.search.list': async (input, actor) => {
      const data = parseOrThrow(projectScopedListSchema, input);
      return listSearchesForActor(db, actor, data.projectId, {
        limit: data.limit,
        cursor: data.cursor,
      });
    },
    'lab.search.update': async (input, actor) => {
      const data = parseOrThrow(searchUpdateInputSchema, input);
      return updateSearchForActor(db, actor, data.id, data.patch);
    },
    'lab.search.delete': async (input, actor) => {
      const data = parseOrThrow(idInputSchema, input);
      return deleteSearchForActor(db, actor, data.id);
    },
    'lab.search.execute': async (input, actor) => {
      const data = parseOrThrow(searchExecuteInputSchema, input);
      return executeSearchRun(
        db,
        actor,
        data.searchId,
        data.idempotencyKey === undefined ? {} : { idempotencyKey: data.idempotencyKey },
      );
    },
    'lab.search.compare': async (input, actor) => {
      const data = parseOrThrow(compareInputSchema, input);
      return compareSearchesForActor(db, actor, data.searchId, data.with);
    },
    'lab.run.get': async (input, actor) => {
      const data = parseOrThrow(idInputSchema, input);
      return getRunForActor(db, actor, data.id);
    },
    'lab.run.list': async (input, actor) => {
      const data = parseOrThrow(searchScopedListSchema, input);
      return listRunsForActor(db, actor, data.searchId, {
        limit: data.limit,
        cursor: data.cursor,
      });
    },
    'lab.run.results.list': async (input, actor) => {
      const data = parseOrThrow(runScopedListSchema, input);
      return listResultsForActor(db, actor, data.runId, {
        limit: data.limit,
        cursor: data.cursor,
      });
    },
    'lab.result.decision.update': async (input, actor) => {
      const data = parseOrThrow(decisionUpdateInputSchema, input);
      return setGroupDecisionForActor(db, actor, data.groupId, data.input);
    },
    'lab.result.duplicate.diverge': async (input, actor) => {
      const data = parseOrThrow(divergeUpdateInputSchema, input);
      return setDivergenceForActor(db, actor, data.groupId, data.input);
    },
    'lab.corpus.get': async (input, actor) => {
      const data = parseOrThrow(projectScopedListSchema, input);
      return getCorpusForActor(db, actor, data.projectId, {
        limit: data.limit,
        cursor: data.cursor,
      });
    },
    'lab.project.export': async (input, actor) => {
      const data = parseOrThrow(exportInputSchema, input);
      return assembleExport(db, actor, data.projectId, {
        format: data.format,
        scope: data.scope,
        selection: data.selection,
      });
    },
    'lab.source.list': async () => {
      return listSources();
    },
    'lab.source.health': async (input) => {
      const data = parseOrThrow(sourceHealthInputSchema, input);
      return computeSourceHealth(db, data.source);
    },
  };
}

// ---------------------------------------------------------------------------
// Extensoes transicionais 05-02 (ver cabecalho do arquivo).
// ---------------------------------------------------------------------------

const EXTENDED_CAPABILITY_NAMES = [
  'platform.project.delete',
  'lab.search.get',
  'lab.result.get',
  'lab.run.cancel',
  'lab.group.list',
  'lab.group.confirm',
  'lab.group.reject',
  'lab.tag.ensure',
  'lab.tag.list',
  'lab.tag.create',
  'lab.group.tag.attach',
  'lab.group.tag.detach',
  'lab.group.pin.set',
  'lab.group.pin.clear',
] as const;

export type ExtendedCapabilityName = (typeof EXTENDED_CAPABILITY_NAMES)[number];

function isExtendedCapability(name: string): name is ExtendedCapabilityName {
  return (EXTENDED_CAPABILITY_NAMES as readonly string[]).includes(name);
}

function extendedHandlers(db: Db): Record<ExtendedCapabilityName, CapabilityHandler> {
  return {
    'platform.project.delete': async (input, actor) => {
      const data = parseOrThrow(idInputSchema, input);
      return deleteProjectForActor(db, actor, data.id);
    },
    'lab.search.get': async (input, actor) => {
      const data = parseOrThrow(idInputSchema, input);
      return getSearchForActor(db, actor, data.id);
    },
    'lab.result.get': async (input, actor) => {
      const data = parseOrThrow(idInputSchema, input);
      return getResultForActor(db, actor, data.id);
    },
    'lab.run.cancel': async (input, actor) => {
      const data = parseOrThrow(idInputSchema, input);
      return cancelRunForActor(db, actor, data.id);
    },
    'lab.group.list': async (input, actor) => {
      const data = parseOrThrow(projectIdInputSchema, input);
      return computeDedupGroupsForActor(db, actor, data.projectId);
    },
    'lab.group.confirm': async (input, actor) => {
      const data = parseOrThrow(idInputSchema, input);
      return confirmGroupForActor(db, actor, data.id);
    },
    'lab.group.reject': async (input, actor) => {
      const data = parseOrThrow(idInputSchema, input);
      return rejectGroupForActor(db, actor, data.id);
    },
    'lab.tag.ensure': async (input, actor) => {
      const data = parseOrThrow(z.object({ projectId: z.string() }), input);
      return ensureDefaultTags(db, actor, data.projectId);
    },
    'lab.tag.list': async (input, actor) => {
      const data = parseOrThrow(z.object({ projectId: z.string() }), input);
      return listTagsForActor(db, actor, data.projectId);
    },
    'lab.tag.create': async (input, actor) => {
      const data = parseOrThrow(tagCreateInputSchema, input);
      return createTagForActor(db, actor, data.projectId, data.input);
    },
    'lab.group.tag.attach': async (input, actor) => {
      const data = parseOrThrow(groupTagInputSchema, input);
      return attachTagForActor(db, actor, data.groupId, data.tagId);
    },
    'lab.group.tag.detach': async (input, actor) => {
      const data = parseOrThrow(groupTagInputSchema, input);
      return detachTagForActor(db, actor, data.groupId, data.tagId);
    },
    'lab.group.pin.set': async (input, actor) => {
      const data = parseOrThrow(pinSetInputSchema, input);
      return setPinForActor(db, actor, data.groupId, data.input);
    },
    'lab.group.pin.clear': async (input, actor) => {
      const data = parseOrThrow(idInputSchema, input);
      return clearPinForActor(db, actor, data.id);
    },
  };
}

export function buildExecutor(db: Db): CapabilityExecutor {
  const base = createExecutor(registryHandlers(db));
  const extended = extendedHandlers(db);
  return async function executeCapability(
    name: CapabilityName | ExtendedCapabilityName | string,
    input: unknown,
    actor: ActorContext,
  ): Promise<unknown> {
    if (isExtendedCapability(name)) {
      return extended[name](input, actor);
    }
    return base(name, input, actor);
  };
}

// Chamada de rota: aguarda a promise do execute() e traduz erro tipado em
// resposta HTTP com os mesmos codigos de antes. O call-site passa
// `execute('nome.capability', input, actor)` direto (toda rota invoca o
// executor literalmente). Retorna `{ replied: true }` quando ja respondeu
// (o caller deve `return`); erro desconhecido e relancado (→ 500 no
// errorHandler global, como antes).
export async function callCapability<T>(
  promise: Promise<unknown>,
  reply: FastifyReply,
  requestId: string,
): Promise<{ replied: true } | { replied: false; value: T }> {
  try {
    const value = (await promise) as T;
    return { replied: false, value };
  } catch (error) {
    const mapped = toHttpError(error, requestId);
    if (mapped === null) {
      throw error;
    }
    await reply.code(mapped.status).send(mapped.envelope);
    return { replied: true };
  }
}

// ---------------------------------------------------------------------------
// Montagem de exportacao (movida da rota lab.ts sem mudar semantica).
// ---------------------------------------------------------------------------

export interface ExportAssembly {
  projectTitle: string;
  entries: CorpusEntryDTO[];
  members: ExportMemberRaw[];
  provenance: ExportProvenance;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assembleExport(
  db: Db,
  actor: ActorContext,
  projectId: string,
  query: ExportQuery,
): Promise<ExportAssembly | null> {
  const project = await getProjectForActor(db, actor, projectId);
  if (project === null) {
    return null;
  }
  const overflow = {
    message: 'Seleção excede o limite de 1000 grupos para exportação.',
  };
  if (query.scope === 'corpus') {
    const all: CorpusEntryDTO[] = [];
    let cursor: string | undefined = undefined;
    for (;;) {
      const page = await getCorpusForActor(db, actor, projectId, { limit: 100, cursor });
      all.push(...page.items);
      if (all.length > EXPORT_MAX_GROUPS) {
        throw new CapabilityValidationError(overflow);
      }
      if (page.page.nextCursor === null) {
        break;
      }
      cursor = page.page.nextCursor;
    }
    const groupIds = all.map((e) => e.groupId);
    const members = await listExportMembersForActor(db, actor, projectId, groupIds);
    const provenance = await getExportProvenanceForActor(db, actor, projectId);
    if (members === null || provenance === null) {
      return null;
    }
    return { projectTitle: project.title, entries: all, members, provenance };
  }
  if (query.selection === undefined || query.selection.trim().length === 0) {
    throw new CapabilityValidationError({
      message: 'Seleção é obrigatória para scope=selection.',
    });
  }
  const ids = query.selection
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (
    ids.length < 1 ||
    ids.length > EXPORT_MAX_GROUPS ||
    ids.some((id) => !UUID_PATTERN.test(id))
  ) {
    throw new CapabilityValidationError(overflow);
  }
  const resolved = await resolveSelectionGroupsForActor(db, actor, projectId, ids);
  if (resolved === null) {
    return null;
  }
  const entries: CorpusEntryDTO[] = [];
  let cursor: string | undefined = undefined;
  for (;;) {
    const page = await getCorpusForActor(db, actor, projectId, { limit: 100, cursor });
    for (const e of page.items) {
      if (resolved.includes(e.groupId)) {
        entries.push(e);
      }
    }
    if (page.page.nextCursor === null) {
      break;
    }
    cursor = page.page.nextCursor;
  }
  const members = await listExportMembersForActor(db, actor, projectId, resolved);
  const provenance = await getExportProvenanceForActor(db, actor, projectId);
  if (members === null || provenance === null) {
    return null;
  }
  return {
    projectTitle: project.title,
    entries,
    members: members.filter((m) => resolved.includes(m.groupId)),
    provenance,
  };
}

// Exportacao (D-50..D-53): attachment com filename ASCII + 3 content-types.
// Movido da rota lab.ts sem mudar semantica; a rota so resolve escopo via
// execute('lab.project.export', ...) e chama esta funcao HTTP.
export async function sendExport(
  reply: FastifyReply,
  projectId: string,
  projectTitle: string,
  format: 'csv' | 'bibtex' | 'json',
  entries: CorpusEntryDTO[],
  extra: { members: ExportMemberRaw[]; provenance: ExportProvenance },
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    reply.header(
      'Content-Disposition',
      `attachment; filename="${exportFilename(projectTitle, date, 'csv')}"`,
    );
    reply.type('text/csv; charset=utf-8');
    await reply.send(toCSV(entries));
    return;
  }
  if (format === 'bibtex') {
    reply.header(
      'Content-Disposition',
      `attachment; filename="${exportFilename(projectTitle, date, 'bib')}"`,
    );
    reply.type('application/x-bibtex; charset=utf-8');
    await reply.send(toBibTeX(entries));
    return;
  }
  reply.header(
    'Content-Disposition',
    `attachment; filename="${exportFilename(projectTitle, date, 'json')}"`,
  );
  reply.type('application/json; charset=utf-8');
  await reply.send(
    toExportJSON(projectId, entries, { members: extra.members, provenance: extra.provenance }),
  );
}
