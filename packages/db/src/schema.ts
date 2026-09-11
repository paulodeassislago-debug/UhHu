// packages/db — schema Drizzle, dono total (D-10).
//
// Fase 2: tabelas platform (users, invites, sessions, password_resets) +
// projects (D-23: ownerId so, sem colaboracao no v1). JSON publico camelCase,
// banco snake_case. CHECKs no banco, nao so no Zod (T-02-01-03).
//
// Fase 3 (D-28..D-39): tabelas lab (searches, runs, results, idempotency, events).
// T-03-01-02: `lab_results.raw_metadata` guarda o JSON integral da fonte para
// proveniencia (D-34), mas NUNCA serializa cookies/segredos — os adapters (03-03)
// higienizam antes de persistir. Nenhuma rota expoe raw_metadata bruto com
// credenciais; logs nunca contem cookies/Authorization.

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const infraProof = pgTable('infra_proof', {
  id: serial('id').primaryKey(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
  note: text('note'),
});

export type InfraProof = typeof infraProof.$inferSelect;
export type NewInfraProof = typeof infraProof.$inferInsert;

// prettier-ignore
export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('member'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [check('users_role_check', sql`${t.role} IN ('admin','member')`)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  invitedEmail: text('invited_email'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  rememberMe: boolean('remember_me').notNull().default(true),
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PasswordReset = typeof passwordResets.$inferSelect;
export type NewPasswordReset = typeof passwordResets.$inferInsert;

// prettier-ignore
export const projects = pgTable('projects', {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    researchQuestion: text('research_question'),
    description: text('description'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [
    index('projects_owner_created_idx').on(t.ownerId, t.createdAt.desc()),
    check('projects_status_check', sql`${t.status} IN ('active','archived')`),
    check('projects_title_length_check', sql`char_length(${t.title}) >= 1 AND char_length(${t.title}) <= 200`),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// ---------------------------------------------------------------------------
// Lab: buscas declarativas (D-31..D-33, T-03-01-01: CHECK espelha o Zod).
// ---------------------------------------------------------------------------

// prettier-ignore
export const labSearches = pgTable('lab_searches', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    filters: jsonb('filters').notNull().default(sql`'{}'::jsonb`),
    sources: text('sources').array().notNull().default(sql`'{bdtd,capes}'`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [
    index('lab_searches_project_created_idx').on(t.projectId, t.createdAt.desc()),
    check('lab_searches_term_length_check', sql`char_length(${t.term}) >= 1 AND char_length(${t.term}) <= 500`),
    check('lab_searches_sources_check', sql`${t.sources} <@ ARRAY['bdtd','capes','oasisbr']`),
  ],
);

export type LabSearch = typeof labSearches.$inferSelect;
export type NewLabSearch = typeof labSearches.$inferInsert;

// Runs temporais: congelam o snapshot usado + dono server-side (T-03-01-04:
// `createdBy` preenchido do ActorContext, nunca do body — lib 03-04 aplica).
// D-30: mesmos 6 estados do Job (Job=Run 1:1).
// prettier-ignore
export const labSearchRuns = pgTable('lab_search_runs', {
    id: uuid('id').primaryKey().defaultRandom(),
    searchId: uuid('search_id').notNull().references(() => labSearches.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    status: text('status').notNull().default('queued'),
    termSnapshot: text('term_snapshot').notNull(),
    filtersSnapshot: jsonb('filters_snapshot').notNull(),
    sourcesSnapshot: jsonb('sources_snapshot').notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    metrics: jsonb('metrics').notNull().default(sql`'{}'::jsonb`),
    error: jsonb('error'),
    adapterVersions: jsonb('adapter_versions').notNull().default(sql`'{}'::jsonb`),
    idempotencyKeyHash: text('idempotency_key_hash'),
  },
  (t) => [
    index('lab_search_runs_search_executed_idx').on(t.searchId, t.executedAt.desc()),
    index('lab_search_runs_creator_executed_idx').on(t.createdBy, t.executedAt.desc()),
    check('lab_search_runs_status_check', sql`${t.status} IN ('queued','running','succeeded','partial','failed','cancelled')`),
  ],
);

export type LabSearchRun = typeof labSearchRuns.$inferSelect;
export type NewLabSearchRun = typeof labSearchRuns.$inferInsert;

// Resultados com proveniencia (D-34..D-36): UNIQUE(run, source, sourceId) e a
// base do diff de novos (D-35); `rank` preserva a ordem da fonte (D-36).
// T-03-01-02: `rawMetadata` integral higienizado pelos adapters, sem segredos.
// prettier-ignore
export const labResults = pgTable('lab_results', {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id').notNull().references(() => labSearchRuns.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    sourceId: text('source_id').notNull(),
    title: text('title').notNull(),
    authors: jsonb('authors').notNull().default(sql`'[]'::jsonb`),
    year: integer('year'),
    docType: text('doc_type'),
    institution: text('institution'),
    program: text('program'),
    abstract: text('abstract'),
    originUrl: text('origin_url'),
    sourceUrl: text('source_url'),
    rawMetadata: jsonb('raw_metadata').notNull(),
    rank: integer('rank').notNull(),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('lab_results_run_source_sid_unique').on(t.runId, t.source, t.sourceId),
    index('lab_results_run_source_rank_idx').on(t.runId, t.source, t.rank),
    check('lab_results_source_check', sql`${t.source} IN ('bdtd','capes')`),
  ],
);

export type LabResult = typeof labResults.$inferSelect;
export type NewLabResult = typeof labResults.$inferInsert;

// Idempotencia de execucao (D-39): key_hash = sha256(`userId|key|bodyHash`),
// janela 24h, escopo por usuario.
// prettier-ignore
export const labIdempotencyKeys = pgTable('lab_idempotency_keys', {
    keyHash: text('key_hash').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    bodyHash: text('body_hash').notNull(),
    runId: uuid('run_id').references(() => labSearchRuns.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('lab_idempotency_keys_expires_idx').on(t.expiresAt),
  ],
);

export type LabIdempotencyKey = typeof labIdempotencyKeys.$inferSelect;
export type NewLabIdempotencyKey = typeof labIdempotencyKeys.$inferInsert;

// Eventos de fonte (D-38): base do health ok|degraded|offline por taxa recente
// de falhas/challenges. Counts expostos sem vazar cookies/segredos.
// prettier-ignore
export const labSourceEvents = pgTable('lab_source_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    ok: boolean('ok').notNull(),
    isChallenge: boolean('is_challenge').notNull().default(false),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('lab_source_events_source_at_idx').on(t.source, t.at.desc()),
    check('lab_source_events_source_check', sql`${t.source} IN ('bdtd','capes')`),
  ],
);

export type LabSourceEvent = typeof labSourceEvents.$inferSelect;
export type NewLabSourceEvent = typeof labSourceEvents.$inferInsert;
