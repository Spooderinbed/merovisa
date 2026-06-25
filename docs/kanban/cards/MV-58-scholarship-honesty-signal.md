# MV-58 — Scholarships: research-degree honesty signal + Sydney pool-aggregate relabel

**Status:** IN REVIEW — SHIPPED 2026-06-26 on branch `mv-51` (branch+PR flow). Founder closes to Done after merge.

Relates to: the scholarships reference surface (`components/matches/scholarships-panel.tsx`, `lib/data/select-scholarships.ts`, `lib/data/source/au-scholarships.ts`). Source: the 2026-06-26 founder-gap triage (gap #3 — "scholarships is a flat, guidance-free list") and the MV-55 research brief (`docs/research-briefs/2026-06-26-mv55-scholarship-eligibility.md`).

**Why this is a separate card from MV-55.** MV-55 is scoped to the full **eligibility + application-process dataset** (per-award eligibility criteria, application steps, required docs), and its unblock condition is "an eligibility+application-process dataset is sourced & ledgered." That dataset does **not** exist yet — the brief's eligibility/figure/process facts are flagged NEEDS-REVERIFY (snippet-sourced, provider pages 403-block automated fetch) and are **not** ledgered as findings, so surfacing them now would violate trust-first. This card ships only the portion that is **already backed by existing findings** and is honestly shippable today; the rich "Who's eligible / How to apply" block stays on MV-55 (data-blocked).

## Problem

Two concrete honesty gaps in the live list:

1. **HDR-only awards looked applyable to coursework students.** The University of Melbourne **Graduate Research Scholarship** funds research-degree (PhD / research master's) candidates only, but the row gave no hint of that — a coursework master's applicant would waste effort chasing it. The brief's #1 honesty ask was exactly this: "most of these are research-only — surface that so coursework students don't chase awards they can't get."

2. **The University of Sydney row rendered a marketing aggregate as if it were one award.** It showed "Over AUD 135 million awarded per year" (from `totalAnnualValueAud: 135000000`) sitting in the amount slot beside per-student figures like "AUD 15,000 per year" — implying a single applyable scholarship worth $135M. That figure is the University's **total scholarship pool across all awards** (J2.009), not an award a student receives.

## What shipped

`lib/data/types.ts` + `lib/data/schema/au-scholarships.schema.ts`: new optional `AuScholarship.researchDegreeOnly?: boolean` (mirrors the existing `regionalCampusOnly` boolean; `z.boolean().optional()` in the schema).

`lib/data/source/au-scholarships.ts`:
- **UniMelb GRS** → `researchDegreeOnly: true`. Backed by its existing findings J2.007/J2.008 ("graduate **research** students") — true and ledger-supported.
- **Sydney** → kept `totalAnnualValueAud: 135000000` (the figure is real and sourced by J2.009; the finding ledger is **untouched**, and the reconcile drift guard stays green because the structured value still physically appears in the record). The fix is **presentational**, not a deletion.

`lib/data/select-scholarships.ts`:
- New `ScholarshipRow.studyEligibility?: string` (selector owns formatting; panel stays presentational — same pattern as MV-54's `applicationWindow`). Set to "Research degrees only — PhD or research master's" when `researchDegreeOnly`, else undefined.
- `formatAmount` total-pool branch relabeled: "Over AUD 135 million awarded **across all its scholarships** per year" — so it can never read as one award.

`components/matches/scholarships-panel.tsx`: renders the `studyEligibility` mono line only when present (after the coverage line, before the application window).

**Trust-first held:** only ledger-backed facts are surfaced. `researchDegreeOnly` is set **only** where it is both true and finding-supported (UniMelb GRS) — **not** on Sydney, whose pool spans coursework + research (claiming "research only" there would be wrong → honest absence). The Sydney $135M is kept and relabeled, not invented or deleted; the finding ledger and the structured-value drift guard are untouched. No scorer path touched; verdicts stay banded, no raw %.

## Test plan / evidence (TDD RED→GREEN, +4 net)

`tests/data/select-scholarships.test.ts`:
- **flags research-degree-only scholarships** — UniMelb GRS row's `studyEligibility` matches `/research degrees only/i`. *(RED: undefined.)*
- **frames the Sydney pool as institution-wide** — Sydney `amount` matches `/135 million/i` **and** `/across all its scholarships/i`; `studyEligibility` is undefined (mixed pool → honest absence). *(RED: amount lacked the qualifier.)*
- **honest absence** — Australia Awards, Destination Australia, and Sydney all keep `studyEligibility` undefined. *(GREEN from the start — the no-fabrication guard.)*
- (removed the stale Sydney `/over AUD 135 million/i` headline assertion from the existing amounts test; the dedicated Sydney test now covers it.)

`tests/components/scholarships-panel.test.tsx`:
- **renders the research-degree line + qualifies the Sydney pool** — `/research degrees only/i` present; `/across all its scholarships/i` present. *(RED: line absent.)*

**Gate green:** `npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing `done`-unused warning in `scripts/harvest-dha-evidentiary.mjs`, unrelated) · full suite **1375 passed** (231 files, was 1371 — +4) · **reconcile drift guard green** (`tests/data/reconcile-modules.test.ts` — J2.009's structured value still matches the record). No snapshot/golden coverage of the panel (grep-confirmed), so the additive optional field + conditional line is safe. Verified via the jsdom render test (panel is behind the auth-gated `/matches` route → no browser walkthrough, consistent with MV-51/52/54).

## Out of scope (deferred to MV-55 — data-blocked)

- **Per-award eligibility criteria** (age, citizenship, GPA, work-experience, priority fields), **application steps**, and **required-documents** lists. The brief sourced some of these but flagged them NEEDS-REVERIFY (search-snippet-sourced; provider pages 403-block automated fetch). They are **not ledgered as findings**, so surfacing them now would break trust-first. They stay on MV-55 until a per-scholarship eligibility/process dataset is sourced & ledgered.
- **Specific stipend dollar figures** (UniMelb AUD 39,500; Sydney RTP AUD 42,754) — 2026 rates, indexed annually, snippet-sourced. Not committed; coverage stays qualitative.
- **Destination Australia application window** — provider-specific, no national window; left absent (honest absence, same contract as MV-54).

## Founder-owned residuals (not blockers)

- **Merge the PR to master** (the single founder-gated step) → then close this card to **Done**.

## How a cold agent resumes

Done. The shipped change = one optional data flag (`researchDegreeOnly`) on `AuScholarship` + schema, set true on UniMelb GRS; one display field (`studyEligibility`) on `ScholarshipRow` mapped in the selector; a relabel of `formatAmount`'s total-pool branch; and a conditional `<p>` in the panel. The Sydney `totalAnnualValueAud` is **intentionally kept** (J2.009 backing + drift guard). If MV-55 later sources & ledgers a real eligibility/process dataset, add fields to `AuScholarship` + schema and render a richer "Who's eligible / How to apply" block — do **not** hard-code unverified eligibility text in the selector.
