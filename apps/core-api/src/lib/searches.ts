// apps/core-api — lib de buscas owner-first via cadeia →Project (LAB-02/03/04, D-33, D-36).
//
// TODA query filtra `projects.owner_id = actor.userId` server-side via JOIN
// `lab_searches → projects` (Search NÃO tem owner próprio — escopo herdado).
// Leitura/alteração/exclusão fora do escopo retorna null (rota vira 404
// idêntico a inexistente, sem revelar existência). `ownerId` nunca vem do
// body — sempre de `actor.userId` (T-03-04-01).
//
// Cursores:
// - searches/runs: `createdAt|id` base64url como projetos (D-27), ordenação
//   estável `created_at DESC, id DESC` (runs usam `executed_at DESC, id DESC`).
// - results: `source|rank|id` base64url (D-36), ordenação
//   `source ASC, rank ASC, id ASC`, default 20 max 100.

import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  decodeCursor,
  decodeResultsCursor,
  encodeCursor,
  encodeResultsCursor,
  type CreateSearchInput,
  type DocType,
  type ExecutableSource,
  type PageInfo,
  type ResultDTO,
  type RunErrorInfo,
  type RunMetrics,
  type SearchDTO,
  type SearchFilters,
  type SearchRunDTO,
  type UpdateSearchInput,
} from '@uhhu/contracts';
import type { ActorContext } from '@uhhu/core';
import {
  labResults,
  labSearches,
  labSearchRuns,
  projects,
  type Db,
  type LabResult,
  type LabSearch,
  type LabSearchRun,
} from '@uhhu/db';
import { getProjectForActor } from './projects.js';

const uuidSchema = z.string().uuid();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isSafeInteger(raw)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, raw));
}

function isExecutableSource(value: unknown): value is ExecutableSource {
  return value === 'bdtd' || value === 'capes';
}

function parseSearchFilters(value: unknown): SearchFilters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const out: SearchFilters = {};
  if (typeof record['yearFrom'] === 'number' && Number.isSafeInteger(record['yearFrom'])) {
    const yearFrom = record['yearFrom'] as number;
    if (yearFrom >= 1800 && yearFrom <= 2100) {
      out.yearFrom = yearFrom;
    }
  }
  if (typeof record['yearTo'] === 'number' && Number.isSafeInteger(record['yearTo'])) {
    const yearTo = record['yearTo'] as number;
    if (yearTo >= 1800 && yearTo <= 2100) {
      out.yearTo = yearTo;
    }
  }
  if (Array.isArray(record['docTypes'])) {
    const docTypes = (record['docTypes'] as unknown[]).filter(
      (entry): entry is DocType => entry === 'masterThesis' || entry === 'doctoralThesis',
    );
    if (docTypes.length > 0) {
      out.docTypes = docTypes;
    }
  }
  if (record['source'] === 'bdtd' || record['source'] === 'capes') {
    out.source = record['source'];
  }
  if (typeof record['area'] === 'string') {
    out.area = record['area'];
  }
  if (typeof record['institution'] === 'string') {
    out.institution = record['institution'];
  }
  if (typeof record['program'] === 'string') {
    out.program = record['program'];
  }
  return out;
}

function parseSearchSources(value: unknown): ExecutableSource[] {
  if (!Array.isArray(value)) {
    return ['bdtd', 'capes'];
  }
  const filtered = (value as unknown[]).filter(isExecutableSource);
  return filtered.length > 0 ? filtered : ['bdtd', 'capes'];
}

function defaultRunMetrics(): RunMetrics {
  return {
    perSource: {
      bdtd: { status: 'skipped', total: 0, returned: 0, durationMs: 0 },
      capes: { status: 'skipped', total: 0, returned: 0, durationMs: 0 },
    },
    newCount: 0,
    coverage: { bdtd: 0, capes: 0 },
  };
}

function parseRunMetrics(value: unknown): RunMetrics {
  const fallback = defaultRunMetrics();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  const perSource = record['perSource'];
  if (typeof perSource !== 'object' || perSource === null || Array.isArray(perSource)) {
    return fallback;
  }
  const perRecord = perSource as Record<string, unknown>;
  const bdtd = perRecord['bdtd'];
  const capes = perRecord['capes'];
  if (typeof bdtd !== 'object' || bdtd === null || typeof capes !== 'object' || capes === null) {
    return fallback;
  }
  const parseOne = (
    entry: Record<string, unknown>,
  ): {
    status: 'ok' | 'failed' | 'skipped';
    total: number;
    returned: number;
    durationMs: number;
  } | null => {
    const status = entry['status'];
    const total = entry['total'];
    const returned = entry['returned'];
    const durationMs = entry['durationMs'];
    if (status !== 'ok' && status !== 'failed' && status !== 'skipped') {
      return null;
    }
    if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
      return null;
    }
    if (typeof returned !== 'number' || !Number.isSafeInteger(returned) || returned < 0) {
      return null;
    }
    if (typeof durationMs !== 'number' || !Number.isSafeInteger(durationMs) || durationMs < 0) {
      return null;
    }
    return { status, total, returned, durationMs };
  };
  const bdtdParsed = parseOne(bdtd as Record<string, unknown>);
  const capesParsed = parseOne(capes as Record<string, unknown>);
  if (bdtdParsed === null || capesParsed === null) {
    return fallback;
  }
  const newCount = record['newCount'];
  const coverage = record['coverage'];
  if (typeof newCount !== 'number' || !Number.isSafeInteger(newCount) || newCount < 0) {
    return fallback;
  }
  if (typeof coverage !== 'object' || coverage === null || Array.isArray(coverage)) {
    return fallback;
  }
  const coverageRecord = coverage as Record<string, unknown>;
  const bdtdCoverage = coverageRecord['bdtd'];
  const capesCoverage = coverageRecord['capes'];
  if (
    typeof bdtdCoverage !== 'number' ||
    !Number.isSafeInteger(bdtdCoverage) ||
    bdtdCoverage < 0 ||
    typeof capesCoverage !== 'number' ||
    !Number.isSafeInteger(capesCoverage) ||
    capesCoverage < 0
  ) {
    return fallback;
  }
  return {
    perSource: { bdtd: bdtdParsed, capes: capesParsed },
    newCount,
    coverage: { bdtd: bdtdCoverage, capes: capesCoverage },
  };
}

function parseRunError(value: unknown): RunErrorInfo | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record['code'] !== 'string' || typeof record['message'] !== 'string') {
    return null;
  }
  return { code: record['code'] as string, message: record['message'] as string };
}

function parseAuthors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as unknown[]).filter((entry): entry is string => typeof entry === 'string');
}

function parseDocType(value: unknown): DocType | null {
  if (value === 'masterThesis' || value === 'doctoralThesis') {
    return value;
  }
  return null;
}

function parseNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseNullableYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  return null;
}

const rawMetadataSchema = z.record(z.string(), z.unknown());

function parseRawMetadata(value: unknown): Record<string, unknown> {
  const parsed = rawMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function toSearchDTO(row: LabSearch): SearchDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    term: row.term,
    filters: parseSearchFilters(row.filters),
    sources: parseSearchSources(row.sources),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toRunDTO(row: LabSearchRun): SearchRunDTO {
  const status = row.status;
  const safeStatus =
    status === 'queued' ||
    status === 'running' ||
    status === 'succeeded' ||
    status === 'partial' ||
    status === 'failed' ||
    status === 'cancelled'
      ? status
      : 'failed';
  return {
    id: row.id,
    searchId: row.searchId,
    status: safeStatus,
    termSnapshot: row.termSnapshot,
    filtersSnapshot: parseSearchFilters(row.filtersSnapshot),
    sourcesSnapshot: parseSearchSources(row.sourcesSnapshot),
    executedAt: row.executedAt.toISOString(),
    startedAt: row.startedAt === null ? null : row.startedAt.toISOString(),
    finishedAt: row.finishedAt === null ? null : row.finishedAt.toISOString(),
    metrics: parseRunMetrics(row.metrics),
    error: parseRunError(row.error),
  };
}

export function toResultDTO(row: LabResult): ResultDTO {
  const source = isExecutableSource(row.source) ? row.source : 'bdtd';
  return {
    id: row.id,
    runId: row.runId,
    source,
    sourceId: row.sourceId,
    title: row.title,
    authors: parseAuthors(row.authors),
    year: parseNullableYear(row.year),
    docType: parseDocType(row.docType),
    institution: parseNullableString(row.institution),
    program: parseNullableString(row.program),
    abstract: parseNullableString(row.abstract),
    originUrl: parseNullableString(row.originUrl),
    sourceUrl: parseNullableString(row.sourceUrl),
    rawMetadata: parseRawMetadata(row.rawMetadata),
    retrievedAt: row.retrievedAt.toISOString(),
  };
}

export async function createSearchForActor(
  db: Db,
  actor: ActorContext,
  input: CreateSearchInput,
): Promise<SearchDTO | null> {
  const project = await getProjectForActor(db, actor, input.projectId);
  if (project === null) {
    return null;
  }
  const inserted = await db
    .insert(labSearches)
    .values({
      projectId: input.projectId,
      term: input.term,
      filters: input.filters,
      sources: input.sources,
    })
    .returning();
  const row = inserted[0];
  if (row === undefined) {
    throw new Error('search insert did not return row');
  }
  return toSearchDTO(row);
}

export async function getSearchForActor(
  db: Db,
  actor: ActorContext,
  id: string,
): Promise<SearchDTO | null> {
  if (!uuidSchema.safeParse(id).success) {
    return null;
  }
  const rows = await db
    .select({ search: labSearches })
    .from(labSearches)
    .innerJoin(projects, eq(labSearches.projectId, projects.id))
    .where(and(eq(labSearches.id, id), eq(projects.ownerId, actor.userId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return toSearchDTO(row.search);
}

export interface ListSearchesOptions {
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface ListSearchesResult {
  items: SearchDTO[];
  page: PageInfo;
}

export async function listSearchesForActor(
  db: Db,
  actor: ActorContext,
  projectId: string,
  options: ListSearchesOptions,
): Promise<ListSearchesResult> {
  const limit = clampLimit(options.limit);
  const project = await getProjectForActor(db, actor, projectId);
  if (project === null) {
    return { items: [], page: { limit, nextCursor: null, hasMore: false } };
  }
  let cursorFilter = undefined;
  if (options.cursor !== undefined && options.cursor.length > 0) {
    const decoded = decodeCursor(options.cursor);
    if (decoded !== null && uuidSchema.safeParse(decoded.id).success) {
      const cursorDate = new Date(decoded.createdAt);
      if (!Number.isNaN(cursorDate.getTime())) {
        cursorFilter = or(
          lt(labSearches.createdAt, cursorDate),
          and(eq(labSearches.createdAt, cursorDate), lt(labSearches.id, decoded.id)),
        );
      }
    }
  }
  const rows = await db
    .select({ search: labSearches })
    .from(labSearches)
    .innerJoin(projects, eq(labSearches.projectId, projects.id))
    .where(
      and(eq(labSearches.projectId, projectId), eq(projects.ownerId, actor.userId), cursorFilter),
    )
    .orderBy(desc(labSearches.createdAt), desc(labSearches.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last !== undefined
      ? encodeCursor(last.search.createdAt.toISOString(), last.search.id)
      : null;
  return {
    items: pageRows.map((entry) => toSearchDTO(entry.search)),
    page: { limit, nextCursor, hasMore },
  };
}

export async function updateSearchForActor(
  db: Db,
  actor: ActorContext,
  id: string,
  input: UpdateSearchInput,
): Promise<SearchDTO | null> {
  if (!uuidSchema.safeParse(id).success) {
    return null;
  }
  const current = await getSearchForActor(db, actor, id);
  if (current === null) {
    return null;
  }
  const hasChanges =
    input.term !== undefined || input.filters !== undefined || input.sources !== undefined;
  if (!hasChanges) {
    return current;
  }
  const set: {
    term?: string;
    filters?: SearchFilters;
    sources?: string[];
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (input.term !== undefined) {
    set.term = input.term;
  }
  if (input.filters !== undefined) {
    set.filters = input.filters;
  }
  if (input.sources !== undefined) {
    set.sources = input.sources;
  }
  const updated = await db.update(labSearches).set(set).where(eq(labSearches.id, id)).returning();
  const row = updated[0];
  if (row === undefined) {
    return null;
  }
  return toSearchDTO(row);
}

export async function deleteSearchForActor(
  db: Db,
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  if (!uuidSchema.safeParse(id).success) {
    return false;
  }
  const current = await getSearchForActor(db, actor, id);
  if (current === null) {
    return false;
  }
  const deleted = await db
    .delete(labSearches)
    .where(eq(labSearches.id, id))
    .returning({ id: labSearches.id });
  return deleted.length > 0;
}

export async function getRunForActor(
  db: Db,
  actor: ActorContext,
  runId: string,
): Promise<SearchRunDTO | null> {
  if (!uuidSchema.safeParse(runId).success) {
    return null;
  }
  const rows = await db
    .select({ run: labSearchRuns })
    .from(labSearchRuns)
    .innerJoin(labSearches, eq(labSearchRuns.searchId, labSearches.id))
    .innerJoin(projects, eq(labSearches.projectId, projects.id))
    .where(and(eq(labSearchRuns.id, runId), eq(projects.ownerId, actor.userId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return toRunDTO(row.run);
}

export interface ListRunsOptions {
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface ListRunsResult {
  items: SearchRunDTO[];
  page: PageInfo;
}

export async function listRunsForActor(
  db: Db,
  actor: ActorContext,
  searchId: string,
  options: ListRunsOptions,
): Promise<ListRunsResult> {
  const limit = clampLimit(options.limit);
  const search = await getSearchForActor(db, actor, searchId);
  if (search === null) {
    return { items: [], page: { limit, nextCursor: null, hasMore: false } };
  }
  let cursorFilter = undefined;
  if (options.cursor !== undefined && options.cursor.length > 0) {
    const decoded = decodeCursor(options.cursor);
    if (decoded !== null && uuidSchema.safeParse(decoded.id).success) {
      const cursorDate = new Date(decoded.createdAt);
      if (!Number.isNaN(cursorDate.getTime())) {
        cursorFilter = or(
          lt(labSearchRuns.executedAt, cursorDate),
          and(eq(labSearchRuns.executedAt, cursorDate), lt(labSearchRuns.id, decoded.id)),
        );
      }
    }
  }
  const rows = await db
    .select({ run: labSearchRuns })
    .from(labSearchRuns)
    .innerJoin(labSearches, eq(labSearchRuns.searchId, labSearches.id))
    .innerJoin(projects, eq(labSearches.projectId, projects.id))
    .where(
      and(eq(labSearchRuns.searchId, searchId), eq(projects.ownerId, actor.userId), cursorFilter),
    )
    .orderBy(desc(labSearchRuns.executedAt), desc(labSearchRuns.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last !== undefined
      ? encodeCursor(last.run.executedAt.toISOString(), last.run.id)
      : null;
  return {
    items: pageRows.map((entry) => toRunDTO(entry.run)),
    page: { limit, nextCursor, hasMore },
  };
}

export interface ListResultsOptions {
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface ListResultsResult {
  items: ResultDTO[];
  page: PageInfo;
  total: number;
}

export async function listResultsForActor(
  db: Db,
  actor: ActorContext,
  runId: string,
  options: ListResultsOptions,
): Promise<ListResultsResult> {
  const limit = clampLimit(options.limit);
  if (!uuidSchema.safeParse(runId).success) {
    return { items: [], page: { limit, nextCursor: null, hasMore: false }, total: 0 };
  }
  const run = await getRunForActor(db, actor, runId);
  if (run === null) {
    return { items: [], page: { limit, nextCursor: null, hasMore: false }, total: 0 };
  }
  let cursorFilter = undefined;
  if (options.cursor !== undefined && options.cursor.length > 0) {
    const decoded = decodeResultsCursor(options.cursor);
    if (decoded !== null && uuidSchema.safeParse(decoded.id).success) {
      cursorFilter = or(
        gt(labResults.source, decoded.source),
        and(eq(labResults.source, decoded.source), gt(labResults.rank, decoded.rank)),
        and(
          eq(labResults.source, decoded.source),
          eq(labResults.rank, decoded.rank),
          gt(labResults.id, decoded.id),
        ),
      );
    }
  }
  const rows = await db
    .select({ result: labResults })
    .from(labResults)
    .innerJoin(labSearchRuns, eq(labResults.runId, labSearchRuns.id))
    .innerJoin(labSearches, eq(labSearchRuns.searchId, labSearches.id))
    .innerJoin(projects, eq(labSearches.projectId, projects.id))
    .where(and(eq(labResults.runId, runId), eq(projects.ownerId, actor.userId), cursorFilter))
    .orderBy(asc(labResults.source), asc(labResults.rank), asc(labResults.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last !== undefined
      ? encodeResultsCursor(last.result.source, last.result.rank, last.result.id)
      : null;
  const totalRows = await db
    .select({ id: labResults.id })
    .from(labResults)
    .innerJoin(labSearchRuns, eq(labResults.runId, labSearchRuns.id))
    .innerJoin(labSearches, eq(labSearchRuns.searchId, labSearches.id))
    .innerJoin(projects, eq(labSearches.projectId, projects.id))
    .where(and(eq(labResults.runId, runId), eq(projects.ownerId, actor.userId)));
  return {
    items: pageRows.map((entry) => toResultDTO(entry.result)),
    page: { limit, nextCursor, hasMore },
    total: totalRows.length,
  };
}

export async function getResultForActor(
  db: Db,
  actor: ActorContext,
  resultId: string,
): Promise<ResultDTO | null> {
  if (!uuidSchema.safeParse(resultId).success) {
    return null;
  }
  const rows = await db
    .select({ result: labResults })
    .from(labResults)
    .innerJoin(labSearchRuns, eq(labResults.runId, labSearchRuns.id))
    .innerJoin(labSearches, eq(labSearchRuns.searchId, labSearches.id))
    .innerJoin(projects, eq(labSearches.projectId, projects.id))
    .where(and(eq(labResults.id, resultId), eq(projects.ownerId, actor.userId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return toResultDTO(row.result);
}
