# MV-23 — Plan vs Checklist mental-model copy

**Column:** In review · **Priority:** P3 · **Owner:** founder+agent · **Gate:** none for part (1)
**Created:** 2026-06-22
**Related:** 2026-06-18 audit Q14; reconciliation `wf_4b1a3438-b21`; [[MV-22]] (sibling residual).

## Why

The per-program **checklist** and the **plan** generator both carry the same AU visa-prep
steps (NOC, biometrics, police cert, GS, translations, agent MARN), with **no stated mental
model** — so a user sees what looks like the same actions on two screens and can't tell why.
The worst failure mode (acting twice) is already mitigated: the checklist's step rows mirror
their plan item's state via `plan-links` ("the plan is the single completion authority",
`app/(app)/checklist/[programId]/page.tsx:42`). What's missing is the *framing* that tells the
user which screen is which.

## Scope — two halves (this card ships only part 1)

1. **AGENT-OWNABLE (this slice):** add a user-facing mental-model statement on the checklist +
   plan surfaces — **Checklist = read-only per-program requirement reference; Plan = your action
   queue.** Presentational copy only.
2. **FOUNDER CALL (NOT in this slice):** strip the mirrored visa-prep rows from
   `lib/checklist/generator.ts` so they live only in the plan, OR keep the current plan-links
   completion-mirror. **Do not silently make the strip-vs-keep product judgment** — leave
   `lib/checklist/generator.ts` untouched.

Part (1) alone is a defensible partial close. Card stays open (founder-owned) for part (2).

## Placement decision (verified against current code)

- **Checklist surface →** `components/checklist/checklist-view.tsx` header (the per-program view
  where the steps that mirror the plan actually render). NOT the checklist landing
  (`checklist-landing.tsx`) — it's a program-picker with no steps, and already frames "each
  program has its own checklist". Left untouched to stay surgical.
- **Plan surface →** `components/plan/plan-list.tsx` (the tested presentational component rendered
  on `/plan`). The plan *page* (`app/(app)/plan/page.tsx`) is an async server component with no
  unit tests in this repo, so the framing lives in `PlanList` — which renders directly above the
  action sections, exactly where the framing helps. Page header left as-is.

## Copy (sentence case, calm authority; distinct + cross-referential per [[copy-precision-in-generators]])

- **ChecklistView:** "This checklist is your reference for everything this program requires. You
  work through and tick off these steps in your plan — your single action queue."
- **PlanList:** "This is your action queue — the one place to work through every step. Each
  program's checklist is the full requirement reference behind it." (renders in both the empty and
  populated states.)

## Build order (TDD)

1. RED: `tests/checklist/checklist-view.test.tsx` — assert the reference/plan framing renders.
   `tests/components/plan/plan-list.test.tsx` — assert the action-queue/reference framing renders
   (incl. one case asserting it shows when the plan is empty). Watch both fail.
2. GREEN: add the `<p>` to `ChecklistView`'s header; add the framing `<p>` to `PlanList` (top of
   tree, both branches). Minimal.
3. Confirm: presentational only → `golden-assessments.json` byte-identical; `lib/checklist/generator.ts`
   untouched.

## Acceptance criteria

- [x] The per-program checklist view states it's the requirement reference and points to the plan
      as the action queue.
- [x] The plan view states it's the action queue and points to the checklist as the requirement
      reference; framing shows even when the plan is empty.
- [x] TDD: failing test first, then green, on both surfaces.
- [x] Gate green: `typecheck` + `lint` + full `test`. Goldens byte-identical. `lib/checklist/generator.ts`
      NOT modified (part 2 is the founder's call).

## What shipped (part 1 only)

- **`components/checklist/checklist-view.tsx`** — a framing `<p>` in the per-program header (after
  the program-name `<h1>`): "This checklist is your reference for everything this program requires.
  You work through and tick off these steps in your plan — your single action queue."
- **`components/plan/plan-list.tsx`** — a framing `<p>` (shared `intro` const so it renders in both
  the empty and populated states): "This is your action queue — the one place to work through every
  step. Each program's checklist is the full requirement reference behind it." The empty branch is
  wrapped (`gap-4`) so the framing sits above the "All caught up" card.
- **`tests/checklist/checklist-view.test.tsx`** (+1) and **`tests/components/plan/plan-list.test.tsx`**
  (+2, incl. the empty-plan case).

## Test evidence (TDD, RED→GREEN)

- **RED:** all 3 new tests failed with "Unable to find an element with the text" — framing copy
  missing, not a typo (the 7 existing tests still passed). 3 failed / 7 passed across the 2 files.
- **GREEN:** copy added → **10/10** on the 2 files.
- **Gate:** `npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing unrelated `build.mjs`
  warning) · full suite **1279 passed (220 files)** (was 1276) · `git diff` on `golden-assessments.json`
  **empty** · `lib/checklist/generator.ts` **not modified**.

## Status

**In review** — part (1) shipped TDD, gate green, goldens byte-identical, presentational only. The
card stays open (founder-owned) for **part (2)**: the strip-vs-keep product decision on the mirrored
visa-prep rows in `lib/checklist/generator.ts`. On the founder's call, either strip (then re-derive
the checklist + re-verify the plan-links mirror) or keep — and close to Done.

## Resume notes (cold agent)

- This is part (1) ONLY. Do not strip checklist rows — that's the founder's product decision (part 2).
- Copy lives in two tested presentational components (`checklist-view.tsx`, `plan-list.tsx`); no
  server-component or generator changes.
- Never stage the WIP trio; explicit `git add` paths only. Commit straight to master.
