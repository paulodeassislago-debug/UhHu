// apps/core-api — rotas /api/v1/projects/* (LAB-01, PLAT-03, CORE-01).
//
// `buildProjectRoutes(app, db)` registra o plugin sem tocar no boot (wiring e
// do 02-04). `ownerId` vem SEMPRE de `request.actor` (sessao via requireAuth
// ou Bearer PAT); body/query NUNCA fornecem owner. Fora do escopo -> 404
// NOT_FOUND identico a inexistente ("Recurso não encontrado.", sem distinguir
// motivo). Arquivar = PATCH { status: 'archived' }; reativar = PATCH
// { status: 'active' } (D-24). Excluir exige ?confirm=true (400
// CONFIRMATION_REQUIRED sem ele).
//
// Adaptadores finos sobre execute() (05-02, CORE-02): casos de uso via
// `../capabilities.js` (acesso direto ao `lib` proibido aqui). Status e mensagens identicos aos de
// antes do refactor.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  buildEnvelope,
  createProjectSchema,
  paginationQuerySchema,
  updateProjectSchema,
  type ProjectDTO,
} from '@uhhu/contracts';
import type { Db } from '@uhhu/db';
import { requireAuth } from '../auth/requireAuth.js';
import { buildExecutor, callCapability, type ListProjectsResult } from '../capabilities.js';

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

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
});

const deleteQuerySchema = z.object({
  confirm: z.string().optional(),
});

// Clamp DoS (T-02-03-04): `limit` numerico fora de 1..100 e ajustado antes do
// Zod, para `?limit=999` responder 100 items (maximo D-27) em vez de 400.
// Nao-numerico continua 400 VALIDATION_ERROR via coercao do contrato.
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

export async function buildProjectRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const execute = buildExecutor(db);

  app.post(
    '/api/v1/projects',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
        return;
      }
      const got = await callCapability<ProjectDTO>(
        execute('platform.project.create', parsed.data, actor),
        reply,
        requestId,
      );
      if (got.replied) {
        return;
      }
      await reply.code(201).send(got.value);
    },
  );

  app.get(
    '/api/v1/projects',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = listQuerySchema.safeParse(withClampedLimit(request.query));
      if (!parsed.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
        return;
      }
      const got = await callCapability<ListProjectsResult>(
        execute(
          'platform.project.list',
          { limit: parsed.data.limit, cursor: parsed.data.cursor, status: parsed.data.status },
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
    '/api/v1/projects/:id',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = idParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const got = await callCapability<ProjectDTO | null>(
        execute('platform.project.get', { id: parsed.data.id }, actor),
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
    '/api/v1/projects/:id',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = idParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const body = updateProjectSchema.safeParse(request.body);
      if (!body.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, body.error.flatten()));
        return;
      }
      const got = await callCapability<ProjectDTO | null>(
        execute('platform.project.update', { id: params.data.id, patch: body.data }, actor),
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
    '/api/v1/projects/:id',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const params = idParamsSchema.safeParse(request.params);
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
        execute('platform.project.delete', { id: params.data.id }, actor),
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
}
