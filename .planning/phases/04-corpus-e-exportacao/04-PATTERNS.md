# Phase 4: Corpus e exportação - Pattern Map

**Mapped:** 2026-09-11
**Files analyzed:** 11
**Analogs found:** 9 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/core-api/src/lib/dedup.ts` (NEW) | utility (pure functions) | transform + batch | `apps/core-api/src/lib/searchRuns.ts` (sha256hex + canonicalBody) | role-match |
| `apps/core-api/src/lib/corpus.ts` (NEW) | service (lib `*ForActor`) | CRUD + batch | `apps/core-api/src/lib/searches.ts` | exact |
| `apps/core-api/src/lib/exports.ts` (NEW) | utility (pure serializers) | transform + file-I/O | `packages/contracts/src/pagination.ts` + `packages/contracts/src/lab.ts` cursor helpers | partial |
| `packages/contracts/src/lab.ts` (MODIFY) | contract/config (types + Zod) | request-response (schemas) | itself — existing schemas/DTOs | exact |
| `packages/db/src/schema.ts` + `packages/db/drizzle/0003_*.sql` (MODIFY/CREATE) | model (schema + migration) | CRUD (DDL) | itself + `packages/db/drizzle/0002_fancy_hiroim.sql` | exact |
| `apps/core-api/src/routes/lab.ts` (MODIFY) | route (controller) | request-response | itself — existing lab routes | exact |
| `apps/core-api/src/plugins/rateLimit.ts` (MODIFY) | middleware/config | request-response | itself — `labRunsRateLimit` bucket | exact |
| `tests/integration/lab-corpus.test.ts` (NEW) | test (integration PG) | request-response + CRUD | `tests/integration/lab-search-runs.test.ts` | exact |
| `tests/integration/fixtures/dedup-overlap.json` (NEW) | test (fixture data) | batch (seed data) | `tests/integration/fixtures/bdtd-search.json` + `capes-busca.json` | exact |
| `tests/unit/dedup-exports.test.ts` (NEW) | test (unit, pure) | transform | `tests/smoke/boot.test.ts` (harness + type-guard + no-secrets) | role-match |
| `scripts/curl-corpus.sh` (NEW) | config/script (proof) | request-response (curl) | `scripts/curl-lab.sh` | exact |

Conditional / shared (no separate plan needed unless planner decides):
- `packages/contracts/src/errors.ts` (MODIFY only if new ErrorCode needed) — analog itself.
- `apps/core-api/package.json` (MODIFY: add `fastest-levenshtein`) — install via `pnpm --filter @uhhu/core-api add fastest-levenshtein` (RESEARCH §Standard Stack).

## Pattern Assignments

### `apps/core-api/src/lib/dedup.ts` (utility, transform + batch)

**Analog:** `apps/core-api/src/lib/searchRuns.ts`

**Imports pattern** (lines 35-64):
```typescript
import { createHash } from 'node:crypto';
import { and, eq, gt, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import type {
  ExecutableSource,
  PerSourceMetrics,
  RunErrorInfo,
  RunMetrics,
  SearchFilters,
  SearchRunDTO,
} from '@uhhu/contracts';
import type { ActorContext } from '@uhhu/core';
import {
  labIdempotencyKeys,
  labResults,
  labSearches,
  labSearchRuns,
  projects,
  type Db,
} from '@uhhu/db';
```
Copy: `node:crypto` first, then `drizzle-orm`, `zod`, `type` imports from `@uhhu/contracts`, `ActorContext` from `@uhhu/core`, tables + `type Db` from `@uhhu/db`. New dep import follows same block: `import { distance } from 'fastest-levenshtein';` (only new runtime dep in this phase).

**Hash helper pattern** (lines 132-134):
```typescript
function sha256hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
```
Copy verbatim for `canonicalKey` hashing. Never `Math.random` (AGENTS.md ban); IDs come from PG `defaultRandom()`.

**Canonical-body pattern** (lines 141-170):
```typescript
function canonicalBody(
  searchId: string,
  term: string,
  filters: SearchFilters,
  sources: ExecutableSource[],
): string {
  const orderedFilters: Record<string, unknown> = {};
  if (filters.yearFrom !== undefined) {
    orderedFilters['yearFrom'] = filters.yearFrom;
  }
  // ... fixed key order — object insertion order from DB is not trusted for hashing
  return JSON.stringify({ searchId, term, filters: orderedFilters, sources: [...sources] });
}
```
Copy: fixed key order + explicit `undefined` guards + `JSON.stringify` before `sha256hex`. This is the direct mold for `canonicalKey(title, year, authors)` — ordered parts joined by `|`, then hashed.

**Constants pattern** (lines 73-92):
```typescript
export const MAX_SYNC_MS = 25000;
export const RUN_QUEUE_TIMEOUT_MS = 60000;
const RUN_RATE_LIMIT = 10;
const RUN_RATE_WINDOW_MS = 3_600_000;
const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;
const RUN_PER_PAGE = 20;
const EXECUTION_ORDER: readonly ExecutableSource[] = ['bdtd', 'capes'];
```
Copy: exported tuning constants with doc comment citing the decision (e.g. `/** Fuzzy threshold D-40: normalized similarity ≥ 0.9. */ export const FUZZY_THRESHOLD = 0.9;`). Keep `readonly` for frozen lists.

**Typed-error pattern** (lines 97-117):
```typescript
export class RunRateLimitedError extends Error {
  readonly code = 'RATE_LIMITED' as const;
  readonly statusCode = 429;
  constructor() {
    super('Limite de 10 execuções por hora atingido. Tente novamente mais tarde.');
    this.name = 'RunRateLimitedError';
  }
}
```
Copy only if dedup/corpus needs a typed domain error the route translates to an envelope (same shape: `code` + `statusCode` + PT-BR message, `this.name`). Otherwise return `null` for out-of-scope (see Shared Patterns).

---

### `apps/core-api/src/lib/corpus.ts` (service, CRUD + batch)

**Analog:** `apps/core-api/src/lib/searches.ts`

**Imports pattern** (lines 15-45):
```typescript
import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  decodeCursor,
  decodeResultsCursor,
  encodeCursor,
  encodeResultsCursor,
  type CreateSearchInput,
  // ... DTO types only, via `type` imports
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
```
Copy: same import order; new tables (`labDedupGroups`, etc.) join the `@uhhu/db` block; DTO types join the `@uhhu/contracts` type block; reuse `getProjectForActor` / `getSearchForActor` / `getRunForActor` — never reimplement scope checks. Note `.js` suffix on relative imports.

**Limit clamp pattern** (lines 52-57):
```typescript
function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isSafeInteger(raw)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, raw));
}
// with DEFAULT_LIMIT = 20, MAX_LIMIT = 100
```
Copy verbatim into `corpus.ts` (do not import a private function across libs).

**Owner-first read pattern** (lines 328-347):
```typescript
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
```
Copy for every group/decision/tag/divergence/pin read: `uuidSchema` guard → `innerJoin(projects, eq(<table>.projectId, projects.id))` → `and(eq(<table>.id, id), eq(projects.ownerId, actor.userId))` → `limit(1)` → `undefined` → `null`. Route turns `null` into identical 404. Deep chains follow the run/result mold — JOIN through the chain (lines 473-479, 584-590):
```typescript
const rows = await db
  .select({ run: labSearchRuns })
  .from(labSearchRuns)
  .innerJoin(labSearches, eq(labSearchRuns.searchId, labSearches.id))
  .innerJoin(projects, eq(labSearches.projectId, projects.id))
  .where(and(eq(labSearchRuns.id, runId), eq(projects.ownerId, actor.userId)))
  .limit(1);
```

**List + cursor pattern** (lines 555-612, results variant):
```typescript
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
  // ... decode cursor tolerantly (malformed → no filter, never throw)
  const rows = await db
    .select({ result: labResults })
    // ... JOINs →Project, where + cursorFilter, stable orderBy, limit(limit + 1)
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  // ... encode nextCursor from last row
}
```
Copy: scope-check-then-list (out-of-scope → empty page, route turns into 404 where it pre-checked the parent); `limit + 1` probe → `hasMore` → `slice(0, limit)`; tolerant cursor decode (never throws). Corpus list reuses the `source|rank|id` mold or plain `createdAt|id` — see Shared Patterns.

**DTO mapping pattern** (lines 212-301):
```typescript
function parseAuthors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as unknown[]).filter((entry): entry is string => typeof entry === 'string');
}
function parseNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
export function toResultDTO(row: LabResult): ResultDTO {
  const source = isExecutableSource(row.source) ? row.source : 'bdtd';
  return {
    id: row.id,
    runId: row.runId,
    // ... snake→camel, unknown→narrowed via parse* helpers
    rawMetadata: parseRawMetadata(row.rawMetadata),
    retrievedAt: row.retrievedAt.toISOString(),
  };
}
```
Copy: `toGroupDTO` / `toCorpusEntryDTO` / `toCompareDTO` as exported pure mappers with `parse*` narrowers for every `jsonb` column and `isExecutableSource`-style allowlist guards for enums; dates via `.toISOString()`. `unknown` + narrowing — never `any` (AGENTS.md ban).

**Error handling pattern:** lib returns `null` for out-of-scope/invalid-UUID; throws `Error('... insert did not return row')` only on impossible insert (lines 321-324). No HTTP codes, no envelopes in lib — all status mapping lives in the route.

---

### `apps/core-api/src/lib/exports.ts` (utility, transform + file-I/O)

**Analog:** `packages/contracts/src/pagination.ts` (lines 22-49) + `packages/contracts/src/lab.ts` (lines 249-289)

**Pure-helper pattern** (`pagination.ts` lines 22-49):
```typescript
// Codifica o cursor como base64url de `${createdAt}|${id}`.
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}
// Decodifica o cursor. Retorna null em cursor malformado — nunca lanca.
export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    if (cursor.length === 0 || cursor.length > 512) {
      return null;
    }
    // ... split, validate parts, Number.parseInt with isSafeInteger guard
    return { createdAt, id };
  } catch {
    return null;
  }
}
```
Copy conventions: exported pure functions, Portuguese doc comment, `try/catch → null`, length guards, `Buffer` with explicit `'utf8'`, no I/O, no DB, no `any`. This is the mold for `csvCell`, `escapeBibtex`, `exportFilename`, `bibtexKey`, `toCSV`, `toBibTeX`, `toJSON` — all pure over `CorpusEntryDTO[]`, unit-testable without PG.

**Cursor-with-payload pattern** (`contracts/lab.ts` lines 249-289):
```typescript
export function encodeResultsCursor(source: string, rank: number, id: string): string {
  return Buffer.from(`${source}|${rank}|${id}`, 'utf8').toString('base64url');
}
export function decodeResultsCursor(cursor: string): DecodedResultsCursor | null {
  try {
    // ... 3-part split, empty checks, Number.parseInt + isSafeInteger + >= 0
    return { source, rank, id };
  } catch {
    return null;
  }
}
```
Copy the multi-part join/split discipline for deterministic BibTeX keys (`slug(author)+year+source` + `-a`/`-b` collision suffix per D-51) and CSV row layout (one line per group, D-53). Full serializer specs (RFC 4180 quoter + injection guard, BibTeX escape map, ASCII slug) come from RESEARCH.md `## Code Examples` — there is **no existing CSV/BibTeX serializer in the codebase** (see `## No Analog Found`).

**What NOT to copy:** `exports.ts` must not touch `db`, `actor`, or HTTP. Route resolves scope + auth + headers; this lib only formats strings. Filename slugging must be ASCII-only so the route can use plain `filename="..."` without `filename*` (RESEARCH Pitfall 2).

---

### `packages/contracts/src/lab.ts` (contract, request-response schemas)

**Analog:** itself (`packages/contracts/src/lab.ts`)

**File header pattern** (lines 1-20):
```typescript
// packages/contracts — schemas e DTOs do Lab: buscas/runs/results/sources/health (D-28..D-39).
// UNICA definicao de tipos de busca: nenhum outro pacote duplica estes tipos.
// JSON publico em camelCase; banco em snake_case (mapeado no Drizzle).
```
Copy: extend the header's decision list with D-40..D-53; all new DTOs/schemas live here — single definition, `import type` elsewhere.

**Field schema pattern** (lines 27-34):
```typescript
export const searchTermSchema = z
  .string()
  .trim()
  .min(1, 'Termo de busca é obrigatório.')
  .max(500, 'Termo deve ter no máximo 500 caracteres.')
  .refine((value) => (value.match(/"/g) ?? []).length % 2 === 0, {
    message: 'Termo com aspas desbalanceadas.',
  });
```
Copy for every new string field (decision reason, tag name ≤ 100, divergence note with max-length + no-markup per baseline §2.5): `.trim()`, PT-BR messages, `.refine` for cross-field rules.

**Filters object pattern** (lines 46-66):
```typescript
export const searchFiltersSchema = z
  .object({
    yearFrom: z.number().int().min(1800).max(2100).optional(),
    // ... bounded arrays (.max(2)), enums, trimmed strings with .max()
  })
  .refine(
    (filters) =>
      filters.yearFrom === undefined ||
      filters.yearTo === undefined ||
      filters.yearFrom <= filters.yearTo,
    { message: 'Ano inicial deve ser menor ou igual ao ano final.', path: ['yearTo'] },
  );
```
Copy for `decisionSchema` (enum `eligible|ineligible|undecided` + reason), `tagSchema`, `divergenceSchema`, `pinSchema`, compare/export query schemas (`with` = UUID list ≤ N, `selection` = UUID list ≤ N, `format` enum, `scope` enum).

**Create/update input pattern** (lines 89-104):
```typescript
export const createSearchSchema = z.object({
  projectId: z.string().uuid(),
  term: searchTermSchema,
  filters: searchFiltersSchema.default({}),
  sources: z.array(executableSourceSchema).min(1).max(2).default(['bdtd', 'capes']),
});
export type CreateSearchInput = z.infer<typeof createSearchSchema>;
```
Copy: `z.object` + `z.infer` type export per schema; arrays always bounded (`.min(1).max(N)`).

**DTO interface pattern** (lines 125-192):
```typescript
export interface SearchDTO {
  id: string;
  projectId: string;
  // ... camelCase, ISO strings for dates
  createdAt: string;
  updatedAt: string;
}
```
Copy for `DedupGroupDTO`, `CorpusEntryDTO`, `CompareDTO` (exactly the 4 locked blocks per D-49 — no item lists), export query types. Dates as ISO `string`, never `Date`, in JSON.

**Query schema pattern** (lines 237-242):
```typescript
export const resultsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional(),
});
```
Copy for corpus/compare/export query schemas (`z.coerce.number()` for query-string limits + `withClampedLimit` in route).

---

### `packages/db/src/schema.ts` + migration 0003 (model, DDL)

**Analog:** itself + `packages/db/drizzle/0002_fancy_hiroim.sql`

**Table definition pattern** (`schema.ts` lines 125-140):
```typescript
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
```
Copy per new table (`lab_dedup_groups`, `lab_dedup_members`, `lab_group_decisions`, `lab_divergences`, `lab_tags`, `lab_group_tags`, `lab_rejected_pairs`, `lab_canonical_pins` per RESEARCH Wave 0): `// prettier-ignore` header, `uuid(...).primaryKey().defaultRandom()`, `snake_case` columns, `references(..., { onDelete: 'cascade' })` toward the owning table, `index(...)` on `(projectId, ...)` access paths, `check(...)` mirroring every Zod enum/length (convention T-02-01-03/T-03-01-01), plus `export type X = typeof x.$inferSelect` / `NewX` pair. Key constraints from RESEARCH: `UNIQUE(project, canonicalKey)`, `UNIQUE(group, source)` on divergences, `UNIQUE(project, name)` on tags.

**Provenance-table pattern** (`schema.ts` lines 178-205):
```typescript
export const labResults = pgTable('lab_results', {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id').notNull().references(() => labSearchRuns.id, { onDelete: 'cascade' }),
    // ...
    rank: integer('rank').notNull(),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('lab_results_run_source_sid_unique').on(t.runId, t.source, t.sourceId),
    index('lab_results_run_source_rank_idx').on(t.runId, t.source, t.rank),
    check('lab_results_source_check', sql`${t.source} IN ('bdtd','capes')`),
  ],
);
```
Copy `unique(...).on(...)` for dedup identity keys and `index` for corpus/compare read paths. Identity rule (Pattern 1): review entities keyed by `(projectId, canonicalKey)` — `lab_results.id` appears only in member tables, never as the decision/pin/divergence address (RESEARCH Pitfall 4).

**Migration SQL pattern** (`0002_fancy_hiroim.sql` lines 10-29, 70-81):
```sql
CREATE TABLE "lab_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	...
	CONSTRAINT "lab_results_run_source_sid_unique" UNIQUE("run_id","source","source_id"),
	CONSTRAINT "lab_results_source_check" CHECK ("lab_results"."source" IN ('bdtd','capes'))
);
--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_run_id_lab_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."lab_search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_results_run_source_rank_idx" ON "lab_results" USING btree ("run_id","source","rank");--> statement-breakpoint
```
Copy: `drizzle-kit generate` output style — `gen_random_uuid()` defaults, `CONSTRAINT ... UNIQUE/CHECK` inline, `--> statement-breakpoint` separators, FKs via `ALTER TABLE ... ADD CONSTRAINT` with `ON DELETE cascade`, `CREATE INDEX ... USING btree`. New file `0003_*.sql` generated by `drizzle-kit generate`, never hand-written DDL drift.

---

### `apps/core-api/src/routes/lab.ts` (route, request-response)

**Analog:** itself (`apps/core-api/src/routes/lab.ts`)

**Imports pattern** (lines 22-57):
```typescript
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  buildEnvelope,
  createSearchSchema,
  // ... schemas + DTO types from @uhhu/contracts
} from '@uhhu/contracts';
import type { Db } from '@uhhu/db';
import { computeSourceHealth, listSources } from '@uhhu/integrations';
import { requireAuth } from '../auth/requireAuth.js';
import { getProjectForActor } from '../lib/projects.js';
import { createSearchForActor, /* ... */ } from '../lib/searches.js';
```
Copy: same order; add `corpus.ts`/`exports.ts` lib imports + new contract schemas to the `@uhhu/contracts` block. Relative imports keep `.js` suffix.

**Request-id + limit-clamp preamble** (lines 59-94):
```typescript
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:~-]{1,128}$/;
function resolveRequestId(request: FastifyRequest): string {
  const holder: unknown = (request as unknown as { requestId?: unknown }).requestId;
  if (typeof holder === 'string' && REQUEST_ID_PATTERN.test(holder.trim())) {
    return holder.trim();
  }
  const header: unknown = request.headers['x-request-id'];
  if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header.trim())) {
    return header.trim();
  }
  return randomUUID();
}
function withClampedLimit(query: unknown): unknown {
  // ... numeric finite → clamp 1..100, non-numeric passes through to Zod 400
}
```
Copy: do NOT extract to shared helper — every route file duplicates this 30-line preamble verbatim (projects.ts mold, lab.ts lines 59-94). Every handler starts with `const requestId = resolveRequestId(request); reply.header('x-request-id', requestId);`.

**Handler mold — write path** (lines 199-224):
```typescript
app.post(
  '/api/v1/lab/searches',
  { preHandler: requireAuth(db) },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = resolveRequestId(request);
    reply.header('x-request-id', requestId);
    const actor = request.actor;
    if (actor === undefined) {
      await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
      return;
    }
    const parsed = createSearchSchema.safeParse(request.body);
    if (!parsed.success) {
      await reply
        .code(400)
        .send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
      return;
    }
    const dto = await createSearchForActor(db, actor, parsed.data);
    if (dto === null) {
      await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
      return;
    }
    await reply.code(201).send(dto);
  },
);
```
Copy for every mutating corpus route (confirm/reject group, decision, tags, divergence, pin): `requireAuth(db)` → request-id → `actor === undefined` → 401 → `schema.safeParse(body)` → 400 → lib `*ForActor` → `null` → 404 → success code (201 create / 200 update). Never a message inline — always `buildEnvelope`.

**Handler mold — scoped list path** (lines 226-255):
```typescript
const parsed = listSearchesQuerySchema.safeParse(withClampedLimit(request.query));
// ... 400 on !parsed.success
const project = await getProjectForActor(db, actor, parsed.data.projectId);
if (project === null) {
  await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
  return;
}
const result = await listSearchesForActor(db, actor, parsed.data.projectId, {
  limit: parsed.data.limit,
  cursor: parsed.data.cursor,
});
await reply.code(200).send({ items: result.items, page: result.page });
```
Copy for `GET corpus` / `GET compare` (with `with` = bounded UUID list): pre-check parent scope → 404 before aggregating (prevents cross-user enumeration via overlap).

**Params-UUID → 404 pattern** (lines 123-137, 268-272):
```typescript
const searchIdParamsSchema = z.object({
  searchId: z.string().uuid(),
});
// ...
const parsed = searchIdParamsSchema.safeParse(request.params);
if (!parsed.success) {
  await reply.code(404).send(buildEnvelope('NOT_FOUND', requestId, {}));
  return;
}
```
Copy: malformed UUID in params → 404 `NOT_FOUND` (not 400). Malformed body/query → 400 `VALIDATION_ERROR`. This distinction is load-bearing for the IDOR matrix.

**Export delivery** (no analog — see `## No Analog Found`): route sets `reply.header('Content-Disposition', \`attachment; filename="${name}"\`)` + `reply.type(...)` with ASCII-only `name` from `exportFilename` (RESEARCH Code Examples). Success DTOs are sent bare (`reply.send(dto)`); only errors use `buildEnvelope`.

---

### `apps/core-api/src/plugins/rateLimit.ts` (middleware, request-response)

**Analog:** itself (`apps/core-api/src/plugins/rateLimit.ts`)

**Bucket declaration** (lines 63-66):
```typescript
export const labRunsRateLimit = { max: 30, timeWindow: '1 minute' } as const;
```
Copy: add `export const labExportRateLimit = { max: ..., timeWindow: '1 minute' } as const;` (PLAT-05 requires rate limit on export; RESEARCH §Don't Hand-Roll). Document the two-layer distinction in the file header comment (lines 23-28): hook = bursts per IP, DB count = contractual per-user limit.

**Bucket routing** (lines 72-93):
```typescript
function bucketFor(method: string, url: string): AuthBucket | null {
  if (method !== 'POST') {
    return null;
  }
  const path = url.split('?')[0] ?? url;
  // ...
  if (path.startsWith('/api/v1/lab/searches/') && path.endsWith('/runs')) {
    return 'lab-runs';
  }
  return null;
}
```
Copy: extend `AuthBucket` union + `bucketFor` + `maxFor` (lines 95-109) with export/compare/decision paths. Hook body (lines 126-144) stays untouched — `Map<string, number[]>` sliding window, `request.ip` key, 429 with `buildEnvelope('RATE_LIMITED', requestId, {})` + `x-request-id` header.

---

### `tests/integration/lab-corpus.test.ts` (test, request-response + CRUD)

**Analog:** `tests/integration/lab-search-runs.test.ts`

**Harness imports** (lines 17-50):
```typescript
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '@uhhu/db';
import { invites, labIdempotencyKeys, labResults, /* ... */ projects, sessions, users } from '@uhhu/db';
import { COOKIE_NAME } from '../../apps/core-api/src/auth/session.js';
import { requestIdPlugin } from '../../apps/core-api/src/plugins/requestId.js';
import { errorHandler } from '../../apps/core-api/src/plugins/errorHandler.js';
import { buildAuthRoutes } from '../../apps/core-api/src/routes/auth.js';
import { buildProjectRoutes } from '../../apps/core-api/src/routes/projects.js';
import { buildLabRoutes } from '../../apps/core-api/src/routes/lab.js';
```
Copy verbatim + new lab tables in the `@uhhu/db` import. Keep `void execFileSync;` (line 425) so tree-shaking never drops the migrate import.

**Fixture load pattern** (lines 53-62):
```typescript
const BDTD_RAW = readFileSync(
  join(process.cwd(), 'tests/integration/fixtures/bdtd-search.json'),
  'utf8',
);
const BDTD_DATA: unknown = JSON.parse(BDTD_RAW);
```
Copy for `dedup-overlap.json` → `unknown` → narrowed in test (never `any`).

**Request helper pattern** (lines 302-327):
```typescript
async function apiRequest(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  options: { body?: Record<string, unknown>; cookieValue?: string; idempotencyKey?: string } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(options.cookieValue !== undefined ? { cookie: `${COOKIE_NAME}=${options.cookieValue}` } : {}),
    // ...
  };
  // GET/DELETE → inject without payload; others → payload: body
}
```
Copy verbatim; extend `options` only if a new header is needed (none planned).

**User/project/search builders** (lines 329-404): copy `bootstrapAdmin`, `createMember`, `createProject`, `createSearch` verbatim — 2-user harness (owner A, stranger B) is mandatory for the IDOR matrix.

**Hygiene assertions** (lines 408-421):
```typescript
function expectClean(res: ApiResponse): void {
  expect(headerValue(res, 'x-request-id')).toBeTruthy();
  const text = JSON.stringify(res.json()).toLowerCase();
  expect(text).not.toMatch(/stack|passwordhash|password_hash|token|secret|set-cookie|cookie/);
}
function expectIsolatedError(res: ApiResponse, expectedCode: string): void {
  expect(headerValue(res, 'x-request-id')).toBeTruthy();
  const body: unknown = res.json();
  expect(errorOf(body).code).toBe(expectedCode);
  // ... same negative regex
}
```
Copy verbatim. Extend the negative regex with export-specific secrets only if the JSON export adds fields (`set-cookie|token` check on export body per RESEARCH §Security Domain).

**Lifecycle pattern** (lines 427-500):
```typescript
describe.skipIf(APP_URL === undefined || MIGRATION_URL === undefined)(
  'lab search runs PG real (...)', () => {
    beforeAll(async () => {
      try {
        execFileSync('pnpm', ['--filter', '@uhhu/db', 'db:migrate'], { stdio: 'pipe', timeout: 60000 });
      } catch (err: unknown) {
        if (isConnectionFailure(errorText(err))) { pgAvailable = false; console.warn(...); return; }
        throw err;
      }
      // ... createDb(APP_URL), Fastify + cookie + requestIdPlugin + errorHandler + 3 route builders
    }, 60000);
    beforeEach(async () => {
      // ... delete in FK-safe order (children first), installFake('ok', 0)
    });
    afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });
```
Copy: `describe.skipIf` (graceful offline skip, never fail without PG), migrate-via-`execFileSync`, `beforeEach` wipe adding new tables first (`lab_group_tags`, `lab_dedup_members`, … before `lab_results`), `afterEach` fetch restore. Never print connection strings.

**IDOR matrix pattern** (lines 993-1102): copy the full owner/stranger/ghost/anonymous/injected-ownerId sequence for EVERY new ID-bearing route (group, corpus, compare, export): stranger → 404 `NOT_FOUND`, ghost UUID → 404, no cookie → 401 `UNAUTHENTICATED`, injected `ownerId` in body ignored (server-side actor wins).

---

### `tests/integration/fixtures/dedup-overlap.json` (test fixture, batch seed)

**Analog:** `tests/integration/fixtures/bdtd-search.json` + `capes-busca.json` (consumed at `lab-search-runs.test.ts` lines 53-62, 97-126)

**Consumption pattern** (lines 53-62 + 104-126):
```typescript
const BDTD_DATA: unknown = JSON.parse(BDTD_RAW);
// ...
async function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('bdtd.ibict.br')) { /* ... return jsonFetchResponse(BDTD_DATA, 200); */ }
  if (url.includes('catalogodeteses.capes.gov.br')) { /* ... return jsonFetchResponse(CAPES_DATA, 200); */ }
  throw new Error(`fakeFetch: host inesperado (sem rede real no teste): ${url.slice(0, 80)}`);
}
```
Fixture shape per RESEARCH Wave 0: BDTD+CAPES pairs covering exact-title matches, fuzzy matches (typo/punctuation, same year), same-author distinct works, and cross-year near-titles (must NOT fuzzy — Pitfall 3). Real-ish accented titles to anchor NFKD normalization + ≥0.9 threshold (Open Question 1). No secrets in fixtures; `rawMetadata` hygiene asserted by `expectClean`.

---

### `tests/unit/dedup-exports.test.ts` (test, transform)

**Analog:** `tests/smoke/boot.test.ts` (closest pure-harness analog; no unit dir exists yet)

**Test file pattern** (lines 7-34):
```typescript
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  // ... narrow, never `any`
  return /* ... */;
}
function expectNoSecrets(body: unknown): void {
  const text = JSON.stringify(body).toLowerCase();
  expect(text).not.toMatch(/password|database_url|secret|token/);
}
```
Copy: `vitest` `describe/it`, `unknown` + type-guard narrowing, `expectNoSecrets`-style negative assertions. New cases (RESEARCH §Validation Architecture): `normalizeTitle` (accents/punctuation), `canonicalKey` stability (field order, author sort), `titleSimilarity` boundary (≥0.9 fuzzy vs cross-year veto), `csvCell` adversarial (`=CMD(...)`, `-2+3`, `@sum`, quotes/newlines), `escapeBibtex` (`& % # _ $ ~ ^ { }`, ALL-CAPS brace protection, balanced braces), `exportFilename` adversarial (`"../../etc"`, accents, quotes). Check `vitest.config.ts`/`vitest.workspace.ts` for where a new `tests/unit/` project must be registered — planner must verify the runner picks the file up (RESEARCH suggests `pnpm vitest run --project smoke -- dedup` if unit lives under smoke).

---

### `scripts/curl-corpus.sh` (proof script, curl)

**Analog:** `scripts/curl-lab.sh`

**Preamble + assert pattern** (lines 12-46):
```bash
set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
JAR_A="/tmp/uhhu-lab-a.jar"
JAR_B="/tmp/uhhu-lab-b.jar"
GHOST="00000000-0000-4000-8000-000000000000"
TMPDIR_CURL="$(mktemp -d)"
cleanup() { rm -rf "$TMPDIR_CURL"; }
trap cleanup EXIT
assert_code() { # expected actual name — FAIL exits 1, PASS echoes
```
Copy verbatim (rename jars to `uhhu-corpus-*.jar` to avoid clobbering parallel runs).

**JSON field pattern** (lines 50-62): `jget` via `node -e` (no `jq` dependency) — copy verbatim.

**Flow pattern** (lines 66-142): `GET /health` with `x-request-id` grep → bootstrap invite → register/login A+B (409-tolerant) → project → search → run → `POST .../runs` accepting `201,202` via `assert_code_in` → poll `GET /jobs/:id` loop to terminal status → `GET run` mirror → `GET results`. Extend per RESEARCH: dedup pending → confirm/reject → decision → corpus reflects immediately → compare 4 blocks → export `csv|bib|json` with `Content-Disposition` grep → stranger 404s + ghost 404 + 401 without cookie → final `echo "ALL PASS ..."`.

**IDOR proof pattern** (lines 181-204):
```bash
CODE=$(curl -s -o /dev/stderr -w '%{http_code}' -b "$JAR_B" "$BASE_URL/api/v1/lab/searches/$SEARCH")
assert_code 404 "$CODE" "GET /lab/searches/:id estranho 404"
# ... run, result variants + ghost with JAR_A + 401 without jar
```
Copy for every new ID route; end with `ALL PASS` line naming the flow.

---

## Shared Patterns

### Authentication
**Source:** `apps/core-api/src/auth/requireAuth.ts` (lines 57-87) + `apps/core-api/src/routes/lab.ts` (lines 199-209)
**Apply to:** ALL new routes (corpus, groups confirm/reject, decision, tags, divergence, pin, compare, export)
```typescript
// requireAuth.ts lines 57-68: cookie → server-side session → actor; any failure → 401
export function requireAuth(db: Db) {
  return async function requireAuthHandler(request, reply): Promise<void> {
    const requestId = resolveRequestId(request);
    const rawToken = readSessionCookie(request);
    if (rawToken === null) {
      reply.header('x-request-id', requestId);
      await reply.code(401).send(buildEnvelope('UNAUTHENTICATED', requestId, {}));
      return;
    }
    // ... resolveSession(db, rawToken) → request.actor = { userId, role, requestId, authMethod: 'session' }
```
Route usage (lab.ts line 201): `{ preHandler: requireAuth(db) }` + `if (actor === undefined)` → 401 guard at the top of every handler. `ownerId` always from `request.actor` — never body/query. D-41 confirmation inherits this: project-owner check IS the JOIN scope, no extra role check.

### Error Handling
**Source:** `packages/contracts/src/errors.ts` (lines 7-68)
**Apply to:** ALL lib + route files
```typescript
export type ErrorCode = 'UNAUTHENTICATED' | 'NOT_FOUND' | 'VALIDATION_ERROR' | /* ... */ 'INTERNAL_ERROR';
export const ERROR_CATALOG: Record<ErrorCode, string> = {
  NOT_FOUND: 'Recurso não encontrado.',
  VALIDATION_ERROR: 'Dados inválidos.',
  // ... PT-BR only, codes stable for future i18n
};
export function buildEnvelope(code: ErrorCode, requestId: string, details?: unknown): ErrorEnvelope {
  const message: string = ERROR_CATALOG[code];
  return { error: { code, message, details: details === undefined ? {} : details, requestId } };
}
```
Rules: routes/contracs never craft inline messages; lib never builds envelopes (returns `null` / throws typed errors with `code`+`statusCode` like `searchRuns.ts` lines 97-117; route's `replyRunExecutionError`-style translator, lab.ts lines 178-196, maps them). New codes only if the 15 existing ones cannot express the failure — planner must justify each addition. Status mapping: 401 unauthenticated / 400 validation+disabled / 404 out-of-scope-or-malformed-param-UUID / 422 idempotency-or-semantic conflict / 429 rate-limited / 201 created / 200 replay-or-read / 202 sync-timeout (runs mold) / 204 delete.

### Validation
**Source:** `apps/core-api/src/routes/lab.ts` (lines 76-94, 210-216) + `packages/contracts/src/lab.ts` (lines 27-66)
**Apply to:** ALL new POST/PATCH/GET-with-query handlers
```typescript
const parsed = createSearchSchema.safeParse(request.body);
if (!parsed.success) {
  await reply.code(400).send(buildEnvelope('VALIDATION_ERROR', requestId, parsed.error.flatten()));
  return;
}
// queries: safeParse(withClampedLimit(request.query)); params-UUID: 404 not 400
```
Rules: Zod at the boundary, `safeParse` (never `parse`/throw), `.flatten()` as `details`; `withClampedLimit` before query parse (DoS clamp 1..100, non-numeric still 400 via `z.coerce`); UUID params → 404; bounded arrays everywhere (`.max(N)`); decision/tag/divergence length limits mirror DB CHECKs; `with` (compare) ≤ 10 searches and `selection` (export) ≤ 1000 IDs per RESEARCH §Security Domain (DoS guard).

### Owner-First Scoping (IDOR)
**Source:** `apps/core-api/src/lib/searches.ts` (lines 328-347, 473-479) + `apps/core-api/src/lib/projects.ts` (lines 64-82)
**Apply to:** `corpus.ts` reads/writes, compare aggregation, export scope resolution
Rule: every query JOINs `→ projects` and filters `projects.owner_id = actor.userId`; out-of-scope → `null` → route 404 identical to nonexistent. Compare/export resolve scope BEFORE aggregating (no cross-user key leakage via overlap). Tests: owner/stranger/ghost/anonymous per route (integration + curl).

### Pagination / Cursor
**Source:** `packages/contracts/src/pagination.ts` (lines 9-49) + `packages/contracts/src/lab.ts` (lines 237-289) + `apps/core-api/src/lib/searches.ts` (lines 49-57, 359-403)
**Apply to:** corpus list (and any new list). Compare output is fixed 4 blocks, no pagination (D-49); export is a file, no pagination.
Rule: `limit` default 20 / clamp 1..100; opaque `base64url` cursor; `decode*` returns `null` on malformed (never throws, ignored → first page); stable `ORDER BY` + `limit + 1` probe.

### Aggregation Window
**Source:** `packages/integrations/src/health.ts` (lines 32-71)
**Apply to:** compare endpoint (counts/histogram/overlap)
```typescript
const rows = await db
  .select({ ok: labSourceEvents.ok, isChallenge: labSourceEvents.isChallenge })
  .from(labSourceEvents)
  .where(and(eq(labSourceEvents.source, source), gt(labSourceEvents.at, since)))
  .orderBy(desc(labSourceEvents.at))
  .limit(HEALTH_WINDOW_EVENTS);
```
Copy the windowed-aggregate shape (WHERE + ORDER + LIMIT, count in JS, expose only counts + status + ISO time, never sensitive content). Compare's "latest terminal run per search" (D-48: `succeeded|partial`, never `queued|running|cancelled`) is the corpus-analogous window — resolve run IDs first under actor scope, then aggregate.

### Test + Proof Hygiene
**Source:** `tests/integration/lab-search-runs.test.ts` (lines 408-421, 481-500) + `scripts/curl-lab.sh` (lines 66-70)
**Apply to:** `lab-corpus.test.ts`, `dedup-exports.test.ts`, `curl-corpus.sh`
Rules: `x-request-id` asserted on every response; negative secret regex on every body (incl. export JSON); `describe.skipIf` offline skip; FK-ordered wipe; `globalThis.fetch` fake only (never a production fetch-injection flag); curl asserts `ALL PASS` with 401/404 IDOR proofs.

### Migration Discipline
**Source:** `packages/db/src/schema.ts` (lines 1-11 header) + `packages/db/drizzle/0002_fancy_hiroim.sql`
**Apply to:** migration 0003
Rules: `drizzle-kit generate` from `schema.ts` (mold 0002); CHECKs mirror Zod; FKs `onDelete: cascade` toward owner chain; `UNIQUE(project, canonicalKey)` + `UNIQUE(group, source)` + `UNIQUE(project, name)`; lazy tag seed (no data migration — RESEARCH A6); verify against real PG (`db:migrate` in `beforeAll`).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/core-api/src/lib/exports.ts` (serializers) | utility | file-I/O | No CSV/BibTeX/file-download code exists — no `Content-Disposition`, no RFC 4180 quoter, no BibTeX escaper, no ASCII slug in codebase (verified via route/lib/contract search). Planner uses RESEARCH.md `## Code Examples` (csvCell + injection guard, BIBTEX_ESCAPES + ALL-CAPS protection, exportFilename) verbatim. |
| `apps/core-api/src/lib/dedup.ts` (fuzzy core) | utility | transform | No string-similarity/Levenshtein in codebase. Planner uses `fastest-levenshtein@1.0.16` `distance` + normalized `1 - d/maxLen ≥ 0.9` + NFKD normalization + year-blocking per RESEARCH Pattern 2 / Pitfalls 3. Threshold is metric-specific — do not swap metric without recalibration (A1). |
| Corpus-eligible predicate | shared rule | batch | No `status = confirmed` filter exists yet. Planner introduces one shared `isCorpusEligible(group)` used by corpus + compare-overlap + export-scope-corpus (RESEARCH Pitfall 5) — three divergent WHEREs are the failure mode. |

## Metadata

**Analog search scope:** `apps/core-api/src/lib/`, `apps/core-api/src/routes/`, `apps/core-api/src/auth/`, `apps/core-api/src/plugins/`, `packages/contracts/src/`, `packages/db/src/` + `packages/db/drizzle/`, `packages/integrations/src/`, `tests/integration/` + `fixtures/`, `tests/smoke/`, `scripts/`
**Files scanned:** ~25 (7 read in full: searches.ts, searchRuns.ts, routes/lab.ts, contracts/lab.ts, db/schema.ts, errors.ts, pagination.ts; 6 read for shared/test/proof patterns: health.ts, rateLimit.ts, projects.ts, requireAuth.ts, lab-search-runs.test.ts, curl-lab.sh, boot.test.ts, 0002 SQL)
**Pattern extraction date:** 2026-09-11
