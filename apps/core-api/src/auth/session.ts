// apps/core-api — sessoes server-side com sliding (D-19, D-20, T-02-02-04).
//
// O raw do token e retornado UMA vez (para o cookie httpOnly); no banco
// fica so o hash SHA-256 (`sessions.token_hash` UNIQUE). `resolveSession`
// nunca distingue o motivo do null (hash desconhecido, expirado ou
// usuario removido) — sem oracle para o cliente.
// Registrar `@fastify/cookie` no Fastify e tarefa do 02-04; aqui so as
// funcoes puras de persistencia + constantes do cookie.

import { eq } from 'drizzle-orm';
import { sessions, users, type Db, type Session, type User } from '@uhhu/db';
import { hashToken, newOpaqueToken, sessionExpiry } from './tokens.js';

export const COOKIE_NAME = 'uhhu_session';

export function cookieOptions(isProd: boolean): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
} {
  return { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' };
}

export interface CreateSessionOpts {
  rememberMe: boolean;
  userAgent: string | null;
  ip: string | null;
}

export async function createSession(
  db: Db,
  userId: string,
  opts: CreateSessionOpts,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = newOpaqueToken();
  const expiresAt = sessionExpiry(opts.rememberMe);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt,
    rememberMe: opts.rememberMe,
    userAgent: opts.userAgent,
    ip: opts.ip,
  });
  return { rawToken, expiresAt };
}

export async function resolveSession(
  db: Db,
  rawToken: string,
): Promise<{ user: User; session: Session } | null> {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(rawToken)))
    .limit(1);
  const session = rows[0];
  if (session === undefined) {
    return null;
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  const userRows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const user = userRows[0];
  if (user === undefined) {
    return null;
  }
  return { user, session };
}

// Sliding: so estende quando resta menos da metade do TTL — evita UPDATE
// a cada request. Estende para now+TTL e atualiza `last_seen_at` juntos.
export async function touchSession(db: Db, session: Session, rememberMe: boolean): Promise<void> {
  const ttlMs = (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (session.expiresAt.getTime() - now >= ttlMs / 2) {
    return;
  }
  const nowDate = new Date(now);
  await db
    .update(sessions)
    .set({ expiresAt: new Date(now + ttlMs), lastSeenAt: nowDate })
    .where(eq(sessions.id, session.id));
}
