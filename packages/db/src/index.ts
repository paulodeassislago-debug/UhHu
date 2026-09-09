// packages/db — dono total do Drizzle (D-10): schema, client e migrate.
// core-api importa daqui; NENHUMA conexao SQL fora deste pacote.
// O tag `sql` e re-exportado para os testes de integracao usarem a MESMA
// instancia de tipos do Drizzle (pnpm isola copias por pacote; importar
// `drizzle-orm` direto na raiz gera identidade de tipos duplicada).

export * from './schema.js';
export { checkDatabase, createDb, type Db, type DatabaseCheck } from './client.js';
export { migrateDatabase, redactConnectionString } from './migrate.js';
export { sql } from 'drizzle-orm';
