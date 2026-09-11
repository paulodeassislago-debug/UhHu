// apps/core-api — boot Fastify do UhHu CORE compartilhado (D-09/D-10).
//
// Conecta com createDb(env.APP_DATABASE_URL): role de runtime uhhu_app
// (menor privilegio, DML apenas) — prova viva da separacao de roles.
// Logger com redact de authorization/cookie; bind 127.0.0.1 no DEV.

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import { corsAllowedOrigins, env } from '@uhhu/config';
import { createDb } from '@uhhu/db';
import { buildEnvelope } from '@uhhu/contracts';
import { healthRoute } from './health.js';
import { requestIdPlugin } from './plugins/requestId.js';
import { errorHandler } from './plugins/errorHandler.js';
import { registerRateLimits } from './plugins/rateLimit.js';
import { buildAuthRoutes } from './routes/auth.js';
import { buildLabRoutes } from './routes/lab.js';
import { buildProjectRoutes } from './routes/projects.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:~-]{1,128}$/;

function resolveRequestId(header: string | string[] | undefined): string {
  if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header.trim())) {
    return header.trim();
  }
  return randomUUID();
}

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
});

// Instancia UNICA de DB (runtime uhhu_app) reusada pelo health + produto.
const db = createDb(env.APP_DATABASE_URL);

await app.register(cookie);
// UI-32 (D-03/D-04, T-06-01-01/T-06-01-04): CORS allowlist EXATA do env,
// registrada ANTES das rotas. Sem modo espelhado, sem curinga, sem regex
// espelhada. Sem Origin (curl/server-to-server) → sem ACAO. Origem exata na
// allowlist → reflete + credentials. Qualquer outra → sem ACAO.
// CORS NÃO é autenticação: requireAuth continua exigido (cookie httpOnly +
// Bearer PAT); Vary: Origin via fastify-cors. Env ausente → lista vazia →
// fail-closed (reflete nenhuma origem).
await app.register(cors, {
  origin: (origin, cb) => {
    if (origin === undefined) {
      cb(null, false);
      return;
    }
    const allowlist = corsAllowedOrigins();
    if (allowlist.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
  maxAge: 600,
});
// Plugins chamados direto no root (global): via `app.register` ficariam
// encapsulados e nao valeriam para as rotas irmas; direto no root o
// onRequest/setErrorHandler/preHandler valem para tudo (ver SUMMARY 02-04).
await requestIdPlugin(app);
await errorHandler(app);
await registerRateLimits(app);

await app.register(healthRoute, { db });
await app.register(async (child) => buildAuthRoutes(child, db));
await app.register(async (child) => buildProjectRoutes(child, db));
await app.register(async (child) => buildLabRoutes(child, db));

// Rota inexistente -> envelope NOT_FOUND PT-BR (sem vazar existencia).
app.setNotFoundHandler(async (request, reply) => {
  const requestId = resolveRequestId(request.headers['x-request-id']);
  reply.header('x-request-id', requestId);
  return reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
});

// DEV restrito a localhost/tailnet (05-infra §2); prod atras de TLS/nginx.
const host = env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

await app.listen({ port: env.PORT, host });
