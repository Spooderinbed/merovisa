# MV-183 — the case lodgement read (UI lane, PR 5A)

**Spec:** `docs/superpowers/specs/2026-08-17-consultancy-workspace-ui.md` — §2 "Current and
future columns", §3 "Decision strip → Submittability read", §4 component inventory
(`submittability-panel.tsx`), §5 "Error" and "Empty", §7 PR 5.
**Depends on:** MV-182 (Stage 4 slice 1 — `case_document_requests`), merged as #148.
**Branch:** `mv-183-lodgement-read`.

The first surface in the product that answers the question the consultancy version is sold
on: **which case is blocked, and what single item is blocking it.**

---

## The copy, and why it is this copy

The whole slice turns on one boundary. **Zero outstanding requests means nothing the
consultancy has ASKED FOR is outstanding. It does not mean the case is submittable.** No
document has been verified by anyone — Stage 4 slice 1 shipped a chase list, not a review
model, and `case_document_requests.status` admits only `outstanding` and `resolved`. And
nothing in the schema knows which documents this case actually needs, so there is no
denominator at all.

So the reassuring word is a statement about the REQUESTS, never about the CASE:

| State | Word | Colour | Panel sentence |
|---|---|---|---|
| ≥1 outstanding | **Blocked** | Reach | "Waiting on {item}, due {date}." + "{n} other requests are also outstanding." when n > 0 |
| ≥1 request, all resolved | **Nothing outstanding** | Strong | "Every document this case has been asked for has arrived." |
| no request ever made | **Nothing requested yet** | Possible | "No documents have been requested on this case yet." |
| queue: 0 outstanding, history unknown | **Nothing outstanding** | neutral | "No document request on this case is outstanding." |
| read failed | *(no word, no band)* | none | "We couldn't check this case's document requests." + "This is not a statement about this case — please try again in a moment." |

Rendered under every settled state, never only the reassuring one:

> Read from document requests only. Nothing here has been checked or approved, and the list
> is only as complete as the requests on it.

**Rejected: "Ready to lodge."** Spec §3 offers it as an example word, but it is a claim about
the case and the data only supports a claim about the requests. This repo has reworked two
surfaces that made the larger claim on the smaller evidence — MV-143's abstain gate and
MV-144's "accuracy" meter — and the second one shipped to real users before it was caught.

**No percentage, no count-of-total, no progress bar** (spec §3, explicitly conditional on a
truthful denominator that Stage 4 has not established). The one number in the panel is how
many OTHER requests are outstanding: a count over a fully-known set that names no total. It
is there because a single named item, alone, reads as the whole of the work.

**Colour is never the only carrier.** Every state that has a colour has a word beside it, and
the outage has neither — an outage wearing a state's colour is a state.

---

## Why the queue and the panel have different vocabularies

`deriveLodgement` (panel) reads the case's WHOLE request list, so it can tell `clear` from
`nothing-requested`. `deriveQueueLodgement` (queue) reads OUTSTANDING rows only and reports
the weaker `none-outstanding`, which is true in both cases.

The queue's read is outstanding-only on purpose: resolved requests are never deleted (MV-182's
migration is explicit that a request that was asked for is a permanent fact), so they
accumulate on a case forever. A forty-case batch fetching every status would grow with a
consultancy's history rather than its open work and could cross PostgREST's `max_rows`
silently — dropping outstanding rows from the cases at the tail of the chunk, which would
print "Nothing outstanding" on cases that are blocked. That is the single most expensive wrong
sentence this slice can produce.

The queue's non-blocked state is therefore **neutral, not Strong**: it has not earned green,
because it does not know the difference green would claim.

---

## What shipped

| File | Change |
|---|---|
| `lib/cases/lodgement.ts` | NEW. Pure derivation: `selectLodgementBlocker`, `deriveLodgement`, `deriveQueueLodgement`, `LODGEMENT_WORD`. No I/O, not `server-only` (same rule as `queue.ts`). |
| `lib/cases/document-requests-repo.ts` | `listOutstandingDocumentRequestsByCase` — the batched queue read, chunked at `REQUEST_BATCH_SIZE = 40`, filtered on `status` at the database, row-ceiling guarded. Added HERE so the module stays the single access path to the table. |
| `lib/cases/case-frame.ts` | `readCaseLodgement` — reuses `listCaseDocumentRequests`, returns `unavailable` on a failed read. |
| `lib/cases/queue-repo.ts` | Fourth enrichment, display-only. |
| `lib/cases/queue.ts` | `QueueCase.lodgement` (required). |
| `components/workspace/submittability-panel.tsx` | NEW. Spec §3/§4. |
| `components/workspace/case-decision-strip.tsx` | Fulfils the contract it was holding open. Renders nothing when no read is supplied; renders the outage when a read FAILED. |
| `components/workspace/case-queue-table.tsx` / `case-queue-row.tsx` | The Lodgement column. |
| `app/(app)/workspace/[organizationId]/students/[caseId]/page.tsx` | Passes the read to the strip. |

`/students` (All cases) reads through `listCaseQueue` and renders `CaseQueueTable`, so it
gains the same column from the same data — no separate wiring.

### A failed lodgement read does NOT fail the queue

Spec §5 gives an enrichment failure two options: omit it with an outage note, or fail the
queue if it changes ordering. Assignments and plan items change ordering (attention tiers 1
and 6) so `queue-repo` fails the queue for those. **The lodgement read changes no ordering in
this slice**, so it marks its own column `Couldn't check` and leaves every other column
standing. A named test asserts the ordering-bearing rule is unchanged.

---

## Deliberately NOT in this slice

- **Attention tier 4** ("has a named blocking item") and **next-action step 6** ("a named
  judgement or document blocking item") stay unproduced. Wiring lodgement into the sort would
  make it ordering-bearing, which would flip the failure rule above and change MV-179's
  shipped ordering. Its slot in `attentionTier` is already reserved. A later slice.
- The **visa read** (PR 7). `case-decision-strip.tsx` still renders it silently absent.
- A completion denominator of any kind.

---

## Acceptance criteria

- [x] `submittability-panel.tsx` per §3/§4: label "Lodgement", word state, single blocking
      item, link to Documents, no completion percentage.
- [x] Mounted in `case-decision-strip.tsx`; strip renders nothing visible when no read is
      supplied; overview page untouched beyond passing the read.
- [x] Lodgement column in `case-queue-table.tsx` + `case-queue-row.tsx` (§2).
- [x] Batched queue read — one query per 40-case chunk.
- [x] Pure derivation module with its own tests.
- [x] Colour mapping per §3, always with the word.
- [x] Failed read presents as an outage and never as a good state (§5).
- [x] Counsellor scope inherited from the queue unchanged.
- [x] Design tokens only; no new tokens; sentence case; `VerdictPill`/`CaseStatusPill` not
      misused.
- [x] Reads stay server-only on the authenticated client; no new client boundary.

## Test plan — evidence

**Unit / component (`npm test`): 374 files, 3544 tests green.**

- `tests/cases/lodgement.test.ts` (19) — earliest `due_at` wins; NULL sorts last; `created_at`
  breaks ties; `id` is the final tie-break so row order never decides; resolved requests are
  never blockers; zero/one/many; `clear` vs `nothing-requested`; no word claims readiness.
- `tests/cases/outstanding-requests-batch.test.ts` (9) — grouped by case; resolved filtered at
  the database; **40 cases = 1 query**; chunking at 41; no ids = no query; error / throw /
  row-ceiling all report `lookup-failed`.
- `tests/cases/queue-lodgement.test.ts` (9) — per-row read; no cross-row leakage; batched;
  counsellor scope; a failed read marks every row `unavailable`, is never spent as
  `none-outstanding`, and leaves the queue standing; the ordering-bearing rule is unchanged.
- `tests/components/workspace/submittability-panel.test.tsx` (26) — label, words, colour
  mapping with the word present, no band on an outage, one item never a list, other-count,
  due date, **no percentage / denominator / progress element in any state**, outage copy,
  Documents link in every state, strip renders nothing when no read is supplied.
- `tests/components/workspace/case-queue-lodgement-column.test.tsx` (10) — header, word +
  single item, no list, outage never reads as "Nothing outstanding", no cross-row leakage,
  Reach only for blocked, no verdict colour otherwise, no completion claim.
- `tests/app/case-overview.test.tsx` — the panel occupies the first region; blocker naming;
  `clear` vs `nothing-requested`; a failed read is an outage and leaves the next action intact.

**Integration (`npm run test:integration`): 7 tests RAN against the local Docker stack** (not
skipped) — `tests/integration/stage4-lodgement-read.itest.ts`. Proves the batched
`.in(case_id, [...])` is RLS-scoped, which no fake can: an assigned counsellor gets their own
case's rows (the positive half, without which the denials would pass against a missing
policy); a foreign case id inside the SAME batch is narrowed away; an outsider's batch is
empty; an admin sees the org case; and the derivation picks the right blocker over real rows.

**Browser pass** — dev server on the local stack, seeded org with four cases: several
outstanding (mixed + NULL `due_at`), exactly one outstanding, all resolved, and never
requested. All four render the right word and sentence. Read failure simulated by
`revoke select on public.case_document_requests from authenticated` (restored after): the
panel showed the outage with no state word and the queue showed `Couldn't check` on all four
rows with **zero occurrences of "Nothing outstanding"**. Verified at 1280px and 375px.

> **Limitation, stated rather than papered over:** the Browser pane could not be displayed in
> this non-interactive session, so the tab stayed `visibilityState: "hidden"` and the renderer
> never composited — screenshots timed out and every `getBoundingClientRect()` returned 0.
> Pixel evidence was therefore NOT captured. What was captured instead: full server-rendered
> DOM for every state, resolved computed styles (`color: rgb(216,119,95)` = `--reach` in dark
> mode; `background-color: rgba(216,119,95,0.125)` = `reach-tint`), and the media-query-driven
> responsive rules at 375px (`thead` → `display:none`, row → `block`, lodgement cell → `block`
> on its own line, word `white-space: nowrap`, blocker title `text-overflow: ellipsis`, strip
> grid collapsing to one column). A human should still eyeball it before merge.

## Gate

`npm run typecheck` clean · `npm run lint` clean · `npm test` 3544/3544 green ·
`npm run test:integration` (this file) 7/7 ran and passed.
The known Windows flake `no-actor-equals-student > M4b` did not trip on the gate run.

## MERGE PRECONDITION — read before merging

MV-182's migration `supabase/migrations/20260818120000_stage4_case_document_requests.sql` is
applied to the LOCAL stack only and is **NOT yet in production**. This PR reads
`case_document_requests` from the **queue landing page**, which is every consultancy user's
first screen. Merging before that migration is applied would turn the lodgement column into
`Couldn't check` on every row for every organization. **Apply the migration to production
first.**

## Resume notes for a cold agent

- Derivation lives in `lib/cases/lodgement.ts` and is the ONLY place lodgement meaning is
  decided. Both surfaces read `LODGEMENT_WORD` so they cannot drift.
- `document-requests-repo.ts` is the single access path to `case_document_requests`. Do not
  open a second one; `queue-repo.ts` imports from it (the reverse would be circular, which is
  why `REQUEST_BATCH_SIZE` is restated rather than imported from `queue-repo`).
- `QueueCase.lodgement` is REQUIRED. Three test fixtures build `QueueCase` by hand
  (`tests/cases/queue.test.ts`, `tests/app/day-view-page.test.tsx` typed; `workspace-pages` and
  `case-pages` untyped literals) — the untyped ones will not fail typecheck if a future field
  is missed, only at render.
- Next slice on this surface: attention tier 4 + next-action step 6. Doing that makes the read
  ordering-bearing, so the failure rule must flip to failing the queue.
