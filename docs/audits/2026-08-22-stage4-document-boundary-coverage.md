# Stage 4 exit gate — document boundary coverage inventory

**Card:** MV-191 · **Date:** 2026-08-22 · **Status:** the inventory that precedes the gate's new tests.

## The gate, verbatim

From `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`, Stage 4:

> an unauthorized actor cannot upload, view, download, review, or enumerate a document, and the authorized
> request-to-approval flow works.

Five negative verbs, one positive walk. This document maps each to the assertion that covers it — **by file and test
name** — or records it as not covered. Nothing below claims coverage without naming the test.

## Method, and why it is not a reading of test titles

Every "covered" row was checked against the assertion body, not its title. Three classes of claim were checked
mechanically across the whole tree rather than by eye, because their absence is the kind that hides:

| Probe | Command | Result |
|---|---|---|
| Storage listing anywhere in integration tests | `grep -rn "\.list(" tests/integration/` | **0 hits** |
| Row-count / head reads in integration tests | `grep -rn "count: *'exact'\|head: *true" tests/integration/` | **1 hit**, in `student-data-rls.itest.ts:2110` — none on any Stage 4 table |
| The three collaboration list functions against a real database | `grep -rn "listCaseDocument" tests/` | **mocked only** — `tests/app/case-documents-page.test.tsx`, `tests/cases/document-collaboration-repo.test.ts` |

## The layer each verb actually lives in

The gate is a claim about a boundary, and the boundary is enforced in two places that fail independently:

- **The database** — RLS policies and column grants on `case_document_requests` / `case_document_versions` /
  `case_document_reviews` / `documents`, plus the deliberate *absence* of a `storage.objects` policy for the `case/`
  prefix (MV-190 D4).
- **TypeScript** — `checkCasePermission` at the top of each route, and `mintCaseScopedDownloadUrl`, which authorizes
  inside the mint.

A mocked route test proves the route refuses. It does not prove the database would have refused had the route not.
Only one of those survives a refactor, so rows below record which layer the evidence is in.

---

## Verb 1 — upload

Creating a `case_document_versions` row, and putting bytes under `case/<case_id>/<version_id>`.

| Actor | Covered by | Layer |
|---|---|---|
| Unassigned counsellor, same org | `stage4-document-collaboration.itest.ts` › "an UNASSIGNED counsellor in the same organization may NOT" | DB |
| Linked student | same file › "the LINKED STUDENT may NOT upload a counsellor-side version on their own case" | DB |
| Organization B | same file › "organization B may NOT — the tenant boundary on write" | DB |
| Forged `organization_id` | same file › "a FORGED organization_id is refused even for an actor who may staff the case" | DB |
| Forged `uploaded_by` | same file › "a FORGED uploaded_by is refused — one counsellor cannot file for another" | DB |
| Cross-case request | same file › "may NOT hang a version off ANOTHER case's request" | DB |
| **Anonymous** | **NOT COVERED** — `fixture.anon` is probed for `select` only, never for `insert` | — |

**Gap 1.** Anonymous upload. The existing anon probe (line 491) reads; it never writes.

## Verb 2 — view

Reading version and review rows for a case.

| Actor | Covered by | Layer |
|---|---|---|
| Unassigned counsellor, same org | `stage4-document-collaboration.itest.ts` › "an UNASSIGNED counsellor in the same organization sees nothing" | DB |
| Organization B | same file › "organization B sees nothing — the tenant boundary" | DB |
| Anonymous | same file › "an anonymous client sees nothing" | DB |
| Assigned counsellor (positive) | same file › "the ASSIGNED counsellor sees their case's versions and reviews" | DB |
| Org admin (positive) | same file › "the org ADMIN sees them too — whole-organization scope" | DB |
| Linked student (positive) | same file › "the LINKED STUDENT may read the versions on their case AND the reviews of them" | DB |

Each denial is paired with a service-role existence proof (`proveExists`), so "sees nothing" cannot pass against a
fixture that never seeded. **Covered.** The same matrix exists for requests in `stage4-document-requests.itest.ts`.

## Verb 3 — download

Getting the bytes.

| Path | Covered by | Layer |
|---|---|---|
| Direct Storage read, staff of that case | `stage4-case-storage.itest.ts` › "REFUSES a direct download of a case/ object to the counsellor who may staff that case" | Storage |
| Direct Storage read, outsider | same file › "REFUSES a direct download of a case/ object to an outsider as well" | Storage |
| Direct Storage read, anonymous | same file › "REFUSES a case/ object to the anonymous client" | Storage |
| Control — same actor CAN read their own uid-keyed object | same file › "CONTROL — the same actor, same client, same run CAN download their own uid-keyed object" | Storage |
| Bytes really exist behind the path | same file › "really has the bytes behind it — the service role reads the object" | Storage |
| **`mintCaseScopedDownloadUrl` refusing an unauthorized actor** | **NOT COVERED against a real database** — only `tests/documents/signed-download.test.ts` and `tests/api/*`, all mocked | — |

**Gap 2.** The one sanctioned way in is the mint, and its denial has never been exercised against real Postgres.
The Storage half is well covered; the authorization half in front of it is mock-only.

## Verb 4 — review

Creating a `case_document_reviews` row.

| Actor | Covered by | Layer |
|---|---|---|
| Linked student | `stage4-document-collaboration.itest.ts` › "THE LINKED STUDENT MAY NOT REVIEW THEIR OWN FILE" | DB |
| Unassigned counsellor + org B | same file › "an UNASSIGNED counsellor and organization B may NOT" | DB |
| Cross-case version | same file › "may NOT judge ANOTHER case's version" | DB |
| Forged `reviewed_by` | same file › "a FORGED reviewed_by is refused — one counsellor cannot judge in another's name" | DB |
| Forged `organization_id` | same file › "a FORGED organization_id on a review is refused even for staff" | DB |
| **Anonymous** | **NOT COVERED** — same shape as Gap 1 | — |

**Gap 3.** Anonymous review.

## Verb 5 — enumerate

Discovering that a document *exists*, without necessarily reading it. This is the verb the card predicted would be
missing, and the prediction was correct in all four of its sub-modes.

| Sub-mode | Covered by | Layer |
|---|---|---|
| The three collaboration list reads (`listCaseDocumentRequests` / `listCaseDocumentVersions` / `listCaseDocumentReviews`) | **NOT COVERED** against a real database — mocked in `tests/cases/document-collaboration-repo.test.ts` and `tests/app/case-documents-page.test.tsx` | — |
| A direct row **count** on each collaboration table | **NOT COVERED** — the only `count: "exact"` in the whole integration tree is on a student-data table | — |
| A Storage **listing** of the `case/` prefix | **NOT COVERED** — `.list(` appears nowhere in `tests/integration/` | — |
| **Existence leaked through the status code** (403 vs 404) | **NOT COVERED** — `tests/api/case-denial.test.ts` asserts the denial status and zero queries, but never that a *reachable* and an *unreachable* document are indistinguishable | — |

**Gap 4, and it is the substantive one.** Enumerate is uncovered end to end. Note the shape of the risk: the list
functions do not authorize at all — they filter by `case_id` and delegate to RLS — so an unauthorized actor receives
`{ ok: true, data: [] }`. That is a *correct* refusal and an *empty table* rendered identically, which is precisely
why the assertion needs a service-role existence proof beside it or it proves nothing.

## The positive walk

| Step | Covered by |
|---|---|
| request → upload → reject → re-upload → accept, with the trigger agreeing at each step | `stage4-collaboration-walk.itest.ts` › "walks request -> upload -> reject -> re-upload -> accept, agreeing with the trigger at every step" |
| Newest review wins, not any accepted one | same file › "agrees on accept-then-reject: the NEWEST review is the judgement, not any accepted one" |
| Microsecond-tied versions, id tiebreak | same file › "agrees when two versions share a timestamp TO THE MICROSECOND — the id tiebreak, for real" |
| Reviewing the older of two tied versions | same file › "agrees that reviewing the OLDER of two tied versions leaves the request outstanding" |
| Hand-resolved request never reads as accepted | same file › "agrees on a request resolved BY HAND, and never calls it accepted" |
| The guard refuses a hand-written status | same file › "confirms the guard REFUSES a hand-written status once a version exists" |

**Confirmed, not rebuilt.** Re-run at the head of this slice: 6 passed / 6. The walk covers the request-to-approval
flow the gate names, including the rejection branch, and skips no step of it.

---

## A deferral that was silently discharged

`tenant-isolation.itest.ts` carries a `DEFERRED_BY_DESIGN` list, pinned by a self-check at
`expect(DEFERRED_BY_DESIGN.length).toBe(7)`. Its first entry reads:

> "storage: guessed-path download denial → Stage 4"

MV-190 discharged that in `stage4-case-storage.itest.ts` — three named refusals plus a control — but the deferral was
never struck, so the Stage 1 gate still advertises as outstanding a property that has been covered since 2026-08-20.
This slice strikes it and points at the tests that discharge it. That is bookkeeping rather than a hole, but a
deferral list nobody prunes stops being evidence of anything.

## What the mutation run changed about this inventory

Two rows above were written from reading the code and were corrected by measurement. Both are
recorded because the corrected version is the useful one.

**The download verb is defended in two independent layers, and neither is load-bearing alone.**
The mint's denial survives a widened `cases_select_accessor` on its own, and survives a widened
`deriveCaseGrants` on its own; it dies only to both together. `getCaseContext` reads `cases`
through the *actor's* RLS client, so an invisible row denies before TypeScript is consulted — and
if the row is made visible, TypeScript still refuses an unassigned counsellor. A future author who
removes either layer will see a fully green exit gate and reasonably conclude it was redundant. It
is not.

**A case has exactly one assigned counsellor, by schema.** `case_assignments_primary_idx` is
unique on `(case_id)` where `assignment_role = 'primary_counsellor'`, and the CHECK constraint
admits no other role. "Widen the assignment" is therefore unreachable by inserting a row — the
mutant that tried it was silently swallowed by `on conflict do nothing` and survived at 50/50.

## Verdict

| Verb | Verdict |
|---|---|
| upload | Covered, except **anonymous** |
| view | **Covered** |
| download | Storage half covered; **the mint's denial is mock-only** |
| review | Covered, except **anonymous** |
| enumerate | **Not covered at all** — all four sub-modes |
| the positive walk | **Covered** — confirmed by re-run, not rebuilt |

Four gaps. They are closed in `tests/integration/stage4-exit-gate.itest.ts`, and every new assertion there is
mutation-tested — the mutant and the test it killed are recorded on the card dossier.
