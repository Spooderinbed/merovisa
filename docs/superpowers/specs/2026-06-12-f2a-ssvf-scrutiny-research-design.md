# F2 Option A — Nepal/SSVF financial-scrutiny research (research-only slice)

**Date:** 2026-06-12 · **Status:** user-approved (guardrails below are theirs, verbatim in spirit) · **Lane:** value-triage / trust-maintenance
**Origin:** read-through packet F2 (`docs/audits/2026-06-12-trust-copy-readthrough.md`) — Option B reworded the
unsourced "Assessment Level L3 / 6-month seasoning / >AUD 5,000" cluster to our-recommendation voice;
Option A is the queued research debt: source the underlying claim properly or settle its permanent status.

## The claim, decomposed (each researched separately)

1. **The dated event:** "Nepal returned to Assessment Level 3 on 2026-01-09" (and the prior step,
   "L3 → L2 on 2025-03-31"). Memo sources: VisaHQ news + the Nepali consultancy cluster (Landmark,
   Westford, PEC, Search Education — the memo's own source-quality section says to treat these as **one
   logical source**). Note C.007's caveat: current DHA pages don't use "Assessment Level" language at
   all — the operative SSVF term is **evidence level** (C.007/C.008, gov, `used`).
2. **The 6-month bank-seasoning expectation.** Memo §4.3 + §416: 3-month baseline "stable",
   6-month is explicitly "practitioner advice, not DHA-published".
3. **The >AUD 5,000 source-of-funds threshold.** Practitioner-only; dropped from product in ④·3b.
4. **The standing line:** "Nepal applications face heightened financial-evidence scrutiny" (current
   Option B recommendation voice) — can it be upgraded to a sourced, dated claim?

## Method — tiered sources, separated throughout

- **Tier 1 gov/primary:** DHA evidence-levels + SSVF pages (known JS-shell risk → sandboxed urllib with
  browser UA), the Document Checklist Tool's published description, any DHA announcement. Historical
  anchor: pre-SSVF Migration Regulations **Schedule 5A** (the legislated 3-month held-funds rule under
  the old AL regime) via legislation.gov.au — explains where the "3-month" norm comes from honestly.
- **Tier 2 sector/secondary:** ICEF Monitor, The PIE News, university/agent bulletins, VisaHQ news item.
- **Tier 3 practitioner:** the memo's consultancy cluster (one-logical-source rule applies).
- ≤ ~12 fetches; every admitted claim carries a quote + URL + tier + date.

## Deliverables

1. **Research brief** `docs/research/2026-06-12-nepal-ssvf-financial-scrutiny.md`: per-claim verdict
   (sourceable at which tier, with what wording), the source table, and a **three-way proposal** —
   (a) restore a sourced, dated line; (b) keep the recommendation wording permanently; (c) reject the
   stronger claim — with a recommendation and exact candidate copy for whichever option is proposed.
2. **Ledger findings only if sources are good enough** (new `C.145+` rows; `pending`, human-triaged on
   entry, `confidence`/`publisher` honest per tier). No status flips, no product use, no FLIP_STATUS.

## Guardrails (user's, this slice fails if any is broken)

- **No product copy changes** — zero diff under `lib/`, `components/`, `app/`, `tests/`.
- Ledger findings added **only if sources are good enough**; gov/primary kept separate from practitioner.
- Ends with the proposal; **the user signs off before any product copy changes** (a later slice).
- After this slice: **verify-MARN** is the next product/action slice.

## Gates

Diff limited to `docs/research/**`, `docs/research-briefs/findings/**` (additive rows only),
`docs/superpowers/specs/**`, `docs/PROJECT_STATUS.md` (+ local memory). `npm test` / typecheck / lint
green; goldens trivially byte-identical; if findings are added, reconcile / schema / findings-integrity /
id-immutability stay green; WIP trio untouched. Conventional commits; report ends with the proposal and
stops for the user's call.
