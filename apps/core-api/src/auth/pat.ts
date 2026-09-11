// apps/core-api — PATs por device com sliding 30d (D-60/D-61/D-63).
//
// Espelha `session.ts`: o raw opaco circula UMA vez (resposta de emissao);
// no banco fica so o hash SHA-256 (`personal_access_tokens.token_hash`
// UNIQUE). `resolvePat` nunca distingue o motivo do null (hash desconhecido,
// expirado, revogado ou usuario removido) — sem oracle para o cliente.
// `touchPat` espelha o sliding de `touchSession` (janela 30d, so estende
// quando resta menos da metade — evita UPDATE a cada request). Erro no touch
// nunca bloqueia o caller (void + catch no requireAuth).
//
// Segredos: raw NUNCA em log (so ids tecnicos + requestId no caller).

import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  personalAccessTokens,
  users,
  type Db,
  type PersonalAccessToken,
  type User,
} from '@uhhu/db';
import type { PersonalAccessTokenInfo } from '@uhhu/contracts';
import { hashToken, newOpaqueToken, patExpiry } from './tokens.js';

// Janela sliding do PAT: 30 dias (D-61, espelha sessao rememberMe=true).
const PAT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toPatInfo(row: PersonalAccessToken): PersonalAccessTokenInfo {
  return {
    id: row.id,
    deviceName: row.deviceName,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function issuePat(
  db: Db,
  userId: string,
  deviceName: string,
): Promise<{ rawToken: string; info: PersonalAccessTokenInfo }> {
  const rawToken = newOpaqueToken();
  const inserted = await db
    .insert(personalAccessTokens)
    .values({
      userId,
      tokenHash: hashToken(rawToken),
      deviceName,
      expiresAt: patExpiry(),
    })
    .returning();
  const row = inserted[0];
  if (row === undefined) {
    throw new Error('pat insert did not return row');
  }
  return { rawToken, info: toPatInfo(row) };
}

export async function resolvePat(
  db: Db,
  rawToken: string,
): Promise<{ user: User; pat: PersonalAccessToken } | null> {
  if (rawToken.length === 0) {
    return null;
  }
  const rows = await db
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.tokenHash, hashToken(rawToken)))
    .limit(1);
  const pat = rows[0];
  if (pat === undefined) {
    return null;
  }
  if (pat.revokedAt !== null) {
    return null;
  }
  if (pat.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  const userRows = await db.select().from(users).where(eq(users.id, pat.userId)).limit(1);
  const user = userRows[0];
  if (user === undefined) {
    return null;
  }
  return { user, pat };
}

export async function touchPat(db: Db, pat: PersonalAccessToken): Promise<void> {
  const now = Date.now();
  if (pat.expiresAt.getTime() - now >= PAT_WINDOW_MS / 2) {
    return;
  }
  const nowDate = new Date(now);
  await db
    .update(personalAccessTokens)
    .set({ expiresAt: new Date(now + PAT_WINDOW_MS), lastSeenAt: nowDate })
    .where(eq(personalAccessTokens.id, pat.id));
}

export async function listPatsForUser(db: Db, userId: string): Promise<PersonalAccessTokenInfo[]> {
  const rows = await db
    .select()
    .from(personalAccessTokens)
    .where(and(eq(personalAccessTokens.userId, userId), isNull(personalAccessTokens.revokedAt)))
    .orderBy(desc(personalAccessTokens.createdAt));
  return rows.map((row) => toPatInfo(row));
}

export async function revokePat(
  db: Db,
  userId: string,
  patId: string,
): Promise<PersonalAccessToken | null> {
  if (!UUID_PATTERN.test(patId)) {
    return null;
  }
  const rows = await db
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.id, patId))
    .limit(1);
  const pat = rows[0];
  if (pat === undefined || pat.userId !== userId) {
    return null;
  }
  const updated = await db
    .update(personalAccessTokens)
    .set({ revokedAt: new Date() })
    .where(eq(personalAccessTokens.id, pat.id))
    .returning();
  const row = updated[0];
  return row ?? pat;
}

export async function revokeAllPats(db: Db, userId: string): Promise<number> {
  const updated = await db
    .update(personalAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(personalAccessTokens.userId, userId), isNull(personalAccessTokens.revokedAt)))
    .returning({ id: personalAccessTokens.id });
  return updated.length;
}
