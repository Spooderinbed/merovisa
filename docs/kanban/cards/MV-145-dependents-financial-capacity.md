# MV-145 — Dependents survive "not sure" and account bootstrap (financial-capacity honesty)

**Priority:** P1 · **Owner:** agent · **Parent:** MV-124 follow-up (chip `task_9db5afb3`)
**Closes:** the two dependents / financial-capacity bugs Codex surfaced while reviewing MV-144
**Findings source:** de-scoped from MV-144 to keep that slice the meter only; full original Codex
diff (incl. these hunks) at `scratchpad/mv144-codex-uncommitted.diff`

## The bugs

Both quietly corrupt the **DHA financial-capacity floor** — the Australia Subclass 500 gate in
`lib/scoring/financial.ts` that prices declared dependents via `auDependentsCapacityAud` (a partner
and each child raise the money the student must show). A floor computed off the wrong family = a
verdict that is wrong on money, which is exactly the bounce-to-a-consultancy the app exists to
prevent.

- **Bug 1 — "not sure" is scored as Australia but never asked about family.**
  `lib/results/assemble.ts` resolves `destination === "not-sure"` → `"australia"` **before** scoring
  (so the DHA capacity gate applies), but `components/wizard/steps/budget-step.tsx` gated the
  family/dependents control on `destination === "australia"` only. A "not sure" student is therefore
  scored against an Australia floor that silently assumes **no** dependents — the one financial input
  it needs is never collected.
- **Bug 2 — declared dependents are dropped on account bootstrap.**
  `lib/profiles/from-assessment.ts` mapped every wizard answer **except** `dependents`. On claim
  (`lib/assessments/claim.ts`) / first signed-in assess (`app/api/assess/route.ts`), a student who
  declared a partner/children anonymously had them dropped; the signed-in re-score reads dependents
  back from `sections.family` (`lib/scoring/from-sections.ts#dependentsFromFamily`), so the floor
  silently **fell** and an under-funded verdict could falsely soften.

## The fix

- **`budget-step.tsx`** — show the family control for `"australia"` **or** `"not-sure"`, matching the
  destination resolution `assembleAssessment` already does. Copy unchanged ("Bringing family to
  Australia?" — honest, since a not-sure readout is explicitly the Nepal→Australia standing).
- **`from-assessment.ts`** — map the wizard `dependents` snapshot onto the `family` section:
  `children > 0 → { situation: "spouse-and-kids", children }`, else a lone partner →
  `{ situation: "spouse", children: 0 }`. Guarded by
  `dependents && (dependents.partner || dependents.children > 0)`, so **applying alone omits the
  section** (which `dependentsFromFamily` maps straight back to "no dependents") — no dead
  `situation: "alone"` write. This round-trips every wizard-reachable state through
  `dependentsFromFamily` byte-for-byte.

## Deliberately OUT of scope

Nothing further — the two bugs are the whole slice. No scorer path is touched (goldens byte-identical):
`financial.ts` / `compute.ts` / `engine.ts` / the golden fixtures are absent from the diff.

## Verified end-to-end (not just unit-green)

- `lib/scoring/financial.ts:90` genuinely reads `profile.dependents` into the capacity floor — the
  scorer is not inert on this input.
- `lib/validation/profile.ts` (`ProfileSchema`) **keeps** `dependents` (lines 40–42), so
  `profile_snapshot: parsed.data` carries it into the row `from-assessment.ts` later reads — the
  bug-2 fix is live, not stripped before it can matter.
- The from-assessment mapping is the exact inverse of `dependentsFromFamily` for every
  wizard-reachable input (partner / partner+kids / alone), confirmed by round-trip tests.

## Acceptance criteria

- [x] The wizard family/dependents control shows for `"not-sure"` (assessed as Australia), not only
      `"australia"`; still hidden for genuinely non-Australia destinations (e.g. `"canada"`).
- [x] A declared partner survives account bootstrap: `profileSectionsFromAssessment` writes
      `family: { situation: "spouse", children: 0 }` and a signed-in re-score restores
      `dependents: { partner: true, children: 0 }`.
- [x] Declared children survive: `{ partner: true, children: 3 }` →
      `family: { situation: "spouse-and-kids", children: 3 }` → restored identically.
- [x] Applying alone omits the family section (no dead item); re-score yields `dependents: undefined`.
- [x] Scoring goldens byte-identical (no scorer path touched).

## Test plan / evidence

- **TDD, red→green.** `tests/wizard/budget-step.test.tsx` (+1: "not sure" shows the control) and
  `tests/profiles/from-assessment.test.ts` (+3: partner preserved / children preserved / alone
  omitted, each asserting the full round-trip through `sectionsToStudentProfile`). Watched all fail
  first (3 red for feature-missing), then pass.
- **Gate green:** `typecheck` 0 · `lint` 0 · **2035 tests / 305 files** (was 2031 at MV-144; +4).
  `git diff origin/master --stat` = exactly the 4 files (52 +/3 −); scorer/golden fixtures absent.
- **Cross-model review:** Codex (GPT-5) adversarial pass, scope-fenced to two questions (any other
  destination-gated dependents path? any wizard-reachable state the from-assessment guard loses or
  mis-maps?). _Verdict recorded in the badge on merge._

## Resume notes (for a cold agent)

- Branch `mv-145-dependents-financial-capacity` off `origin/master` (`2fc17ce`); code commit `9d4aed7`.
- The two fixes are independent but share one root: the DHA floor must see the family the student
  actually declared, on **both** the anonymous ("not sure") path and the signed-in (bootstrap) path.
- `from-assessment.ts` maps to the `family` **section** shape (`situation`/`children`), NOT the
  scored `dependents` shape — `dependentsFromFamily` is the inverse and the single source of truth
  for that mapping (do not invent a second one).
- PR is **FOUNDER-GATED** — master is production (Vercel auto-deploys); do not self-merge.
