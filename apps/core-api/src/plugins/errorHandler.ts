// apps/core-api — error handler global com envelope PT-BR (D-25, T-02-01-02).
//
// (a) ZodError -> 400 VALIDATION_ERROR com details flatten.
// (b) erros com statusCode -> preserva status com envelope do catalogo.
// (c) resto -> 500 INTERNAL_ERROR generico.
// NUNCA inclui stack/SQL/token na resposta; log carrega requestId
// (logger do boot ja redige authorization/cookie).

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { ERROR_CATALOG, buildEnvelope, type ErrorCode } from '@uhhu/contracts';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:~-]{1,128}$/;

function resolveRequestId(request: FastifyRequest): string {
  const maybeId: unknown = (request as unknown as { requestId?: unknown }).requestId;
  if (typeof maybeId === 'string' && REQUEST_ID_PATTERN.test(maybeId.trim())) {
    return maybeId.trim();
  }
  const header = request.headers['x-request-id'];
  if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header.trim())) {
    return header.trim();
  }
  return randomUUID();
}

function statusCodeToErrorCode(status: number): ErrorCode {
  if (status === 401) {
    return 'UNAUTHENTICATED';
  }
  if (status === 404) {
    return 'NOT_FOUND';
  }
  if (status === 429) {
    return 'RATE_LIMITED';
  }
  if (status === 400) {
    return 'VALIDATION_ERROR';
  }
  return 'INTERNAL_ERROR';
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ERROR_CATALOG;
}

export async function errorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = resolveRequestId(request);
    reply.header('x-request-id', requestId);

    if (error instanceof ZodError) {
      request.log.error({ err: error, requestId }, 'validation failed');
      return reply.code(400).send(buildEnvelope('VALIDATION_ERROR', requestId, error.flatten()));
    }

    const coded: unknown = (error as unknown as { code?: unknown }).code;
    const rawStatus: unknown = (error as unknown as { statusCode?: unknown }).statusCode;

    if (isErrorCode(coded)) {
      const resolvedStatus =
        typeof rawStatus === 'number' &&
        Number.isInteger(rawStatus) &&
        rawStatus >= 400 &&
        rawStatus < 600
          ? rawStatus
          : 500;
      request.log.error({ err: error, requestId, code: coded }, 'request failed');
      return reply.code(resolvedStatus).send(buildEnvelope(coded, requestId, {}));
    }

    if (typeof rawStatus === 'number' && Number.isInteger(rawStatus)) {
      const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
      const code = statusCodeToErrorCode(status);
      request.log.error({ err: error, requestId, code }, 'request failed');
      return reply.code(status).send(buildEnvelope(code, requestId, {}));
    }

    request.log.error({ err: error, requestId }, 'internal error');
    return reply.code(500).send(buildEnvelope('INTERNAL_ERROR', requestId, {}));
  });
}
