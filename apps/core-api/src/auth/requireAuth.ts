// apps/core-api — guards de autenticacao/autorizacao (D-15, D-23, T-02-02-04).
//
// `requireAuth(db)` le o cookie `uhhu_session`, resolve a sessao server-side
// e injeta `request.actor: ActorContext` (derivado da sessao, NUNCA do body).
// Falha sempre 401 UNAUTHENTICATED generico, sem distinguir token invalido,
// expirado ou ausente. O sliding (`touchSession`) roda em background: erro
// nele nunca bloqueia nem derruba a resposta.
//
// `requireAdmin` e o segundo preHandler (apos `requireAuth`): sem sessao 401;
// com sessao nao-admin 403. Escolha documentada: o catalogo PT-BR nao tem
// code proprio para "nao-admin" e inventar code fora do catalogo quebraria
// o i18n-ready (D-25); responder 403 com o code estavel UNAUTHENTICATED
// (message "Autenticação necessária.") preserva o status HTTP correto sem
// vazar papeis — e NAO usa NOT_FOUND aqui (404 e para recursos, nao para
// falta de privilegio em rota administrativa conhecida).

import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildEnvelope } from '@uhhu/contracts';
import type { ActorContext } from '@uhhu/core';
import type { Db } from '@uhhu/db';
import { COOKIE_NAME, resolveSession, touchSession } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor?: ActorContext;
  }
}

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

function readSessionCookie(request: FastifyRequest): string | null {
  const holder: unknown = (request as unknown as { cookies?: unknown }).cookies;
  if (typeof holder !== 'object' || holder === null) {
    return null;
  }
  const value: unknown = (holder as Record<string, unknown>)[COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toActorRole(role: string): ActorContext['role'] {
  return role === 'admin' ? 'admin' : 'member';
}

export function requireAuth(db: Db) {
  return async function requireAuthHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const requestId = resolveRequestId(request);
    const rawToken = readSessionCookie(request);
    if (rawToken === null) {
      reply.header('x-request-id', requestId);
      await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
      return;
    }
    const resolved = await resolveSession(db, rawToken);
    if (resolved === null) {
      reply.header('x-request-id', requestId);
      await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
      return;
    }
    request.actor = {
      userId: resolved.user.id,
      role: toActorRole(resolved.user.role),
      requestId,
      authMethod: 'session',
    };
    // Sliding sem bloquear a resposta; falha de touch vira warn redigido
    // (sem token/senha — so ids tecnicos).
    void touchSession(db, resolved.session, resolved.session.rememberMe).catch((err: unknown) => {
      request.log.warn({ err, requestId }, 'session touch failed');
    });
  };
}

export function requireAdmin() {
  return async function requireAdminHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const requestId = resolveRequestId(request);
    const actor = request.actor;
    if (actor === undefined) {
      reply.header('x-request-id', requestId);
      await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
      return;
    }
    if (actor.role !== 'admin') {
      reply.header('x-request-id', requestId);
      await reply.code(403).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
      return;
    }
  };
}
