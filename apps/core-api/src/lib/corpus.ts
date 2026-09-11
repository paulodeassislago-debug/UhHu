// apps/core-api — lib de revisao/corpus owner-first (LAB-07/08/09/10, D-40..D-49).
//
// TODA operacao filtra `projects.owner_id = actor.userId` (JOIN nas leituras
// por ID; escopo via getProjectForActor nas leituras por projeto).
// Fora do escopo / UUID invalido → null (rota vira 404 identico).
// `ownerId` nunca vem do body — sempre de `actor.userId`.
//
// Identidade por conteudo (projectId, canonicalKey), NUNCA resultId (D-41–D-45):
// re-runs criam novos UUIDs de resultado; a chave SHA-256 e estavel.
// Precedencia do auto-attach (D-43): (1) veto de rejected_pairs, (2) grupo
// existente por chave exata (mantem status+pin+decisao), (3) fuzzy novo →
// pending. Sem HTTP/envelope na lib — so DTOs e null.

import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import type { CompareDTO, CorpusEntryDTO, DedupGroupDTO, ExecutableSource, PageInfo } from '@uhhu/contracts';
import { decodeCursor, encodeCursor } from '@uhhu/contracts';
import type { ActorContext } from '@uhhu/core';
import {
  labCanonicalPins,
  labDedupGroups,
  labDedupMembers,
  labDivergences,
  labGroupDecisions,
  labGroupTags,
  labRejectedPairs,
  labResults,
  labSearches,
  labSearchRuns,
  labTags,
  projects,
  type Db,
  type LabDedupGroup,
  type LabResult,
} from '@uhhu/db';
import { getProjectForActor } from './projects.js';
import { getSearchForActor } from './searches.js';
import {
  canonicalKey,
  completenessScore,
  FUZZY_THRESHOLD,
  titleSimilarity,
} from './dedup.js';

const uuidSchema = z.string().uuid();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isSafeInteger(raw)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, raw));
}

void clampLimit;

function isExecutableSource(value: unknown): value is ExecutableSource {
  return value === 'bdtd' || value === 'capes';
}

function parseAuthors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as unknown[]).filter((entry): entry is string => typeof entry === 'string');
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

function resultKey(row: LabResult): string {
  return canonicalKey(row.title, parseNullableYear(row.year), parseAuthors(row.authors));
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ---------------------------------------------------------------------------
// Registro canonico (D-44/D-45).
// ---------------------------------------------------------------------------

export interface CanonicalCandidate {
  id: string;
  source: string;
  sourceId: string;
  abstract: string | null;
  authors: string[];
  year: number | null;
  originUrl: string | null;
  sourceUrl: string | null;
}

export function toCanonicalCandidate(row: LabResult): CanonicalCandidate {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.sourceId,
    abstract: parseNullableString(row.abstract),
    authors: parseAuthors(row.authors),
    year: parseNullableYear(row.year),
    originUrl: parseNullableString(row.originUrl),
    sourceUrl: parseNullableString(row.sourceUrl),
  };
}

export function resolveCanonicalResult(
  members: CanonicalCandidate[],
  pin: { source: string; sourceId: string } | null,
): string {
  if (pin !== null) {
    const pinned = members.find((m) => m.source === pin.source && m.sourceId === pin.sourceId);
    if (pinned !== undefined) {
      return pinned.id;
    }
  }
  let best: CanonicalCandidate | null = null;
  let bestScore = -1;
  for (const m of members) {
    const score = completenessScore(m);
    if (
      best === null ||
      score > bestScore ||
      (score === bestScore &&
        (m.source < best.source ||
          (m.source === best.source && m.sourceId < best.sourceId)))
    ) {
      best = m;
      bestScore = score;
    }
  }
  if (best === null) {
    throw new Error('resolveCanonicalResult: sem membros');
  }
  return best.id;
}

// ---------------------------------------------------------------------------
// Bundles + mapper.
// ---------------------------------------------------------------------------

export interface GroupBundle {
  group: LabDedupGroup;
  memberIds: string[];
  members: CanonicalCandidate[];
  memberRows: LabResult[];
  memberKeys: Map<string, string>;
  decision: 'eligible' | 'ineligible' | 'undecided';
  pin: { source: string; sourceId: string } | null;
}

function narrowConfidence(value: string): 'exact' | 'fuzzy' | 'single' {
  return value === 'exact' || value === 'fuzzy' || value === 'single' ? value : 'single';
}

function narrowStatus(value: string): 'confirmed' | 'pending' {
  return value === 'confirmed' || value === 'pending' ? value : 'confirmed';
}

function narrowDecision(value: string): 'eligible' | 'ineligible' | 'undecided' {
  return value === 'eligible' || value === 'ineligible' || value === 'undecided'
    ? value
    : 'undecided';
}

export function toGroupDTO(bundle: GroupBundle): DedupGroupDTO {
  const origins = [...new Set(bundle.members.map((m) => m.source).filter(isExecutableSource))].sort();
  return {
    id: bundle.group.id,
    projectId: bundle.group.projectId,
    canonicalKey: bundle.group.canonicalKey,
    confidence: narrowConfidence(bundle.group.confidence),
    status: narrowStatus(bundle.group.status),
    canonicalResultId: resolveCanonicalResult(bundle.members, bundle.pin),
    memberIds: bundle.memberIds,
    decision: bundle.decision,
    originCount: origins.length,
    origins,
  };
}

export async function loadGroupBundles(
  db: Db,
  projectId: string,
  onlyIds?: string[],
): Promise<GroupBundle[]> {
  if (onlyIds !== undefined && onlyIds.length === 0) {
    return [];
  }
  const groups =
    onlyIds === undefined
      ? await db
          .select()
          .from(labDedupGroups)
          .where(eq(labDedupGroups.projectId, projectId))
          .orderBy(asc(labDedupGroups.createdAt), asc(labDedupGroups.id))
      : await db
          .select()
          .from(labDedupGroups)
          .where(and(eq(labDedupGroups.projectId, projectId), inArray(labDedupGroups.id, onlyIds)));
  if (groups.length === 0) {
    return [];
  }
  const ids = groups.map((g) => g.id);
  const memberRows = await db
    .select()
    .from(labDedupMembers)
    .where(inArray(labDedupMembers.groupId, ids));
  const resultIds = [...new Set(memberRows.map((m) => m.resultId))];
  const results =
    resultIds.length === 0
      ? []
      : await db.select().from(labResults).where(inArray(labResults.id, resultIds));
  const resultById = new Map(results.map((r) => [r.id, r] as const));
  const decisions = await db
    .select()
    .from(labGroupDecisions)
    .where(inArray(labGroupDecisions.groupId, ids));
  const decisionByGroup = new Map(
    decisions.map((d) => [d.groupId, narrowDecision(d.decision)] as const),
  );
  const pins = await db
    .select()
    .from(labCanonicalPins)
    .where(inArray(labCanonicalPins.groupId, ids));
  const pinByGroup = new Map(
    pins.map((p) => [p.groupId, { source: p.source, sourceId: p.sourceId }] as const),
  );
  return groups.map((group) => {
    const membersOfGroup = memberRows.filter((m) => m.groupId === group.id);
    const memberIds = membersOfGroup.map((m) => m.resultId);
    const rows = membersOfGroup
      .map((m) => resultById.get(m.resultId))
      .filter((r): r is LabResult => r !== undefined);
    const memberKeys = new Map(rows.map((r) => [r.id, resultKey(r)] as const));
    return {
      group,
      memberIds,
      members: rows.map(toCanonicalCandidate),
      memberRows: rows,
      memberKeys,
      decision: decisionByGroup.get(group.id) ?? 'undecided',
      pin: pinByGroup.get(group.id) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Persistencia interna (upserts idempotentes).
// ---------------------------------------------------------------------------

async function attachMember(db: Db, groupId: string, resultId: string): Promise<void> {
  await db.insert(labDedupMembers).values({ groupId, resultId }).onConflictDoNothing();
}

async function getOrCreateGroup(
  db: Db,
  projectId: string,
  key: string,
  confidence: 'exact' | 'fuzzy' | 'single',
  status: 'confirmed' | 'pending',
): Promise<string> {
  await db
    .insert(labDedupGroups)
    .values({ projectId, canonicalKey: key, confidence, status })
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(labDedupGroups)
    .where(and(eq(labDedupGroups.projectId, projectId), eq(labDedupGroups.canonicalKey, key)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error('group insert did not return row');
  }
  return row.id;
}

async function scopedGroup(
  db: Db,
  actor: ActorContext,
  groupId: string,
): Promise<LabDedupGroup | null> {
  if (!uuidSchema.safeParse(groupId).success) {
    return null;
  }
  const rows = await db
    .select({ group: labDedupGroups })
    .from(labDedupGroups)
    .innerJoin(projects, eq(labDedupGroups.projectId, projects.id))
    .where(and(eq(labDedupGroups.id, groupId), eq(projects.ownerId, actor.userId)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : row.group;
}

// ---------------------------------------------------------------------------
// Dedup engine: compute/confirm/reject/pin (D-40..D-45).
// ---------------------------------------------------------------------------

interface FuzzyCandidate {
  row: LabResult;
  key: string;
}

function fuzzyScore(
  a: FuzzyCandidate,
  b: FuzzyCandidate,
  veto: Set<string>,
): number | null {
  const yearA = parseNullableYear(a.row.year);
  const yearB = parseNullableYear(b.row.year);
  if (yearA === null || yearB === null || yearA !== yearB) {
    return null;
  }
  if (a.key === b.key) {
    return null;
  }
  if (veto.has(pairKey(a.key, b.key))) {
    return null;
  }
  const sim = titleSimilarity(a.row.title, b.row.title);
  return sim >= FUZZY_THRESHOLD ? sim : null;
}

export async function computeDedupGroupsForActor(
  db: Db,
  actor: ActorContext,
  projectId: string,
): Promise<DedupGroupDTO[]> {
  if (!uuidSchema.safeParse(projectId).success) {
    return [];
  }
  const project = await getProjectForActor(db, actor, projectId);
  if (project === null) {
    return [];
  }
  // (1) veto de pares rejeitados (D-42).
  const rejectedRows = await db
    .select({ pair: labRejectedPairs })
    .from(labRejectedPairs)
    .innerJoin(projects, eq(labRejectedPairs.projectId, projects.id))
    .where(and(eq(labRejectedPairs.projectId, projectId), eq(projects.ownerId, actor.userId)));
  const veto = new Set(rejectedRows.map((r) => pairKey(r.pair.keyA, r.pair.keyB)));
  // (2) resultados do ULTIMO run concluido (succeeded|partial) de cada busca (D-48/A3).
  const searchRows = await db
    .select({ search: labSearches })
    .from(labSearches)
    .innerJoin(projects, eq(labSearches.projectId, projects.id))
    .where(and(eq(labSearches.projectId, projectId), eq(projects.ownerId, actor.userId)));
  const runIds: string[] = [];
  for (const entry of searchRows) {
    const s = entry.search;
    const runs = await db
      .select()
      .from(labSearchRuns)
      .where(
        and(
          eq(labSearchRuns.searchId, s.id),
          inArray(labSearchRuns.status, ['succeeded', 'partial']),
        ),
      )
      .orderBy(desc(labSearchRuns.executedAt), desc(labSearchRuns.id))
      .limit(1);
    const run = runs[0];
    if (run !== undefined) {
      runIds.push(run.id);
    }
  }
  const resultRows =
    runIds.length === 0
      ? []
      : await db.select().from(labResults).where(inArray(labResults.runId, runIds));
  // Grupos existentes: indice por chave (canonicalKey + chaves dos membros) e por resultado.
  const bundles = await loadGroupBundles(db, projectId);
  const keyToGroupId = new Map<string, string>();
  const memberToGroupId = new Map<string, string>();
  const singlePool: Array<{ row: LabResult; key: string; groupId: string }> = [];
  for (const b of bundles) {
    keyToGroupId.set(b.group.canonicalKey, b.group.id);
    for (const r of b.memberRows) {
      memberToGroupId.set(r.id, b.group.id);
      const k = b.memberKeys.get(r.id) ?? resultKey(r);
      keyToGroupId.set(k, b.group.id);
      if (narrowConfidence(b.group.confidence) === 'single') {
        singlePool.push({ row: r, key: k, groupId: b.group.id });
      }
    }
  }
  // Passo exato: attach em grupo existente (mantem status+pin+decisao, D-43).
  const ungrouped: FuzzyCandidate[] = [];
  for (const r of resultRows) {
    if (memberToGroupId.has(r.id)) {
      continue;
    }
    const key = resultKey(r);
    const gid = keyToGroupId.get(key);
    if (gid !== undefined) {
      await attachMember(db, gid, r.id);
      memberToGroupId.set(r.id, gid);
    } else {
      ungrouped.push({ row: r, key });
    }
  }
  const byKey = new Map<string, LabResult[]>();
  for (const u of ungrouped) {
    const list = byKey.get(u.key) ?? [];
    list.push(u.row);
    byKey.set(u.key, list);
  }
  const fuzzyCandidates: FuzzyCandidate[] = [];
  for (const [key, rows] of byKey) {
    if (rows.length >= 2) {
      const gid = await getOrCreateGroup(db, projectId, key, 'exact', 'confirmed');
      for (const r of rows) {
        await attachMember(db, gid, r.id);
        memberToGroupId.set(r.id, gid);
      }
      keyToGroupId.set(key, gid);
    } else {
      const single = rows[0];
      if (single !== undefined) {
        fuzzyCandidates.push({ row: single, key });
      }
    }
  }
  // Passo fuzzy: candidatos entre si + membros de singles (trava de ano + veto, D-40/D-42).
  fuzzyCandidates.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const placed = new Set<string>();
  for (const cand of fuzzyCandidates) {
    if (placed.has(cand.row.id)) {
      continue;
    }
    let best: { row: LabResult; key: string; groupId: string | null; sim: number } | null = null;
    for (const other of fuzzyCandidates) {
      if (other.row.id === cand.row.id || placed.has(other.row.id)) {
        continue;
      }
      const sim = fuzzyScore(cand, other, veto);
      if (sim !== null && (best === null || sim > best.sim)) {
        best = { row: other.row, key: other.key, groupId: null, sim };
      }
    }
    for (const s of singlePool) {
      if (placed.has(s.row.id)) {
        continue;
      }
      const sim = fuzzyScore(cand, { row: s.row, key: s.key }, veto);
      if (sim !== null && (best === null || sim > best.sim)) {
        best = { row: s.row, key: s.key, groupId: s.groupId, sim };
      }
    }
    if (best === null) {
      const gid = await getOrCreateGroup(db, projectId, cand.key, 'single', 'confirmed');
      await attachMember(db, gid, cand.row.id);
      keyToGroupId.set(cand.key, gid);
      memberToGroupId.set(cand.row.id, gid);
      placed.add(cand.row.id);
    } else if (best.groupId !== null) {
      await attachMember(db, best.groupId, cand.row.id);
      await db
        .update(labDedupGroups)
        .set({ confidence: 'fuzzy', status: 'pending' })
        .where(eq(labDedupGroups.id, best.groupId));
      placed.add(cand.row.id);
      const idx = singlePool.findIndex((s) => s.groupId === best.groupId);
      if (idx >= 0) {
        singlePool.splice(idx, 1);
      }
    } else {
      const gid = await getOrCreateGroup(db, projectId, cand.key, 'fuzzy', 'pending');
      await attachMember(db, gid, cand.row.id);
      await attachMember(db, gid, best.row.id);
      placed.add(cand.row.id);
      placed.add(best.row.id);
    }
  }
  const fresh = await loadGroupBundles(db, projectId);
  return fresh.map(toGroupDTO);
}

export async function confirmGroupForActor(
  db: Db,
  actor: ActorContext,
  groupId: string,
): Promise<DedupGroupDTO | null> {
  const group = await scopedGroup(db, actor, groupId);
  if (group === null) {
    return null;
  }
  if (group.status === 'pending') {
    await db
      .update(labDedupGroups)
      .set({ status: 'confirmed' })
      .where(eq(labDedupGroups.id, groupId));
  }
  const bundles = await loadGroupBundles(db, group.projectId, [groupId]);
  const bundle = bundles[0];
  if (bundle === undefined) {
    return null;
  }
  return toGroupDTO(bundle);
}

export async function rejectGroupForActor(
  db: Db,
  actor: ActorContext,
  groupId: string,
): Promise<DedupGroupDTO[] | null> {
  const group = await scopedGroup(db, actor, groupId);
  if (group === null) {
    return null;
  }
  if (group.confidence !== 'fuzzy' || group.status !== 'pending') {
    return null;
  }
  const bundles = await loadGroupBundles(db, group.projectId, [groupId]);
  const bundle = bundles[0];
  if (bundle === undefined || bundle.memberRows.length === 0) {
    return null;
  }
  // Lembra o pareamento rejeitado (todos os pares, chaves ordenadas, D-42).
  const keys = bundle.memberRows.map((r) => resultKey(r));
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      if (a === undefined || b === undefined || a === b) {
        continue;
      }
      await db
        .insert(labRejectedPairs)
        .values({ projectId: group.projectId, keyA: a < b ? a : b, keyB: a < b ? b : a })
        .onConflictDoNothing();
    }
  }
  await db.delete(labDedupGroups).where(eq(labDedupGroups.id, groupId));
  const singleIds: string[] = [];
  for (const r of bundle.memberRows) {
    const gid = await getOrCreateGroup(db, group.projectId, resultKey(r), 'single', 'confirmed');
    await attachMember(db, gid, r.id);
    singleIds.push(gid);
  }
  const singles = await loadGroupBundles(db, group.projectId, [...new Set(singleIds)]);
  return singles.map(toGroupDTO);
}

export async function setPinForActor(
  db: Db,
  actor: ActorContext,
  groupId: string,
  input: { source: 'bdtd' | 'capes'; sourceId: string },
): Promise<DedupGroupDTO | null> {
  const group = await scopedGroup(db, actor, groupId);
  if (group === null) {
    return null;
  }
  await db
    .insert(labCanonicalPins)
    .values({ groupId, source: input.source, sourceId: input.sourceId })
    .onConflictDoUpdate({
      target: labCanonicalPins.groupId,
      set: { source: input.source, sourceId: input.sourceId },
    });
  const bundles = await loadGroupBundles(db, group.projectId, [groupId]);
  const bundle = bundles[0];
  if (bundle === undefined) {
    return null;
  }
  return toGroupDTO(bundle);
}

export async function clearPinForActor(
  db: Db,
  actor: ActorContext,
  groupId: string,
): Promise<DedupGroupDTO | null> {
  const group = await scopedGroup(db, actor, groupId);
  if (group === null) {
    return null;
  }
  await db.delete(labCanonicalPins).where(eq(labCanonicalPins.groupId, groupId));
  const bundles = await loadGroupBundles(db, group.projectId, [groupId]);
  const bundle = bundles[0];
  if (bundle === undefined) {
    return null;
  }
  return toGroupDTO(bundle);
}

// ---------------------------------------------------------------------------
// Decisao/tags/divergencia/corpus view (D-46, LAB-08/09).
// ---------------------------------------------------------------------------

export const DEFAULT_TAGS = ['incluir', 'excluir', 'duplicado', 'indisponível', 'revisar'] as const;

export interface ProjectTag {
  id: string;
  name: string;
  color: string | null;
}

export async function ensureDefaultTags(
  db: Db,
  actor: ActorContext,
  projectId: string,
): Promise<ProjectTag[] | null> {
  if (!uuidSchema.safeParse(projectId).success) {
    return null;
  }
  const project = await getProjectForActor(db, actor, projectId);
  if (project === null) {
    return null;
  }
  for (const name of DEFAULT_TAGS) {
    await db
      .insert(labTags)
      .values({ projectId, name, color: null })
      .onConflictDoNothing();
  }
  const rows = await db.select().from(labTags).where(eq(labTags.projectId, projectId));
  return rows.map((t) => ({ id: t.id, name: t.name, color: t.color }));
}

export async function listTagsForActor(
  db: Db,
  actor: ActorContext,
  projectId: string,
): Promise<ProjectTag[] | null> {
  if (!uuidSchema.safeParse(projectId).success) {
    return null;
  }
  const project = await getProjectForActor(db, actor, projectId);
  if (project === null) {
    return null;
  }
  const rows = await db.select().from(labTags).where(eq(labTags.projectId, projectId));
  return rows.map((t) => ({ id: t.id, name: t.name, color: t.color }));
}

export async function createTagForActor(
  db: Db,
  actor: ActorContext,
  projectId: string,
  input: { name: string; color?: string | null },
): Promise<ProjectTag | null> {
  if (!uuidSchema.safeParse(projectId).success) {
    return null;
  }
  const project = await getProjectForActor(db, actor, projectId);
  if (project === null) {
    return null;
  }
  await db
    .insert(labTags)
    .values({ projectId, name: input.name, color: input.color ?? null })
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(labTags)
    .where(and(eq(labTags.projectId, projectId), eq(labTags.name, input.name)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return { id: row.id, name: row.name, color: row.color };
}

export async function attachTagForActor(
  db: Db,
  actor: ActorContext,
  groupId: string,
  tagId: string,
): Promise<DedupGroupDTO | null> {
  if (!uuidSchema.safeParse(tagId).success) {
    return null;
  }
  const group = await scopedGroup(db, actor, groupId);
  if (group === null) {
    return null;
  }
  const tagRows = await db
    .select({ tag: labTags })
    .from(labTags)
    .innerJoin(projects, eq(labTags.projectId, projects.id))
    .where(
      and(
        eq(labTags.id, tagId),
        eq(labTags.projectId, group.projectId),
        eq(projects.ownerId, actor.userId),
      ),
    )
    .limit(1);
  if (tagRows[0] === undefined) {
    return null;
  }
  await db.insert(labGroupTags).values({ groupId, tagId }).onConflictDoNothing();
  const bundles = await loadGroupBundles(db, group.projectId, [groupId]);
  const bundle = bundles[0];
  if (bundle === undefined) {
    return null;
  }
  return toGroupDTO(bundle);
}

export async function detachTagForActor(
  db: Db,
  actor: ActorContext,
  groupId: string,
  tagId: string,
): Promise<boolean> {
  if (!uuidSchema.safeParse(tagId).success) {
    return false;
  }
  const group = await scopedGroup(db, actor, groupId);
  if (group === null) {
    return false;
  }
  await db
    .delete(labGroupTags)
    .where(and(eq(labGroupTags.groupId, groupId), eq(labGroupTags.tagId, tagId)));
  return true;
}

export async function setGroupDecisionForActor(
  db: Db,
  actor: ActorContext,
  groupId: string,
  input: { decision: 'eligible' | 'ineligible' | 'undecided'; reason?: string },
): Promise<DedupGroupDTO | null> {
  const group = await scopedGroup(db, actor, groupId);
  if (group === null) {
    return null;
  }
  const reason = input.reason === undefined ? null : input.reason.trim();
  await db
    .insert(labGroupDecisions)
    .values({ groupId, decision: input.decision, reason })
    .onConflictDoUpdate({
      target: labGroupDecisions.groupId,
      set: { decision: input.decision, reason },
    });
  const bundles = await loadGroupBundles(db, group.projectId, [groupId]);
  const bundle = bundles[0];
  if (bundle === undefined) {
    return null;
  }
  return toGroupDTO(bundle);
}

export async function setDivergenceForActor(
  db: Db,
  actor: ActorContext,
  groupId: string,
  input: { source: 'bdtd' | 'capes'; note: string },
): Promise<DedupGroupDTO | null> {
  const group = await scopedGroup(db, actor, groupId);
  if (group === null) {
    return null;
  }
  const clean = input.note.replace(/<[^>]*>/g, '').trim();
  await db
    .insert(labDivergences)
    .values({ groupId, source: input.source, note: clean })
    .onConflictDoUpdate({
      target: [labDivergences.groupId, labDivergences.source],
      set: { note: clean },
    });
  const bundles = await loadGroupBundles(db, group.projectId, [groupId]);
  const bundle = bundles[0];
  if (bundle === undefined) {
    return null;
  }
  return toGroupDTO(bundle);
}

// Predicado UNICO de elegibilidade (Pitfall 5): corpus + export-scope-corpus
// usam esta funcao — nunca WHEREs divergentes.
export function isCorpusEligible(g: { status: string; decision: string }): boolean {
  return g.status === 'confirmed' && g.decision === 'eligible';
}

function parseDocType(value: unknown): 'masterThesis' | 'doctoralThesis' | null {
  if (value === 'masterThesis' || value === 'doctoralThesis') {
    return value;
  }
  return null;
}

export interface CorpusListOptions {
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface CorpusListResult {
  items: CorpusEntryDTO[];
  page: PageInfo;
}

export function toCorpusEntryDTO(
  bundle: GroupBundle,
  tagNames: string[],
): CorpusEntryDTO | null {
  const canonicalId = resolveCanonicalResult(bundle.members, bundle.pin);
  const canonical = bundle.memberRows.find((r) => r.id === canonicalId);
  if (canonical === undefined) {
    return null;
  }
  const origins = [...new Set(bundle.members.map((m) => m.source).filter(isExecutableSource))].sort();
  return {
    groupId: bundle.group.id,
    canonicalKey: bundle.group.canonicalKey,
    title: canonical.title,
    authors: parseAuthors(canonical.authors),
    year: parseNullableYear(canonical.year),
    docType: parseDocType(canonical.docType),
    institution: parseNullableString(canonical.institution),
    program: parseNullableString(canonical.program),
    abstract: parseNullableString(canonical.abstract),
    originUrl: parseNullableString(canonical.originUrl),
    sourceUrl: parseNullableString(canonical.sourceUrl),
    decision: bundle.decision,
    tags: tagNames,
    originCount: origins.length,
    origins,
    memberIds: bundle.memberIds,
  };
}

export async function getCorpusForActor(
  db: Db,
  actor: ActorContext,
  projectId: string,
  opts: CorpusListOptions,
): Promise<CorpusListResult> {
  const limit = clampLimit(opts.limit);
  const empty: CorpusListResult = { items: [], page: { limit, nextCursor: null, hasMore: false } };
  if (!uuidSchema.safeParse(projectId).success) {
    return empty;
  }
  const project = await getProjectForActor(db, actor, projectId);
  if (project === null) {
    return empty;
  }
  const bundles = await loadGroupBundles(db, projectId);
  const eligible = bundles.filter((b) =>
    isCorpusEligible({ status: b.group.status, decision: b.decision }),
  );
  const groupIds = eligible.map((b) => b.group.id);
  const tagLinks =
    groupIds.length === 0
      ? []
      : await db.select().from(labGroupTags).where(inArray(labGroupTags.groupId, groupIds));
  const tagIds = [...new Set(tagLinks.map((l) => l.tagId))];
  const tagRows =
    tagIds.length === 0
      ? []
      : await db.select().from(labTags).where(inArray(labTags.id, tagIds));
  const tagNameById = new Map(tagRows.map((t) => [t.id, t.name] as const));
  const entries: Array<{ entry: CorpusEntryDTO; createdAt: Date; id: string }> = [];
  for (const b of eligible) {
    const names = tagLinks
      .filter((l) => l.groupId === b.group.id)
      .map((l) => tagNameById.get(l.tagId))
      .filter((n): n is string => typeof n === 'string')
      .sort();
    const entry = toCorpusEntryDTO(b, names);
    if (entry !== null) {
      entries.push({ entry, createdAt: b.group.createdAt, id: b.group.id });
    }
  }
  entries.sort((a, b2) =>
    a.createdAt.getTime() !== b2.createdAt.getTime()
      ? b2.createdAt.getTime() - a.createdAt.getTime()
      : b2.id.localeCompare(a.id),
  );
  let start = 0;
  if (opts.cursor !== undefined && opts.cursor.length > 0) {
    const decoded = decodeCursor(opts.cursor);
    if (decoded !== null && uuidSchema.safeParse(decoded.id).success) {
      const cursorDate = new Date(decoded.createdAt);
      if (!Number.isNaN(cursorDate.getTime())) {
        const idx = entries.findIndex(
          (e) =>
            e.createdAt.getTime() < cursorDate.getTime() ||
            (e.createdAt.getTime() === cursorDate.getTime() && e.id < decoded.id),
        );
        start = idx < 0 ? entries.length : idx;
      }
    }
  }
  const slice = entries.slice(start, start + limit + 1);
  const hasMore = slice.length > limit;
  const pageRows = hasMore ? slice.slice(0, limit) : slice;
  const last = pageRows[pageRows.length - 1];
  return {
    items: pageRows.map((r) => r.entry),
    page: {
      limit,
      nextCursor:
        hasMore && last !== undefined ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
      hasMore,
    },
  };
}

// ---------------------------------------------------------------------------
// Comparacao 4 blocos sobre runs fixos (LAB-10, D-47..D-49):
// compareSearchesForActor + toCompareDTO.
// ---------------------------------------------------------------------------

export const COMPARE_MAX_WITH = 10;

export function toCompareDTO(
  searches: string[],
  totals: Record<string, number>,
  yearHistogram: Record<string, number>,
  bySource: Record<string, Record<'bdtd' | 'capes', number>>,
  pairwiseOverlap: Record<string, number>,
): CompareDTO {
  return { searches, totals, yearHistogram, bySource, pairwiseOverlap };
}

export async function compareSearchesForActor(
  db: Db,
  actor: ActorContext,
  baseSearchId: string,
  withSearchIds: string[],
): Promise<CompareDTO | null> {
  if (!uuidSchema.safeParse(baseSearchId).success) {
    return null;
  }
  const deduped = [...new Set(withSearchIds)].filter((id) => id !== baseSearchId);
  if (deduped.length < 1 || deduped.length > COMPARE_MAX_WITH) {
    return null;
  }
  for (const id of deduped) {
    if (!uuidSchema.safeParse(id).success) {
      return null;
    }
  }
  // Escopo ANTES de agregar (anti-enumeracao): busca alheia → null → 404.
  const searches = [baseSearchId, ...deduped];
  const projectIds: string[] = [];
  for (const id of searches) {
    const search = await getSearchForActor(db, actor, id);
    if (search === null) {
      return null;
    }
    projectIds.push(search.projectId);
  }
  // Ultimo run CONCLUIDO fixo (D-48): succeeded|partial latest executedAt.
  // failed/sem run contribui zeros (nunca queued/running/cancelled).
  const runBySearch = new Map<string, string | null>();
  for (const id of searches) {
    const runs = await db
      .select()
      .from(labSearchRuns)
      .where(
        and(
          eq(labSearchRuns.searchId, id),
          inArray(labSearchRuns.status, ['succeeded', 'partial']),
        ),
      )
      .orderBy(desc(labSearchRuns.executedAt), desc(labSearchRuns.id))
      .limit(1);
    const run = runs[0];
    runBySearch.set(id, run === undefined ? null : run.id);
  }
  const runIds = [...runBySearch.values()].filter((v): v is string => v !== null);
  const results =
    runIds.length === 0
      ? []
      : await db.select().from(labResults).where(inArray(labResults.runId, runIds));
  const runByResult = new Map<string, string>();
  const searchByRun = new Map<string, string>();
  for (const [searchId, runId] of runBySearch) {
    if (runId !== null) {
      searchByRun.set(runId, searchId);
    }
  }
  for (const r of results) {
    const searchId = searchByRun.get(r.runId);
    if (searchId !== undefined) {
      runByResult.set(r.id, searchId);
    }
  }
  const keysBySearch = new Map<string, Set<string>>();
  const totals: Record<string, number> = {};
  const yearHistogram: Record<string, number> = {};
  const bySource: Record<string, Record<'bdtd' | 'capes', number>> = {};
  for (const id of searches) {
    keysBySearch.set(id, new Set());
    totals[id] = 0;
    bySource[id] = { bdtd: 0, capes: 0 };
  }
  for (const r of results) {
    const searchId = searchByRun.get(r.runId);
    if (searchId === undefined) {
      continue;
    }
    totals[searchId] = (totals[searchId] ?? 0) + 1;
    const keys = keysBySearch.get(searchId);
    if (keys !== undefined) {
      keys.add(resultKey(r));
    }
    const year = parseNullableYear(r.year);
    const bucket = year === null ? 'desconhecido' : String(year);
    yearHistogram[bucket] = (yearHistogram[bucket] ?? 0) + 1;
    if (isExecutableSource(r.source)) {
      const slot = bySource[searchId];
      if (slot !== undefined) {
        slot[r.source] += 1;
      }
    }
  }
  // Overlap dedup-aware (D-47): chaves exatas compartilhadas + grupos fuzzy
  // confirmados com membros nos dois runs.
  const memberGroup = new Map<string, string>();
  const confirmedGroups = new Set<string>();
  const canonicalByGroup = new Map<string, string>();
  if (results.length > 0) {
    const resultIds = results.map((r) => r.id);
    const members = await db
      .select()
      .from(labDedupMembers)
      .where(inArray(labDedupMembers.resultId, resultIds));
    const groupIds = [...new Set(members.map((m) => m.groupId))];
    if (groupIds.length > 0) {
      const uniqueProjects = [...new Set(projectIds)];
      const groups = await db
        .select()
        .from(labDedupGroups)
        .where(
          and(
            inArray(labDedupGroups.id, groupIds),
            inArray(labDedupGroups.projectId, uniqueProjects),
          ),
        );
      for (const g of groups) {
        if (g.status === 'confirmed') {
          confirmedGroups.add(g.id);
          canonicalByGroup.set(g.id, g.canonicalKey);
        }
      }
      for (const m of members) {
        if (confirmedGroups.has(m.groupId)) {
          memberGroup.set(m.resultId, m.groupId);
        }
      }
    }
  }
  const pairwiseOverlap: Record<string, number> = {};
  for (let i = 0; i < searches.length; i++) {
    for (let j = i + 1; j < searches.length; j++) {
      const a = searches[i];
      const b = searches[j];
      if (a === undefined || b === undefined) {
        continue;
      }
      const keysA = keysBySearch.get(a) ?? new Set<string>();
      const keysB = keysBySearch.get(b) ?? new Set<string>();
      let overlap = 0;
      for (const k of keysA) {
        if (keysB.has(k)) {
          overlap += 1;
        }
      }
      // Extra fuzzy: grupo confirmado com membros nos dois runs cuja chave
      // canonica NAO esta na intersecao exata (evita dupla contagem; grupos
      // exact spanning runs sempre tem a chave na intersecao).
      const groupsInA = new Set<string>();
      const groupsInB = new Set<string>();
      for (const r of results) {
        const owner = searchByRun.get(r.runId);
        const g = memberGroup.get(r.id);
        if (g === undefined) {
          continue;
        }
        if (owner === a) {
          groupsInA.add(g);
        } else if (owner === b) {
          groupsInB.add(g);
        }
      }
      for (const g of groupsInA) {
        if (!groupsInB.has(g)) {
          continue;
        }
        const canon = canonicalByGroup.get(g);
        if (canon !== undefined && !keysA.has(canon)) {
          overlap += 1;
        } else if (canon !== undefined && !keysB.has(canon)) {
          overlap += 1;
        }
      }
      pairwiseOverlap[`${a}|${b}`] = overlap;
    }
  }
  return toCompareDTO(searches, totals, yearHistogram, bySource, pairwiseOverlap);
}
