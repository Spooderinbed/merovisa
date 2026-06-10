# Next-step unification — design spec

**Date:** 2026-06-10
**Fix order:** #2 (of the 10-item order in `docs/audits/2026-06-10-visual-audit-and-fix-order.md`)
**Status:** approved model (user decision 2026-06-10: "two kinds + waiting state"); implementation plan to follow.

## Problem

The dashboard NEXT STEP panel computes its own state instead of reading the plan. Reproduced during the 2026-06-10 audit: after uploading a document, the dashboard says **"All caught up — refresh your assessment whenever your profile changes"** while the plan page still shows **3 open high-impact items**. "Refresh your assessment" also names a control that exists nowhere in the product.

MyVisa's core promise is "what should I do next?". Two surfaces disagreeing about that breaks trust even when the underlying data is right.

## User decision (2026-06-10)

Plan items get an explicit completion model — **two kinds plus a waiting state**:

1. **System-verified items** — completion is computed from observed account state (a document upload exists, the shortlist has entries, a profile field is filled). No Done button; the user cannot toggle them. If the observed state regresses (e.g. the upload is deleted), the item reopens. An open verified item's CTA deep-links to the surface that completes it (e.g. /documents).
2. **Self-reported items** — things the system cannot observe (get your NOC, book biometrics). The existing Done / Dismiss / Undo mechanism stays their completion authority.
3. **Waiting ("in progress")** — any self-reported item can be marked in progress. They leave next-step selection but stay visibly open on the plan with an "In progress" badge. (Implementation note, 2026-06-10: originally scoped to items "flagged long-running", but classification showed nearly every self-reported kind is an external wait — NOC, police certificate, health exam, remittance, passport, bank seasoning — so the flag added maintenance without behavioral difference. Verified items never get the toggle.)

Trust edge case, intentional: if a user previously marked Done something that is now a verified item, and the observed state does not exist, the item shows as open. Computed truth wins over self-report for verified items.

## The single brain

One selector function, used by every surface that answers "what's next":

- **Open** = not completed (per its kind) and not dismissed.
- **Actionable** = open and not in the waiting state.
- **Next step** = the top actionable item in the plan's existing priority order.
- **"All caught up" may render only at zero open items.** All-waiting is its own state, never "caught up".

The dashboard NEXT STEP panel must consume this selector against the same plan the /plan page renders — it must not own any independent state logic.

## Surfaces and pinned copy

Sentence case throughout; calm, no urgency theatrics.

**Dashboard NEXT STEP panel**
- Normal: the top actionable item — its title, its existing why-it-matters line, CTA to the item's action surface (verified items) or to the plan (self-reported).
- All waiting (open > 0, actionable = 0): title **"Everything is underway"**, body **"All {n} remaining plan items are marked in progress. Check your plan if anything has changed."**, CTA **"Open your plan →"**.
- Zero open: title **"All caught up"**, body **"Nothing on your plan needs action right now. We'll surface the next step here when something changes."** No CTA naming a nonexistent control; link **"See your plan →"** is allowed.

**Plan page rows (engine-level only — visual polish is fix #4)**
- Verified, complete: no Done button; a checked state labelled **"Verified from your account"**.
- Verified, open: no Done button; CTA to the completing surface.
- Self-reported: Done button as today.
- Self-reported, long-running: additional toggle **"Mark as in progress"**; while waiting, an **"In progress"** badge and the Done button remain; undo via **"Back to open"**.

**Folded in from fix #8:** the next-step panel's "Add details →" CTA currently renders `color: rgb(252,253,251)` on an identical background in the dark panel (invisible). Fix the token while rebuilding the panel.

## Persistence

- Waiting state joins the existing per-item state persistence (same mechanism as done/dismissed; exact column/value per the implementation plan once internals are mapped).
- Verified items consult no stored completion — computed at read time.
- Item templates declare `completion: "verified" | "self-reported"` and a long-running marker; declarations live with the plan item definitions, not in the database.

## Out of scope

- #4 plan polish (honest impact claims, Done vs Dismissed visuals, section counts) — builds on this model, separate slice.
- #5 checklist STEP completion — extends this model to the checklist, separate slice.
- Any scoring change. Goldens stay byte-identical.

## Acceptance criteria (tests)

1. The dashboard next-step output equals the plan's top open actionable item — selector unit tests plus a component test on the panel.
2. Audit repro inverted: with open plan items present, the dashboard never renders "All caught up".
3. All-waiting renders "Everything is underway" with the open count, not "All caught up".
4. Zero open items renders the new "All caught up" copy; the phantom "refresh your assessment" string is gone from the codebase.
5. Verified item with observed state present reports complete with no Done control; removing the observed state reopens it.
6. Marking a long-running item in progress removes it from next-step selection and keeps it open on the plan; undo restores it.
7. The dark-panel CTA uses a visible token (class-level assertion).
