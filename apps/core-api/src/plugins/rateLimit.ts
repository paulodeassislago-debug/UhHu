// apps/core-api — rate limit global + por rota auth (PLAT-05, T-02-04-01).
//
// Estrategia em duas camadas (escolha explicita, sem duplicar rotas):
// 1. Global: `@fastify/rate-limit` com `max: 200, timeWindow: '1 minute'`
//    por IP (in-memory, monolitico v1). O 429 global cai no `errorHandler`
//    (429 -> RATE_LIMITED PT-BR) ou no `errorResponseBuilder` abaixo.
// 2. Por rota auth: hook manual `preHandler` em memoria por IP com janela
//    deslizante, SEM dependencia extra. Motivo: o plugin `fastify/rate-limit`
//    diferencia por rota so via `config.rateLimit` na DECLARACAO da rota —
//    re-declarar as rotas do 02-02/03 aqui duplicaria regra de negocio e
//    quebraria o paralelismo dos planos (so este plano toca `index.ts`).
//    Por isso o throttle fino vive neste hook, inspecionando
//    `request.method + request.url`.
//
// Limites exatos (por IP, janela de 1 minuto):
// - POST /api/v1/auth/login                 -> 10/min  (nao quebra o lockout
//    de 15min por e-mail: o lockout e por e-mail no banco, independente do
//    throttle por IP; throttled retorna RATE_LIMITED sem tocar failedAttempts)
// - POST /api/v1/auth/register              -> 20/min
// - POST /api/v1/auth/invites               -> 20/min
// - POST /api/v1/auth/password/reset-request -> 5/min
// - POST /api/v1/auth/password/reset         -> 5/min
// - POST /api/v1/lab/searches/*/runs        -> 30/min  (anti-rajada por IP;
//    o limite CONTRATUAL de 10 runs/h por USUARIO (D-39) vive no BANCO, em
//    `apps/core-api/src/lib/searchRuns.ts` (sobrevive a restart, contado por
//    created_by+executed_at). Este hook NAO o substitui: 30/min/IP barra
//    rajadas de um mesmo IP; 10/h/usuário barra abuso sustentado por conta.
//    Ambos retornam o mesmo envelope 429 RATE_LIMITED PT-BR.)
// Demais rotas: so o global 200/min.
//
// Janela: Map<chave, number[]> com timestamps; a cada request filtra os
// expirados (O(n) pequeno, ok para v1 monolitico). Map por instancia do
// Fastify (closure do plugin), nao modulo — testes com `inject` isolam.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { buildEnvelope } from '@uhhu/contracts';

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

// Configuracao documentada dos limites finos (fonte para auditoria e SUMMARY).
// Usada pelo hook manual abaixo; valores exigidos pelo plano 02-04.
export const authRateLimit = {
  login: { max: 10, timeWindow: '1 minute' },
  register: { max: 20, timeWindow: '1 minute' },
  invites: { max: 20, timeWindow: '1 minute' },
  reset: { max: 5, timeWindow: '1 minute' },
} as const;

// Bucket anti-rajada de execução de buscas (03-05): 30 POST .../runs por
// minuto por IP. Distinção documentada acima: isto é IP/minuto (hook, em
// memória); o contratual 10 runs/h por usuário (D-39) é no banco.
export const labRunsRateLimit = { max: 30, timeWindow: '1 minute' } as const;

const WINDOW_MS = 60 * 1000;

type AuthBucket = 'login' | 'register' | 'invites' | 'reset' | 'lab-runs';

function bucketFor(method: string, url: string): AuthBucket | null {
  if (method !== 'POST') {
    return null;
  }
  const path = url.split('?')[0] ?? url;
  if (path === '/api/v1/auth/login') {
    return 'login';
  }
  if (path === '/api/v1/auth/register') {
    return 'register';
  }
  if (path === '/api/v1/auth/invites') {
    return 'invites';
  }
  if (path === '/api/v1/auth/password/reset-request' || path === '/api/v1/auth/password/reset') {
    return 'reset';
  }
  if (path.startsWith('/api/v1/lab/searches/') && path.endsWith('/runs')) {
    return 'lab-runs';
  }
  return null;
}

function maxFor(bucket: AuthBucket): number {
  if (bucket === 'login') {
    return authRateLimit.login.max;
  }
  if (bucket === 'register') {
    return authRateLimit.register.max;
  }
  if (bucket === 'invites') {
    return authRateLimit.invites.max;
  }
  if (bucket === 'lab-runs') {
    return labRunsRateLimit.max;
  }
  return authRateLimit.reset.max;
}

export async function registerRateLimits(app: FastifyInstance): Promise<void> {
  // Camada 1 — global 200/min por IP. `errorResponseBuilder` retorna o
  // envelope PT-BR direto (RATE_LIMITED); se o Fastify rotear pelo
  // `errorHandler` global, o mapeamento 429 -> RATE_LIMITED garante o mesmo.
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    errorResponseBuilder: (request: FastifyRequest) => {
      return buildEnvelope('RATE_LIMITED', resolveRequestId(request), {});
    },
  });

  // Camada 2 — throttle fino por rota auth + lab runs (hook manual, ver
  // comentario no topo do arquivo).
  const hits = new Map<string, number[]>();
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const bucket = bucketFor(request.method, request.url);
    if (bucket === null) {
      return;
    }
    const max = maxFor(bucket);
    const key = `${request.ip}:${bucket}`;
    const now = Date.now();
    const prev = hits.get(key) ?? [];
    const fresh = prev.filter((t) => now - t < WINDOW_MS);
    if (fresh.length >= max) {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      await reply.code(429).send(buildEnvelope('RATE_LIMITED', requestId, {}));
      return reply;
    }
    fresh.push(now);
    hits.set(key, fresh);
  });
}

// Alias para o wiring do boot (`await app.register(rateLimitPlugin)`).
export const rateLimitPlugin = registerRateLimits;
