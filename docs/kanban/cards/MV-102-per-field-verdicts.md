# MV-102 — Per-field verdicts (Option C)

**Column:** In Review · **Branch:** `mv-102-per-field-verdicts` (off `origin/master`) · **Built:** 2026-07-04
**Spec:** `docs/superpowers/specs/2026-07-04-per-field-verdicts-design.md` (rev 3)
**Plan:** `docs/superpowers/plans/2026-07-04-per-field-verdicts.md`

## Why

MV-99 lets a student pick a primary field plus up to two "also-considering" fields, but the extras only earned a muted `competitivenessNote` line. A Nepali student who is **Reach for Computer science** but **Possible for Business** could never see that concrete pivot — a self-serve dead-end that pushes them to a consultancy. Option C promotes the also-considering fields into **real banded verdicts** on the results page so the student sees their standing in each field and can decide a pivot themselves.

## What shipped

- **New pure module** `lib/results/secondary-verdicts.ts` — `computeSecondaryVerdicts(profile, primaryResult)` re-scores the SAME student in each also-considering field (`runAssessment` with only `fieldOfStudy` swapped), keeps **only** `.verdict`. Filters/dedupes extras against the primary in-function (load-bearing guard). Returns `null` for the single-field common case. Emits `{ primary, items, pivot }`; `pivot` = strongest field that strictly outranks the primary (ties → first).
- **New presentational** `components/results/secondary-verdicts.tsx` — compact, clearly-conditional bands beneath the unchanged primary `VerdictCard`. Mandatory per-row conditional framing ("If you applied under Business instead — Strong match"), static pills (no `animate-*`, preserves primary two-beat motion), honest low-pressure pivot callout (`role="note"`, words only, no cost/visa overclaim). Replaces the results render of `<CompetitivenessNote>`.
- **Payload** `lib/results/types.ts` + `lib/results/assemble.ts` — additive optional `secondaryVerdicts`; primary `runAssessment` hoisted once and reused (behaviour-preserving). No DB / no migration.

### Integrity fixes the slice forces
- `lib/scoring/from-sections.ts` — forwards `alsoConsidering` on the signed-in re-score path (was dropped; feature would ship dark for signed-in users, and this also un-darks MV-99's competitivenessNote for them).
- `lib/matches/compute.ts` — `field-exploring` reason reworded off the now-false "not covered by your verdict" → "not your primary field".
- `lib/validation/profile-section.ts` — `IntendedStudyPatch` gains disjoint/dedup `.refine` + `.max(ALSO_CONSIDERING_CAP)` for write-path parity.

### Codex must-fixes
- `components/profile/editors/study-career-editor.tsx` — always sends `alsoConsidering` (empty array when none) so `repo.ts`'s shallow-merge can clear stale extras (`repo.ts` untouched).
- `lib/guide/context.ts` — `buildGuideContext` carries the secondary bands as field-label + band-**word** only, so the AI guide can't contradict a band the student sees.

## Acceptance criteria

- [x] Primary verdict unchanged and byte-identical — `tests/scoring/characterization.test.ts` goldens untouched (only an assertion added).
- [x] Each also-considering field shows a real re-scored band; words only, never a numeric score.
- [x] Pivot callout appears only when a secondary band strictly outranks the primary; honest, low-pressure, no cost/visa overclaim.
- [x] Both data-flow paths (anonymous wizard + signed-in re-score) carry `alsoConsidering`.
- [x] Stale extras can be cleared for signed-in users.
- [x] Matches "exploring" label no longer contradicts the new bands.
- [x] No DB, no migration; scoring engine untouched.

## Evidence

- Gate: `tsc --noEmit` clean; `eslint` 0 errors (1 pre-existing warning in `docs/kanban/build.mjs`); `vitest run` **260 files / 1667 tests pass, 0 fail** (own re-run 2026-07-04).
- Goldens: `git diff origin/master -- tests/scoring/characterization.test.ts` is assertion-only; `lib/scoring/engine.ts` + golden fixtures show empty diff.
- Tests added (~52): pure module (13), component (8), validation (5), from-sections round-trip (2), assemble payload (2), matches label (updated + guard), editor clear (3), guide context (2), Results wiring (1), characterization null (1).
- Commits: `e8aec5d`..`a9844f9` (10 implementation) on top of spec/plan doc commits.

## Resume notes (cold agent)

- Branch is push-ready; **merge to master is founder-gated** — do NOT `gh pr merge` without an explicit per-merge "go", and never `--admin`.
- `CompetitivenessNote` component is now unrendered anywhere (only its own file + test reference it) — intentionally left in place (not deleted) per spec; `competitivenessNote` payload field + `lib/scoring/field-note.ts` retained (still tested, may back a wizard hint).
- Board reconciliation folded into this branch: MV-80 / MV-99 / MV-101 flipped `inreview` → `done` (MV-100 has no board entry).
- Out of scope, tracked separately: anon expiry-copy bug (`components/results/conversion-paths.tsx` recomputes "now + 3 days" instead of stored `expiresAt`) — filed as its own task chip.

## Deferred (future slices)

Per-field match sections / field switcher; per-field plan guidance; promoting the primary itself to a chooser; field-accurate tuition in the financial dimension.
