# Per-field verdicts (Option C) — design

**Card:** MV-102 · **Branch:** `mv-102-per-field-verdicts` (off `origin/master`) · **Date:** 2026-07-04

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
  **compact** banded verdict (Strong / Possible / Reach) beneath it, visibly secondary.
- **Scope: results page only.** Matches, plan, recap, and the wizard are out of scope for this slice.
  (Matches already carry the `field-exploring` exploratory label from MV-99; that stays.)
- **Pivot callout.** When an also-considering field's band strictly **outranks** the primary's, show
  one honest, encouraging callout naming the stronger option — never a "give up" message; an *added*
  realistic path, framed as the student's choice.
- **Principles.** Verdicts come from **real re-scores** (`runAssessment` with `fieldOfStudy` swapped),
  never a heuristic. The primary path is **byte-identical** (goldens unchanged). **No DB / no
  migration** — everything is derived server-side at assembly time.

Rejected: score against the toughest field (needlessly pessimistic); a full per-field results/matches
rework (over-scoped — this slice is results-page-only).

## Why re-scoring per field is valid

`fieldOfStudy` feeds **only** the academic dimension, via `FIELD_COMPETITIVENESS` (the admission
baseline the student's grade is measured against). Every other dimension — financial, visa,
profileStrength — is field-independent. So `runAssessment({ ...profile, fieldOfStudy: X })` is a
correct, self-consistent verdict for "this same student, in field X." No dimension is left stale.

## Architecture

### New pure module — `lib/results/secondary-verdicts.ts`

```ts
export interface SecondaryVerdict {
  field: FieldOfStudy;
  label: string;            // FIELD_LABELS[field]
  verdict: Verdict;         // band from the re-score
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
- `alsoConsidering` empty/undefined → returns `null` (nothing rendered; primary path untouched).
- For each extra field, re-score `runAssessment({ ...profile, fieldOfStudy: field })` and take
  `.verdict`. Preserve the student's chosen order in `items`.
- Band rank via the existing `VERDICTS` index (`strong` 0 → `reach` 2; lower is better).
  `outranksPrimary = rank(extra) < rank(primaryResult.verdict)`.
- `pivot` = the single **best-ranked** field among those that outrank the primary (ties → first in the
  student's order). `null` when none outrank — most students won't get a callout, only a band list.
- Pure and deterministic: no `Date.now`, no I/O. At most two re-scores (cap is 2 extras).

### Assembly — `lib/results/assemble.ts`

Today `result: runAssessment(scored)` is inline in the return literal. Hoist it to a local so the
primary verdict is computed once and reused, then attach the new field:

```ts
const result = runAssessment(scored);           // was inline as `result: runAssessment(scored)`
// ...return { result, ..., secondaryVerdicts: computeSecondaryVerdicts(scored, result) }
```

This hoist is behaviour-preserving (same single call). Because `computeSecondaryVerdicts`
short-circuits to `null` when there are no extras, the primary-only path does **zero** extra scoring
and the payload for a single-field student is unchanged in spirit (new key present but `null`).

### Payload type — `lib/results/types.ts`

```ts
/** Banded verdicts for each "also considering" field, re-scored server-side (Option C / MV-102).
 *  Null when no extras or on legacy stored payloads. Never affects the primary verdict. */
secondaryVerdicts?: SecondaryVerdicts | null;
```

### Display — new `components/results/secondary-verdicts.tsx` (presentational)

Renders nothing when `data` is null/empty. Otherwise a compact, flat block that slots **in place of**
the current `<CompetitivenessNote>` at `results.tsx:77` (see "Relationship to competitivenessNote"):

- A small mono-up label: *"Your standing in other fields you're considering"*.
- One compact row per `items` entry: field label + a band pill reusing the exact verdict colour
  classes already in `verdict-card.tsx` (`bg-strong-tint text-strong`, `bg-possible-tint
  text-possible-ink`, `bg-reach-tint text-reach`) and `VERDICT_LABELS[verdict].label` for the word.
  Compact = clearly subordinate to the main `VerdictCard` (smaller pill, no headline line, no
  disclaimer of its own — the primary card's disclaimer covers the readout).
- When `pivot` is set, one honest callout line below the rows, e.g.
  *"You're a Possible for Business — a stronger standing than your Reach for Computer science. If
  you're open to it, Business may be the more realistic path."* Encouraging, additive, never
  "give up on Computer science." Verdict **words** (not numbers) only — the no-raw-scores rule holds.
- Same design language: warm paper surface, thin border, no gradient/shadow, sentence case.

### Relationship to `competitivenessNote`

The secondary bands **subsume** the standalone text note on the results page: the pivot callout
carries the same "stronger chances there" honesty, now grounded in an actual band rather than an
admission-bar comparison. So on `results.tsx` we **replace** `<CompetitivenessNote>` with
`<SecondaryVerdicts>` (net UX is an upgrade, not two overlapping lines).

`lib/scoring/field-note.ts` (`competitivenessNote`) and the `payload.competitivenessNote` field are
**retained** — they are still valid, tested, and may back a live wizard hint later — but are simply no
longer rendered on the results page. Optionally, `computeSecondaryVerdicts` may fold the
`competitivenessNote` text into the pivot callout as the "why" clause; kept optional to avoid coupling.

## Data flow

`StudentProfile` (already carries `alsoConsidering` from MV-99) → `assembleAssessment` re-scores each
extra → `payload.secondaryVerdicts` → `<Results>` → `<SecondaryVerdicts>`. No client scoring, no new
API, no DB. The engine is never modified.

## Error handling / edge cases

- No extras → `null` → nothing renders (the common case).
- Legacy stored payloads (no `secondaryVerdicts` key) → optional field, renders nothing. No migration.
- An extra equal to or weaker than the primary → its band still shows (honest), just no pivot.
- Multiple outrank the primary → one callout for the strongest only (no wall of callouts).
- `alsoConsidering` is already validated (≤2, excludes primary, deduped) upstream in MV-99's Zod —
  no re-validation here.

## Testing (TDD — write failing first)

- **Byte-identical safety net:** `tests/scoring/characterization.test.ts` goldens unchanged; add an
  assertion that a payload for a single-field profile has `secondaryVerdicts === null`.
- `computeSecondaryVerdicts`:
  - empty/undefined `alsoConsidering` → `null`.
  - each extra's band equals `runAssessment` with that field swapped (drive with a fixture whose
    primary and an extra land in different bands).
  - `outranksPrimary` true only when strictly stronger; order preserved.
  - `pivot` picks the strongest outranking field; `null` when none outrank; ties → first.
- `<SecondaryVerdicts>`: renders nothing for null; renders one pill per item with the right band
  class/word; renders the callout only when `pivot` set; band words come from `VERDICT_LABELS`.
- `<Results>`: `competitivenessNote` render is gone, `SecondaryVerdicts` present; primary `VerdictCard`
  untouched.
- Gate: `npm run typecheck` + `npm run lint` + `npm test` green.

## Verification (end-to-end)

`npm run dev` → complete `/assess` with a primary that lands **Reach** and an also-considering field
known to be an easier admit (e.g. primary Computer science, extra Business) on a mid profile → results
shows the primary Reach card unchanged, a compact "Business — Possible" band beneath it, and the pivot
callout. Re-run with a single field → no secondary block, verdict identical to before.

## Files

- New: `lib/results/secondary-verdicts.ts`, `components/results/secondary-verdicts.tsx`
- Edit: `lib/results/assemble.ts` (attach field), `lib/results/types.ts` (payload key),
  `components/results/results.tsx` (swap `<CompetitivenessNote>` → `<SecondaryVerdicts>`)
- Tests: `tests/results/secondary-verdicts.test.ts`,
  `tests/components/results/secondary-verdicts.test.tsx`, plus the characterization assertion.

## Bookkeeping

- Kanban card **MV-102** created on this branch (branch cut **before** editing `board.json`, per the
  branch-hygiene lesson). Regenerate views with `npm run board`.
- **Fold the board reconciliation into this branch:** flip MV-80 / MV-99 / MV-100 / MV-101 from
  `inreview` → `done` in the same `board.json` edit, so the already-merged cards reconcile when this
  PR merges — avoiding a separate founder-gated master push for pure bookkeeping.
- Merge to master is **founder-gated**: build + push branch + open PR, leave the merge.

## Deferred (future slices)

Per-field **match sections** or a field switcher; per-field **plan** guidance; promoting the primary
itself to a chooser. This slice is results-page verdicts only — the smallest honest promotion of the
also-considering fields.
