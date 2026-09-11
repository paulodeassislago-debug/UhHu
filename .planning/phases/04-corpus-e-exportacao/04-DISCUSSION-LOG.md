# Phase 4: Corpus e exportação - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-11
**Phase:** 4-corpus e exportação
**Areas discussed:** Fuzzy confirmation flow, Canonical record + divergence, Comparison shape, Export mechanics

---

## Fuzzy confirmation flow

| Option | Description | Selected |
|--------|-------------|----------|
| Pending queue | Fuzzy groups stay out of the corpus until explicitly accepted/rejected per group | ✓ |
| Visible but flagged | Groups appear flagged fuzzy-pending, excluded from corpus/export until confirmed | |
| You decide | Implementation discretion within the confirmation requirement | |

**User's choice:** Pending queue (+ owner-only confirmation, split-into-singles on reject, auto-attach on new runs — all recommended options across 4 turns)
**Notes:** Rejected pairing must be remembered so re-runs don't regroup; exact-key matches auto-attach to existing groups without re-confirming.

---

## Canonical record + divergence

| Option | Description | Selected |
|--------|-------------|----------|
| Most complete metadata | Richest origin wins, deterministic tiebreak by source+sourceId | ✓ |
| BDTD priority | BDTD origin always wins when present | |
| First found | Earliest retrievedAt wins | |

**User's choice:** Most complete metadata (+ per-group pin override persisting across re-runs; group-decides-sources-dissent for divergence — all recommended)
**Notes:** Divergence is annotation, not a second decision; override survives re-runs and auto-attach.

---

## Comparison shape

| Option | Description | Selected |
|--------|-------------|----------|
| Shared canonical keys | Overlap via shared dedup canonical keys, cross-source | ✓ |
| Shared sourceIds | Overlap only on same source+sourceId | |
| You decide | Implementation discretion | |

**User's choice:** Shared canonical keys (+ latest finished run per search, locked four outputs only — all recommended)
**Notes:** Comparison is current-strategy vs current-strategy; no per-item lists in output.

---

## Export mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit ID list | Caller posts explicit result/group IDs; corpus scope resolved server-side | ✓ |
| Filter-based | Selection defined by filters | |
| You decide | Implementation discretion | |

**User's choice:** Explicit ID list (+ BibTeX -a/-b suffixes, file download with Content-Disposition, one CSV row per group — all recommended)
**Notes:** CSV granularity matches corpus semantics (canonical per group, no double-counting); filename `corpus-<projeto>-<data>.csv|bib|json`.

---

## OpenCode's Discretion

None — user chose explicit recommended options in all 14 decision turns.

## Deferred Ideas

None — discussion stayed within phase scope.
