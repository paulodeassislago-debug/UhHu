// packages/db — schema Drizzle, dono total (D-10).
//
// Fase 1: prova de infra da Fase 1 — tabelas platform/lab (users, projects,
// searches, results...) PROIBIDAS aqui; schema nao congela sem validacao do
// contrato por secoes com Paulo (D-08).

import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const infraProof = pgTable('infra_proof', {
  id: serial('id').primaryKey(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
  note: text('note'),
});

export type InfraProof = typeof infraProof.$inferSelect;
export type NewInfraProof = typeof infraProof.$inferInsert;
