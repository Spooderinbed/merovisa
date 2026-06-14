# Preference-fit matching (Slice ⑦)

**Date:** 2026-06-14
**Status:** Approved — ready for implementation plan
**Lane:** value-triage / trust-maintenance

## Problem

The wizard's step 9 asks *"What matters most to you?"* and promises: *"This shapes
how we rank your matches — same profile, different priorities, different results."*

That promise is currently **false twice over**:

1. The goal **is collected and persisted** (`sections.career.goal`) but
   `sectionsToMatchInputs` never reads it, so the signed-in matcher never sees it.
2. The signed-in matcher (`lib/matches/compute.ts`) **does no ordering at all** —
   it maps programs → results and filters; order is whatever the DB returns. The
   only differentiation is the eligibility verdict.

The anonymous matcher (`lib/matching/universities.ts`, deprecated but live) *does*
sort, but by a **hardcoded** band → `rankingTier` tie-break — not by the user's goal.

So a student who picks "lowest total cost" and one who picks "highest-ranked" get
the identical list. This slice makes the list actually respond to the chosen goal,
honestly — ranking only on goals we have real per-item data for, and saying so
plainly for the goals we don't.

## Goals

- Wire the existing `goal` choice into match ordering on **both** result surfaces.
- Separate **eligibility fit** (the verdict — unchanged) from **preference fit**
  (within-band ordering + a "why this fits" chip).
- Be honest where data is missing: no fabricated preference signal.
- Fix the wizard overpromise.

## Non-goals

- No new profile field, no DB migration (`goal` already persists).
- No change to the assessment scoring engine, `ruleVersion`, `configVersion`, or
  any golden. This changes match *order*, not verdict scoring.
- No user-facing numeric "preference score" (the product never shows percentages).
  Preference fit is expressed as **order + chip + note**, not a number.
- No proxy/guessed ranking for goals we can't source (rejected: violates the lane).

## The two matching paths

| | Signed-in `/matches` | Anonymous results |
|---|---|---|
| Matcher | `lib/matches/compute.ts` (`computeMatches`) | `lib/matching/universities.ts` (`matchUniversities`, **deprecated**) |
| Item shape | `MatchResult` (`Program` + `University`, DB) | `UniversityMatch` (`UniversityData`, static) |
| Tuition | `Program.tuitionMin` (AUD) | `university.tuitionUsdPerYear.min` (USD) |
| Intakes | per-program `intakes: string[]` | **none** (corridor-level only) |
| Ranking today | none (DB order) | band → hardcoded `rankingTier` |
| Goal available? | from `sections.career.goal` | from `profile.goal` (passed whole) |

Currency differs, but tuition is only ever compared **within a single list**, so no
conversion is needed — "below band median tuition" is computed per-list.

## Architecture — one shared helper, two adapters

New `lib/matches/preference.ts` (server-only — imported by `assemble.ts` and the
`/matches` server component; never by a client component):

```ts
export interface PreferenceSignals {
  rankingTier: number;          // 1–3
  tuition: number | null;       // comparable within the list (any currency)
  nearestIntake: number | null; // epoch ms of soonest upcoming intake, or null
}

export interface PreferenceAdapter<T> {
  band: (t: T) => "strong" | "possible" | "reach";
  signals: (t: T, now: Date) => PreferenceSignals;
  withChip: (t: T, chip: { text: string } | null) => T;
}

export interface PreferenceOutcome<T> { items: T[]; note: PreferenceNote | null }

export function applyPreference<T>(
  items: T[], goal: Goal | null, adapter: PreferenceAdapter<T>, now?: Date,
): PreferenceOutcome<T>;
```

`PreferenceNote` and `preferenceChip` are **rendered** and ride in the payload, so
they live in the client-safe `lib/matches/types.ts`; `preference.ts` imports them.
The scoring-adjacent *logic* (thresholds, copy, the 485 import) stays in `preference.ts`:

```ts
// lib/matches/types.ts
export type PreferenceNote =
  | { kind: "ranked"; text: string }
  | { kind: "deferred"; text: string }
  | { kind: "pr-context"; before: string; linkText: string; after: string;
      source: { href: string; lastVerified?: string } };
```

The helper owns **all** preference decisions — sort keys, chip thresholds, note copy,
and rankability detection — so the two surfaces can never drift. Each call site
supplies a thin adapter:

- **Signed-in adapter:** `band` from verdict; `rankingTier` from `university.rankingTier`;
  `tuition` from `program.tuitionMin`; `nearestIntake` from `program.intakes` mapped to
  the soonest upcoming month (token map below); `withChip` sets `MatchResult.preferenceChip`.
- **Anonymous adapter:** `band` from `matchLevel`; `rankingTier` from `university.rankingTier`;
  `tuition` from `university.tuitionUsdPerYear.min`; `nearestIntake` always `null`;
  `withChip` sets `UniversityMatch.preferenceChip`.

`applyPreference` sorts **stably within band** (band is the primary key; the verdict
is never crossed) and returns the same array shape it received, decorated. `goal = null`
returns items unchanged with `note = null` (current behaviour preserved).

### Intake token map (signed-in only)

`Program.intakes` holds tokens like `["feb"]`. `preference.ts` maps known AU intake
tokens (`jan feb mar … nov`) to month numbers, finds the soonest month strictly after
`now` across a program's tokens, and yields its epoch ms. Empty/unparseable → `null`
(program sorts last, no chip).

## Per-goal behaviour

| Goal | Signed-in | Anonymous |
|---|---|---|
| **highest-ranked** | sort `rankingTier` asc · chip `Tier-1 ranked` (tier 1 only) · ranked note | same (tier was already the tie-break) · chip · ranked note |
| **lowest-cost** | sort `tuitionMin` asc · chip `Lower tuition` (below band median) · ranked note | sort `tuitionUsd` asc · chip · ranked note |
| **fastest-admission** | sort nearest-intake asc · chip `Next intake — {Mon Year}` (≤ 6 months) · ranked note | **not rankable** → eligibility order · no chip · deferred note |
| **permanent-residency** | eligibility order · no chip · PR-context note | same |
| **best-employment** | eligibility order · no chip · deferred note | same |
| **research** | eligibility order · no chip · deferred note | same |
| *(unset)* | current DB order · no note/chip | current tier-tie-break order · no note/chip |

Only the active goal's chip type ever appears, so a card shows at most one preference chip.

### Chip thresholds (v1)

- `Tier-1 ranked` — `rankingTier === 1` only.
- `Lower tuition` — `tuition` strictly below the **median** of non-null tuitions in
  that band; null tuition → no chip, sorted last.
- `Next intake — {Mon Year}` — nearest upcoming intake within **6 months** of `now`.

## Copy (signed off)

**Chips:** `Tier-1 ranked` · `Lower tuition` · `Next intake — Feb 2027`

**Notes** (rendered above the groups / list):

- ranked: `Ordered by your priority: {highest-ranked university | lowest total cost | fastest admission}.`
- deferred (employment): `We don't yet have program-level employment data, so these matches stay ordered by eligibility.`
- deferred (research): `We don't yet have program-level research data, so these matches stay ordered by eligibility.`
- deferred (fastest-admission, anonymous only): `Intake timing is shared across these university-level results, so these matches stay ordered by eligibility. Program-level intake sorting appears after sign-in.`
- PR-context: `You chose permanent residency. Australia has post-study pathways such as the `**Subclass 485 Temporary Graduate visa**` after eligible study. We don't rank individual programs by PR outcome, so these matches stay ordered by eligibility.`
  (the bold span links the 485 via `au-temporary-graduate-visa.ts`, SourceAnchor pattern)

**Wizard step-9 subtext (replaces the overpromise):**
`We use this to order and label your matches around what you care about — where we have the data to.`

## Data flow

- **Signed-in** (`app/(app)/matches/page.tsx`, server component): after
  `computeMatches`, call `applyPreference(matches, sections.career?.goal ?? null,
  signedInAdapter)`; render the note above the `VerdictGroup`s; pass chipped matches down.
- **Anonymous** (`lib/results/assemble.ts`, server-side): wrap `matchUniversities(profile)`
  in `applyPreference(..., profile.goal, anonAdapter, now)`; put the sorted+chipped
  matches and the `PreferenceNote` into `AssessmentPayload`. `results.tsx` (client) and
  `university-matches.tsx` (client) render them as **plain data** — no logic crosses the
  client boundary (payload-carried provenance, consistent with prior slices).

The peek-through gate slices the first 3 — so preference order now decides which 3 a
signed-out user sees free. The note renders above the gate for everyone.

## Types & components

- `lib/matches/types.ts` — `MatchInputs.goal: Goal | null`; `MatchResult.preferenceChip?: { text: string } | null`; the `PreferenceNote` type (client-safe).
- `lib/matches/from-sections.ts` — read `sections.career?.goal ?? null`.
- `lib/matching/universities.ts` — `UniversityMatch.preferenceChip?` (type only; base sort stays as the `goal=null` default).
- `lib/results/types.ts` — `AssessmentPayload.preferenceNote: PreferenceNote | null`.
- `lib/results/assemble.ts` — apply the anonymous preference pass.
- `app/(app)/matches/page.tsx` — apply the signed-in preference pass + render note.
- `components/matches/program-card.tsx` — render `preferenceChip`.
- `components/matches/preference-note.tsx` — **new**, presentational note (shared by both surfaces; renders the optional 485 SourceAnchor for `pr-context`).
- `components/results/results.tsx` / `university-matches.tsx` — render `preferenceChip` + the note.
- `components/wizard/steps/goal-step.tsx` — subtext copy.

## Testing

- `tests/matches/preference.test.ts` (**new**): within-band stability, sort keys per
  goal, chip thresholds (tier-1 / below-median / 6-month), null handling, rankability
  detection (incl. fastest-admission deferring when all `nearestIntake` are null), and
  note copy as copy-locks.
- `tests/matches/from-sections.test.ts` — goal passthrough.
- `tests/matches/compute.test.ts`, `tests/matching/universities.test.ts` — optional-field shape (non-breaking).
- `tests/results/assemble.test.ts` — `preferenceNote` + sorted matches in the payload.
- Component tests — chip + note render on both surfaces; `goal-step` subtext copy-lock.

## Lane / governance safety

- **No scoring/golden movement** — verdict engine untouched; goldens byte-identical;
  `ruleVersion`/`configVersion` unchanged.
- **Client-bundle safety** — `preference.ts` is server-only; components import the type
  and receive computed data as props; the 485 source rides in the payload.
- **Data governance** — the PR note gives `au-temporary-graduate-visa.ts` its first
  user-facing surface. Rerun `FLIP_STATUS=1` to capture any findingRef usage change;
  if it flips, record it in the slice report. No value-reconcile (the note cites the
  pathway's existence, not a number).
- **Copy** — all user-facing strings signed off above; no further copy ships without sign-off.

## Resolved: anonymous fastest-admission

`fastest-admission` is honestly **deferred in the anonymous list** because
`UniversityData` carries no per-university intake (intakes are corridor-level). It
ranks once signed in (program-level). **Decision:** keep an explicit note — a silent
fall-through would feel broken since the student chose this goal in the wizard — and
say sorting returns at program level after sign-in. The locked copy is in the Copy
section above.
