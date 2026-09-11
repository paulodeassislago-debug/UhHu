// apps/core-api — rotas /api/v1/lab/* + /api/v1/jobs/* (LAB-02/03/05/12, CORE-03/04; D-28–D-30/D-33/D-37–D-39).
//
// `buildLabRoutes(app, db)` registra o plugin sem tocar no boot (o wiring vive
// no index.ts, ao lado de auth/projects, com o mesmo db único uhhu_app). TODA
// rota exige `requireAuth(db)`; `ownerId` vem SEMPRE de `request.actor`
// (sessão via cookie ou Bearer PAT), nunca do body/query. Fora do escopo →
// 404 NOT_FOUND idêntico a inexistente (inclui jobs). Rotas fora deste slice
// caem no notFoundHandler global — 404 natural, sem stub.
//
// Adaptadores finos sobre execute() (05-02, CORE-02): casos de uso via
// `../capabilities.js` (registry §10 + extensoes 05-02; acesso direto ao
// `lib` proibido aqui). Status e mensagens identicos aos de antes do refactor.
//
// Semântica de POST .../runs (D-28/D-30/D-37/D-39):
// - concluiu dentro de 25s → 201 com o SearchRunDTO (QUALQUER status final,
//   inclusive partial/failed — o recurso run foi criado; run failed NÃO vira
//   502, o status carrega o erro por fonte);
// - estourou 25s → 202 com o SearchRunDTO corrente (running) + header
//   `Location: /api/v1/jobs/<runId>`; a execução continua em background
//   atualizando a mesma linha (Job=Run 1:1, D-30);
// - replay idempotente → 200 + header `Idempotent-Replayed: true`;
// - erros tipados do lib viram envelope PT-BR: SourceDisabledError → 400
//   SOURCE_DISABLED (D-33, oasisbr), IdempotencyConflictError → 422
//   IDEMPOTENCY_CONFLICT, RunRateLimitedError → 429 RATE_LIMITED (D-39).

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  buildEnvelope,
  compareQuerySchema,
  corpusQuerySchema,
  createSearchSchema,
  createTagSchema,
  decisionInputSchema,
  divergenceInputSchema,
  exportQuerySchema,
  labSourceSchema,
  paginationQuerySchema,
  pinInputSchema,
  resultsQuerySchema,
  updateSearchSchema,
  type CompareDTO,
  type DedupGroupDTO,
  type JobDTO,
  type ProjectDTO,
  type ResultDTO,
  type SearchDTO,
  type SearchRunDTO,
  type SourceHealthDTO,
} from '@uhhu/contracts';
import type { SourceRegistryEntry } from '@uhhu/integrations';
import type { Db } from '@uhhu/db';
import { requireAuth } from '../auth/requireAuth.js';
import {
  buildExecutor,
  callCapability,
  sendExport,
  toHttpError,
  type CancelRunResult,
  type CorpusListResult,
  type ExecuteSearchRunResult,
  type ExportAssembly,
  type ListResultsResult,
  type ListRunsResult,
  type ListSearchesResult,
  type ProjectTag,
} from '../capabilities.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:~-]{1,128}$/;

function resolveRequestId(request: FastifyRequest): string {
  const holder: unknown = (request as unknown as { requestId?: unknown }).requestId;
  if (typeof holder === 'string' && REQUEST_ID_PATTERN.test(holder.trim())) {
    return holder.trim();
  }
  const header: unknown = request.headers['x-request-id'];
  if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header.trim())) {
    return header.trim();
  }
  return randomUUID();
}

// Clamp DoS (molde projects.ts, T-02-03-04): `limit` numérico fora de 1..100
// é ajustado antes do Zod; não-numérico continua 400 VALIDATION_ERROR via
// coerção do contrato.
function withClampedLimit(query: unknown): unknown {
  if (typeof query !== 'object' || query === null) {
    return query;
  }
  const record = query as Record<string, unknown>;
  const raw: unknown = record['limit'];
  if (raw === undefined) {
    return query;
  }
  const num = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : Number.NaN;
  if (!Number.isFinite(num)) {
    return query;
  }
  const clamped = Math.min(100, Math.max(1, Math.trunc(num)));
  if (clamped === num) {
    return query;
  }
  return { ...record, limit: clamped };
}

// Orçamento sync da rota (D-28; espelha MAX_SYNC_MS do lib searchRuns: a rota
// corre `executeSearchRun` contra 25000ms — venceu a race sem concluir → 202
// + polling em GET /jobs/:id, com a execução seguindo em background).
const SYNC_TIMEOUT_MS = 25000;

const SYNC_TIMEOUT = Symbol('lab-sync-timeout');

// Idempotency-Key (D-39; T-03-05-04): opcional, mesma allowlist das rotas
// (1..128 chars). Malformada → 400 VALIDATION_ERROR, nunca ignorada em
// silêncio; o corpo comparado é o snapshot server-side (nunca vem do cliente).
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:~-]{1,128}$/;

function resolveIdempotencyKey(request: FastifyRequest): string | null | 'invalid' {
  const raw: unknown = request.headers['idempotency-key'];
  if (raw === undefined) {
    return null;
  }
  if (typeof raw !== 'string') {
    return 'invalid';
  }
  const key = raw.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return 'invalid';
  }
  return key;
}

const searchIdParamsSchema = z.object({
  searchId: z.string().uuid(),
});

const runIdParamsSchema = z.object({
  runId: z.string().uuid(),
});

const jobIdParamsSchema = z.object({
  jobId: z.string().uuid(),
});

const resultIdParamsSchema = z.object({
  resultId: z.string().uuid(),
});

const groupIdParamsSchema = z.object({
  groupId: z.string().uuid(),
});

const projectIdParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const groupTagParamsSchema = z.object({
  groupId: z.string().uuid(),
  tagId: z.string().uuid(),
});

const attachTagBodySchema = z.object({
  tagId: z.string().uuid(),
});

const sourceNameParamsSchema = z.object({
  sourceName: labSourceSchema,
});

const listSearchesQuerySchema = paginationQuerySchema.extend({
  projectId: z.string().uuid(),
});

const deleteQuerySchema = z.object({
  confirm: z.string().optional(),
});

// Job=Run 1:1 (D-30): o JobDTO é uma projeção do SearchRunDTO da mesma linha.
// createdAt ← executedAt (o run nasce na execução); progress null em queued
// (nada iniciado); resultRef só em estado terminal.
function toJobDTO(run: SearchRunDTO): JobDTO {
  const terminal =
    run.status === 'succeeded' ||
    run.status === 'partial' ||
    run.status === 'failed' ||
    run.status === 'cancelled';
  const perSource = run.metrics.perSource;
  const doneSources =
    (perSource['bdtd'].status !== 'skipped' ? 1 : 0) +
    (perSource['capes'].status !== 'skipped' ? 1 : 0);
  return {
    id: run.id,
    type: 'lab.search.execute',
    status: run.status,
    progress:
      run.status === 'queued' ? null : { doneSources, totalSources: run.sourcesSnapshot.length },
    createdAt: run.executedAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    resultRef: terminal ? { runId: run.id } : null,
    error: run.error,
  };
}

export async function buildLabRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const execute = buildExecutor(db);

  app.post(
    '/api/v1/lab/searches',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = createSearchSchema.safeParse(request.body);
      if (!parsed.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
        return;
      }
      const got = await callCapability<SearchDTO | null>(
        execute('lab.search.create', parsed.data, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(201).send(got.value);
    },
  );

  app.get(
    '/api/v1/lab/searches',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = listSearchesQuerySchema.safeParse(withClampedLimit(request.query));
      if (!parsed.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
        return;
      }
      const scoped = await callCapability<ProjectDTO | null>(
        execute('platform.project.get', { id: parsed.data.projectId }, actor),
        reply,
        requestId,
      );
      if (scoped.replied) {
        return;
      }
      if (scoped.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<ListSearchesResult>(
        execute(
          'lab.search.list',
          {
            projectId: parsed.data.projectId,
            limit: parsed.data.limit,
            cursor: parsed.data.cursor,
          },
          actor,
        ),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      await reply.code(200).send({ items: got.value.items, page: got.value.page });
    },
  );

  app.get(
    '/api/v1/lab/searches/:searchId',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = searchIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<SearchDTO | null>(
        execute('lab.search.get', { id: parsed.data.searchId }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.patch(
    '/api/v1/lab/searches/:searchId',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = searchIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const body = updateSearchSchema.safeParse(request.body);
      if (!body.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, body.error.flatten()));
        return;
      }
      const got = await callCapability<SearchDTO | null>(
        execute('lab.search.update', { id: params.data.searchId, patch: body.data }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.delete(
    '/api/v1/lab/searches/:searchId',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = searchIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const query = deleteQuerySchema.safeParse(request.query);
      const confirm = query.success ? query.data.confirm : undefined;
      if (confirm !== 'true') {
        await reply.code(400).send(buildEnvelope('CONFIRMATION_REQUIRED', requestId, {}));
        return;
      }
      const got = await callCapability<boolean>(
        execute('lab.search.delete', { id: params.data.searchId }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (!got.value) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/lab/searches/:searchId/runs',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = searchIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const idempotencyKey = resolveIdempotencyKey(request);
      if (idempotencyKey === 'invalid') {
        await reply.code(400).send(buildEnvelope('VALIDATION_ERROR', requestId, {}));
        return;
      }
      const searchId = params.data.searchId;
      const execPromise = execute(
        'lab.search.execute',
        { searchId, ...(idempotencyKey === null ? {} : { idempotencyKey }) },
        actor,
      ) as Promise<ExecuteSearchRunResult | null>;
      let timer: ReturnType<typeof setTimeout> | undefined = undefined;
      const timeoutPromise = new Promise<typeof SYNC_TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(SYNC_TIMEOUT), SYNC_TIMEOUT_MS);
      });
      let settled: ExecuteSearchRunResult | null | typeof SYNC_TIMEOUT;
      try {
        settled = await Promise.race([execPromise, timeoutPromise]);
      } catch (error) {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        const mapped = toHttpError(error, requestId);
        if (mapped === null) {
          throw error;
        }
        await reply.code(mapped.status).send(mapped.envelope);
        return;
      }
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      if (settled === SYNC_TIMEOUT) {
        // A execução continua em background atualizando a mesma linha; o
        // cliente faz polling em GET /jobs/:id. Loga falha tardia sem vazar
        // segredos na resposta (a race já observa a rejeição; este handler é
        // só observabilidade server-side).
        execPromise.then(
          () => undefined,
          (err: unknown) => request.log.warn({ err, requestId }, 'background search run failed'),
        );
        const history = await callCapability<ListRunsResult>(
          execute('lab.run.list', { searchId, limit: 1 }, actor),
          reply,
          requestId,
        );
        if (history.replied) {
          return;
        }
        const current = history.value.items[0];
        if (current === undefined) {
          // Corrida extrema (linha ainda não visível): aguarda o desfecho
          // real em vez de inventar um 202 sem run.
          try {
            const late = await execPromise;
            if (late === null) {
              await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
              return;
            }
            if (late.replayed) {
              reply.header('Idempotent-Replayed', 'true');
              await reply.code(200).send(late.run);
              return;
            }
            await reply.code(201).send(late.run);
            return;
          } catch (error) {
            const mapped = toHttpError(error, requestId);
            if (mapped === null) {
              throw error;
            }
            await reply.code(mapped.status).send(mapped.envelope);
            return;
          }
        }
        reply.header('Location', `/api/v1/jobs/${current.id}`);
        await reply.code(202).send(current);
        return;
      }
      if (settled === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      if (settled.replayed) {
        reply.header('Idempotent-Replayed', 'true');
        await reply.code(200).send(settled.run);
        return;
      }
      await reply.code(201).send(settled.run);
    },
  );

  app.get(
    '/api/v1/lab/searches/:searchId/runs',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = searchIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const scoped = await callCapability<SearchDTO | null>(
        execute('lab.search.get', { id: params.data.searchId }, actor),
        reply,
        requestId,
      );
      if (scoped.replied) {
        return;
      }
      if (scoped.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const parsed = paginationQuerySchema.safeParse(withClampedLimit(request.query));
      if (!parsed.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
        return;
      }
      const got = await callCapability<ListRunsResult>(
        execute(
          'lab.run.list',
          { searchId: params.data.searchId, limit: parsed.data.limit, cursor: parsed.data.cursor },
          actor,
        ),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      await reply.code(200).send({ items: got.value.items, page: got.value.page });
    },
  );

  app.get(
    '/api/v1/lab/runs/:runId',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = runIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<SearchRunDTO | null>(
        execute('lab.run.get', { id: parsed.data.runId }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.get(
    '/api/v1/lab/runs/:runId/results',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = runIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const scoped = await callCapability<SearchRunDTO | null>(
        execute('lab.run.get', { id: params.data.runId }, actor),
        reply,
        requestId,
      );
      if (scoped.replied) {
        return;
      }
      const run = scoped.value;
      if (run === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const parsed = resultsQuerySchema.safeParse(withClampedLimit(request.query));
      if (!parsed.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
        return;
      }
      const got = await callCapability<ListResultsResult>(
        execute(
          'lab.run.results.list',
          { runId: params.data.runId, limit: parsed.data.limit, cursor: parsed.data.cursor },
          actor,
        ),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      await reply.code(200).send({
        items: got.value.items,
        page: got.value.page,
        total: got.value.total,
        newCount: run.metrics.newCount,
      });
    },
  );

  app.get(
    '/api/v1/lab/results/:resultId',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = resultIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<ResultDTO | null>(
        execute('lab.result.get', { id: parsed.data.resultId }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.get(
    '/api/v1/lab/sources',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const got = await callCapability<SourceRegistryEntry[]>(
        execute('lab.source.list', {}, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.get(
    '/api/v1/lab/sources/:sourceName/health',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = sourceNameParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<SourceHealthDTO>(
        execute('lab.source.health', { source: parsed.data.sourceName }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.get(
    '/api/v1/jobs/:jobId',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = jobIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<SearchRunDTO | null>(
        execute('lab.run.get', { id: parsed.data.jobId }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(toJobDTO(got.value));
    },
  );

  app.post(
    '/api/v1/jobs/:jobId/cancel',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = jobIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<CancelRunResult | null>(
        execute('lab.run.cancel', { id: parsed.data.jobId }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value.run);
    },
  );

  // -- Revisao/corpus (D-40..D-49): molde Zod + requireAuth + 404 identico. --

  app.get(
    '/api/v1/lab/projects/:projectId/groups',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = projectIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const parsed = corpusQuerySchema.safeParse(withClampedLimit(request.query));
      if (!parsed.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
        return;
      }
      const scoped = await callCapability<ProjectDTO | null>(
        execute('platform.project.get', { id: params.data.projectId }, actor),
        reply,
        requestId,
      );
      if (scoped.replied) {
        return;
      }
      if (scoped.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const grouped = await callCapability<DedupGroupDTO[]>(
        execute('lab.group.list', { projectId: params.data.projectId }, actor),
        reply,
        requestId,
      );
      if (grouped.replied) {
        return;
      }
      const groups = grouped.value;
      const filtered =
        parsed.data.status === undefined
          ? groups
          : groups.filter((g) => g.status === parsed.data.status);
      const limit = parsed.data.limit;
      let start = 0;
      if (parsed.data.cursor !== undefined && parsed.data.cursor.length > 0) {
        try {
          const decoded = Buffer.from(parsed.data.cursor, 'base64url').toString('utf8');
          const idx = filtered.findIndex((g) => g.id === decoded);
          start = idx < 0 ? 0 : idx + 1;
        } catch {
          start = 0;
        }
      }
      const slice = filtered.slice(start, start + limit + 1);
      const hasMore = slice.length > limit;
      const pageRows = hasMore ? slice.slice(0, limit) : slice;
      const last = pageRows[pageRows.length - 1];
      await reply.code(200).send({
        items: pageRows,
        page: {
          limit,
          nextCursor:
            hasMore && last !== undefined
              ? Buffer.from(last.id, 'utf8').toString('base64url')
              : null,
          hasMore,
        },
      });
    },
  );

  app.post(
    '/api/v1/lab/groups/:groupId/confirm',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = groupIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<DedupGroupDTO | null>(
        execute('lab.group.confirm', { id: parsed.data.groupId }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.post(
    '/api/v1/lab/groups/:groupId/reject',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = groupIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<DedupGroupDTO[] | null>(
        execute('lab.group.reject', { id: parsed.data.groupId }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send({ singles: got.value });
    },
  );

  app.put(
    '/api/v1/lab/groups/:groupId/decision',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = groupIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const body = decisionInputSchema.safeParse(request.body);
      if (!body.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, body.error.flatten()));
        return;
      }
      const got = await callCapability<DedupGroupDTO | null>(
        execute(
          'lab.result.decision.update',
          { groupId: params.data.groupId, input: body.data },
          actor,
        ),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.get(
    '/api/v1/lab/projects/:projectId/tags',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = projectIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const ensured = await callCapability<ProjectTag[] | null>(
        execute('lab.tag.ensure', { projectId: parsed.data.projectId }, actor),
        reply,
        requestId,
      );
      if (ensured.replied) {
        return;
      }
      if (ensured.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<ProjectTag[] | null>(
        execute('lab.tag.list', { projectId: parsed.data.projectId }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.post(
    '/api/v1/lab/projects/:projectId/tags',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = projectIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const body = createTagSchema.safeParse(request.body);
      if (!body.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, body.error.flatten()));
        return;
      }
      const ensured = await callCapability<ProjectTag[] | null>(
        execute('lab.tag.ensure', { projectId: params.data.projectId }, actor),
        reply,
        requestId,
      );
      if (ensured.replied) {
        return;
      }
      if (ensured.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<ProjectTag | null>(
        execute('lab.tag.create', { projectId: params.data.projectId, input: body.data }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(201).send(got.value);
    },
  );

  app.post(
    '/api/v1/lab/groups/:groupId/tags',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = groupIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const body = attachTagBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, body.error.flatten()));
        return;
      }
      const got = await callCapability<DedupGroupDTO | null>(
        execute(
          'lab.group.tag.attach',
          { groupId: params.data.groupId, tagId: body.data.tagId },
          actor,
        ),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.delete(
    '/api/v1/lab/groups/:groupId/tags/:tagId',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = groupTagParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<boolean>(
        execute(
          'lab.group.tag.detach',
          { groupId: parsed.data.groupId, tagId: parsed.data.tagId },
          actor,
        ),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (!got.value) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(204).send();
    },
  );

  app.put(
    '/api/v1/lab/groups/:groupId/divergence',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = groupIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const body = divergenceInputSchema.safeParse(request.body);
      if (!body.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, body.error.flatten()));
        return;
      }
      const got = await callCapability<DedupGroupDTO | null>(
        execute(
          'lab.result.duplicate.diverge',
          { groupId: params.data.groupId, input: body.data },
          actor,
        ),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.put(
    '/api/v1/lab/groups/:groupId/pin',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = groupIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const body = pinInputSchema.safeParse(request.body);
      if (!body.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, body.error.flatten()));
        return;
      }
      const got = await callCapability<DedupGroupDTO | null>(
        execute('lab.group.pin.set', { groupId: params.data.groupId, input: body.data }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.delete(
    '/api/v1/lab/groups/:groupId/pin',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = groupIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<DedupGroupDTO | null>(
        execute('lab.group.pin.clear', { id: parsed.data.groupId }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/lab/projects/:projectId/corpus',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = projectIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const parsed = corpusQuerySchema.safeParse(withClampedLimit(request.query));
      if (!parsed.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
        return;
      }
      const scoped = await callCapability<ProjectDTO | null>(
        execute('platform.project.get', { id: params.data.projectId }, actor),
        reply,
        requestId,
      );
      if (scoped.replied) {
        return;
      }
      if (scoped.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<CorpusListResult>(
        execute(
          'lab.corpus.get',
          {
            projectId: params.data.projectId,
            limit: parsed.data.limit,
            cursor: parsed.data.cursor,
          },
          actor,
        ),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      await reply.code(200).send({ items: got.value.items, page: got.value.page });
    },
  );

  app.get(
    '/api/v1/lab/searches/:searchId/compare',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = searchIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const parsed = compareQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
        return;
      }
      const withIds = parsed.data.with
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (
        withIds.length < 1 ||
        withIds.length > 10 ||
        withIds.some((id) => !uuidPattern.test(id))
      ) {
        await reply.code(400).send(buildEnvelope('VALIDATION_ERROR', requestId, {}));
        return;
      }
      const got = await callCapability<CompareDTO | null>(
        execute('lab.search.compare', { searchId: params.data.searchId, with: withIds }, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(got.value);
    },
  );

  app.get(
    '/api/v1/lab/projects/:projectId/export',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = projectIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const parsed = exportQuerySchema.safeParse(withClampedLimit(request.query));
      if (!parsed.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
        return;
      }
      const got = await callCapability<ExportAssembly | null>(
        execute(
          'lab.project.export',
          {
            projectId: params.data.projectId,
            format: parsed.data.format,
            scope: parsed.data.scope,
            selection: parsed.data.selection,
          },
          actor,
        ),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      if (got.value === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await sendExport(
        reply,
        params.data.projectId,
        got.value.projectTitle,
        parsed.data.format,
        got.value.entries,
        {
          members: got.value.members,
          provenance: got.value.provenance,
        },
      );
    },
  );
}
