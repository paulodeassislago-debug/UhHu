// apps/core-api — rotas /api/v1/lab/* + /api/v1/jobs/* (LAB-02/03/05/12, CORE-03/04; D-28–D-30/D-33/D-37–D-39).
//
// `buildLabRoutes(app, db)` registra o plugin sem tocar no boot (o wiring vive
// no index.ts, ao lado de auth/projects, com o mesmo db único uhhu_app). TODA
// rota exige `requireAuth(db)`; `ownerId` vem SEMPRE de `request.actor`
// (sessão via cookie), nunca do body/query. Fora do escopo → 404 NOT_FOUND
// idêntico a inexistente (inclui jobs). Rotas fora deste slice caem no
// notFoundHandler global — 404 natural, sem stub.
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
  createSearchSchema,
  labSourceSchema,
  paginationQuerySchema,
  resultsQuerySchema,
  updateSearchSchema,
  type JobDTO,
  type SearchRunDTO,
} from '@uhhu/contracts';
import type { Db } from '@uhhu/db';
import { computeSourceHealth, listSources } from '@uhhu/integrations';
import { requireAuth } from '../auth/requireAuth.js';
import { getProjectForActor } from '../lib/projects.js';
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
} from '../lib/searches.js';
import {
  cancelRunForActor,
  executeSearchRun,
  IdempotencyConflictError,
  RunRateLimitedError,
  SourceDisabledError,
  type ExecuteSearchRunResult,
} from '../lib/searchRuns.js';

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

async function replyRunExecutionError(
  reply: FastifyReply,
  requestId: string,
  error: unknown,
): Promise<void> {
  if (error instanceof SourceDisabledError) {
    await reply.code(400).send(buildEnvelope('SOURCE_DISABLED', requestId, {}));
    return;
  }
  if (error instanceof IdempotencyConflictError) {
    await reply.code(422).send(buildEnvelope('IDEMPOTENCY_CONFLICT', requestId, {}));
    return;
  }
  if (error instanceof RunRateLimitedError) {
    await reply.code(429).send(buildEnvelope('RATE_LIMITED', requestId, {}));
    return;
  }
  throw error;
}

export async function buildLabRoutes(app: FastifyInstance, db: Db): Promise<void> {
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
      const dto = await createSearchForActor(db, actor, parsed.data);
      if (dto === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(201).send(dto);
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
      const project = await getProjectForActor(db, actor, parsed.data.projectId);
      if (project === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const result = await listSearchesForActor(db, actor, parsed.data.projectId, {
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      });
      await reply.code(200).send({ items: result.items, page: result.page });
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
      const dto = await getSearchForActor(db, actor, parsed.data.searchId);
      if (dto === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(dto);
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
      const dto = await updateSearchForActor(db, actor, params.data.searchId, body.data);
      if (dto === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(dto);
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
      const removed = await deleteSearchForActor(db, actor, params.data.searchId);
      if (!removed) {
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
      const execPromise = executeSearchRun(db, actor, searchId, {
        ...(idempotencyKey === null ? {} : { idempotencyKey }),
      });
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
        await replyRunExecutionError(reply, requestId, error);
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
        const history = await listRunsForActor(db, actor, searchId, { limit: 1 });
        const current = history.items[0];
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
            await replyRunExecutionError(reply, requestId, error);
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
      const search = await getSearchForActor(db, actor, params.data.searchId);
      if (search === null) {
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
      const result = await listRunsForActor(db, actor, params.data.searchId, {
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      });
      await reply.code(200).send({ items: result.items, page: result.page });
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
      const dto = await getRunForActor(db, actor, parsed.data.runId);
      if (dto === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(dto);
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
      const run = await getRunForActor(db, actor, params.data.runId);
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
      const result = await listResultsForActor(db, actor, params.data.runId, {
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      });
      await reply.code(200).send({
        items: result.items,
        page: result.page,
        total: result.total,
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
      const dto = await getResultForActor(db, actor, parsed.data.resultId);
      if (dto === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(dto);
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
      await reply.code(200).send(listSources());
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
      const health = await computeSourceHealth(db, parsed.data.sourceName);
      await reply.code(200).send(health);
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
      const run = await getRunForActor(db, actor, parsed.data.jobId);
      if (run === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(toJobDTO(run));
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
      const outcome = await cancelRunForActor(db, actor, parsed.data.jobId);
      if (outcome === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(200).send(outcome.run);
    },
  );
}
