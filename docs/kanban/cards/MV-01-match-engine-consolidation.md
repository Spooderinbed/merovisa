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

## Engines as mapped (2026-06-18, verified by Explore)
- **Anonymous** `lib/matching/universities.ts` → `matchUniversities(profile: StudentProfile): UniversityMatch[]`. Reads the **static 10-university seed** `lib/data/universities/au.ts` (NOT the DB). HARD field filter (no fallback → can return empty). 2-dimension verdict (grade ±5%, english ±0.5) → `matchLevel: strong|possible|reach`. **No GPA normalization. No level filter. Ignores budget.** Output shape `UniversityMatch{ university, matchLevel, reason: string, preferenceChip? }`. Caller: `lib/results/assemble.ts` (wraps in `applyPreference`).
- **Signed-in** `lib/matches/compute.ts` → `computeMatches(inputs: MatchInputs, programs: Program[], universities: University[]): MatchResult[]`. Reads the **live DB** (`lib/programs/repo.ts` → `listAllPrograms`/`listAllUniversities`). HARD level filter (`filterByLevel`, defensive non-empty fallback) + SOFT field rank (`rankByField`). 4-gap verdict (grade>10, english>1, band, tuition>50%) → `verdict` + structured `reasons[]` + `scoreSnapshot`. Adapter `from-sections.ts: sectionsToMatchInputs()` builds `MatchInputs`, normalizes english via `toIeltsEquivalent`. **Also does NOT call GPA normalization** (latent bug if CGPA is ever persisted to a signed-in profile). Caller: `app/(app)/matches/page.tsx`; also `lib/plan/invalidate.ts`.
- Shared already: `toIeltsEquivalent` (`lib/scoring/english-equivalent.ts`), `applyPreference` (`lib/matches/preference.ts`). GPA normalize lives in `lib/scoring/academic.ts` via `normalizeGradeToPercentage` (`lib/scoring/grade-normalize.ts`) — currently only the visa scorer (`lib/scoring/engine.ts`) calls it.

## DESIGN DECISION (the crux — locked 2026-06-18)
**Equivalence requires a shared DATA SOURCE, not just a shared algorithm.** The acceptance criterion "anonymous match set == signed-in match set for an equivalent profile" CANNOT be met by converting the 10-university seed into `Program[]` (the Explore agent's STEP 2) — that keeps two different catalogs. **The anonymous path must read the same DB programs/universities the signed-in path reads.** Shared core = `computeMatches` (keep as-is). Anonymous gets a new adapter that mirrors `from-sections.ts`.
- **Product-visible consequence (intended per acceptance):** anonymous results become **program-level, DB-sourced** (was: 10 curated universities). Confirm the results UI copy/label still reads right ("matches" not "universities").

## Implementation plan (TDD — execute post-compact in clean context)
1. **VERIFY 3 load-bearing facts first** (don't assume): (a) `lib/results/assemble.ts` runs server-side so it can call `lib/programs/repo.ts` (it builds the persisted anon payload — almost certainly yes); (b) what degree/level signal the anon wizard captures → drives `userTargetLevel` (if none, document it and leave `null`, but acceptance wants level-eligible, so check the wizard steps / `StudentProfile`); (c) the exact shape `components/results/university-matches.tsx` consumes (drives the mapping in step 4).
2. **RED — write tests first:**
   - `tests/matches/from-student-profile.test.ts`: CGPA-bearing `StudentProfile` (e.g. 3.5/4.0) yields the same `userGradePercent` (~87.5) as the equivalent %-profile → proves `normalizeGradeToPercentage` is wired.
   - Equivalence/characterization test: for the SAME profile + SAME DB programs, anonymous output == signed-in output (3 reps: CGPA student, %-grade student, off-field student).
3. **New adapter** `lib/matches/from-student-profile.ts` → `profileToMatchInputs(profile: StudentProfile): MatchInputs`. Port `effectiveEnglish()` from `universities.ts`; **wire `normalizeGradeToPercentage(profile.grade, profile.gradeSystem)`** so CGPA reaches the scorer; map field; set `userTargetLevel` from the anon level signal (step 1b); set `policy` (Nepal L2/L3) consistent with the signed-in default.
4. **Rewrite `lib/results/assemble.ts`:** replace `matchUniversities(scored)` with → fetch DB programs+universities, `computeMatches(profileToMatchInputs(scored), programs, universities)`, then **map `MatchResult[]` → `UniversityMatch[]`** the results UI needs (verdict→matchLevel 1:1; `reasons[]`→`reason` string; group-by-university or per-program per step 1c). Keep `applyPreference`. **Simplicity-first: prefer a thin mapping layer that preserves the existing `UniversityMatch` UI shape** over migrating the UI to `MatchResult[]` — only migrate the UI if the mapping proves lossy.
5. **Goldens / RULE_VERSION:** match-set change likely does NOT touch `golden-assessments.json` (those golden it the *visa* scorer in `engine.ts`, not matches) — confirm by running the suite. Anonymous *scoring* outputs change because GPA now reaches anon → review any golden diff deliberately (don't regenerate blindly); bump `RULE_VERSION` (`lib/scoring/engine.ts`) **iff** the visa-score outputs change.
6. **Cleanup:** delete `lib/matching/universities.ts` only after `assemble.ts` (and any other importer) no longer references it. Move/keep its test coverage as `from-student-profile` tests.
7. **GREEN:** `npm run typecheck` · `npm run lint` · `npm test` all pass; record evidence below; move card to In review.

## Design refined post-verification + Codex (2026-06-18)
Three findings during step-1 verification materially refined the plan:
1. **Data-model mismatch** — the results card renders per-university **USD** tuition (`UniversityMatch.university.tuitionUsdPerYear`), but the DB `University` has **no tuition** (it's per-`Program`, **AUD**). So the card's "thin map to `UniversityMatch`" is lossy/fake. → Anon results go **program-level** (`AssessmentPayload.matches: MatchResult[]`), same model as signed-in. The blur/unlock gate in `university-matches.tsx` is kept; its card renders program info (uni·city, program name, AUD tuition, verdict, reasons), keyed by `program.id`.
2. **Root cause is upstream** — `lib/profiles/from-assessment.ts:40` persists the raw anon `grade` (a CGPA like 3.5) straight into `academic.gradePercent` and **drops `gradeSystem`**, so the **signed-in path inherits the CGPA bug** (wrong verdict on re-score AND wrong matches). Fix the invariant at the boundary: **`gradePercent` is always a true 0–100 percentage**, normalized via `normalizeGradeToPercentage(grade, gradeSystem)` in `from-assessment`. No double-normalization downstream because `sectionsToStudentProfile` defaults `gradeSystem` to a pass-through system.
3. **DI over async** (Codex-agreed) — `assembleAssessment(profile, programs, universities, now)` stays a pure function (keeps ~6 test files passing fixtures, no `server-only` coupling); the 3 callers (`api/assess`, `api/dev/sign-in`, `re-score.ts`) fetch the catalog and pass it in.

Other Codex traps folded in: use `signedInPreferenceAdapter` for anon (delete `anonymousPreferenceAdapter`); `policy.nepalAssessmentLevel = NEPAL_ASSESSMENT_LEVEL` (= **"L3"**, not L2); export+reuse `budgetToAud` + the target-level map from `from-sections.ts` (no drift); key cards by `program.id`. **Backcompat:** `assessments.result` stores the payload + a `profile_snapshot`; `/assessment/[id]` gets a shape-guard — legacy `UniversityMatch[]` payloads recompute matches from `profile_snapshot` + live catalog instead of crashing.

**Intentional anon difference (documented):** the anon adapter keeps `effectiveEnglish`'s provisional baseline (booked→6.5, not-taken→6.0) so a pre-test student isn't shown all-"reach"; signed-in uses null→0. Equivalence (anon == signed-in) is asserted for the **taken-english** case (where inputs are truly equal). RULE_VERSION/goldens untouched — the **verdict** scorer (`runAssessment`) is unchanged; only matching changes.

## Agent resume notes (cold start)
The understand+design phase is DONE — see "Engines as mapped" + "DESIGN DECISION" + "Implementation plan" above. Pick up at **Implementation plan step 1** (verify the 3 facts), then TDD red→green. Don't re-run the Explore mapping; it's captured. The one thing the Explore agent got wrong and you must NOT copy: its "convert the seed to Program[]" step — use the DB instead (see DESIGN DECISION).

## Decision log
- 2026-06-18 — Created. Codex + Claude ranked this the #1 next slice (correctness gap, touches every first-time user).
- 2026-06-18 — Moved to In progress. Mapped both engines (Explore). Locked the design: anonymous must read the **same DB catalog** as signed-in (not a converted seed) to satisfy the equivalence criterion; shared core = `computeMatches`; anon gets a new `from-student-profile` adapter that also wires GPA normalization. Plan written above. Paused before edits to compact (context full); implementation runs next in clean context.

## Done evidence (2026-06-18 — implementation complete, ready for review)
**Gate — all green:** `npm run typecheck` exit 0 · `npm run lint` clean (the one `build.mjs` warning is pre-existing, unrelated) · `npm test` **1086/1086 pass (195 files)**. Goldens passed **unchanged** → the verdict scorer (`runAssessment`) is untouched, so **RULE_VERSION was not bumped** (criterion 5 satisfied: anonymous *scoring* outputs don't change; only matching does).

**Acceptance criteria:**
- ✅ Anon match set == signed-in for an equivalent profile — `tests/matches/anon-equivalence.test.ts` proves `computeMatches(profileToMatchInputs(profile))` deep-equals `computeMatches(sectionsToMatchInputs(from-assessment(profile)))` over a shared catalogue for percentage, CGPA, and off-field reps.
- ✅ CGPA no longer collapses to academic 0 / forced reach — `from-student-profile` wires `normalizeGradeToPercentage`; equivalence test asserts a CGPA student gets strong/possible, not all-reach.
- ✅ Anon sees only field/level-eligible programs — equivalence test asserts a bachelor's holder sees only masters (not `uts-bit`).
- ✅ One shared core — both paths now call `computeMatches` + `signedInPreferenceAdapter`; the anonymous `matchUniversities` engine + its static seed are deleted.
- ✅ Goldens reviewed; no RULE_VERSION bump (verdict scorer unchanged).

**Files changed:** NEW `lib/matches/from-student-profile.ts`, `lib/results/legacy.ts`, `tests/fixtures/catalog.ts`, `tests/matches/from-student-profile.test.ts`, `tests/matches/anon-equivalence.test.ts`, `tests/results/legacy.test.ts`. EDIT `lib/results/assemble.ts` (DI signature), `lib/results/types.ts` (`matches: MatchResult[]`), `lib/profiles/from-assessment.ts` (root-cause CGPA normalize), `lib/matches/from-sections.ts` (export `budgetToAud` + target-level map), `lib/matches/preference.ts` (drop `anonymousPreferenceAdapter`), `components/results/university-matches.tsx` (program-level render), `app/api/assess/route.ts` · `app/api/dev/sign-in/route.ts` · `lib/assessments/re-score.ts` (fetch+inject catalogue), `app/(focused)/assessment/[id]/page.tsx` (legacy shape-guard), `lib/data/types.ts` (drop dead `UniversityData`). DELETE `lib/matching/universities.ts`, `lib/data/universities/au.ts`, `tests/matching/universities.test.ts`.

**Follow-up flagged (separate, pre-existing):** the profile editor lets a signed-in user pick `gradeSystem = cgpa-4` AND type a CGPA into `gradePercent`, which the matches adapter then reads as a percentage (verdict path normalizes, matches path doesn't) — violating the gradePercent invariant from a path that bypasses `from-assessment`. Out of MV-01 scope; flagged for its own card.

## Done evidence (superseded)
_pending — understand+design complete; implementation not started_
