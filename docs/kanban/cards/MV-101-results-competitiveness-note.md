# MV-101 — Results-page competitiveness note (MV-99 follow-up)

**Priority:** P1   **Owner:** agent
**Goal:** Surface MV-99's honest competitiveness note on the results page. Today the *"Business is a less competitive admit than Computer Science"* line only appears in the wizard at point-of-choice — a student reviewing their verdict/results never sees it.

## Decision
Compute the note where the profile is in scope (`assembleAssessment`) and carry it on the payload — exactly the pattern `preferenceNote` already uses — then render it near the verdict. The verdict itself stays scored on the **primary** field alone; the note only contextualises the extras (never touches the score).

## Stacking
**Depends on MV-99 (PR #54)** — uses `StudentProfile.alsoConsidering` + `lib/scoring/field-note.ts` (`competitivenessNote`), neither of which is on master yet. Branched off `origin/mv-99-step4-multi-subject`; **PR base = the MV-99 branch (stacked)**. When MV-99 merges, rebase this onto master.

## What shipped
- `lib/results/types.ts` → `AssessmentPayload.competitivenessNote?: FieldCompetitivenessNote | null` (additive, optional — "absent on legacy stored payloads", matching `preferenceNote`/`rulesVerified`).
- `lib/results/assemble.ts` → computes `competitivenessNote(scored.fieldOfStudy, scored.alsoConsidering)` and puts it on the payload.
- `components/results/competitiveness-note.tsx` (new) → small presentational callout (`rounded-md border border-line bg-bg-tint`, the results-callout idiom) with a mono "Also considering" label + the note text; renders nothing when the note is null.
- `components/results/results.tsx` → `<CompetitivenessNote note={payload.competitivenessNote} />` rendered right under `VerdictCard` (both anonymous + owned modes).

## Acceptance criteria
- [x] Payload derives the note for a materially-different also-considering field; null when there are no extras (or none differ materially).
- [x] Results page renders the note under the verdict when present, nothing when absent.
- [x] Verdict/score unchanged — note is presentational context only.

## Test plan / evidence
- `tests/results/assemble.test.ts` +2: derives an "easier" note for CS-primary + Arts-extra (text names both fields); no note when nothing else is considered.
- `tests/components/results/competitiveness-note.test.tsx` (new) +2: renders the text when present; renders nothing when null.
- Gate: `tsc` clean; `eslint` clean (1 pre-existing unrelated `docs/kanban/build.mjs` warning); suite **1624 pass / 1 fail** = pre-existing MV-80 1-July freshness timer, unrelated. Browser-verify skipped (dev port 3000 held by founder's server); RTL + assemble unit tests are the behavioral proof.

## Deferred / future
- Option C (per-field verdicts) — the bigger play MV-99 set up the on-ramp for; when the catalogue + results can carry N verdicts, promote the extras from "exploratory context" to "assessed".
- Echoing the note on the signed-in dashboard/matches surfaces (this slice covers the anonymous + owned results page).

## Agent resume notes
Built + gate-green on branch `mv-101-results-competitiveness-note` (base `origin/mv-99-step4-multi-subject`). Founder-gated merge (never self-merge). Merge order: **MV-99 (#54) before this**. If MV-99 merges first, rebase this onto master and retarget the PR base; regenerate `board.md`/`board.html` via `npm run board` after any board union.
