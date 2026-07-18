# MV-71 — Progression visual #28b: checklist-stage tag on PlanItemCard

**Priority:** P1 · **Owner:** agent · **Branch:** `mv-71-plan-checklist-stage-tag` (off master)

First sub-slice carved out of the over-scoped **MV-45** (founder picked #28).

## Why (student outcome)

Design-division audit **#28** — *"Checklist↔Plan relationship asserted in copy, never
shown"* — has two halves. Half (a), a mono planState chip on each `ChecklistItem`,
**already ships** (`checklist-item.tsx` `PLAN_CHIP` + "Track in your plan →", from the
MV-23 thread): the checklist already points *into* the plan. Half (b), the reverse —
the plan pointing *back* to the checklist — was missing, so a student in their plan
couldn't see which actions are checklist requirements or when they fall due. This slice
builds (b), closing the bidirectional loop. Orientation = one less reason to ask a
consultancy "is this thing in my plan actually required, and when?"

## Scope

A quiet mono tag — **`Checklist · Now` / `Checklist · After offer`** — on every
`PlanItemCard` whose `kind` mirrors a checklist requirement. It is a *classification*,
not a live state, so it shows on open **and** closed cards, placed beside `ImpactPill`
(before the In progress / Done / Dismissed state pills). Vocabulary matches the
checklist section headings ("What you need now" / "After your offer") — **no new terms**
(audit constraint). Flat `statePill` styling — no new decoration.

**Stages are mixed**, so the tag is genuinely informative:
- *Now*: `verify-agent-marn`, `certify-sponsor-income`, `translate-certify-documents`
- *After offer*: `apply-for-noc`, `prepare-biometrics`, `prepare-police-certificate`, `prepare-gs-answers`

### Single source of truth (no drift)

The reverse lookup `checklistStageForPlanKind(planKind)` lives in
`lib/checklist/plan-links.ts` (the module that already owns `CHECKLIST_PLAN_LINKS`),
backed by a small static `PLAN_KIND_CHECKLIST_STAGE` map. The **generator stays the one
source of stage truth**: a drift-guard test generates a real checklist and asserts each
linked key's emitted `stage` equals `checklistStageForPlanKind(planKind)` — so changing a
stage in the generator (or forgetting a map entry) fails the suite.

## Files

- `lib/checklist/plan-links.ts` — `PLAN_KIND_CHECKLIST_STAGE` + `checklistStageForPlanKind()`
- `components/plan/plan-item-card.tsx` — the mono stage tag in the header pill row
- `tests/checklist/plan-links.test.ts` — +3 (helper now/after-offer/null + the drift guard)
- NEW `tests/plan/plan-item-card.test.tsx` — +4 (after-offer / now / no-tag / tag-survives-done)

## Acceptance criteria

- [x] Plan cards mirroring a checklist requirement show `Checklist · Now` or
  `Checklist · After offer`; unlinked actions show no tag (`plan-item-card.test.tsx`).
- [x] The tag survives a closed (done) card — it is a classification, not a state.
- [x] `checklistStageForPlanKind` returns the right stage / null, and **cannot drift** from
  the generator (drift-guard test in `plan-links.test.ts`).
- [x] No new vocabulary; flat mono pill in the existing calm-authority language.
- [x] Goldens (scoring characterization) byte-identical — no scoring touched.

## Test plan / gate — PASSED

`npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing `build.mjs` warning) ·
full vitest **244 files / 1470 pass** (+7 new, was 1463 on master). Branch off master `25b9cd7`.

## Resume notes (cold-start)

The chip-on-ChecklistItem half of #28 is already done — do **not** rebuild it. MV-45
remains the umbrella for the rest: #15 outcome-funnel rail (coordinate with the merged
MV-39 self-report control on the same row), #16 intake tick-timeline, and the MV-68
global "where am I" journey rail (its own brainstorm). Board state lives on this branch
until merge; flip `MV-71 → done` + `npm run board` on master after the founder merges the PR.
