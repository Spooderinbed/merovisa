# Per-field verdicts (Option C) — design

**Card:** MV-102 · **Branch:** `mv-102-per-field-verdicts` (off `origin/master`) · **Date:** 2026-07-04

> **Rev 2 (2026-07-04):** revised after a Claude-5 (xhigh) 3-lens review. Changes: signed-in
> data-flow path fixed (blocker), matches-page label reconciled in-slice (blocker), validation gap
> closed, subordination/framing tightened, pivot copy softened, determinism boundary named, tests
> added. See "Review resolutions" at the end.
>
> **Rev 3 (2026-07-04):** revised after an independent Codex (GPT-5.5 xhigh) review of rev 2. Three
> more must-fixes folded (signed-in stale-extras clear bug, AI-guide grounding gap, pivot cutoff-margin
> honesty) plus build details. See "Rev 3 — Codex review additions".

## Problem

MV-99 lets a student pick a **primary** field plus up to two **also-considering** fields. Today
those extras only widen the university list and earn a single muted text line on the results page
(`competitivenessNote`, rendered by `<CompetitivenessNote>` at `components/results/results.tsx:77`),
e.g. *"Business is a less competitive admit than Computer science, so your chances there may be
stronger."*

That line hints at an opportunity but never names it. A Nepali student who is **Reach for Computer
science** but **Possible for Business** cannot see that concrete pivot — and not seeing it is exactly
the kind of self-serve dead-end that sends them to a consultancy. Option C promotes the
also-considering fields from an exploratory hint to **real banded verdicts** on the results page, so
the student sees their standing in each field and can make an informed pivot themselves.

## Decision (locked in brainstorming)

- **(A) Primary anchors, secondaries are compact bands.** The main `VerdictCard` is unchanged — it
  is still the verdict, scored on the primary field alone. Each also-considering field gets its own
  **compact** banded verdict (Strong / Possible / Reach) beneath it, visibly secondary and clearly
  labelled as conditional on switching field (see Display).
- **Scope: results page only, plus the two integrity fixes this slice's existence forces** (the
  signed-in data-flow gap and the matches-page label — see below). Plan and wizard stay as-is.
- **Pivot callout.** When an also-considering field's band strictly **outranks** the primary's, show
  one honest, low-pressure callout naming the stronger option — an *added* option framed as the
  student's choice, never "give up" and never an over-promise.
- **Principles.** Verdicts come from **real re-scores** (`runAssessment` with `fieldOfStudy` swapped),
  never a heuristic. The primary path is **byte-identical** (goldens unchanged). **No DB / no
  migration** — everything is derived server-side at assembly time.

Rejected: score against the toughest field (needlessly pessimistic); a full per-field results/matches
rework (over-scoped — this slice is results-page-only).

## Why re-scoring per field is valid

`fieldOfStudy` feeds **only** the academic dimension, via `FIELD_COMPETITIVENESS` (the admission
baseline the student's grade is measured against). **No other dimension's scoring logic branches on
`fieldOfStudy`** — verified against `lib/scoring/{financial,visa,profile-strength}.ts` (zero
references). So `runAssessment({ ...profile, fieldOfStudy: X })` is a correct, self-consistent verdict
for "this same student, in field X."

Honest caveat (do **not** over-claim in copy): the financial dimension's DHA-capacity gate uses one
flat representative tuition figure (`AU_REPRESENTATIVE_TUITION_AUD`) for all fields, even though real
tuition varies by field. So a field swap moves the **academic baseline** — it does **not** re-cost the
student. The pivot copy must therefore speak only to the band/standing, never imply the whole
financial or visa picture improves with a switch.

## Architecture

### New pure module — `lib/results/secondary-verdicts.ts`

```ts
export interface SecondaryVerdict {
  field: FieldOfStudy;
  label: string;            // FIELD_LABELS[field]
  verdict: Verdict;         // ONLY the band is kept from the re-score (see determinism)
  outranksPrimary: boolean; // strictly stronger band than the primary
}

export interface SecondaryVerdicts {
  items: SecondaryVerdict[];      // one per also-considering field, primary order preserved
  pivot: SecondaryVerdict | null; // strongest field that outranks the primary (drives the callout)
}

export function computeSecondaryVerdicts(
  profile: StudentProfile,
  primaryResult: AssessmentResult,
): SecondaryVerdicts | null;
```

Behaviour:
- **Defensive input hygiene (load-bearing):** filter `profile.alsoConsidering` to exclude the primary
  `fieldOfStudy` and dedupe, *inside this function*, before doing anything. This is the load-bearing
  guard because not every write path validates disjointness (the signed-in `IntendedStudyPatch`
  doesn't — see Error handling). After filtering, empty/undefined → return `null`.
- For each remaining extra field, re-score `runAssessment({ ...profile, fieldOfStudy: field })` and
  keep **only** `.verdict`. Preserve the student's chosen order in `items`.
- **Determinism:** `runAssessment` stamps `computedAt: new Date().toISOString()`; this function keeps
  only `.verdict` per re-score, so its output is deterministic and never leaks `weighted`,
  `dimensions`, or `computedAt`. A test asserts `SecondaryVerdict` carries no numeric score (keeps the
  no-raw-scores rule airtight at the type level).
- Band rank via the existing `VERDICTS` index (`strong` 0 → `reach` 2; lower is better).
  `outranksPrimary = rank(extra) < rank(primaryResult.verdict)`.
- `pivot` = the single **best-ranked** field among those that outrank the primary (ties → first in the
  student's order). `null` when none outrank — which, per the band distribution, is the common case:
  most students get a band list with **no** callout.
- Pure: at most two extra `runAssessment` calls, no I/O.

### Assembly — `lib/results/assemble.ts`

Today `result: runAssessment(scored)` is inline in the return literal. Hoist it to a local so the
primary verdict is computed once and reused, then attach the new field:

```ts
const result = runAssessment(scored);           // was inline as `result: runAssessment(scored)`
// ...return { result, ..., secondaryVerdicts: computeSecondaryVerdicts(scored, result) }
```

Behaviour-preserving (same single primary call). For a single-field student `computeSecondaryVerdicts`
short-circuits to `null` → zero extra scoring, payload unchanged in spirit (new key present but null).

### Both data-flow paths must carry `alsoConsidering`

`assembleAssessment` is fed a `StudentProfile` from **two** builders, and the feature is only live if
both carry the extras:

1. **Anonymous wizard** → `lib/profiles/from-assessment.ts` — already forwards `alsoConsidering`
   (MV-99). ✔
2. **Signed-in re-score** → `lib/scoring/from-sections.ts` `sectionsToStudentProfile` →
   `lib/assessments/re-score.ts` `reScoreAssessment` (used by `/api/assess`, `/api/assess/refresh`,
   `/api/profile/section`). **Currently drops it:** `from-sections.ts:47` maps `study?.field` but
   never `study?.alsoConsidering`. **Fix:** add `alsoConsidering: study?.alsoConsidering` to the
   returned object. (This also un-darks MV-99's existing `competitivenessNote` for signed-in users — a
   latent gap this slice closes.)

### Payload type — `lib/results/types.ts`

```ts
/** Banded verdicts for each "also considering" field, re-scored server-side (Option C / MV-102).
 *  Null when no extras or on legacy stored payloads. Never affects the primary verdict. */
secondaryVerdicts?: SecondaryVerdicts | null;
```

### Display — new `components/results/secondary-verdicts.tsx` (presentational)

Prop type mirrors the sibling `CompetitivenessNote` (three states):
`{ data: SecondaryVerdicts | null | undefined }` — renders nothing for null/undefined/empty. This
slots **in place of** `<CompetitivenessNote>` at `results.tsx:77`.

When populated, a compact flat block, clearly subordinate to the primary `VerdictCard`:

- **Conditional framing is mandatory, not implied.** The section label states the hypothetical
  outright — e.g. *"Your standing if you applied under a different field"* — and **each row restates
  the conditional in the same visual unit as the pill**, not a bare "Business — Possible". Format:
  *"If you applied under Business instead — Possible."* This is what stops a student reading a
  secondary Strong/Possible pill next to a primary Reach card as their *actual* standing. The shared
  `VerdictDisclaimer` is generic and does **not** carry this distinction, so the label/rows must.
- Band pill reuses the exact verdict colour classes from `verdict-card.tsx` (`bg-strong-tint
  text-strong`, `bg-possible-tint text-possible-ink`, `bg-reach-tint text-reach`) and
  `VERDICT_LABELS[verdict].label` for the word. **Words only — no numeric score.**
- **Static reveal:** secondary pills render **without** `animate-rise`/`animate-settle`, so the
  primary card keeps its deliberate two-beat motion emphasis (audit #25) and the hierarchy holds.
- When `pivot` is set, one honest, low-pressure callout below the rows. Copy names the band difference
  **without an editorial recommendation** — e.g. *"You'd be a Possible under Business — a stronger
  band than your Reach under Computer science. Worth exploring if a switch appeals to you."* No "the
  more realistic path", no implication the cost/visa picture changes. Verdict **words** only.
- Design language: warm paper surface, thin border, no gradient/shadow, sentence case.

> Visual weight can't be fully judged from prose — a wireframe/screenshot check during build (results
> is auth-gated, so verify via a fixture render/RTL snapshot) before finalising the subordination.

### Matches-page label reconciliation (in-slice — blocker)

`lib/matches/compute.ts:177` renders the `field-exploring` reason as
*"In a field you're also considering — not covered by your verdict."* Once MV-102 gives that field a
real band on results, "not covered by your verdict" becomes **false** — a direct cross-surface trust
contradiction. Because this slice *causes* the regression, it fixes it here: reword the string to drop
the false clause while keeping the honest "this isn't your primary field" signal, e.g.
*"In a field you're also considering — not your primary field."* (No renderer change; the reason
renders `reason.text`.)

### Relationship to `competitivenessNote`

On the results page we **replace** `<CompetitivenessNote>` with `<SecondaryVerdicts>`. Honest
trade-off (not a pure superset): `competitivenessNote` fires on any competitiveness-weight gap
≥ 10 points **regardless of band** — it can speak even when both fields land in the *same* band —
whereas the pivot callout fires only when a band is *strictly* outranked. So for same-band extras the
old "easier/tougher admit" line disappears with nothing replacing it. We accept this consciously: a
real re-scored band is a higher-trust signal than a raw weight heuristic, and the per-row band list
still shows the standing for every extra. `lib/scoring/field-note.ts` and the
`payload.competitivenessNote` field are **retained** (still tested; may back a wizard hint later),
just no longer rendered on results.

## Data flow

`StudentProfile` (carrying `alsoConsidering` from **either** builder above) → `assembleAssessment`
re-scores each extra → `payload.secondaryVerdicts` → `<Results>` → `<SecondaryVerdicts>`. No client
scoring, no new API, no DB. The engine is never modified.

## Error handling / edge cases

- No extras (after defensive filtering) → `null` → nothing renders (the common case).
- Legacy stored payloads (no `secondaryVerdicts` key) → optional field, renders nothing. No migration.
- An extra equal to or weaker than the primary → its band still shows (honest), just no pivot.
- Multiple outrank the primary → one callout for the strongest only (no wall of callouts).
- **Validation gap:** the wizard's `ProfileSchema` enforces disjoint + no-dupes via `.refine`, but the
  signed-in `IntendedStudyPatch` (`lib/validation/profile-section.ts:41`) has only `.max(2)`. Primary
  defense is the **in-function filter** in `computeSecondaryVerdicts` (covers every path). We **also**
  add the matching disjoint/dedup `.refine` to `IntendedStudyPatch` for write-path parity, so bad data
  never persists in the first place.

## Testing (TDD — write failing first)

- **Byte-identical safety net:** `tests/scoring/characterization.test.ts` goldens unchanged; add an
  assertion that a payload for a single-field profile has `secondaryVerdicts === null`.
- `computeSecondaryVerdicts`:
  - empty/undefined `alsoConsidering` → `null`.
  - **defensive filter:** an extra equal to the primary, or a duplicate, is dropped before scoring.
  - each extra's band equals `runAssessment` with that field swapped (fixture where primary and an
    extra land in different bands).
  - `outranksPrimary` true only when strictly stronger; order preserved.
  - **common case (named explicitly):** two extras, *neither* outranking → `items` fully populated,
    `pivot === null`.
  - `pivot` picks the strongest outranking field; `null` when none; ties → first.
  - **boundary-straddle:** primary and an extra sit just either side of a verdict cutoff (small
    underlying gap) → band differs but the type still carries only `.verdict`; confirms the callout
    can't overstate a marginal difference.
  - **no-leak:** `SecondaryVerdict` never carries `weighted` / `dimensions` / `computedAt`.
- **Signed-in mapping:** `sectionsToStudentProfile` forwards `alsoConsidering` — round-trip test
  mirroring the existing dependents-mapping tests in `tests/scoring/from-sections.test.ts`.
- **Validation:** `IntendedStudyPatch` rejects an `alsoConsidering` containing the primary / a
  duplicate; accepts a valid disjoint pair.
- `<SecondaryVerdicts>`: renders nothing for null/undefined; one row per item with the right band
  class/word and the conditional framing; callout only when `pivot` set; words from `VERDICT_LABELS`.
- **Matches label:** the `field-exploring` reason text no longer contains "not covered by your
  verdict" (guards the reconciliation from regressing).
- `<Results>`: `CompetitivenessNote` render gone, `SecondaryVerdicts` present; primary `VerdictCard`
  untouched.
- Gate: `npm run typecheck` + `npm run lint` + `npm test` green.

## Verification (end-to-end)

`npm run dev` → complete `/assess` with a primary that lands **Reach** and an also-considering field
known to be an easier admit (e.g. primary Computer science, extra Business) on a mid profile → results
shows the primary Reach card unchanged, a compact "If you applied under Business instead — Possible"
row beneath it, and the pivot callout. Re-run with a single field → no secondary block, verdict
identical. Signed-in: set an also-considering field in the profile editor, re-score → the bands appear
(proves the `from-sections` path). Click through to matches → the exploring label no longer says "not
covered by your verdict".

## Files

- New: `lib/results/secondary-verdicts.ts`, `components/results/secondary-verdicts.tsx`
- Edit: `lib/results/assemble.ts` (hoist + attach), `lib/results/types.ts` (payload key),
  `components/results/results.tsx` (swap `<CompetitivenessNote>` → `<SecondaryVerdicts>`),
  `lib/scoring/from-sections.ts` (forward `alsoConsidering`),
  `lib/matches/compute.ts` (reword `field-exploring` text),
  `lib/validation/profile-section.ts` (disjoint/dedup `.refine` on `IntendedStudyPatch`)
- Tests: `tests/results/secondary-verdicts.test.ts`,
  `tests/components/results/secondary-verdicts.test.tsx`, additions to
  `tests/scoring/from-sections.test.ts`, `tests/scoring/characterization.test.ts`, a matches-label
  assertion, and a `profile-section` validation test.

## Bookkeeping

- Kanban card **MV-102** created on this branch (branch cut **before** editing `board.json`, per the
  branch-hygiene lesson). Regenerate views with `npm run board`.
- **Fold the board reconciliation into this branch:** flip the already-merged cards from `inreview`
  → `done` in the same `board.json` edit. Reconcile the exact id set against `board.json` first (the
  review flagged MV-100 may not have a board entry despite a card file existing) — flip only ids that
  are actually present and `inreview`: MV-80, MV-99, MV-101, and MV-100 if present.
- Merge to master is **founder-gated**: build + push branch + open PR, leave the merge.

## Deferred (future slices)

Per-field **match sections** or a field switcher; per-field **plan** guidance; promoting the primary
itself to a chooser; field-accurate tuition in the financial dimension. This slice is results-page
verdicts + the two integrity fixes it forces — the smallest honest promotion of the also-considering
fields.

## Rev 3 — Codex (GPT-5.5 xhigh) review additions

Codex confirmed the design is technically sound and the byte-identical-goldens claim is true, but
surfaced three more must-fixes (all trust/correctness, none in rev 2) plus build details. Folded in:

### Must-fix

**M1. Signed-in extras can't be cleared (stale bands).** `components/profile/editors/study-career-editor.tsx:80`
only sends `alsoConsidering` when non-empty, and `lib/profiles/repo.ts:56` shallow-merges the patch —
so a student who removes all extras never actually clears them, and MV-102 would show secondary bands
for fields they dropped. **Fix:** the editor **always** sends `alsoConsidering` (an empty array when
none) whenever it saves the intended-study section, so the merge clears it. Regression test: a full
clear removes the extras from persisted sections and the next `reScoreAssessment` yields
`secondaryVerdicts === null`. (Pairs with the rev-2 `from-sections` forward — both are required for the
signed-in path to work end-to-end.)

**M2. AI guide would be blind to the new bands.** `lib/guide/context.ts:91` emits overall standing,
factors, and top matches but not secondary verdicts, so the live guide could contradict a band the
student sees on the page. **Fix:** add `payload.secondaryVerdicts` to `buildGuideContext` as
**field-label + band-word only** (no raw scores — consistent with the no-scores rule). Test asserts the
guide context carries them.

**M3. Pivot callout must not overstate a knife-edge flip.** `lib/scoring/verdict.ts:12` uses strict
cutoffs with no margin, and `tests/scoring/characterization.test.ts:493` pins a one-point band flip —
so a pivot could fire on a substantively tiny difference. **Resolution (default):** the row-level bands
**always render** (honest facts); the pivot **callout copy explicitly frames it as a rules-based band
comparison that can shift near our thresholds** and drops any "more realistic path" phrasing. If that
framing reads as too hedged during build, the fallback is to gate the callout on a small internal
`weighted` margin beyond the cutoff (computed inside `computeSecondaryVerdicts`, never shown). Add a
TDD case at a cutoff boundary.

### Build details (lower-priority, folded)

- The matches reword **breaks** `tests/matches/compute.test.ts:193,212` (they assert
  `/not covered by your verdict/i`) — update those assertions to the new wording as part of the reword.
- Put the new payload assertions in `tests/results/assemble.test.ts` (not characterization).
- Reuse the existing `ALSO_CONSIDERING_CAP` constant (`lib/validation/profile.ts:16`) for the
  `IntendedStudyPatch` cap + refine — no new magic `.max(2)`.
- The pivot callout uses `role="note"` (matching `components/ui/verdict-disclaimer.tsx:21`) and is
  non-colour-reliant (the word label carries the meaning, not the tint alone).

**Files added to scope by rev 3:** `components/profile/editors/study-career-editor.tsx`,
`lib/guide/context.ts` (+ their tests). `lib/profiles/repo.ts` is not edited — the clear is fixed at
the editor boundary.

### Out of scope — pre-existing, surfaced for separate tracking

- **Anonymous expiry copy lies after session restore:** `components/results/conversion-paths.tsx`
  recomputes "now + 3 days" instead of using the stored `expiresAt` (`components/assess/assess-flow.tsx:19`).
  A real trust bug, but pre-existing and unrelated to MV-102 — filed as its own task, not bundled.
- Catalogue `Program.field` is a plain string matched by exact equality, with seeded fields
  (`project-management`, `pharmacy`, `social-work`) that don't map to the profile field enum — a
  pre-existing matching-looseness note, informational only.

## Review resolutions (Claude-5 xhigh, 3-lens)

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | blocker | Signed-in re-score drops `alsoConsidering` (feature ships dark) | `from-sections.ts` forwards it; data-flow section + round-trip test added |
| 2 | blocker | Matches `field-exploring` label "not covered by your verdict" becomes false | Reworded in-slice to "not your primary field"; guard test added |
| 3 | should-fix | `IntendedStudyPatch` lacks disjoint/dedup validation | In-function defensive filter (primary) + parity `.refine` added |
| 4 | should-fix | Subordination/framing only in prose | Mandatory per-row conditional framing + explicit label; wireframe check |
| 5 | should-fix | Pivot copy overstates a marginal, cutoff-adjacent difference | Softened to band-only ("worth exploring"), no "realistic path"; boundary test |
| 6 | should-fix | "No dimension left stale" overstates (flat tuition) | Reworded to "no scoring logic branches on field"; copy caveat added |
| 7 | opt | Replace loses same-band easier/harder signal | Documented as a conscious trade-off (not a superset) |
| 8 | opt | Determinism relies on discarding `computedAt` | Named as load-bearing; no-leak test added |
| 9 | opt | Secondary pills could dilute primary motion | Render static (no `animate-*`) |
| 10 | opt | Common no-pivot case untested | Added as an explicit named test |
