# MV-199 — Judgement slice 2: the submittability read

The second slice of the judgement layer. Spec:
`docs/superpowers/specs/2026-08-29-judgement-layer.md`.

Capability **#2 of seven** in `docs/research/2026-08-11-program-data-wedge.md` §6 —
evidenced, and with no incumbent:

> "Evidence-completeness read: which of my students is actually submittable, and
> what single item is blocking each."

Its demand evidence is indirect but firm: ApplyBoard filters 24% of applications
pre-submission and publishes that as a *selling point to institutions*; the UK's
Agent Quality Framework makes agent-sourced evidence the agent's accountability.

In the positioning line — *"we tell you which ones, and what is missing, before you
lodge"* — MV-198 is "which ones" and this card is **"what is missing"**.

## Why this is the mechanical half

Every input already exists in the database. Stage 4 shipped `document_requests`,
`document_versions` and `document_reviews`; the per-program checklist already
computes required items per program; `document_status` already tracks per-item
state. Nothing here needs new sourced data, which is what makes this the slice to
pull forward if MV-198 stalls on threshold sourcing.

The work is a **deterministic rollup plus a ranked blocker**, not a model.

## The two reads

1. **Submittable or not** — a boolean-with-reasons over the case's required
   evidence for its chosen program. Deterministic and explainable: a counsellor must
   be able to see exactly which rows produced the answer.
2. **The single blocking item** — the ranked-first unmet requirement. "Single" is
   the product: a list of eleven missing things is what the existing checklist
   already shows and is not this card. The ranking rule needs to be written down and
   defended, not implied by array order.

## Constraints

- **Deterministic, never generated.** No LLM in the path. The research's sharpest
  competitive contrast (§7) is that Cosmic CRM appears to *generate* eligibility
  judgements per query — unsourced, undated, unauditable. Producing this read the
  same way would forfeit the contrast.
- **Provenance on every requirement.** Each blocking item cites the requirement's
  `source` and `lastVerified`. This is the differentiator the research says no
  competitor exposes.
- **Do not restate the checklist.** Per-program document checklists are shipped by
  all four Nepali CRMs (research §6, rank 5, "do not treat this as differentiated").
  The differentiated output is the *rollup and the single blocker*, not the list.
- The banded/provenance/provider-not-adviser/scoring-inert constraints in the spec
  apply here too.

## Where it meets MV-198

**Source-of-funds credibility** is a visa-refusal factor (MV-198) whose evidence is
document rows (this card). Keep the seam narrow and explicit: MV-198 should consume
a named function from this slice rather than re-deriving document state, and
whichever card ships second owns wiring it.

## Criterion 1 — MEASURED 2026-08-30

`tests/judgement/submittability-read-measurement.test.ts`, **11/11**. Two of my own
assumptions were wrong and are corrected in the probe; the card's premise **holds,
and holds harder than it claimed**.

### The premise holds — and half the work is already written

| Claim | Measured |
|---|---|
| A truthful **denominator** exists | **Yes.** `generateChecklist` returns `requirement: "required" \| "recommended"` per program |
| Items carry completion state | **Yes.** `status: "have" \| "obtained" \| "missing" \| "info"` |
| Items carry provenance | **Partially** — some required rows have `source`/`lastVerified`, some do not |
| The **rollup** exists | **Yes, already built.** `computeReadiness` is an honest per-stage "X of Y required ready" |

The card said "every input already exists in the database". Stronger than that: the
*rollup itself* already exists. What does **not** exist is any way for the workspace
to reach it.

### The gap, stated precisely

`computeReadiness` is called from **exactly one place** — the student's checklist
**view** component. Nothing in `lib/cases/` computes it, so no case-scoped, server-side
read can answer "is this case submittable". The probe pins that caller list so the
slice cannot quietly add a second implementation instead of lifting this one.

Meanwhile `lib/cases/lodgement.ts` — what the workspace *does* read — never mentions
the checklist. **So there are two unrelated notions of "outstanding" in this codebase:**

1. **what a counsellor asked for** — `case_document_requests`, no denominator. This is
   why `submittability-panel.tsx` says in its own header that there is no "documents
   needed" anywhere: true of its source, not of the codebase.
2. **what the program requires** — the checklist, with a denominator and provenance.

Reconciling those two is this slice's real work, and **neither may silently stand in
for the other**.

### Three findings that constrain the build

1. **`readyToApplyNow` means ready to APPLY, not ready to LODGE.** It is scoped to the
   `now` stage and deliberately ignores `after-offer` — the visa-stage documents. The
   card is about *submittability*, so reusing this flag under a lodgement heading
   would overclaim. Measured: with every `now` requirement met it reports `true`
   while after-offer rows are still outstanding.
2. **The rollup depends on PLAN state, not only documents.** Rows in
   `CHECKLIST_PLAN_LINKS` complete only when their linked plan action is `done`, so
   uploading every now-stage document still leaves `readyToApplyNow === false`. A
   case-scoped version must read `plan_items` too.
3. **A "required" row is not always a document.** Some carry `kind: null` and
   `status: "info"` — a step or note that cannot be uploaded and has no completion
   signal. They must not enter a denominator, and they cannot ever be the blocker.

**And the thing that has to be authored:** there is **no ranking signal on a
`ChecklistItem`** — no `rank`, `priority`, `order`, `weight` or `severity`. So
criterion 3's rule cannot be a sort over an existing field, and the order items happen
to be generated in must not become the rule by accident.

## Acceptance criteria (firmed 2026-08-30)

1. ~~Measure first.~~ **Done — see above.**
2. A **server-side, case-scoped** submittability read that lifts `computeReadiness`
   rather than reimplementing it, and reads the case's documents **and plan items**.
   Per-row explainability: a counsellor can see exactly which rows produced the answer.
3. A **written, tested ranking rule** for the single blocking item — authored, not
   inherited from array order, and never an `info` row.
4. Provenance rendered **where it exists and only there** — coverage is partial.
5. **Not scoring-inert**: each input moves the output, including the plan-linked rows.
6. Authorized like MV-198's read. **Note the same correction:** this read is derived,
   not stored, so criterion 6's "denials mutation-tested at both layers" applies to
   its *sources* (`documents`, `plan_items`), which RLS already governs — there is no
   new policy to widen. Staff-only is enforced at the read.
7. **Apply-stage and lodge-stage are stated separately.** The panel may not collapse
   them into one word.
8. Do not restate the checklist. The differentiated output is the rollup and the
   single blocker.
