// packages/db — runner de migrations versionadas (D-05/D-07/D-10).
//
// Usa SOMENTE MIGRATION_DATABASE_URL (role DDL uhhu_migrate); nunca
// APP_DATABASE_URL. Falha com exit != 0 e mensagem SEM credenciais.
// Rode com cwd em packages/db: `pnpm --filter @uhhu/db db:migrate`.

import { pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '@uhhu/config';

// Mascara a senha em qualquer string que possa conter connection string
// (URL configurada ou mensagem de erro do driver que a ecoe).
export function redactConnectionString(value: string): string {
  return value.replace(/:\/\/([^:@/]+)(:[^@/]*)?@/g, '://$1:***@');
}

export async function migrateDatabase(url: string): Promise<void> {
  const client = postgres(url, { max: 1 });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: './drizzle' });
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const url = env.MIGRATION_DATABASE_URL;
  try {
    await migrateDatabase(url);
    console.log('[db:migrate] migrations aplicadas com sucesso.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Redige a mensagem inteira: o driver pode ecoar a connection string no erro.
    console.error(redactConnectionString(`[db:migrate] falha contra ${url}: ${message}`));
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  void main();
}
