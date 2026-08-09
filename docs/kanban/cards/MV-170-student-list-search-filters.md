# MV-170 — Stage 3 slice 3: student list, search, filters, and statuses

**Priority:** P1   **Owner:** agent
**Goal:** Give consultancy staff the surface the workspace exists for — find a student. An org-scoped, read-only case list with search and a status filter, where an owner or admin sees every case in the organization, a counsellor sees **only** the cases assigned to them, and an active-but-unassigned counsellor sees nothing at all.

**Authoritative spec:** `docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md` (§3, §4 cell 7, §5, §8.1, §8.2, §9.2 row E2, F-3, F-9). **Where this card disagrees with the spec, the spec wins. If the implementation contradicts the spec, amend the spec IN THIS PR** (spec §1 rule 2).

## Context links

- Spec **§4 cell 7** — `O`/`A` = all-org · `C+` = **assigned only** · `C−` = **∅** · `S`/`I`/`N` = ∅. Enforced by `cases_select_accessor` → admin-org ∪ assigned ∪ own.
- Spec **§9.2 row E2** — the vacuity trap this slice's fixtures must not fall into (see Test plan).
- Spec **F-3** — a linked student can rewrite the `display_name` and `email` this list shows a counsellor. Reading (b) is a **founder call** and is not this slice's. Reading (a)'s read-layer mitigation **is** this slice's.
- Spec **F-9** — the *team* list can render no names. Checked against the *student* list here; the finding does **not** carry over (see "F-9 does not apply", below).
- `supabase/migrations/20260730120000_stage1_tenancy_core.sql:88-127` — the `cases` and `case_assignments` shapes.
- `supabase/migrations/20260730180000_case_aware_rls_policies.sql:398` (`cases_select_accessor`), `:541` (`case_assignments_select_accessor`), `:684-685` (the `select` grants).
- `lib/cases/require-org-permission.ts` — `checkOrgPermission`, and its instruction that **the returned scope is load-bearing**.
- MV-169: `lib/org/repo.ts`, `app/(app)/workspace/…` — the patterns this slice matches rather than reinvents.

## Why this slice needs no SQL

Everything cell 7 depends on **already shipped in MV-152's migration** and is live in production:

| Read | Grant | Policy |
|---|---|---|
| `cases` SELECT | table-level `select` (`…20260730180000….sql:684`) | `cases_select_accessor` → `student_user_id = uid` ∪ `actor_admin_org_ids()` ∪ `actor_assigned_case_ids()` |
| `case_assignments` SELECT | table-level `select` (`:685`) | `case_assignments_select_accessor` → `actor_assigned_case_ids()` ∪ `can_staff_case` |

**This card ships no migration**, and spec §5 forbids one that adds or alters a column. A reviewer who finds one in the diff should reject it. (Note `20260808120000_stage3_consultancy_write_grants.sql` is merged but **not yet applied to the hosted database** — MV-170 neither needs it nor touches it.)

## F-9 does not apply to the student list — measured, not assumed

F-9 records that the **team** list can show no names: `organization_memberships` carries only `user_id`, and `auth.users` is not readable by `authenticated`. **The student list is not in that position.** `public.cases` carries the identity of the student *of that case* as its own columns:

```
display_name       text not null      -- 20260730120000_stage1_tenancy_core.sql:92
email              text               -- :93
operational_status text not null      -- :95, check-constrained to five values
```

`grant select … on public.cases to authenticated` is table-level, and `cases_select_accessor` decides *rows*, not columns. So the list renders real names, real email addresses and a real status. **No column is added and none is needed.** F-9 stands unchanged for MV-169's surface and is closed for this one.

What the list must NOT render is `student_user_id` — a raw Auth user id is neither useful to a counsellor nor safe to put in markup. The repo reads it and returns a **boolean**, never the id.

## F-3, taken at the read layer — reading (a), and only reading (a)

Spec F-3 forecasts exactly this surface: it is the first place a **student-writable** field is displayed **to a third party**, so a student could rename their case to mislead a counsellor. The spec offers two readings, takes neither, and reserves reading (b) — narrowing the canonical cell — for the founder. Reading (a) says *"MV-170's list renders staff-controlled identity, or marks student-edited fields as student-supplied so a counsellor cannot be deceived by one."*

**There is no provenance column, so "this value was edited by the student" is not knowable.** What *is* knowable, exactly, is whether a student **can** edit it — `cases_update_accessor`'s student disjunct is `student_user_id = (select auth.uid())` (`…20260730180000….sql:432`), which no actor satisfies when the column is null. So:

| Case shape | Who can write `display_name` / `email` | What the list says |
|---|---|---|
| `student_user_id IS NOT NULL` | staff **and** the linked student | **"Self-reported"** next to the name |
| `student_user_id IS NULL` | staff only | **"No student account"** |

Both markers come from one column and each is literally true. This moves no cell, breaks no Stage 1 test, and leaves reading (b) open for the founder.

## Scope

### In
- `lib/cases/operational-status.ts` — the five check-constrained status values and their sentence-case labels. **Not** `server-only`: a status vocabulary is presentation, not a permission rule.
- `lib/cases/list-repo.ts` — `listOrgCases(actorUserId, organizationId, scope, filters, db)`. Authenticated client only. Applies the `assigned` scope in the app layer as well as relying on RLS.
- `app/(app)/workspace/[organizationId]/students/page.tsx` — the list, gated on `case.list`, with a GET form for search + status filter.
- A "Students" link on `app/(app)/workspace/page.tsx` for every role (cell 7 gives all three staff roles *some* list).

### Explicitly out (spec §8.1)
- **No creation, no assignment, no writes at all** — MV-171 owns those. Nothing on this page mutates.
- No archive (Stage 6). `archived_at` is *displayed* if set; nothing sets it here.
- No case route (MV-172) — a row is not yet a link to anywhere.
- **No migration.** No column. No change to `cases_select_accessor`.

## Acceptance criteria

- [ ] An **owner** and an **admin** see every non-personal case in the selected organization.
- [ ] An **assigned counsellor** sees the cases assigned to them, and **only** those.
- [ ] An **active but unassigned** counsellor in the same organization sees an empty list — asserted against a fixture where the organization holds other cases and the membership row exists and is `active`.
- [ ] A counsellor's assignment in a **different** organization does not leak a case into this organization's list.
- [ ] `case.list` denial renders `notFound()`, not a "forbidden" page (enumeration oracle — same reasoning as the team page).
- [ ] The scope returned by `checkOrgPermission` is **used**, not assumed: an unrecognised scope denies rather than widening to all-org.
- [ ] Search matches on the student's name, case-insensitively, and treats `%` and `_` as literal characters rather than wildcards.
- [ ] The status filter accepts only the five check-constrained values; anything else is ignored rather than sent to the database.
- [ ] **Three empty states are distinguishable:** the lookup failed · there are no students in scope · the filters matched none of the students there are.
- [ ] A case with a linked student is marked **Self-reported**; a case without one is marked **No student account** (F-3 reading (a)).
- [ ] No raw `student_user_id` reaches the rendered markup.
- [ ] Nothing in this slice imports `createSupabaseAdminClient` — `tests/supabase/service-role-exceptions.test.ts` stays green with no new entry.
- [ ] `tests/architecture/client-server-boundary.test.ts` stays green and is not weakened.

## Test plan

- `tests/cases/list-repo.test.ts` — against `fakeCaseDb`: both scopes; the unassigned-counsellor empty result; the cross-org assignment; the search escape; the status pass-through; a PostgREST error resolving to `lookup-failed` and **not** to an empty list; a thrown client denying rather than escaping.
- `tests/cases/operational-status.test.ts` — the vocabulary matches the migration's check constraint exactly, and every value has a label.
- `tests/app/workspace-pages.test.tsx` — the page's allowed and denied states, the three empty states, the two F-3 markers, and the absence of the raw user id.
- `tests/helpers/fake-case-db.ts` gains `in` and `ilike` so the scoping and search predicates are exercised as predicates rather than mocked away.

**The E2 vacuity guard (spec §9.2), stated here so a later reader can check it:** a fixture holding **one** case, or an "unassigned" counsellor holding **no membership at all**, turns this into a tenancy test Stage 1 already passes. Every scope test therefore seeds **≥2 cases in the same organization** and gives the unassigned counsellor an **`active`** membership in it.

**Not proven here, and the card says so:** these are jsdom/in-memory tests. They prove this layer's semantics — what it asks the database for, and what it does with the answer. They are *categorically incapable* of proving the database refuses a cross-tenant read (`lib/cases/README.md` §2). The RLS half of cell 7 is pinned by `tests/integration/case-rls.itest.ts`, which this slice does not change, and the stage-exit criterion **E2** is MV-174's.

## Integration gate

```
npm run typecheck && npm run lint && npm test
```

## Dependencies / blocked-by

- **MV-169** (merged to production, PR #135) — the list is scoped by the selected organization, and `checkOrgPermission` is what resolves the actor's scope within it.
- **Not blocked by MV-168.** MV-168's grants are write grants; this slice writes nothing. Its migration `20260808120000` being unapplied on the hosted database does not affect this surface.
- Not blocked by the Stage 0 D-B legal gate (spec §8.3): D-B gates onboarding real student data, not construction.

## Risk notes

- **The app-layer `assigned` filter is not decoration.** `cases_select_accessor`'s first disjunct is `student_user_id = auth.uid()`, so a counsellor who is *also* the linked student of some case in the same organization would see that case through RLS alone. Cell 7 gives a counsellor **assigned only**, so the app filters to `case_assignments` as well. Removing that filter widens cell 7 without any test of the SQL going red.
- **A search term is user input reaching a filter.** Searching two columns at once needs PostgREST's `.or()` string DSL, where the term is *structural syntax* rather than a bound value. This slice searches one column with `.ilike()`, whose term supabase-js encodes as a value. See the Decision log.
- **Scale.** The result set is bounded only by the organization. That is honest at Stage 3 (no consultancy is onboarded; spec §9.3), and it is the pilot in Stage 7 that earns pagination — recorded rather than pre-built.
- **PII.** `cases.display_name` / `email` describe a real person from Stage 7 onward. No row, name, email or id from any environment belongs in a transcript, a PR or this card.

## Agent resume notes (for a cold start)

Branch `mv-170-student-list` off `origin/master`. No worktree carries a populated `node_modules` — install into a non-OneDrive directory (`C:\ci\mv170`) and junction it in; see `[[sibling-worktree-dev-server]]`, and **delete the junction before any `git worktree remove --force`**. Run the gate, then move the card to `inreview` in `board.json` and regenerate with `node docs/kanban/build.mjs`. **Open a PR; do not merge — `master` is production and the merge is founder-gated.**

## Decision log

- **2026-08-09 — F-9 checked against this surface and closed for it.** `cases.display_name` is `not null` and table-level `select`-granted, so unlike the team list this one is not name-blind. Recorded because the brief asked the question and a later reader will ask it again.
- **2026-08-09 — F-3 mitigated at the read layer, per reading (a), using nullness of `student_user_id` rather than a provenance column.** "A student edited this" is not knowable; "a student **can** edit this" is exactly knowable, and it is the fact a counsellor needs. Reading (b) stays open for the founder.
- **2026-08-09 — search is one column, in SQL, not two columns via `.or()`.** `.ilike(column, pattern)` sends the term as a value; `.or("a.ilike.*q*,b.ilike.*q*")` sends it as filter *structure*, where a comma or a parenthesis in a free-text box changes the shape of the query. Name-only search is also the smaller change, and the field is labelled for what it does.
- **2026-08-09 — the search term is escaped for `%`, `_` and `\` before it becomes a `LIKE` pattern.** Otherwise a search for `100%` silently matches every student.
- **2026-08-09 — sorting is done in TypeScript, matching `listActorOrganizations`.** One place decides order, and the test pins it against a deliberately out-of-order fixture (the MV-169 lesson: a pre-sorted fixture proves nothing).
- **2026-08-09 — the row is not a link.** The case route is MV-172. A link to a 404 would be a worse lie than no link.

## Done evidence

**Branch** `mv-170-student-list` off `origin/master` @ `6a40b4d`.

### Integration gate — 2026-08-09

| Command | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **exit 0** |
| `npm test` | **exit 0 — 342/342 files, 2790/2790 tests, 62.7s** |
| `npx next build --webpack` | **exit 0** — `ƒ /workspace/[organizationId]/students` registered |

Exit codes were read from an unpiped run: piping the gate through `tail` reports the exit
status of `tail`, which is how a red gate reads as green.

**+42 tests** (2748 → 2790), and the arithmetic is the cross-check rather than the claim:
7 in `tests/cases/operational-status.test.ts` + 21 in `tests/cases/list-repo.test.ts` + 14 added
to `tests/app/workspace-pages.test.tsx` = 42, and 2790 − 42 = 2748, which is exactly the figure
MV-169 recorded on merge.

`npx next build` was run because it is the only thing that caught MV-169's `server-only` bundle
leak. It is now also covered inside `npm test` by `tests/architecture/client-server-boundary.test.ts`,
which stayed green and was **not** weakened. `lib/cases/operational-status.ts` is deliberately not
`server-only`, so no client module reaches a server-only chain through it.

### Mutation tests — every guard was deleted and the suite watched to go red

A test asserting only that something is denied passes identically against a **missing** guard, so
each guard below was removed, the suite re-run, and the guard restored. `lib/cases/list-repo.ts`
against `tests/cases/list-repo.test.ts`:

| Mutation | Result |
|---|---|
| delete the app-layer `assigned`-scope intersection | **RED** — 2 failed |
| delete the unknown-scope guard | **RED** — 1 failed |
| delete the sort | **RED** — 5 failed |
| stop validating the status against the vocabulary | **RED** — 1 failed |
| carry `student_user_id` into the rendered shape | **RED** — 2 failed |

`app/(app)/workspace/[organizationId]/students/page.tsx` against `tests/app/workspace-pages.test.tsx`:

| Mutation | Result |
|---|---|
| drop the scope narrowing (fall through to the query) | **RED** |
| hard-code `all-org` instead of passing the resolved scope | **RED** |
| collapse the two empty states into one | **RED** |
| forward the query-string status unvalidated | **RED** |
| remove the F-3 marker from the row | **RED** |
| tell a counsellor the list is the organization's | **RED** |
| render a lookup failure as an empty organization | **RED** |

All restored; `git status --porcelain` clean, no mutation edit survived into a commit.

### Self-review pass — 2026-08-09, after the first gate

Two defects found by re-reading the diff rather than by a failing test. Both are in the new code.

1. **A repeated search parameter would have 500'd the page.** Next hands `?q=a&q=b` through as
   `string[]`, and `(sp.q ?? "").trim()` throws `TypeError` on an array — turning a malformed link
   into a server error page instead of a list. The page's `searchParams` type said `string`, which
   was a claim about the URL rather than about Next. Fixed by widening the type to the truthful
   `string | string[]` and collapsing to the first value. Pinned by a test that **fails with
   `TypeError: (sp.q ?? "").trim is not a function`** against the old code (mutation 8).
   *The same latent shape exists on `app/(marketing)/auth/page.tsx` and `app/(focused)/assess/page.tsx`,
   which declare `searchParams` the same way. Neither calls a string method on the value, so neither
   throws today — noted, not changed, because it is not this slice's code.*
2. **A redundant `as CaseListScope` cast.** TypeScript narrows through `notFound()`'s `never` return,
   so the cast was doing nothing except standing ready to hide a real error the day `PermissionScope`
   gains a member. Removed; `npm run typecheck` exits 0 without it, which is the measurement that
   proves it was redundant rather than load-bearing.

### Gate — 2026-08-09 (post-self-review)

| Command | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **exit 0** |
| `npm test` | **exit 0 — 342/342 files, 2791/2791 tests** |
| GitHub Actions on PR #136 | **`validate` pass · `integration` pass · Vercel pass** |

The `integration` job has been gating since 2026-08-03, so its green tick is evidence rather than
decoration. **+43 tests** overall (2748 → 2791).

### What was NOT verified, and why

- **No live browser pass.** The surface is unreachable without an authenticated actor holding an
  **active** membership in an organization that holds cases, and no consultancy organization exists
  in any environment — the Stage 0 D-B legal gate is shut (spec §8.3, §9.3). A dev-server pass could
  only have shown the sign-in redirect. Separately, `next dev` cannot start in this worktree at all:
  Turbopack rejects the junctioned `node_modules` (`Symlink … points out of the filesystem root`);
  `next dev --webpack` is the documented workaround and `npx next build --webpack` is what was run
  instead.
- **No integration test was added.** Cell 7's RLS half is `cases_select_accessor`, already pinned by
  `tests/integration/case-rls.itest.ts`, and the stage-exit criterion **E2** — assigned sees, active
  unassigned does not — is **MV-174's** by spec §9.1. Writing it here would duplicate the exit gate
  in a slice, which is how a gate stops being a gate.
- **No migration.** Nothing in this slice adds, alters or drops a column, a grant or a policy.
  `20260808120000` (MV-168) remains merged-but-unapplied on the hosted database; this surface does
  not depend on it.

### Files

- `lib/cases/operational-status.ts` — **new**, the check-constraint vocabulary + labels
- `lib/cases/list-repo.ts` — **new**, cell 7 data access, authenticated client only
- `app/(app)/workspace/[organizationId]/students/page.tsx` — **new**, the list
- `app/(app)/workspace/page.tsx` — a Students link per organization, for every staff role
- `tests/cases/operational-status.test.ts` (7), `tests/cases/list-repo.test.ts` (21),
  `tests/app/workspace-pages.test.tsx` (+14)
- **No migration. No change to `tests/helpers/fake-case-db.ts`** — the assigned-scope filter is a
  set intersection in this layer rather than an `.in()` predicate, so no shared test helper moved.

### Board bookkeeping done in this PR

- **MV-169 trued to `done`.** It merged as PR #135 (`6a40b4d`) but `board.json` on `master` still
  carried it as `inreview`; a merged card left in review is the stale-board failure mode the README
  names.
- **MV-170's board summary corrected.** It said F-3's *"fix lands in MV-173"*. The spec's revision
  removed F-3 from MV-173's scope (§8.1: *"Not F-3's column guard — that is a canonical amendment
  awaiting the founder"*). The summary now says what is true: reading (b) is an open founder call,
  and reading (a) is what MV-170 ships.
