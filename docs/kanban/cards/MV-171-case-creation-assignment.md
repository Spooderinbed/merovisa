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
- **2026-08-10 — MV-170's `students/page.tsx:61` collapse is NOT fixed here.** A `checkOrgPermission` denial whose reason is `lookup-failed` renders `notFound()` on that page. It is MV-170's review defect, a fix session is on that branch, and editing the same lines from a stacked branch would conflict. This slice's own pages do not copy the shape.

## Done evidence

_To be completed when the gate is green._
