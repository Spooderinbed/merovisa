# MV-69 — Document-readiness rollup ("X of Y required → ready to apply")

**Priority:** P1 · **Owner:** agent · **Branch:** `mv-69-readiness-rollup` (off master)

## Why (student outcome)

The MV-68 ground-truth audit found the document-readiness loop is the one genuine
journey gap: a student can upload/mark every document and the product gives them **no
signal they're actually ready to apply**. Three isolated per-item "done" signals exist
with **no rollup**, and MV-53's `/checklist/all` `document_status` toggle is a dead-end
branch (`listObtainedKinds` has exactly one caller — its own checkboxes; ticking
everything there changes nothing else). "Am I ready to apply?" is precisely the
reassurance a consultancy sells — so closing it is the highest-value
consultancy-replacement move. (Audit: `docs/audits/2026-06-27-mv68-ground-truth-audit.md`.)

## Scope (Codex gpt-5.5/xhigh cross-checked — all three calls confirmed)

1. **`lib/checklist/readiness.ts` — pure `computeReadiness(items, planStates)`** →
   `{ now: {ready,total}, afterOffer: {ready,total}, readyToApplyNow }`.
   **Counting rule (honest):** an item counts toward `total` iff `requirement === "required"`
   **and** it is *completable* — vault-bound (`kind !== null`; done when `status` is `have`
   **or** `obtained`) **or** plan-mirrored (`kind === null` && key in `CHECKLIST_PLAN_LINKS`;
   done when `planStates[key] === "done"`). **Pure-info rows are excluded** (no completion
   signal — e.g. `fin-nrb-remittance`, `ielts-centres`, `ahpra`), so the denominator can never
   include something a student can't finish. Stage-scoped (`now` vs `after-offer`) so the
   headline never counts offer-dependent docs (CoE/OSHC/medical) a student can't have yet.
   `readyToApplyNow = now.total > 0 && now.ready === now.total`. `recommended` items are NOT
   in the rollup.

2. **Reconnect the dead `document_status` branch.** Thread `obtainedKinds` into
   `generateChecklist`. New vault status **`"obtained"`** (upload-or-obtained is a *union* —
   "I have this document, by file or self-report" — one possession authority, not competing
   signals). `statusFor`: `kind===null → info`; `uploaded → have`; `obtained → obtained`;
   else `missing`. **Distinct row label** ("Marked obtained" vs "Have") so self-report never
   masquerades as uploaded/verified evidence — Codex's single biggest risk. The `/checklist/all`
   toggle now finally affects per-program rows + the rollup.

3. **Surfaces (checklist only; dashboard deferred — Codex confirmed).**
   - Per-stage "X of Y ready" beside each section heading (only when `total > 0`).
   - Honest header line when `readyToApplyNow`: "You've gathered everything you can prepare
     now — you're ready to start applying." **Never** claims full visa-readiness (after-offer
     items remain).
   - Dashboard per-program readiness tile **deferred to a follow-up** (the dashboard doesn't
     resolve a single primary program; keep its raw upload count). Documents-vault tile also
     deferred (no obvious denominator there).

## Files

- NEW `lib/checklist/readiness.ts` + `tests/checklist/readiness.test.ts`
- `lib/checklist/generator.ts` — `statusFor` + `ChecklistInputs.obtainedKinds?` (optional, default ∅ → backward-compatible)
- `lib/checklist/types.ts` — `ChecklistStatus` gains `"obtained"`
- `components/checklist/checklist-item.tsx` — "Marked obtained" chip + ✓
- `components/checklist/checklist-stage-section.tsx` + `checklist-view.tsx` — section counts + ready-to-apply line
- `app/(app)/checklist/[programId]/page.tsx` — fetch `listObtainedKinds`, pass to generator + view
- tests: `generator.test.ts` (obtained), `checklist-view.test.tsx` (counts + ready line), `tests/app/checklist-program-page.test.tsx` (obtained wiring)

## Acceptance criteria

- [x] `computeReadiness` counts required+completable only, stage-scoped, pure-info excluded; vault counts `have`+`obtained`; plan-mirror counts `done`. Unit-tested incl. the `fin-nrb-remittance` (required-but-uncompletable) exclusion (`tests/checklist/readiness.test.ts`, 7 cases).
- [x] Marking a kind obtained on `/checklist/all` flips its per-program row to "Marked obtained" (distinct from uploaded "Have") and counts toward readiness (`generator.test.ts`, `checklist-item.test.tsx`, `checklist-program-page.test.tsx`).
- [x] Section shows "X of Y ready"; header shows the honest ready-to-apply line only when all now-stage required completable items are done; never over-claims visa-readiness (`checklist-view.test.tsx`, 4 cases).
- [x] Existing generator/view/page tests stay green (obtained is opt-in, default ∅).
- [x] Goldens (scoring characterization) byte-identical — no scoring touched.

## Test plan / gate — PASSED

`npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing build.mjs warning) · full vitest **243 files / 1463 tests pass** (+14 new). Commit on branch `mv-69-readiness-rollup`.

## Resume notes (cold-start)

Branch off master `9fb6321`. The three signals: upload→`statusFor` `have`; plan-mirror→`planStatesForChecklist`/`plan-links.ts`; global→`status-repo.ts listObtainedKinds`. Reconnect = give `statusFor` the obtained set → new `"obtained"` status. Readiness reads `status` + `planStates` (single source). Surfaces ride the existing now/after-offer `ChecklistStageSection` split. Board lives on this branch until merge (master shows MV-69 elsewhere); resolve board conflict at merge per the stacked-PR recipe if PR #17 lands first.
