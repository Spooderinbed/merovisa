# Phase B — recalibration epoch design (B1 visa-English floor · B2 dependents → DHA capacity)

**Status:** proposed (awaiting approval) · **Date:** 2026-06-07 · **Supersedes nothing**
**Version target:** `RULE_VERSION v0.2.0 → v0.3.0`, `CONFIG_VERSION config-v2 → config-v3`

## Context

Two sourced facts can make the Nepal→Australia verdict more honest, and both move verdicts — so they share one epoch (one version bump, commit-granular goldens, one drift pass) per the approved roadmap plan.

- **B1 — visa English floor.** DHA "competent English" for the Subclass 500 visa is **IELTS 6.0 in each component** (sourced: `au-english-tests.ts`, finding J1.003, immi.homeaffairs.gov.au — *"admissions often require 6.5+"*). But [`visa.ts:37`](lib/scoring/visa.ts:37) penalises everything below the **6.5 course** threshold linearly, so a visa-valid 6.0 is scored as a shortfall and the factor reads *"Below the 6.5 threshold."* That conflates the course preference with the visa requirement.
- **B2 — dependents → capacity.** The DHA financial-capacity floor **rises when an applicant brings family** (partner +AUD 10,394, each child +AUD 4,449 — both gov-sourced in `au-cost-of-living.ts`, findings B.003/B.004). The capacity gate (Phase 7c slice 1) ignores this because the scored profile has no dependents signal. A single applicant and one bringing a spouse + child are held to the same floor today.

## Goals / non-goals

**Goals:** (1) stop over-penalising visa-valid IELTS 6.0–6.4; (2) make the capacity gate reflect dependents; (3) keep every verdict change attributable and minimal.
**Non-goals:** changing ≥6.5 or <6.0 English scoring; modelling child *ages* (school costs); touching the `/matches` per-program scorer; re-sourcing FX (deferred).

---

## B1 — visa English floor  *(small; visa dimension)*

**New sourced constant** in [`english-thresholds.ts`](lib/data/policy/english-thresholds.ts), exported via `scoring-config.ts` with a `CONFIG_PROVENANCE` entry (gov-sourced, finding J1.003 — *not* heuristic):
```ts
export const ENGLISH_VISA_FLOOR_BY_DEST: Sourced<Record<Destination, number>> = {
  value: { australia: 6.0, canada: 6.0, uk: 6.0, germany: 6.0, usa: 6.0, ireland: 6.0, "not-sure": 6.0 },
  provenance: { findingRefs: ["J1.003"], source: "https://immi.homeaffairs.gov.au/visa-eligibility/international", lastVerified: "2026-06-07", note: "DHA competent-English floor (IELTS 6.0 each component) — distinct from the course-admission threshold." },
};
```
(Only `australia` is wired/asserted now; the others mirror the DHA-style floor and stay inert until those corridors ship.)

**Mechanic — "no penalty at/above the floor"** (the approved choice). Replace the single linear adjustment in `visa.ts` with a 3-band rule (`t` = course threshold 6.5, `f` = visa floor 6.0, `p` = `ENGLISH_BAND_DELTA_POINTS` 10):

| IELTS band | Today | B1 | Δ |
|---|---|---|---|
| ≥ 6.5 | `(s−t)·p` (reward) | `(s−t)·p` (reward) | **unchanged** |
| 6.0–6.4 | `(s−t)·p` → −5 to −0.1 | **0** | +0.1 … +5 |
| < 6.0 | `(s−t)·p` → ≤ −10 | `(s−t)·p` (unchanged) | **unchanged** |

So **only IELTS 6.0–6.4 profiles change** (lose the penalty); ≥6.5 and <6.0 are byte-identical. The 0-penalty at 6.0 vs ≈−5 just below it is a deliberate cliff marking the visa-validity line.

**Factor relabel** (with the DHA source attached via the slice-2 `source` field):
- 6.0–6.4 → influence `neutral`: *"IELTS X.X — meets the DHA visa floor (6.0); below the 6.5 course preference."*
- < 6.0 → influence `risk`: *"IELTS X.X — below the DHA visa floor (6.0)."*
- ≥ 6.5 unchanged (`positive`, "meets the 6.5 threshold").

**Files:** `lib/data/policy/english-thresholds.ts`, `lib/data/scoring-config.ts` (export + provenance), `lib/scoring/visa.ts`. **Tests:** `tests/scoring/visa.test.ts` (no-penalty band, below-floor still penalised, both relabels, DHA source present); `tests/data/scoring-config.test.ts` (floor value + schema). **Golden impact:** only fixtures with English in [6.0, 6.5) move.

---

## B2 — dependents → DHA capacity  *(larger; financial dimension + profile schema)*

**Profile signal.** Add to `StudentProfile` ([`types.ts`](lib/scoring/types.ts)):
```ts
dependents?: { partner: boolean; children: number }; // omitted/undefined = applying alone
```
**Collected in the wizard** by appending a compact, optional control to the existing **budget step** (step 8 — it's a financial question), *not* a new step, to protect the conversion funnel: *"Bringing family to Australia?"* → none (default) / partner / partner + N children. Majority case is one glance.
*(The signed-in profile editor already has a `family.situation` enum; mapping it into the scored profile is a noted follow-up, not part of this slice.)*

**Gate math** ([`financial.ts:70`](lib/scoring/financial.ts:70)) — raise the capacity floor before the existing gate logic runs (caps/ratios unchanged):
```ts
let capacityAud = AU_DHA_LIVING_CAPACITY_AUD + AU_REPRESENTATIVE_TUITION_AUD;
if (profile.dependents?.partner) capacityAud += AU_DHA_PARTNER_CAPACITY_AUD;       // 10,394
capacityAud += (profile.dependents?.children ?? 0) * AU_DHA_CHILD_CAPACITY_AUD;     // 4,449 each
```
Both constants already exist + are gov-sourced in `au-cost-of-living.ts`; B2 just re-exports them through `scoring-config.ts` (+ `CONFIG_PROVENANCE`). **School costs (13,502) are deferred** — they need child ages the wizard won't capture; noted, not modelled. Effect: bringing family raises the floor, so a borderline AU budget can honestly drop a band.

**Zod** ([`profile.ts`](lib/validation/profile.ts)): optional `dependents` (`partner: boolean`, `children: int 0–10`). **Persistence:** none expected — the profile rides as JSON in the assess payload, not typed columns (verify at implementation; no SQL migration anticipated).

**Files:** `lib/scoring/types.ts`, `lib/validation/profile.ts`, the budget wizard step (`components/wizard/steps/*`), `lib/scoring/financial.ts`, `lib/data/scoring-config.ts`. **Tests:** `tests/scoring/financial.test.ts` (partner raises floor; children scale it; borderline budget flips band; alone == today); validation + wizard step tests. **Golden impact:** only AU profiles that carry dependents (none of the current fixtures do → goldens move only if we add a dependents fixture, which we will).

---

## Shared mechanics

1. Bump `RULE_VERSION → v0.3.0` and `CONFIG_VERSION → config-v3` at the **start** of the epoch; update any version-pinning tests once.
2. **Commit-granular:** B1 lands as one commit (regen goldens, inspect diff = only [6.0,6.5) moved), then B2 as a second (regen, diff = only dependents fixture). Suite green at each commit.
3. **Adversarial drift** after each: mutate the new constant, confirm a boundary/golden test bites.
4. TDD throughout: failing test → watch RED → minimal impl → GREEN; goldens last.

## Risks & mitigations
- **B1 cliff at 6.0** — intentional (visa-validity line); covered by a boundary test.
- **B2 funnel friction** — mitigated by an optional control on an existing step, default none.
- **Golden churn** — bounded by construction (B1: only [6.0,6.5); B2: only dependents-bearing). Inspect each diff.

## Success criteria
- An AU applicant with IELTS 6.0 no longer shows an English *shortfall*; the factor cites the DHA 6.0 floor.
- An AU applicant bringing a partner sees a higher required capacity and, if borderline, an honest band drop; an applicant applying alone is unchanged.
- `v0.3.0` / `config-v3`; goldens regenerated with only the intended movement; full suite green; typecheck clean.

## Open scope decision (flagged for approval)
B1 is small and ready. **B2 carries a wizard-UX + schema change** (a minority case — most Nepali applicants apply alone). Options: **(a)** ship both in this epoch as written; **(b)** ship B1 now and do B2 as a focused fast-follow (same `v0.3.0` line). Either keeps the approved batching of the *golden tax*. Recommendation: **(a)** if you want the dependents signal soon; **(b)** if you'd rather land the quick English-floor win first and design the dependents wizard control with more care.
