// apps/core-api — guards de autenticacao/autorizacao (D-15, D-23, T-02-02-04, D-60–D-63).
//
// `requireAuth(db)` deriva `request.actor: ActorContext` (NUNCA do body) por
// dois caminhos, Bearer-first:
// 1. `Authorization: Bearer <hex64>` → resolvePat (PAT por device); ok gera
//    actor pat + `request.patId` (para o logout revogar o PAT atual, D-61); sliding via `touchPat` em background.
// 2. Sem Bearer → cookie `uhhu_session` → resolveSession (caminho existente,
//    100% intacto) com actor `authMethod: 'session'`.
// Falha sempre 401 UNAUTHENTICATED generico, sem distinguir token invalido,
// expirado, revogado ou ausente — nem formato malformado. O sliding (ambos)
// roda em background: erro nele nunca bloqueia nem derruba a resposta.
//
// `requireAdmin` e o segundo preHandler (apos `requireAuth`): sem sessao 401;
// com sessao nao-admin 403. Escolha documentada: o catalogo PT-BR nao tem
// code proprio para "nao-admin" e inventar code fora do catalogo quebraria
// o i18n-ready (D-25); responder 403 com o code estavel UNAUTHENTICATED
// (message "Autenticação necessária.") preserva o status HTTP correto sem
// vazar papeis — e NAO usa NOT_FOUND aqui (404 e para recursos, nao para
// falta de privilegio em rota administrativa conhecida).
// `requireAdmin` e agnostico ao metodo (le so `actor.role`).

import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildEnvelope } from '@uhhu/contracts';
import type { ActorContext } from '@uhhu/core';
import type { Db } from '@uhhu/db';
import { resolvePat, touchPat } from './pat.js';
import { COOKIE_NAME, resolveSession, touchSession } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor?: ActorContext;
    // Id do PAT autenticado (so quando authMethod === 'pat'); o logout usa
    // para revogar o PAT atual sem re-resolver o header (D-61).
    patId?: string;
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

// Raw do PAT: hex de 32 bytes (mesmo formato de newOpaqueToken). Formato
// invalido cai no mesmo 401 generico, sem mensagem distinta (D-63/T-05-02-ENUM).
const BEARER_PATTERN = /^Bearer ([a-f0-9]{64})$/;

function readBearerAttempt(request: FastifyRequest): string | null | 'invalid' {
  const header: unknown = request.headers.authorization;
  if (header === undefined) {
    return null;
  }
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return null;
  }
  const match = BEARER_PATTERN.exec(header);
  const token = match?.[1];
  return token === undefined ? 'invalid' : token;
}

export function requireAuth(db: Db) {
  return async function requireAuthHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const requestId = resolveRequestId(request);
    const bearer = readBearerAttempt(request);
    if (bearer === 'invalid') {
      reply.header('x-request-id', requestId);
      await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
      return;
    }
    if (bearer !== null) {
      const resolved = await resolvePat(db, bearer);
      if (resolved === null) {
        reply.header('x-request-id', requestId);
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      request.actor = {
        userId: resolved.user.id,
        role: toActorRole(resolved.user.role),
        requestId,
        authMethod: 'pat',
      };
      request.patId = resolved.pat.id;
      // Sliding sem bloquear a resposta; falha de touch vira warn redigido
      // (sem token/senha — so ids tecnicos).
      void touchPat(db, resolved.pat).catch((err: unknown) => {
        request.log.warn({ err, requestId }, 'pat touch failed');
      });
      return;
    }
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
