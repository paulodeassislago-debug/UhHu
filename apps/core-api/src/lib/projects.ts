// apps/core-api — lib de projetos escopada por ownerId (D-22..D-24, PLAT-03).
//
// TODA query filtra `owner_id = actor.userId` (server-side, nunca do cliente).
// Leitura/alteracao/exclusao fora do escopo retorna null (rota vira 404
// identico a inexistente, sem revelar existencia). Ordenacao estavel
// `created_at DESC, id DESC` + cursor opaco base64url (D-27).

import { and, desc, eq, lt, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  decodeCursor,
  encodeCursor,
  type CreateProjectInput,
  type PageInfo,
  type ProjectDTO,
  type ProjectStatus,
  type UpdateProjectInput,
} from '@uhhu/contracts';
import type { ActorContext } from '@uhhu/core';
import { projects, type Db, type Project } from '@uhhu/db';

const uuidSchema = z.string().uuid();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toStatus(value: string): ProjectStatus {
  return value === 'archived' ? 'archived' : 'active';
}

export function toProjectDTO(row: Project): ProjectDTO {
  return {
    id: row.id,
    title: row.title,
    researchQuestion: row.researchQuestion,
    description: row.description,
    status: toStatus(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createProject(
  db: Db,
  actor: ActorContext,
  input: CreateProjectInput,
): Promise<ProjectDTO> {
  const inserted = await db
    .insert(projects)
    .values({
      ownerId: actor.userId,
      title: input.title,
      researchQuestion: input.researchQuestion ?? null,
      description: input.description ?? null,
    })
    .returning();
  const row = inserted[0];
  if (row === undefined) {
    throw new Error('project insert did not return row');
  }
  return toProjectDTO(row);
}

export async function getProjectForActor(
  db: Db,
  actor: ActorContext,
  id: string,
): Promise<ProjectDTO | null> {
  if (!uuidSchema.safeParse(id).success) {
    return null;
  }
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, actor.userId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return toProjectDTO(row);
}

export type ListProjectsStatus = 'active' | 'archived' | 'all';

export interface ListProjectsOptions {
  limit?: number | undefined;
  cursor?: string | undefined;
  status?: ListProjectsStatus | undefined;
}

export interface ListProjectsResult {
  items: ProjectDTO[];
  page: PageInfo;
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isSafeInteger(raw)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, raw));
}

function buildCursorFilter(cursor: string | undefined): SQL | undefined {
  if (cursor === undefined || cursor.length === 0) {
    return undefined;
  }
  const decoded = decodeCursor(cursor);
  if (decoded === null) {
    return undefined;
  }
  if (!uuidSchema.safeParse(decoded.id).success) {
    return undefined;
  }
  const cursorDate = new Date(decoded.createdAt);
  if (Number.isNaN(cursorDate.getTime())) {
    return undefined;
  }
  return or(
    lt(projects.createdAt, cursorDate),
    and(eq(projects.createdAt, cursorDate), lt(projects.id, decoded.id)),
  );
}

export async function listProjectsForActor(
  db: Db,
  actor: ActorContext,
  options: ListProjectsOptions,
): Promise<ListProjectsResult> {
  const limit = clampLimit(options.limit);
  const status: ListProjectsStatus = options.status ?? 'active';
  const cursorFilter = buildCursorFilter(options.cursor);

  const rows = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.ownerId, actor.userId),
        status === 'all' ? undefined : eq(projects.status, status),
        cursorFilter,
      ),
    )
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last !== undefined ? encodeCursor(last.createdAt.toISOString(), last.id) : null;

  return {
    items: pageRows.map((row) => toProjectDTO(row)),
    page: { limit, nextCursor, hasMore },
  };
}

export async function updateProjectForActor(
  db: Db,
  actor: ActorContext,
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectDTO | null> {
  if (!uuidSchema.safeParse(id).success) {
    return null;
  }
  const hasChanges =
    input.title !== undefined ||
    input.researchQuestion !== undefined ||
    input.description !== undefined ||
    input.status !== undefined;
  if (!hasChanges) {
    return getProjectForActor(db, actor, id);
  }
  const set: {
    title?: string;
    researchQuestion?: string | null;
    description?: string | null;
    status?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (input.title !== undefined) {
    set.title = input.title;
  }
  if (input.researchQuestion !== undefined) {
    set.researchQuestion = input.researchQuestion;
  }
  if (input.description !== undefined) {
    set.description = input.description;
  }
  if (input.status !== undefined) {
    set.status = input.status;
  }
  const updated = await db
    .update(projects)
    .set(set)
    .where(and(eq(projects.id, id), eq(projects.ownerId, actor.userId)))
    .returning();
  const row = updated[0];
  if (row === undefined) {
    return null;
  }
  return toProjectDTO(row);
}

export async function deleteProjectForActor(
  db: Db,
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  if (!uuidSchema.safeParse(id).success) {
    return false;
  }
  const deleted = await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, actor.userId)))
    .returning({ id: projects.id });
  return deleted.length > 0;
}
