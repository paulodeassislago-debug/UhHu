// apps/core-api — rotas /api/v1/auth/* (D-15..D-21, D-26).
//
// `buildAuthRoutes(app, db)` registra o plugin sem tocar no boot (wiring e
// do 02-04). Todo body passa por Zod antes de qualquer DB; toda resposta de
// erro usa `buildEnvelope` com `x-request-id`. Sessoes sao isoladas pela
// coluna `user_id` (cada query filtra pelo ator da sessao, nunca por id do
// cliente). Nenhum segredo (senha, raw de token) vai para log ou resposta.
//
// Respostas de sucesso nao sao envelope de erro: `{ user }`, `{ sessions }`,
// `{ inviteToken, expiresAt }` ou `{ message }` conforme a rota.

import '@fastify/cookie';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  ERROR_CATALOG,
  buildEnvelope,
  loginSchema,
  patCreateSchema,
  registerSchema,
  resetConfirmSchema,
  resetRequestSchema,
  type PersonalAccessTokenInfo,
  type PublicUser,
  type SessionInfo,
  type UserRole,
} from '@uhhu/contracts';
import { invites, passwordResets, sessions, users, type Db, type User } from '@uhhu/db';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { issuePat, listPatsForUser, revokeAllPats, revokePat } from '../auth/pat.js';
import { COOKIE_NAME, cookieOptions, createSession, resolveSession } from '../auth/session.js';
import { hashToken, inviteExpiry, newOpaqueToken, resetExpiry } from '../auth/tokens.js';
import { requireAuth } from '../auth/requireAuth.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:~-]{1,128}$/;

// Hash argon2id valido de senha ficticia fixa — SOMENTE para gastar tempo
// parecido no login de e-mail inexistente (sem oracle de tempo, T-02-02-01).
// Nunca e comparado como credencial real: o fluxo inexistente sempre 401.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$6bem5D2B2wNwowAwqg195Q$1wKrPZZJr6nrH+9WHK2iZgTfHznZos+4NuDmCRecXJ4';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const inviteBodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254).optional(),
});

const sessionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const patIdParamsSchema = z.object({
  id: z.string().uuid(),
});

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

function toUserRole(role: string): UserRole {
  return role === 'admin' ? 'admin' : 'member';
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: toUserRole(user.role),
    createdAt: user.createdAt.toISOString(),
  };
}

function requestMeta(request: FastifyRequest): { userAgent: string | null; ip: string | null } {
  const ua: unknown = request.headers['user-agent'];
  return {
    userAgent: typeof ua === 'string' ? ua.slice(0, 512) : null,
    ip: request.ip.slice(0, 64),
  };
}

function setSessionCookie(reply: FastifyReply, rawToken: string, expiresAt: Date): void {
  const maxAge = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  reply.setCookie(COOKIE_NAME, rawToken, {
    ...cookieOptions(process.env['NODE_ENV'] === 'production'),
    expires: expiresAt,
    maxAge,
  });
}

export async function buildAuthRoutes(app: FastifyInstance, db: Db): Promise<void> {
  // D-15: so admin emite convite — EXCETO o bootstrap: com zero usuarios no
  // banco, permite UMA vez sem auth para criar o primeiro admin.
  app.post('/api/v1/auth/invites', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = resolveRequestId(request);
    reply.header('x-request-id', requestId);
    // Corpo totalmente opcional: sem payload, `request.body` e undefined.
    const parsed = inviteBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      await reply
        .code(400)
        .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
      return;
    }
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    let createdBy: string | null = null;
    if (existing.length > 0) {
      const raw = readSessionCookie(request);
      const resolved = raw === null ? null : await resolveSession(db, raw);
      if (resolved === null) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      if (resolved.user.role !== 'admin') {
        await reply.code(403).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      createdBy = resolved.user.id;
    }
    const inviteToken = newOpaqueToken();
    const expiresAt = inviteExpiry();
    await db.insert(invites).values({
      tokenHash: hashToken(inviteToken),
      invitedEmail: parsed.data.email ?? null,
      expiresAt,
      createdBy,
    });
    await reply.code(201).send({ inviteToken, expiresAt: expiresAt.toISOString() });
  });

  // D-16/D-17: registro com convite valido + argon2id. Primeiro usuario do
  // banco vira admin; demais member. E-mail duplicado NAO consome o convite
  // e responde 409 generico (sem confirmar existencia do e-mail).
  app.post('/api/v1/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = resolveRequestId(request);
    reply.header('x-request-id', requestId);
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      await reply
        .code(400)
        .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const inviteRows = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(input.inviteToken)))
      .limit(1);
    const invite = inviteRows[0];
    if (invite === undefined) {
      await reply.code(400).send(buildEnvelope('INVITE_INVALID', requestId, {}));
      return;
    }
    if (invite.revokedAt !== null) {
      await reply.code(400).send(buildEnvelope('INVITE_REVOKED', requestId, {}));
      return;
    }
    if (invite.usedAt !== null || invite.expiresAt.getTime() <= Date.now()) {
      await reply.code(400).send(buildEnvelope('INVITE_INVALID', requestId, {}));
      return;
    }
    if (
      invite.invitedEmail !== null &&
      invite.invitedEmail.toLowerCase() !== input.email.toLowerCase()
    ) {
      await reply.code(400).send(buildEnvelope('INVITE_INVALID', requestId, {}));
      return;
    }
    const emailLower = input.email.toLowerCase();
    const dupe = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, emailLower))
      .limit(1);
    if (dupe.length > 0) {
      await reply.code(409).send(buildEnvelope('VALIDATION_ERROR', requestId, {}));
      return;
    }
    const anyUser = await db.select({ id: users.id }).from(users).limit(1);
    const role = anyUser.length === 0 ? 'admin' : 'member';
    // Claim atomico do convite (uso unico mesmo sob concorrencia): so o
    // UPDATE com `used_at IS NULL` vence; o perdedor recebe INVITE_INVALID.
    // Acontece DEPOIS do 409 de duplicado para nao queimar convite a toa.
    const claimed = await db
      .update(invites)
      .set({ usedAt: new Date() })
      .where(and(eq(invites.id, invite.id), isNull(invites.usedAt)))
      .returning({ id: invites.id });
    if (claimed.length === 0) {
      await reply.code(400).send(buildEnvelope('INVITE_INVALID', requestId, {}));
      return;
    }
    const inserted = await db
      .insert(users)
      .values({
        email: emailLower,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        role,
      })
      .returning();
    const user = inserted[0];
    if (user === undefined) {
      await reply.code(500).send(buildEnvelope('INTERNAL_ERROR', requestId, {}));
      return;
    }
    const meta = requestMeta(request);
    const created = await createSession(db, user.id, { rememberMe: true, ...meta });
    setSessionCookie(reply, created.rawToken, created.expiresAt);
    await reply.code(201).send({ user: toPublicUser(user) });
  });

  // D-19/D-26: login com lockout por e-mail (5 falhas -> 15min) e resposta
  // generica PT-BR. E-mail inexistente queima tempo com verify dummy.
  app.post('/api/v1/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = resolveRequestId(request);
    reply.header('x-request-id', requestId);
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      await reply
        .code(400)
        .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
      return;
    }
    const emailLower = parsed.data.email.toLowerCase();
    const rows = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
    const user = rows[0];
    const now = new Date();
    if (
      user !== undefined &&
      user.lockedUntil !== null &&
      user.lockedUntil.getTime() > now.getTime()
    ) {
      await reply.code(429).send(buildEnvelope('ACCOUNT_LOCKED', requestId, {}));
      return;
    }
    if (user === undefined) {
      await verifyPassword(DUMMY_HASH, parsed.data.password);
      await reply.code(401).send(buildEnvelope('INVALID_CREDENTIALS', requestId, {}));
      return;
    }
    const ok = await verifyPassword(user.passwordHash, parsed.data.password);
    if (!ok) {
      const attempts = user.failedAttempts + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await db
          .update(users)
          .set({ failedAttempts: attempts, lockedUntil: new Date(now.getTime() + LOCKOUT_MS) })
          .where(eq(users.id, user.id));
      } else {
        await db.update(users).set({ failedAttempts: attempts }).where(eq(users.id, user.id));
      }
      await reply.code(401).send(buildEnvelope('INVALID_CREDENTIALS', requestId, {}));
      return;
    }
    await db
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
    const meta = requestMeta(request);
    const created = await createSession(db, user.id, {
      rememberMe: parsed.data.rememberMe,
      ...meta,
    });
    setSessionCookie(reply, created.rawToken, created.expiresAt);
    await reply.code(200).send({ user: toPublicUser(user) });
  });

  // D-60/D-63: emissao de PAT por device (CLI/MCP). Mesmo lockout do login
  // (5 falhas -> 15min no MESMO contador users.failedAttempts/lockedUntil) e
  // mesmo throttle (bucket `login` no rateLimit.ts). Credencial invalida ->
  // 401 generico sem distinguir e-mail/senha (D-63/T-05-02-ENUM). O raw sai
  // UMA vez nesta resposta; depois so hash no banco (T-05-02-TOKEN).
  app.post('/api/v1/auth/token', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = resolveRequestId(request);
    reply.header('x-request-id', requestId);
    const parsed = patCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      await reply
        .code(400)
        .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
      return;
    }
    const emailLower = parsed.data.email.toLowerCase();
    const rows = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
    const user = rows[0];
    const now = new Date();
    if (
      user !== undefined &&
      user.lockedUntil !== null &&
      user.lockedUntil.getTime() > now.getTime()
    ) {
      await reply.code(429).send(buildEnvelope('ACCOUNT_LOCKED', requestId, {}));
      return;
    }
    if (user === undefined) {
      await verifyPassword(DUMMY_HASH, parsed.data.password);
      await reply.code(401).send(buildEnvelope('INVALID_CREDENTIALS', requestId, {}));
      return;
    }
    const ok = await verifyPassword(user.passwordHash, parsed.data.password);
    if (!ok) {
      const attempts = user.failedAttempts + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await db
          .update(users)
          .set({ failedAttempts: attempts, lockedUntil: new Date(now.getTime() + LOCKOUT_MS) })
          .where(eq(users.id, user.id));
      } else {
        await db.update(users).set({ failedAttempts: attempts }).where(eq(users.id, user.id));
      }
      await reply.code(401).send(buildEnvelope('INVALID_CREDENTIALS', requestId, {}));
      return;
    }
    await db
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
    const issued = await issuePat(db, user.id, parsed.data.deviceName);
    request.log.info(
      { requestId, userId: user.id, patId: issued.info.id },
      'personal access token issued',
    );
    await reply.code(201).send({ token: issued.rawToken, ...issued.info });
  });

  // D-20/D-21 + D-61: logout encerra SO o aparelho atual — sessao via cookie
  // ou, quando chamado com Bearer, revoga o PAT atual (request.patId).
  // H-03: o delete da sessao e escopado ao ator (userId) — sem isso, um Bearer
  // de A apresentando o cookie de B apagava a sessao de B.
  app.post(
    '/api/v1/auth/logout',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      const raw = readSessionCookie(request);
      if (raw !== null && actor !== undefined) {
        await db
          .delete(sessions)
          .where(and(eq(sessions.tokenHash, hashToken(raw)), eq(sessions.userId, actor.userId)));
      }
      if (actor !== undefined && actor.authMethod === 'pat' && request.patId !== undefined) {
        await revokePat(db, actor.userId, request.patId);
      }
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      await reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/auth/logout-all',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      await db.delete(sessions).where(eq(sessions.userId, actor.userId));
      // D-61 "sair de todas": revoga sessoes E todos os PATs ativos.
      await revokeAllPats(db, actor.userId);
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      await reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/auth/me',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const rows = await db.select().from(users).where(eq(users.id, actor.userId)).limit(1);
      const user = rows[0];
      if (user === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      await reply.code(200).send({ user: toPublicUser(user) });
    },
  );

  // D-20: lista de sessoes ativas com `current` no cookie chamador.
  app.get(
    '/api/v1/auth/sessions',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const raw = readSessionCookie(request);
      const currentHash = raw === null ? null : hashToken(raw);
      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, actor.userId))
        .orderBy(desc(sessions.createdAt));
      const list: SessionInfo[] = rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        userAgent: row.userAgent,
        ip: row.ip,
        current: currentHash !== null && row.tokenHash === currentHash,
      }));
      await reply.code(200).send({ sessions: list });
    },
  );

  // Revogacao individual: id de outro usuario (ou inexistente/invalido) vira
  // 404 identico — sem revelar existencia (mesmo principio do D-23).
  app.delete(
    '/api/v1/auth/sessions/:id',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = sessionIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const rows = await db.select().from(sessions).where(eq(sessions.id, parsed.data.id)).limit(1);
      const target = rows[0];
      if (target === undefined || target.userId !== actor.userId) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await db.delete(sessions).where(eq(sessions.id, target.id));
      await reply.code(204).send();
    },
  );

  // D-60/D-61: lista de PATs ativos (requireAuth aceita sessao OU Bearer).
  // Resposta NUNCA inclui hash nem raw (T-05-02-TOKEN).
  app.get(
    '/api/v1/auth/tokens',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const list: PersonalAccessTokenInfo[] = await listPatsForUser(db, actor.userId);
      await reply.code(200).send({ tokens: list });
    },
  );

  // Revogacao individual de PAT: id de outro usuario (ou inexistente/invalido)
  // vira 404 identico — sem revelar existencia (T-05-02-ENUM, mesmo principio
  // do D-23 nas sessoes).
  app.delete(
    '/api/v1/auth/tokens/:id',
    { preHandler: requireAuth(db) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const actor = request.actor;
      if (actor === undefined) {
        await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
        return;
      }
      const parsed = patIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      const revoked = await revokePat(db, actor.userId, parsed.data.id);
      if (revoked === null) {
        await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
        return;
      }
      await reply.code(204).send();
    },
  );

  // D-18: reset-request SEMPRE 200 generico (sem enumeracao). Quando o
  // usuario existe, grava token de 1h hasheado e loga so requestId+userId
  // (SEM o token — o raw segue por e-mail; sem SMTP, fica so o log).
  app.post(
    '/api/v1/auth/password/reset-request',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);
      reply.header('x-request-id', requestId);
      const parsed = resetRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        await reply
          .code(400)
          .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
        return;
      }
      const generic = ERROR_CATALOG['PASSWORD_RESET_SENT'];
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, parsed.data.email.toLowerCase()))
        .limit(1);
      const target = rows[0];
      if (target === undefined) {
        await reply.code(200).send({ message: generic });
        return;
      }
      await db.insert(passwordResets).values({
        userId: target.id,
        tokenHash: hashToken(newOpaqueToken()),
        expiresAt: resetExpiry(),
      });
      request.log.info({ requestId, userId: target.id }, 'password reset requested');
      await reply.code(200).send({ message: generic });
    },
  );

  // Reset confirma: token valido/nao-usado/nao-expirado; invalido vira 400
  // generico (sem code novo no catalogo, sem distinguir motivo). Sucesso
  // zera o lockout (D-26), revoga TODAS as sessoes e faz re-login implicito
  // (nova sessao 30d + cookie + `{ user }`).
  app.post('/api/v1/auth/password/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = resolveRequestId(request);
    reply.header('x-request-id', requestId);
    const parsed = resetConfirmSchema.safeParse(request.body);
    if (!parsed.success) {
      await reply
        .code(400)
        .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
      return;
    }
    const now = new Date();
    const resetRows = await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.tokenHash, hashToken(parsed.data.token)))
      .limit(1);
    const reset = resetRows[0];
    if (
      reset === undefined ||
      reset.usedAt !== null ||
      reset.expiresAt.getTime() <= now.getTime()
    ) {
      await reply.code(400).send(buildEnvelope('VALIDATION_ERROR', requestId, {}));
      return;
    }
    const userRows = await db.select().from(users).where(eq(users.id, reset.userId)).limit(1);
    const user = userRows[0];
    if (user === undefined) {
      await reply.code(400).send(buildEnvelope('VALIDATION_ERROR', requestId, {}));
      return;
    }
    // Claim atomico: garante uso unico mesmo sob confirmacao concorrente.
    const claimedReset = await db
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.id, reset.id), isNull(passwordResets.usedAt)))
      .returning({ id: passwordResets.id });
    if (claimedReset.length === 0) {
      await reply.code(400).send(buildEnvelope('VALIDATION_ERROR', requestId, {}));
      return;
    }
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.data.newPassword),
        failedAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, user.id));
    await db.delete(sessions).where(eq(sessions.userId, user.id));
    // Reset troca a senha: revoga sessoes E PATs (D-61 "sair de todas" apos
    // troca de credencial) antes do re-login implicito.
    await revokeAllPats(db, user.id);
    const meta = requestMeta(request);
    const created = await createSession(db, user.id, { rememberMe: true, ...meta });
    setSessionCookie(reply, created.rawToken, created.expiresAt);
    await reply.code(200).send({ user: toPublicUser(user) });
  });
}
