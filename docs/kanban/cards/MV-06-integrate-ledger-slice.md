# MV-06 — Integrate ledger slice E/I

**Status:** In progress (kickoff/scoping). **Owner:** agent · **Priority:** P2.
**Gate:** none to start scoping; a founder steer is needed on *which* findings to surface
before integration (see Open steer below).

## What this card is

The research ledger holds ~1,118 findings (516 used / 594 pending / 8 rejected). ~195 are
**"ready"** (integration-only — already sourced + reconciled, no new sourcing needed). This
card integrates the high-value **Category E** (program/policy: IELTS/duration, fee/threshold —
feeds scoring *and* program-card copy) and **Category I** (Genuine Student) ready findings into
the live app, so verdict/cost/recommendation copy reflects current sourced facts.

Tooling: `node docs/research-briefs/_tools/reconcile.js` + the FLIP_STATUS/goldens ritual (per
the ledger-slice lane). Integration that feeds the engine path bumps RULE_VERSION + regenerates
`golden-assessments.json` deliberately; copy-only integration leaves goldens byte-identical.

## ⚠️ Premise correction (from MV-09 recon, 2026-06-19)

The forward plan (§2) flagged Category E as the "non-negotiable exception" because of two live
figures — visa fee `710→1,600` and financial capacity `24,505→29,710`. **MV-09 recon already
disproved the urgency:** the app's visa fee is already **AUD 2,000** (`lib/data/policy/au-visa-fees.ts:20`)
and capacity already **AUD 29,710** (`lib/data/policy/au-cost-of-living.ts:26`), both
`lastVerified 2026-06-07`. So the *correctness* part of slice E is **already done** — this card
is now the **copy-heavy, non-urgent** remainder: surfacing the rest of the ready E/I findings.

## Open steer (founder)

Now that the headline E figures are confirmed current, the real question is **which of the ~195
ready findings carry enough user value to integrate vs. stay deferred** (trust-first ≠ integrate
every note). First scoping step (post-compact): run reconcile.js, list the E/I "ready" findings,
and bring the founder a tight "surface these N, defer the rest (with reason)" packet — not a
blind integration of all 195.

## Acceptance criteria (to be firmed during scoping)

- [ ] Reconcile.js run; E/I "ready" findings enumerated with value tier + which live surface
      each would feed (verdict input vs. program-card copy vs. cost copy).
- [ ] Founder steer recorded on the surface-vs-defer split.
- [ ] Integrated findings wired with `source`/`lastVerified`; engine-path changes bump
      RULE_VERSION + regenerate goldens deliberately; copy-only changes keep goldens identical.
- [ ] Gate green (typecheck/lint/test); FLIP_STATUS green.
- [ ] Deferred findings recorded with a reason (not silently dropped).

## Resume notes (for a cold agent after compaction)

- MV-08 (the prior card) is **done + committed** to master (`0bdc5ab`, Codex review folded) and
  sits at the founder gate — do not reopen it.
- This card was moved to In Progress on 2026-06-19; the **heavy ledger exploration had not yet
  started** at kickoff. Start by running the reconcile tool and reading the E/I ready findings;
  do NOT integrate before the founder steers the surface-vs-defer split.
- Engines are already unified (MV-01 done), so the "do after engines unified" precondition is met.
