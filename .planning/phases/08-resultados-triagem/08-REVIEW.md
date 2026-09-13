---
status: findings
phase: 8-resultados-triagem
date: 2026-09-12
---

# Phase 8 (resultados-triagem) — Advisory Review (non-blocking)

Scope: phase-8 source diff `c0970bf..381faf5` (08-01 `f13a482`/`d4c73c5`,
08-02 `e8da752`/`940f4be`, 08-03 `62b9f47`/`28c3cff`, 08-04
`44443b3`/`143a3a1`/`223d68e`). Read-only review; no files modified.
Claims checked against `08-01/02/03/04-SUMMARY.md`, `AGENTS.md` security
baseline, and `08-CONTEXT.md` decisions D-15–D-21.

## Summary

The security-critical paths are sound: every group/tag/decision/divergence
route is `requireAuth` + owner-scoped via JOIN (`scopedGroup`,
tag→project JOIN), invalid UUIDs collapse to identical 404s, Zod validates
at every boundary, and the H-01 main case (later runs never clear an older
run's NOVO badge) is correctly implemented and genuinely pinned by the 3-run
test's badge assertions. No `any`, `eval`, `Math.random`, `localStorage`,
secrets, WebView, or dangerous sinks anywhere in the phase diff.

The headline caveat is H-01's **second half**: `newCount` (frozen at execution
time by `searchRuns.ts`, unanchored `ne`-only anti-join) and `isNew`
(on-read, `lt(executedAt)`-anchored) are still **two structurally different
derivations** that agree only while `executedAt` order == creation order.
On an `executedAt` tie (same-ms `new Date()` at creation) or out-of-order
`executedAt` (backfill/manual insert), badge ≡ counter breaks — and the
3-run test cannot see it because it hand-seeds `metrics.newCount`
constants instead of exercising the real pipeline. Hence M-01/M-02 below.
Everything else is low/info hardening and UX-only notes. No critical or high
severity findings. Frontend guards correctly treated as UX-only throughout.

Counts: critical 0, high 0, medium 2, low 6, info 8 — total 16.

## Verdicts on the four prompted questions

1. **H-01 fix correctness** — YES for the ordered case, PARTIAL for the
   invariant. `seenKeysForSearch` (`apps/core-api/src/lib/searches.ts:566`)
   now filters `lt(executedAt, current)` in both callers (list `:648`,
   single `:688`), so a later run provably cannot clear an older badge.
   But `newCount` comes from `run.metrics.newCount`
   (`apps/core-api/src/routes/lab.ts:651`), computed by `searchRuns.ts:456`
   with a **different, unanchored** anti-join — see M-01.
2. **Does the 3-run test pin it?** — The badge half, YES (old code yields
   `B.isNew=false` in run2 once run3 exists, so `count(isNew)=0≠1` fails —
   the claimed red-green is credible). The counter half, NO: `newCount`
   values are hand-written constants (`baseMetrics(1)`), so
   `count(isNew)===newCount` is asserted against numbers the test itself
   invented — see M-02.
3. **Group decision/divergence authorization** — Owner-scoped throughout
   (verified controls C-01–C-03). No IDOR found.
4. **Enrich on-demand / N+1 / pre-fetch** — No N+1 over results and no
   enrich pre-fetch: expand fetches only the missing members of the one
   expanded group; the ficha does one fresh `getResult` + tags + a group
   scan. The group scan is O(all-groups) per ficha open with a full server
   recompute per page — scale smell only, see L-01.
5. **Tag create/rename/delete authorization + XSS via tag names** —
   Authorization owner-scoped with identical 404s and enforced same-project
   attach (C-02). XSS: current RN rendering escapes and links are
   https-only, so not exploitable in this UI — but tag names, unlike
   divergence notes, have **zero** HTML defense layers server-side and are
   stored verbatim — see L-02.

## Medium

### M-01: badge ≡ counter invariant breaks on `executedAt` tie or out-of-order `executedAt`

**Files:** `apps/core-api/src/lib/searchRuns.ts:456-461`,
`apps/core-api/src/lib/searches.ts:566-584`,
`apps/core-api/src/routes/lab.ts:647-652`
**Precondition:** two runs of one search share the same `executedAt`
(production sets `executedAt = new Date()` at creation,
`searchRuns.ts:297` — two rapid `executeSearch` calls can land in the same
millisecond), OR a run is inserted with `executedAt` out of creation order
(backfill, manual insert, clock skew).
**Impact:** `newCount` (execution-time, `ne(runId)` over *all* other runs)
and `isNew` (on-read, `lt(executedAt)`) disagree. Tie example: run1/run2
same `executedAt`, shared key K. `newCount` for run2 counts K as seen (0
new); on-read treats the tie as posterior (documented D-15 choice), so
K.`isNew=true` in run2 and `count(isNew) > newCount` — the header counter
and the NOVO badges contradict each other on the same screen. Backfill
example is worse in the other direction (shared keys show NOVO in the
backfilled run while its frozen `newCount` is 0). D-15's "tie = posterior"
rule is honored by only one of the two derivations.
**Fix:** anchor the `searchRuns.ts` computation the same way — restrict its
`priorRows` to `executedAt < current run's executedAt` (or, cheaper and
airtight, compute `newCount` on-read from the same `seenKeysForSearch`
instead of trusting frozen metrics for the badge≡counter display).
**Proving test:** insert run1+run2 with *identical* `executedAt` sharing one
key through the real `executeSearchRun` path (not hand-seeded metrics),
then `GET …/runs/<run2>/results` and assert
`body.newCount === body.items.filter(i => i.isNew).length`. Today it fails
(`newCount` 0 vs 1 NOVO). A second case with backfilled (earlier)
`executedAt` inserted last pins the out-of-order direction.

### M-02: 3-run test's counter assertions are tautological — real `newCount` path untested

**Files:** `tests/integration/lab-results-isnew.test.ts:367-450`
(seed), `:556-612` (asserts)
**Precondition:** any regression inside `searchRuns.ts`'s `newCount`
computation (or drift between its semantics and `seenKeysForSearch`).
**Impact:** the test claims "badge ≡ contador nos 3 runs", but every
`newCount` under test is a hand-written `baseMetrics(1)` constant inserted
directly with the run (`:392-403`, `:438-448`). The suite proves
`count(isNew) === 1` (the badge half — genuinely valuable, fails on old
code) but never proves the *pipeline's* `newCount` equals that count,
because the pipeline never runs. A future change that breaks execution-time
`newCount` (e.g. reintroducing the unanchored anti-join there, or a status
filter applied on only one side) stays green here.
**Fix:** add one test that drives two sequential runs through the real
execution path (adapters stubbed, as other suites do) with an overlapping
key, then asserts `GET results` returns `newCount ===
count(isNew)` for both runs. Keep the current hand-seeded 3-run test as the
frozen-history pin; the new test pins the counter's producer.
**Proving test:** the new test itself — write it against a deliberately
desynced `newCount` (e.g. `metrics.newCount + 1` written post-execution);
it must go red, proving it observes the producer rather than the constant.

## Low

### L-01: ficha resolves its group by scanning ALL groups; each page recomputes full dedup server-side

**Files:** `apps/lab/app/project/[id]/result.tsx:120-142`,
`apps/core-api/src/routes/lab.ts:840-878`
**Precondition:** project with hundreds+ of groups; user opens one ficha.
**Impact:** one ficha open costs a full `computeDedupGroupsForActor`
recompute per 100-group page until the member is found (worst case: entire
corpus recomputed N/pages times for a single record view). Correct results,
wasteful and latency-unbounded as the project grows. D-19's letter
(single fresh `getResult`, no list prefetch) is honored; its spirit
(cheap on-demand enrich) is strained by the missing direct lookup.
**Fix:** add `GET /api/v1/lab/groups/by-member/:resultId` (owner-scoped via
`scopedGroup`-equivalent JOIN) or return the `groupId` inside `ResultDTO`;
ficha then does 2 requests total. Alternatively short-circuit the scan with
a server-side member→group index query.
**Proving test:** seed 250 groups, open the ficha's loader against a
request counter (mock `labApi`), assert ≤ 3 requests; or integration test
asserting the new lookup route returns the group in one call.

### L-02: tag names have no HTML defense layers — stored verbatim, unlike divergence notes

**Files:** `packages/contracts/src/lab.ts:331-340` (no `<>` refine, cf.
`:358-366` for divergence), `apps/core-api/src/lib/corpus.ts:711-738`,
`:750-833` (no stripping on create/rename),
`apps/lab/src/results/TagInput.tsx:137-145`,
`apps/lab/src/results/TagManagerModal.tsx:230-248` (no `<>` client check,
cf. `DedupGroupSection.tsx:232`)
**Precondition:** actor creates/renames a tag to
`<img src=x onerror=alert(1)>` (allowed: 1..100 chars, passes today).
**Impact:** *Not exploitable in the current RN UI* — names render via
`<Text>` (escaped) and `color` is never used as a style — but the payload
persists in `labTags.name`, flows into `DedupGroupDTO.tags`, group filters,
and phase-9 exports (CSV/BibTeX/JSON), where a future HTML/WebView consumer
inherits a stored-XSS seed. Divergence notes got three layers (schema
refine + server strip + client block); tags got zero.
**Fix:** mirror the divergence contract — add the same
`.refine(v => !/<[^>]*>/.test(v))` to `tagNameSchema` (covers create+rename
at once) and the `<>` client guard in `TagInput` submit + modal save/create
paths.
**Proving test:** `POST …/tags` with `{name: "<img src=x onerror=alert(1)>"}`
→ assert 400; plus rename variant → 400; plus existing 400-collision test
still green.

### L-03: detach resolves the tag by *name* client-side and the server 204s no-ops

**Files:** `apps/lab/src/results/TagInput.tsx:38-51` (`findTagByName`),
`:198-229` (detach + synthesize), `apps/core-api/src/lib/corpus.ts:872-889`
**Precondition:** (a) two tags differing only by case (`Revisar` vs
`revisar` — PG `UNIQUE(projectId,name)` is case-sensitive, so both can
exist); the case-insensitive fallback can resolve the wrong id while the
synthesized override drops the chip by exact string. (b) Double-tap detach
or detach-after-modal-delete: server deletes zero links yet returns `true`
→ 204, client synthesizes a removal that may already be reflected.
**Impact:** wrong chip disappears locally (server state is actually correct
— the JOIN-by-id delete is precise), or a silent no-op reported as success.
Self-heals on next `refreshGroups`, but the immediate UI lies.
**Fix:** thread tag *ids* through `group.tags` (or a parallel id list in the
DTO) so detach never resolves by name; server-side, return the post-detach
group (like attach does) or 404 when no link existed instead of bare 204.
**Proving test:** create `Revisar`+`revisar`, attach both to one group,
detach `revisar` via the UI handler with a mocked `labApi`, assert the
remaining chip is `Revisar` and the `detachTag` call carried `revisar`'s id;
server test: detach unattached pair → assert 404 (post-fix).

### L-04: year filter accepts `parseInt` slop and silently keeps stale state

**Files:** `apps/lab/app/project/[id]/results.tsx:131-142`
**Precondition:** user types `2024abc` (→ filters 2024), `12.9` (→ 12),
`-5`, or types `abc` after `2020` (previous filter stays active, input
shows text matching nothing about the active filter).
**Impact:** UX-only — surprising result sets with no indication of what
year is actually applied; hostile-input robustness claim
("query é hostil") is enforced for ids but not for this field.
**Fix:** accept only `/^\d{1,4}$/` (with a sane range, e.g. 1000–2100),
else set `year: null` *and* show an inline hint; always keep displayed text
and applied filter visibly consistent.
**Proving test:** unit test on the handler (extract to pure
`parseYearInput`): `2024abc`→null, `12.9`→null, ``→null, `2020`→2020; plus
`abc`-after-`2020` clears the applied filter.

### L-05: tag created in the card is unfilterable until the Tags modal is opened

**Files:** `apps/lab/src/results/TagInput.tsx:159-169` (`localTags`),
`apps/lab/app/project/[id]/results.tsx:176-183` (`refreshGroups` only via
modal), `apps/lab/src/results/useResultsList.ts:131-142`
**Precondition:** user creates a brand-new tag via card autocomplete (the
D-20 flagship flow) and then wants to filter by it.
**Impact:** UX-only inconsistency: the chip shows on the card (override
map) but the header Tag filter (`list.tags`, fetched once in the hook)
lacks the new tag until any modal mutation triggers `refreshGroups`.
Users conclude the tag "didn't save".
**Fix:** after successful create+attach in `TagInput`, call through to
`onTagsChanged`-equivalent (or lift `list.tags` refresh into
`handleGroupUpdated` path for created ids) — cheapest: expose the created
tag to the screen so it appends to the filter source optimistically.
**Proving test:** component/integration test with mocked `labApi`: submit a
novel tag in the card, assert the header filter row contains it without
opening the modal.

### L-06: concurrent same-name renames escape as 500 instead of 400

**Files:** `apps/core-api/src/lib/corpus.ts:769-786`
(check-then-act), `apps/core-api/src/capabilities.ts:143-…`
(`toHttpError` has no unique-violation mapping)
**Precondition:** two rename (or rename-vs-create) requests for the same
`projectId`+`name` interleave between the clash `SELECT` and the `UPDATE`.
**Impact:** UNIQUE backstop keeps data correct, but the loser surfaces as
500 (via global `errorHandler`) instead of the designed 400
`VALIDATION_ERROR`; SUMMARY already discloses this as residual. No
corruption, no leak beyond a generic 500 envelope.
**Fix:** catch the PG unique-violation code (`23505`) in
`renameTagForActor` (and `createTagForActor` for symmetry) and rethrow
`TagNameConflictError`; the route's existing `error.name` catch then
renders the intended 400 with zero route changes.
**Proving test:** integration test firing two concurrent
`PATCH …/tags/:id` renames to the same name → assert one 200 + one 400
with `{name: 'Já existe uma tag com este nome.'}` (today: one 500).

## Info

### I-01: `projectId` is not uuid-gated client-side — fires doomed requests

**File:** `apps/lab/app/project/[id]/results.tsx:73-84`, `:219`,
`apps/lab/app/project/[id]/result.tsx:58-62`
**Precondition:** `projectId` route param malformed (deep link, manual URL).
**Impact:** unlike `runId`/`resultId` (validated, zero requests), a garbage
`projectId` still triggers groups+tags+results fetches; server safely
404s/empties. Robustness inconsistency only.
**Fix:** same `UUID_RE` gate for `projectId` with the existing invalid
branch short-circuiting the hook (`projectId: ''`).
**Proving test:** render screen with `projectId="x"`, assert `labApi`
zero calls and the `Projeto inválido` banner.

### I-02: suggestion-tap vs submit vs detach busy-guards don't fully exclude each other

**File:** `apps/lab/src/results/TagInput.tsx:107-133`
**Precondition:** tap a suggestion while a submit is in flight (`handleSubmit`
doesn't check `busySuggest`; `handleDetach` doesn't check it either).
**Impact:** double-attach of two tags concurrently; server is idempotent
(`onConflictDoNothing`, corpus.ts:863) and the last `onGroupUpdated` wins,
so worst case is a transient chip flicker. UX-only race.
**Fix:** single `busyKind: null | 'submit' | 'suggest' | 'detach'` union
checked by all three handlers.
**Proving test:** fire suggestion-tap + submit concurrently with deferred
mocked promises, assert the second action no-ops until the first settles.

### I-03: modal close is silently swallowed while any mutation is busy

**File:** `apps/lab/src/results/TagManagerModal.tsx:114-123`
**Precondition:** tap X/Fechar/Voltar mid-save/delete/create.
**Impact:** nothing happens, no feedback — user perceives a dead button.
Deliberate (avoid closing mid-write) but undisclosed. UX-only.
**Fix:** keep blocking, but render a hint (`Salvando… aguarde`) or disable
the buttons visibly while busy.
**Proving test:** set `busySave`, tap close, assert hint text appears and
`onClose` not called; after settle, close works.

### I-04: divergence source not constrained to the group's origins server-side

**File:** `apps/core-api/src/lib/corpus.ts:920-944`
**Precondition:** crafted `PUT …/groups/:id/divergence` with a valid source
absent from the group's `origins` (client restricts via
`DedupGroupSection.tsx:355-365`; server accepts any executable source).
**Impact:** cosmetic data oddity (`CAPES: …` note on a BDTD-only group),
rendered faithfully. No authZ or injection angle (note still Zod-shaped,
length-capped, HTML-refused).
**Fix:** in `setDivergenceForActor`, load the bundle first and 400/422 when
`input.source` ∉ group origins; or document cross-source annotation as
intended.
**Proving test:** PUT divergence for a source outside the group's origins
→ assert 400/422 post-fix (today: 200).

### I-05: `color: ""` stored distinctly from `null`

**File:** `packages/contracts/src/lab.ts:346-353`
**Precondition:** `PATCH …/tags/:id` with `{color: ""}` (passes: `trim`
+`max(20)`, no `min(1)`).
**Impact:** none today (`color` is never consumed as a style — display uses
names only); latent inconsistency (`""` vs `null` meaning "no color") for
phase-9 consumers.
**Fix:** `.min(1)` or normalize `""`→`null` in the schema transform.
**Proving test:** PATCH `{color: ""}` → assert stored `color === null`
(post-fix).

### I-06: `runExecutedAt` passed raw in `getResult`, wrapped in `list`

**File:** `apps/core-api/src/lib/searches.ts:648` (`new Date(…)`) vs `:688`
(raw driver value)
**Precondition:** driver returning `executedAt` as string instead of `Date`.
**Impact:** none with the current pg driver (timestamp → `Date`), but the
`lt()` operand type then depends on the caller — asymmetric and one
refactor away from a subtle comparison bug.
**Fix:** `new Date(row.runExecutedAt)` at `:688` for symmetry.
**Proving test:** unit test with a string-typed `runExecutedAt` row double
asserting identical `seen` sets from both call sites.

### I-07: unbounded fan-out / pagination loops trust the server unconditionally

**Files:** `apps/lab/src/results/useResultsList.ts:108-124` (groups
`for(;;)`), `apps/lab/src/results/DedupGroupSection.tsx:162-169`
(`Promise.all` over all missing members),
`apps/lab/app/project/[id]/result.tsx:123-142` (same scan pattern)
**Precondition:** pathological group (100+ members) or a faulty server
emitting `hasMore: true` forever.
**Impact:** 100+ parallel `getResult` calls on one expand; infinite loop on
a lying cursor. Server is first-party and clusters are tiny in practice —
robustness nit, and global request cost stays bounded by data the user
explicitly opened (no background N+1).
**Fix:** cap expand fan-out (e.g. batches of 10) and cap pagination loops
(e.g. 50 pages) with an isolated error + retry, mirroring the existing
per-group error isolation.
**Proving test:** mocked `listGroups` returning `hasMore: true` 60× with
rotating cursors → assert the hook stops and surfaces `loadMoreError`-style
state instead of hanging.

### I-08: `TagManagerModal` effect omits `getToken` from deps (no lint plugin to catch)

**File:** `apps/lab/src/results/TagManagerModal.tsx:104-112`
**Precondition:** `getToken` identity change while modal open.
**Impact:** none in practice (`platformGetToken` is `useMemo`-stable,
`session.tsx:141`); stale-closure hazard for future refactors. SUMMARY
notes the `react-hooks` plugin is absent, so this class of slip has no
automated guard anywhere in the phase.
**Fix:** add `getToken` to deps (or wrap `loadTags` in `useCallback`);
consider installing the hooks plugin to cover all phase-8 screens.
**Proving test:** lint gate with `eslint-plugin-react-hooks` enabled must
pass on the 8 phase files; targeted test with a rotating `getToken` mock
asserts the latest token is used on reopen.

## Verified-working controls (do NOT regress)

- **C-01 group authZ:** `scopedGroup` JOINs `labDedupGroups→projects` on
  `ownerId` (`corpus.ts:346-362`); decision (`lab.ts:946-987`), divergence
  (`:1267-1308`), attach (`:1190-1229`), detach (`:1231-1265`) all funnel
  through it; bad UUIDs → identical 404. Decision/divergence never address
  `resultId` (D-46 honored client-side too: `DecisionBar.tsx:56-60` PUTs by
  `group.id`, orphan cards render disabled + `grupo indisponível`).
- **C-02 tag authZ:** rename/delete JOIN `labTags→projects` on `ownerId`
  (`corpus.ts:757-833`), cascade documented for joins; attach additionally
  enforces same-project tag (`:848-862`); rename clash → 400 via
  `error.name` narrowing without importing `lib/*` into routes
  (`lab.ts:1110-1145`), and the throw correctly propagates because
  `toHttpError` returns null for it so `callCapability` rethrows
  (`capabilities.ts:483-499`).
- **C-03 IDOR coverage:** integration suites pin stranger/forged-id 404s on
  the new and touched routes (`lab-groups-triage.test.ts` header scope;
  `lab-results-isnew.test.ts` IDOR case) — matches the code paths above.
- **C-04 divergence HTML defense (the model for L-02):** schema refine
  rejects `<…>` (`contracts/lab.ts:358-366`), server strips + trims
  (`corpus.ts:930`), client blocks `<>` with 1..1000 checks
  (`DedupGroupSection.tsx:232-244`).
- **C-05 H-01 ordered case:** anchored anti-join in both readers
  (`searches.ts:648,688`); 3-run badge assertions (`isnew-3-b` stays NOVO
  in run2 post-run3, `:586-590`) genuinely fail on the old code.
- **C-06 no secret/privilege surface:** no `any`/`eval`/`Math.random`/
  `localStorage`/hardcoded secrets in the phase diff (scan clean; only
  `password:` hits are pre-existing integration-test fixtures);
  `getToken` identity is `useMemo`-stable so effect deps don't refetch-loop
  (`session.tsx:141`); 401 handling is redirect-only, never oracle (no
  resource-existence signal in 401 vs 404 paths).
- **C-07 safe rendering & navigation:** all server strings via RN `<Text>`
  (escaped); external links https-only with plaintext fallback
  (`DedupGroupSection.tsx:304-331`, `result.tsx:295-298`); hostile ids
  short-circuit with zero requests (`runId` in `results.tsx:78-84`,
  `resultId` in `result.tsx:61-93`); `DedupGroupSection` early-returns
  *after* all hooks (no conditional-hook violation, `:109-134`); member
  enrichment goes through owner-scoped `getResult`, so forged `memberIds`
  degrade to the isolated per-group error + retry, never cross-owner reads.
- **C-08 write-path hygiene:** `decidedAt` refresh is explicit in the upsert
  (`corpus.ts:905-911`); tag seed is seed-if-empty with
  `onConflictDoNothing` backstop (`:679-689`); DTO copies (`toGroupDTO`)
  spread tags/divergences (no caller aliasing).

---
_Reviewed: 2026-09-12_
_Reviewer: OpenCode (gsd-code-reviewer, advisory non-blocking)_
_Scope: phase 8-resultados-triagem, commits f13a482 d4c73c5 e8da752 940f4be 62b9f47 28c3cff 44443b3 143a3a1 223d68e_
