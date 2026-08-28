# MV-195 — Stage 5 slice 3: the student's view of their consultancy case

## What this slice is, and how the carve changed it

Slice 3 was carried on MV-194 as *"now a UI question rather than a product-decision question — what a
student holding two cases sees on sign-in, and how they move between them."* **Measurement says that
framing understates it.** The two-case *experience* is real, but the thing underneath it is not
navigation: **the case a student accepts in MV-194 is unreachable to them.** There is no route a linked
student can load, and the surface that would show them what their consultancy has asked for was
explicitly deferred to Stage 5 by Stage 4, in code.

So this slice builds a **door that does not exist yet**, and the navigation question is the smaller half.

## The founder decision this sits on (2026-08-24, unchanged)

The two cases **stay separate**. One human may hold a personal case (`organization_id is null`,
`student_user_id = them`) and a consultancy case, and **no data crosses between them**. MV-194 encoded
that as a byte-for-byte "personal case untouched" integration test.

This card inherits it as a **constraint, not a question**. A helpful "we brought your profile over" is a
**defect** here, not a nicety. What this slice adds is *visibility of the second case*, never *merging*
it with the first.

## Facts measured before carving (2026-08-28, against master at `9fabdd3`)

Each one either removes work a reasonable reader would assume, or names a hole they would fall into.

### 1. The separation is ALREADY structural. This slice must not widen it.

`lib/cases/personal-case.ts:114-142` — `resolvePersonalCaseId` carries `organization_id IS NULL` **in
the predicate, not as a post-filter**, and says why in the comment: *"a student linked to a consultancy
case must not have that case returned here."* MV-157 §A makes that function the **only** place a personal
route turns an actor into a case id.

So the founder decision needs no enforcement work — it is enforced by construction. **The risk in this
slice runs the other way:** the obvious shortcut ("just let the resolver return both cases") would
silently point the entire `(student)` route family at a consultancy case. The resolver is not the seam.
Whatever this slice adds, `resolvePersonalCaseId` must still answer with the personal case and nothing
else, and a test should pin that.

### 2. The accepted case is UNREACHABLE — this is a new surface, not a nav tweak.

Every route that can render a consultancy case today lives under
`app/(app)/workspace/[organizationId]/students/[caseId]/`. Its org layout
(`app/(app)/workspace/[organizationId]/layout.tsx:50-54`) gates on `listActorOrganizations` — **active
`organization_memberships`** — and `notFound()`s anyone without one.

`MEMBERSHIP_ROLES` is `["owner", "admin", "counsellor"]`, and `lib/cases/permissions.ts:29-31` states the
exclusion is deliberate: *"`organization_memberships.role` deliberately excludes it (migration line 60)
because students attach to exactly one case through `cases.student_user_id`."*

**A linked student therefore hits `notFound()` at the layout, before any page authorizes anything.**
Not a redirect, not a permission denial — the chrome refuses to name the organization. There is no
student-reachable URL for a consultancy case anywhere in the app.

### 3. Stage 4 pre-registered this exact slice, in code.

`lib/cases/permissions.ts:213-219`, on the student row's `case.documents.request: "deny"`:

> *"Reading what has been asked of them is `case.read`, which this role holds at `linked` — so this
> `deny` withholds the ask, never the answer. **The student-facing surface that shows it is Stage 5 and
> is not built by MV-182.**"*

Stage 4 shipped document **requests against a case** (`lib/cases/document-requests-repo.ts`,
`document-collaboration-repo.ts`) with no way for the invited student to see or answer one. **Until this
slice lands, MV-182's request flow is a dead end for exactly the students it was built for.** That is
this card's strongest justification, and it is a standing obligation the codebase already wrote down —
not a new idea introduced here.

### 4. MV-194 left a copy debt that this card pays, and it is the visible marker that slice 3 landed.

`lib/invitations/accept-messages.ts:112-118`:

> `dashboardNote: "Your dashboard still shows your own MeroVisa work, and that's where to find it."`
>
> with the comment: *"what a student holding two cases sees, and how they move between them, is slice 3.
> Until it ships, promising the dashboard will show the consultancy's case would be a lie the student
> discovers one click later."*

That string is deliberately weak because it had to be. **When this slice ships, it must change** — and
the change is not cosmetic, it is the moment the sentence stops being a hedge and starts being a
direction. `ACCEPT_CONFIRMATION.separateCases` (the "nothing has been taken away from you" line) stays
true and should NOT be softened; it is the founder decision spoken to the student.

### 5. The permission matrix already has a `student` CaseRole — and one of its cells is now false.

`lib/cases/permissions.ts:195-223` gives `student`: `case.read: "linked"`, `case.update: "linked"`,
`case.notes.internal: "deny"` (*"Consultancy-internal notes are invisible to the student whose case they
describe"*), `case.documents.request: "deny"` (the ask, not the answer).

But `case.list: "deny"` is justified by:

> *"A student never lists cases: they have exactly one, reached directly."*

**The 2026-08-24 founder decision falsified that comment.** A student can now hold two. The cell may
still be the right answer — "reached directly" can remain true with two cases — but **the comment is now
wrong on its face and must not be left standing**, whichever way decision C goes.

Also recorded there, and *not* this slice's job: `lib/cases/README.md` §"Known gap: student permitted
fields" — `case.update: "linked"` does not enforce field-level restriction. That is **slice 4**
(Stage 5's fourth bullet). Do not fix it here; do not let it block this.

### 6. A brand-new invited student lands on an empty personal dashboard. This is the sharpest failure.

`lib/auth/finish-sign-in.ts:61` calls `ensurePersonalCase` on **every** sign-in. So a student who creates
an account *for the sole purpose of accepting a consultancy invitation* gets:

1. an auto-created, empty personal case;
2. MV-194's accept flow, which succeeds;
3. a redirect to `/dashboard` — **their personal case** — which is empty;
4. the consultancy case they made the account for: **invisible, with no route to it.**

Stage 5's exit gate reads *"both existing and new users can accept a valid invitation."* Acceptance
already works. **The result of accepting is what does not.** Fix this path first; it is the one where
the product currently looks broken to a first-time user.

### 7. What I did NOT measure — do these first, do not assume them.

- **Whether a linked student can read/write the consultancy case's documents today.** `case.read:
  "linked"` is the *TypeScript* answer; documents also pass Supabase Storage RLS and the `documents`
  table's own policies, which are case-keyed. **Measure `pg_policy` on `documents` and the Storage
  objects policy before scoping upload in or out** (decision D). Capture `role_column_grants`,
  `pg_policy` + `pg_get_expr`, `pg_trigger` + `pg_get_triggerdef` and `pg_constraint` **together** —
  three of the four alone will mislead you, and the column grant, not the table grant, is the real one
  (MISTAKES.md Trap 1, re-hit while carving MV-194).
- **The visual shape.** This is a design-language question, and `index.html` is a reference, not
  production code. Imageless product body applies: this surface is product, so **no photography**.

## The decisions this card forces

### (A) How the student reaches the consultancy case — new route, or admit them to `/workspace`?

**Recommended: a separate, student-facing route. Do not admit students to `/workspace/[organizationId]`.**

The workspace UI is consultancy chrome — an org rail, a team page, settings, a student *list*, and
internal notes. Admitting a student would mean enforcing `case.notes.internal: "deny"` component by
component inside a UI built on the premise that every reader is staff. **That reuse is the leak.** A
student-facing route starts from "show only what this student may see" instead of subtracting from
"show everything".

The builder decides the URL shape. Whatever it is, it must not imply the student is inside the
consultancy's workspace, and it must not leak the organization's internal naming.

### (B) What lands on sign-in when the student holds two cases.

**Recommended: the personal case stays the default at `/dashboard`, and the consultancy case is reached
by an explicit, named affordance. Never auto-switch.**

The personal case is the one the student built and the only one holding their own answers. Silently
landing them somewhere else — especially somewhere near-empty — would read as data loss, which is the
precise misreading the founder decision already obliges this slice to prevent.

### (C) `case.list` — flip the cell, or keep `deny` and reach both cases without a list?

Two cases is not really a *list*; "reached directly" can still hold. Keeping `deny` is defensible and
smaller. **Either way, fact 5's comment must be rewritten** — leaving a justification the founder
decision falsified is how the next author reasons from a false premise.

If the cell is flipped, `case.list` is **org-scoped** (`ORG_SCOPED_PERMISSIONS`) and a student has no
organization — so flipping it is not a one-line change, and that asymmetry is itself an argument for
keeping `deny`.

### (D) How much of the consultancy case the student sees — and whether they can answer.

Read-only ("here is your case, here is what's been asked of you") is the smaller, safe slice. Letting
them **answer** a document request is what makes Stage 4's flow work end to end.

**Decide by measurement, not preference** (fact 7). If the documents/Storage policies already admit a
linked student on a consultancy case, answering is mostly wiring and belongs here. If they do not, it
needs a migration — and then it is a **separate slice**, because a migration in this project carries the
ledger-drift risk that MV-194 declined for the same reason.

**Whatever is chosen, internal notes are never shown.** That is not a decision; it is fact 5.

## Scope

**In:**

- a student-reachable surface for a consultancy case they are linked to, authorized through
  `requireCasePermission` (`case.read`, `linked`) and not through org membership;
- the two-case experience: how a student holding both moves between them, per decision B;
- what has been asked of them by the consultancy (Stage 4's document requests), at minimum read;
- internal notes provably withheld;
- MV-194's `dashboardNote` copy debt paid (fact 4), and fact 5's falsified comment rewritten;
- the brand-new-invited-student path (fact 6) working end to end.

**Out, and deliberately:**

- **any data movement between the two cases.** Foreclosed by the founder decision; a helpful copy is a
  defect. `resolvePersonalCaseId` must not widen (fact 1).
- **student-visible versus consultancy-only field enforcement** — Stage 5 bullet 4, **slice 4**, and the
  known gap in `lib/cases/README.md`. This slice shows a case; it does not police fields.
- the **Stage 5 exit gate** (slice 5, in the shape MV-191 established for Stage 4).
- **team invitations** (`role in (owner, admin, counsellor)`) — different authority, different blast
  radius.
- any email sending. Still no vendor, still not this slice's argument to have.
- admitting students to `/workspace/**` (decision A).

## Acceptance criteria

1. A student linked to a consultancy case can reach a page showing that case, and the page authorizes
   via `requireCasePermission(actor, caseId, "case.read")` — not via org membership, and not by trusting
   a case id from the URL without a permission check.
2. A student **not** linked to that case cannot reach it. The refusal is the same answer for
   "not linked", "unknown case" and "revoked", so the route is not an enumeration oracle — the shape
   `app/(app)/workspace/[organizationId]/layout.tsx:28-35` already establishes.
3. A **lookup failure renders an outage, never a permission denial.** `lookup-failed` is always an
   outage (MISTAKES.md, MV-133). An empty state must never be the face of a broken read.
4. `resolvePersonalCaseId` still returns only the personal case, with `organization_id IS NULL` still in
   the predicate — pinned by a test that fails if the consultancy case leaks into a `(student)` route.
5. The personal case's data is unchanged by anything in this slice, asserted on both sides — the
   founder decision, still expressed as a test (MV-194 criteria 5 and 6 are the pattern to follow).
6. **Consultancy-internal notes are not present in what the student is served** — asserted against the
   rendered output/payload, not merely absent from the component. `case.notes.internal: "deny"` is the
   rule; this is its proof.
7. A student holding **both** cases can move between them per decision B, and the personal case remains
   what `/dashboard` shows.
8. A student holding **only** a consultancy case (fact 6: the brand-new invited account, whose empty
   personal case is auto-created at sign-in) is not stranded on an empty dashboard with no route to the
   case they signed up for.
9. `ACCEPT_CONFIRMATION.dashboardNote` is updated to match what now exists, and
   `ACCEPT_CONFIRMATION.separateCases` still tells the truth about the two cases staying separate.
   Neither may imply the student's own data moved, nor that it was lost.
10. Fact 5's `case.list` comment no longer asserts a student has exactly one case, whichever way
    decision C is taken.
11. `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:integration` are green, with file
    **and** test counts plus a non-trivial duration recorded on this dossier.

## Test plan

- **Unit / component:** the authorization fork (linked → renders, not-linked → the single refusal,
  lookup-failed → outage); internal notes absent from the served payload; the two-case navigation;
  the copy assertions for criterion 9.
- **Integration** (`tests/integration/`, in the Stage 5 file or a sibling): a linked student reads their
  consultancy case; a different student cannot; the personal case is **byte-for-byte untouched**; the
  brand-new-invited-student path from sign-in to reaching the case.
- **RLS / grant mutation** in the `supabase/rehearsal/MV-194-mutation.sql` format — **mutants must
  WIDEN**, never drop (a drop-mutant leaves every denial green), and `restore` must be verified
  byte-identical against `pg_policies` **and** `role_column_grants` before the first mutant and again
  after. **Read the failing test NAMES**, not just the count: a denial-only suite passes identically
  against a missing policy.
- **Two-layer check:** case authorization is enforced in RLS **and** in TypeScript independently, so a
  single-layer mutant survives at full green. If this slice adds a denial, mutate **both** layers.
- **Verification hygiene:** a crashed vitest worker reports as CLEAN — read file **and** test counts and
  a plausible duration (MV-194 hit exactly this, an inconclusive `9 passed (81)`). Integration tests
  **skip silently** without `SUPABASE_TEST_*`: `81 skipped` is not `81 passed`. Source scans must split
  on `/\r?\n/` — on this CRLF tree `split("\n")` matches zero lines and assertions go **vacuously true**.
- **Live browser pass if any CSS or layout is written:** jsdom is blind to layout. If the Browser pane
  cannot display (non-interactive session), **say so** rather than implying pixel evidence exists.

## Resume notes (for a cold agent after a compaction)

- **Branch:** carved on `mv-195-stage5-two-case-experience` off master at `9fabdd3` (the MV-194 squash).
- **Read first:** `lib/cases/permissions.ts` (the student row, ~line 195), `lib/cases/personal-case.ts`,
  `app/(app)/workspace/[organizationId]/layout.tsx`, `lib/invitations/accept-messages.ts`, and
  `lib/cases/README.md` before changing anything in `lib/cases/`.
- **The one-line summary of the problem:** MV-194 shipped the *link*; nothing shipped the *door*.
- **Do not** widen `resolvePersonalCaseId` (fact 1). **Do not** admit students to `/workspace/**`
  (decision A). **Do not** fix the student-permitted-fields gap (slice 4). **Do not** move data between
  the two cases (the founder decision).
- **Local stack:** the long-lived Docker stack accumulates residue; itests asserting over whole-DB
  contents can fail on leftovers rather than on your branch. Diagnose and clear before blaming the
  branch, and check whether the failing file is even in your diff. The integration lane **does** collect
  from `.claude/worktrees/` — the `**/.claude/**` exclude is matched relative to `root`, and `root` is
  the worktree, so a stale caution to the contrary is wrong.
- **A migration is permitted but not assumed.** If decision D needs one, prefer splitting the slice.
  Migrations apply via the Supabase MCP `execute_sql`, **never `apply_migration`** (it stamps its own
  version → ledger drift). **The Supabase MCP currently requires re-authorization and is unavailable in
  a non-interactive session** — say so rather than working around it.
- **Never commit** `.claude/hooks/prompt-improve.mjs` or `.claude/skills/.authoring-kit/`. Stage explicit
  paths; never `git add -A`.

---

# BUILD RECORD — 2026-08-28

Built on `mv-195-stage5-two-case-experience-build`, cut from the CARVE branch because PR #163 was
still open (the same shape MV-194 used). **No migration**: `git diff origin/master -- supabase/`
touches only `supabase/rehearsal/`, so **nothing is owed to the production ledger**.

## The four decisions, as taken

### (A) A separate student-facing route, in the `(student)` shell — `/consultancy`

Recommendation followed, and the architecture agreed from the other side.
`tests/architecture/shell-boundary.test.ts` says the signed-in area has exactly TWO shells and
that a route added directly under `app/(app)/` is **stranded** — no nav, no footer, no way out.
So "not `/workspace`" forces "inside `(student)`", which is also the honest reading: this is the
student's own app showing them a second case, not the student inside the consultancy's workspace.

Two routes, mirroring `/workspace` → `/workspace/[organizationId]`:

- **`/consultancy`** — the door. Auto-enters on exactly one linked case, offers a chooser on
  several, says so plainly on none, and renders an OUTAGE (never "you have none") on a failed
  lookup. The auto-enter is conditioned on `ok && length === 1`, so a failed lookup is never
  resolved by guessing.
- **`/consultancy/[caseId]`** — the case, gated by `openStudentCaseRoute`
  (`lib/cases/student-case-route.ts`).

**No organization segment in the URL, and no consultancy named on the page** — and that is
measured, not stylistic. `organizations_select_member` rides `private.actor_org_ids()`, i.e. an
`organization_memberships` row, and `student` is not a membership role. A student cannot read the
`organizations` row at all, so there is no name for the surface to leak. When a student holds two
cases the chooser distinguishes them by `cases.created_at`, which is the only discriminator they
can actually read.

The gate refuses four things with ONE answer (`notFound()`), so the route is not an enumeration
oracle: not-linked, unknown case, revoked link, and — the two the permission check alone cannot
see — a **personal case** under the consultancy URL, and a **staff** viewer. Both of those actors
legitimately hold `case.read`, so `notFound()` there is a routing decision rather than a
permission one. A dual-role actor who is staff AND this case's student still gets in.

### (B) The personal case stays the default; the consultancy case is a named affordance

Recommendation followed. `/dashboard` still resolves through `resolvePersonalCaseId` and every
read on it is still scoped to the personal case — pinned by a test that fails if any dashboard
repo is called with the consultancy case id. The door is `ConsultancyDoor`, high on the page
because for a brand-new invited account everything below it is empty (criterion 8).

**One decision inside the decision:** the door is shown when the lookup FAILED as well as when it
succeeded. Hiding it on a failed probe would hide the only route to a case the student may well
have, and `/consultancy` is the page that owns the outage sentence because it is the one making
the claim. It renders nothing only when the student is *known* to have none.

### (C) `case.list` stays `deny` — and the falsified comment is gone

Recommendation followed. The cell is still right, but not for the reason it carried: `case.list`
is ORG-SCOPED and `decideOrgPermission` answers it from an `organization_memberships` row, so a
student has no organization to list cases *within*. Flipping it would not be a one-line change;
it would be a second, roleless listing path.

A source scan (`split(/\r?\n/)`, with a guard assertion so it cannot pass by matching nothing)
pins that no comment still claims a student has exactly one case. **It found TWO lines, not one** —
the `case.list` cell and the `CASE_ROLES` header — and the second would have been missed by a
hand edit. It also flagged my first replacement, because that draft *quoted* the old sentence;
the quotation was paraphrased away rather than the scan loosened.

### (D) READ-ONLY — and this was decided by measuring the policies

The card required this one to be settled by measurement. Captured together (`pg_policy` +
`pg_get_expr`, `role_column_grants`, `pg_trigger` + `pg_get_triggerdef`, `pg_constraint`) from
the migrations that are the applied source of truth, cross-read against the helper definitions.
**The split is clean, and it runs down the middle of the same three tables:**

| Table | SELECT policy | INSERT / UPDATE policy |
|---|---|---|
| `case_document_requests` | `_select_actor` → `actor_case_ids()` | `_insert_staff` / `_update_staff` → `can_staff_case` |
| `case_document_versions` | `_select_actor` → `actor_case_ids()` | `_insert_staff` → `can_staff_case` |
| `case_document_reviews` | `_select_actor` → `actor_case_ids()` | `_insert_staff` → `can_staff_case` |

`private.actor_case_ids()`'s **first disjunct is `c.student_user_id = (select auth.uid())`**, so
the linked student READS all three — MV-185's own comment says the reviews policy exists so they
see "a rejection note, which is the half of this model that is any use to them".
`private.can_staff_case` is `can_access_case` **minus** the student disjunct, and MV-182/MV-185
both name that subtraction as the point. So the student WRITES nothing.

Three corroborating facts, because three of the four catalogues alone would have misled:

- **The column grant, not the table grant, is the real one** — and here the column grants are
  *identical* for staff and student (`grant insert (…) … to authenticated`). There is no
  role-specific grant to hide behind: **the predicate IS the entire boundary.**
- **`pg_trigger`**: `case_document_requests_status_guard` refuses a hand-written status that
  contradicts the derivation, and the two `_sync_request_status` triggers fire AFTER INSERT only.
  None of them looks at the actor, so no trigger contributes to the student boundary.
- **`pg_constraint`**: `decision in ('accepted','rejected')` and `status in
  ('outstanding','resolved')` bound values, not actors.

**Conclusion:** letting a student *answer* a request needs a new INSERT policy and a new column
grant — a MIGRATION — so it is a separate slice, exactly as the card provides for. The page
therefore ships no write control and **says so out loud** rather than shipping one that fails at
the database after the student has done the work (`canResolveByHand`'s reasoning, one reader
over). Downloading an arrived file already works and needed nothing: the MV-186 download route
gates on `case.read` and its header names the linked student explicitly.

## Evidence

### Gate

| Command | Result |
|---|---|
| `npm run typecheck` | clean (`tsc --noEmit`, no output) |
| `npm run lint` | clean (`eslint`, no output) |
| `npm test` | **4167 passed / 4167, across 398 files, 62.27s** (baseline on the carve branch: 4110 across 394 — this slice adds 4 files and 57 tests) |
| `npm run test:integration` | **NOT RUNNABLE LOCALLY** (no Docker engine — see below). Locally it only COLLECTS and skips: `1 skipped (1)` / `20 skipped (20)` in 385ms, which proves the file loads and `describe.skipIf` fires and **nothing else**. **The real evidence is CI's gating `integration` job on PR #164, read from the RAW LOG rather than the tick: 22 files / 1115 tests passed in 125.94s with 119.18s of real test time** — the carve baseline is 21 / 1095, so this slice's +1 file / +20 tests reconciles exactly, and the duration rules out a crashed worker. All 20 of this file's tests appear individually as `✓`, including the four decision-D denials, the counsellor CONTROL, the decision-A organization denial and its control, and the byte-for-byte personal-case assertion. |

### The blocker, stated rather than worked around

**The local Docker stack could not be started in this session.** Docker Desktop's process runs and
the `docker-desktop` WSL distro boots on demand, but the engine never opens
`\\.\pipe\dockerDesktopLinuxEngine` — across a `-SwitchLinuxEngine`, a full process restart, and
several minutes of waiting. That looks like a first-run/interactive step this non-interactive
session cannot complete. Without the stack there is no `SUPABASE_TEST_*`, so the integration lane
**skips**, and a skip is not evidence.

What this means for the two artefacts that need it — and they end up in **different** places:

- **`tests/integration/stage5-student-case.itest.ts` DID run, in CI, and passed.** The
  `integration` job self-hosts its own stack and has been gating since 2026-08-03. On PR #164 it
  reports 22 files / 1115 tests / 125.94s, every one of this file's 20 tests individually ticked
  in the raw log. So decision D is measured against a real Postgres after all; it just was not
  measured on this machine. Read that job from the RAW LOG on every future run, not the tick — a
  crashed vitest worker prints a clean-looking summary having run almost nothing (MV-194 hit
  exactly that).
- **`supabase/rehearsal/MV-195-mutation.sql` is genuinely UNRUN**, and this is the one real gap
  in the slice. A mutation run needs a database it can *mutate and restore*, which CI's ephemeral
  stack does not offer to a PR. Five mutants and a self-contained byte-for-byte `restore` are
  written; the results table records **what each mutant must kill** rather than numbers nobody
  measured. **Anyone with a working local stack should run it before this merges** — the
  three-call recipe is in the file header, and `staff_to_access` is the one that matters.

One incidental, recorded so a future agent does not read it as a defect in this branch: a
full-lane integration run with no stack up **HUNG** rather than skipping. The new file is not the
cause (it skips in 385ms on its own), so some other itest blocks on a connect that never refuses.

**The Supabase MCP also requires re-authorization** and is unavailable in a non-interactive
session, so nothing was measured against the hosted project either. Neither gap was worked
around: no migration is in this slice, so nothing is owed to the production ledger.

### Mutation — the CODE layer, which is the half that could be run

Case authorization is enforced in RLS **and** TypeScript independently, so a single-layer mutant
survives at full green. **The SQL half is unrun** (it needs a stack it can mutate and restore);
the code half was run, one mutant at a time, each reverted with `git checkout --` and the tree
verified clean afterwards. Until the SQL half runs, half the argument is written down rather than
demonstrated — the itest passing in CI proves the policies behave as claimed TODAY, not that a
test would notice if they stopped.

| Mutant (one line removed) | Tests that went RED |
|---|---|
| `student-case-route`: drop the personal-case refusal | 1 — *"refuses the actor's OWN personal case under the consultancy URL"* |
| `student-case-route`: drop the staff refusal | 1 — *"refuses STAFF — this door is the student's, and theirs is /workspace"* |
| `student-case-route`: collapse `lookup-failed` into `notFound()` | 1 — *"a LOOKUP FAILURE is an outage, never a permission denial"* |
| `student-case-route`: drop the `isWellFormedId` guard | 1 — *"a malformed id is refused BEFORE any query — it is not an outage"* |
| `linked-consultancy-cases`: drop `.not("organization_id","is",null)` | 1 — *"asks the DATABASE for `organization_id is not null` rather than filtering after"* |
| `personal-case`: drop `.is("organization_id", null)` | 3 — *"never returns an organization case, even for the same student"*, *"resolvePersonalCaseId answers with the PERSONAL case when the student holds both"*, *"keeps `organization_id is null` IN the predicate"* |

No two mutants killed the same set, so the six refusals are **independently** covered rather than
collectively.

**And one result that is a finding rather than a pass.** Dropping the consultancy resolver's
predicate killed only the *predicate* test — the behavioural *"NEVER returns the personal case"*
stayed green, because the `flatMap` null-guard downstream filters the row out anyway. So that
function is defended twice and the behavioural test cannot see the predicate go. Reading the
failing NAMES rather than the count is the only reason this is known. The predicate test is
load-bearing on its own and must not be deleted as redundant.

## Found, and deliberately not fixed

1. **A request's kind label duplicated its title.** `DOCUMENT_META` labels `passport` as
   "Passport bio page", which is also what a counsellor's title usually says, so the student page
   rendered the same sentence twice — reading as two requirements. Fixed in this slice (the kind
   is shown only when it differs) because it was this slice's own markup.
2. **There is no internal-notes table yet.** `case.notes.internal` is a permission with no
   storage: `grep` over `supabase/migrations/` finds no notes column on any case-scoped table.
   Criterion 6 is therefore proved STRUCTURALLY — the student page never reads the case row at
   all, so `display_name`, `operational_status` and the assignment roster cannot reach its markup
   — plus an assertion over the rendered output that no operational-status word, organization id,
   actor id or storage key appears. Worth knowing before slice 4: when a notes table lands, this
   criterion needs a new, positive test.
3. **The `(student)` shell's `JourneyMarker` renders on `/consultancy` too**, built from the
   PERSONAL case. It is the student's own persistent chrome and it is consistent across the
   shell, but on a consultancy page it could be misread as that case's progress. Left alone:
   changing it means touching the shell, which is outside this slice. Worth a look in slice 4.
4. **`tests/app/case-denial-pages.test.tsx` needed a stub, not a weakened assertion.** The
   dashboard's new consultancy probe is a `from()` call, and that file asserts ZERO queries when
   the actor has no personal case. Its own header scopes that to *case-scoped* reads and it
   already stubs the catalogue for exactly this reason, so the new module is stubbed the same way
   with the reasoning written down — the probe is asserted for real in `dashboard-page.test.tsx`.
5. **`tests/integration/stage5-invitations.itest.ts`'s header still says the integration lane must
   never be run from `.claude/worktrees/`.** That caution is stale (the exclude is matched
   relative to `root`, and `root` is the worktree). Not edited here — it is another slice's file
   and the correction belongs with a run that can prove it.

## Board

`docs/kanban/board.json` moved `ready` → `inprogress` before the build (committed first), and
→ `inreview` after the gate, each followed by `npm run board`.

## What comes after (sequence visibility, not to be built now)

- **Slice 4 — student-visible versus consultancy-only fields.** Stage 5's fourth bullet, and the
  standing `lib/cases/README.md` gap on `case.update: "linked"`.
- **Slice 5 — the Stage 5 exit gate**, in the shape MV-191 established for Stage 4: replay, mismatch,
  expiry and revocation proven, for both existing and new users.
- Then **judgement-in-workspace** (per-case visa-risk + submittability), which is the wedge and the
  reason a consultancy buys.
