---
status: findings
phase: 7-projetos-buscas-execucao
date: 2026-09-12
---

# Phase 7 — Advisory Code Review (NON-BLOCKING)

**Scope:** 8 feat commits (`1965da1`, `4817ef0`, `df7c5e1`, `76bdd54`, `637b0ca`, `e585c41`, `89841a3`, `4e114b1`) — 21 files under `apps/lab` + `packages/contracts/src/projects.ts`.
**Method:** full read of every changed source file + diff of the contract change + cross-checks against `apps/core-api` (route/capability/lib), `apps/lab/src/api/*`, `apps/lab/src/auth/session.tsx`, contract `lab.ts`.
**Standing assumption:** frontend guards are UX only; authorization is server-side. No finding below assumes client-side enforcement.

## Verdict on the four prompted questions

1. **`updateProjectSchema` widening — SAFE / additive.** Same key set, no new field; `title`/`status`/`referenceSearchId` byte-identical in strictness; `researchQuestion`/`description` widened `string?` → `string | null` (optional preserved), which only *accepts* payloads previously rejected. Both enforcement points (`apps/core-api/src/routes/projects.ts:193`, `capabilities.ts:195`) validate with the same schema, so no surface diverges. Server lib (`lib/projects.ts:219-224`) already assigns `string | null` directly (null clears), and `referenceSearchId` keeps its uuid + same-project/same-owner membership check (`lib/projects.ts:174-198`). No over-posting opened (no `ownerId`/privilege key accepted). Empty-string `""` storage was already possible before this change (no `min(1)` on those fields in create either) — not a regression.
2. **Polling correctness — one real race (MD-01), otherwise correct.** Timer cleanup is right (terminal/timeout/error/unmount all `clearInterval`; hook never imports `cancelJob`, D-08 holds). 401 short-circuit, 3-strikes error rule, 240-poll ceiling all correct.
3. **Delete-cascade counts — honest but bypassable (LW-03) and approximate-by-design when `hasMore`.** Approximation is labeled (`~`, `+`); the bypass is the finding.
4. **FlatList/ScrollView tripwire — intact, with a coverage blind spot (IN-04).** Projects/strategies use `FlatList`, detail/search-form/run use `ScrollView`, nested `FlatList` in `SearchForm` is `scrollEnabled={false}` (correct pattern). But the tripwire only scans *screens*; the two new `.map(` sites live in *components*.

## Findings

### MD-01: Overlapping polls can un-terminal the run screen and kill polling with a dead timer (medium)

**File:** `apps/lab/src/search/useRunPolling.ts:126-151,186-188`
**Precondition:** a `getRun` round-trip takes longer than the fixed 2500 ms interval, so two `pollOnce()` executions are in flight and resolve out of order — the newer (terminal) response arrives first, the older (non-terminal) arrives second. Realistic on degraded mobile networks, which is exactly when users watch this screen.
**Impact:** the stale response runs `setRun(stale)` + `setPollState('polling')` *after* the terminal response already called `finish()` (timer cleared). UI ends frozen on a stale non-terminal run with no timer driving further polls; `pollState === 'polling'` keeps the Cancel button visible against a dead loop. Recovery requires leaving/reopening the screen or pressing Cancel. Read-only stuck state — no data loss, no server effect — but it breaks the headline feature (D-07 auto-tracking) under the network conditions where it matters most. The `stopped` flag only guards unmount/retry, not staleness; there is no in-flight guard or sequence number.
**Fix:** skip stale resolutions, e.g. a monotonic `seq` per effect (`const mySeq = ++seqRef`-style local, or an `inFlight` boolean that skips a tick while a request is pending):
```ts
let seq = 0;
async function pollOnce(): Promise<void> {
  if (stopped || inFlight) return;
  inFlight = true;
  const mySeq = ++seq;
  try {
    const dto = await labApi.getRun(runId, { getToken });
    if (stopped || mySeq !== seq) return; // stale: ignore
    ...
  } finally { inFlight = false; }
}
```
**Test that proves the fix:** mock `labApi.getRun` with two deferred promises; resolve the second call (`status: 'succeeded'`) before the first (`status: 'running'`); assert `pollState` stays `'terminal'`, `run.status === 'succeeded'`, and no further `getRun` calls occur after the terminal resolution.

### LW-01: Bare `globalThis.crypto.randomUUID()` on three tap paths, despite the codebase knowing it may be absent (low)

**Files:** `apps/lab/src/search/SearchCard.tsx:165`, `apps/lab/app/project/[id]/search-form.tsx:220`, `apps/lab/app/project/[id]/run.tsx:176`
**Precondition:** runtime without `globalThis.crypto.randomUUID` (older Hermes/Android — a possibility the codebase itself acknowledges: `apps/lab/src/api/client.ts:108-123` defensively guards the same call and returns `null` when unavailable).
**Impact:** `TypeError` thrown while evaluating the `executeSearch` arguments, inside the `try` — so no crash and no request, but the user gets a cryptic verbatim engine message ("randomUUID is not a function"-class) in the error banner instead of an actionable PT-BR message, and the tap silently does nothing. No duplicate-run risk (request never sent), no security hole — pure robustness/UX gap, tripled across three independent call sites with no shared helper.
**Fix:** extract one guarded `newIdempotencyKey()` helper (reuse the `client.ts` pattern, with a non-`Math.random` fallback or a clear PT-BR throw) and call it from all three sites.
**Test that proves the fix:** temporarily delete `globalThis.crypto.randomUUID` in a test, invoke each handler path, assert the user sees the friendly PT-BR message (or a fallback key is generated and exactly one request fires) — never a `TypeError` text.

### LW-02: Edit-save silently rewrites valid non-lab-authored terms (leading NOT / trailing operator) (low)

**File:** `apps/lab/src/search/searchTerm.ts:65-136` (`splitSearchTerm`), consumed by `apps/lab/src/search/SearchForm.tsx:103-108`
**Precondition:** a search term authored outside the lab UI (API/CLI/MCP — all legitimate, since the server `searchTermSchema` accepts any 1–500-char balanced-quotes string with no operator grammar) that starts with `NOT` (e.g. `NOT foo`) or ends with an operator; user opens it in lab edit mode, changes *any* field, saves.
**Impact:** `splitSearchTerm('NOT foo')` yields a single row `{text: 'NOT foo'}` whose rebuild quotes it (`"NOT foo"`) because of the whitespace rule — negation becomes a quoted phrase; trailing-operator terms get similarly quoted. The adapter receives different semantics than the stored term, with no warning. Tests only cover round-trips of `build` outputs, never of arbitrary valid server terms.
**Fix (either):** preserve operator-position fidelity on split (emit a leading-operator row / retain trailing operator tokens verbatim), or detect non-round-tripping terms on load and warn ("termo criado fora do app — edição pode alterar o significado") with a verbatim-save escape hatch.
**Test that proves the fix:** `expect(buildSearchTerm(splitSearchTerm('NOT foo'))).toBe('NOT foo')` and `splitSearchTerm('A AND')` round-trip identity; plus a property test that any `searchTermSchema`-valid fixture survives `split → build` unchanged or triggers the warning path.

### LW-03: Destructive [Excluir] enabled before the cascade numbers it exists to show have loaded (low)

**File:** `apps/lab/src/search/DeleteSearchDialog.tsx:141-165` (`countsReady` gates only the *display*, not the button)
**Precondition:** user opens the delete dialog and taps the red [Excluir] within the `listRuns` latency window (`countsReady === false`, "carregando contagem…" showing).
**Impact:** hard-delete executes without the user ever seeing the execution/result counts — defeating UI-15's informed-consent purpose. The AGENTS.md gate itself still holds (dialog + dedicated red button + "não pode ser desfeita (hard-delete)" warning = explicit confirmation), and counts are informational/non-blocking by design (T-07-04-02), so this is consent *quality*, not consent absence.
**Fix:** `disabled={deleting || !countsReady}` on the [Excluir] button (keep Cancel always enabled).
**Test that proves the fix:** render the dialog with a pending `listRuns`, tap [Excluir] immediately, assert `deleteSearch` was NOT called; resolve the fetch, tap again, assert it was called once.

### LW-04: Project search-count cache never invalidated → stale "N busca(s)" labels (low)

**File:** `apps/lab/app/projects.tsx:52,96-136` (`fetchedCounts` ref)
**Precondition:** counts fetched for a project id (added to the `Set`, never removed — not on filter switch, not on `load()` retry), then searches change underneath (duplicate/delete from the strategies screen, or another device), then the list re-renders with the same mount (e.g. filter Ativos→Arquivados→Ativos).
**Impact:** stale count label only; tapping through shows correct data. Cosmetic staleness, self-heals on remount.
**Fix:** clear the id from `fetchedCounts` (or drop the `Set` in favor of a generation counter bumped on `load()`/filter change) so refetches re-run the count query.
**Test that proves the fix:** seed counts, trigger `onChanged`-style reload with a changed `listSearches` mock, assert a second count fetch for the same project id.

### LW-05: Create-from-error-state swallows the new project (low)

**File:** `apps/lab/app/projects.tsx:138-145,235-265` (`handleCreated` vs `state === 'error'` branch)
**Precondition:** project list in `error` state; the error view still offers the modal; user creates a project successfully (`handleCreated` inserts into `items`, gated on filter match).
**Impact:** `state` remains `'error'`, so the error screen keeps rendering and the just-created project is invisible — user reasonably concludes creation failed and may retry, creating duplicates. No data loss (server state correct), but the UI contradicts a successful mutation.
**Fix:** on successful create from error state, either `void load(filter)` to recover, or `setState('ready')` when inserting.
**Test that proves the fix:** render error state, mock successful create, assert the list (or a reload) surfaces the new project instead of the persistent error banner.

## Info

### IN-01: `elapsedPolls` produced but consumed nowhere

**File:** `apps/lab/src/search/useRunPolling.ts:92,100,200` (sole consumer `run.tsx:101` destructures only `{ run, pollState, error, retry }`).
Either surface it (e.g. "acompanhando há Ns" / timeout progress) or remove it from the interface before phase 8 code starts depending on it.

### IN-02: `activeTab` prop is dead — TabBar highlight can never activate

**File:** `apps/lab/app/project/[id].tsx:43-47,309-330`.
Expo Router never injects custom props into route components, and strategies/corpus are separate routes that don't render this component — so `activeTab` is always `'none'` and no tab is ever highlighted. Cosmetic; either wire real route-derived highlighting or drop the prop to avoid a misleading "active tab" API.

### IN-03: Inconsistent hostile-date handling — `formatRunDate` echoes raw ISO

**File:** `apps/lab/src/search/SearchCard.tsx:87-91` (`return iso` on invalid date) vs `runHistory.ts:25-32` and `useRunPolling.ts:69-75` (both return `'—'`).
Safe (rendered in RN `Text`, escaped), but a malformed `executedAt` renders a raw server string in one card and `'—'` everywhere else. One-line alignment with the `'—'` convention.

### IN-04: Tripwire blind spot — new `.map(` sites live in components it doesn't scan

**Files:** `apps/lab/src/search/SearchForm.tsx:242` (`OPERATORS.map`), `apps/lab/src/search/RunHistory.tsx:158` (`items.map`).
The tripwire (`scroll-containers.test.ts:73-87`) scans only the 7 screen files. Both sites are acceptable (static 3-button row; history bounded by 20/page manual pagination inside the outer `FlatList` row), but a future `items.map` regression in a component would pass the gate. Consider extending the scan to `src/search/*.tsx` with an allowlist, or asserting `scrollEnabled={false}`/pagination markers on component maps.

## Verified-working controls (spot-checked, not just claimed)

- **Contract widening additive-only and consistently enforced** — diff `4de753e..4e114b1` on `projects.ts` touches only the two nullable modifiers; `create` unchanged (still rejects `null`); route + capability share the schema; lib clears on `null` and membership-checks `referenceSearchId`.
- **D-08 holds** — `useRunPolling.ts` contains zero `cancelJob` references outside comments; unmount cleanup clears only the timer; cancel flows through explicit `labApi.cancelJob` in `run.tsx:141-161`.
- **No banned tokens in the phase diff** — grep over all 14 changed source files: zero `as any`/`: any`/`@ts-ignore`/`eval(`/`new Function`/`Math.random`/`localStorage`/`console.`/`innerHTML`.
- **ID encoding** — every id interpolation in `src/api/lab.ts` and `src/api/projects.ts` uses `encodeURIComponent`; navigation strings interpolate server-issued uuids only, while hostile query values flow through router `params` objects (encoded by the router).
- **Year validation parity** — client `parseYear` (1800–2100, `SearchForm.tsx:80-93`) matches contract bounds (`lab.ts:56-57`), and the `yearFrom ≤ yearTo` refine already carries a PT-BR message (`lab.ts:66-74`).
- **Fail-closed quoting** — terms with embedded quotes that would unbalance (`a "b" c`) are rejected by `searchTermSchema` at both client pre-parse and server, never silently rewritten.
- **Idempotency discipline** — fresh key per tap on all three execute paths, buttons disabled while busy, 429/422 surfaced verbatim with no auto-retry.
- **`getToken` stability** — memoized with `[]` (`session.tsx:141`), so the polling effect (`[runId, getToken, retryNonce]`) cannot restart spuriously.
- **Scroll containers** — `FlatList` (projects, strategies) / `ScrollView` (detail, search-form, run) confirmed; nested `FlatList` in `SearchForm` correctly `scrollEnabled={false}`.
- **Destructive gate** — `DELETE` requires `?confirm=true` client-side (`lab.ts:128-130`) with server 400 without it; dialog keeps the destructive button behind explicit intent with ApiError verbatim on failure and no auto-close.

---

_Reviewed: 2026-09-12_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: deep (per-file read + cross-file traces into core-api, api clients, auth session, contracts)_
_Advisory: non-blocking; no files modified; no commit._
