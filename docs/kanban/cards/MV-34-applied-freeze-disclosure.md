# MV-34 — Disclose the "Applied" prediction-freeze + explain the triage states

**Column:** In review · **Priority:** P1 · **Owner:** agent · **Gate:** none (presentational copy)
**Created:** 2026-06-24
**Related:** [[MV-08]] (the outcome loop whose capture trigger this discloses), [[MV-33]] (the funnel that
consumes the frozen prediction). Evidence: product-review audit `wf_5fb5dfa7-009` (2026-06-24).

## Founder question (#2)

> "What's the purpose [of the Not saved / Shortlisted / Applied control]?"

The 3-state control (`components/matches/shortlist-button.tsx`) is fully wired end-to-end, and choosing
**"Applied"** is the MV-08 capture trigger: `/api/shortlist` → `captureApplication` →
`freezePredictionForProgram` **freezes an immutable prediction-of-record** (the verdict + rule version +
score snapshot) and opens an application attempt. The problem was trust, not wiring: the freeze happened
**silently** — the pills carried no helper text, so a tester clicking "Applied" as a casual status tag had
no idea their verdict was being snapshotted for a research/calibration loop. Hidden data capture on a
trust-first product (audit P1).

## Status — SHIPPED 2026-06-25

A single disclosure line now sits under the status pills (forewarning, before the click):

> "Marking Applied locks in this verdict so we can compare it against your real outcome."

- Honest and minimal: states what "Applied" does (locks in the verdict-of-record) and **why** (to compare
  against the student's real result later). Banded verdict only ("this verdict" = Strong/Possible/Reach) —
  no raw %. Forewarning placement means the student knows *before* the irreversible-ish snapshot, not after.
- Implementation: `ShortlistButton` wraps the pill `role="group"` + the caption in a `flex-col items-end`
  block — contained entirely within the component, so `program-card.tsx` is untouched (surgical). The inner
  group keeps `aria-label="Application status"`, so the existing button-role queries are unaffected.
- Evidence: TDD RED→GREEN. `tests/components/matches/shortlist-button.test.tsx` (+1): asserts the disclosure
  (`/locks in this verdict/i`) renders. Gate green: typecheck clean · lint clean (only the pre-existing
  board-generator warning) · full suite **1326** (was 1323). No scorer path; goldens N/A.

## Acceptance criteria

- [x] The "Applied" control discloses that marking Applied freezes the verdict-of-record, and why.
- [x] Banded verdict only; no raw percentage; TDD RED→GREEN; full suite green.

## Deferred (noted, not in this slice)

- **Triage-state helper for Shortlisted vs Applied** (the "explain each state" half): the audit also flagged
  that "Shortlisted = private save" vs "Applied = submitted + locked" isn't spelled out. The shipped line
  covers the load-bearing trust gap (the silent freeze); a fuller two-line state explainer is a small
  follow-on if the founder wants it.
- **Revert-to-"Not saved" orphans the frozen prediction** (audit P2): flipping back deletes only
  `user_program_state` (`app/api/shortlist/route.ts:32-34`); the frozen prediction/attempt persists, so the
  "undo" is not clean. That is intended (the moat keeps the prediction immutable by design) — but the UI
  implies a clean undo. Out of scope here; flag for an MV-08 follow-up if the founder wants the revert path
  to either warn or be blocked once "Applied."
- **`withdrawn` is a dead enum branch** in this UI path (audit P3) — the control only exposes
  Not saved / Shortlisted / Applied. Harmless; noted.

## Resume notes (cold agent)

- The freeze chain: `shortlist-button.tsx` → `POST /api/shortlist` → `captureApplication`
  (`lib/outcomes/on-apply.ts`) → `freezePredictionForProgram` (`lib/outcomes/freeze.ts`).
- Disclosure copy lives in `components/matches/shortlist-button.tsx` (the caption `<p>` under the pill group).
