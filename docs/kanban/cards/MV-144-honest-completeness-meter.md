# MV-144 — Honest profile-completeness meter, not a fake "accuracy" score (audit C-6)

**Priority:** P1 · **Owner:** agent · **Parent:** MV-124 Slice 8
**Closes:** audit C-6 (the "profile accuracy" meter)
**Findings source:** `docs/audits/2026-07-10-comprehensive/REPORT.md` (C-6) ·
build order `docs/audits/2026-07-10-comprehensive/VERIFIED-BUILD-ORDER.md`

## The bug

The old `lib/results/accuracy.ts` "profile accuracy" meter was dishonest three ways:

- **Top tiers mathematically unreachable.** `completeness` started at **25** and added only **+3**
  when English was taken (max **28**), but the tiers required `Verified ≥ 40` / `Complete ≥ 75`.
  `28 < 40`, so **every** user was stranded at "Basic" — the meter could never move up no matter
  what they filled in.
- **Dead suggestions.** The two document suggestions ("Upload your transcript", "Add financial
  documents") added **0 points** — the bar never moved when you acted on them.
- **A false verification promise.** It named a tier **"Verified"** and the English suggestion
  promised **"band-level verification"** — but the app verifies **nothing**: nobody reads the
  uploaded PDF, and the engine scores the numbers the student **typed**. A meter that claims
  "Verified" / "verification" is a false trust claim — exactly the dishonesty the app exists to
  replace, and a bounce to a consultancy the moment a student notices.

## The fix (Option A — founder-chosen)

An honest **PROFILE COMPLETENESS** meter: *how much of the picture the student has given us,*
never whether we checked it.

- **NEW `lib/results/completeness.ts` → `computeProfileCompleteness(profile, docs?)`** (replaces
  `accuracy.ts`).
- **Neutral, reachable tiers:** **Started (<50) / Detailed (50–99) / Full picture (=100)** — no
  "Verified" language anywhere.
- **Real weights.** The three verdict-driving inputs the engine otherwise floors to 0 (grade,
  budget) or assumes a band for (English) weigh **3** each; the match/plan-shaping fields weigh
  **1** (field of study + target level — required steps, so they carry weight but never surface as
  a suggestion; prior visa history). Denominator = summed in-scope weights (**12** on the anonymous
  surface); a fully-filled profile reaches **exactly 100**.
- **No dead items.** Every listed suggestion, when satisfied, raises the bar.
- **Documents count only where they can be added.** Transcript / financials (weight 1 each) enter
  the calculation **only when a `docs` presence signal is passed** (a signed-in caller holding the
  vault/checklist state). The anonymous results surface has no account and passes nothing, so
  documents are neither scored nor suggested there — never dead bar items on a surface that can't
  reach them. An obtained document then honestly *raises completeness* without ever claiming it
  verified anything.
- **NEW `components/results/completeness-meter.tsx`** (replaces `accuracy-meter.tsx`): renders the
  level as plain text + a floor-banded quartile bar + an "Add more of your picture:" suggestion list.
- **Persisted payload key `accuracy` deliberately KEPT** (now typed `ProfileCompleteness`) so old
  stored rows deserialize into the new component without crashing.
- **`dependents` deliberately EXCLUDED.** Both an untouched family control and an explicit "Just me"
  serialize as `dependents === undefined`, so there is no clean presence signal; counting it would
  either strand solo applicants below 100 or list an "add dependents" item they cannot satisfy.
  `priorRefusals`, by contrast, has a clean unset state and explicit choices.

## Stale stored payloads (Codex-reviewed second commit)

A green suite still let **existing** users see the old dishonesty: `/assessment/[id]` (owned +
recoverable DB reads) and the anonymous `sessionStorage` restore both replay the **stored** payload,
so any assessment saved before this fix rendered the old Basic/"Verified" meter.

- **NEW `normalizeStoredProfileCompleteness(stored, profile)`** — legacy-only: a current-shape
  `ProfileCompleteness` passes through **byte-for-byte**; a legacy or malformed meter is rebuilt
  from the persisted profile snapshot.
- Wired at **both** read sites: `app/(focused)/assessment/[id]/page.tsx` (rebuilds `payload.accuracy`
  from `profile_snapshot`) and `components/assess/assess-flow.tsx` (anonymous restore effect).
  Active users are already refreshed by `reScoreAssessment` on profile-section save / assess / refresh.

## Deliberately OUT of scope

Two real but **separate** dependents / financial-capacity bugs Codex surfaced while reviewing (the
family control is hidden when destination is "not sure" — which is nonetheless scored **as**
Australia; dependents are dropped in `lib/profiles/from-assessment.ts` on account bootstrap) were
**reverted** from this branch to keep the slice the meter only. They are captured as a follow-up
chip (`task_9db5afb3`); the full Codex diff, including those hunks, is at
`scratchpad/mv144-codex-uncommitted.diff`. Scoring goldens are untouched (no scorer path).

## Acceptance criteria

- [x] The meter never shows "Verified" or promises "verification"; tiers are Started / Detailed /
      Full picture and the copy says *completeness*, not *accuracy*.
- [x] A fully-filled profile reaches **100 ("Full picture")** — the top tiers are reachable.
- [x] Every suggestion, when satisfied, increases completeness (no dead items); documents appear
      **only** when a `docs` presence signal is passed.
- [x] Stored **legacy** payloads recompute honestly on read at both the owned DB page and the
      anonymous restore; **current** payloads pass through unchanged.
- [x] Scoring goldens byte-identical (no scorer path touched).

## Test plan / evidence

- **TDD, red→green.** `tests/results/completeness.test.ts`,
  `tests/components/results/completeness-meter.test.tsx`, `tests/results/assemble.test.ts`,
  `tests/components/results.test.tsx` (rename + reachable tiers + weights/denominator);
  `tests/app/assessment-page.test.tsx` + `tests/assess/assess-flow-recovery.test.tsx` (stale-row
  recompute-on-read at both sites).
- **Gate green:** `typecheck` 0 · `lint` 0 errors · **2031 tests / 305 files** · goldens
  byte-identical. (The previously-noted pre-existing `docs/kanban/build.mjs` `done` warning is
  removed in the board commit, so lint is now warning-clean too.)
- **Cross-model review:** Codex (GPT-5) adversarial pass — independently confirmed the stale-row
  trust gap a green suite missed and TDD'd the two-site normalizer; scope-fenced back to the meter.

## Resume notes (for a cold agent)

- Branch `mv-144-honest-completeness-meter` off `origin/master` (`fedc577`); commits **82ebda8**
  (meter rebuild) + **0b4a6a2** (stale-row normalizer).
- The persisted key stays **`accuracy`** on purpose — do **not** rename it in the payload, or every
  stored row breaks. Only the TypeScript type changed (`ProfileAccuracy` → `ProfileCompleteness`);
  the JSON key did not.
- `computeProfileCompleteness` is intentionally called **without** `docs` on the anonymous path
  (`assemble.ts`) and in the stale-row recompute — there is no doc-presence there. A signed-in
  caller holding checklist state can pass `docs` so obtained documents honestly raise the bar.
- PR is **FOUNDER-GATED** — master is production (Vercel auto-deploys); do not self-merge.
