# MV-08 — Outcome-validation loop ("the moat")

**Status:** capture side SHIPPED; verification path founder/legal-gated (updated 2026-07-02 — no build work pending). Migration applied to prod (Slice 3); capture routes + applied hook shipped (Slice 4); **UI capture trigger + funnel-root fix shipped (Slice 5, `4072730`)** — a user can now mark a program Applied and the funnel is actually progressable (the 409 dead-end is closed; event-less attempts self-heal). Founder gates remain: Q3 verification-path legal gates (PIA/minor-consent, VEVO ToS) before the inbound-email/verification slices; a live UI smoke + cleanup of the smoke-test prod rows.
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
- **Three new tables** (post-Codex; B1 added the attribution layer), mirroring existing
  migration conventions (`owner uuid`, `program_id text`, `(select auth.uid())` RLS,
  `force` RLS, indexed FKs, advisor-clean):
  - `program_predictions` — **immutable** verdict snapshot (verdict, rule_version,
    score_snapshot jsonb); prediction-*run* model (unique incl. rule_version), UPDATE-guard
    trigger for true immutability.
  - `application_attempts` — **the attribution layer** (B1): institution, program, intake,
    destination, which prediction it resolves; composite FK guarantees owner consistency.
  - `outcome_events` — **append-only** funnel log (`event_type` spanning both gates, explicit
    `gate` + `reason_code` + decision_authority, `occurred_at` timestamptz, verification
    metadata, `supersedes_event_id` lineage); never overwrites a claimed outcome.
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

1. Apply the migration now (inert, advisor-clean) or wait for launch? Now a **three-table** migration.
2. Calibration evidence bar — confirm **CIs + Bayesian pooling on verified outcomes**, "insufficient evidence" gate (NOT a fixed n≥30; updated by Codex review).
3. Is admin-verified outcome capture near-term or later? (Gates when any calibration claim can go live — self-reports don't train.)
4. How aggressively do we nudge for outcomes vs. stay passive?

## Codex adversarial review (2026-06-19) — FOLDED INTO THE DOC ✅

Ran the committed Codex (GPT-5) refute-each-decision pass. It confirmed the
direction (immutable predictions, separate admission/visa calibration, bands-not-%)
but found defects — near-free to fix in design, expensive to retrofit once data
exists. **All folded into the design doc on 2026-06-19** (schema is now 3 tables;
see §4 / §7 / §13 there).

**Blockers (folded):**
- [x] **B1 — Outcome→program attribution.** New `application_attempts` entity
      (institution, program, intake, destination, which prediction it resolves)
      between prediction and event. Doc §4.2.
- [x] **B2 — Self-reported labels poison calibration.** Calibration now **excludes
      `self_reported`**; `outcome_events` carries `verified_by`/`verified_at`; promotion
      to document/official-verified is admin-only (insert policy forbids self-promote).
      Doc §4.3, §7, §8.
- [x] **B3 — Two-gate underspecified.** `outcome_events` now has an explicit `gate`
      column + normalized `reason_code` taxonomy + `decision_authority`; calibration
      reports a per-reason_code visa breakdown. Doc §4.3, §7.2.

**Should-fix (folded):**
- [x] S4 — UPDATE-guard trigger on `program_predictions` (true immutability even vs
      service-role); writes use the user's RLS-scoped session, never service-role in
      request paths. Doc §4.1, §4.4.
- [x] S5 — Prediction-*run* model: unique incl. `rule_version` +
      `supersedes_prediction_id`; "current" derived as latest non-superseded. Doc §4.1.
- [x] S6 — `supersedes_event_id` lineage pointer replaces the `superseded` boolean. §4.3.
- [x] S7 — App-side state machine + deferred terminal-conflict trigger. §4.3, AC.
- [x] S8 — `occurred_at timestamptz` + optional `occurred_on` local date. §4.3.
- [x] S9 — CIs + Bayesian/hierarchical pooling + "insufficient evidence" replaces n≥30. §7.4.
- [x] S10 — Compatibility groups + rolling windows over comparable rule versions. §7.3.
- [x] S11 — Composite index `outcome_events(attempt_id, owner)`; verify RLS `exists` plan. §4.4.
- [x] S12 — Owner consistency via composite FKs `(parent_id, owner)`, no trigger needed. §4.2/§4.3.

Founder question 2 updated in the doc: the min-sample bar is no longer a yes/no on 30
— it's "CIs + Bayesian pooling on verified outcomes; insufficient-evidence gate."

## Acceptance criteria (this slice — design)

- [x] Design doc captures funnel, two-gate model, schema, RLS, API, calibration, cold-start.
- [x] Schema mirrors existing conventions and is advisor-clean by construction (indexed FKs,
      `(select auth.uid())`, force RLS).
- [x] Each outcome links to predicted verdict + RULE_VERSION + scoreSnapshot + assessment +
      program; self-reported bootstrap + verification ladder defined.
- [x] Zod/F16/no-sensitive-data-in-URLs and RLS-from-day-one respected in the contracts.
- [x] Honest-copy + cold-start implications stated; scope explicitly excludes shipping code.
- [ ] **(build phase, not this slice)** Migration applied by founder; capture wired; TDD.

## Build progress (2026-06-20)

Card moved Design → **In Progress**. Build is now TDD per slice (the §12 build-phase AC).

**Slice 0 — migration (committed `ebd71ae`).** The 3-table migration
`supabase/migrations/20260620000000_add_outcome_validation.sql`, adversarially Codex-vetted
(added the `outcome_events.verified_by` FK index; tightened `pp_insert_own` to re-assert parent
ownership). Inert on apply — **founder applies to prod.**

**Capture mechanism DECIDED + Codex-vetted GO-WITH-CHANGES (2026-06-20).** Gmail-OAuth inbox-scan
rejected (restricted scope → annual CASA; Limited Use forbids cross-user calibration). Primary
`document_verified` path = **student forwards the offer/CoE/visa email as a raw `.eml` attachment**
to a per-user `<token>@verify.myvisa.app`; a Cloudflare Email Worker verifies the issuer's **DKIM
at receipt** + binds to the student via ≥2 strong identifiers; human-reviewed upload is the
fallback. Folded into design doc §6/§7/§8/§9/§13. Founder/legal gates before the verification path
can ship: privacy PIA + APP-5 + minor consent; VEVO org-access ToS; accept that a live calibration
*claim* waits on `official_verified` (VEVO/CoE), not DKIM volume.

**Slice 1 — DB-independent capture contracts (TDD, green).** New `lib/outcomes/` +
`lib/validation/outcomes.ts`, 41 tests in `tests/outcomes/`:
- `types.ts` — event / gate / authority / source / evidence-subtype / capture-method enums + the
  gate-split reason-code taxonomy (`reasonCodeGate`).
- `events.ts` — `eventGate` / `eventDecisionAuthority` / `isNegativeOutcome` (derived server-side, B3).
- `state-machine.ts` — `canRecordEvent` (S7): prerequisite ordering + conflicting-terminal guards.
- `verification.ts` — `classifyEvidence`: the Codex rules (inline → self_reported; DKIM pass + ≥2
  identifiers → `dkim_identity_bound` draft; weak identity → human review; `.eml` DKIM-fail →
  rejected; reviewed upload → `human_reviewed`; never `official_verified`).
- `lib/validation/outcomes.ts` — Zod for the 3 POST routes; F16 (prediction input names the program
  only — verdict/snapshot/rule_version stripped); reason-code refine (negative-outcome + gate match).
- Gate: typecheck clean, lint 0 errors, **full suite 1212/1212** green.

**Slice 2 — verdict-recompute / prediction-freeze (TDD, green).** `lib/outcomes/predict.ts`
`buildPrediction(profile, program, university)` → `{ verdict, scoreSnapshot, ruleVersion }` (F16:
recomputed server-side, the client never supplies a verdict). **Snapshot-shape question RESOLVED** —
the freeze uses the *per-program* match result (`computeMatch` → verdict + `{gradeGap, englishGap,
bandGap, tuitionGap}`), NOT corridor `runAssessment`; the doc/migration shape was correct all along
(the earlier "mismatch" note looked at the wrong function). Surgical deps: exported `RULE_VERSION`
from `lib/scoring/engine.ts`; added `computeMatch` (single-program, no list filter) to
`lib/matches/compute.ts` so a *reach* / off-level program a student commits to still freezes a
verdict. +5 tests (predict ×3, computeMatch ×2); full suite **1217/1217**.

**Slice 3 — migration APPLIED to prod (2026-06-20, founder-approved).** `20260620000000_add_outcome_validation.sql`
applied via Supabase MCP. Verified live: all 3 tables `rls_enabled=true, rls_forced=true, policies=3`.
`get_advisors`: **zero new security findings** (residual two are pre-existing/known — `leads` no-policy is
intentional+documented, leaked-password-protection is a standing Auth WARN). **One new performance finding** —
`application_attempts` composite FK `(prediction_id, owner)` lacked a covering index (the base migration indexed
the two columns separately). Fix staged in **`20260620010000_index_application_attempts_composite_fk.sql`** (adds
the composite index, drops the now-redundant single-column one; mirrors the `outcome_events (attempt_id, owner)`
index, S11). **APPLIED to prod 2026-06-20 (founder-approved "apply 20260620010000"; Codex GO).** Verified:
`application_attempts_prediction_id_owner_idx` exists, `application_attempts_prediction_id_idx` dropped;
`get_advisors` performance **no longer reports any unindexed-FK finding** — only INFO `unused_index` noise on the
new zero-traffic tables (expected; clears once the routes issue queries). **Both MV-08 migrations now live.**

**FREEZE DESIGN — RESOLVED & LOCKED (2026-06-20, Codex GO-with-changes + founder "approve them with codex").**
The slice-2 `buildPrediction(profile: StudentProfile)` used the WRONG adapter: it ran
`profileToMatchInputs(sectionsToStudentProfile(sections))`, whose `effectiveEnglish` injects the *anonymous*
provisional baseline (booked→6.5, not-taken→6.0). The signed-in matches page (what the user actually SEES)
computes via `sectionsToMatchInputs(sections, {nepalAssessmentLevel})`, which treats a missing English score as
`null`. So freezing via the StudentProfile path would store a DIFFERENT (more optimistic) verdict than the page
showed — an F16 violation. `buildPrediction(profile)` had no production caller (only its test), so it is being
corrected now. Locked decisions:
- **A.** Refactor `buildPrediction(inputs: MatchInputs, program, university)` — adapter-agnostic; caller chooses.
- **B.** The freeze route + the `applied` transition build inputs via
  `sectionsToMatchInputs(sections, {nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL})` — the *same* adapter the
  matches page uses ⇒ frozen verdict == what the user saw. (`computeMatch` single-program path retained so a
  reach / off-level program still freezes — see off-list override below.)
- **C.** `assessment_id` is **server-derived** from `getPrimaryAssessmentForUser(db, userId).id`
  (`lib/assessments/repo.ts`), NOT from the request body → drop `assessmentId` from `PredictionInputSchema`
  (body = `{ programId }`). No primary assessment ⇒ **409**. (Don't trust client; owner from session, never body.)
- **Idempotent re-freeze (Codex #1):** on the `unique(owner, assessment_id, program_id, rule_version)` collision,
  return the EXISTING prediction-of-record — never overwrite (the UPDATE-guard trigger blocks it anyway; "what we
  predicted at first commit" is the honest semantic). A new `rule_version` gets a new row.
- **Off-list freeze — Codex #3 OVERRIDDEN (deliberate):** Codex wanted to block freezing a program absent from the
  rendered match set. Rejected — MV-08's whole point is capturing the funnel for reach/off-level programs a student
  applied to anyway; `computeMatch` was built to bypass the browse filter for exactly this. F16 here = "same adapter,
  honest per-program verdict," not "only browse-filtered programs."
- **Provenance note (Codex #e):** the page renders from LIVE `profiles.sections`, not the primary assessment's
  snapshot, so `assessment_id` is an ownership anchor, not the literal input source. `score_snapshot` (the gaps) +
  `rule_version` + the program's published thresholds reconstruct the effective inputs, so NO extra input-snapshot
  column for v1 (freeze fires in the same signed-in session as the render ⇒ negligible drift). Revisit if audit needs grow.

**Slice 4 — capture routes + applied hook SHIPPED (TDD, 2026-06-20, commit 6e5296c).**
- `buildPrediction` refactored to `MatchInputs` (Decision A, commit b32895d) + F16 regression test.
- `PredictionInputSchema` dropped `assessmentId` (Decision C) — body is `{ programId }` only.
- `lib/outcomes/repo.ts` — RLS-scoped DB access (insert/get prediction, attempt, event; idempotent
  `insertPrediction` on the unique collision; `listEventTypesForAttempt` feeds the S7 guard;
  `getOutcomesForUser`). `lib/outcomes/freeze.ts` — `freezePredictionForProgram` (B+C, 409/404 branches).
  `lib/outcomes/on-apply.ts` — `captureApplication` (freeze + open attempt, idempotent, best-effort).
- Routes `app/api/outcomes/`: POST `prediction` (201 fresh / 200 idempotent / 409 no-assessment / 404),
  POST `attempt` (program_id from the prediction, 404 unknown), POST `event` (derives gate +
  decision_authority, S7 guard → 409, stamps source=self_reported), GET `/` (owner-scoped history).
  Wired `app/api/shortlist/route.ts` 'applied' → `captureApplication` via the RLS-scoped client (S4).
- `lib/supabase/types.ts`: hand-added the 3 new tables (no gen script in repo).
- Gate: **typecheck clean, lint 0 errors, full suite 1242/1242** (+25: predict F16, freeze ×4, routes ×17, shortlist ×2).
- Not done as live browser e2e: the routes need a signed-in session + primary assessment; covered by
  integration tests (auth/validation/freeze/state-machine/idempotency/delegation). A true UI e2e
  (sign in → mark a program 'applied' → confirm a prediction + attempt row land) is the founder smoke-test.

**Slice 5 — UI capture trigger + funnel-root fix SHIPPED (TDD, 2026-06-20, commit `4072730`).**
Closes the two halves that made the funnel un-progressable from the product surface (founder chose
the "3-state status control" via AskUserQuestion).
- `components/matches/shortlist-button.tsx` — replaced the single shortlist toggle with a 3-state
  status control **Not saved → Shortlisted → Applied**. Choosing *Applied* POSTs `status:"applied"`
  to `/api/shortlist` (the existing capture trigger); choosing the active state is a no-op.
- Threaded the **persisted** status through `app/(app)/matches/page.tsx` → `verdict-group.tsx` →
  `program-card.tsx` (`Set<id>` → `Map<id, status>`; `ProgramCard` prop `isShortlisted: boolean` →
  `initialStatus: Status`) so an Applied program reflects as *Applied* on reload, not Shortlisted/Not saved.
- **The funnel-root fix:** `lib/outcomes/on-apply.ts` `captureApplication` now ALSO writes an
  **idempotent root `applied` outcome_event** when it opens the attempt (`ensureAppliedEvent`),
  deriving gate/decisionAuthority/source server-side via `lib/outcomes/events.ts` (mirrors
  `/api/outcomes/event`), anchored to the attempt's `createdAt`. Previously the attempt was opened
  with **no** root event, so the S7 state machine rejected the first self-report
  (`offer_received`/`visa_granted`) with **409** — the confirmed dead-end. The idempotency check
  (`listEventTypesForAttempt` → skip if `applied` present) also **self-heals** attempts opened by the
  earlier event-less path (e.g. the live smoke-test attempt `073d60dc`): the next `applied` flip
  on that prediction writes the missing root event, no manual DB surgery.
- Gate: **typecheck clean, lint 0 errors, full suite 1249/1249** (+7: on-apply ×4 incl. the heal path,
  shortlist-button rewritten to 6 for the 3-state control, program-card status-reflection ×1).
- Not done as live browser e2e: `/matches` is OAuth-gated and can't be authenticated headlessly;
  control verified by unit tests + a faithful token-accurate visual mockup surfaced to the founder.
  A true UI smoke (sign in → mark Applied → confirm a root `applied` event lands → confirm a follow-on
  `offer_received` returns 201 not 409) is the founder smoke-test.

**OPEN (remaining slices):**
- Inbound email handler (Cloudflare Email Worker) + the verification-ladder admin path — gated on
  the founder/legal items above.

## Why no TDD / gate (design slice)

The original *design* slice produced a document, not production code — no failing test to write.
The TDD iron law applies to the **build phase** (now underway — see Build progress above; §12 AC).
