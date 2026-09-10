// packages/db — schema Drizzle, dono total (D-10).
//
// Fase 2: tabelas platform (users, invites, sessions, password_resets) +
// projects (D-23: ownerId so, sem colaboracao no v1). JSON publico camelCase,
// banco snake_case. CHECKs no banco, nao so no Zod (T-02-01-03).

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
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
