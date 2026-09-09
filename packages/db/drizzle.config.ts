// packages/db — config do drizzle-kit (D-10).
// Credenciais via MIGRATION_DATABASE_URL validada (nunca hardcoded, nunca
// APP_DATABASE_URL). `db:generate` nao conecta no banco; `db:migrate` exige
// env real (falha dura offline, por design).

import { defineConfig } from 'drizzle-kit';
import { env } from '@uhhu/config';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: env.MIGRATION_DATABASE_URL,
  },
});
