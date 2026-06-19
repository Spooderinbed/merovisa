# MV-08 — Outcome-validation loop ("the moat")

**Status:** Design delivered, awaiting founder review/steer (design only — no code shipped).
**Owner:** agent · **Priority:** P2 · **Gate to build:** founder approves migration + real traffic exists.

## What this card is

Design — *not build* — the verdict-validation / outcome feedback loop that captures the
real funnel **applied → offer → refused → visa outcome** and links each outcome back to the
prediction we showed (verdict + RULE_VERSION + scoreSnapshot), so we can later back-test
whether our banded verdicts predict reality. This is the defensible moat: a consultancy can
scrape the same public *inputs*, but not our users' resolved-outcome distribution per band.

The deliverable is a **build spec**, because the loop is worthless with zero resolved
outcomes — it builds *after* traffic (cold-start). Prod DB changes also need founder
approval, so this slice proposes the migration; the founder applies it.

## Deliverable (evidence)

**Full design & schema:** [`docs/superpowers/specs/2026-06-19-outcome-validation-loop-design.md`](../../superpowers/specs/2026-06-19-outcome-validation-loop-design.md)

Key decisions captured there:
- **Two-gate insight** — admission (offer/reject) and visa (grant/refuse) validate
  *different halves* of the verdict, so outcomes are recorded separately, never conflated.
- **Reuse, don't duplicate** — `user_program_state` already tracks `applied`; that
  transition becomes the trigger that **freezes a prediction**. No parallel "I applied" UI.
- **Two new tables**, mirroring existing migration conventions (`owner uuid`, `program_id
  text`, `(select auth.uid())` RLS, `force` RLS, indexed FKs, advisor-clean):
  - `program_predictions` — **immutable** verdict snapshot (verdict, rule_version,
    score_snapshot jsonb), unique `(owner, assessment_id, program_id)`; INSERT+SELECT only.
  - `outcome_events` — **append-only** funnel log (`event_type` spanning both gates,
    `occurred_on` date, `source` self_reported→document_verified→official_verified,
    `superseded` for corrections); never overwrites a claimed outcome.
- **API** — 3 Zod-validated routes; verdict **recomputed server-side** on snapshot (F16,
  never trust client); calibration is offline/admin only (no rules in client JS).
- **Calibration** — ordinal **separation + monotonicity** (Strong ≥ Possible ≥ Reach) per
  gate, windowed by rule_version, with a **min-sample gate** (≥30/band/gate/rule_version)
  that reports "insufficient data" until met.
- **Cold-start ladder** — storage now (inert) → wire capture at first traffic → calibrate at
  threshold → verification layer later. Known biases (survivorship, self-report, small-n)
  documented, not pretended away.
- **Honest copy** — until calibrated, verdicts stay an estimate from official criteria
  (reinforces MV-05 disclaimer + MV-04 freshness); never percentages.

## Open questions for the founder (in the doc §13)

1. Apply the migration now (inert, advisor-clean) or wait for launch?
2. Is 30/band/gate/rule_version the right minimum-sample bar?
3. Is document-verified outcome capture near-term or later?
4. How aggressively do we nudge for outcomes vs. stay passive?

## Acceptance criteria (this slice — design)

- [x] Design doc captures funnel, two-gate model, schema, RLS, API, calibration, cold-start.
- [x] Schema mirrors existing conventions and is advisor-clean by construction (indexed FKs,
      `(select auth.uid())`, force RLS).
- [x] Each outcome links to predicted verdict + RULE_VERSION + scoreSnapshot + assessment +
      program; self-reported bootstrap + verification ladder defined.
- [x] Zod/F16/no-sensitive-data-in-URLs and RLS-from-day-one respected in the contracts.
- [x] Honest-copy + cold-start implications stated; scope explicitly excludes shipping code.
- [ ] **(build phase, not this slice)** Migration applied by founder; capture wired; TDD.

## Why no TDD / gate here

This slice produces a design document, not production code — there is no failing test to
write yet. The TDD iron law applies to the **build phase** (AC in the doc §12). No
`typecheck`/`lint`/`test` change; goldens untouched.
