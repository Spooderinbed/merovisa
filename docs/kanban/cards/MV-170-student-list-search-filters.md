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
- [ ] Search matches on the student's name **and email address**, case-insensitively, and treats `%` and `_` as literal characters rather than wildcards.
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
- `tests/helpers/fake-case-db.ts` **records `.order()` and `.limit()`, and honours the limit**, so the row cap is exercised rather than mocked away. *(Corrected 2026-08-10: this line originally said the fake would gain `in` and `ilike`. It did not, and could not have — the shipped design puts the scope intersection and the search in TypeScript, so there is no `.in()` or `.ilike()` predicate to exercise. See the Decision log.)*

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
- **A search term is user input reaching a filter.** Searching two columns at once needs PostgREST's `.or()` string DSL, where the term is *structural syntax* rather than a bound value — a comma or a parenthesis typed into the box would change the shape of the query. **This slice therefore does not send the term to the database at all:** it matches both columns in TypeScript with `String.prototype.includes`, so the term is never syntax anywhere. See the Decision log.
- **Scale.** ~~The result set is bounded only by the organization.~~ **Corrected 2026-08-10 — it never was.** `supabase/config.toml:18` sets `max_rows = 1000`, so an unbounded read is truncated by PostgREST, and the original query carried no `order by`, so *which* rows survived was arbitrary. The in-memory search then ran over that arbitrary subset, and the page could answer "no students match those filters" about a student who exists — a false claim about the organization. The read is now explicitly ordered by `display_name`, capped at `LIST_ROW_CAP` (500), and asks for one row past the cap so truncation is **known** rather than guessed; the page says so out loud. Pagination is still Stage 7's — this makes the missing pagination visible, it does not build it.
- **PII in the URL.** Search is a GET form, so the term reaches `?q=`, the browser's history and the request log. Keeping it out of PostHog is `lib/analytics/redact-url.ts`; keeping it out of the URL entirely would cost the shareable, back-button-correct view the page is built around. Recorded, not assumed away — see the Decision log.
- **PII.** `cases.display_name` / `email` describe a real person from Stage 7 onward. No row, name, email or id from any environment belongs in a transcript, a PR or this card.

## Agent resume notes (for a cold start)

Branch `mv-170-student-list` off `origin/master`. No worktree carries a populated `node_modules` — install into a non-OneDrive directory (`C:\ci\mv170`) and junction it in; see `[[sibling-worktree-dev-server]]`, and **delete the junction before any `git worktree remove --force`**. Run the gate, then move the card to `inreview` in `board.json` and regenerate with `node docs/kanban/build.mjs`. **Open a PR; do not merge — `master` is production and the merge is founder-gated.**

## Decision log

- **2026-08-09 — F-9 checked against this surface and closed for it.** `cases.display_name` is `not null` and table-level `select`-granted, so unlike the team list this one is not name-blind. Recorded because the brief asked the question and a later reader will ask it again.
- **2026-08-09 — F-3 mitigated at the read layer, per reading (a), using nullness of `student_user_id` rather than a provenance column.** "A student edited this" is not knowable; "a student **can** edit this" is exactly knowable, and it is the fact a counsellor needs. Reading (b) stays open for the founder.
- ~~**2026-08-09 — search is one column, in SQL, not two columns via `.or()`.**~~ ~~**2026-08-09 — the search term is escaped for `%`, `_` and `\` before it becomes a `LIKE` pattern.**~~ **Both entries described a design that was never built, and are replaced by the next one. Struck 2026-08-10** (adversarial review, D7): they said the search was one column, in SQL, via `.ilike()`, with the term escaped — the shipped code matches **two** columns **in TypeScript** with `String.includes`, contains no `.ilike` and no escaping. The spec amendment added in the same commit already described the real design, so the two sources of truth contradicted each other in writing, on the card MV-171 and MV-172 both cold-resume from.
- **2026-08-09/10 — search matches BOTH identity columns, in TypeScript, and never becomes a `LIKE` pattern.** Spanning `display_name` and `email` in SQL needs PostgREST's `.or()` string DSL, where the term is filter *structure* rather than a bound value — a comma or a parenthesis typed into the box changes the shape of the query. Matching in memory sidesteps that entirely, and it also makes the escaping the old design needed **moot**: `%` and `_` are simply characters to `String.includes`, so a search for `100%` matches the students whose name or email contains `100%` and nobody else. The status filter stays in SQL, because its value comes from a closed check-constrained vocabulary and is validated against it first. The cost of matching in memory is that the search sees only what the capped read returned — which is why the cap is now disclosed (see Risk notes).
- **2026-08-10 — search stays a GET form, and the URL is sanitized on the way into analytics rather than emptied.** The shareable, back-button-correct URL is the reason the page has no client JavaScript at all, and a POST or client-state search would spend it. What made the GET form a defect was not the URL, it was `capture_pageview: "history_change"` shipping `$current_url` to PostHog with no sanitizer. `lib/analytics/redact-url.ts` replaces the value of free-text search params in PostHog's URL properties; the browser history and the request log still see the term, and that is recorded here rather than hidden. If a later slice needs the term out of the URL too, this decision is the one to revisit.
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
   which declare `searchParams` the same way.* ~~*Neither calls a string method on the value, so neither
   throws today.*~~ **CORRECTED 2026-08-10 (adversarial review, D8): that was false for the auth page.**
   `auth/page.tsx:36` calls `safeNext(sp.next)`, and `lib/auth/safe-next.ts:3` calls
   `input.startsWith("/")` — a `TypeError` when Next hands it `string[]` for `?next=/a&next=/b`. It is
   reachable only for an already-signed-in visitor (the call sits inside `if (data.user)`), and `:38`
   also passes the array on as `AuthCard nextPath`. **Not fixed here** — it is not this slice's code and
   it has its own chip. The assess page's claim does hold and was re-checked: `isClaimErrorCode`
   (`lib/auth/claim-error.ts:28`) opens with `typeof value === "string"`, and `sp.new === "1"` is a
   comparison, so an array is falsy-by-inequality rather than a throw. **The lesson recorded is the
   one that matters: a self-review must not certify a file it did not open.**
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
  `tests/app/workspace-pages.test.tsx` (**+15**) — 7 + 21 + 15 = **43**, which is the "+43 tests
  overall" figure above. *(Corrected 2026-08-10: this line said +14, which was the count at the
  FIRST gate, before the self-review's repeated-parameter test. The "+42 tests (2748 → 2790)" block
  further up is that same earlier moment and is left as the record of it; the final diff is +43.)*
- **No migration.** `tests/helpers/fake-case-db.ts` was unchanged in the original slice — the
  assigned-scope filter is a set intersection in this layer rather than an `.in()` predicate, so no
  shared test helper moved. *(It DOES move in the 2026-08-10 review fix, to record `.order()`/
  `.limit()`; see that section's Files list.)*

### Board bookkeeping done in this PR

- **MV-169 trued to `done`.** It merged as PR #135 (`6a40b4d`) but `board.json` on `master` still
  carried it as `inreview`; a merged card left in review is the stale-board failure mode the README
  names.
- **MV-170's board summary corrected.** It said F-3's *"fix lands in MV-173"*. The spec's revision
  removed F-3 from MV-173's scope (§8.1: *"Not F-3's column guard — that is a canonical amendment
  awaiting the founder"*). The summary now says what is true: reading (b) is an open founder call,
  and reading (a) is what MV-170 ships.

---

## Adversarial review — 2026-08-10

A 65-agent adversarial review of the slice filed **23 findings**. Five were refuted; the rest
collapse to **eight distinct defects**, every one in this slice's own new code.

**What the review looked for and did NOT find, stated because it is the more important half:** no
cross-tenant leak, no scope escalation, no raw `student_user_id` in markup, and no migration. The
access-control core — `cases_select_accessor` and the app-layer `assigned`-scope intersection — was
probed hard and is correct, and was deliberately left alone. Both were still mutation-tested below
as a control, to prove the suite would have caught it if the fix had broken them.

### The eight defects, and what changed

| # | Defect | Fix |
|---|---|---|
| **D1** | `notFound()` collapsed "the permission lookup failed" into "you have no access". `checkOrgPermission` preserves `getOrgContext`'s reason *specifically* so the two stay apart (its own doc-comment says so), and the page discarded it — so a transient Supabase error told a legitimate owner their organization does not exist. Five review lenses filed this independently. | The pages branch on the reason: `lookup-failed` renders the outage card each page already had for the equivalent failure one layer down; every **determined** denial keeps `notFound()`, so the enumeration-oracle reasoning is untouched. `invalid-input` — the only other reason `getOrgContext` raises without deciding — keeps `notFound()` deliberately: it needs a blank route segment or a blank user id, and a URL naming no organization genuinely is not found. **Fixed on the students page and on MV-169's `team` and `settings` pages**, which shipped the identical shape and are already in production. |
| **D2** | A searched student name or email address reached PostHog. The GET form puts it in `?q=`, and `capture_pageview: "history_change"` shipped `$current_url` (and `$referrer` on the way out) with no `sanitize_properties` and no `before_send`. This is the repo's first `method="get"` form, and it falsified a premise the analytics spec had written down. | `lib/analytics/redact-url.ts` replaces the **value** of free-text search params in PostHog's URL properties — `$current_url`, `$initial_current_url`, `$referrer`, `$initial_referrer`, `$pathname` — wired in `analytics-provider.tsx` so any future search surface is covered by construction. The parameter itself survives, so "a search happened" stays measurable. The GET form is **kept** (the shareable URL is why the page has no client JS); the trade, and the fact that the browser history and request log still see the term, is in the Decision log. **The spec's line-19 premise is struck and amended in this PR** rather than left standing. |
| **D3** | The empty state blamed the filters for a list that was empty before they ran. `listOrgCases` returns at `assignedCaseIds.size === 0` **before the term is computed**, and the page derived "is filtered" from the query string — so an unassigned counsellor who searched was told *"No students match those filters — clear the filters to see the full list"*, pointing at a list that does not exist. Only two of the card's three empty states were actually distinguishable. | The fact moves to the layer that knows it: `listOrgCases` returns `scopeIsEmpty` ("the scope held no case at all, before either filter"), and the page branches on that instead of on the query string. Because the status predicate runs in SQL, an empty status-filtered page cannot tell "no cases" from "no cases with this status" — so one unfiltered probe read settles it, and a probe that errors returns `lookup-failed` rather than guessing a sentence. The same conflation for `all-org` + a filter over a genuinely empty org is covered by the same branch. |
| **D4** | "Clear" left stale values in the controls. Apply is a native submit and reloads the document, so it was always correct; **Clear is a soft navigation**, where React reconciles the mounted `<select>`/`<input>` and writing `defaultValue` to an already-mounted element changes nothing it displays (for the text input, the dirty-value flag makes the browser ignore it outright). Pick "Closed" → Apply → Clear left the dropdown reading "Closed", and the next Apply re-applied a filter the user believed they had removed. | A filter-derived `key` on the `<form>` forces a remount, which is the smallest change that resets the controls. Pinned by a test that changes the props and asserts the rendered control value follows — `<select>` is the load-bearing half, since React's `postUpdateWrapper` provably ignores a changed `defaultValue`. |
| **D5** | The result set was silently capped and the recorded tradeoff named the wrong bound. The module claimed "bounded by the organization and nothing else"; `supabase/config.toml:18` sets `max_rows = 1000` and the query carried **no `.order()`**, so past 1000 cases PostgREST returned an arbitrary unordered subset, the in-memory search ran over only that, and the page could answer "no students match those filters" about a student who exists. | The read is ordered by `display_name`, capped at an explicit `LIST_ROW_CAP = 500`, and asks for `LIST_ROW_CAP + 1` so truncation is **known** rather than guessed — the extra row is never returned, it only proves more exist. The assignment read is bounded the same way. `truncated` reaches the page, which renders "Showing the first 500 students … the search box only looks through them". **No pagination** — Stage 7's, per the card. The module doc-comment now states the real bound, and names the one residual (a truncated read cannot prove a scope empty) instead of hiding it. |
| **D6** | Three vacuous or missing assertions — see the table below. | Each is now tied to the row that produced it, and each was mutation-tested. |
| **D7** | The card described a search design that was never built: one column, in SQL, via `.ilike()`, with `%`/`_`/`\` escaped, and a `fake-case-db.ts` that gained `in`/`ilike` stubs. The shipped code matches **two** columns **in TypeScript** with `String.includes`, has no `.ilike` and no escaping, and left the fake untouched. The spec amendment in the same commit described the real design, so the two sources of truth contradicted each other **in writing**, on the card MV-171 and MV-172 both cold-resume from. | Risk notes, Decision log and Test plan rewritten to describe what shipped and why — including that in-memory matching makes the old design's escaping **moot**, since `%` and `_` are just characters to `String.includes`. Also corrected: the acceptance criterion now says search matches name **and email**, and the Files line says **+15** (7 + 21 + 15 = the +43 the card offers as its own cross-check; +14 was the pre-self-review count). |
| **D8** | The self-review certified a safety `app/(marketing)/auth/page.tsx` does not have, claiming neither it nor the assess page "calls a string method on the value". | Corrected on the card only. `auth/page.tsx:36` calls `safeNext(sp.next)` → `lib/auth/safe-next.ts:3` calls `input.startsWith("/")`, a `TypeError` on `?next=/a&next=/b` (reachable for an already-signed-in visitor; `:38` also passes the array on as `nextPath`). **Not fixed here** — not this slice's code, and it has its own chip. The assess page's claim was re-checked and does hold: `isClaimErrorCode` opens with `typeof value === "string"`. |

### D6 — mutation evidence for the three assertions

Each of these previously passed against a **deleted or inverted** guard, which is the failure mode
`[[rls-negative-probes-are-inert]]` records. Every fix was verified by making the mutation, watching
the suite go **RED**, and restoring.

| Assertion | Why it was vacuous | Fix | Mutation → result |
|---|---|---|---|
| `workspace-pages.test.tsx:247` — the status label | `screen.getByText("Waiting on student")` was unscoped and matched the `<option>` in the always-rendered status dropdown, never the student row. The paired `queryByText("waiting_on_student")` was an exact-string match and so could never see the row's `"…@… · waiting_on_student"` either. | Both scoped to the row via `within(rowFor("…"))`, and matched as substrings so they see the row's `<p>`. | render `row.operationalStatus` instead of `operationalStatusLabel(...)` → **RED, 1 failed** |
| `workspace-pages.test.tsx:327` — the F-3 markers | Asserted only that both strings appeared *somewhere* in the list, so with one linked and one unlinked fixture row, **swapping the two labels was invisible** — and an inverted marker is precisely the deception F-3 exists to prevent. | Each marker tied to the row whose `hasLinkedStudent` produced it. | **swap** the two markers → **RED, 1 failed** |
| `page.tsx:192` — the Archived marker | Zero coverage at any layer: both page fixtures set `archivedAt: null`, so deleting or inverting it left all 2791 tests green. | A fixture row with a timestamp, asserting the archived row carries the marker **and the other row does not** — the negative half is what catches an inversion. | **delete** the marker → **RED, 1 failed**; **invert** it → **RED, 1 failed** |

### Mutation tests — the whole fix, not only D6

Every guard added or changed was removed or inverted, the suite re-run, and the guard restored.
Restores were verified per mutation with `git status --porcelain` against a committed tree, after an
earlier run of this battery restored with `git checkout` against *uncommitted* work and destroyed
four files — the lesson being that a mutation harness must restore from a known-good commit.

| Mutation | Result |
|---|---|
| **D1** students: `notFound()` on every denial | **RED** — 1 failed |
| **D1** team: `notFound()` on every denial | **RED** — 1 failed |
| **D1** settings: `notFound()` on every denial | **RED** — 1 failed |
| **D2** drop `sanitize_properties` from `posthog.init` | **RED** — 2 failed |
| **D2** stop redacting the search term | **RED** — 8 failed |
| **D2** clean `$current_url` only, leave `$referrer` | **RED** — 1 failed |
| **D3** page: branch on the query string again | **RED** — 1 failed |
| **D3** repo: report every empty scope as filtered-out | **RED** — 4 failed |
| **D3** repo: the `assigned` short-circuit blames the filters | **RED** — 3 failed |
| **D3** repo: drop the unfiltered probe | **RED** — 2 failed |
| **D3** repo: guess instead of failing when the probe errors | **RED** — 1 failed |
| **D4** page: drop the form `key` | **RED** — 1 failed |
| **D5** repo: drop the `cases` limit | **RED** — 1 failed |
| **D5** repo: drop the `cases` order | **RED** — 1 failed |
| **D5** repo: drop the assignment order + limit | **RED** — 1 failed |
| **D5** repo: never report truncation | **RED** — 1 failed |
| **D5** repo: return the proof row too (off-by-one) | **RED** — 1 failed |
| **D5** page: drop the cap notice | **RED** — 1 failed |
| **D5** page: hard-code 500 instead of the applied cap | **RED** — 1 failed |
| **D6** page: raw column value instead of the label | **RED** — 1 failed |
| **D6** page: swap the two F-3 markers | **RED** — 1 failed |
| **D6** page: delete the Archived marker | **RED** — 1 failed |
| **D6** page: invert the Archived marker | **RED** — 1 failed |
| *control* repo: delete the app-layer `assigned` intersection | **RED** — 2 failed |
| *control* page: widen an unrecognised scope to all-org | **RED** — 1 failed |

All restored; `git status --porcelain` clean, no mutation edit survived into a commit.

### Gate — 2026-08-10

| Command | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **exit 0** |
| `npm test` | **exit 0 — 344/344 files, 2821/2821 tests, 66.9s** |

Exit codes were read from an **unpiped** run: piping the gate through `tail` reports the exit status
of `tail`, which is how a red gate reads as green.

**+30 tests** (2791 → 2821), and the arithmetic is the cross-check rather than the claim:
9 added to `tests/cases/list-repo.test.ts` (21 → 30) + 8 added to
`tests/app/workspace-pages.test.tsx` (25 → 33) + 11 in `tests/analytics/redact-url.test.ts` +
2 in `tests/analytics/analytics-provider-sanitize.test.tsx` = 30, and 2821 − 30 = 2791, which is
exactly the figure this card recorded at the first gate.

### What was NOT done, and why

- **No migration, no column, no grant, no policy change.** Spec §5 forbids it and the review
  confirmed the diff is SQL-free. Still true after this fix.
- **No change to `cases_select_accessor` or to the app-layer `assigned`-scope intersection.** Both
  were probed hard by the review and are correct. Left alone, and mutation-tested as a control.
- **No pagination** (Stage 7), **no case route** (MV-172), **no writes** (MV-171).
- **No live browser pass**, for the reason already recorded above: the surface is unreachable
  without an authenticated actor holding an active membership in an organization that holds cases,
  and no consultancy organization exists in any environment. D4 in particular is a soft-navigation
  behaviour that jsdom cannot exercise for real — it is pinned by the React-reconciliation property
  instead (`postUpdateWrapper` ignores a changed `defaultValue`), which is the mechanism the defect
  rests on. `[[jsdom-is-blind-to-layout]]` applies and is stated rather than papered over.
- **`app/(marketing)/auth/page.tsx` was not fixed** (D8) — not this slice's code, and it has its
  own chip.

### Files touched by this fix

- `lib/cases/list-repo.ts` — `scopeIsEmpty` + `truncated` on the result, `LIST_ROW_CAP`, the
  ordered/capped reads, the unfiltered probe, corrected module doc-comment
- `app/(app)/workspace/[organizationId]/students/page.tsx` — the `lookup-failed` branch, the form
  `key`, the cap notice, the `scopeIsEmpty` empty state, corrected doc-comment
- `app/(app)/workspace/[organizationId]/team/page.tsx`, `…/settings/page.tsx` — the same D1 fix
  (MV-169's code, already in production)
- `lib/analytics/redact-url.ts` — **new**; `components/analytics/analytics-provider.tsx` — wired
- `docs/superpowers/specs/2026-06-10-analytics-instrumentation-design.md` — the struck premise
- `tests/helpers/fake-case-db.ts` — records `.order()`/`.limit()`, honours the limit
- `tests/cases/list-repo.test.ts`, `tests/app/workspace-pages.test.tsx`,
  `tests/analytics/redact-url.test.ts` (**new**),
  `tests/analytics/analytics-provider-sanitize.test.tsx` (**new**)
- **No migration.**
