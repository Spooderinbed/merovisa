# The judgement layer — per-case visa-risk and submittability

**Carved 2026-08-29.** Sits between Stage 5 (invitations and student portal) and
Stage 6 (audit, export, archive, delete) in
`docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`.

It is **not** a stage in that plan. The plan was written 2026-07-23; the wedge
research that motivates this layer landed 2026-08-11 and changed what the
consultancy version is *sold on*. CLAUDE.md records the resulting sequence —
"Stage 5 student invitations → **judgement-in-workspace (per-case visa-risk +
submittability read)** → Stage 6" — and this spec is that insertion, written down.

## Why this layer exists

From `docs/research/2026-08-11-program-data-wedge.md` §6, which ranked seven
data-enabled capabilities by (evidence of demand × distance from what competitors
ship):

| Rank | Capability | Status |
|---|---|---|
| 1 | Pre-lodgement **visa-refusal risk read** per student, with the evidence gap named | **EVIDENCED, strongly** — no incumbent |
| 2 | **Evidence-completeness read** — who is submittable, what single item blocks each | **EVIDENCED** — no incumbent |
| 3 | Cross-caseload queries — who is closest to submittable | Unevidenced, but near-free once 1 and 2 exist |
| 5 | Per-program requirement checklists | Already shipped by all four Nepali CRMs |
| 6 | Instant evidence-backed shortlisting | Already served — **do not build as the wedge** |

The report's own summary: *"capabilities 6 and 5 — the ones the founder's thesis
leads with — are the two that are already served. Capabilities 1 and 2 are the ones
with live, dated, third-party demand and no incumbent."*

So this layer is **capability 1, then 2, then 3**, and nothing else. Catalogue
breadth and shortlisting are explicitly out (CLAUDE.md: "Do **not** pitch or build
catalogue breadth … or commodity-CRM features ahead of the wedge").

The line the layer has to make true, from §7:

> "Your platform tells you whether the university will say yes. One in three of
> those students is refused a visa anyway — two in three from Nepal. We tell you
> which ones, and what is missing, before you lodge."

"Which ones" is slice 1. "What is missing" is slice 2.

## What already exists — measured, 2026-08-29

**This is the section that stops the layer being rebuilt from nothing.** Four of
the six factors the research names are already modelled and already carry
provenance.

- **`lib/scoring/visa.ts` — `scoreVisa(profile)`** returns a `DimensionScore`:
  a 0–100 `value` plus `factors[]`, each an
  `{ label, influence: "positive" | "neutral" | "risk", detail, source? }`.
  That is *already* the shape of an evidence-named risk read. It covers:
  - **English visa-floor vs course threshold** — and correctly distinguishes them
    (`ENGLISH_VISA_FLOOR_BY_DEST` vs `ENGLISH_THRESHOLD_BY_DEST`), converting
    PTE/TOEFL to IELTS-equivalent first. The floor factors carry
    `source`/`lastVerified` from `CONFIG_PROVENANCE`.
  - **Gap justification** — `computeGapYears` plus `GAP_REASON_WEIGHT` mitigation.
  - **Prior refusal** — a flat rule-level penalty, versioned by `RULE_VERSION`
    rather than the sourced-config layer, with the reason stated in the file.
- **`POST /api/cases/[caseId]/assess`** already runs the engine for a *case* and
  persists the result to `assessments` with `is_primary` arbitration
  (`assessments_case_primary_idx`), an explicit `FAR_FUTURE` expiry so MV-135's
  purge cannot reach it, and destination-honesty refusal for unsupported corridors.
- **`lib/scoring/financial.ts`** models financial capacity — but as a *separate
  dimension of the student verdict*, not as a visa-refusal factor.
- **Stage 4** shipped `document_requests`, `document_versions`, `document_reviews`
  and per-program checklists. That is the raw material for slice 2, and it is also
  where source-of-funds *evidence* lives.

## What is actually missing

1. **The workspace surfaces none of it.** The case has profile, matches, plan,
   checklist, documents and manage pages
   (`app/(app)/workspace/[organizationId]/students/[caseId]/`). There is no verdict
   surface, no risk surface, and no submittability surface anywhere in the
   consultancy version. The judgement that is meant to be the reason to buy is
   currently invisible to the buyer.
2. **Two of the six named factors are not modelled at all:**
   - **source-of-funds credibility** — needs document evidence, so it is where
     slice 1 and slice 2 meet;
   - **provider risk level** — needs per-institution DHA risk-rating data MeroVisa
     does not hold. See "Data-blocked" below.
3. **Financial capacity is not folded into the visa read.** It is a verdict
   dimension today; the research names it as a refusal factor.
4. **There is no submittability read and no blocking-item read at all.**

## Constraints that bind every slice

These are existing repo law, restated here because a judgement surface is exactly
where each one is easiest to break.

- **Banded, never numeric.** Verdicts are Strong / Possible / Reach words and
  colour bands; percentages are never shown to users (CLAUDE.md, Key Decisions).
  A refusal-risk read must be a band with named factors, **not** "68% likely to be
  refused". A number would also be a claim MeroVisa cannot source.
- **Provenance or silence.** Every data point carries `source` and `lastVerified`.
  A factor whose threshold has no source may not be asserted as one.
- **Provider, not adviser.** Founder call 2026-08-17: MeroVisa is a provider of
  tooling and judgement, **not a migration adviser**; a consultancy-managed case's
  refusal risk is the consultancy's. Copy must read as an evidence read for a
  professional, never as immigration advice to a student. The B2B legal gate
  (MV-05) is deferred, not resolved — this layer must not create the exposure that
  gate exists to hold.
- **Server-side and versioned.** Scoring rules never reach client JS.
- **No scoring-inert surface.** MV-105's lesson: a factor that is displayed but
  drives nothing is a trust defect. Every slice needs the test that its inputs
  actually move its output.
- **Imageless product body.** Judgement surfaces are product body — words and
  colour bands only (`docs/imagery-policy.md`).

## Data-blocked — do not fake these

- **Provider risk level.** The DHA assigns providers an evidence level; the
  research notes ~50% of it is refusal-driven. MeroVisa holds no per-institution
  risk data and it is not free. **Slice 1 must omit this factor and say so on the
  surface** rather than approximate it. Naming a gap is cheaper than being wrong,
  and "the evidence gap named" is part of the capability as the research defines it.
- **Live refusal base rates by cohort.** The 65% Nepal figure is a corridor
  statistic, not a per-student probability, and must never be rendered as one.

## The slices

| Card | Slice | Column |
|---|---|---|
| **MV-198** | The per-case visa-risk read — compose `scoreVisa` into a case-scoped surface, fold in financial capacity and source-of-funds, name the omitted factor | Ready |
| **MV-199** | The submittability read — is this case lodgeable, and what single item blocks it | Backlog |
| **MV-200** | The caseload roll-up — the students list ordered by the two reads | Backlog |

Sequencing rationale: slice 1 first because it is the declared wedge and the reason
to buy, and because most of its engine already exists. Slice 2 is the more
mechanical of the two (its inputs are all Stage 4 rows) and can be pulled forward
if slice 1 stalls on threshold sourcing. Slice 3 is deliberately last and small —
the research marks it **unevidenced**, so it earns no design investment beyond
sorting what slices 1 and 2 already computed.

## Open founder decisions

1. **Does the visa-risk read carry a band at all, or only factors?** A band invites
   the "you told me it was Strong" conversation that the provider-not-adviser
   position exists to avoid; a bare factor list is harder to sell and harder to sort
   a caseload by. Slice 1 assumes **band + factors, with the band explicitly framed
   as an evidence read**, and the decision is reversible in one component.
2. **Is provider risk worth sourcing?** It is the one named factor that is
   data-blocked, and it is ~50% refusal-driven. Sourcing it is a data project, not
   a build slice.
3. **Does the student see the visa-risk read on their linked consultancy case?**
   MV-195 decision D says the student *reads* their consultancy case; MV-196 closed
   their *write*. A refusal-risk read is the sharpest thing on the case, and showing
   it to the student is a different product than showing it to the counsellor.
   Slice 1 assumes **staff-only** and leaves the student surface untouched.
