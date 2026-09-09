// apps/core-api — GET /health completo (D-09).
//
// Corpo fixo em EXATAMENTE 4 campos: status, db, version, migrationsApplied.
// Sem prefixo /api/v1 (D-09 literal). Health nunca 500 por design: qualquer
// excecao vira degraded + HTTP 200, sem stack trace. NENHUM campo de env,
// config, URL ou senha na resposta. Sem acesso SQL direto: a checagem do
// banco vive em @uhhu/db (checkDatabase).

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { checkDatabase, type Db } from '@uhhu/db';

export const APP_VERSION = '0.1.0-fase1';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'ok' | 'degraded';
  version: string;
  migrationsApplied: number;
}

export interface HealthRouteOptions {
  db: Db;
}

// IDs recebidos fora do alfabeto seguro sao descartados e substituidos:
// header HTTP nao pode conter CRLF/espacos de controle, e um valor malicioso
// nao pode derrubar o /health (health nunca 500 por design).
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:~-]{1,128}$/;
function resolveRequestId(header: string | string[] | undefined): string {
  if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header.trim())) {
    return header.trim();
  }
  return randomUUID();
}

export async function healthRoute(app: FastifyInstance, opts: HealthRouteOptions): Promise<void> {
  app.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    reply.header('x-request-id', requestId);
    try {
      const check = await checkDatabase(opts.db);
      const body: HealthResponse = check.ok
        ? {
            status: 'ok',
            db: 'ok',
            version: APP_VERSION,
            migrationsApplied: check.migrationsApplied,
          }
        : {
            status: 'degraded',
            db: 'degraded',
            version: APP_VERSION,
            migrationsApplied: check.migrationsApplied,
          };
      return reply.code(200).send(body);
    } catch {
      const body: HealthResponse = {
        status: 'degraded',
        db: 'degraded',
        version: APP_VERSION,
        migrationsApplied: 0,
      };
      return reply.code(200).send(body);
    }
  });
}
