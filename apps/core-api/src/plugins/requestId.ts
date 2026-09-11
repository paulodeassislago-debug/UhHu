// apps/core-api — plugin X-Request-Id (T-02-01-01).
//
// Reutiliza o MESMO allowlist do health: header valido -> propaga;
// ausente/invalido -> randomUUID(). Sempre responde `x-request-id` e
// expoe `request.requestId` para logs e envelope de erro.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:~-]{1,128}$/;

function resolveRequestId(header: string | string[] | undefined): string {
  if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header.trim())) {
    return header.trim();
  }
  return randomUUID();
}

export async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    reply.header('x-request-id', requestId);
    request.requestId = requestId;
  });
}
