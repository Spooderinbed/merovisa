# MV-97 — Wizard funnel overhaul (CGPA · AUD · motion)

**Priority:** P1   **Owner:** agent
**Goal:** Close the highest-friction wizard gaps (no CGPA entry, USD-only budget, flat transitions) so fewer Nepal→AU students bounce mid-funnel.

## Context links
- Umbrella: MV-87 (Elevated-calm overhaul) · spec `docs/design/2026-07-03-elevated-calm-overhaul-spec.md`
- Motion v2 ADR `docs/design/2026-07-03-motion-v2-adr.md` (opacity/transform only; slide keyframes added here as the first real consumer)
- PR [#52](https://github.com/Spooderinbed/merovisa/pull/52) (base `design-stack`)

## Acceptance criteria
- [x] Step 3 offers Percentage ⇄ GPA/4.0; switching converts the grade across scales; honest `≈ N% equivalent` caption; scale-aware slider (cgpa-4 = 2–4).
- [x] Step 7 offers NPR ⇄ AUD (no USD); live `≈ A$` conversion from the single fx-rates source; `NPR 90 ≈ A$1` caption; persisted-USD sessions migrate to NPR.
- [x] English step shows live IELTS equivalent for PTE/TOEFL + provisional-6.0 note.
- [x] Graduation-year step previews the gap; direction-aware slide between steps; recap assembles word-by-word; reduced-motion safe; no "analyzing" text.

## Test plan / evidence
- +16 tests: `tests/wizard/steps/{education,graduation-year,english}-step.test.tsx`, `tests/wizard/budget-step.test.tsx`, `tests/wizard/use-wizard-state.test.ts`, `tests/assess/profile-recap*.test.*`.
- Gate: `tsc` clean; suite **1661 pass / 1 fail** (pre-existing MV-80 FY2026-27 freshness timer). Commit `3b02874`.

## Dependencies
- Stacked on design PRs #44–#51 (base `design-stack`). Merge to master after those.

## Deferred (own slices)
- Step-4 multi-subject (single-select enum → array: Zod/scoring/matches/persistence/profile-bridge).
- Matches-page progressive disclosure + hierarchy rework.
- Footer-first CLS + perf (root-caused: layout-sibling footer over a min-height-less streaming `<main>` + short loading skeletons + duplicate auth round-trips).

## Agent resume notes
Slice shipped + In Review on PR #52. Next: pick one deferred slice above (recommend footer/CLS — smallest, whole-app win) or step-4 multi-subject (biggest student ask, needs a design pass first).
