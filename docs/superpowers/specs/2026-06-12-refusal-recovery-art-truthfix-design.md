# Refusal/recovery ART truth-fix — design spec

**Date:** 2026-06-12
**Status:** APPROVED by user 2026-06-12 with two copy tweaks ("without holding an oral hearing"; "about half" not "only about half"). Trust-maintenance slice ④·1 — prioritized ahead of new product slices because it corrects already-shipped recovery copy. Evidence basis: `docs/audits/2026-06-10-pending-ledger-cluster-triage.md` (the in-force 2026-06-01 paper-only ART change "materially affects shipped recovery copy").
**Findings:** 3 gov-backed, `ready`-triaged category-I findings flip pending→used — I.051 (paper-only change), I.050 (non-extendable deadline), I.048 (realistic timing). The broader ART-logistics findings (I.049, I.052–I.056, I.062) stay **pending**.

## Problem

The refusal/recovery panel's "If you're refused" section ships a recovery picture that is now **incomplete in two ways that matter for trust**:

1. **The process changed and we don't say so.** As of **1 June 2026** (in force), the Administrative Review Tribunal decides most student-visa refusal reviews **on the papers, without holding an oral hearing** (finding I.051, already sourced and `ready`). Our `recovery-review` row still says only "you can ask the ART to review the decision" — true, but a refused student reading it would expect the old hearing process.
2. **"You can appeal" reads rosier than reality.** We omit that review is bound by a **strict, non-extendable deadline** (I.050) and that it is **slow** — about half of student refusal reviews take ~19 months (I.048). An honest recovery section says what appealing actually costs in time and what you can't undo by missing a deadline.

This is a truth correction to already-shipped copy, gov-sourced, prioritized ahead of new panels.

## Decisions

1. **Data-only correction** to `lib/data/source/nepal-refusal-recovery.ts` — no component, scoring, golden, or analytics change. The panel (`components/results/refusal-recovery.tsx`) already maps recovery-path rows generically by `kind`, so new rows render with no component edit.
2. **Reword `recovery-review`** (the existing Tribunal-review row) to fold in the paper-only change, `findingRefs: ["I.044", "I.051"]`. Switch its displayed `source` from the generic immi review page to the **ART change notice** (I.051's source) so the striking "decided on the papers since 1 June 2026" claim is verifiable in one click (the product's "every claim one click from origin" principle). This orphans the `IMMI_REVIEW` const → **remove it**; I.044's immi review page rides in `findingRefs` + the row `note`.
3. **Two new recovery-path rows:**
   - `recovery-deadline` (I.050) — the non-extendable deadline; source `ART_IMMIGRATION` (the existing const, already used by `recovery-cost`).
   - `recovery-timeline` (I.048) — the realistic ~19-month timing; source a new `ART_PROCESSING` const (I.048's processing-times page).
4. **Section order becomes** review → deadline → timeline → cost → hardship → ministerial — the process/timing truth grouped first, then money, then the limited last resort.
5. **Findings accounting:** I.051, I.050, I.048 flip pending→used (FLIP_STATUS), triage cleared in the same change, `value_status:"prose-only"` set **before** the flip (the "19 months" renders as narrative, not a reconciled `value`). Ledger: used 482→485, pending 632→629. No structured values, so no `VALUE_DRIFT` surface.
6. **Test:** add copy-lock assertions to `tests/components/refusal-recovery.test.tsx` for the paper-only line, the deadline line, and the timing line. Every existing assertion (section headings, HE/VET emphasis + guard, AUD 3,580, "not a normal appeal path", scam line, the four source links, disclaimer) is untouched and still passes.

## Rendered copy (the review surface)

The "If you're refused" section, in render order (changed/new rows in **bold**; unchanged rows shown for context):

| Row id | Summary (rendered) | findingRefs | Link → source |
|---|---|---|---|
| **`recovery-review`** *(reworded)* | **If you're refused, you can ask the Administrative Review Tribunal to review the decision — but since 1 June 2026 it decides most student-visa refusal reviews on the papers, without holding an oral hearing.** | I.044, I.051 | Tribunal review → `art.gov.au/.../changes-conduct-student-visa-reviews` |
| **`recovery-deadline`** *(new)* | **The deadline to apply for review is strict — the Tribunal has no power to extend it.** | I.050 | Review deadline → `art.gov.au/applying-review/immigration-and-citizenship` |
| **`recovery-timeline`** *(new)* | **Be ready to wait — about half of student refusal reviews finish within 19 months of applying.** | I.048 | Review timing → `art.gov.au/about-us/accountability-and-reporting/processing-times` |
| `recovery-cost` *(unchanged)* | The review has a fee — AUD 3,580 for most migration decisions. | I.045 | Review fee → art.gov.au |
| `recovery-hardship` *(unchanged)* | A 50% reduction may apply on financial-hardship grounds. | I.046 | Hardship reduction → art.gov.au |
| `recovery-ministerial` *(unchanged)* | Ministerial intervention exists, but it is not a normal appeal path — it is a limited, conditional last resort. | I.057, I.059, I.060 | Ministerial intervention → immi |

**Copy-locked rows (verbatim component-test pins — the trust-sensitive lines):** the reworded `recovery-review`, `recovery-deadline`, and `recovery-timeline` lines.

**URL constants:** ADD `ART_CHANGES` (`https://www.art.gov.au/about/news-and-updates/changes-conduct-student-visa-reviews`) and `ART_PROCESSING` (`https://www.art.gov.au/about-us/accountability-and-reporting/processing-times`); REMOVE `IMMI_REVIEW` (orphaned once `recovery-review` switches source). `ART_IMMIGRATION` (`https://www.art.gov.au/applying-review/immigration-and-citizenship`) is reused for `recovery-deadline`.

## Out of scope

The broader recovery extension (stays pending): I.049 (95% within 2 years), I.052 (pre-1-June hearing carve-out), I.053/054/055 (possible outcomes — affirm / set aside / remit), I.056 (decision-letter tells you your review rights), I.062 (FOI on tribunal-initiated MI). The AUD 3,580 fee (I.045) is current as of 2026-06-05; its 1 July indexation risk is **Phase 3 freshness** (slice ④·2), not this fix. No checklist/plan touchpoint (recovery is informational, not a task). No new analytics surface (the `"refusal-recovery"` surface already exists).

## Acceptance criteria (tests)

1. Registry walk green: schema validates, every findingRef resolves to a `used` finding (I.044 already used; I.048/I.050/I.051 newly used), reconcile passes; `golden-assessments.json` byte-identical (no scorer reads this module).
2. FLIP_STATUS flips exactly I.048, I.050, I.051 pending→used with triage cleared and `value_status:"prose-only"` (findings-integrity green, no `USED_UNSET`); I.044 untouched (already used); the out-of-scope I.* rows remain pending with triage intact.
3. `recovery-review` renders the reworded paper-only line and links to the ART change notice; `recovery-deadline` and `recovery-timeline` render in the "If you're refused" section; the three lines are copy-locked verbatim by the component test.
4. No component/scoring/golden/analytics churn: `refusal-recovery.tsx` unchanged, no `events.ts` change, no golden regeneration; the `IMMI_REVIEW` const is gone with no remaining references.
5. Full gate: typecheck + lint + suite green; panel browser-verified on the anonymous results page (the reworded row + two new rows render in the recovery section, clean console).
