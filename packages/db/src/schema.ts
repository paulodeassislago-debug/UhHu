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
//
// Fase 4 (D-40..D-53): revisao por chave de conteudo (projectId, canonicalKey), NUNCA resultId.

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

// PAT por device (D-60/D-61): espelho de sessions + deviceName + revokedAt,
// sem rememberMe/userAgent/ip — PAT e por device com ciclo 30d sliding.
export const personalAccessTokens = pgTable('personal_access_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  deviceName: text('device_name').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PersonalAccessToken = typeof personalAccessTokens.$inferSelect;
export type NewPersonalAccessToken = typeof personalAccessTokens.$inferInsert;

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

// ---------------------------------------------------------------------------
// Fase 4 (D-40..D-53): revisao por chave de conteudo (projectId, canonicalKey).
// Grupos/decisoes/pins/divergencias/rejeicoes enderecados pela canonicalKey
// SHA-256 escopada por projeto — lab_results.id aparece so em members.
// ---------------------------------------------------------------------------

// D-40 pending fora do corpus; D-41 persistente por projeto.
// prettier-ignore
export const labDedupGroups = pgTable('lab_dedup_groups', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    canonicalKey: text('canonical_key').notNull(),
    confidence: text('confidence').notNull(),
    status: text('status').notNull().default('confirmed'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [
    unique('lab_dedup_groups_project_key_unique').on(t.projectId, t.canonicalKey),
    index('lab_dedup_groups_project_status_idx').on(t.projectId, t.status),
    check('lab_dedup_groups_confidence_check', sql`${t.confidence} IN ('exact','fuzzy','single')`),
    check('lab_dedup_groups_status_check', sql`${t.status} IN ('confirmed','pending')`),
  ],
);

export type LabDedupGroup = typeof labDedupGroups.$inferSelect;
export type NewLabDedupGroup = typeof labDedupGroups.$inferInsert;

// Proveniencia intacta, 1 resultado em 1 grupo.
// prettier-ignore
export const labDedupMembers = pgTable('lab_dedup_members', {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => labDedupGroups.id, { onDelete: 'cascade' }),
    resultId: uuid('result_id').notNull().references(() => labResults.id, { onDelete: 'cascade' }),
  },
  (t) => [
    unique('lab_dedup_members_group_result_unique').on(t.groupId, t.resultId),
    unique('lab_dedup_members_result_unique').on(t.resultId),
    index('lab_dedup_members_group_idx').on(t.groupId),
  ],
);

export type LabDedupMember = typeof labDedupMembers.$inferSelect;
export type NewLabDedupMember = typeof labDedupMembers.$inferInsert;

// D-46 UMA por grupo (UNIQUE groupId).
// prettier-ignore
export const labGroupDecisions = pgTable('lab_group_decisions', {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => labDedupGroups.id, { onDelete: 'cascade' }).unique(),
    decision: text('decision').notNull().default('undecided'),
    reason: text('reason'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [
    check('lab_group_decisions_decision_check', sql`${t.decision} IN ('eligible','ineligible','undecided')`),
    check('lab_group_decisions_reason_check', sql`char_length(${t.reason}) <= 500`),
  ],
);

export type LabGroupDecision = typeof labGroupDecisions.$inferSelect;
export type NewLabGroupDecision = typeof labGroupDecisions.$inferInsert;

// D-46 anotacao por origem, sem mudar decisao.
// prettier-ignore
export const labDivergences = pgTable('lab_divergences', {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => labDedupGroups.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    note: text('note').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('lab_divergences_group_source_unique').on(t.groupId, t.source),
    check('lab_divergences_source_check', sql`${t.source} IN ('bdtd','capes')`),
    check('lab_divergences_note_check', sql`char_length(${t.note}) >= 1 AND char_length(${t.note}) <= 1000`),
  ],
);

export type LabDivergence = typeof labDivergences.$inferSelect;
export type NewLabDivergence = typeof labDivergences.$inferInsert;

// LAB-09 defaults via seed preguicoso (sem data migration, RESEARCH A6).
// prettier-ignore
export const labTags = pgTable('lab_tags', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('lab_tags_project_name_unique').on(t.projectId, t.name),
    index('lab_tags_project_idx').on(t.projectId),
    check('lab_tags_name_check', sql`char_length(${t.name}) >= 1 AND char_length(${t.name}) <= 100`),
  ],
);

export type LabTag = typeof labTags.$inferSelect;
export type NewLabTag = typeof labTags.$inferInsert;

// Sem id proprio; PK logica (groupId,tagId).
// prettier-ignore
export const labGroupTags = pgTable('lab_group_tags', {
    groupId: uuid('group_id').notNull().references(() => labDedupGroups.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => labTags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    unique('lab_group_tags_group_tag_unique').on(t.groupId, t.tagId),
    index('lab_group_tags_group_idx').on(t.groupId),
  ],
);

export type LabGroupTag = typeof labGroupTags.$inferSelect;
export type NewLabGroupTag = typeof labGroupTags.$inferInsert;

// D-42 par de canonicalKeys ordenado (keyA<keyB na escrita), nunca resultIds.
// prettier-ignore
export const labRejectedPairs = pgTable('lab_rejected_pairs', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    keyA: text('key_a').notNull(),
    keyB: text('key_b').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('lab_rejected_pairs_project_keys_unique').on(t.projectId, t.keyA, t.keyB),
    index('lab_rejected_pairs_project_idx').on(t.projectId),
  ],
);

export type LabRejectedPair = typeof labRejectedPairs.$inferSelect;
export type NewLabRejectedPair = typeof labRejectedPairs.$inferInsert;

// D-45 override estavel (source,sourceId) sobrevive a re-runs; UNIQUE groupId = 1 pin por grupo.
// prettier-ignore
export const labCanonicalPins = pgTable('lab_canonical_pins', {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => labDedupGroups.id, { onDelete: 'cascade' }).unique(),
    source: text('source').notNull(),
    sourceId: text('source_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('lab_canonical_pins_source_check', sql`${t.source} IN ('bdtd','capes')`),
  ],
);

export type LabCanonicalPin = typeof labCanonicalPins.$inferSelect;
export type NewLabCanonicalPin = typeof labCanonicalPins.$inferInsert;
