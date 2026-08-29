# MV-198 — Judgement slice 1: the per-case visa-risk read

The first slice of the judgement layer. Spec:
`docs/superpowers/specs/2026-08-29-judgement-layer.md`.

This is the capability the wedge research ranks **#1 of seven** — the only one with
live, dated, third-party demand and no incumbent — and it is the declared reason a
consultancy buys the workspace at all.

> "Your platform tells you whether the university will say yes. One in three of
> those students is refused a visa anyway — two in three from Nepal. We tell you
> which ones, and what is missing, before you lodge."
> — `docs/research/2026-08-11-program-data-wedge.md` §7

"Which ones" is this card.

## This is a composition slice, not a from-scratch one

**Read the spec's "What already exists" section before writing anything.** Four of
the six factors the research names are already modelled, already versioned, and
already carry provenance:

- `lib/scoring/visa.ts` → `scoreVisa(profile)` returns `{ value, factors[] }`, each
  factor an `{ label, influence: "positive" | "neutral" | "risk", detail, source? }`.
  **That is already the shape of an evidence-named risk read**, and the English
  factors already carry `source`/`lastVerified` off `CONFIG_PROVENANCE`.
- It already distinguishes the DHA **visa floor** from the **course threshold** —
  the distinction the research names — and converts PTE/TOEFL to IELTS-equivalent
  before comparing.
- `POST /api/cases/[caseId]/assess` already runs the engine per case and persists
  to `assessments` with `is_primary` arbitration and a `FAR_FUTURE` expiry.

So the work is: **compose what exists into a case-scoped read, close the two factor
gaps that can be closed, name the one that cannot, and put it on a surface.**
A slice that reimplements `scoreVisa` has misread the card.

## What is genuinely missing

1. **The workspace surfaces none of it.** The case has profile / matches / plan /
   checklist / documents / manage pages and **no verdict or risk surface at all**.
   The judgement meant to be the reason to buy is invisible to the buyer.
2. **Financial capacity is not in the visa read.** `lib/scoring/financial.ts` models
   it as a *verdict dimension*; the research names it as a *refusal factor*.
3. **Source-of-funds credibility is not modelled.** Its evidence is Stage 4 document
   rows, which is where this slice touches MV-199 — keep the seam narrow.
4. **Provider risk level is data-blocked** and must be *named as absent*, not
   approximated. See the spec's "Data-blocked" section.

## Acceptance criteria

1. **Measure before changing anything.** A committed probe records what
   `scoreVisa` returns today for a representative case profile, and what the
   workspace case pages currently render. MV-196's criterion 1 rewrote its own card
   this way; assume this one will too, and let the measurement land first.
2. A **server-side, case-scoped read model** composes the visa dimension with
   financial capacity into one refusal-risk read. Rules stay out of client JS.
3. A **staff-facing surface** in the case workspace renders it: a band plus the
   named factors, sentence case, imageless, design tokens only.
4. **Banded, never numeric.** No percentage, score, or probability reaches the
   rendered output — including `title`/`aria-label` text and any serialized payload
   the client receives. A test asserts this, not a review.
5. **Provenance is rendered where it exists, and absent where it does not.** A
   factor carrying `source`/`lastVerified` shows it; a factor without one does not
   assert a sourced threshold.
6. **The omitted factor is named on the surface.** Provider risk level is stated as
   not held, in one line. "The evidence gap named" is part of the capability as the
   research defines it — omitting it silently fails the card.
7. **Not scoring-inert (MV-105's lesson).** A test proves each composed input
   actually moves the output. A factor that renders but drives nothing is a trust
   defect, and this repo has shipped one before.
8. **Authorized like every other case route.** The read resolves through
   `checkCasePermission` with an explicit verb. Per the spec's open decision 3 this
   slice is **staff-only**: an integration test proves a linked student and a
   foreign-org member are both refused, in RLS *and* in TypeScript — the two-layer
   rule from `lib/cases/README.md`.

## Test plan

- **Unit** — the read-model composition: each input moves the output (criterion 7);
  the numeric value never escapes (criterion 4); a provenance-less factor renders no
  sourced claim (criterion 5).
- **Component** — the surface renders band + factors + the named gap, in both
  themes, sentence case, no imagery.
- **Integration** — `checkCasePermission` denial for a linked student and for a
  foreign-org member, at both layers. A denial-only assertion passes against a
  *missing* policy, so **mutation-test it**: widen the policy, confirm red, restore,
  confirm byte-identical (`MISTAKES.md`, and the RLS memory notes).

## Resume notes

- Spec: `docs/superpowers/specs/2026-08-29-judgement-layer.md`.
- Research: `docs/research/2026-08-11-program-data-wedge.md` §6 (ranking) and §7
  (go-to-market and the positioning line).
- **Do not** build catalogue breadth or shortlisting into this slice — the research
  marks both as already served by incumbents, and CLAUDE.md forbids leading with
  them.
- Three founder decisions are open in the spec. This card assumes **band + factors**
  and **staff-only**; both are reversible in one component, and either can be
  revisited without re-carving.
