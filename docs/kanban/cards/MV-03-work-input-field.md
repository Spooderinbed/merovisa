# MV-03 — Wire or honestly relabel the dead `work` input

**Priority:** P3   **Owner:** agent
**Goal:** The `work` profile section either visibly affects the assessment, or is
honestly labeled optional/context-only — no input that the user fills believing it
matters when no scorer reads it.

## Context links
- Round-1 audit (dead `work` input, same trust-bug class as `goal`-inert): `docs/audits/2026-06-18-full-app-evaluation.md`
- Best-practice principle §4 "every collected input visibly matters, or is honestly labeled optional": `.claude/plans/tender-bouncing-locket.md`
- Profile sections: `lib/profiles/sections.ts`; scorers: `lib/scoring/*`

## Acceptance criteria
- [ ] Decision recorded: does work experience feed scoring (e.g. profile-strength / GS course-relevance), or is it context-only?
- [ ] If it feeds scoring: a scorer reads it and a test proves it moves the relevant dimension.
- [ ] If context-only: the UI labels it optional/context and no copy implies it changes the verdict.

## Test plan
- If wired: characterization test showing the work field changes the intended dimension.
- If relabeled: component test asserting the optional/context framing renders.

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- Light founder steer on intent (does work experience matter for this corridor's verdict?). Default to honest-relabel if unsure (simpler, no scoring churn).

## Risk notes
- Wiring it into scoring ⇒ RULE_VERSION/goldens churn. Relabel is the low-risk default.

## Agent resume notes (cold start)
1. Confirm no scorer references the work section (grep `lib/scoring`).
2. Recommend relabel-as-optional unless the founder wants work experience scored; implement the chosen path test-first.

## Decision log
- 2026-06-18 — Created from round-1 audit (dead-input class).

## Done evidence
_pending_
