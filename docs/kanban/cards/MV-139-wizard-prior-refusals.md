# MV-139 — Ask about prior visa refusals before predicting on them (F-1)

**Priority:** P1 · **Owner:** agent
**Merge:** _founder-gated_ (adds a funnel step + no-shame framing — the founder's call)
**Split from:** [MV-124](MV-124-audit-remainder-slices-2-9.md) **Slice 9** (audit F-1). Was
_founder-gated_ on a mechanism fork; the founder chose the full fix (see Decision below).

## The bug (verified live 2026-07-18)

The scoring engine penalises prior student-visa refusals — [visa.ts:66-69](../../../lib/scoring/visa.ts)
docks **−15** (one) / **−35** (multiple), enough to drop a verdict band — and the signed-in
profile editor collects them ([immigration-editor.tsx](../../../components/profile/editors/immigration-editor.tsx)).
**But the anonymous 9-step wizard never asked.** So a student with a past refusal got an
optimistic anonymous verdict, and only when they **voluntarily** declared the refusal in the
profile editor did a re-score silently drop their band. The app rewarded a rosy number and then
punished exactly the students honest enough to volunteer adverse information.

(The 2026-07-10 audit **misdiagnosed** the trigger as "sign-in"; `from-assessment.ts` never
populated `immigration`, so it actually fired on a voluntary editor visit. Confirmed by the
MV-124 verification pass; `lib/validation/profile.ts` had no `priorRefusals` key, so the
zod-strip risk was real.)

## Decision (founder + Codex, 2026-07-18)

Fork was **A: add a 10th wizard step** vs **B: disclosure-only**. Founder routed the tie-break to
Codex; Codex (gpt-5.6-sol, ultra) and the orchestrator **both independently picked A**, decisively
("trust is the product; a knowingly-optimistic verdict is the bait-and-switch the app exists to
replace; a refusal is required scoring input, collect it before showing any verdict"). Founder said
"yes start A". Two Codex refinements adopted: **place it last** (least funnel cost, framed as one
last honest detail) and **require an explicit tap** (never silently assume "none").

## Fix (shipped)

- **Schema:** `lib/validation/profile.ts` — `priorRefusals: z.enum(["none","one","multiple"]).optional()`.
  Closes the strip-risk: the validated `/api/assess` body IS the scored `StudentProfile` (enforced
  by the file's bidirectional assignability check), so the answer now reaches `scoreVisa`.
- **Wizard:** new **final** step `components/wizard/steps/refusals-step.tsx` (StepShell + OptionCard
  radiogroup, mirroring the goal step). Registered in `WIZARD_STEPS` (last), `STEP_COMPONENTS`, and
  `isStepComplete` (requires an explicit answer — no default in `DEFAULT_PROFILE`).
- **Claim-time symmetry:** `lib/profiles/from-assessment.ts` maps `priorRefusals → immigration.refusals`
  so the claimed profile editor reflects the student's real answer, not a blank/`none`.

## Acceptance criteria

- [x] The anonymous wizard asks about prior refusals as its final step, before results.
- [x] The answer survives `/api/assess` validation and lowers the anonymous verdict end-to-end
      (raw input → `ProfileSchema` → `scoreVisa`): `tests/scoring/prior-refusals-anonymous-path.test.ts`.
- [x] Explicit selection required — no silent "none" on the student's behalf (unit + live).
- [x] No-shame framing, no fear language ("Refusals are common and not a dead end…").
- [x] Claim-time symmetry: `from-assessment` carries the answer into `immigration`.
- [x] Gate green: typecheck 0 · lint 0 · **1979 tests / 302 files**.

## Evidence (2026-07-18)

- **TDD:** 6 tests red-first for the right reason (the anonymous path scored **79** with a refusal
  declared — penalty stripped — where it must be **44**; component file failed to resolve the
  not-yet-built `RefusalsStep`), then green. Existing wizard step-count tests (8→9 no-gap, 9→10 with
  gap) updated with justification, not mechanical rebaseline; the integration flow test now answers
  the new final step.
- **Live pass:** dev server compiled + served `/assess` 200 (Turbopack/SSR — jsdom-invisible); the
  step renders as "Step 9 of 9" with the question, no-shame copy, and three labelled radios; the
  "See where I stand" CTA is **disabled before selection and enabled after** (explicit-selection gate,
  proven live); no console errors. Pixel screenshot skipped — the capture tool was timing out in-env;
  layout reuses the already-shipped goal-step pattern verbatim.

## Resume notes

- Do NOT re-add a `priorRefusals` default to `DEFAULT_PROFILE` — the explicit-choice requirement is
  the honesty guarantee (Codex refinement). `isStepComplete("refusals", {})` must stay `false`.
- The scoring penalty already existed and is well-tested (`tests/scoring/visa.test.ts`); this slice
  only closed the *capture + strip* gap. Don't touch the magnitudes.
- MV-124 Slice 9 is now DONE via this card. Layer/wording is founder-owned — merge is founder-gated.
