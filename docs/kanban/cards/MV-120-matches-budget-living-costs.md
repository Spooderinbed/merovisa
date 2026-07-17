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

## Fix plan (adjudicated against Codex `gpt-5.6-sol` @ medium, 2026-07-17)

Codex review verdict on the 4 gating questions: **Q1 confirmed the architecture, Q3
overrode my plan (I was wrong), Q2 + Q4 refined it.** Raw output:
`scratchpad/codex-c3-review.txt` (session `019f6f15`). Adjudication notes below each.

1. **`lib/matches/types.ts`** (additive only):
   - `MatchInputs.policy` (the field already exists, carrying `nepalAssessmentLevel`)
     gains the financial-capacity seam — see step 3. **Not** a new top-level
     `userLivingCostAud` field: `policy` is already the destination-policy channel, so
     living cost + dependents + the reach ratio belong there together.
   - `scoreSnapshot` **adds** `costGap: number` and **keeps** `tuitionGap`.
     **Do NOT rename `tuitionGap`** — it is persisted in the untyped `score_snapshot`
     Json column (`lib/outcomes/repo.ts:16,72,226`) on frozen MV-08 outcome predictions;
     a rename silently orphans the key on historical rows. Adding a key is backwards compatible.
2. **`lib/matches/compute.ts`** (~81-95, 139-151):
   ```ts
   const capacity   = inputs.policy.financialCapacity;      // null ⇒ tuition-only fallback
   const livingCost = capacity ? capacity.livingAud + capacity.dependentsAud : 0;
   const requiredTotal = tuitionMin + livingCost;
   const tuitionGap = Math.max(0, tuitionMin - budget);   // keep: still a real signal
   const costGap    = Math.max(0, requiredTotal - budget); // new: what the verdict drives off
   ```
   Copy must state what was actually compared:
   - `costGap === 0` → _"Budget covers AUD {tuitionMin} tuition + AUD {livingCost} living costs."_
   - `costGap > 0` → _"Budget short by AUD {costGap} for tuition + living costs."_
   - Keep the `livingCost === 0` path emitting today's tuition-only wording so the
     fallback never over-claims.
3. **The reach cliff moves from `> 0.5` to `> 0.25`** (Codex Q3 — **this overrides my
   original plan, which kept 0.5**). Fixing only the denominator and leaving the cliff at
   0.5 leaves the *same self-contradiction*, merely narrowed: at budget 45k / tuition 40k
   matches would say **possible** while `financial.ts` still forces **reach**
   (45,000 < 0.75 × 74,210). The cliff IS part of the correctness fix, not a separate
   product change.

   The mapping is exact and scale-invariant, so it transfers across the two engines'
   legitimately-different floors: `financial.ts` forces reach at `budget < reachRatio ×
   floor` (0.75), which *is* `gapRatio > 0.25`. The three bands then line up structurally:

   | gap ratio | `financial.ts` | matches (after fix) |
   |---|---|---|
   | ≤ 0 | clears | strong |
   | 0 – 0.25 | capped 49 (can't be strong) | possible |
   | > 0.25 | forced reach | reach |

   The `0.5` at `compute.ts:94` is a bare magic number with no comment or provenance;
   `AU_DHA_CAPACITY_GATE.reachRatio` (`au-cost-of-living.ts:144`) is at least a documented,
   frozen policy knob. Derive the cliff as `1 - reachRatio`.
4. **One policy seam, not raw constants at two call sites** (Codex Q2 — threading the bare
   constant into both adapters invites exactly the drift that caused this bug). Both
   adapters call one helper that returns `{ livingAud, dependentsAud, reachRatio }`:
   - `lib/matches/from-student-profile.ts:41` (anonymous) — dependents from `profile.dependents`
   - `lib/matches/from-sections.ts:64` (signed-in) — dependents via the **existing canonical**
     `dependentsFromFamily(sections.family)` (`lib/scoring/from-sections.ts:15`; export it).
     Do NOT write a second family→dependents mapping.

   `AU_DHA_*` constants stay **out of** `compute.ts` so the engine stays destination-agnostic,
   pure, and server-side.
5. **Thread dependents in this slice** (Codex Q4: _"otherwise this fix knowingly preserves
   the same contradiction for families"_). Verified free at both adapters: `StudentProfile.dependents`
   exists (`lib/scoring/types.ts:143`), `ProfileSections.family` exists
   (`lib/profiles/sections.ts:29`), and the canonical mapper already exists. **No schema
   change, no migration, no new mapping logic.** `financial.ts:76-80` already prices
   partner (10,394) + child (4,449); matches must match.
6. **Do NOT call `scoreFinancial`** (Codex Q1, converging with my independent read):
   it consumes representative/median tuition, funding reliability and destination
   heuristics, and returns a 0-100 dimension score — matching needs *this program's*
   `tuitionMin` and a verdict. Share the capacity inputs, not the gate.
7. **No wizard change** — `budget-step.tsx:84` is already honest; the engine was reading
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
- [ ] ~~The matches card and the results financial factor **agree** on the same budget.~~
      **Corrected 2026-07-17 — this criterion was wrong as written and is not achievable.**
      The two engines have legitimately different floors *by design*: `financial.ts:80` uses
      `AU_REPRESENTATIVE_TUITION_AUD` (44,500, the **median** program) because it scores the
      student against the destination generally, while the matcher must use **this program's**
      `tuitionMin`. Demanding agreement would force the matcher to lie about a cheap program.
      A residual window survives the fix and is *correct*: for budget in [69,710, 74,210)
      (tuition 40k) matches says strong while financial caps the dimension at 49 — and there
      the matcher is the more honest of the two, because that program really is below median.
      The contradiction narrows from ~24,710 wide to ~4,500 wide.
      **Replacement criterion (testable):** matches must never claim affordability, nor return
      **strong**, when the student is short of *this program's* real cost (`tuitionMin` +
      living + dependents). And the two engines must never land on **opposite** ends of the
      band (strong vs reach) for the same budget.
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

**⚠️ The deflation is LARGER than what was flagged at pick time**, because the Codex review
moved the reach cliff (fix plan step 3). Concretely, for a program at `tuitionMin` 40,000
(required total 69,710) and no dependents:

| | reach fires below | strong requires |
|---|---|---|
| today (buggy) | budget 20,000 | budget 40,000 |
| plan as originally written (0.5 cliff) | budget 34,855 | budget 69,710 |
| **as adjudicated (0.25 cliff)** | **budget 52,283** | **budget 69,710** |

So a student with a 50,000 budget goes **strong → reach** in one slice. That is the
honest answer (they are ~19,710 short of a real 69,710 floor, and `financial.ts` has been
calling it reach all along), but it is a big visible move and it is the single thing most
worth the founder's attention at review. Dependents push it further: a partner adds 10,394
to the floor, each child 4,449.

## Open question carried into build — **RESOLVED 2026-07-17**

`MatchInputs` has no `dependents`, so the matches engine also ignores the partner/children
the wizard collects (`budget-step.tsx:126-164`) and that `financial.ts:76-80` prices in.
**Codex Q4: thread it in this slice** — _"otherwise this fix knowingly preserves the same
contradiction for families."_ **Accepted** (fix plan step 5): verified reachable at both
adapters with no schema change and no new mapping logic, so the cost of doing it now is
near zero and deferring would ship a knowingly-half-fixed trust bug.

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
