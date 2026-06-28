# Journey-spine plan sequencing — design (MV-57)

**Date:** 2026-06-28 · **Card:** MV-57 · **Branch:** `mv-57-journey-spine` (off master)

## Purpose

A Nepali student who has a shortlist still doesn't know the actual sequence that turns
"I have matches" into "my visa is lodged and I'm tracking it." That gap is the single
clearest reason they still phone a consultancy — exactly what MyVisa exists to replace.

The "My Plan" page already groups actions into a **five-phase journey** (`lib/plan/phases.ts`:
A Decide → B Apply → C Confirm your place → D Prepare your visa → E Visa decision), and the
intro promises *"the steps to studying in Australia, in the order to tackle them."* But four
phases write cheques their steps don't cash — the phase blurbs describe steps that don't exist:

| Phase | Blurb promises… | Steps that exist today | Missing |
|-------|-----------------|------------------------|---------|
| **B** Apply | "…submit your applications" | only `start-passport-process` | submit university applications |
| **C** Confirm | "accept, and get your confirmation of enrolment" | `apply-for-noc`, `prepare-fund-remittance` | accept offer; get CoE |
| **D** Prepare visa | "…then **lodge it**" | all evidence prep (GS, health, police, biometrics, funds…) | OSHC; lodge Subclass 500 |
| **E** Visa decision | "Track the outcome once lodged" | *empty* | track the decision |

This slice **fills those empty slots with honest, government-sourced connective steps** so the
journey reads end-to-end. It is *not* a new phase model (that scaffold already exists, from
MV-37) — no migration, no scoring change, render-time only.

## Scope boundary

- **In:** the generic, gov-sourced post-shortlist→lodge→track spine for Nepal→Australia.
- **Out (generic by design):** per-**provider** offer-portal mechanics — each provider runs its
  own application/offer/deposit process, so we say "check your provider's offer letter / how-to-apply
  page" rather than invent specifics.
- **Out (deferred to a future slice):** pre-departure / arrival (visa granted → fly → settle).
  Its data is the genuinely research-blocked `H.jsonl` set; this slice stops at "track the decision."

## Verification (the honesty gate — done before this spec)

Every new step was verified against a live government source on 2026-06-28; nothing is invented:

- **Submit / offer / CoE** — Study Australia, *How to apply to study*
  (`https://www.studyaustralia.gov.au/en/plan-your-studies/how-to-apply-to-study`): apply via the
  provider's website or by emailing it directly; a Letter of Offer is issued; **"the CoE will be
  sent after you have accepted your Letter of Offer and paid your deposit"**; and a CoE is
  **mandatory to lodge since 1 Jan 2025 — the application is invalid without it**.
- **CoE / OSHC** — already human-verified rows in `lib/data/source/au-student-visa-requirements.ts`
  (`coe` A.002/A.118–A.122; `oshc` A.006–A.010/I.026), DHA-sourced, `lastVerified: 2026-06-05`.
- **Lodge** — DHA Subclass 500 listing
  (`https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500`): "submit your
  application **in ImmiAccount**… you will be provided with a list of documents to attach"; base
  charge **AUD 2,000** already sourced in `lib/data/policy/au-visa-fees.ts` (re-verify 2026-07-01).
- **Track** — DHA *After you apply*
  (`https://immi.homeaffairs.gov.au/help-support/applying-online-or-on-paper/online/after-you-apply`):
  "use ImmiAccount to check messages, check your application status, update your details or withdraw."

## The six connective steps

All six are emitted once `inputs.primaryDestinationId === "australia"` (same gate as the existing
AU steps), in calm future-tense, non-advisory voice. Each carries a real `SourceLine`. Completion
is **self-report** (Done / Mark as in progress / Dismiss) — no account state backs them.

| # | `kind` | Phase | Title (working) | Source |
|---|--------|-------|-----------------|--------|
| 1 | `submit-university-applications` | **B** | Submit your university applications | Study Australia how-to-apply |
| 2 | `accept-offer` | **C** | Accept your offer | Study Australia how-to-apply |
| 3 | `get-coe` | **C** | Get your Confirmation of Enrolment (CoE) | in-repo `coe` row (DHA) |
| 4 | `arrange-oshc` | **D** | Arrange your health cover (OSHC) | in-repo `oshc` row (DHA) |
| 5 | `lodge-subclass-500` | **D** | Lodge your Subclass 500 visa in ImmiAccount | DHA student-500 + `au-visa-fees` |
| 6 | `track-visa-decision` | **E** | Track your visa decision | DHA After-you-apply |

**Copy direction (honest, sourced, generic):**

1. **Submit applications** — "Apply to each university on your shortlist. Most accept applications
   through their own website, or by emailing them for an application form — there's no single
   national portal. Check each provider's 'how to apply' page for what they need." *(Hedged per
   Codex: never claim every provider has a portal.)*
2. **Accept your offer** — "If a university accepts you, it sends a Letter of Offer with the course,
   conditions and the deposit to pay. Accept it per the offer letter. You'll pay the deposit from
   Nepal once your funds are released — see the NOC and fund-release steps in this plan."
   *(Accept is the decision now; paying the deposit depends on the NOC/remittance steps, so we
   cross-reference rather than imply you just pay.)*
3. **Get your CoE** — "After you accept your offer and pay the deposit, your provider issues an
   electronic Confirmation of Enrolment (CoE). Since 1 January 2025 you must include a CoE when you
   lodge your student visa — without it the application is invalid. Your CoE shows your course
   dates and fees."
4. **Arrange OSHC** — "Your visa requires Overseas Student Health Cover. Buy a policy that starts at
   least a week before your course and runs for your whole stay, and keep the insurer name and
   policy dates for your application." *(From the in-repo `oshc` row.)*
5. **Lodge Subclass 500** — "You lodge the student visa yourself, online, through an ImmiAccount.
   Create the account, complete the application, attach your CoE, OSHC, financial evidence and the
   documents you've prepared, pay the visa application charge (currently AUD 2,000 — confirm the
   current amount), and submit." *(Fee carried by the sourced constant + drift-guard; phrased as
   "currently / confirm" because it re-verifies 2026-07-01.)*
6. **Track your decision** — "After you lodge, track your application in ImmiAccount — check
   messages and status there, and respond promptly if they ask for more documents, biometrics or a
   health exam."

## Ordering (within-phase sequence)

Phases are A→E hard gates; within a phase the existing rule is
`visaPrepOrder → impact → id` (`lib/plan/select.ts#withinPhase`). Two ordering needs this slice
introduces:

- **Phase C must read accept → NOC → remittance → CoE.** Today `apply-for-noc` is visa-prep
  (rank 1) so it would sort *before* `accept-offer`/`get-coe` (rank MAX) — wrong. Confirmed by the
  gov flow: you accept the offer, the NOC unlocks the bank remittance, you pay the deposit, then
  the CoE issues.
- **`lodge-subclass-500` must sort last in D**, after every prep step (incl. `arrange-oshc`,
  `upload-proof-of-funds`, `season-funds-six-months`). `track-visa-decision` is the sole E step.

**Mechanism:** add a small explicit `JOURNEY_RANK` map as the *primary* `withinPhase` key, falling
back to the existing `visaPrepOrder → impact → id` for unranked kinds. `withinPhase` only ever
compares same-phase items (phases are pre-separated by `groupByPhase` / `phaseOrder`), so one
monotonic rank is safe. Ranks (locked by tests):

```
submit-university-applications  → B, first in B (the phase's headline action)
accept-offer  →  apply-for-noc  →  prepare-fund-remittance  →  get-coe   (Phase C, in this order)
…existing D prep (unranked, keep current order)…  →  lodge-subclass-500  (last in D)
track-visa-decision  (sole E step)
```

Unranked kinds keep their default rank, so **every existing phase A/B/D ordering is preserved**;
only the C interleave, the OSHC insertion, and the lodge-terminal/track placements are new.

## Architecture & file plan

Surgical, mirrors the existing generator pattern. No DB column, no migration, no scoring change.

- **`lib/plan/generator.ts`** — emit the six new `PlanItem`s in the existing
  `primaryDestinationId === "australia"` block, composing copy from the verified facts (the in-repo
  `coe`/`oshc` rows, the `AU_SUBCLASS_500_APPLICATION_CHARGE_AUD` constant). *(edit)*
- **`lib/plan/phases.ts`** — `KIND_PHASE` gains the six kind→phase entries; add the `JOURNEY_RANK`
  map + `journeyRank(kind)`. `VISA_PREP_KINDS` is **unchanged** (the new kinds are connective, not
  checklist-mirrored visa-prep), so the `plan-links` drift guard stays green. *(edit)*
- **`lib/plan/select.ts`** — `withinPhase` consults `journeyRank` first. *(edit)*
- **`lib/plan/sources.ts`** — a real `SourceLine` per new kind. Pin literal URLs to a canonical
  data module so `tests/plan/sources.test.ts` (the drift guard) stays meaningful. The CoE/OSHC/fee
  facts already have modules; the two genuinely-new gov URLs (Study Australia how-to-apply, DHA
  after-you-apply) get a tiny sourced home — `lib/data/source/au-enrolment-lodgement.ts` — with
  `source` + `lastVerified: 2026-06-28`, so every URL remains traceable per the "source +
  lastVerified on every data point" rule. *(edit + new)*
- **`lib/plan/completion.ts`** — the six kinds resolve to the **self-report** completion shape
  (default, no `verified` account-state). Add entries only if `completionFor` doesn't already
  default to self-report for unknown kinds (verified during the build). *(edit if needed)*

No component change: `PlanList` / `PlanItemCard` already render any kind, its phase group, source
line and self-report controls.

## Honesty guardrails (encoded, not aspirational)

1. **No fabricated step.** Every step maps to a 2026-06-28-verified gov page or an existing
   human-verified in-repo row; the spec's Verification section is the audit trail.
2. **No provider over-claim.** Provider mechanics (which portal, what deposit) stay generic; the
   `submit`/`accept` copy is explicitly hedged.
3. **Volatile fee hedged + guarded.** The AUD 2,000 charge is rendered "currently … confirm the
   current amount," carried by the sourced constant and the `sources.test.ts` drift guard; its
   `reverifyBy: 2026-07-01` cadence covers the imminent fee update.
4. **Nepal-real sequence.** Phase C orders accept → NOC → remittance → CoE, matching how a Nepali
   student actually releases funds, rather than implying you "just pay."
5. **Non-advisory voice.** Steps describe the official process; they never advise on an individual
   case.

## Testing plan (TDD)

1. **`tests/plan/generator.test.ts`** — for an AU-primary input the plan includes all six new kinds
   with non-empty titles/bodies; for a non-AU primary none are emitted; the `submit`/`accept` copy
   carries the generic hedge (no "every provider has a portal"); the lodge copy carries the
   "currently … confirm" fee hedge.
2. **`tests/plan/phases.test.ts`** (or the select test) — each new kind maps to its phase
   (`phaseOf`); **Phase C order** = accept-offer → apply-for-noc → prepare-fund-remittance →
   get-coe; **`lodge-subclass-500` sorts last in D**; **`track-visa-decision` is the only E step**;
   existing phase A/B/D order is unchanged (regression pin).
3. **`tests/plan/sources.test.ts`** — the drift guard pins each new source URL to its canonical
   module (incl. the new `au-enrolment-lodgement.ts` rows).
4. **`tests/checklist/plan-links.test.ts`** — unchanged and still green (VISA_PREP_KINDS untouched,
   no new checklist mirror).
5. No verdict / scoring / results golden is touched — the generator composes existing sourced
   facts; the engine is not read or changed.

**Gate:** `npm run typecheck` + `npm run lint` + `npx vitest run` (full suite) green before the PR.

## Out of scope (YAGNI)

- Per-provider offer-portal detail — kept generic ("check your provider").
- Pre-departure / arrival steps — a future slice (research-blocked `H.jsonl`).
- Any per-application live state (that is the MV-73 outcome funnel's job, rendered separately).
- New scoring, new "next action" brain, persistence, or migration — none needed.

## Evidence

Built via strict TDD (failing test → minimal code → green) on `mv-57-journey-spine`.

- **Suite:** 247 files / **1544 tests** green (was 1500 → +44 this slice). `npm run typecheck` clean;
  `npm run lint` 0 errors (1 pre-existing warning in `docs/kanban/build.mjs`, untouched).
- **Files changed:** `lib/plan/generator.ts` (six AU-gated steps + sourced fee constant),
  `lib/plan/phases.ts` (six `KIND_PHASE` entries + `JOURNEY_RANK`/`journeyRank`),
  `lib/plan/select.ts` (`withinPhase` consults `journeyRank` first),
  `lib/plan/sources.ts` (six new drift-guarded source entries), `lib/data/types.ts`
  (`AuEnrolmentLodgementSource` interface).
- **Files created:** `lib/data/source/au-enrolment-lodgement.ts` (Study Australia how-to-apply +
  DHA after-you-apply, `lastVerified: 2026-06-28`).
- **Ordering confirmed by tests:** Phase C = accept-offer → apply-for-noc →
  prepare-fund-remittance → get-coe; `lodge-subclass-500` sorts last in D; `track-visa-decision`
  is the sole E step; existing A/B/D within-phase order regression-pinned unchanged.
- **completion.ts:** untouched — `completionFor` already defaults unknown kinds to the
  self-report shape (verified by the existing `select.test.ts` "defaults unknown kinds" case),
  so the six connective kinds get Done / Mark in progress / Dismiss with no edit.
- **VISA_PREP_KINDS unchanged** → the `tests/checklist/plan-links.test.ts` drift guard stays green.
