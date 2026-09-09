// apps/core-api — boot Fastify do UhHu CORE compartilhado (D-09/D-10).
//
// Conecta com createDb(env.APP_DATABASE_URL): role de runtime uhhu_app
// (menor privilegio, DML apenas) — prova viva da separacao de roles.
// Logger com redact de authorization/cookie; bind 127.0.0.1 no DEV.

import Fastify from 'fastify';
import { env } from '@uhhu/config';
import { createDb } from '@uhhu/db';
import { healthRoute } from './health.js';

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
});

await app.register(healthRoute, { db: createDb(env.APP_DATABASE_URL) });

// DEV restrito a localhost/tailnet (05-infra §2); prod atras de TLS/nginx.
const host = env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

await app.listen({ port: env.PORT, host });
