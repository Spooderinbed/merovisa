# MV-33 — Honest "Your applications" funnel (subtitle + self-report control)

**Priority:** P1 · **Owner:** agent · **Gate:** none (agent-ownable; part B is UI over an already-built+tested backend)
**Created:** 2026-06-24
**Related:** [[MV-08]] (the outcome-validation loop this completes the read/write UI for), [[MV-15]]
(the read-side funnel surface this extends), [[MV-39]] (Part B carved out). Evidence: product-review
audit `wf_5fb5dfa7-009` (2026-06-24).

## Status — Part A SHIPPED 2026-06-25 (Part B → MV-39)

Founder steered "ship MV-33 part A + MV-34" (the trust-copy fixes that bite testers first). **Part A
shipped** (subtitle reconciled). **Part B (the self-report control) is carved out to [[MV-39]]** so this
card represents the honest-copy fix the founder asked for; MV-39 carries the larger UI-over-built-backend
slice. Mirrors the [[MV-23]] → [[MV-27]] split pattern.

- Subtitle `components/outcomes/outcome-funnel.tsx` was *"What you told us happened, against the verdict we
  gave you. Self-reported until verified."* → now *"The programs you've applied to, shown against the verdict
  we gave you. We'll add your offer and visa results as you report them."* — no longer claims a comparison
  (rows are stuck at "Applied") or a verification ladder that doesn't exist. "until verified" removed.
- Evidence: TDD RED→GREEN. New `tests/components/outcomes/outcome-funnel.test.tsx` (+2): asserts the subtitle
  reads honestly AND that `/until verified/` is absent. Gate green: typecheck clean · lint clean (only the
  pre-existing board-generator warning) · full suite **1326** (was 1323). Goldens N/A (no scorer path).
  Banded verdicts only; no raw %.

## Why

Audit concern #6 (founder, live app). The "Your applications" funnel is a real read-only surface fed by
real per-user rows (banded verdicts only, no raw %), but the loop it advertises is **half-wired**:

- The ONLY outcome event the live app can ever write is the root `"applied"` (`lib/outcomes/on-apply.ts:65-73`).
  `app/api/outcomes/event/route.ts` exists and is tested but has **zero client callers** — so every funnel
  row is permanently stuck at stage "Applied." The "outcome vs verdict" back-test the subtitle promises can
  never be exercised by a student.
- The subtitle (`components/outcomes/outcome-funnel.tsx:4-8` area) reads *"What you told us happened, against
  the verdict we gave you. Self-reported until verified."* — but (a) there is **no UI to report** an
  offer/refusal/visa, and (b) the verification ladder doesn't exist in the shipped app (`classifyEvidence` in
  `lib/outcomes/verification.ts` is dead outside `tests/outcomes/verification.test.ts`; RLS forces
  `source='self_reported'`, `verified_by null`). The copy promises a comparison AND a verification the app
  can't perform — a trust-first contradiction a tester will catch on session one.

## Scope

**Part A — reconcile the copy NOW (P1, ~1 line, ship first).** Soften the subtitle so it doesn't promise
what's unbuilt, e.g. *"The programs you've applied to, shown against the verdict we gave you. We'll add your
offer and visa results as you report them."* Drop/qualify "Self-reported until verified" until a verification
path is reachable. The "until verified" promise must NOT appear in UI before it exists.

**Part B — close the loop (the larger half).** Add an outcome self-report control on each funnel row (or the
program card) that POSTs `/api/outcomes/event` with `offer_received` / `offer_unsuccessful` / `visa_lodged` /
`visa_granted` / `visa_refused`, so stages beyond "Applied" are reachable. **The entire backend already
exists and is tested** — the route, the state machine (`lib/outcomes/state-machine.ts`), the repo, the funnel
folder (`lib/outcomes/funnel.ts` `deriveFunnelStage`). Only the UI affordance is missing. Keep banded verdicts
only; no raw %.

## Out of scope (do NOT pull in)

- The verification ladder (`classifyEvidence` + the forward-to-address `.eml`/DKIM ingestion + admin VEVO
  promotion). That is a separate, larger [[MV-08]] slice, legal-gated (PIA / minor-consent / VEVO ToS). Part A
  must remove the "until verified" claim precisely because this is unbuilt.

## Acceptance criteria

- [x] Subtitle no longer claims a comparison/verification the app can't perform; reads honestly for a row
      stuck at "Applied." **(Part A — shipped 2026-06-25)**
- [ ] A student can report at least one post-"Applied" outcome from the UI; the funnel advances past "Applied."
      **(Part B → [[MV-39]])**
- [ ] Banded verdicts only on every row; no raw percentage anywhere.
- [ ] TDD RED→GREEN per unit; full suite green; goldens N/A (no scorer path).

## Resume notes (cold agent)

- Backend is DONE+tested — confirm callers: `grep "/api/outcomes/event"` returns route + tests + docs only
  today; your job is to add the first real `.tsx` caller.
- Verdict labels are banded in `components/outcomes/outcome-funnel.tsx:4-8` (`"Strong match"/"Possible"/"Reach"`).
- Part A is independently shippable and is the trust-urgent piece — ship it even if Part B lands later.
