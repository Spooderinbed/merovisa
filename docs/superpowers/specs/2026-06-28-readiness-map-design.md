# Dashboard "readiness map" — design (MV-74)

**Date:** 2026-06-28 · **Card:** MV-74 · **Branch:** `mv-74-readiness-map` (off master)

> **Supersedes** the global "where-am-I" journey rail design
> (`2026-06-28-global-journey-rail-design.md`, committed on the abandoned
> `mv-74-global-journey-rail` branch). That design was **considered and rejected** after a
> student-UX validation pass (Codex gpt-5.5 + a dashboard read): a linear "step N of 6" rail
> imposed a false funnel on an anxious, non-linear student, largely duplicated the existing
> `PromptCard` (next step) + `StatsRow` (progress), and the always-on global marker was nagging
> chrome. The founder chose to build the "bigger and better" alternative captured here.

## Purpose

When a student signs in, their real question is **not** "where am I in MyVisa?" — it is
*"can I realistically study in Australia, and what's holding me back?"* The dashboard already
shows a single banded verdict (Strong / Possible / Reach) via `SnapshotCard`, but that one band
hides the four scored dimensions underneath it. This slice **decomposes the verdict into an
honest readiness map** — what's strong, what needs work, what's a risk — so the student sees
exactly what to act on, each row backed by a signal the scoring engine already computes.

## Why this is honest now (the unlock)

A signal-inventory pass over the codebase found that **nothing a readiness map needs is
data-blocked**. The scoring engine already produces, for every assessment, a per-dimension
breakdown:

- `AssessmentResult.dimensions` = `{ academic, financial, visa, profileStrength }`
- each dimension = `{ value: number, factors: Array<{ label, influence: "positive" | "neutral" | "risk", detail, source? }> }`

So the readiness map invents nothing — it **surfaces the decomposition the engine already made**.
Funds (`StudentProfile.budget` + `fundingSource` + `dependents`, scored as `dimensions.financial`)
and English (`englishStatus` / `englishTest` / `englishScore`, folded into `dimensions.academic`)
are both collected in the wizard and scored — we wrongly assumed they were blocked. The richest
honest signals available: the dimension breakdown (above), the MV-69 checklist readiness rollup,
and the MV-73 outcome funnel.

## The row model

The map is a dashboard card titled **"Your readiness"** with four rows. Each row shows a
**word+colour band** (never a number) and a one-line *why*, and links to where the student acts.

| Row | `key` | Signal source | Band derives from |
|-----|-------|---------------|-------------------|
| **Academics & English** | `academics` | `dimensions.academic` | its factors' influences |
| **Money & funding** | `money` | `dimensions.financial` | its factors' influences |
| **Visa readiness** | `visa` | `dimensions.visa` | its factors' influences |
| **Documents** | `documents` | `documentCount` (cheap, on-dashboard) | count only |

- **Profile completeness** is **not** a row (founder decision). It renders as a quiet header
  line above the rows: *"Based on N% of your profile — add detail to sharpen this."* (omit/soften
  at 100%). The `profileStrength` dimension informs this line conceptually; it is not its own band.
- **Applications** is **not** a row — the existing `OutcomeFunnel` (MV-73) renders below the map
  and owns per-application state. The map never duplicates it.

### The honest state model (band ← real signal)

`ReadinessBand = "strong" | "needs-work" | "risk" | "add-detail" | "in-progress" | "not-started"`.
Colour follows the verdict palette: `strong`→teal `#1f6d4a`, `needs-work`→amber `#b07d22`,
`risk`→reach-red `#b1503a`, the neutral states→muted line/ink. **Word + colour both carry state,
never colour alone.**

For the three **dimension rows**, the band is derived from the dimension's `factors` (not from a
displayed number):

- has any `influence: "risk"` factor → **risk** (red) — these are the genuine blockers.
- else has any `neutral`/improvable factor (or the engine bands the dimension below "strong") → **needs-work** (amber).
- else (only `positive` factors / engine bands it strong) → **strong** (teal).
- the dimension is present but under-informed because its profile input is empty (e.g. English
  `not-taken`) → **add-detail** (neutral). In practice the engine already emits this as a risk/neutral
  factor, so `add-detail` is the explicit "we can't assess this yet" fallback.

> The exact predicate (whether to consult `dimension.value` thresholds or rely purely on factor
> influences) is **finalised against the real `dimensions` shape during the build** and locked by
> the helper's unit tests. The intent above is the contract; the pure helper is the single source.

The **why-line** is the single most decision-relevant factor: the first `risk` factor, else the
first improvable/`neutral`, else the first `positive` (`factor.label`/`detail`). For the
**documents row**: `documentCount === 0` → **not-started** ("No documents uploaded yet");
`> 0` → **in-progress** ("{n} uploaded — keep going"). Never **strong/ready** for documents — a
true "ready" needs the MV-69 `computeReadiness` "X of Y ready" rollup, which is per-program and
not loaded on the dashboard; surfacing it here is a noted fast-follow, deliberately out of scope
to avoid the "marked ready on one upload" overclaim Codex flagged.

### No-assessment case

A signed-in user with **no** primary assessment has no `dimensions`. The map then renders the
three dimension rows as **add-detail** ("Take the assessment to see this") linking to the wizard,
and the documents row honestly. There is no empty/frozen shell — every row states a real next move.

## Architecture

Mirrors the established `buildOutcomeRail` / `buildIntakeTimeline` / `buildJourney` pattern: a
**pure, unit-tested helper** holds all the logic; the component is presentational; the dashboard
supplies real signals from data **it already loads** (zero extra queries).

### Pure helper — `lib/readiness/readiness.ts`

```ts
export interface DimensionSignal {
  // minimal projection the helper needs; never displays `value`
  value: number;
  factors: Array<{ label: string; influence: "positive" | "neutral" | "risk"; detail?: string | null }>;
}

export interface ReadinessSignals {
  dimensions: {
    academic: DimensionSignal;
    financial: DimensionSignal;
    visa: DimensionSignal;
  } | null;              // null when the user has no primary assessment
  profilePct: number;    // 0..100, for the header line
  documentCount: number; // for the documents row
}

export type ReadinessBand =
  | "strong" | "needs-work" | "risk" | "add-detail" | "in-progress" | "not-started";

export interface ReadinessRow {
  key: "academics" | "money" | "visa" | "documents";
  label: string;
  band: ReadinessBand;
  why: string | null;    // decision-relevant factor text, or the documents summary
  href: string;
}

export interface Readiness {
  rows: ReadinessRow[];        // always 4, fixed order
  completenessPct: number;     // header line
  ariaLabel: string;           // honest summary, names each band by word
}

export function buildReadiness(signals: ReadinessSignals): Readiness;
```

Pure, deterministic, server-safe. No I/O, no `Date.now()`. Never returns a band a signal doesn't
justify; never emits a numeric score into a row.

### Component — `components/dashboard/readiness-map.tsx`

Presentational. Renders the header completeness line + four rows; each row is a `next/link` to its
`href` with a band pill (word + verdict-palette colour) and the why-line. No raw percentages, no
reach/red tone except a genuine `risk` band. Same calm-authority tokens as the rest of the
dashboard. `<section aria-label="Your readiness">`; each row's accessible name includes its band
word ("Visa readiness, at risk: …"). Decorative pills `aria-hidden`, the word label carries it.

### Placement

`ReadinessMap` **replaces `StatsRow`** on `app/(app)/dashboard/page.tsx` (founder decision —
the map says everything the thin counts did, with meaning). The dashboard builds
`ReadinessSignals` from values it already has in hand:

- `dimensions` ← `primary` (the `AssessmentPayload` already loaded via `getPrimaryAssessmentForUser`).
- `profilePct` ← `completenessPct` (already loaded).
- `documentCount` ← `documents.length` (already loaded).

Zero extra queries. The old "Your journey was removed…" comment block is removed (its lesson is
now embodied by an honest map). `StatsRow` and its test are removed if nothing else references it
(the build verifies references first).

## Honesty guardrails (encoded, not aspirational)

1. **No band without its signal.** `buildReadiness` derives every band from `ReadinessSignals`;
   there is no path to a lit/strong state the engine didn't justify.
2. **No invented numbers.** Dimension `value` is used only to band internally; it is never rendered.
   Students see word bands, per the trust rule.
3. **No documents overclaim.** The documents row tops out at `in-progress`; "ready" requires the
   real per-stage rollup (out of scope, noted).
4. **No empty shell.** Worst case (no assessment) renders honest "take the assessment / add detail"
   rows — an actionable path, not decoration.
5. **No duplication.** Verdict band lives in `SnapshotCard`; the map decomposes it. Applications
   live in `OutcomeFunnel`; the map omits them.

## Visual spec ("calm authority")

- Flat, thin borders, no gradients/shadows. A bordered card matching the other dashboard cards.
- Band pill = small rounded chip, word label in the band colour on a tint; or a coloured dot +
  word — shape/word carries state, never colour alone.
- Mono (IBM Plex Mono) uppercase for the band word; sans (Hanken Grotesk) for label + why.
- Motion: `ease-calm` only; respects reduced-motion (no entrance animation required).

## Accessibility

- `<section aria-label="Your readiness">` of links; each link's accessible name = "{label},
  {band as words}{: why}". Decorative dots/pills `aria-hidden`.
- Targets meet the 44px tap minimum on mobile.
- Colour is never the sole carrier — the band word is always present.

## Testing plan (TDD)

1. **`tests/readiness/readiness.test.ts`** (pure helper, the bulk):
   - a `risk` factor on a dimension → that row `band: "risk"`, why = the risk factor's text.
   - only `positive` factors → `strong`; a `neutral`/improvable factor (no risk) → `needs-work`.
   - dimension whose input is empty (modelled per the real factor the engine emits) → resolves to
     `risk`/`needs-work`/`add-detail` per the contract (lock the exact mapping here).
   - `dimensions: null` (no assessment) → three rows `add-detail` with wizard `href`, documents row honest.
   - documents: `0` → `not-started`; `> 0` → `in-progress` (never `strong`).
   - `completenessPct` flows to the header value; `ariaLabel` names each band by word and never
     implies a band a signal didn't justify; no row carries a numeric percentage string.
   - each row's `href` is correct.
2. **`tests/components/dashboard/readiness-map.test.tsx`** — renders 4 labelled links; band words
   present; risk row exposes its `risk` wording; **no raw `%` digit** appears in any row (header
   line may carry the completeness %); links resolve to the right hrefs.
3. Dashboard wiring: update the existing dashboard test for the `StatsRow`→`ReadinessMap` swap;
   remove the `StatsRow` test if `StatsRow` is removed. Goldens byte-identical (no scoring/verdict
   copy-golden surface is touched — the map reads the engine, it does not change it).

**Gate:** `npm run typecheck` + `npm run lint` + `npx vitest run` (full suite) before the PR.

## Out of scope (YAGNI)

- The global always-on "step N of 6" marker — **dropped** (the rejected journey-rail design).
- An "Applications" row — `OutcomeFunnel` owns it.
- Upgrading the documents row to the MV-69 `computeReadiness` "X of Y ready" per-stage rollup —
  noted fast-follow; needs per-program checklist context not loaded on the dashboard.
- No new scoring, no new "next action" engine (`PromptCard`/`selectNextStep` stays as-is), no
  persistence, no migration — every signal already exists.

## File plan

- `lib/readiness/readiness.ts` — pure `buildReadiness` + types (new).
- `components/dashboard/readiness-map.tsx` — the card, presentational (new).
- `app/(app)/dashboard/page.tsx` — build signals from already-loaded data, render `ReadinessMap`
  in place of `StatsRow`, drop the old removal comment (edit).
- `components/dashboard/stats-row.tsx` — removed if unreferenced after the swap (build verifies).
- Tests as above (new + updated).
