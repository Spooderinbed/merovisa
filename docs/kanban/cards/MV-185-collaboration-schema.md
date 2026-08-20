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
