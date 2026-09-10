// tests/integration — plataforma de identidade contra PG real (D-15..D-21, D-26).
//
// Cobre: bootstrap do primeiro admin, convite admin-only (uso unico,
// revogacao, e-mail vinculado), registro (primeiro vira admin, duplicado
// 409 sem consumir convite), login/logout multi-dispositivo com sliding,
// lockout 5 falhas -> 15min, reset generico sem enumeracao e revogacao de
// sessao individual + "sair de todas".
//
// Nota de testabilidade (reset): o raw do token de reset NUNCA sai na
// resposta nem no log — segue so pelo e-mail. Por isso este teste NAO le o
// token pela rota `reset-request` (ela e provada aqui so pelo comportamento
// generico 200 + nao-enumeracao); o teste de confirmacao injeta o token
// direto no banco via `newOpaqueToken()` + hash, simulando o clique no
// link do e-mail.
//
// SEM PG (env ausente ou inalcançavel): pula com graca, nunca falha — o CI
// com service postgres:16-alpine e que exerce este arquivo. NUNCA imprime
// connection string: so a causa curta.

import { execFileSync } from 'node:child_process';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, sql, type Db } from '@uhhu/db';
import { invites, passwordResets, sessions, users } from '@uhhu/db';
import { COOKIE_NAME } from '../../apps/core-api/src/auth/session.js';
import { hashToken, newOpaqueToken, resetExpiry } from '../../apps/core-api/src/auth/tokens.js';
import { requestIdPlugin } from '../../apps/core-api/src/plugins/requestId.js';
import { errorHandler } from '../../apps/core-api/src/plugins/errorHandler.js';
import { buildAuthRoutes } from '../../apps/core-api/src/routes/auth.js';

function readDatabaseUrl(name: 'APP_DATABASE_URL' | 'MIGRATION_DATABASE_URL'): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const APP_URL = readDatabaseUrl('APP_DATABASE_URL');
const MIGRATION_URL = readDatabaseUrl('MIGRATION_DATABASE_URL');

function errorText(err: unknown): string {
  const parts: string[] = [];
  parts.push(err instanceof Error ? err.message : String(err));
  if (typeof err === 'object' && err !== null) {
    const record = err as { stdout?: unknown; stderr?: unknown };
    for (const key of ['stdout', 'stderr'] as const) {
      const value: unknown = record[key];
      if (typeof value === 'string') {
        parts.push(value);
      } else if (Buffer.isBuffer(value)) {
        parts.push(value.toString('utf8'));
      }
    }
  }
  return parts.join('\n');
}

function isConnectionFailure(text: string): boolean {
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE/i.test(text);
}

function setCookieList(res: { headers: unknown }): string[] {
  if (typeof res.headers !== 'object' || res.headers === null) {
    return [];
  }
  const raw: unknown = (res.headers as Record<string, unknown>)['set-cookie'];
  if (typeof raw === 'string') {
    return [raw];
  }
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

function headerValue(res: { headers: unknown }, name: string): unknown {
  if (typeof res.headers !== 'object' || res.headers === null) {
    return undefined;
  }
  return (res.headers as Record<string, unknown>)[name];
}

// Extra o valor do cookie uhhu_session do header Set-Cookie.
function sessionCookie(res: { headers: unknown }): string | null {
  for (const item of setCookieList(res)) {
    const pair = item.split(';')[0];
    if (pair === undefined) {
      continue;
    }
    const cut = pair.indexOf('=');
    if (cut < 0) {
      continue;
    }
    if (pair.slice(0, cut).trim() === COOKIE_NAME && pair.slice(cut + 1).trim().length > 0) {
      return pair.slice(cut + 1).trim();
    }
  }
  return null;
}

function requireSessionCookie(res: { headers: unknown }): string {
  const value = sessionCookie(res);
  expect(value).not.toBeNull();
  if (value === null) {
    throw new Error('resposta sem cookie de sessao');
  }
  return value;
}

function maxAgeOf(res: { headers: unknown }): number | null {
  for (const item of setCookieList(res)) {
    const found = /Max-Age=(\d+)/i.exec(item);
    if (found !== null && found[1] !== undefined) {
      return Number.parseInt(found[1], 10);
    }
  }
  return null;
}

function errorOf(body: unknown): { code: string; message: string; requestId: string } {
  return (body as { error: { code: string; message: string; requestId: string } }).error;
}

function userOf(body: unknown): { id: string; email: string; role: string } {
  return (body as { user: { id: string; email: string; role: string } }).user;
}

function inviteOf(body: unknown): { inviteToken: string; expiresAt: string } {
  return body as { inviteToken: string; expiresAt: string };
}

function sessionsOf(body: unknown): {
  id: string;
  current: boolean;
  userAgent: string | null;
}[] {
  return (body as { sessions: { id: string; current: boolean; userAgent: string | null }[] })
    .sessions;
}

interface ApiResponse {
  statusCode: number;
  headers: unknown;
  json(): unknown;
}

async function apiRequest(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  options: { body?: Record<string, unknown>; cookieValue?: string } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(options.cookieValue !== undefined
      ? { cookie: `${COOKIE_NAME}=${options.cookieValue}` }
      : {}),
  };
  if (method === 'GET') {
    return app.inject({ method, url, headers });
  }
  if (method === 'DELETE') {
    return app.inject({ method, url, headers });
  }
  const { body } = options;
  if (body === undefined) {
    return app.inject({ method, url, headers });
  }
  return app.inject({ method, url, payload: body, headers });
}

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'auth PG real (convite/registro/login/sessao/reset/lockout)',
  () => {
    let pgAvailable = true;
    let app: FastifyInstance | undefined;
    let db: Db | undefined;

    beforeAll(async () => {
      try {
        execFileSync('pnpm', ['--filter', '@uhhu/db', 'db:migrate'], {
          stdio: 'pipe',
          timeout: 60000,
        });
      } catch (err: unknown) {
        if (isConnectionFailure(errorText(err))) {
          pgAvailable = false;
          console.warn('[auth] PG inalcançavel no migrate — pulando integracao (offline).');
          return;
        }
        throw err;
      }
      if (APP_URL === undefined) {
        pgAvailable = false;
        return;
      }
      const database = createDb(APP_URL);
      db = database;
      const instance = Fastify({ logger: false });
      await instance.register(cookie);
      await instance.register(async (child) => {
        await requestIdPlugin(child);
      });
      await instance.register(async (child) => {
        await errorHandler(child);
      });
      await instance.register(async (child) => {
        await buildAuthRoutes(child, database);
      });
      app = instance;
    }, 60000);

    afterAll(async () => {
      await app?.close();
    });

    beforeEach(async () => {
      if (!pgAvailable || db === undefined) {
        return;
      }
      await db.delete(passwordResets);
      await db.delete(sessions);
      await db.delete(invites);
      await db.delete(users);
    });

    it('bootstrap cria o primeiro admin; convites exigem admin', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      // Bootstrap: sem usuarios, convite sai sem cookie.
      const first = await apiRequest(app, 'POST', '/api/v1/auth/invites');
      expect(first.statusCode).toBe(201);
      const firstBody: unknown = first.json();
      expect(typeof inviteOf(firstBody).inviteToken).toBe('string');

      // Primeiro registro vira admin + cookie uhhu_session HttpOnly.
      const reg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Ada Admin',
          email: 'ada@example.com',
          password: 'SenhaForte123!',
          inviteToken: inviteOf(firstBody).inviteToken,
        },
      });
      expect(reg.statusCode).toBe(201);
      const regBody: unknown = reg.json();
      expect(userOf(regBody).role).toBe('admin');
      const adminCookie = requireSessionCookie(reg);
      const issued = setCookieList(reg);
      expect(issued.length).toBeGreaterThan(0);
      expect(issued.some((c) => c.startsWith('uhhu_session=') && c.includes('HttpOnly'))).toBe(
        true,
      );

      // Com usuarios no banco, convite sem sessao -> 401 com envelope.
      const noAuth = await apiRequest(app, 'POST', '/api/v1/auth/invites', { body: {} });
      expect(noAuth.statusCode).toBe(401);
      expect(headerValue(noAuth, 'x-request-id')).toBeTruthy();
      const noAuthBody: unknown = noAuth.json();
      expect(errorOf(noAuthBody).code).toBe('UNAUTHENTICATED');

      // Admin emite convite; segundo registro vira member.
      const inv2 = await apiRequest(app, 'POST', '/api/v1/auth/invites', {
        body: {},
        cookieValue: adminCookie,
      });
      expect(inv2.statusCode).toBe(201);
      const inv2Body: unknown = inv2.json();
      const reg2 = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Beto Membro',
          email: 'beto@example.com',
          password: 'SenhaForte123!',
          inviteToken: inviteOf(inv2Body).inviteToken,
        },
      });
      expect(reg2.statusCode).toBe(201);
      const reg2Body: unknown = reg2.json();
      expect(userOf(reg2Body).role).toBe('member');

      // Membro nao emite convite -> 403 sem vazar papel.
      const forbidden = await apiRequest(app, 'POST', '/api/v1/auth/invites', {
        body: {},
        cookieValue: requireSessionCookie(reg2),
      });
      expect(forbidden.statusCode).toBe(403);
      const forbiddenBody: unknown = forbidden.json();
      expect(errorOf(forbiddenBody).code).toBe('UNAUTHENTICATED');
    });

    it('convite: reuso, revogado, e-mail vinculado e e-mail duplicado', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const boot = await apiRequest(app, 'POST', '/api/v1/auth/invites');
      expect(boot.statusCode).toBe(201);
      const bootBody: unknown = boot.json();
      const adminReg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Ada Admin',
          email: 'ada@example.com',
          password: 'SenhaForte123!',
          inviteToken: inviteOf(bootBody).inviteToken,
        },
      });
      expect(adminReg.statusCode).toBe(201);
      const adminCookie = requireSessionCookie(adminReg);

      async function freshInvite(email?: string): Promise<string> {
        const res = await apiRequest(app as FastifyInstance, 'POST', '/api/v1/auth/invites', {
          body: email === undefined ? {} : { email },
          cookieValue: adminCookie,
        });
        expect(res.statusCode).toBe(201);
        const body: unknown = res.json();
        return inviteOf(body).inviteToken;
      }

      // Uso valido + reuso do mesmo convite -> 400 INVITE_INVALID.
      const token1 = await freshInvite();
      const ok1 = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'User Um',
          email: 'um@example.com',
          password: 'SenhaForte123!',
          inviteToken: token1,
        },
      });
      expect(ok1.statusCode).toBe(201);
      const reuse = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Outro',
          email: 'outro@example.com',
          password: 'SenhaForte123!',
          inviteToken: token1,
        },
      });
      expect(reuse.statusCode).toBe(400);
      const reuseBody: unknown = reuse.json();
      expect(errorOf(reuseBody).code).toBe('INVITE_INVALID');
      expect(errorOf(reuseBody).message).toBe('Convite inválido ou expirado.');

      // Convite revogado -> 400 INVITE_REVOKED.
      const token2 = await freshInvite();
      // Revogacao via SQL da MESMA instancia do Drizzle de @uhhu/db (o pnpm
      // isola copias por pacote; importar operadores de outra copia quebra
      // a identidade de tipos — por isso `sql` vem do proprio @uhhu/db).
      const revokedHash = hashToken(token2);
      await db
        .update(invites)
        .set({ revokedAt: new Date() })
        .where(sql`${invites.tokenHash} = ${revokedHash}`);
      const revoked = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Revogado',
          email: 'revogado@example.com',
          password: 'SenhaForte123!',
          inviteToken: token2,
        },
      });
      expect(revoked.statusCode).toBe(400);
      const revokedBody: unknown = revoked.json();
      expect(errorOf(revokedBody).code).toBe('INVITE_REVOKED');

      // Convite vinculado a outro e-mail -> 400 sem distinguir motivo.
      const token3 = await freshInvite('vinculado@example.com');
      const mismatch = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Trocado',
          email: 'trocado@example.com',
          password: 'SenhaForte123!',
          inviteToken: token3,
        },
      });
      expect(mismatch.statusCode).toBe(400);
      const mismatchBody: unknown = mismatch.json();
      expect(errorOf(mismatchBody).code).toBe('INVITE_INVALID');

      // E-mail duplicado -> 409 generico e NAO consome o convite.
      const token4 = await freshInvite();
      const dupe = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Clone',
          email: 'um@example.com',
          password: 'SenhaForte123!',
          inviteToken: token4,
        },
      });
      expect(dupe.statusCode).toBe(409);
      const dupeBody: unknown = dupe.json();
      expect(errorOf(dupeBody).code).toBe('VALIDATION_ERROR');
      const afterDupe = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'User Quatro',
          email: 'quatro@example.com',
          password: 'SenhaForte123!',
          inviteToken: token4,
        },
      });
      expect(afterDupe.statusCode).toBe(201);
    });

    it('login, me e logout do aparelho atual (TTL por rememberMe)', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const boot = await apiRequest(app, 'POST', '/api/v1/auth/invites');
      const bootBody: unknown = boot.json();
      const reg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Carol',
          email: 'carol@example.com',
          password: 'SenhaForte123!',
          inviteToken: inviteOf(bootBody).inviteToken,
        },
      });
      expect(reg.statusCode).toBe(201);
      const registerCookie = requireSessionCookie(reg);

      // Login sem "manter conectado" -> TTL curto (24h).
      const login = await apiRequest(app, 'POST', '/api/v1/auth/login', {
        body: { email: 'carol@example.com', password: 'SenhaForte123!', rememberMe: false },
      });
      expect(login.statusCode).toBe(200);
      const loginBody: unknown = login.json();
      expect(userOf(loginBody).email).toBe('carol@example.com');
      const loginCookie = requireSessionCookie(login);
      const shortTtl = maxAgeOf(login);
      expect(shortTtl).not.toBeNull();
      if (shortTtl !== null) {
        expect(shortTtl).toBeLessThanOrEqual(24 * 3600);
        expect(shortTtl).toBeGreaterThan(23 * 3600);
      }

      // Login com "manter conectado" -> TTL longo (30d).
      const long = await apiRequest(app, 'POST', '/api/v1/auth/login', {
        body: { email: 'carol@example.com', password: 'SenhaForte123!', rememberMe: true },
      });
      expect(long.statusCode).toBe(200);
      const longTtl = maxAgeOf(long);
      expect(longTtl).not.toBeNull();
      if (longTtl !== null) {
        expect(longTtl).toBeGreaterThan(29 * 24 * 3600);
      }

      // /me com cookie -> 200; sem cookie -> 401 com envelope + request-id.
      const me = await apiRequest(app, 'GET', '/api/v1/auth/me', { cookieValue: loginCookie });
      expect(me.statusCode).toBe(200);
      const meBody: unknown = me.json();
      expect(userOf(meBody).email).toBe('carol@example.com');
      const anon = await apiRequest(app, 'GET', '/api/v1/auth/me');
      expect(anon.statusCode).toBe(401);
      expect(headerValue(anon, 'x-request-id')).toBeTruthy();
      const anonBody: unknown = anon.json();
      expect(errorOf(anonBody).code).toBe('UNAUTHENTICATED');

      // Logout encerra SO o aparelho atual.
      const logout = await apiRequest(app, 'POST', '/api/v1/auth/logout', {
        cookieValue: loginCookie,
      });
      expect(logout.statusCode).toBe(204);
      const meAfter = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        cookieValue: loginCookie,
      });
      expect(meAfter.statusCode).toBe(401);
      const otherStill = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        cookieValue: registerCookie,
      });
      expect(otherStill.statusCode).toBe(200);
    });

    it('5 falhas bloqueiam 15min; reset destrava e revoga sessoes', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const email = 'dave@example.com';
      const password = 'SenhaForte123!';
      const boot = await apiRequest(app, 'POST', '/api/v1/auth/invites');
      const bootBody: unknown = boot.json();
      const reg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Dave',
          email,
          password,
          inviteToken: inviteOf(bootBody).inviteToken,
        },
      });
      expect(reg.statusCode).toBe(201);
      const regBody: unknown = reg.json();
      const userId = userOf(regBody).id;
      const registerCookie = requireSessionCookie(reg);

      for (let i = 0; i < 5; i += 1) {
        const bad = await apiRequest(app as FastifyInstance, 'POST', '/api/v1/auth/login', {
          body: { email, password: 'SenhaErrada999!' },
        });
        expect(bad.statusCode).toBe(401);
        const badBody: unknown = bad.json();
        expect(errorOf(badBody).code).toBe('INVALID_CREDENTIALS');
        expect(errorOf(badBody).message).toBe('E-mail ou senha inválidos.');
      }
      const sixth = await apiRequest(app, 'POST', '/api/v1/auth/login', {
        body: { email, password },
      });
      expect(sixth.statusCode).toBe(429);
      const sixthBody: unknown = sixth.json();
      expect(errorOf(sixthBody).code).toBe('ACCOUNT_LOCKED');

      // Reset com sucesso destrava o lockout (simula o clique no e-mail).
      const rawReset = newOpaqueToken();
      await db.insert(passwordResets).values({
        userId,
        tokenHash: hashToken(rawReset),
        expiresAt: resetExpiry(),
      });
      const newPassword = 'NovaSenhaForte456!';
      const reset = await apiRequest(app, 'POST', '/api/v1/auth/password/reset', {
        body: { token: rawReset, newPassword },
      });
      expect(reset.statusCode).toBe(200);
      const resetBody: unknown = reset.json();
      expect(userOf(resetBody).email).toBe(email);
      requireSessionCookie(reset);

      // Sessoes antigas foram revogadas pelo reset.
      const stale = await apiRequest(app, 'GET', '/api/v1/auth/me', {
        cookieValue: registerCookie,
      });
      expect(stale.statusCode).toBe(401);

      // Login com a nova senha funciona (lockout zerado).
      const relogin = await apiRequest(app, 'POST', '/api/v1/auth/login', {
        body: { email, password: newPassword },
      });
      expect(relogin.statusCode).toBe(200);
    });

    it('reset-request sempre 200 generico (sem enumeracao)', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      const boot = await apiRequest(app, 'POST', '/api/v1/auth/invites');
      const bootBody: unknown = boot.json();
      const reg = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'Erin',
          email: 'erin@example.com',
          password: 'SenhaForte123!',
          inviteToken: inviteOf(bootBody).inviteToken,
        },
      });
      expect(reg.statusCode).toBe(201);

      const expected = 'Se o e-mail estiver cadastrado, enviamos o link.';
      const existing = await apiRequest(app, 'POST', '/api/v1/auth/password/reset-request', {
        body: { email: 'erin@example.com' },
      });
      expect(existing.statusCode).toBe(200);
      const existingBody: unknown = existing.json();
      expect((existingBody as { message: string }).message).toBe(expected);

      const missing = await apiRequest(app, 'POST', '/api/v1/auth/password/reset-request', {
        body: { email: 'fantasma@example.com' },
      });
      expect(missing.statusCode).toBe(200);
      const missingBody: unknown = missing.json();
      // Respostas identicas: nenhuma diferenca entre existente e inexistente.
      expect(missingBody).toEqual(existingBody);
      const text = JSON.stringify(missingBody).toLowerCase();
      expect(text).not.toMatch(/token|hash|password|secret/);
    });

    it('sessoes: lista multi-dispositivo, revoga individual, sai de todas', async () => {
      if (!pgAvailable || app === undefined || db === undefined) {
        console.warn('[auth] PG inalcançavel — teste pulado (offline).');
        return;
      }
      // Bootstrap: primeiro usuario (admin) + segundo via convite do admin.
      const boot = await apiRequest(app, 'POST', '/api/v1/auth/invites');
      expect(boot.statusCode).toBe(201);
      const bootBody: unknown = boot.json();
      const regA = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'User A',
          email: 'a@example.com',
          password: 'SenhaForte123!',
          inviteToken: inviteOf(bootBody).inviteToken,
        },
      });
      expect(regA.statusCode).toBe(201);
      const cookieA = requireSessionCookie(regA);
      // Segundo usuario precisa de convite do admin (User A).
      const invB = await apiRequest(app, 'POST', '/api/v1/auth/invites', {
        body: { email: 'b@example.com' },
        cookieValue: cookieA,
      });
      expect(invB.statusCode).toBe(201);
      const invBBody: unknown = invB.json();
      const regB = await apiRequest(app, 'POST', '/api/v1/auth/register', {
        body: {
          name: 'User B',
          email: 'b@example.com',
          password: 'SenhaForte123!',
          inviteToken: inviteOf(invBBody).inviteToken,
        },
      });
      expect(regB.statusCode).toBe(201);
      const cookieB = requireSessionCookie(regB);

      // Segundo dispositivo do User A.
      const loginA2 = await apiRequest(app, 'POST', '/api/v1/auth/login', {
        body: { email: 'a@example.com', password: 'SenhaForte123!', rememberMe: true },
      });
      expect(loginA2.statusCode).toBe(200);
      const cookieA2 = requireSessionCookie(loginA2);

      const list = await apiRequest(app, 'GET', '/api/v1/auth/sessions', {
        cookieValue: cookieA,
      });
      expect(list.statusCode).toBe(200);
      const listBody: unknown = list.json();
      const ids = sessionsOf(listBody);
      expect(ids.length).toBeGreaterThanOrEqual(2);
      expect(ids.filter((s) => s.current).length).toBe(1);

      const other = ids.find((s) => !s.current);
      expect(other).not.toBeUndefined();
      if (other === undefined) {
        throw new Error('lista sem segunda sessao');
      }
      const revoke = await apiRequest(app, 'DELETE', `/api/v1/auth/sessions/${other.id}`, {
        cookieValue: cookieA,
      });
      expect(revoke.statusCode).toBe(204);
      const revokedAgain = await apiRequest(app, 'DELETE', `/api/v1/auth/sessions/${other.id}`, {
        cookieValue: cookieA,
      });
      expect(revokedAgain.statusCode).toBe(404);

      // Sessao de outro usuario -> 404 identico (sem revelar existencia).
      const listB = await apiRequest(app, 'GET', '/api/v1/auth/sessions', {
        cookieValue: cookieB,
      });
      expect(listB.statusCode).toBe(200);
      const listBBody: unknown = listB.json();
      const idB = sessionsOf(listBBody)[0];
      expect(idB).not.toBeUndefined();
      if (idB === undefined) {
        throw new Error('lista do User B vazia');
      }
      // `cookieA` (current) sobreviveu a revogacao acima; `cookieA2` pode ter
      // sido a sessao revogada — por isso os proximos passos usam `cookieA`.
      const cross = await apiRequest(app, 'DELETE', `/api/v1/auth/sessions/${idB.id}`, {
        cookieValue: cookieA,
      });
      expect(cross.statusCode).toBe(404);
      const crossBody: unknown = cross.json();
      expect(errorOf(crossBody).code).toBe('NOT_FOUND');
      const stillB = await apiRequest(app, 'GET', '/api/v1/auth/me', { cookieValue: cookieB });
      expect(stillB.statusCode).toBe(200);

      // ID invalido tambem 404.
      const malformed = await apiRequest(app, 'DELETE', '/api/v1/auth/sessions/nao-uuid', {
        cookieValue: cookieA,
      });
      expect(malformed.statusCode).toBe(404);

      // "Sair de todas" derruba todos os dispositivos do usuario.
      const logoutAll = await apiRequest(app, 'POST', '/api/v1/auth/logout-all', {
        cookieValue: cookieA,
      });
      expect(logoutAll.statusCode).toBe(204);
      const goneA = await apiRequest(app, 'GET', '/api/v1/auth/me', { cookieValue: cookieA });
      expect(goneA.statusCode).toBe(401);
      const goneA2 = await apiRequest(app, 'GET', '/api/v1/auth/me', { cookieValue: cookieA2 });
      expect(goneA2.statusCode).toBe(401);
    });
  },
);
