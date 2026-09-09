// packages/db — factory do client Drizzle + health check do banco (D-10).
//
// Unico lugar do monorepo que abre conexao SQL. Recebe a connection string
// ja validada (nunca hardcoded, nunca lida de process.env aqui): o boot passa
// env.APP_DATABASE_URL, o migrate passa env.MIGRATION_DATABASE_URL.
// Todo acesso via Drizzle parametrizado; SQL concatenado proibido.

import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

export function createDb(url: string): Db {
  const client = postgres(url, { max: 10 });
  return drizzle(client, { schema });
}

export interface DatabaseCheck {
  ok: boolean;
  migrationsApplied: number;
}

// Checagem usada pelo GET /health. Nunca lanca excecao: qualquer falha
// (ping ou contagem de migrations) vira { ok: false } — health nunca 500.
export async function checkDatabase(db: Db): Promise<DatabaseCheck> {
  try {
    await db.execute(sql`select 1`);
    const rows: unknown = await db.execute(sql`select count(*) as count from __drizzle_migrations`);
    return { ok: true, migrationsApplied: parseCount(rows) };
  } catch {
    return { ok: false, migrationsApplied: 0 };
  }
}

function parseCount(rows: unknown): number {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }
  const first: unknown = rows[0];
  if (typeof first !== 'object' || first === null || !('count' in first)) {
    return 0;
  }
  const count: unknown = (first as { count: unknown }).count;
  const parsed =
    typeof count === 'number'
      ? count
      : typeof count === 'string'
        ? Number.parseInt(count, 10)
        : Number.NaN;
  return Number.isSafeInteger(parsed) ? parsed : 0;
}
