// tests/integration — menor privilegio das roles PG (D-07, baseline §2.1).
//
// Prova viva: a role de runtime (APP_DATABASE_URL, uhhu_app) NAO tem DDL —
// `CREATE TABLE` deve falhar com 42501/permission denied. A role de
// migrations (MIGRATION_DATABASE_URL, uhhu_migrate) le o banco (SELECT 1).
// SEM PG (env ausente ou inalcançavel): pula com graca, nunca falha.
// NUNCA imprime connection string: so a causa curta, sem valores de env.

import { describe, expect, it } from 'vitest';
import { createDb, sql } from '@uhhu/db';

const PROBE_TABLE = 'least_privilege_probe';

function readDatabaseUrl(name: 'APP_DATABASE_URL' | 'MIGRATION_DATABASE_URL'): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const APP_URL = readDatabaseUrl('APP_DATABASE_URL');
const MIGRATION_URL = readDatabaseUrl('MIGRATION_DATABASE_URL');

function messageOf(err: unknown): string {
  // Drizzle embrulha a falha de conexao: o ECONNREFUSED vive no `cause`,
  // nao na mensagem externa ("Failed query: ..."). Percorre a cadeia.
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join('\n');
}

function isConnectionFailure(text: string): boolean {
  // Sinais definitivos de PG inalcançavel. Deliberadamente SEM o termo
  // generico "connect": queda de conexao contra PG real e falha (fail-closed).
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE/i.test(text);
}

describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'menor privilegio das roles PG',
  () => {
    it(
      'role de runtime (APP) nao tem DDL: CREATE TABLE falha com 42501',
      { timeout: 15000 },
      async () => {
        if (APP_URL === undefined) {
          console.warn('[least-privilege] sem APP_DATABASE_URL — teste pulado (offline).');
          return;
        }
        const db = createDb(APP_URL);
        let denied = false;
        try {
          // PROBE_TABLE e constante de teste (nunca input de usuario): raw e seguro aqui.
          await db.execute(sql.raw(`CREATE TABLE ${PROBE_TABLE} (id int)`));
        } catch (err: unknown) {
          const message = messageOf(err);
          if (isConnectionFailure(message)) {
            console.warn('[least-privilege] PG inalcançavel — teste pulado (offline).');
            return;
          }
          expect(message).toMatch(/42501|permission denied/i);
          denied = true;
        }
        expect(denied).toBe(true);
      },
    );

    it('role de migrate (MIGRATION) le o banco: SELECT 1 ok', { timeout: 15000 }, async () => {
      if (MIGRATION_URL === undefined) {
        console.warn('[least-privilege] sem MIGRATION_DATABASE_URL — teste pulado (offline).');
        return;
      }
      const db = createDb(MIGRATION_URL);
      try {
        await db.execute(sql`SELECT 1`);
      } catch (err: unknown) {
        const message = messageOf(err);
        if (isConnectionFailure(message)) {
          console.warn('[least-privilege] PG inalcançavel — teste pulado (offline).');
          return;
        }
        throw err;
      }
    });
  },
);
