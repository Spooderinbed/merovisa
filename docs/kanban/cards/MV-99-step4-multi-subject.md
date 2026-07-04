# MV-99 — Step 4 multi-subject (primary + also-considering)

**Priority:** P1   **Owner:** agent
**Goal:** Founder ask ② — let students pick MULTIPLE subjects in the wizard's field-of-study step, without breaking the honest single verdict.

## Decision (mine + Codex)
**Option A — "Primary + also-considering".** One primary field owns the verdict exactly as today; students may add up to 2 "also considering" fields that only broaden which programs surface. Shipped as a stepping-stone toward per-field verdicts (Option C) later. Rejected B (score against toughest — pessimistic) and C-now (biggest build). Design doc: `~/.claude/plans/ancient-questing-sunbeam.md`.

**Codex guardrail (built):** also-considering programs floated into the match list carry an explicitly exploratory reason ("In a field you're also considering — not covered by your verdict") so a student never reads the primary verdict onto them.

**Scope win:** `fieldOfStudy` stays the primary; `alsoConsidering` is purely additive → the scoring engine is untouched and every frozen golden score stays byte-identical (proven by `tests/scoring/also-considering-inert.test.ts`). No DB migration (JSONB).

## Acceptance criteria
- [x] `StudentProfile.alsoConsidering?: FieldOfStudy[]` (additive); `ProfileSections["intended-study"].alsoConsidering`; `MatchReason.kind` adds `"field-exploring"`; `MatchInputs.alsoFields?` (optional — no fixture churn).
- [x] Zod: `ProfileSchema` + `IntendedStudyPatch` accept the capped array; a refine keeps it disjoint from the primary + dupe-free.
- [x] Wizard step: primary radio (unchanged) + optional multi-select extras (cap 2, primary excluded, disabled at cap) + honest microcopy + live competitiveness note.
- [x] Matching: three-tier soft sort (primary → also → rest); exploratory reason on also-considering hits; both anon + signed-in builders pass `alsoFields`.
- [x] Persistence: bridge carries `alsoConsidering`; wizard posts the whole profile (no allowlist); profile editor round-trips the extras.
- [x] Recap shows an "also considering: …" line only when extras present.

## Test plan / evidence
- New pure modules: `lib/wizard/also-considering.ts` (reconcile/toggle) + `lib/scoring/field-note.ts` (competitivenessNote). TDD.
- Tests added (+23): `tests/wizard/also-considering.test.ts`, `tests/scoring/field-note.test.ts`, `tests/scoring/also-considering-inert.test.ts`, `tests/wizard/steps/field-of-study-step.test.tsx`, matching 3-tier + exploratory-reason cases in `tests/matches/compute.test.ts`, recap line in `tests/assess/profile-recap.test.ts`.
- Gate: `tsc` clean; `eslint` clean (1 pre-existing unrelated warning in `docs/kanban/build.mjs`); suite **1620 pass / 1 fail** — the 1 fail is the pre-existing MV-80 1-July freshness timer (`tests/data/freshness.test.ts`), unrelated to this slice.

## Dependencies
- Independent of design PRs #44–#53 (touches the field-of-study step + matching, untouched by those). Branch `mv-99-step4-multi-subject`, base `master`/origin.

## Deferred (future slice — Option C)
Per-field verdicts (Strong for Business, Reach for CS), per-field match sections / field switcher, per-field plan guidance. The additive `alsoConsidering` model is the on-ramp. Also deferred: surfacing the competitiveness note on the results page (currently lives at the point of choice in the wizard).

## Agent resume notes
Built + gate-green on branch `mv-99-step4-multi-subject`. Founder-gated merge (never self-merge). The recap edit will trivially conflict with the unmerged MV-97 recap rewrite (both touch `recapLines`) — resolve by keeping both changes.
