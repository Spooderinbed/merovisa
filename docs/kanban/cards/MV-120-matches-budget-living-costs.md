# MV-120 — Matches budget must mean tuition + living costs (audit C-3)

**Column:** In progress · **Priority:** P0 · **Owner:** agent
**Branch:** `mv-120-matches-budget-living` (off `origin/master`) · **Merge:** _founder-gated_
**Source of truth:** `docs/audits/2026-07-10-comprehensive/REPORT.md` (finding **C-3**, §4 Sol-unique live decision-correctness cluster; ranked **#4** on the 25-item checklist, **Slice 1** of the 9-slice build order)
**Verification:** re-verified against the tree 2026-07-17 by a 10-finding / 21-agent workflow — verdict `STILL_LIVE`, confidence **high**, **not refuted** on adversarial recheck. All 10 audit P0s re-verified live; 0 already fixed.

## Why this is first

Slice 1 of 9. Picked by the founder 2026-07-17. It is the money question students
actually come to ask, and it is the only finding where **the app contradicts itself on
the same number** — which is worse than a plain miscalculation, because both answers
are on screen.

## The bug

The wizard asks for one yearly figure meaning **tuition plus living costs**
(`components/wizard/steps/budget-step.tsx:83-84` — _"What's your yearly budget? Tuition
plus living costs, per year."_). The matches engine then compares that whole number
against **tuition alone**.

- `lib/matches/compute.ts:81-86` — `const tuitionMin = p.tuitionMin ?? 0; const tuitionGap = Math.max(0, tuitionMin - budget);`
- `lib/matches/compute.ts:89-95` — `tuitionGap === 0` is one of four conditions that promote a card to **strong**; the reach cliff is also denominated in tuition (`tuitionGap / tuitionMin > 0.5`).
- `lib/matches/compute.ts:139-151` — the copy: `tuitionGap === 0` → _"Budget covers AUD {tuitionMin} tuition."_ rendered **positive/green**.

Neither adapter nets out living costs — `budgetToAud` (`from-sections.ts:73-75`) only
does FX, and `MatchInputs` (`lib/matches/types.ts:48-75`) has **no living-cost field at
all**, so there is no channel through which living cost could reach `computeOne`.

### The self-contradiction (the actual harm)

Student budget **A$45,000** (tuition+living, as instructed), program `tuitionMin` **A$40,000**:

| Surface | Says | Why |
|---|---|---|
| Matches engine | **"Strong"** + _"Budget covers AUD 40,000 tuition."_ | `tuitionGap = 0` |
| Scoring engine, same number | **"Reach"** + _"Well below DHA financial-capacity requirement"_ | `financial.ts:80` builds `capacityAud = AU_DHA_LIVING_CAPACITY_AUD (29,710) + AU_REPRESENTATIVE_TUITION_AUD (44,500) = 74,210`; `45,000 < 0.75 × 74,210` → `forceReachCap` |

The student really needs `40,000 + 29,710 ≈ 69,710` and is **~A$24,710 short**, while the
matches page tells them their budget covers it. This is the trust-first failure mode the
product exists to prevent.

**Units checked — not a false alarm.** Both sides are per-year: `AU_REPRESENTATIVE_TUITION_AUD`
(`lib/data/policy/au-cost-of-living.ts:110-125`) is defined as representative **first-year**
tuition, the median of `tuitionMin`. The mismatch is tuition-only vs tuition+living, not a
year-vs-total unit confusion.

**Scope precision (audit understated this).** This is NOT an app-wide budget bug.
`lib/scoring/financial.ts` already models the full tuition+living floor correctly, is
gov-sourced, and even prices dependents (`financial.ts:76-80`). The defect is isolated to
the **matches** engine — the only consumer reading the budget as if it were tuition-only.
So the correct constant already exists and is sourced: **no new data research required.**

## ⚠️ A green test currently pins the bug

`tests/matches/compute.test.ts:60-75` ("strong when grade, english and budget all meet
minimums") uses `userBudgetAud: 45000` against `tuitionMin: 40000` and asserts
`verdict === "strong"`. **This test encodes the defect and must be reasoned about, not
mechanically re-baselined.** Same caution for the ~12 other affected test files: if a
fixer rewrites goldens to match new output, the suite just ratifies whatever the code does.

## Fix plan

1. **`lib/matches/types.ts`** (additive only):
   - `MatchInputs` gains `userLivingCostAud: number | null` — `null` ⇒ skip the living
     component and keep today's tuition-only behaviour, so the type stays honest for
     non-AU expansion.
   - `scoreSnapshot` **adds** `costGap: number` and **keeps** `tuitionGap`.
     **Do NOT rename `tuitionGap`** — it is persisted in the untyped `score_snapshot`
     Json column (`lib/outcomes/repo.ts:16,72,226`) on frozen MV-08 outcome predictions;
     a rename silently orphans the key on historical rows. Adding a key is backwards compatible.
2. **`lib/matches/compute.ts`** (~81-95, 139-151):
   ```ts
   const livingCost = inputs.userLivingCostAud ?? 0;
   const requiredTotal = tuitionMin + livingCost;
   const tuitionGap = Math.max(0, tuitionMin - budget);   // keep: still a real signal
   const costGap = Math.max(0, requiredTotal - budget);   // new: what the verdict uses
   ```
   Drive the verdict off `costGap`; rebase the reach cliff on `requiredTotal` (a cliff
   denominated in tuition while the gap is denominated in total is incoherent).
   Copy must state what was actually compared:
   - `costGap === 0` → _"Budget covers AUD {tuitionMin} tuition + AUD {livingCost} living costs."_
   - `costGap > 0` → _"Budget short by AUD {costGap} for tuition + living costs."_
   - Keep the `livingCost === 0` path emitting today's tuition-only wording so the
     fallback never over-claims.
3. **Thread the constant in at both adapters**, reusing the existing gov-sourced figure
   `AU_DHA_LIVING_CAPACITY_AUD` (`lib/data/policy/au-cost-of-living.ts:25` = 29,710,
   DHA-sourced + freshness-tracked):
   - `lib/matches/from-student-profile.ts:41` (anonymous wizard path)
   - `lib/matches/from-sections.ts:64` (signed-in path)

   Keep the constant **out of** `compute.ts` so the engine stays destination-agnostic and
   the rule stays server-side.
4. **No wizard change** — `budget-step.tsx:84` is already honest; the engine was reading
   it wrong.

### The load-bearing part (from the adversarial recheck)

Read pedantically, _"Budget covers AUD 45,000 tuition."_ is arithmetically **true**. The
defect is that (a) `tuitionGap === 0` is used as an **affordability gate** promoting the
card to "strong" (`compute.ts:89`), and (b) the green/positive framing turns a
true-but-narrow statement into a false affordability implicature. **A fixer who only
rewrites the copy string and leaves the verdict condition at line 89 untouched has NOT
fixed the bug** — the card still reads "Strong". The verdict condition is load-bearing;
the copy is the symptom.

## Acceptance criteria

- [ ] A budget between `tuitionMin` and `tuitionMin + 29,710` no longer yields **strong**, and the card no longer claims the budget covers costs.
- [ ] The matches card and the results financial factor **agree** on the same budget (the self-contradiction above is gone).
- [ ] `tuitionGap` still present in `scoreSnapshot`; `costGap` added alongside; no rename.
- [ ] `userLivingCostAud: null` reproduces today's tuition-only behaviour exactly (fallback never over-claims).
- [ ] Copy names both components of what was compared.
- [ ] Every changed golden has a *reasoned* justification, not a mechanical re-baseline. Especially `tests/matches/compute.test.ts:60-75`.
- [ ] Gate green: `npm run typecheck` + `npm run lint` + `npm test`.
- [ ] **Live browser pass** (jsdom is blind; this is a cross-page consistency claim): drive the wizard at a budget between `tuitionMin` and `tuitionMin + 29,710`, confirm matches card and results financial factor agree.

## Test plan (TDD — write these red first)

1. Budget ≥ tuition but < tuition+living → **not strong**, copy names living costs. (The inverse of the currently-green pinned test.)
2. Budget ≥ tuition+living → strong, copy names both components.
3. `userLivingCostAud: null` → byte-identical to today's tuition-only output.
4. Cross-engine consistency: for a budget in the contradiction window, matches verdict and `financial.ts` capacity outcome do not disagree.
5. `scoreSnapshot` retains `tuitionGap` **and** carries `costGap`.

## Blast radius

`lib/matches/compute.ts` · `types.ts` · `from-sections.ts` · `from-student-profile.ts`
Tests: `tests/matches/compute.test.ts` · `compute-eligibility.test.ts` · `anon-equivalence.test.ts` ·
`from-sections.test.ts` · `from-student-profile.test.ts` · `tests/results/accuracy.test.ts` ·
`assemble.test.ts` · `secondary-verdicts.test.ts` · `tests/integration/wizard-to-results.test.tsx` ·
`tests/integration/aarav.test.ts` · `tests/outcomes/predict.test.ts` · `tests/guide/context.test.ts` ·
`tests/fixtures/catalog.ts`

**Do not bundle:** C-4 Layer B (a real `unknown` band) collides head-on with lines 73-99.
C-10/C-5 (Slice 4) touch the disjoint 153-182 region and can run in parallel after this lands.

## Founder heads-up (soft — build proceeds, confirm at review)

**Verdict deflation at scale.** Correcting this moves many cards Strong → Possible/Reach.
The honest verdict is the honest verdict, but this is a large product-visible shift and
the founder should not first learn about it from the diff. Flagged and acknowledged when
Slice 1 was chosen 2026-07-17.

## Open question carried into build

`MatchInputs` has no `dependents`, so the matches engine also ignores the partner/children
the wizard collects (`budget-step.tsx:126-164`) and that `financial.ts:76-80` prices in.
Strictly smaller error than the missing living cost. **Under Codex review** whether to
thread it in this slice or defer — see resume notes.

## Resume notes

- Verification workflow output (all 10 findings, fix sketches, blast radius, the 9-slice
  build order): `wo528r1jc.output` in the session tasks dir; per-agent journal at
  `subagents/workflows/wf_3b579eb6-2e9/journal.jsonl`.
- Board hygiene done 2026-07-17: MV-99/MV-101 stale In Review cards → Done (they merged
  2026-07-07; batch flip `a4a881b` had stamped the badges onto the wrong duplicates).
  **The MV-99 / MV-101 duplicate-id collision is still latent** and will corrupt the next
  batch flip.
- Audit corrections found during verification (do not propagate the audit's prose):
  **C-5 overstated** (only the matcher frames seasoning as a rule; plan+checklist already
  use the recommendation voice the research brief says to KEEP permanently);
  **C-10 understated** (off-field cards carry *no* field reason; 5 of 12 wizard fields have
  zero programs; `computeMatches` has 3 callers not 1);
  **C-4 under-scoped** (`lib/outcomes/freeze.ts` has no gate at all);
  **F-1 trigger misdiagnosed** (sign-in alone doesn't drop the band — `from-assessment.ts`
  never populates `immigration`);
  **C-1/C-2 delete-ordering is correct, not a bug** — and a 4th false claim was found that
  the audit missed (`/trust` says uploads verify your assessment; the upload route never
  calls `reScoreAssessment`).
