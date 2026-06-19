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
- [x] Decision recorded: does work experience feed scoring (e.g. profile-strength / GS course-relevance), or is it context-only? — **DECIDED: context-only.** No scorer reads `work.title/years/relevance`. `work.title` tailors the document checklist (employment-letter/salary-slip); the verdict's "Work experience" credit comes from the *separate* `gapReasons: "worked"` signal, not this section. Relevance/years are stored but read by nothing. Relabel chosen over wiring (founder steer + the risk note: wiring ⇒ RULE_VERSION/goldens churn).
- [~] If it feeds scoring: a scorer reads it and a test proves it moves the relevant dimension. — **N/A** (context-only path taken; no scoring change, goldens untouched).
- [x] If context-only: the UI labels it optional/context and no copy implies it changes the verdict. — **DONE** (`WorkGapEditor` now opens with "Optional. Your role helps tailor your document checklist — it doesn't change your verdict.").

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
- 2026-06-19 — Recon (Explore agent) corrected the card's "dead input" premise: the section isn't fully dead — `work.title` drives the checklist generator (`lib/checklist/generator.ts`, employment-letter + salary-slip). The real trust bug is narrower: the `Relevance` dropdown (Directly related/Related/Unrelated) and `Years` *imply* a verdict effect (classic GS course-relevance / experience signals) but no scorer reads them; profile-strength's "Work experience" factor keys off `gapReasons.includes("worked")`, a different input. Chose the **context-only relabel** (card default + founder steer "honestly relabel optional"). Wiring relevance/years into profile-strength remains a deferred option (would need a RULE_VERSION bump + golden re-review) — not done here.

## Done evidence

**DONE locally 2026-06-19 (NOT pushed; awaiting founder GO). Gate green: typecheck clean, lint 0 errors, 1115/1115 tests (+1).** No scorer/data value changed → `golden-assessments.json` byte-identical, no version bump.

- **`components/profile/editors/work-gap-editor.tsx`** — the work block now opens with one honest framing line: "Optional. Your role helps tailor your document checklist — it doesn't change your verdict." Labels it optional + states its real effect (checklist) + explicitly denies a verdict effect, resolving the implication left by the un-disclaimed Relevance/Years inputs. TDD'd: `tests/components/profile/work-gap-editor.test.tsx` asserts both the checklist-context framing and the "doesn't change your verdict" disclaimer render (failing test first).
- No change to the field shape, persistence, validation, or the checklist consumer — surgical copy-only fix.
