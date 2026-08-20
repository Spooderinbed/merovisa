# MV-185 — Document collaboration schema: versions and reviews (Stage 4 slice 2)

**Priority:** P1 · **Owner:** agent · **Created:** 2026-08-20

## Why

MV-182 shipped the chase list: a counsellor can ask a case for a document and watch it go
outstanding → resolved. Nothing can yet **arrive** against a request, and nothing can be
**reviewed**. MV-183's lodgement panel is honest about that in copy — "Read from document
requests only. Nothing here has been checked or approved" — and it stays capped at that
sentence until this model exists. This is the slice that lets the panel eventually claim more.

**Spec:** `docs/superpowers/specs/2026-08-20-case-document-collaboration.md` §2, §3, §5.
**Plan:** `docs/superpowers/plans/2026-08-19-consultancy-workspace-ui-build.md` §3, PR 5B —
which required a written spec pass before carving. That pass is done, and it **split 5B into
this card and MV-190** (Storage + routes), and **superseded two of the plan's own premises**
(spec §1). Read spec §1 before trusting the plan's 5B paragraph.

## Scope

Two additive tables beside the vault, with RLS, column-scoped grants and their guards:

- `case_document_versions` — a file that arrived against a request. No unique on `request_id`:
  re-upload after a rejection is the entire point of the model.
- `case_document_reviews` — `accepted` / `rejected` on a version, with an optional note.

Both carry `case_id` **and** `organization_id`, copying MV-182's shape so the `%_case` census,
the `cases_write_surface_guard` idiom and the tenant-axis policies apply unchanged.

Request resolution is **derived, never a second source of truth**: a request is resolved when
its newest version has an `accepted` review. `case_document_requests.status` remains the column
MV-183's lodgement read already reads; the review verb writes it in the same statement that
inserts the review.

## The fence (what this slice deliberately does NOT touch)

- **Nothing in `documents` or `document_status`** — no column, no policy, no grant, no index.
  In particular `documents_case_kind_idx` is **NOT dropped**; spec §2 gives the three reasons,
  the sharpest being that removing the arbiter index breaks every `.upsert()` on `documents`
  at plan time. The plan's "replacing the one-per-kind model" is superseded.
- **No `storage.objects` policy, no bucket, no case-keyed object path, no signed download.**
  All of that is MV-190.
- **No routes and no UI.** MV-190 does the routes; MV-186 does the UI.
- **No `UPDATE (case_id)` and no `UPDATE (organization_id)` grant** on either table — either
  one re-points a live row into another case or another tenant. Assert both at apply time, the
  way MV-182 §5 does.
- **No upsert in any caller.** supabase-js compiles `.upsert()` to `INSERT … ON CONFLICT DO
  UPDATE` naming every payload column, so a column-scoped INSERT grant raises `42501` at plan
  time even on the insert branch (measured three times: MV-155, MV-168). Insert and update
  separately, as `lib/cases/document-requests-repo.ts` already does.
- No case-activity feed, no extraction on counsellor uploads, no notification.

## Acceptance criteria

1. Both tables exist with RLS enabled **and forced**, column-scoped grants, and FK cover.
2. Read rides the case axis (`private.actor_case_ids()`); write rides
   `private.can_staff_case()` — a linked student must not be able to review their own file.
3. The two forbidden grants are absent, asserted at apply time.
4. A request's `status` and "newest version has an accepted review" can never disagree.
5. An **unclaimed** case (`student_user_id is null`) supports the full request → version →
   review walk. Nothing here reads `student_user_id`; 5B does not depend on Stage 5.
6. The seven `%_case` exact-count census guards still pass untouched.
7. Migration is re-runnable in the MV-159 idiom (`create table if not exists`,
   `drop policy if exists` + `create policy`, idempotent grants).

## Test plan

- **RLS mutation tests, not denial-only probes.** A denial-only suite passes identically
  against a *missing* policy — read the failing test NAMES, not just the count.
- Policy→verb bindings asserted with `polcmd::text`.
- Unauthorized review / version-insert denial per plan §7.
- Request → version → review transitions, **including re-upload after rejection** (the case
  the missing `unique (request_id)` exists to allow).
- The status/derivation agreement test from criterion 4.
- The unclaimed-case walk from criterion 5.
- `*.itest.ts` files **skip silently** without `SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` /
  `SUPABASE_TEST_SERVICE_ROLE_KEY` — a green local run is not evidence the integration tests
  ran. Check the count.

## Data

New migration. Applied locally → rehearsed → **production as its own gated step**.

⚠️ **Master auto-deploys; migrations do NOT.** MV-182 was the third "merged but never applied"
gap in this project. After merge, apply via the Supabase MCP `execute_sql` (**not**
`apply_migration`, which stamps its own version and drifts the ledger) and hand-stamp
`supabase_migrations.schema_migrations` to match the repo filename. Then verify against the
prod ledger rather than assuming.

## Resume notes for a cold agent

- Read spec §1 first. The plan's 5B entry is stale in two places and will mislead you.
- `documents` / `document_status` carry `UNIQUE (case_id, kind)` — **not** `(owner, kind)`.
  The original `20260604060000_add_documents.sql` says `(owner, kind)`; Stage 2 changed it
  (`…20260802120000….sql:157`). Trust the Stage 2 file.
- MV-182's migration header is the house style for this table family — copy its structure,
  its assertions and its fence, not just its columns.
- Sequenced **before MV-190**, which is before MV-186 despite the number (spec §5).

## Evidence — built 2026-08-21, branch `mv-185-collaboration-schema`

### What shipped

| File | What |
|---|---|
| `supabase/migrations/20260821120000_stage4_case_document_collaboration.sql` | The two tables, RLS enabled + forced, four private helpers, three triggers, column-scoped grants, four policies, and eleven apply-time assertions in the MV-159 §13 / MV-182 §6 idiom. |
| `tests/integration/stage4-document-collaboration.itest.ts` | 38 tests. The RLS suite, every denial paired with its positive. |
| `tests/cases/document-collaboration-fence.test.ts` | 3 tests in the **default** lane (no database): the vault-index fence, the "this migration alters nothing in `documents`" fence, and the no-upsert fence. |
| `supabase/rehearsal/MV-185-mutation.sql` | The 13-mutant harness. Listed in `supabase/rehearsal/README.md`. |
| `lib/supabase/types.ts` | The two generated table types. |
| `tests/integration/case-backfill.itest.ts` | One line: the "nothing else carries a `case_id`" census gains the two new names, deliberately, as its own comment requires. |

No repository module, no route, no UI, no Storage — a `lib/` module with no caller is speculative
code and the verbs it would expose are MV-190's to shape.

### Gate

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm test` — **376 files, 3601 tests, all pass** (exit 0).
- `npm run test:integration` — **900 tests pass**, 15 of 16 files green. The one failure is
  `stage2-data-equivalence.itest.ts`, which fails to **parse** (`SyntaxError`) on its
  `scripts/stage2/capture-read-path-snapshot.mjs` shebang import — pre-existing, unrelated to
  schema, and untouched by this branch. `case-backfill.itest.ts` is green after the census line.
- Migration applied to the local stack and **re-applied**: idempotent, all eleven assertions pass.

### How the two headline criteria were proven

**Criterion 4 — status and derivation cannot disagree.** `private.document_request_derived_status`
returns `'resolved'` / `'outstanding'` / **NULL**, and the NULL is load-bearing: a request with no
versions is one the derivation does not speak for, which is what keeps MV-182's manual resolve
alive for a document received by hand. Two AFTER INSERT triggers write the derived value in the
same statement that inserts the version or review; a BEFORE UPDATE trigger on
`case_document_requests` **refuses** (23514) a hand-written status that contradicts the derivation
once versions exist. Pinned by four tests, including one that recomputes the derivation **in
TypeScript** from raw rows over every request the file touched — a derivation checked against its
own SQL would be a tautology.

**Criterion 5 — no dependency on Stage 5.** The unclaimed-case walk asserts
`student_user_id is null` first, then does request → version → review as the assigned counsellor
and checks the request resolved. Nothing in the migration reads `cases.student_user_id`.

### Mutation evidence — 13 mutants, each killing its named test

Run: apply mutant → `npx vitest run --config vitest.integration.config.ts
tests/integration/stage4-document-collaboration.itest.ts` → restore by re-running the migration.

| Mutant | Tests red | The named test |
|---|---|---|
| `versions_select` | 7 | "the ASSIGNED counsellor sees their case's versions and reviews" |
| `reviews_select` | 7 | "the LINKED STUDENT may read the versions … AND the reviews of them" |
| `versions_staff` | 1 | "the LINKED STUDENT may NOT upload a counsellor-side version on their own case" |
| `versions_org` | 1 | "a FORGED organization_id is refused even for an actor who may staff the case" |
| `versions_parent` | 1 | "may NOT hang a version off ANOTHER case's request" |
| `versions_pointer` | 1 | "may name THIS case's vault row, and may NOT name another case's" |
| `versions_prov` | 1 | "a FORGED uploaded_by is refused — one counsellor cannot file for another" |
| `reviews_staff` | 1 | "THE LINKED STUDENT MAY NOT REVIEW THEIR OWN FILE" |
| `reviews_org` | 1 | "a FORGED organization_id on a review is refused even for staff" |
| `reviews_parent` | 1 | "may NOT judge ANOTHER case's version" |
| `reviews_prov` | 1 | "a FORGED reviewed_by is refused — one counsellor cannot judge in another's name" |
| `sync` | 5 | "accepting the newest version resolves the request, and the MV-182 trigger dates it" |
| `guard` | 3 | "REFUSES a hand-written status that contradicts the newest version" |

Two findings the run itself produced, both worth carrying forward:

1. **A crashed vitest worker reports as CLEAN.** `reviews_prov`'s first run showed zero failures —
   and the log showed `Tests (38)`, `Duration 338ms`, `Worker exited unexpectedly`: **no test
   ran at all.** Re-run on its own, it killed exactly its named test. A mutant that kills nothing
   is a finding, never a pass; read the count before believing it. (Same family as the
   `rls-negative-probes-are-inert` lesson, one level up.)
2. **Two tests were bundling three assertions each**, so three different mutants named the same
   test. Both were split, and the second run gives each mutant a distinct name — which is what
   "read the failing test NAMES" actually requires.

The three default-lane fence guards were each verified red by **planting the violation**: a
`drop index … documents_case_kind_idx` + `alter table public.documents add column` appended to the
migration (guards 1 and 2 went red), and a `lib/cases/mv185-plant.ts` calling
`.from("case_document_versions").upsert(…)` (guard 3 went red). All three plants removed; the
suite re-verified green and the local `documents` index re-confirmed present.

### The census, the fence, and what did NOT change

- `%_case` census still reads **27 policies on 9 tables** — asserted at apply time *and* in the
  itest. The four new policies are `_select_actor` / `_insert_staff`, deliberately.
- `documents_case_kind_idx` still exists, still UNIQUE, still FULL — asserted at apply time, in
  the itest, and by a source scan over every migration in the default lane.
- `documents` and `document_status` gained no column, policy, grant or index. The only reference
  is the FK `case_document_versions.document_id -> documents(id) ON DELETE SET NULL`, which spec
  §3 specifies.
- MV-182's table gained exactly **one** trigger (`case_document_requests_status_guard`) and no
  grant or policy change.

### One decision the spec left open, taken here

Spec §3 says a request is resolved when its newest version "has an accepted review". This file
admits **several reviews per version** (a reviewer who rejects in error must be able to say so
without waiting for a re-upload), so the derivation reads the **newest** review of the newest
version rather than `exists(… 'accepted')`. Where a version carries one review the two readings
are identical; where it carries several, only the newest is honest — accept-then-reject is a
rejection, and `exists` would call it resolved forever. Pinned by
"rejecting re-opens it, and a re-upload after a rejection re-opens it again".

### Not done here, on purpose

- **Production is not applied.** Master auto-deploys; migrations do not. After merge, apply via the
  Supabase MCP `execute_sql` (**never** `apply_migration`, which stamps its own version and drifts
  the ledger) and hand-stamp `supabase_migrations.schema_migrations` to `20260821120000`. Then
  verify against the prod ledger rather than assuming — MV-182 was the third "merged but never
  applied" gap in this project.
- Storage, signed downloads and the three named-case routes are MV-190; the UI is MV-186.
