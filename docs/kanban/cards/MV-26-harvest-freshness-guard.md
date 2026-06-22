# MV-26 — Freshness guard for the harvested DHA DISPLAY datasets

**Column:** Done (founder-accepted 2026-06-23) · **Priority:** P3 · **Owner:** agent · **Size:** S
**Gate:** none (agent-ownable; data-provenance + CI test, no scorer, no DB, no UI).
**Created:** 2026-06-22
**Related:** [[MV-24]] (the harvest these stamps guard); [[MV-04]] (the stale-fact / freshness pattern this mirrors); `tests/data/freshness.test.ts`.

## Why

[[MV-24]] harvested two bulk authority datasets — `au-cricos-directory.ts` (1,669
providers) and `au-nepal-evidence-levels.ts` (1,626 codes → evidence levels). They are
**DISPLAY-pattern** data: each carries one module-level `*_VERIFIED` stamp and lives
deliberately **outside** the findings ledger / `DATA_MODULES` registry (the au-oshc
precedent). The existing freshness guard (`tests/data/freshness.test.ts`) walks
`DATA_MODULES` for **per-record** `provenance.reverifyBy` — so it never saw these two.
They shipped with `lastVerified = "2026-06-22"` and **no `reverifyBy`**, meaning nothing
trips when they age: a real silent-rot gap. DHA revises evidence levels and CRICOS
registrations continuously, so stale harvested data would quietly mislead the very
trust signal MV-24/25 added.

## Design — mirror the MV-04 stale-fact pattern, adapted for module-level stamps

The fee data uses an **event-based** `reverifyBy` (the 1 July financial-year boundary —
the date the fact is known to change). The harvested datasets have **no single change
boundary** — they drift continuously. So the honest model is a **periodic re-harvest
cadence** (a deliberate TTL), framed as such in the data and the test, NOT pretending a
specific expiry date exists.

1. Add a module-level `reverifyBy` to each dataset: `AU_CRICOS_DIRECTORY_REVERIFY_BY`,
   `AU_NEPAL_EVIDENCE_REVERIFY_BY`. Default **6 months** → `2026-12-22`. Documented as a
   tunable cadence, an explicit founder call — not hard policy.
2. Extend `tests/data/freshness.test.ts` with a `freshness guard (harvested DISPLAY
   datasets)` block that reuses the file's existing `dueForReverify` lexicographic logic:
   goes **red on the cadence date** (the failure IS the re-harvest reminder), and asserts
   each stamp is a present ISO date **later than its own `lastVerified`** (so a deleted
   stamp fails loudly instead of `undefined <= today` silently slipping past the filter).

**OUT OF SCOPE:** registering the datasets into `DATA_MODULES` (they are intentionally
display-only, not per-finding ledger values — forcing them in would distort the ledger);
auto-re-harvest on a schedule (the script `scripts/harvest-dha-evidentiary.mjs` already
exists and is run manually; a cron is a separate founder call); changing the cadence
length (the founder's tunable knob).

## Build order (TDD)

1. RED: extend `tests/data/freshness.test.ts` referencing the two not-yet-existent
   `*_REVERIFY_BY` constants → the "later than harvest date" + ISO-format assertions fail.
2. GREEN: add the two constants (`2026-12-22`) with cadence docstrings.
3. Full gate.

## Acceptance criteria

- [x] Each harvested dataset exports a module-level `reverifyBy` (ISO, after its own
      `lastVerified`), documented as a periodic re-harvest cadence (TDD).
- [x] `tests/data/freshness.test.ts` goes red once `today >= reverifyBy` for either dataset
      and red if a stamp is missing/non-ISO (TDD).
- [x] Gate green: typecheck + lint + full suite. Goldens untouched. `au-cricos-codes.ts`
      untouched. No scorer/DB/UI change.

## What shipped

- **`lib/data/source/au-cricos-directory.ts`** — `AU_CRICOS_DIRECTORY_REVERIFY_BY = "2026-12-22"`
  with a cadence docstring (TTL, not fact-expiry; tunable founder call).
- **`lib/data/source/au-nepal-evidence-levels.ts`** — `AU_NEPAL_EVIDENCE_REVERIFY_BY = "2026-12-22"`
  with the same framing.
- **`tests/data/freshness.test.ts`** — new `freshness guard (harvested DISPLAY datasets)`
  block: not-past-cadence (reusing `dueForReverify`) + ISO-present + later-than-lastVerified.

## Test evidence (TDD, RED→GREEN)

- RED: the "each re-harvest cadence is later than the harvest date" assertion failed
  (`undefined > "2026-06-22"` → false) because the constants did not exist. Hardened the
  not-due test with an ISO-format check so a missing stamp also fails loudly (it would
  otherwise slip past the lexicographic `<= today` filter as `undefined`).
- GREEN: +2 tests. `tests/data/freshness.test.ts` 6 passed.
- Gate: typecheck clean · lint 0 errors (lone pre-existing `build.mjs` warning) · full
  suite **1299 passed** (was 1297) · goldens untouched (no scorer path) · `au-cricos-codes.ts`
  untouched. Commit `19ef5f1`.

## Status

**Done — founder-accepted 2026-06-23**, shipped with the MV-23/24/25 batch (was held by
the In-Review WIP-3 cap until the founder cleared the stack).
Founder-owned (not blockers): (1) the cadence length (6 months is a conservative default —
shorten for a tighter re-harvest rhythm, or align to a chosen DHA review date); (2) whether
to add a scheduled auto-re-harvest later (separate slice).

## Resume notes (cold agent)

- The guard lives in the EXISTING `tests/data/freshness.test.ts` (one freshness suite, two
  mechanisms): the `DATA_MODULES` walk for per-record `provenance.reverifyBy`, and the new
  block for the module-level harvest stamps. Do not register the DISPLAY datasets into
  `DATA_MODULES` — they are deliberately outside the ledger.
- When the guard goes red on `2026-12-22`: re-run `scripts/harvest-dha-evidentiary.mjs`,
  diff the output, then move BOTH `*_VERIFIED` and `*_REVERIFY_BY` forward together.
- Commit straight to master; explicit `git add` paths; never stage the WIP trio. Only the
  founder closes to Done.
