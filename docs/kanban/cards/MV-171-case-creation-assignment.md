# MV-171 — Stage 3 slice 4: case creation and assignment

**Priority:** P1   **Owner:** agent
**Goal:** Make the workspace able to *start* a piece of work, not only find one. An owner or admin creates a case for a student who has no account, hands it to one primary counsellor, and moves it through the five operational statuses — every write through the authenticated client, with the database's own constraints as the arbiter.

**Authoritative spec:** `docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md` (§2.5, §3, §4 cells 8/9/10, §5, §6.1, §6.2, §6.3, §8.1, **F-1**). **Where this card disagrees with the spec, the spec wins. If the implementation contradicts the spec, amend the spec IN THIS PR** (spec §1 rule 2).

## Founder decision F-1 — TAKEN, 2026-08-10: reading (a), owner/admin only

F-1 asked whether an authorized **counsellor** may create and assign cases. The founder chose **reading (a)**: no — this is an owner/admin surface. "Counsellor" in the plan's exit-gate prose (line 646) was loose wording for *consultancy staff*; both enforcement layers already agreed with each other and the prose was the outlier.

What that decision costs this slice: **nothing to build.** Both layers are already the shape reading (a) wants.

| Verb | SQL, already correct | TypeScript, already correct |
|---|---|---|
| create | `cases_insert_admin` → `actor_admin_org_ids()` (`…20260730180000….sql:412-418`) | `CASE_PERMISSION_MATRIX.counsellor["case.create"] = "deny"` (`lib/cases/permissions.ts:170`) |
| assign | `case_assignments_insert_admin` → `can_manage_case` = `is_org_admin` (`:552-557`) | `…counsellor["case.assign"] = "deny"` (`:171`) |

`lib/cases/permissions.ts:168-169` already carries the intent — *"Stage 1 default: case creation is an owner/admin action. Widening this is a deliberate later decision, not a convenience."* That comment is now a **recorded decision**, not an open question, and this card says so in the Decision log.

**Widening to counsellors later is its own carded slice.** It would need a migration (both INSERT policies), a `CASE_PERMISSION_MATRIX` edit, and edits to the Stage 1 suites that pin all three — `tests/integration/case-rls.itest.ts:818` (counsellor case creation refused) and `:1013` (counsellor self-assignment refused), plus `tests/cases/permissions.test.ts`. None of that is in this slice.

## Context links

- Spec **§4 cell 8** (case creation) — `O`/`A` = create · `C+`/`C−`/`S` = **deny** · `I`/`N` = ∅.
- Spec **§4 cell 9** (case assignment) — same row shape.
- Spec **§4 cell 10** (`operational_status`) — `O`/`A`/**`C+`** = write · `C−` = deny · **`S` = deny**. Enforced by the `cases_write_surface_guard` TRIGGER, not by RLS.
- Spec **§2.5** — `case_assignments_primary_idx` is `UNIQUE (case_id) WHERE assignment_role = 'primary_counsellor'`, and `assignment_role` is check-constrained to that one literal. **Assignment is replacement of one slot, not a multi-counsellor model.**
- Spec **§6.1 / §6.2** — `assessments` INSERT is **refused permanently** for `authenticated`; the case-scoped scoring route is therefore service-role **by design** and is the entry that makes Stage 3 end at 8 rather than 7.
- Spec **§6.3** — the consultancy row shape: `owner IS NULL`, `case_id = <the case>`, on a case with `organization_id IS NOT NULL` and `student_user_id IS NULL`.
- `supabase/migrations/20260730120000_stage1_tenancy_core.sql:88-127` — `cases` and `case_assignments` DDL.
- `supabase/migrations/20260730180000_case_aware_rls_policies.sql:412` (`cases_insert_admin`), `:473-514` (`enforce_case_write_surface` + the trigger), `:552` (`case_assignments_insert_admin`), `:561` (`case_assignments_delete_admin`), `:684-685` + `:691-692` (the grants).
- `lib/cases/permissions.ts:89-108` — **`case.create` is org-scoped, `case.assign` and `case.update` are case-scoped.** Two different entry points; `decideOrgPermission` re-checks the split at runtime.
- `lib/org/repo.ts:23-33` — the two PostgREST write rules this slice obeys (see Risk notes).
- MV-169 `app/api/org/[organizationId]/**` + MV-170 `lib/cases/list-repo.ts` — the patterns this slice matches rather than reinvents.

## Why this slice needs no SQL

Every cell above is already enforced, live, by migrations shipped in MV-150/MV-152. **Verified before build, not assumed:**

| Write | Grant | Policy / trigger |
|---|---|---|
| `cases` INSERT | table-level `insert` (`…20260730180000….sql:684`) | `cases_insert_admin` — org non-null ∧ actor is owner/admin of it ∧ `student_user_id` NULL or self |
| `cases` UPDATE `operational_status` | column grant `(display_name, email, operational_status, archived_at)` (`:691-692`) | `cases_update_accessor` for the row, **`cases_write_surface_guard` for the column** |
| `case_assignments` INSERT | table-level `insert` (`:685`) | `case_assignments_insert_admin` — actor manages the case ∧ assignee is an active member of its org |
| `case_assignments` DELETE | table-level `delete` (`:685`) | `case_assignments_delete_admin` — `can_manage_case` |

**This card ships no migration**, and spec §5 forbids one that adds or alters a column. **A reviewer who finds SQL in this diff should reject it.**

Two facts a reviewer should not have to re-derive:

- **The write-surface trigger never fires on INSERT.** It is `BEFORE UPDATE … FOR EACH ROW`. A newly created case may therefore carry any check-constrained `operational_status`; this slice does not name the column on insert at all and lets the `'new'` default apply.
- **`case_assignments` has no UPDATE policy and no UPDATE grant**, deliberately (`…20260730180000….sql:559-560`). Reassignment is delete + insert, so the partial unique index stays the only arbiter. That is not a workaround; it is the model.

## MV-168's migration is merged but NOT applied in production

`20260808120000_stage3_consultancy_write_grants.sql` grants `profiles` INSERT, `plan_items` INSERT and `assessments` UPDATE `(is_primary)`. **Checked against everything this slice writes:**

| This slice writes | Depends on MV-168? |
|---|---|
| `cases` INSERT | **No** — grant + policy are MV-152's, live since 2026-08-07 |
| `cases` UPDATE `(operational_status)` | **No** — same |
| `case_assignments` INSERT / DELETE | **No** — same |
| `assessments` INSERT (scoring route) | **No** — service-role, which bypasses grants entirely |

**So nothing in MV-171 is inert in production for want of MV-168.** Recorded because the reverse would have had to be said plainly.

## Scope

### In
- `lib/cases/write-repo.ts` — `createOrgCase`, `setCaseOperationalStatus`, `readPrimaryCounsellor`, `assignPrimaryCounsellor`. **Authenticated client only**; never `createSupabaseAdminClient`.
- `app/api/org/[organizationId]/cases/route.ts` — `POST`, gated on org-scoped `case.create`.
- `app/api/cases/[caseId]/route.ts` — `PATCH`, gated on case-scoped `case.update`, writes `operational_status` only.
- `app/api/cases/[caseId]/assignment/route.ts` — `PUT`, gated on case-scoped `case.assign`.
- `app/api/cases/[caseId]/assess/route.ts` — **the case-scoped scoring route.** Authenticated `case.update` check FIRST, then service-role for the `assessments` insert. **A new, deliberately registered entry** in `lib/supabase/service-role-exceptions.ts`.
- `app/(app)/workspace/[organizationId]/students/new/page.tsx` — the create form.
- `app/(app)/workspace/[organizationId]/students/[caseId]/manage/page.tsx` — status + assignment for one case.
- `components/workspace/case-create-form.tsx`, `components/workspace/case-manage-controls.tsx` — client forms, matching MV-169's fetch-a-route pattern.
- The students list gains an "Add a student" control and a per-row **Manage** link, replacing MV-170's "Adding a student comes later" card.

### Explicitly out (spec §5, §8.1)
- **No counsellor widening** — F-1 decided above. `CASE_PERMISSION_MATRIX.counsellor` and both INSERT policies are untouched.
- **No archive.** Stage 6. Nothing here writes `archived_at`, and the `case.archive` permission gains no caller.
- **No student invitation or linking.** Stage 5. Every case this slice creates has `student_user_id IS NULL` and stays that way.
- **No unassign.** "Assign / reassign" is the scoped verb; emptying the slot is a third verb and is not built. Recorded rather than smuggled in.
- **No case route rendering profile / matches / plan / documents** — MV-172. The manage page carries status and assignment and nothing else.
- **No case-context indicators** — MV-173.
- **No consultancy-internal notes.** `case.notes.internal` exists as a permission and **no column or table does** (spec F-4). A notes model is not invented to satisfy a constant.
- **No migration. No column. No grant. No policy.**

## Acceptance criteria

- [ ] An **owner** and an **admin** can create a case in their organization; the row carries `organization_id`, `display_name`, and `student_user_id` **NULL**.
- [ ] A **counsellor** is denied case creation, and the denial is decided before any write is attempted.
- [ ] `display_name` is required; `email` is optional and stored as `null` when omitted or blank.
- [ ] The create path **never names `student_user_id` with a value** — a staff-created case is unclaimed by construction, not by convention.
- [ ] Assignment **replaces** the single primary slot: assigning B to a case already assigned to A leaves exactly one row, for B.
- [ ] Assigning the counsellor who already holds the slot is a **no-op** — no delete, no insert, and the surface says "unchanged" rather than claiming a change.
- [ ] A proposed assignee who is **not an active member** of the case's organization is refused **before** the existing assignment is deleted, so a bad request cannot strand a case unassigned.
- [ ] If the insert nonetheless fails after the delete succeeded, the result says **the case is now unassigned** — it never reports success and never reports "unchanged".
- [ ] `operational_status` accepts only the five check-constrained values; anything else is refused without a query.
- [ ] Every write destructures `error`. A `42501` renders as a refusal, never as success.
- [ ] A write the policy refuses (zero rows affected, **not** an error) is reported as `denied`, never as success.
- [ ] `case.create` is checked through **`checkOrgPermission`**; `case.assign` and `case.update` through **`checkCasePermission`**. A cast of one into the other's entry point denies.
- [ ] **Three outcomes are distinguishable on every page:** the lookup failed (outage card) · you have no access (`notFound()`) · there is nothing here. A denial and an outage must not render the same.
- [ ] The scope returned by `checkOrgPermission` is **used**, not assumed: an unrecognised scope denies rather than widening.
- [ ] No name, email address, case id or user id reaches a **query string**.
- [ ] The scoring route authorizes on the **authenticated** client before it constructs the admin client, and is registered in `SERVICE_ROLE_EXCEPTIONS` with a justification and a stated pre-condition.
- [ ] `tests/supabase/service-role-exceptions.test.ts` is green **with the new entry** and was not weakened. `lib/cases/**` still reaches for service-role nowhere (that suite's §B assertion).
- [ ] `tests/architecture/client-server-boundary.test.ts` stays green and is not weakened.
- [ ] **No migration in the diff.**

## Test plan

- `tests/cases/write-repo.test.ts` — against `fakeCaseDb`: creation payload shape (org set, `student_user_id` absent, `created_by` = actor); blank-identifier refusals; `42501` → `denied`; zero-rows → `denied`; status vocabulary refusal; the assignment no-op; the not-a-member pre-check happening **before** the delete; the delete-succeeded-insert-failed honesty branch; a thrown client resolving to a failure rather than escaping.
- `tests/api/case-routes.test.ts` — the four routes: 400 on unparseable JSON, 422 on Zod failure, 401 with no session, 403 on denial **with the repository never called**, 404 for an unknown case, 200 on success, and the scoring route's authorize-before-admin-client ordering.
- `tests/app/workspace-pages.test.tsx` — the two new pages' allowed / denied / outage states, and the students list's new controls.

**The vacuity guard, stated so a later reader can check it.** Three shapes would make this suite pass for the wrong reason, and each is excluded by construction:

1. **A denial-only assertion passes against a missing guard.** Every guard added here is mutation-tested — deleted, suite watched to go RED, restored, `git status --porcelain` confirmed clean. The table is in Done evidence.
2. **A one-row assignment fixture cannot tell "replaced" from "inserted".** Every reassignment test seeds a case that **already has a primary counsellor**, and asserts both the delete and the insert.
3. **A "denied" result proves nothing if the fake never had a row to return.** The `42501` and zero-row branches are asserted against fixtures that *do* contain the target row, so the refusal comes from the modelled refusal and not from an empty table.

**Not proven here, and the card says so:** these are jsdom / in-memory tests. They prove this layer's semantics — what it asks the database for, and what it does with the answer. They are *categorically incapable* of proving the database refuses a counsellor's INSERT (`lib/cases/README.md` §2). That half is already pinned by `tests/integration/case-rls.itest.ts:789` (admin creates in own org, 42501 cross-org), `:809` (pre-linking a stranger refused), `:818` (counsellor creation refused), `:993`/`:1013` (assignment), `:832-955` (the column write surface) — **none of which this slice changes.** The stage-exit criteria are MV-174's.

## Integration gate

```
npm run typecheck && npm run lint && npm test
```

Run **unpiped**: piping through `tail` reports tail's exit code, which is how a red gate reads as green. Plus `npx next build --webpack` — the only thing that caught MV-169's `server-only` bundle leak.

## Dependencies / blocked-by

- **MV-170** (PR #136, **not yet merged**) — this branch is stacked on `mv-170-student-list`. Code dependency, per spec §8.2: creation and assignment are entered from the list and reuse its org-scoped query and row component.
- **MV-169** (merged, PR #135) — `checkOrgPermission`, `listOrgMembers`, `getOrgMembership`, the workspace route tree.
- **MV-168** — merged; **not** a blocker for anything here (table above).
- Not blocked by the Stage 0 D-B legal gate (spec §8.3): D-B gates onboarding real student data, not construction.

## Risk notes

- **`.upsert()` would 42501 at plan time.** supabase-js compiles it to `INSERT … ON CONFLICT DO UPDATE SET` naming *every* payload column, so a column-scoped INSERT grant fails on the first call even when the row does not exist, and a partial unique index is not an inferrable arbiter (`42P10`) besides. **Every write here is read-then-insert or a plain insert.** MV-168 converted three call sites for exactly this reason.
- **A `42501` RESOLVES rather than rejects.** `grep -rn throwOnError lib/ app/` returns zero hits, so a call site that does not destructure `error` drops the write and reports success. This is the failure mode that makes a green suite lie, and it is why every write in `write-repo.ts` destructures.
- **A policy refusal is not an error.** Postgres reports it as zero rows affected. So every write `.select()`s its row back and treats an empty result as `denied` — otherwise a refused write and a successful one are the same value.
- **`operational_status` is gated by a TRIGGER, not by RLS.** Reading `cases_update_accessor` alone would conclude the linked student can change it; `enforce_case_write_surface` is what stops them. Reasoning from the policy alone gives the wrong answer.
- **Reassignment has a window.** The unique index forbids two primary rows, so the delete must precede the insert; between them the case has no counsellor. The app-layer membership pre-check removes the only *predictable* way for the insert to fail; what remains is an infrastructure failure, and the result type names that outcome rather than hiding it.
- **The assignment picker shows no names** — spec F-9. `organization_memberships` holds only `user_id` and `auth.users` is unreadable by `authenticated`; the fix is a schema change spec §5 forbids. The picker therefore identifies members by **role plus a short reference**, and the page says so out loud rather than implying the label is a person's name. **The form value is the membership id, never the Auth user id** — same discipline MV-170 applied to `student_user_id`.
- **Windows CRLF working tree.** Any line-splitting in a test splits on `/\r?\n/`, never `"\n"`; a `$` anchor after a line will not match because of the trailing `\r`.
- **PII.** `cases.display_name` / `email` describe a real person from Stage 7 onward. No row, name, email address or id from any environment belongs in a transcript, a PR, or this card.

## Agent resume notes (for a cold start)

Branch `mv-171-case-creation-assignment` off **`origin/mv-170-student-list`** (PR #136), not off master. If that branch moves, **rebase — do not merge master into it**. No worktree carries a populated `node_modules`: install into a non-OneDrive directory (`C:\ci\mv171`) and junction it in; see `[[sibling-worktree-dev-server]]`, and **delete the junction before any `git worktree remove --force`** — it follows the junction and empties the target install. `next dev` needs `--webpack`; Turbopack rejects the junction. Regenerate the board with **`node docs/kanban/build.mjs`** (no `npm run board` — the script assumes a populated install in the main worktree). **Open the PR against `mv-170-student-list`; do not merge — `master` is production and the merge is founder-gated.**

## Decision log

- **2026-08-10 — F-1 decided by the founder: reading (a), owner/admin only.** "Counsellor" in the plan's exit gate is loose prose for consultancy staff. `cases_insert_admin`, `case_assignments_insert_admin` and `CASE_PERMISSION_MATRIX.counsellor` are unchanged; `lib/cases/permissions.ts:168-169`'s comment is now a recorded decision. Widening later is its own carded slice with its own migration and Stage 1 test edits.
- **2026-08-10 — assignment is delete-then-insert, and the order is forced.** `case_assignments_primary_idx` is a partial unique index on `(case_id) where assignment_role = 'primary_counsellor'`, so insert-first raises `23505`. There is no UPDATE grant or policy to reach for instead — the migration removed that option on purpose.
- **2026-08-10 — the assignee's membership is checked in the app layer BEFORE the delete.** `case_assignments_insert_admin`'s `is_case_org_member` conjunct would refuse the insert anyway, but by then the previous assignment is gone. Checking first turns the predictable failure into a no-op. This is strictly narrower than the policy and moves no cell — the same shape as MV-169's self-mutation refusal.
- **2026-08-10 — the manage page is MV-171's, not a preview of MV-172's case route.** It carries `operational_status` and assignment and nothing else; it renders no profile, no matches, no plan, no documents. It is named `.../students/[caseId]/manage` so it cannot collide with the case route MV-172 will add.
- **2026-08-10 — the assignment form's value is the membership id, not the Auth user id.** The repo resolves membership → user id server-side through the existing `getOrgMembership`. A raw Auth user id is no more suitable in an assignment control than it was in MV-170's student row.
- **2026-08-10 — any active member may hold the primary slot, not only the `counsellor` role.** `is_case_org_member` does not filter role, and an owner or admin carrying cases directly is the normal shape of a small consultancy. Narrowing it to `counsellor` in the app layer would be a restriction the model does not ask for.
- **2026-08-10 — a created case does not name `operational_status`.** The column defaults to `'new'`, and the write-surface trigger does not fire on INSERT, so naming it would add a client-supplied value with no guard behind it for no gain.
- **2026-08-10 — the scoring route ships without its intake UI, and that is deliberate.** Spec §6.2 requires Stage 3 to add it; the surface that will call it is MV-172's case route. Shipping the capability with tests, ahead of its caller, is the same shape as MV-168 shipping grants ahead of theirs.
- **2026-08-10 — MV-170's `students/page.tsx:61` collapse was left to its own fix session, and that session landed it.** A `checkOrgPermission` denial whose reason is `lookup-failed` used to render `notFound()` on that page. It was MV-170's review defect; editing the same lines from a stacked branch would only have conflicted. The fix arrived on `mv-170-student-list` while this slice was building (`StudentsShell` + `LookupFailedCard`), and **this branch rebased onto it rather than merging master in**. MV-171's own pages were written to the corrected shape from the start.
- **2026-08-10 — one guard was found untested by MUTATION TESTING, not by review, and the gap was real.** Deleting the zero-rows check on the assignment DELETE left the suite green: the only refused-delete test modelled a `42501`, and a policy refusal is not an error. The branch is reachable — an assigned counsellor passes `case_assignments_select_accessor` and so can READ the assignment row, while `case_assignments_delete_admin` requires `can_manage_case` — and without the check the code would go on to insert, leaving two primary-counsellor rows the partial unique index exists to forbid. Closed by a new test plus a `deleteRefused` switch on `fakeCaseDb`, which needed to be its own option because "readable but not deletable" is a different fact from "the filters matched no row".
- **2026-08-10 — the mutation harness itself had a reporting bug worth recording.** A mutation that produces a SYNTAX ERROR makes vitest run no tests at all; grepping the output for "N failed" then finds nothing and reports GREEN — i.e. "this guard is untested" when the truth is "that mutation was invalid". One of the two greens in the first pass was exactly that. The harness now requires that tests actually ran before it will call anything green or red, and an invalid mutation is reported as INVALID rather than as evidence.

## Done evidence

**Branch** `mv-171-case-creation-assignment`, **rebased onto `origin/mv-170-student-list`** after
that branch's fix session landed two commits mid-build. Rebased, never merged — merging master into
a stacked branch is what the brief forbade and what would have made this diff unreadable.

### Integration gate — 2026-08-10 (post-rebase)

| Command | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **exit 0** |
| `npm test` | **exit 0 — 347/347 files, 2920/2920 tests** |
| `npx next build --webpack` | **exit 0** — all six new routes registered |

Exit codes were read from **unpiped** runs. Piping the gate through `tail` reports the exit status
of `tail`, which is how a red gate reads as green — and this session hit that trap once already, on
a baseline run that reported exit 0 while the summary line said `1 failed`.

**+99 tests from this slice**, and the arithmetic is the cross-check rather than the claim:
36 in `tests/cases/write-repo.test.ts` + 39 in `tests/api/case-routes.test.ts` + 24 in
`tests/app/case-pages.test.tsx` = 99. Measured against the pre-rebase base (`43c558a`, 2791 tests)
the suite read 2890. The remaining 30 (2890 → 2920) are MV-170's fix session's, which arrived in the
rebase.

`npx next build --webpack` is run because it is the only thing that caught MV-169's `server-only`
bundle leak. Both new client components import `lib/cases/operational-status` — the one module in
`lib/cases/` deliberately NOT marked `server-only` — and neither imports `lib/cases/permissions` or
`lib/cases/write-repo`. `tests/architecture/client-server-boundary.test.ts` stayed green and was
**not** weakened.

*(One build attempt failed with `EBUSY: resource busy or locked` on `app/(app)/workspace/page.tsx`, a
file this slice does not touch — a transient Windows/OneDrive lock. Re-run: exit 0. Recorded because
a reader who sees it in a log should know it is not a code failure.)*

### Mutation tests — every guard was deleted and the suite watched to go red

A test asserting only that something is denied passes identically against a **missing** guard, so
each guard below was removed, the suite re-run, and the guard restored.

`lib/cases/write-repo.ts` against `tests/cases/write-repo.test.ts`:

| Mutation | Result |
|---|---|
| stop destructuring the insert `error` (create) | **RED** — 1 failed |
| name `student_user_id` on the create payload | **RED** — 1 failed |
| drop the blank-display-name guard | **RED** — 1 failed |
| drop the `operational_status` vocabulary guard | **RED** — 1 failed |
| drop the zero-rows denial on the status update | **RED** — 1 failed |
| drop the `assignment_role` filter when reading the primary | **RED** — 1 failed |
| drop the active-membership pre-check | **RED** — 1 failed |
| drop the same-counsellor no-op | **RED** — 1 failed |
| hard-code `leftUnassigned: false` | **RED** — 1 failed |
| drop the zero-rows denial on the assignment delete | **GREEN → gap closed → RED** (see below) |
| drop the personal-case refusal | **RED** — 1 failed |
| drop the unknown-case refusal | **RED** — 1 failed |

The routes against `tests/api/case-routes.test.ts`:

| Mutation | Result |
|---|---|
| gate creation on `case.list` instead of `case.create` | **RED** — 3 failed |
| drop `.strict()` from the create schema | **RED** — 1 failed |
| map `lookup-failed` to 403 instead of 500 | **RED** — 1 failed |
| map `unknown-case` to 403 instead of 404 | **RED** — 2 failed |
| build the admin client BEFORE authorizing (scoring route) | **RED** — 1 failed |
| stop checking the assessment insert's `error` | **RED** — 1 failed |
| drop the ownership-null refusal | **RED** — 1 failed |

The manage page against `tests/app/case-pages.test.tsx`:

| Mutation | Result |
|---|---|
| drop the organization-match check | **RED** — 1 failed |
| render `notFound()` on a failed permission check | **RED** — 1 failed |
| treat a failed assignment read as "nobody assigned" | **RED** — 1 failed |
| offer inactive members in the picker | **RED** — 1 failed |

**23 mutations, all RED after the gap below was closed.** All restored;
`git status --porcelain` clean, no mutation edit survived into a commit.

**The one genuine GREEN, and what it found.** Deleting the zero-rows check on the assignment DELETE
left the suite green — the only refused-delete test modelled a `42501`, and a policy refusal is not
an error. That branch is reachable in production, not theoretical: an assigned counsellor passes
`case_assignments_select_accessor` and can READ the assignment row, while
`case_assignments_delete_admin` requires `can_manage_case`, so their delete removes nothing and
raises nothing — and without the check the code would go on to insert, leaving the case with two
primary-counsellor rows the partial unique index exists to forbid. Closed by a new test plus a
`deleteRefused` switch on `fakeCaseDb`.

**A second GREEN was a harness artifact, and it is worth naming.** The mutation produced a syntax
error, vitest ran no tests, and grepping for "N failed" found nothing and reported GREEN. The
harness now requires that tests actually ran; re-run with a correct substitution, that guard is
**RED**. A mutation harness that cannot tell "the guard is untested" from "the mutation was
invalid" produces exactly the false confidence it exists to remove.

### GitHub Actions did not run on this PR, and that is a configuration fact, not a failure

`.github/workflows/ci.yml:5-7` triggers on `pull_request: branches: [main, master]`. **PR #138
targets `mv-170-student-list`**, as the brief required so the diff reads clean — so `validate` and
`integration` **were never queued**. `gh pr checks 138` shows only the two Vercel checks (both pass);
the check-runs API for the head commit confirms no `validate` and no `integration` exist to be green
or red.

This is worth stating plainly rather than reporting "checks pass":

- **The local gate is the evidence for this slice** — typecheck, lint, the full 2920-test suite and
  `next build --webpack`, all unpiped, all exit 0. That covers everything `validate` runs.
- **`integration` is the one job with no local substitute here.** It self-hosts its own Supabase
  stack, and Docker is not running on this machine (`npm run test:integration` could not be attempted).
  Its relevance to this slice is bounded by a fact the diff makes checkable: **MV-171 ships no SQL** —
  no migration, no grant, no policy, and no edit to any `tests/integration/*.itest.ts`. There is
  nothing in it for the RLS/grant assertions to disagree with.
- **Both jobs will run the moment the PR is retargeted to `master`**, which is the merge step the PR
  description already instructs (retarget this PR first, *then* merge #136 — `--delete-branch` on a
  base PR closes its dependents). **The founder should read a green `validate` + `integration` there
  before merging; this card does not claim one.**

### What was NOT verified, and why

- **No live browser pass.** The surface is unreachable without an authenticated actor holding an
  **active** membership in an organization that holds cases, and no consultancy organization exists
  in any environment — the Stage 0 D-B legal gate is shut (spec §8.3, §9.3). A dev-server pass could
  only have shown the sign-in redirect. `next dev` also cannot start in this worktree: Turbopack
  rejects the junctioned `node_modules`, and `npx next build --webpack` was run instead.
- **No integration test was added.** Cells 8/9/10's SQL half is already pinned by
  `tests/integration/case-rls.itest.ts:789` (admin creates in own org, `42501` cross-org), `:809`
  (pre-linking a stranger refused), `:818` (**counsellor creation refused — F-1's decision, unmoved**),
  `:993`/`:1013` (assignment), and `:832-955` (the column write surface). **None of those files
  changed**, which is itself the evidence that F-1 reading (a) moved no canonical cell: a slice that
  had widened the counsellor would have turned `:818` and `:1013` red.
- **The scoring route has no caller yet**, by decision — its intake surface is MV-172's case route.
  It is proven at the route level, including the ordering property that matters (authorize on the
  authenticated client before the admin client exists).
- **No migration.** `git status --porcelain -- supabase/` was empty at commit time. Nothing here
  adds, alters or drops a column, a grant or a policy.

### Files

- `lib/cases/write-repo.ts` — **new**; `createOrgCase`, `setCaseOperationalStatus`, `readOrgCase`,
  `readPrimaryCounsellor`, `assignPrimaryCounsellor`. Authenticated client only.
- `lib/cases/route-denial.ts` — **new**; one denial→status mapping shared by the three case-scoped
  routes, so the three outcomes cannot diverge in three copies of the same `if`.
- `app/api/org/[organizationId]/cases/route.ts` · `app/api/cases/[caseId]/route.ts` ·
  `app/api/cases/[caseId]/assignment/route.ts` · `app/api/cases/[caseId]/assess/route.ts` — **new**
- `app/(app)/workspace/[organizationId]/students/new/page.tsx` ·
  `app/(app)/workspace/[organizationId]/students/[caseId]/manage/page.tsx` — **new**
- `components/workspace/case-create-form.tsx` · `components/workspace/case-manage-controls.tsx` — **new**
- `app/(app)/workspace/[organizationId]/students/page.tsx` — the create control and the per-row
  Manage link replace MV-170's "Adding a student comes later" placeholder
- `lib/supabase/service-role-exceptions.ts` — **one new entry**, `sanctioned`: 15 → 16
- `tests/helpers/fake-case-db.ts` — `delete` support, `deleteError`, `deleteRefused`, `deletes`, `rows`
- `tests/cases/write-repo.test.ts` (36), `tests/api/case-routes.test.ts` (39),
  `tests/app/case-pages.test.tsx` (24); `tests/app/workspace-pages.test.tsx` — MV-170's
  placeholder assertion replaced with the one MV-171 makes true
- `docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md` — F-1 recorded as
  decided, plus four build findings in the decision log (spec §1 rule 2)
- **No migration.**

---

## Review remediation — 2026-08-11 (16 confirmed defects, all fixed)

A code review of PR #138 confirmed **6 HIGH, 7 MEDIUM and 4 LOW** defects. All are fixed (16 numbered
items; L1 spanned the repository, the route and the client). One item on the review's list was
adjudicated **not** a defect and was deliberately left alone — the `/auth?next=…` redirect on the
manage page, which matches `app/(app)/checklist/[programId]/page.tsx:40` and predates this slice.

Every fix was driven by a failing test first. Where the review's point was that a test *could not
fail*, the fix was verified by mutation: the mutant is named below and was observed red.

### HIGH

- **H1 — silent unassignment.** `assignPrimaryCounsellor` can return
  `{ok:false, reason:"denied", leftUnassigned:true}`: `writeFailure()` maps a `42501` on the
  **replacement INSERT** to `denied`, and that insert only runs after the DELETE has landed. The
  route's 403 branch dropped the flag, so the one state it exists to report was the one state that
  never reached the caller. `leftUnassigned` now travels on **every** failure branch (uniform, because
  `false` is a true answer and a per-branch flag goes missing on the branch that needed it), and the
  client reads the **flag before the status**, so a 403 renders "this student has nobody assigned
  right now" rather than "not allowed".
- **H2 — four gated routes in no denial suite.** `tests/api/case-denial.test.ts` had none of MV-171's
  four routes, and its only completeness check —
  `expect(new Set(ROUTES.map(r => r.name)).size).toBe(14)` — asserted that fourteen hand-written names
  are fourteen hand-written names. All four are now registered (18 rows), each row carries a `file:`,
  and the constant is replaced by a **filesystem-derived** check: `app/api` is swept for routes that
  gate on `checkCasePermission`/`requireCasePermission` (import specifier ∪ call shape, comments
  stripped, split on `/\r?\n/`) and every one must hold a row. Plus a stale-row check, a `> 10`
  non-vacuity floor, and a derived assertion that `/api/account/delete` genuinely has no case gate
  rather than being excused by a comment. **Mutation: renaming the assess row's `file` → 1 finding,
  named by path (2 tests red).**
  The four path-scoped rows carry `noCaseStatus: null`, which is not an opt-out — they are asserted to
  never call either personal-case resolver, which is what makes "the case came from the path" true.
- **H3 — the assess insert payload was invisible.** Two tests named for the row shape and the primary
  guard asserted only a 200. The admin mock now spies the insert itself, and the payload is asserted
  column by column: `owner` **present-and-null** (and `!== ACTOR`), `case_id`, `expires_at` =
  `9999-12-31T00:00:00.000Z` (the only thing keeping an ownerless row out of MV-135's purge),
  `destination_id`, a non-empty `rule_version`, `profile_snapshot`, and `is_primary` **true then
  false** in two separate tests rather than one asserting a status twice.
- **H4 — reassignment DELETE predicate never asserted.** The fixture held one `case_assignments` row,
  so an unscoped delete and a correctly scoped one left the table identical. Added `twoCaseFixture`
  (two assigned cases in one org) and an assertion on both the predicate
  (`[["id", <the row read back>]]`) and the survivor. **Mutations: `.delete()` with no predicate →
  red; `.eq("case_id", caseId)` instead of the assignment id → red.** The pre-existing
  "REPLACES the existing primary counsellor" test passes under both mutants — confirming the review.
- **H5 — `readOrgCase` had zero direct tests.** Mocked at its only call site, so the outage-vs-404
  branch never executed. Six direct tests: the column mapping, `hasLinkedStudent` derived without
  carrying `student_user_id`, a missing case as `{ok:true,data:null}`, a failed read as
  `lookup-failed` **plus an explicit assertion that the two are different values**, a thrown client,
  and a blank id that issues no query. The implementation was already correct — this was purely the
  coverage gap the review described.
- **H6 — manage page rendered a per-claim lookup-failed as a missing control.** The outage branch sat
  inside `if (!canUpdateStatus && !canAssign)`, so the mixed answer (one check allowed, one failed) was
  the one it could not report: the page rendered normally with a control silently absent. Now **either**
  check returning `lookup-failed` renders the outage. Both orderings are tested, plus a test that a
  legitimate one-control counsellor still gets no outage.

### MEDIUM

- **M1 — the service-role registry understated its own surface.** The entry and the route header both
  said "exactly two things" while `caseWriteColumns(adminDb, caseId)` reads `cases` — a **tenant
  table** — through the service-role client. Both corrected to name all three uses. Because prose rots,
  this is now **machine-checked**: a new test asserts that any registered path calling
  `caseWriteColumns`/`caseBindColumns` names it in its entry, and that no entry claims a use count it
  does not keep. **That guard immediately surfaced two adjacent pre-existing understatements** —
  `app/api/assess/route.ts` ("Three distinct uses", actually four) and `app/api/dev/sign-in/route.ts`
  ("n/a — no case data", while it creates a case and derives ownership through the admin client). Both
  entries corrected; prose-only, no behaviour change.
- **M2 — no 23505 recovery on the assess insert.** Two concurrent submits both observe no primary, both
  insert `is_primary:true`, and the second violates `assessments_case_primary_idx` → generic 500 and the
  work is lost. Now `isUniqueViolation` → **re-read the primary → retry once as non-primary**. The
  re-read is the guard: if it still finds no primary the collision was something else and the failure
  stands. The sibling's `adoptOwnerKeyedResidue` is deliberately **not** copied — it exists for the
  legacy owner-keyed unique, and this row is `owner IS NULL` by construction (§6.3), so there is no
  owner-keyed residue to adopt. Four tests: recovery, retry-once-never-a-loop, no retry when the
  re-read finds no primary, no retry on a non-unique failure.
- **M3 — RLS-denied assignment read rendered as an empty result.** Reachable, and the review was right:
  `CASE_PERMISSION_MATRIX.student["case.update"]` is `linked`, so the **linked student** passes the
  page's gate, while `case_assignments_select_accessor` admits only
  `actor_assigned_case_ids() or can_staff_case(case_id)`. An RLS refusal is zero rows and no error, so
  the student was told "No counsellor is assigned to this student yet" — a false claim. The two are
  indistinguishable *after* the read, so the read is **not made**: the page derives staff-ness from
  `context.grantedRoles` (the authorization fact `getCaseContext` publishes, mirroring
  `can_staff_case`) and a non-staff viewer is told who staffs the case is not shown. That is also what
  the migration says the rule is — "consultancy-internal operating data", divergence 6. Three tests:
  the roster is not read, the honest sentence renders, and a **counsellor** (staff, no `case.assign`)
  still gets the roster.
- **M4 — no path-identifier validation.** A malformed `caseId` raised `22P02` inside the permission
  lookup and answered **500 "Could not check your access"**, while a well-formed unknown one answered
  404 — the client error got the outage report. New `lib/cases/path-ids.ts` (`malformedPathId`) runs
  **first, before any client or query** on all four routes → **400**. `membershipId` moved from
  `z.string().trim().min(1)` to `z.uuid()` (422). The suite's `MEMBERSHIP` constant was `mmmmmmmm-…`,
  which is not hex — a mnemonic that only worked while the field accepted any text.
- **M5 — students list hid "Add a student" when the create check FAILED.** Now an inline note where the
  control would be. Deliberately **not** a whole-page outage the way H6 is: there the two controls *are*
  the page, here the list read succeeded and blanking a working list would destroy more than it reports.
  The "may not create" test now also asserts the note is **absent**, so the two cannot re-collapse.
- **M6 — manage page dropped "Archived" and offered a live status control on an archived case.** The
  marker the list shows is back, and `canUpdateStatus` is `&& !isArchived` with a sentence saying why
  (un-archiving is Stage 6's, so the change would have no way back). A non-archived case keeps its
  control, asserted.
- **M7 — the assess route had no rate limit** while writing through service-role and inserting rows
  MV-135's purge cannot reach. Now `checkRateLimit("case-assess", user.id, 10, "1 m")` immediately
  after the 401 — keyed on the **user**, matching `/api/guide/chat` and `/api/documents/upload` (an IP
  key would throttle a whole consultancy office behind one NAT), and before the permission check so a
  flood costs no lookups. Asserted: 429, the exact key/limit, and that neither the permission layer nor
  the admin client is reached.

### LOW

- **L1 — a zero-row DELETE reported a lost race as a permission denial.** Zero rows is how Postgres
  reports **both** an RLS refusal and a lost race, but the state left behind differs: a refused delete
  leaves the row **in place**, a lost race leaves it **gone**. So one cheap re-read distinguishes them.
  New `AssignmentFailure` member `reassignment-conflict` → **409 with a `reason`**; `member-inactive`
  gained a `reason` too, because two conflicts now share the status and a client deriving a sentence
  from the status alone would tell an admin who lost a race to reactivate a colleague whose access is
  fine. The client branches on `reason`. A failed re-read is `lookup-failed`, not either answer.
  New fake switches `deleteLostRace` / `errorAfterDelete` model the two states.
- **L2 — the assignment "nothing changed" outcome was announced to nobody.** Now `role="status"` —
  polite, not assertive: nothing went wrong, but a screen-reader user who submitted got silence.
- **L3 — the no-whole-Auth-id test's positive half was vacuous.** `COUNSELLOR_USER` was
  `counsellor-a-user-id`, whose 8-char slice is `counsell` — a substring of "counsellor", which the page
  prints in a label, a role name and a paragraph, so the assertion matched whether or not the reference
  was rendered. The fixture id is now **hex**, and the test additionally asserts the prefix matches
  `/^[0-9a-f]{8}$/` (so it cannot come from the page's vocabulary) and appears in the **option the admin
  reads**, not merely somewhere in the markup.
- **L4 — the two workspace components had no tests at all.** Two new suites, 29 tests:
  `case-manage-controls.test.tsx` (17) — both request bodies, every recovery message including
  `leftUnassigned` on a 500 **and** on a 403, both 409 reasons, a non-JSON error body, the live region,
  and which controls exist; `case-create-form.test.tsx` (12) — the blank email **omitted** rather than
  sent as `""`, a trimmed name, `.strict()`-safe keys, and each failure sentence.
  **Mutation on the create form: sending `email: trimmedEmail` unconditionally → 3 tests red.**

### Gate — run locally, unpiped, on this branch

`.github/workflows/ci.yml` triggers on `pull_request: branches: [main, master]` and **PR #138 targets
`mv-170-student-list`**, so `validate` and `integration` are still not queued and there is no green
tick to lean on. The local gate is the evidence, as it was for the original slice:

```
$ npm run typecheck     -> tsc --noEmit, no output, exit 0
$ npm run lint          -> eslint, no output, exit 0
$ npm test              -> Test Files  349 passed (349)
                           Tests      2996 passed (2996)
                           Duration   80.54s
```

Touched suites, individually: `tests/cases/write-repo.test.ts` **45** ·
`tests/api/case-routes.test.ts` **55** · `tests/api/case-denial.test.ts` **40** ·
`tests/app/case-pages.test.tsx` **34** · `tests/components/workspace/case-manage-controls.test.tsx`
**17** · `tests/components/workspace/case-create-form.test.tsx` **12** ·
`tests/supabase/service-role-exceptions.test.ts` **57**.

Still no migration: `git status --porcelain -- supabase/` is empty. Still no `tests/integration/*.itest.ts`
change, so `integration`'s relevance to this remediation is bounded the same way — but the founder
should still read a green `validate` + `integration` after retargeting to `master`, and this card does
not claim one.

### Files this remediation adds or changes

- `lib/cases/path-ids.ts` — **new**; `malformedPathId`, the shared 400 for a malformed route segment
- `lib/cases/write-repo.ts` — `reassignment-conflict`; the zero-row DELETE re-reads to distinguish
- `app/api/cases/[caseId]/assignment/route.ts` — `leftUnassigned` on every branch, `reason` on both
  409s, uuid path id, `membershipId` as `z.uuid()`
- `app/api/cases/[caseId]/assess/route.ts` — rate limit, 23505 recovery, uuid path id, corrected header
- `app/api/cases/[caseId]/route.ts` · `app/api/org/[organizationId]/cases/route.ts` — uuid path ids
- `app/(app)/workspace/[organizationId]/students/[caseId]/manage/page.tsx` — either-check outage,
  staff-only roster, Archived marker, no status control on an archived case
- `app/(app)/workspace/[organizationId]/students/page.tsx` — the failed-create-check note
- `components/workspace/case-manage-controls.tsx` — branch on `reason`/`leftUnassigned` not on status;
  `role="status"` on the note
- `lib/supabase/service-role-exceptions.ts` — three entries corrected (this route's, plus the two the
  new guard surfaced)
- `tests/helpers/fake-case-db.ts` — `deleteLostRace`, `errorAfterDelete`
- **No migration. No `tests/integration/` change.**
