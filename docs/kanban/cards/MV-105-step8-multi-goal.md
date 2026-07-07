# MV-105 — Wizard step 8: multi-select goals (primary + secondary)

**Column:** In Review (Layer A built on `mv-105-step8-multi-goal`, founder-gated merge; founder chose Option 1 on 2026-07-07)
· **Priority:** P3 · **Owner:** agent

## Why

In local testing the founder asked: *"users should be able to choose multiple options like,
I want PR but also want a high-ranked uni?"* — and immediately saw *"the problems that can
come with this."* Step 8 (goal) is **single-select** today.

## THE TRUST FINDING (Codex read the code — shapes everything)

`goal` does **NOT** drive the verdict or the plan today:

- `lib/scoring/engine.ts` (`runAssessment`) never reads `goal` — the verdict is a generic
  academic / financial / visa / profile-strength readout. Identical profiles → identical
  verdict regardless of goal.
- `lib/plan/generator.ts` never reads `goal` — the plan is generic.
- **Only** `lib/matches/preference.ts` reads `goal`, and only 3 of 6 goals have program-level
  signals: `highest-ranked`→rankingTier, `lowest-cost`→tuition, `fastest-admission`→nearest
  intake. `permanent-residency`, `best-employment`, `research` have **no** program-level data.

→ **No copy may claim a goal-specific verdict or plan.** Honest microcopy only:
*"Extra goals add context. They do not combine into a new verdict."*
→ The **scoring-inert test is the honesty guarantee**: it proves `secondaryGoals` never changes
the verdict / weighted score / dimensions.

## Two-layer split

- **Layer A (THIS SLICE — honest CAPTURE):** add optional, additive `secondaryGoals?: Goal[]`
  beside the unchanged primary `goal`. Mirrors the shipped step-4 multi-subject
  "also considering" pattern. Because Layer A ships without B, the picker is lightly **inert**
  — captured + shown in the recap, but does **not** change matches yet; microcopy sets that
  expectation honestly.
- **Layer B (DEFERRED to a UI/UX session):** the trade-off / conflict callout copy, surfacing
  secondaries in matches + results, the reorder-vs-contextualise decision, PR-warning
  bluntness. Not built here.

## Recommended shape (Codex-triangulated — build this)

Mirror the **MV-99 Option A** pattern that already shipped for multi-subject:

- Keep **one primary goal** (owns match order today; owns verdict framing if scoring ever
  reads goal — it doesn't yet). Stays unambiguous.
- Add optional **secondary goals**, purely additive: captured, validated, echoed in the recap
  and the profile editor. No scoring rewrite; scoring keeps ignoring goal entirely.

Rejected: letting every selected goal drive the verdict (incoherent — and moot, since goal
drives no verdict today), or scoring against the "hardest" goal.

## Acceptance criteria

1. Data model: `secondaryGoals?: Goal[]` on `StudentProfile` (beside unchanged `goal: Goal`),
   on `ProfileSections.career`, forwarded through `from-assessment` + `from-sections`.
2. Pure helper `lib/wizard/secondary-goals.ts`: `SECONDARY_GOALS_CAP = 2`;
   `reconcileSecondaryGoals(primary, secondaries)` (drop primary, dedupe, preserve order, cap);
   `toggleSecondaryGoal(current, goal, primary)` (add under cap / remove if present / refuse
   primary / refuse overflow).
3. Zod: `profile.ts` + `profile-section.ts` cap at 2, no dupes, disjoint from the primary
   `goal` (the section refine excludes `goal` only when `goal` is present in the same patch).
4. Wizard step is two-zone: primary radio (`role="radiogroup"`) + "Also aiming for? (optional,
   up to 2)" checkbox cards (`role="group"`) excluding the primary; changing the primary
   reconciles secondaries in the same `setField`; "N of 2 selected" is `aria-live="polite"`;
   disabled at cap but already-selected stay toggleable.
5. Recap shows an "Also aiming for: …" line **only** when secondaries are present.
6. Profile editor renders + edits secondaries and always sends `secondaryGoals` (incl. `[]`)
   so a shallow-merge clears stale extras.
7. **Scoring stays inert** — a test proves `secondaryGoals` never changes verdict / weighted /
   dimensions.
8. No copy claims a goal-specific verdict or plan. Sentence case, calm-authority tokens.
9. Gate green: `npm run typecheck` (0), `npm run lint` (0 new), `npm test`.

## Build plan / file list

Authoritative plan: `scratchpad/mv105-layerA-plan.md` (Codex-xhigh-validated). CREATE
`lib/wizard/secondary-goals.ts` + its tests + `tests/scoring/secondary-goals-inert.test.ts`;
EDIT `lib/scoring/types.ts`, `lib/profiles/sections.ts`, `lib/validation/profile.ts`,
`lib/validation/profile-section.ts`, `components/wizard/steps/goal-step.tsx`,
`components/assess/profile-recap.tsx`, `lib/profiles/from-assessment.ts`,
`lib/scoring/from-sections.ts`, `components/profile/editors/study-career-editor.tsx`,
`components/profile/groups.ts`.

## Status

**Layer A BUILT 2026-07-07** on `mv-105-step8-multi-goal` (founder Option 1) — In Review,
[PR #70](https://github.com/Spooderinbed/merovisa/pull/70), founder-gated merge. Built TDD via a build→adversarial-verify workflow; independent reviewer
verdict = **SHIP, 0 defects**. Gate GREEN on the orchestrator's own re-run: `typecheck` 0 errors,
`lint` 0 errors (baseline `build.mjs` warning only, no new), `vitest` **280 files / 1815 tests, 0
failed**. The honesty guarantee (`tests/scoring/secondary-goals-inert.test.ts`) drives the real
`runAssessment` and proves `secondaryGoals` never moves the verdict / weighted score / dimensions;
the wizard microcopy states extra goals "do not combine into a new verdict, and they do not change
your matches yet." Deferred by the founder on 2026-07-05, un-deferred 2026-07-07 for the
honest-capture slice; **Layer B (trade-off callout + matches/results surfacing +
reorder-vs-contextualise decision) still deferred** to a UI/UX session.
