# MV-72 — Progression visual #16: intake tick-timeline

**Priority:** P1 · **Owner:** agent · **Branch:** `mv-72-intake-timeline` (off master)

Second sub-slice carved out of the over-scoped **MV-45** umbrella (after MV-71).

## Why (student outcome)

Design-division audit **#16** — *"Intake timing has no timeline."* The surface is
literally named for timing yet rendered only a text list (nearest intake + alternatives),
so a student couldn't see at a glance *how soon* each intake is or *which window is still
open*. A timeline answers "when can I actually start, and is the nearest one still
reachable?" without a consultancy call — one less self-serve dead-end.

## Scope

Add a calm, flat **tick-timeline** above the existing text in `IntakeTimingCard`:

- A **`Now` anchor** at the track start, with status-coloured **intake ticks** placed at
  their real calendar distance ahead (open=`bg-strong`, tight=`bg-possible`,
  closed=`bg-reach` — the verdict palette).
- The existing nearest-intake sentence + deadline notes + alternatives list **stay
  unchanged** below — no copy or info lost.

### Trust + data honesty

No new data. Tick positions derive **only** from each intake's existing `month`/`year`
(`computeIntakeTiming` output), which trace to `AUSTRALIA.intakes` (Feb/Jul) with DHA
`source` + `lastVerified` 2026-06-02. **No dates are invented.**

### Accessibility

The timeline is a **visual aid** marked `aria-hidden="true"`: the nearest sentence,
deadline notes, and alternatives list below already carry every intake (name, year,
status, deadline) in accessible text, so hiding the visual avoids duplicate / confusing
screen-reader output rather than dropping information.

### Single source of truth (no drift)

Positioning lives in a **pure** `buildIntakeTimeline(timing, now)` in `lib/timing/intake.ts`
(mirrors `computeIntakeTiming`'s existing `now`-param pattern), so offsets are
deterministically unit-tested with a fixed `now` and the component stays presentational.

## Files

- `lib/timing/intake.ts` — new `IntakeTimelinePoint` + pure `buildIntakeTimeline()`
- `components/results/intake-timing.tsx` — the aria-hidden tick-timeline above the text
- `tests/timing/intake.test.ts` — +5 (order, furthest=100, in-range, field-preservation, sole-intake)
- NEW `tests/components/results/intake-timing-card.test.tsx` — +4 (text kept / now+labels / status colours / aria-hidden)

## Acceptance criteria

- [x] A `Now` anchor + one status-coloured tick per intake render, positioned by real
  calendar distance (`intake-timing-card.test.tsx`, `intake.test.ts`).
- [x] Furthest intake sits at 100%; offsets increase from `now`, always within 0–100.
- [x] No invented dates — positions derive only from existing `month`/`year`.
- [x] Existing nearest sentence + deadline notes + alternatives list unchanged.
- [x] Timeline is `aria-hidden`; the text list remains the accessible source of truth.
- [x] Goldens (scoring characterization) byte-identical — no scoring touched.

## Test plan / gate — PASSED

`npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing `build.mjs` warning) ·
full vitest **244 files / 1472 pass** (+9 new, was 1463 on master). Branch off master.

## Resume notes (cold-start)

Visual spacing (`mx-6`, `h-12`, tick/label sizes) is a judgment call made blind — the
results surface is Supabase-auth-gated, so it can't be browser-verified here; structure +
data-honesty are what the tests pin. Easy to nudge if the founder wants it tighter/looser.
MV-45 remains the umbrella for the rest: #15 outcome-funnel rail (coordinate with the
merged MV-39 self-report control on the same row) and the MV-68 global "where am I"
journey rail (its own brainstorm). Board state lives on this branch until merge; flip
`MV-72 → done` + `npm run board` on master after the founder merges the PR.
