# MV-56 — My Plan: assemble the funds-release-from-Nepal walkthrough

**Status:** IN REVIEW — SHIPPED 2026-06-26 on branch `mv-51` (branch+PR flow). Founder closes to Done after merge.

Relates to: the plan generator (`lib/plan/generator.ts`) and the already-ledgered Nepal finance datasets (`lib/data/source/nepal-source-of-funds.ts` B.012–B.016, `lib/data/source/nepal-noc-journey.ts` B.017–B.024). Source: the 2026-06-26 founder-gap triage (gap #5 — "the funds-release pieces exist but aren't assembled into one coherent walkthrough").

## Problem — and what had already changed underneath it

The board card was written against the pre-MV-37 plan, where the funds-release steps rendered far apart (`generator.ts:138` vs `:214`) in an impact-ranked queue. **MV-37's A–E timeline already fixed the "scattered" half**: `phaseOf` now groups `apply-for-noc` and `prepare-fund-remittance` into **Phase C ("Confirm your place")**, rendered adjacently; `upload-proof-of-funds` sits in Phase D. So they are already *one section*.

What remained was that within Phase C the two steps didn't yet **read** as one walkthrough:

1. **The NOC was never defined in the plan.** The ledgered B.016 definition ("A No Objection Certificate (NOC) is the approval the Government of Nepal grants Nepalese students to study abroad") is surfaced on the per-program **checklist** (`lib/checklist/generator.ts:47`, `SOF_DEF`) but **not** in the plan — so a first-time reader meets "NOC" with no plain statement of what it is.
2. **No connective tissue.** `prepare-fund-remittance` says "your bank requires a No Objection Certificate…" but never tells the reader that getting one is its own step in the same plan — so the two Phase-C steps read as unrelated rather than as one funds-release journey.

## Design fork (Codex-consulted) — sequence, don't merge

The board's literal "assemble into a single plan step" reads as *merge the two PlanItems into one*. **Rejected** (Codex GPT-5 concurred): `kind` is the shared identity for three other systems — `completion.ts` (per-step done-tracking; both are self-reported), `sources.ts` (per-kind provenance + CI drift guard), and `VISA_PREP_KINDS` ordering — and the two items carry **different emit gates** (`finance.source` vs `primaryDestinationId === "australia"`) and **independent completion** (a student can tick "got my NOC" separately from "prepared remittance"). Merging would demolish that wiring and collapse two genuinely-separate milestones into one checkbox, for no gain MV-37's phase grouping doesn't already provide. Chosen approach: **keep the two separately-gated, separately-tracked steps; make them read as one walkthrough with ledgered copy.** Order stays **NOC-first** (already the within-phase order; the time-sensitive "start as soon as accepted" step leads), with copy describing the dependency/overlap rather than a strict sequence.

## What shipped (copy-only, `lib/plan/generator.ts`)

- **New `NOC_DEFINITION`** = `NEPAL_SOURCE_OF_FUNDS.find(kind === "definition").summary` (B.016). No new import (the module was already imported for `SOF_REQUIREMENTS`/`SOF_MECHANISMS`); only *consumes* the existing summary, so no dataset edit and no reconcile/drift impact.
- **`apply-for-noc` body** now leads with the B.016 definition, then the existing how-to: *"A No Objection Certificate (NOC) is the approval the Government of Nepal grants Nepalese students to study abroad. Once your offer arrives, apply for it — the permit your bank needs before it can remit tuition. The MoEST portal asks for [6 docs]. [2 steps] It can take time, so start as soon as you're accepted."* (Was "Once your offer arrives, apply for your No Objection Certificate (NOC) — the permit from Nepal's Ministry of Education…"; the redundant re-introduction of the term is dropped now that the sentence above defines it.)
- **`prepare-fund-remittance` body** appends a NOC cross-reference **only when `primaryDestinationId === "australia"`** (i.e. only when `apply-for-noc` is actually in the plan — no dangling reference for a funds-declared, destination-unset user): *"… Getting that No Objection Certificate is its own step in this plan — start it early, because your bank can only release the money once it's issued."*

**Trust-first / Codex catches honoured:** B.016 is framed **generally** ("study abroad"), not Australia-only (the NOC isn't an AU-specific document). All copy is ledger-backed (B.012/B.015 → "bank releases forex once the approval is issued"; B.016 → the definition). No scorer path, no raw %, no fabricated facts. No phase/sources/completion change — Phase C placement, the per-kind source URLs (same `noc.moest.gov.np` host, so `sources.ts` is untouched and its drift guard stays valid), and per-step completion all unchanged.

## Test plan / evidence (TDD RED→GREEN, +2 net)

`tests/plan/generator.test.ts`:
- **leads the apply-for-NOC step with the ledgered NOC definition (B.016), framed generally not AU-only** — `apply-for-noc` body contains "the approval the Government of Nepal grants Nepalese students to study abroad". *(RED: body began "Once your offer arrives…".)*
- **cross-links the remittance step to the NOC step — only when the NOC step is present (no dangling reference)** — with AU destination, `apply-for-noc` is emitted AND `prepare-fund-remittance` body contains "its own step in this plan"; with no destination, the remittance step is present but does **not** contain the cross-reference. *(RED: the clause didn't exist.)*

Existing locks all still green: the `apply-for-noc` `toContain` assertions (academic transcript / original documents / MoEST / title "NOC"), the `prepare-fund-remittance` assertions (No Objection Certificate / institution letter / Nepal Rastra Bank / MoEST portal), the phase-placement tests (`phases.test.ts` — both stay in C), the within-phase order (`select.test.ts`), the source drift guard (`sources.test.ts` — unchanged URLs), and the F2-closure guard.

**Gate green:** `npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing `done`-unused warning in `docs/kanban/build.mjs`, unrelated) · full suite **1377 passed** (231 files, was 1375 — +2) · data/reconcile guards green (no dataset touched). The plan generator has no snapshot/golden coverage (grep-confirmed), so the additive copy is safe. Verified by unit assertions on `generatePlan` output (the plan page is behind the auth-gated `/plan` route → no browser walkthrough, consistent with the rest of this lane).

## Out of scope (deliberate)

- **Merging the two items / collapsing the gates** — rejected above (breaks completion/sources/ordering; loses per-step tracking).
- **Pulling `upload-proof-of-funds` into the walkthrough** — it's Phase D (visa-lodgement evidence) by MV-37's journey model; crossing the C→D gate to graft it in is a phase-model change, not this card.
- **Re-sequencing phases / retitling Phase C** — MV-37's artifact; not touched.
- **The post-offer→lodgement + pre-departure half** — MV-57 (RESEARCH-BLOCKED: unsliced H/B rows + offer-portal research).

## Founder-owned residuals (not blockers)

- **Merge the PR to master** (the single founder-gated step) → then close this card to **Done**.

## How a cold agent resumes

Done. The shipped change is three edits in `lib/plan/generator.ts`: a `NOC_DEFINITION` const consuming B.016's summary; `apply-for-noc` leads with that definition; `prepare-fund-remittance` appends an AU-gated cross-reference to the NOC step. No data, phase, sources, or completion change. If MV-57 later sources the offer/lodgement steps, they extend the SAME Phase C/D walkthrough — add the kinds to `phases.ts`/`VISA_PREP_KINDS` and cross-reference them the same way; do not merge existing kinds.
