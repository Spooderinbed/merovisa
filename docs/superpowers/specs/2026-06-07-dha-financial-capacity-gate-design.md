# MyVisa — DHA Financial-Capacity Gate Design Spec

**Date:** 2026-06-07
**Scope:** Wire the sourced DHA financial-capacity figure into the `runAssessment` financial dimension as a visa-requirement gate (Australia corridor)
**Target user:** Nepali students assessing their real chances of studying in Australia
**Target corridor:** Nepal → Australia (the only corridor with sourced DHA data)
**Approach:** Capacity gate (the government figure is a *requirement floor*, not a typical cost), chosen over a band-replacement
**Status:** Approved design — pending spec review before implementation plan

---

## 1. Problem & Context

MyVisa's pitch is "your *real* chances." The financial dimension is 25% of every verdict, yet today it scores a student's budget against a **hand-invented heuristic band**:

```ts
// lib/data/policy/au-cost-of-living.ts:77
TYPICAL_YEARLY_USD.australia = { min: 30000, max: 55000 }
//   provenance: { findingRefs: [], source: "internal-heuristic" }
```

Meanwhile the **actual government financial-capacity figure** — the number the visa is decided against — sits sourced, validated, and exported one import away, but is **read by no scoring math**:

```ts
// lib/data/policy/au-cost-of-living.ts:20  (exported via scoring-config.ts, never consumed)
AU_DHA_LIVING_CAPACITY_AUD = 29_710
//   provenance: { findingRefs: ["A.015","B.002"], source: immi.homeaffairs.gov.au, effectiveDate: 2024-05-10 }
```

`lib/scoring/financial.ts` imports `TYPICAL_YEARLY_USD, FUNDING_RELIABILITY, FX_RATES` — not the DHA figure.

**The harm being fixed.** The honest DHA capacity for a single student is `12-month living (29,710 AUD) + first-year tuition (~45,000 AUD) ≈ 74,700 AUD ≈ 49,800 USD`. The heuristic band's midpoint is `(30k+55k)/2 = 42,500 USD` — **~15% below the real requirement** (equivalently, the requirement is ~17% above the midpoint). So today the scorer tells some Australia-bound students "your budget is within the typical range" when they are *below what the visa actually demands*. For a trust-first product, that false reassurance is the single most important scoring inaccuracy to correct.

### Architecture note — two scorers
- **`runAssessment(profile)`** (`lib/scoring/engine.ts`) — the headline wizard→results verdict; 4 dimensions (academic 30 / financial 25 / visa 25 / profile-strength 20). **This is the target of this spec.**
- **`computeMatches(...)`** (`lib/matches/compute.ts`) — per-program `/matches` verdicts; already reads real `seed.ts`/Supabase tuition + entry data. **Out of scope here.**

The `lib/data/policy/*` config is already wired into `runAssessment` via `lib/data/scoring-config.ts`, but it was wired as a *byte-identical swap* (sourced values equal to the old inline constants), which is why the characterization goldens never moved. This spec is the **first deliberate, verdict-changing** consumption of a sourced value.

---

## 2. Goals & Non-Goals

### Goals
- The financial dimension treats DHA financial capacity as a **hard requirement floor** for Australia: a student who cannot show the funds the visa requires cannot be scored "financially strong," and a severe shortfall makes finance a "reach."
- The gate is driven by **sourced data** (gov DHA living figure + a transparently-derived representative tuition), with full provenance and `CONFIG_VERSION` traceability.
- Zero behavior change for **non-Australia** destinations.

### Non-Goals (deferred)
- **Travel/airfare allowance** (~2,000 AUD, part of DHA's real formula) — deferred to a fast-follow; ~3% of the total, keeps slice 1 to one new sourced constant.
- **Field-of-study-indexed tuition** — v1 uses a single representative AU tuition; per-field tuition is a later refinement.
- **Dependents** (partner/child capacity figures exist and are sourced, but `StudentProfile` has no dependents field) — out of scope until the profile schema carries them.
- **Other corridors** (Canada/UK/etc. have no sourced capacity figure) — untouched.
- **The `/matches` engine** — separate work.

---

## 3. Design

### 3.1 Semantics
Keep the existing smooth budget-vs-band score (it still conveys "comfortable / tight"). Layer a **sourced capacity floor beneath it**, applied **only when `destination === "australia"`**. The floor expresses: *"regardless of how your budget compares to a typical band, the visa requires this much — and you're short."*

### 3.2 Threshold (one new sourced input)
```
dhaCapacityAud = AU_DHA_LIVING_CAPACITY_AUD        // 29,710 — gov, immi.homeaffairs.gov.au (existing, sourced)
               + AU_REPRESENTATIVE_TUITION_AUD     // ~45,000 — NEW
dhaCapacityUsd = dhaCapacityAud / FX_RATES.AUD     // AUD→USD via the same table the dimension already uses (AUD=1.5)
```

`AU_REPRESENTATIVE_TUITION_AUD` is the **median of `tuitionMin` across the sourced AU programs** in `seed.ts` (cluster ~33k–60k AUD; median ≈ ~45k) — `tuitionMin` (not the min/max midpoint) is deliberately conservative, so the gate is less likely to falsely fail a borderline student. It is tagged `internal-heuristic` — exactly how `TYPICAL_YEARLY_USD` and `FX_RATES` are already tagged — with a note recording that it is the dataset median and pointing at the program modules. The exact value is computed from the dataset at implementation time and pinned as a constant (the scorer must stay pure/synchronous — no aggregation at runtime).

### 3.3 Mechanic — a cap that leverages the existing verdict floors
House style already uses hard bands (`GAP_PENALTIES` brackets by gap-year), and the characterization suite *wants* boundary cliffs that flip verdicts. So the gate is a cap, not a smooth penalty:

```
capacityRatio = budgetUsd / dhaCapacityUsd

ratio ≥ 1.00            → no cap.  Factor (positive): "Clears the DHA financial-capacity figure the visa requires."
0.75 ≤ ratio < 1.00     → financial = min(value, 49).  Blocks a "strong" verdict.
                          Factor (risk): "AUD <shortfall> short of the ~74,700 the visa expects (12-month living 29,710 + first-year tuition)."
ratio < 0.75            → financial = min(value, 29).  Forces "reach" via the min-dimension floor (<30).
                          Factor (risk): "Well below the DHA financial-capacity requirement."
```

The cap *only ever lowers* the dimension; clearing capacity leaves the heuristic score untouched. The two cliff points (1.00, 0.75) are heuristic scoring policy, tunable, and stored alongside the other tuning constants (not hardcoded in `financial.ts`).

### 3.4 Worked examples (Australia, self-funded — reliability +7.5)
| Budget (USD) | ratio vs ~49,800 | Today's financial | After gate | Effect |
|---|---|---|---|---|
| 60,000 | 1.20 | ~92 | unchanged | clears capacity, positive factor |
| 49,800 | 1.00 | ~84 | unchanged | exactly clears |
| 42,500 (old band midpoint) | 0.85 | ~78 ("within range") | **capped 49** | can no longer be "strong" — the honest correction |
| 30,000 | 0.60 | ~67 | **capped 29** | finance forces "reach" |

(Values use the live formula `70 + (budgetUsd/42,500 − 1)·35 + (0.95−0.8)·50`, clamped/rounded; exact goldens are regenerated, not hand-computed.)

### 3.5 Why the heuristic band stays
The band still differentiates *within* the cleared zone (comfortable vs. very comfortable) and drives non-AU destinations. The gate corrects the floor; it does not replace the gradient.

---

## 4. Data, Files & Provenance

| File | Change |
|---|---|
| `lib/data/policy/au-cost-of-living.ts` | Add `AU_REPRESENTATIVE_TUITION_AUD: Sourced<number>` (heuristic-tagged, dataset-median, note + reference to program modules). |
| `lib/data/policy/verdict-thresholds.ts` *(or a new `dha-capacity.ts`)* | Add the gate tuning: cliff ratios `{ clears: 1.0, reach: 0.75 }` and caps `{ blockStrong: 49, forceReach: 29 }`, `Sourced`/heuristic-tagged. |
| `lib/data/schema/scoring-config.schema.ts` | Zod schemas for the two new constants. |
| `lib/data/scoring-config.ts` | Validate, unwrap, freeze, and export the new values + their provenance into `CONFIG_PROVENANCE`. |
| `lib/scoring/financial.ts` | Import the new values; add the AU-only capacity gate after the existing `value` computation; emit the capacity factor. |
| `lib/scoring/engine.ts` | Bump `RULE_VERSION`. |

Provenance discipline (CLAUDE.md: "every data point has `source` + `lastVerified`") is preserved — the DHA figure is gov-sourced; the representative tuition and cliff tunings are honestly tagged `internal-heuristic` with notes, matching the precedent already set by `TYPICAL_YEARLY_USD`/`FX_RATES`.

---

## 5. Versioning

- **`RULE_VERSION`** `v0.1.0 → v0.2.0` — the financial dimension gains new logic (a sub-factor and a cap). This is a scoring-*logic* change.
- **`CONFIG_VERSION`** `config-v1 → config-v2` — a sourced value (DHA capacity) is now *consumed* by the math, and a new sourced constant is introduced. This is a sourced-*value* change.

Both are stamped onto every `AssessmentResult` and embedded in the goldens, so any historical verdict stays explainable.

---

## 6. Test Strategy (TDD)

**Test-first, golden-last.** Write and watch fail before implementing; regenerate goldens only once the logic is locked.

1. **Unit (`tests/scoring/financial.test.ts` or new):** new cases for the gate —
   - AU budget exactly at capacity (ratio 1.00) → no cap, positive factor.
   - AU budget just under (ratio 0.85) → capped 49; not "strong" at engine level.
   - AU budget well under (ratio 0.60) → capped 29; engine verdict "reach".
   - **Non-AU destination at the same budget → unchanged** (gate is AU-only).
   - Currency conversion: an NPR budget converts and gates identically to its USD equivalent.
2. **Boundary tests** at the ratio cliffs (1.00 and 0.75) so one-step drift flips the cap — mirroring the existing `verdict.ts` boundary discipline.
3. **Golden regen (last):** `WRITE_GOLDENS=1 npx vitest run tests/scoring/characterization.test.ts`. The Australia profiles in the 14-case suite will move; review every diff to confirm each shift is the *intended* honest correction, not collateral.
4. **Blast radius (~21 files)** — update hardcoded pins after regen:
   - `tests/integration/aarav.test.ts` — `ruleVersion` `v0.1.0`→`v0.2.0`; re-examine its pinned `verdict: "possible"` (its profile may move).
   - `tests/scoring/engine.test.ts` — strong/reach reference profiles if they shift.
   - Component/API/app tests that assert specific verdicts.
5. **Config pin tests** (`tests/data/scoring-config.test.ts`) — extend to cover the two new exported constants.
6. **Full suite green** + `npm run typecheck` before done.

### Known WIP tension
`tests/integration/wizard-to-results.test.tsx` is **already modified WIP (unstaged)** and is in the blast radius. Per standing instruction it must not be staged. When the verdict change lands, this file may need updating — to be coordinated with the user rather than silently staged. Flagged here so the plan handles it explicitly.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Representative tuition is an aggregate, not a single published figure | Tagged `internal-heuristic` with a note; derived transparently from the sourced dataset; field-indexed refinement deferred, not hidden. |
| Cap cliffs create brittle test boundaries | Intentional and in-keeping (the suite pins cliffs by design); cliff ratios live in tunable policy, not buried in logic. |
| Over-correction (gate too strict, everyone becomes "reach") | Worked examples show the gate bites only the genuinely-short; verify via the golden diff review before committing. |
| Goldens regenerated carelessly hide a real regression | Goldens regenerated **last**, every diff reviewed line-by-line against the intended effect; never `WRITE_GOLDENS` as a reflex. |
| Forgetting a version bump | Both bumps are explicit checklist items; `scoring-config.test.ts`/`engine.test.ts` assert the version formats. |

---

## 8. Success Criteria

- An Australia-bound student below DHA financial capacity can no longer receive a "strong" financial dimension; a severe shortfall yields a "reach" verdict — each with a sourced, explainable factor citing the DHA figure.
- Non-Australia verdicts are byte-identical to today.
- `RULE_VERSION` and `CONFIG_VERSION` both bumped; goldens regenerated with every diff reviewed and justified.
- Full vitest suite green; `npm run typecheck` clean.
- Every new number carries provenance (gov-sourced or honestly heuristic-tagged).
