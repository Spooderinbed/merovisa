# MV-104 — Wizard funnel follow-ups (founder testing): AUD living-cost callout + recap slowdown

**Column:** In Progress → In Review · **Priority:** P2 · **Owner:** agent · **Branch:** `mv-104-wizard-funnel-fixes` (off `origin/master`)

## Why

Two defects the founder hit in their own local testing on 2026-07-05, after the
MV-97 wizard-funnel overhaul (CGPA input, **AUD corridor**, motion) had landed on
master via the `mv-97-reland` PR. Both are trust/polish leaks in the highest-traffic
funnel (the anonymous wizard), so both bounce toward a consultancy if left.

### (A) Step-7 budget callout — stale USD **and** a mis-firing threshold

The budget step's "tight budget" warning read:

> "Australian living costs alone are ~USD 14k–22k/yr. Consider scholarships or loan support."

The founder flagged the stale **USD** wording (MV-97 moved the corridor to **AUD**).
But the real bug was deeper than copy: the firing threshold did

```ts
const budgetUsd = profile.budgetCurrency === "USD" ? profile.budget : profile.budget / 135;
if (budgetUsd < 26000) { …warn… }
```

`/ 135` is the **NPR**→USD rate. Post-MV-97 the wizard collects budget in **AUD**, so an
AUD budget was divided by 135 as if it were rupees — `A$40,000 → USD 296 → always < 26000`
— meaning the warning **mis-fired for every Australia-bound student** regardless of budget.

**Fix:** stop the ad-hoc math. Convert the student's budget with the canonical
`toAud()` (the single FX source of truth, `lib/data/policy/fx-rates.ts`) and compare to the
**sourced** `AU_DHA_LIVING_CAPACITY_AUD` figure (A$29,710/yr — DHA Subclass 500 individual
financial-capacity figure, `findingRefs A.015/B.002`, `reverifyBy 2027-06-07`). Message and
threshold now reference the **same sourced number**, so the copy is literally true and
freshness-tracked, and the warn only appears when a student's whole budget is below the
living-cost figure alone (before tuition).

### (C) Loading animation too fast

The "Your answers" recap word-cascade played in ~0.5s (per-word stagger `0.04s`, capped
`0.5s`) and the component handed off on a `600ms` window — too fast to read as a deliberate
confirmation beat. This exact slowdown was authored on the `mv-97-wizard-funnel-overhaul`
branch (commit `8307ea9`) but **never made it into master** — the `mv-97-reland` PR relanded
the funnel overhaul without that follow-up commit. Re-landing its intent onto master's
current (immutability-refactored) recap.

**Fix:** `durationMs 600 → 2000`, per-word stagger `0.04 → 0.07` capped `0.5s → 1.2s`. Still
honest: the window is **under** the retired 3000ms "Analyzing" theatre, the real transition
in `AssessFlow` stays gated on `payload && recapElapsed` (so results still appear at
`max(API latency, window)`), and nothing ever labels itself "analyzing".

## What changed

- **`lib/callouts/rules.ts`** — `budget` step: replace the inline USD conversion with
  `toAud(profile.budget, profile.budgetCurrency ?? null)`; threshold =
  `AU_DHA_LIVING_CAPACITY_AUD.value`; message uses `A$${…toLocaleString()}` + the sourced
  figure, no USD. New imports: `toAud`, `AU_DHA_LIVING_CAPACITY_AUD`.
- **`components/assess/profile-recap.tsx`** — `durationMs` default `2000`; cascade delay
  `Math.min(((lineStart[i] ?? 0) + j) * 0.07, 1.2)`; refreshed the honest-window comment.

## Test plan / evidence

- **`tests/callouts/rules.test.ts` (+3)** — `budget-tight-au`: an AUD budget below A$29,710
  fires a warn whose message contains `A$29,710` and **not** `USD`; an AUD budget of A$40,000
  does **not** fire (the old `/135` bug would have); an AUD budget at/above the figure is silent.
- **`tests/assess/profile-recap-timing.test.tsx` (updated)** — handoff now measured against
  the deliberate ~2s window (advance past 2000ms → `onDone` once), still asserting it is under
  the old 3000ms theatre and never claims to "analyze".
- **Gate:** `npm run typecheck` clean · `npm run lint` 0 errors · `npx vitest run` green.
- No scorer / DB / migration touched; no golden surface touched.

## Founder-owed / notes

- Merge to master is founder-gated → PR opened, merge left to founder.
- Recap timing (2s) is a deliberate feel choice from founder feedback; tune the number if it
  still reads fast/slow on a real device.
