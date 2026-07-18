# MV-124 — 2026-07-10 audit: slices 2-9 (tracking card)

**Priority:** P1 · **Owner:** agent
**Source of truth for the work:** `docs/audits/2026-07-10-comprehensive/VERIFIED-BUILD-ORDER.md`
**Source of truth for the findings:** `docs/audits/2026-07-10-comprehensive/REPORT.md`

## What this is

An umbrella so the audit's remaining 8 slices are TRACKED rather than living in an agent's context
window. Slice 1 shipped as MV-120 (PR #81). **Split a real card off this one when a slice starts** —
do not build straight from this card.

The build order was produced 2026-07-17 by a 21-agent verification workflow run against the live
tree (verify -> adversarial recheck -> synthesize): all 10 findings re-verified STILL_LIVE at high
confidence, 0 already fixed, 0 refuted.

| Slice | Closes | What | Status |
|---|---|---|---|
| 1 | C-3 | Budget means tuition **plus** living costs | **DONE** - MV-120, PR #81 |
| 2 | F-3 | Score the English band we actually claim | **DONE** - folded into MV-129 (C-7 sibling); verified 2026-07-18 |
| 3 | C-8 | Never destroy a document before validating its replacement | **DONE** - MV-141 |
| 4 | C-10, C-5 | A match card's reasons must all be true | **DONE** - MV-140 |
| 5 | C-4 Layer B | Unknown is not zero | open |
| 6 | F-19 | Closed application windows read as closed | **DONE** - MV-142 (Parts 2+3; Part 1 `reverifyBy` founder-gated) |
| 7 | C-1c | The trust page describes the system we built | open - **founder-gated**, see MV-122 |
| 8 | C-6 | Accuracy meter stops promising a ladder that doesn't exist | open - **founder-gated** |
| 9 | F-1 | Ask about prior refusals before predicting on them | **DONE** - MV-139 (founder chose the full fix) |

## ⚠️ Read before building ANY slice: the audit prose is wrong in places

The verification pass found the report overstates, understates, or misdiagnoses several findings.
**Following the report literally produces a WRONG fix.** These corrections are the most valuable
artifact of the verification and are recorded here so they outlive MV-120's dossier:

- **C-5 is OVERSTATED.** Only the MATCHER frames bank seasoning as a rule. The plan and checklist
  already use recommendation voice, which `docs/research/2026-06-12-nepal-ssvf-financial-scrutiny.md:36`
  says to **KEEP PERMANENTLY**. Following the audit would delete correct content.
- **C-10 is UNDERSTATED.** Off-field cards carry **no field reason at all** (`compute.ts:161-182`
  has only primary-match and also-considering branches). **5 of 12 wizard fields have zero programs**
  (law, arts, hospitality, agriculture, other): a law student gets 60 programs, all strong, zero law.
  `computeMatches` has **3 callers**, not 1: `app/(app)/matches/page.tsx:59`,
  `lib/results/assemble.ts:39` (anonymous), `lib/plan/invalidate.ts:36`.
  `components/wizard/field-step.tsx` **does not exist** - it is `steps/field-of-study-step.tsx`.
- **C-4 is UNDER-SCOPED.** `lib/outcomes/freeze.ts:53-56` freezes a prediction with **zero guard**.
- **F-1's trigger is MISDIAGNOSED.** Sign-in alone does NOT drop the band -
  `lib/profiles/from-assessment.ts:22-102` never populates `out.immigration`. It fires on a
  voluntary profile-editor visit. `lib/validation/profile.ts` has no `priorRefusals` key (so the
  zod-strip leg IS real).
- **C-1/C-2 delete-ordering is CORRECT, not a bug** (`route.ts:49-63,66-69,73,85`, `failedSteps`
  check at `:76-82`). Do not "fix" it. Slice 3 is about the *validate-before-destroy* ordering, not
  this.
- **C-6 is REFRAMED**: not arithmetic. The design spec
  (`docs/superpowers/specs/2026-06-02-onboarding-mvp-design.md:211`) specifies "accuracy: Basic";
  Verified/Complete are dead thresholds for unbuilt capability. **Product call, not a fix.**
- **NEW C-1c, which the audit missed** - see MV-122.

## Sequencing note

`lib/matches/compute.ts` is touched by four findings (C-3, C-4 Layer B, C-10, C-5). Their regions
are disjoint (73-151 vs 153-182) so they can run in parallel after MV-120 lands, **but they must not
be one PR**. C-4 Layer B collides head-on with lines 73-99 — do not bundle it with C-3.
