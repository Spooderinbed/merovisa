# MV-143 — Unknown is not zero: abstain instead of fabricating a verdict (audit C-4, Layer A)

**Priority:** P1 · **Owner:** agent · **Parent:** MV-124 Slice 5
**Closes:** audit C-4 **Layer A only** (the abstain gate)
**Findings source:** `docs/audits/2026-07-10-comprehensive/REPORT.md` (C-4) ·
build order `docs/audits/2026-07-10-comprehensive/VERIFIED-BUILD-ORDER.md` ("Closes: C-4 (Layer A only)")

## The bug

`lib/matches/compute.ts` floors every unknown verdict input to zero
(`userGradePercent ?? 0`, `userEnglishOverall ?? 0`, `userBudgetAud ?? 0`). So a **signed-in
student who entered only their name** — grade, English and budget all absent — is handed a
fabricated **"Reach · Grade short by 65%"** shortfall they never earned, a frozen MV-08
prediction-of-record built off those zeros, and a plan seeded with `add-safer-options` off the
same invented reach. A zero-floored verdict presented as real is exactly the trust break the app
exists to prevent — it is a bounce to a consultancy.

## The fix (Layer A — the gate; Layer B deferred)

A new pure predicate, checked **upstream** at every site that scores a verdict, so an absent
profile abstains instead of inventing a shortfall:

- **NEW `lib/matches/sufficiency.ts` → `hasSufficientInputs(inputs: MatchInputs)`** — returns
  `false` **only** when grade **and** English **and** budget are all `null`. **Any one present ⇒
  true** (a partial profile must still surface match cards — a wall is itself a bounce; do not
  over-gate). English presence keys on `userEnglishOverall` (the per-band value proxies to overall
  in the adapter). Non-verdict inputs (field, target level) never lift the gate.
- **`app/(app)/matches/page.tsx`** — replaced the coarse `Object.keys(sections).length === 0`
  empty-profile check with `!hasSufficientInputs(inputs)`; an insufficient profile renders the
  existing `PromptCard{ kind: "profile-incomplete" }` (mirrors the dashboard gate). Integrated with
  Slice-4's (MV-140) `FieldCoverageNotice` / `uncoveredField`.
- **`lib/outcomes/freeze.ts`** — guard before `buildPrediction`; `FreezeResult` failure union
  extended to `404 | 409 | 422`, returning **422** (not-enough-data) so **no zero-floored
  prediction is ever persisted** as the record-of-record. The MV-08 API route already passes
  `result.status` straight through; `lib/outcomes/on-apply.ts` treats any non-ok as best-effort
  no-capture — no consumer change needed.
- **`lib/plan/invalidate.ts`** — `computeMatches` skipped (`matches = []`) when inputs are
  insufficient, so `add-safer-options` is not seeded off a fabricated reach; the
  profile-completeness prompts still generate.

### Deliberately OUT of scope

`lib/matches/compute.ts` and the `MatchVerdict` union in `lib/matches/types.ts` are **untouched**.
A real `unknown` verdict band (which recovers partial value when *some* inputs are present but
`compute.ts` still floors the rest) is **Layer B — deferred** (see MV-124 sequencing note: it
collides head-on with `compute.ts:73-99`). This slice is the honesty gate only.

## Acceptance criteria

- [x] Name-only signed-in profile (grade/English/budget all absent) → matches page renders the
      profile-incomplete prompt, **not** a fabricated "Reach" card.
- [x] **No over-gating:** a profile with ANY one of grade / English / budget present still renders
      match cards.
- [x] `freezePredictionForProgram` on an insufficient profile returns `{ ok:false, status:422 }`
      and persists **no** prediction row.
- [x] `invalidatePlan` on an insufficient profile does not seed match-driven items; completeness
      prompts still generate.
- [x] `compute.ts`, `MatchVerdict` union, and the scoring goldens are byte-identical (verified via
      `git diff origin/master...HEAD --stat`).

## Test plan / evidence

- **TDD, red→green.** New `tests/matches/sufficiency.test.ts` (7 cases: all-absent → false; each
  single-input-present → true; combinations). New page test in `tests/app/matches-page.test.tsx`
  (+104: name-only → prompt; **grade-only over-gating guard** → cards still render, renders the real
  server component so it is not jsdom-blind to the mount). `tests/outcomes/freeze.test.ts` (+11:
  insufficient → 422, no persist). `tests/plan/invalidate.test.ts` (+73).
- **Gate green:** `typecheck` 0 · `lint` 0 (1 pre-existing `build.mjs` warning) · **2019 tests /
  305 files**.
- **Scope invariant verified:** `git diff origin/master...HEAD` touches only the 8 expected files;
  `compute.ts` / `types.ts` / `tests/scoring/__fixtures__/golden-assessments.json` absent from the
  diff.
- **Cross-model review:** Codex (GPT-5) adversarial pass — _verdict recorded in the badge on merge._

## Resume notes (for a cold agent)

- Branch `mv-143-unknown-is-not-zero` off `origin/master`; code commit `7380a63`.
- The gate **replaces** (does not OR with) the old empty-profile check — an empty profile is a
  strict subset of an insufficient one, so behaviour for the empty case is unchanged.
- `computeMatches` has three callers (matches page, `lib/results/assemble.ts` anonymous,
  `lib/plan/invalidate.ts`). The **anonymous** results path is intentionally **not** gated here:
  the anonymous wizard collects grade/English/budget before results, so the name-only hole is a
  signed-in editor phenomenon. If a future change lets anonymous users reach results with all three
  absent, gate `assemble.ts` too.
