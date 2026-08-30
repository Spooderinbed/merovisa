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

## Criteria 2–3 — BUILT 2026-08-30

`lib/judgement/submittability.ts` (pure) + `readCaseSubmittability` in
`lib/cases/case-frame.ts` (I/O + staff gate). **34 new tests**, 23 model + 11 reader.
Gate: typecheck clean, lint clean, **405 files / 4286 tests**.

### The rollup is lifted, not reimplemented

`computeReadiness` supplies every number. The only change to `lib/checklist/readiness.ts`
is that its `completion` predicate is now **exported**, so the read can say *which* rows
produced the counts without deciding countability a second time. Two tests keep that
honest: the counts are asserted equal to `computeReadiness`'s for the same inputs, and
`rows.length === total` per stage. The measurement's caller-list assertion is **inverted,
not deleted** — it now pins the list at exactly two names and says why a third would be a
second answer.

### Which program the read is stated for — the question the card did not anticipate

`generateChecklist` needs a program (a bachelors case needs +2 and SLC/SEE, a
postgraduate one transcripts) and **`cases` has no program column**. The only signal is
the shortlist, which carries `shortlisted | applied | withdrawn` and no ordering. So the
rule is authored, and it refuses rather than guesses:

1. Withdrawn entries are never candidates.
2. `applied` outranks `shortlisted` — an application is a commitment a save is not.
3. If every candidate produces the **same** required set, the choice cannot change the
   answer: the read is stated, and it **names** the lowest-id program it drew its rows and
   their provenance from, plus how many others it covers.
4. If the sets differ, the answer would depend on the guess: `programs-differ`.

### The ranking rule (criterion 3)

`BLOCKER_RANK_ORDER` — 18 keys, authored, **ranked by lead time**: what takes longest to
obtain blocks hardest, because "the single blocking item" answers *what should I chase
today* and that is never the quickest errand. Apply-stage rows always outrank lodge-stage
ones, since after-offer evidence cannot be obtained at all until an offer exists.

Two tests carry the weight. One is the discriminator: with the passport uploaded the
generator's next outstanding row is `national-id`, and the rule must say `english` — if
array order ever quietly became the rule, that test fails. The other is a **coverage
guard** across every level × funding source × field × test kind, so a future checklist row
cannot be required, countable and unranked, sorting silently to last.

### A real gap this exposed, NOT fixed here

**`fin-scholarship` never enters the denominator.** It is `required`, but it carries
`kind: null` and is not in `CHECKLIST_PLAN_LINKS`, so `completion` returns null and the
row is uncountable. For a `scholarship-dependent` case the **financial evidence is
therefore invisible to submittability** — the one requirement most likely to block such a
case cannot be named as its blocker. Fixing it means giving that row a completion signal
in `lib/checklist/generator.ts`, which changes the student's checklist too, so it is a
separate card rather than a quiet edit inside this one.

### Two divergences worth knowing

- **`readCaseSubmittability` takes the whole client**, not `CaseAuthorizationClient`. It
  calls five repositories that each take the full client; narrowing all five to buy a
  `Pick` here would touch five modules for nothing. The route hands it `gate.supabase`
  either way.
- **It does NOT require a linked student**, unlike `readCaseVisaRisk`. That read scores a
  student's profile; this one judges documents, which a consultancy-entered case has from
  the first upload. Abstaining would blank the answer for every case in a consultancy that
  has not started inviting students — which is all of them on day one.

### Criterion 6, restated with MV-198's correction

The read is **derived, not stored**: no table, no policy to widen, nothing to
mutation-test. Its six sources are already governed by RLS and already covered by
`tests/integration/tenant-isolation.itest.ts`. Staff-only is enforced at the read
(`null`, never a "withheld" panel), and a test proves the withholding is not vacuous.

## Criteria 4, 7–8 — BUILT 2026-08-30

`components/workspace/evidence-panel.tsx`, wired into `case-decision-strip.tsx` and the
case overview. **18 new panel tests.** Gate: typecheck clean, lint clean,
**406 files / 4304 tests**.

### The strip now holds three regions where spec §3 names two

MV-199's read *is* the spec's "submittability read" in substance — what the program and
DHA **require**, with a denominator. The panel already holding that filename reads
`case_document_requests` — what a counsellor thought to **ask for**, which has none — and
renders under the honest heading "Lodgement".

Both are true, and neither implies the other: a case can have every requested document in
hand and still be missing a requirement nobody thought to request. Collapsing them would
drop one of those facts, so they sit adjacent — visa read, then the requirement rollup,
then the chase list. The new file is `evidence-panel.tsx` (heading **"Evidence"**), a
deliberate divergence from spec §4's component inventory, because the name it lists is
occupied by a different answer.

### The percentage spec §3 banned — and the condition it was banned under

Spec §3: *"No completion percentage unless Stage 4 establishes a truthful denominator."*
Stage 4 never did, and `submittability-panel.tsx` still renders no total. **The checklist
always did**, and this panel renders it: `2 of 6 ready` per stage.

Still no percentage, no bar, no score — and the panel **names what the total is for**,
because a denominator is program-conditional. A fraction of a named set is a fact; a
percentage of it invites comparison between cases whose sets differ. The lodgement
panel's header comment claimed there was no "documents needed" *anywhere*; that was only
ever true of its own source and is now visibly untrue, so it is corrected in place — with
the rule it was justifying left standing, since a requirement nobody requested is still
not an outstanding request.

### The panel leads with no word at all, deliberately

Both neighbours open with one word in a tinted pill. This one cannot: **any single word
would be exactly the collapse criterion 7 forbids.** A case ready to apply is routinely
nowhere near ready to lodge, so the two stages get one line each and the panel has no
band. A test asserts the absence, so a future "tidy-up" that adds one has to argue with it.

The blocker carries its stage with it — "Blocking the application" vs "Blocking
lodgement" — because chase the IELTS scorecard and chase the CoE are different
instructions and the second is impossible before an offer exists.

Criterion 1's second gap assertion is **inverted, not deleted**: `components/workspace`
still may not compute a rollup (the panel takes a `SubmittabilityRead` and never touches
the checklist), and two positive assertions now pin that the panel and the wiring exist —
without them the absence would pass again the day the panel were deleted.

### NOT VERIFIED — the layout

No live browser pass. The pane cannot be displayed in a non-interactive session, and the
page is a server component behind consultancy auth. Every class used is one an adjacent
shipped panel already uses, and no new CSS was written.

**The one specific thing this leaves unconfirmed:** the strip is `lg:grid-cols-2` and now
has three children, so at `lg` the third panel wraps to a second row at half width. That
is deliberate (no grid change means no new layout risk) but it is unconfirmed by pixels,
and a three-across or a spanning row may read better. Worth one look before pilot.

## Acceptance criteria (firmed 2026-08-30)

1. ~~Measure first.~~ **Done — see above.**
2. ~~A **server-side, case-scoped** submittability read that lifts `computeReadiness`
   rather than reimplementing it, and reads the case's documents **and plan items**.
   Per-row explainability: a counsellor can see exactly which rows produced the answer.~~
   **Done.** The read carries every counted row; the *panel* will render the rollup and
   the blocker only (criterion 8), so the explainability is in the data and one link away.
3. ~~A **written, tested ranking rule** for the single blocking item — authored, not
   inherited from array order, and never an `info` row.~~ **Done —
   `BLOCKER_RANK_ORDER`.**
4. ~~Provenance rendered **where it exists and only there** — coverage is partial.~~
   **Done.** The blocking item cites its source when the requirement carries one, and
   makes no sourced claim when it does not.
5. ~~**Not scoring-inert**: each input moves the output, including the plan-linked
   rows.~~ **Done** — proved in the model and again through the I/O path.
6. Authorized like MV-198's read. **Note the same correction:** this read is derived,
   not stored, so criterion 6's "denials mutation-tested at both layers" applies to
   its *sources* (`documents`, `plan_items`), which RLS already governs — there is no
   new policy to widen. Staff-only is enforced at the read.
7. ~~**Apply-stage and lodge-stage are stated separately.** The panel may not collapse
   them into one word.~~ **Done** — and the panel therefore leads with no word at all.
8. ~~Do not restate the checklist. The differentiated output is the rollup and the
   single blocker.~~ **Done** — the counted rows travel in the read and are not rendered.

**All eight are met.** Ready for review; the one unverified thing is the strip's layout
at `lg`, named above.
