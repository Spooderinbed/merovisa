# MV-01 — Consolidate the two match engines (fix the anonymous funnel)

**Priority:** P1   **Owner:** agent
**Goal:** A first-time anonymous student gets the *same* verdict inputs and the *same*
field/level-eligible match set they'd get after signing in — so the GPA fix and the
matches filter actually reach the top of the conversion funnel.

## Context links
- Round-1 audit Q11 (two divergent engines): `docs/audits/2026-06-18-full-app-evaluation.md`
- Forward plan §4 "one source of truth per concept", Phase 2: `.claude/plans/tender-bouncing-locket.md`
- Signed-in engine: `lib/matches/compute.ts`, `lib/matches/from-sections.ts`, `lib/matches/types.ts`
- Anonymous engine: `lib/matching/universities.ts`
- Scoring (GPA normalize already lands here): `lib/scoring/academic.ts`, `lib/scoring/grade-normalize.ts`, `lib/scoring/engine.ts`
- Goldens: `tests/.../golden-assessments.json`

## Acceptance criteria
- [ ] For an equivalent profile, the anonymous results match set == the signed-in match set (same field/level eligibility filter, same ranking, same non-empty fallback).
- [ ] A CGPA-bearing anonymous profile no longer collapses to academic 0 / forced "reach" — the `grade-normalize` path reaches the anonymous scorer.
- [ ] Anonymous users see only field/level-eligible programs (was: all 64 shown to everyone).
- [ ] The divergence is removed: both paths delegate to one shared matching+scoring core (don't fork the logic; preserve intentionally-anonymous differences like no shortlist/state).
- [ ] Goldens reviewed deliberately; RULE_VERSION bumped iff anonymous scoring outputs change (they will, since GPA now reaches anonymous).

## Test plan
- Characterization test: same input → assert anonymous output == signed-in output for ~3 representative profiles (CGPA student, %-grade student, off-field student).
- Re-prove with the round-1 perturbation method that GPA now moves the anonymous verdict.
- Full suite stays green.

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- None. (Independent of the approval-gated MV-A1/MV-A2.)

## Risk notes
- **This is the first-impression path** — test thoroughly; a wrong anonymous verdict is the worst trust failure.
- Changing anonymous scoring outputs ⇒ RULE_VERSION + goldens churn. Review the diff, don't regenerate blindly.
- The two engines may differ intentionally (anonymous has no shortlist/user_program_state). Unify *matching inputs + scoring*, not the persistence concerns.

## Agent resume notes (cold start)
1. Map both paths first: find where the anonymous `AssessmentPayload.matches` is built (trace from `lib/results/*` → likely `lib/matching/universities.ts`) vs the signed-in path (`lib/matches/compute.ts` via `from-sections.ts`).
2. Confirm whether anonymous scoring even calls `runAssessment` (and thus `academic.ts` + `grade-normalize`). If it uses a different entry, that's the core bug — route it through the same `runAssessment`.
3. Decide the least-risk consolidation: extract a shared matching core both call, OR make the anonymous path delegate to `from-sections.ts` + `compute.ts`. Prefer delegation over a new abstraction (simplicity-first).
4. Write the equivalence characterization test BEFORE refactoring (red → green).

## Decision log
- 2026-06-18 — Created. Codex + Claude ranked this the #1 next slice (correctness gap, touches every first-time user).

## Done evidence
_pending_
