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

## What comes after (sequence visibility, not to be built now)

- **Slice 4 — student-visible versus consultancy-only fields.** Stage 5's fourth bullet, and the
  standing `lib/cases/README.md` gap on `case.update: "linked"`.
- **Slice 5 — the Stage 5 exit gate**, in the shape MV-191 established for Stage 4: replay, mismatch,
  expiry and revocation proven, for both existing and new users.
- Then **judgement-in-workspace** (per-case visa-risk + submittability), which is the wedge and the
  reason a consultancy buys.
