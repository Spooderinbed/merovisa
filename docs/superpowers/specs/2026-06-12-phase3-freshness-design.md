# Data-governance Phase 3 — volatile/stale freshness refresh — design spec

**Date:** 2026-06-12
**Status:** APPROVED by user 2026-06-12. Trust-maintenance slice ④·2 — makes the Phase-1 freshness guard *live* and clears the stale ledger. Follows ④·1 (refusal/recovery ART truth-fix). Evidence basis: `docs/audits/2026-06-10-data-governance-and-triage.md` (freshness enforced, not decorative) + the Phase 2a triage (`docs/audits/2026-06-10-pending-ledger-cluster-triage.md`, 15 findings triaged `stale`).
**Scope (user-ratified):** Golden-safe pass — expiring facts only — backfill first, then a sign-off table for grant rates + the 15 stale findings — reject static-unfit facts — real 1 July deadlines.

## Problem

Phase 1 added `volatility`/`reverifyBy` to both provenance schemas and a `freshness.test.ts` guard that goes red the day any `reverifyBy` arrives — but **no data module sets either field**, so the guard is inert and the system has no reminder to re-check facts that expire. Separately, Phase 2a triaged **15 findings `stale`** — facts that may have moved since capture — and they have sat untouched. Today is 2026-06-12; a cluster of Australian-government annual figures changes on the **1 July 2026** financial-year boundary (visa charges, tax, minimum wage, the ART review fee) with no deadline tracking them.

This slice (a) makes freshness real by tagging the expiring **used** facts with their genuine change-dates, (b) refreshes the shipped HE/VET grant-rate numbers against the current dataset with sign-off, and (c) dispositions the 15 stale findings — re-verifying the ones that belong in a static ledger and rejecting the ones that don't.

## Decisions

1. **Golden-safe pass.** No scorer-input **value** changes this slice. Backfilling `volatility`/`reverifyBy` is metadata on `provenance` — the scorer reads `value`, not provenance — so it is byte-identical to goldens **even on scorer-input modules** (fx-rates, cost-of-living). The 15 stale findings are all `pending` (triage is pending-only), so dispositioning them cannot move goldens either. Any volatile **value** that feeds scoring stays flagged for a separate, separately-verified pass.
2. **Expiring facts only.** Tag `volatility:"annual"|"volatile"` + `reverifyBy` only on facts that actually change over time. Stable process/eligibility facts stay untagged (absence of a deadline already means "stable" to the guard). No 50-module sweep.
3. **Approach B sequencing — backfill ships first, research-refresh second behind one sign-off gate.** The deterministic freshness metadata must not be blocked by research uncertainty.
4. **Reject static-unfit facts (≠ bad research).** Data that can never be a reliable static product fact — daily FX snippets, one-off job-ad salaries, seasonal promos, out-of-corridor figures — is set `status:"rejected:<reason>"` with a reason that names the *unsuitability*, not a research fault (`dynamic-data`, `ephemeral-jobad`, `promo-window`, `out-of-scope`). The dynamic ones are live-feed candidates for a future system, not discards — the reason records that.
5. **Real 1 July deadlines.** `reverifyBy` is set to the genuine change-date even though it turns the freshness guard red on 2026-07-01 (~19 days out). That *is* the guard: it forces a re-check of the fee/tax/wage/charge cluster when those numbers actually change. Never pushed out to keep CI green longer. All deadlines are in the future as of 2026-06-12, so the **commit-time** guard stays green.
6. **Grant rates: refresh with sign-off, never silent.** HE/VET numbers change only through the sign-off table (§W2).

## W1 — Freshness backfill (Commit 1; deterministic, golden-safe, no research)

Tag `volatility` + `reverifyBy` on the **used** expiring records across the data modules. Classification rule:

- **`annual`, `reverifyBy:"2026-07-01"`** — facts genuinely pinned to the 1 July financial-year boundary: DHA student-visa application charge (`au-visa-fees`), skilled-visa charges (`au-visa-charges-skilled`), tax/Medicare figures (`au-tax-figures`), Fair Work minimum/award wages (`au-student-worker-wages`), and the ART review fee (`nepal-refusal-recovery[recovery-cost]`, AUD 3,580 — I.045/I.047 both flag the 1 July revision).
- **`annual`, genuine cadence (plan-pinned future date)** — facts that revise annually but *not* on the 1 July boundary: the DHA financial-capacity requirement (`au-cost-of-living`), payment surcharges (`au-payment-surcharges`), tuition / provider & application fees (`au-provider-application-fees`, `nepal-application-fees`, `iom-nepal-health-fees`, tuition facts). Each gets its real next-review date (verified in the plan), always future.
- **`volatile`, future quarterly `reverifyBy`** — facts that drift continuously but are carried as a periodically-re-checked static approximation: FX (`fx-rates`, `nepal-forex-cards`), DHA processing-time medians (`nepal-document-processing-times`), the student-visa cap/limits (`au-student-visa-limits`). `fx-rates` is additionally noted in-code as the prime future live-feed candidate (consistent with rejecting D.003/004).

The exact record list per module is pinned in the implementation plan (each module read, each expiring record tagged, stable rows left alone). **Grant rates are *not* tagged here** — their `volatility`/`reverifyBy` lands in W2 alongside the refreshed numbers, so each fact is tagged exactly once. Config modules (`Sourced<T>`) carry the same fields via `ConfigProvenanceSchema`.

**Guarantee:** W1 edits only `provenance.volatility`/`reverifyBy` — no `value`, no finding. `golden-assessments.json` byte-identical; reconcile/schema/flip-status untouched; the only suite delta is the freshness guard now walking real deadlines (green at commit time, all dates future).

## W2 — Grant-rate refresh (Commit 2; research + sign-off, golden-safe)

The shipped HE 85.3% / VET 36.3% (Apr–Jun 2025, I.034/I.035, `used` by `nepal-refusal-recovery`) are ~1 year stale. Process:

1. Re-verify the current Home Affairs student & temporary-graduate report for a cleaner/fresher Nepal × sector × outside-Australia grant-rate breakdown (the stale I.040/I.041 Nepal grant-*count* findings come from the same report and are re-verified in the same pass).
2. **Sign-off table** (part of the §gate): proposed HE %, VET %, reporting period, source — or "no clean fresher Nepal×sector×offshore breakdown; keep current + set deadline."
3. On approval: update the finding `value` + `claim` + `lastVerified` (I.034/I.035) **and** the module `value` + `summary` + `period` together, so reconcile's value-fidelity pass stays green; set `volatility:"volatile"` + the next-quarter `reverifyBy`. The locked VET-guard line and "never personal odds" framing are untouched.

Golden-safe (the refusal panel is fact-only, no scorer reads it). If the user keeps current numbers, only the freshness tag is added.

## W3 — Stale-queue disposition (Commit 2; research + sign-off)

Re-verify or reject each of the 15 `stale` pending findings, clearing the `stale` triage. **Preliminary lean (each row confirmed in the sign-off table after re-verification):**

| Finding | Fact | Lean |
|---|---|---|
| C.078 | Visitor-visa median processing | **reject:out-of-scope** — not a Nepal→Australia *student* decision input |
| D.003 / D.004 | NRB AUD buy/sell daily rate | **reject:dynamic-data** — daily FX, live-feed candidate not static ledger |
| E.158 / E.159 / E.160 | Individual Nepal job-ad salaries (2022–24) | **reject:ephemeral-jobad** — one-off ads, never a stable static fact |
| H.012 | Seasonal airline student promo | **reject:promo-window** — time-boxed promotion |
| A.032 | DHA student-visa median (Apr 2026) | **re-verify** → re-date, stale→use-later |
| G.050 | Edwise IELTS prep-fee band (2024-05) | **re-verify** → re-date or reject:unverifiable |
| H.016 | Expedia 2025 Air Hacks booking stat | **re-verify** (2026 edition) → use-later or reject |
| H.077 | Reporting Protections Pilot (2yr from 2024-07) | **re-verify** status → use-later or reject:lapsed |
| I.040 / I.041 | Nepal grant counts FY2024-25 (same report as W2) | **re-verify** vs current dataset → use-later |
| I.047 | ART fee-increase notice → AUD 3,580 (1 July revision) | **re-date, stale→use-later** (recheck July; the data-side deadline rides on `recovery-cost` from W1) |
| J1.015 | TOEFL fee (undated blog, ~USD 180) | **re-verify** vs official source → use-later or reject:unverifiable |

Mechanism: re-verify → `lastVerified` bumped, triage `stale`→`use-later`/`ready` (the human-owned triage tool/edit); reject → `status:"pending"`→`"rejected:<reason>"`, triage cleared. None are `used`, so flip-status is unaffected and goldens cannot move. (Exact tool vs manual-edit mechanism for `rejected:*` is confirmed in the plan.)

## The sign-off gate (between Commit 1 and Commit 2)

After W1 ships, I do the W2 + W3 re-verification research and present **one consolidated sign-off table**: the proposed grant-rate numbers/period and the per-finding disposition (reject-reason or re-verified value/date) for all 15. Nothing in Commit 2 is applied until the user approves or adjusts the table. This is the "AI-drafts, human-verifies" checkpoint.

## Out of scope

- **Scorer-input value refreshes** (FX, cost-of-living, verdict thresholds, visa fees the scorer reads) — metadata tagged here, values deferred to a dedicated golden-moving pass the user verifies separately.
- **Explicit `stable` tagging** of non-expiring facts (governance-only, no functional value).
- **A live-feed/dynamic-data system** for the rejected FX/promo/job-ad class — noted as the destination for that data, built later.
- **Integrating** any re-verified stale finding into code (that is a future product slice; W3 only re-triages).
- New analytics, components, checklist/plan, or schema changes — the freshness fields and guard already exist (Phase 1).

## Acceptance criteria

1. **Commit 1 (W1):** every tagged record sets `volatility` + a **future** `reverifyBy`; the AU financial-year cluster carries `reverifyBy:"2026-07-01"`; `golden-assessments.json` byte-identical; reconcile/schema/flip-status green; `freshness.test.ts` green at commit time (all deadlines future); no finding edited.
2. **Sign-off gate:** a consolidated table covering grant rates + all 15 stale findings is presented and approved before any Commit 2 edit.
3. **Commit 2 (W2):** grant-rate finding `value` and module `value` move together (value-fidelity green); `reverifyBy` set; or, if kept, only the deadline is added. Refusal panel still renders (browser-verified if numbers changed).
4. **Commit 2 (W3):** the 15 `stale` findings are all dispositioned — `stale` triage count → **0**; rejected rows carry an unsuitability reason (never a research-fault reason) and leave the pending pool; re-verified rows are `use-later`/`ready` with bumped `lastVerified`; reconcile/flip-status green; goldens byte-identical.
5. **Full gate:** typecheck + lint + suite green; ledger rebuilt (`used` unchanged at 485; `pending` drops by the number rejected; `stale` → 0); `PROJECT_STATUS.md` + memory updated.
