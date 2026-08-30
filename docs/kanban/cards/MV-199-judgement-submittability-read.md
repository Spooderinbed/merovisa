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

## Sketch of acceptance criteria — to be firmed at Ready

1. Measure first: what the checklist and document-status rollups already compute
   for a case, before adding anything.
2. A deterministic, server-side submittability rollup with per-row explainability.
3. A written, tested ranking rule for the single blocking item.
4. Every blocking item carries `source`/`lastVerified`.
5. Not scoring-inert: each input moves the output.
6. Authorized through `checkCasePermission`, denials mutation-tested at both layers.
