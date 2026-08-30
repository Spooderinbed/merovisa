# MV-200 — Judgement slice 3: the caseload roll-up

The third and last slice of the judgement layer. Spec:
`docs/superpowers/specs/2026-08-29-judgement-layer.md`.

The org students list
(`app/(app)/workspace/[organizationId]/students/page.tsx`) gains the two reads MV-198
and MV-199 already compute, as sortable, filterable columns: *who is closest to
submittable*, *who carries the most refusal risk*.

## Deliberately last, and deliberately small

Capability **#3** in `docs/research/2026-08-11-program-data-wedge.md` §6, and the
research is blunt about its status:

> **PLAUSIBLE-BUT-UNEVIDENCED.** Nobody I found asks for it. **[I]** but it is close
> to free once #1 and #2 exist and the case model is in place.

So it earns **no design investment beyond sorting numbers already computed**. If
this slice starts growing filters, saved views, or a dashboard, it has escaped its
evidence. Cross-caseload dashboards are commodity-CRM surface, and CLAUDE.md
forbids building commodity parity ahead of the wedge — this card is allowed only
because it is nearly free, not because it is wanted.

**Blocked on MV-198 and MV-199.** There is nothing to roll up until both reads
exist. Do not start it early by computing a second, parallel version of either read
— that is how two answers to the same question end up on two screens.

## Watch the cost

The students list renders every case in the org. Two per-case judgement reads
computed per row is a fan-out, and the pilot's first real caseload is the moment it
shows. Decide deliberately whether the reads are computed on read, cached, or
persisted alongside the assessment — and write the decision down. A correct answer
that takes eight seconds to list forty students fails the card.

## Criterion 1 — MEASURED 2026-08-30

`tests/judgement/caseload-rollup-measurement.test.ts`, **11/11**. The card's cost
warning is not hypothetical, and the measurement puts numbers on it.

### The cost, counted rather than estimated

Query counts taken by running the real readers against a recording fake:

| Read | Round trips per case | Tables |
|---|---|---|
| `readCaseVisaRisk` | **1** | `profiles` |
| `readCaseSubmittability` | **6** | `user_program_state`, `programs`, `profiles`, `documents`, `document_status`, `plan_items` |

And **six is a floor, not a constant**: `getProgram` is called once per candidate
program, so a case with three shortlisted programs costs eight. The per-row cost is set
by the consultancy's data, not by the code.

`LIST_ROW_CAP` is **500**. So the obvious implementation — call the two per-case readers
once per row — is **up to 3,500 sequential round trips for one page render**. The card
says "a correct answer that takes eight seconds to list forty students fails the card";
that is that failure, quantified before it was written.

**The batched alternative is bounded by tables, not by rows.** Five of the six sources
are keyed by `case_id`, so one `.in()` per chunk answers for a whole page; `programs` is
a catalogue keyed by program id and is read once for the page. At the queue's existing
`QUEUE_BATCH_SIZE` of 40 that is **66 round trips for the same 500 cases**.

### The cost decision (criterion 4): compute on read, batched

Not cached, not persisted. Three reasons, in order of weight:

1. **66 round trips is the shape already shipped.** `listCaseQueue` already spends one
   membership read plus chunked assignment, plan and document-request reads. Batching
   adds a fourth enrichment of the same kind rather than a new architecture.
2. **A persisted band would need a freshness contract, and the wedge is provenance.**
   The research's sharpest contrast is that a competitor appears to *generate*
   eligibility judgements — unsourced, undated, unauditable. A stored band with no
   `lastVerified` is that same claim; answering it properly means a staleness model this
   card is explicitly too small to earn.
3. **Caching cannot be correct before the pilot.** There is no measured invalidation
   surface yet — every upload, plan tick and profile edit moves both reads.

Revisit if a real caseload shows the batched read is slow; the numbers above are the
baseline to compare against.

### Three findings that constrain the build

1. **The queue's plan read cannot be reused.** `listCaseQueue` fetches `plan_items`
   filtered `status = 'todo'`, because all it wants is the next action.
   `planStatesForChecklist` needs the **opposite end**: a checklist row completes when
   its linked plan item is `done`, and a `todo`-filtered read contains no `done` row by
   construction. Reusing `planByCase` would report **every plan-linked requirement as
   outstanding on every case** — a wrong denominator on every row, with no error and
   nothing on screen to suggest it. Measured and pinned.
2. **The column was already reserved, and its rule already written.**
   `case-queue-table.tsx` holds the slot open exactly as `case-decision-strip.tsx` held
   MV-198's panel slot: *"The visa read's column stays omitted entirely until its stage
   ships — forty rows of 'Coming soon' is worse than no column."* So how to render a read
   that cannot be stated is already decided: **omit, never placeholder.**
3. **The row-ceiling risk cannot be inherited.**
   `listOutstandingDocumentRequestsByCase` filters at the database (`status =
   'outstanding'`) precisely so PostgREST's `max_rows` bounds open work rather than a
   consultancy's whole history. Submittability's inputs have **no such natural filter** —
   every document, status row and plan item on a case is load-bearing — so each batched
   read needs its own ceiling check.

### The precedent for criterion 3

`deriveQueueLodgement` is deliberately **not** `deriveLodgement`: the batched input is
thinner, so it reports the weaker `none-outstanding` rather than claiming `clear`. So
"no parallel re-derivation" has to mean **the judgement is the same function**; where
batched inputs are genuinely thinner, a queue-side derive that says *less* is the honest
answer, not a bug.

## Criteria 2–5, 7–8 — BUILT 2026-08-30

`lib/cases/caseload-judgement-repo.ts` (batched), wired through `listCaseQueue` into two
new queue columns. **23 new tests** (13 repo + 10 columns). Gate: typecheck clean, lint
clean, **409 files / 4338 tests**.

### The cost decision, realised

`listCaseJudgementsByCase` answers for a whole page in queries bounded by tables: five
chunked `.in("case_id", …)` reads plus one catalogue read. Measured on a three-case
fixture: **6 queries, not 21.** Chunk sizes are split — 40 for the one-row-per-case reads
(`profiles`, `user_program_state`), 10 for the unbounded ones (`documents`,
`document_status`, `plan_items`) — and every read trips into `lookup-failed` at
`JUDGEMENT_ROW_CEILING` rather than trusting a possibly-truncated answer, because none of
them has a database-side filter to bound it.

### One judgement, two callers (criterion 3)

The visa read's emptiness rule used to live inside `readCaseVisaRisk`. It is now
`visaRiskFromSections` in `lib/judgement/visa-risk.ts`, so the per-case reader and the
batched one reach the same answer through the same function; `deriveSubmittability` and
`preferredShortlistTier` were already pure and are called unchanged. **A test asserts the
batched answers equal the per-case readers' answers row for row** — that is criterion 3
proved rather than asserted.

### Why the queue now issues TWO plan reads

The judgement read carries **no status filter**, because a checklist requirement completes
when its linked plan item is `done` and the queue's own read is `status = 'todo'`. Reading
every status once and filtering in memory would save a round trip and **couple two
deliberately different failure semantics**: a failed plan read fails the *whole* queue
(it decides attention tiers, and a queue rendered without it is silently misordered),
while a failed judgement read marks only its own two columns. Merging would promote a
judgement outage into a blank queue — resilience traded for a round trip.

This **narrowed an existing test**: `queue-repo.test.ts` used to assert "done and
dismissed rows never leave the database", which is no longer true of the queue as a whole.
It now defends the still-true, narrower property — the read that feeds the *next action*
asks for open items only — with the reasoning recorded in the test.

### The columns

`Visa read` and `Evidence`, beside `Lodgement`. The table had **reserved this slot** with
a rule — *"forty rows of 'Coming soon' is worse than no column"* — and that rule now
governs how an unstateable read renders: a plain sentence, never a placeholder band. Only
`reach` is tinted, which is the sibling Lodgement cell's restraint and holds for its
reason: forty coloured rows is a decorated table, not a scannable one.

The Evidence cell reads `2 of 6 to apply`. **"to apply" is load-bearing** — MV-199's
criterion 7 forbids collapsing the apply and lodge stages, and a bare "2 of 6" under a
column called Evidence reads as a statement about the whole case. The lodge count is
deliberately absent: two fractions in one dense cell is a dashboard, and the panel states
both.

### Criterion 5, narrowed deliberately

Both sorts exist and are validated (`QUEUE_SORTS`, `QUEUE_SORT_LABELS`), and the parse
guard is now derived from that list rather than a hand-written union a new sort could
silently fail to join. **No sort control was added** — and none exists today: all three
pre-existing sorts (`attention`, `name`, `updated`) are URL-only. Building the product's
first sort control is design investment the card explicitly refuses; the two new sorts are
exactly as reachable as the three already shipped. **No new filter facets** either, for
criterion 8's reason.

### NOT VERIFIED — the layout

No live browser pass; the pane cannot be displayed in a non-interactive session. Every
class used is one the sibling cell already uses and no new CSS was written. **The specific
thing left open:** the queue table went from five columns to seven (six for a counsellor).
It scrolls inside `overflow-x-auto` and flattens below `md`, so nothing should break — but
column crowding at `md`–`lg` is unconfirmed by pixels and is the first thing to look at.

## Acceptance criteria (firmed 2026-08-30)

1. ~~Measure first.~~ **Done — see above.**
2. A **batched** caseload read that computes both judgements per row by calling the same
   pure derives the case surfaces call (`deriveVisaRisk`, `deriveSubmittability`) — never
   the per-case readers in a loop, and never a second derivation of either.
3. Every batched source carries a **row-ceiling check that fails its own column** rather
   than truncating silently, and the plan read must include non-`todo` rows.
4. Both columns render banded, sentence case, imageless. A read that cannot be stated is
   **omitted, never "Coming soon"** — the table's own rule.
5. Sort and filter by each read, in memory over the one queue data set (the page's
   existing pattern), so the rows the page renders and the counts the Day view shows come
   from one set.
6. The cost decision recorded with the numbers that justified it. **Done above** —
   restated here because the card asked for it as a criterion.
7. Tenant isolation: every batched read is `.in("case_id", …)` over ids `listOrgCases`
   already scoped, on the authenticated client. **Note the correction MV-198 and MV-199
   both made:** these reads are derived, not stored, so there is no new policy to
   mutation-test — the boundary is `listOrgCases` plus RLS on each source table, already
   covered by `tests/integration/tenant-isolation.itest.ts`.
8. **Scope discipline.** No filters beyond sorting what is computed, no saved views, no
   dashboard. The research rates this capability plausible-but-unevidenced; it is allowed
   only because it is nearly free.
