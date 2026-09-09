// packages/db — dono total do Drizzle (D-10): schema, client e migrate.
// core-api importa daqui; NENHUMA conexao SQL fora deste pacote.

export * from './schema.js';
export { checkDatabase, createDb, type Db, type DatabaseCheck } from './client.js';
export { migrateDatabase, redactConnectionString } from './migrate.js';
