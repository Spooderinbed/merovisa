# MV-196 — Stage 5 slice 4: student-visible versus consultancy-only fields

Stage 5's fourth bullet, and the closure of the standing **"Known gap — student
permitted fields"** footnote in `lib/cases/README.md` (the `¹` on `case.update:
"linked"`).

## What this slice is, and how the carve changed it

The gap was written down in Stage 1 as a *forward-looking* caution:

> This layer authorizes the *claim*, not the *field set*: it has no field allowlist
> and does not inspect the payload. **A Stage 3 mutation that accepts an arbitrary
> case patch from a student is a defect** even though `case.update` resolves to
> allow.

At the time it was hypothetical — no student was linked to a consultancy case, so
`case.update` at `linked` only ever resolved to the actor's own personal case, where
"an arbitrary patch" is a patch of their own data.

**MV-194 made it live and nobody re-read this footnote.** The moment a student
accepts an invitation, `cases.student_user_id` points at an org-owned case, and
`case.update` at `linked` now resolves there too. **Nine existing write routes
accept a caller-named `caseId` and authorize it with exactly that verb.** They were
built for the opposite actor — MV-190/spec F-8 added the named-case parameter so a
*counsellor* could act on a *student's* case — and the linked student came in
through the same door from the other side.

So this slice is not "add an allowlist to a mutation nobody wrote yet". It is
**close a boundary that nine shipped routes are already standing on**, and decide
what a linked student may legitimately write on a case a consultancy owns.

## The founder decision this sits on (2026-08-24, unchanged)

> The two cases **stay separate**. One human may hold both a personal case and a
> consultancy case, and **profile and documents do NOT follow them across the
> invitation boundary.**

MV-195 made that structural on the READ side (`resolvePersonalCaseId` carries
`organization_id IS NULL` in the predicate, `listLinkedConsultancyCases` carries
`IS NOT NULL`, and neither may answer for the other). **This slice is the WRITE
side of the same decision, and it is the half that is currently open.**

Note the decision says data must not *follow* the student across the boundary. It
does **not** say a student may never write anything on a consultancy case — that is
decision (B) below and it is genuinely open. What is not open is that the answer be
*accidental*.

---

## Facts measured before carving (2026-08-28, against master at `08f1a8b`)

**Read from the source and the policy text. NOT executed** — see fact 6.

### 1. Nine routes accept a caller-named case and authorize it with `case.update`

`lib/cases/target-case.ts:99-105` — when a caller supplies a `caseId`, it is
format-checked and then authorized, and **the actor's personal case is deliberately
never consulted as a fallback**. That is correct and load-bearing for the counsellor
case it was built for. It also means a supplied id is the *only* thing that decides
which case is written.

| Route | How the id arrives |
|---|---|
| `app/api/profile/section/route.ts:72` | JSON body, `requestedCaseId(body)` |
| `app/api/shortlist/route.ts:53` | JSON body |
| `app/api/plan/action/route.ts:61` | JSON body |
| `app/api/documents/status/route.ts:40` | JSON body |
| `app/api/outcomes/prediction/route.ts:31` | JSON body |
| `app/api/outcomes/event/route.ts:35` | JSON body |
| `app/api/outcomes/attempt/route.ts:33` | JSON body |
| `app/api/documents/[id]/route.ts:33` (DELETE) | query string `?caseId=` |
| `app/api/documents/upload/route.ts:79` | multipart form field `caseId` |

`requestedCaseId` reads the raw body and is **deliberately orthogonal to each
route's Zod schema** — "none of them is `.strict()`, so the extra key passes them
untouched". So no route's validation currently sees, or could reject, the case id.

### 2. Both layers admit the linked student. This is not a TS-only gap.

- **TypeScript:** `CASE_PERMISSION_MATRIX.student["case.update"] = "linked"`
  (`lib/cases/permissions.ts:203`). Allowed.
- **RLS:** every one of the nine student-data tables gates on
  `case_id = any((select private.actor_case_ids())::uuid[])`, and
  `20260803180000_case_aware_student_data_rls.sql:223` defines
  `actor_case_ids() = { c : c.student_user_id = uid }` — the student-link arm, which
  line 159 records is **not gated on membership status**. Admitted.

So the database is **not** a backstop here. Both layers say yes, consistently,
because both were written when a student's only case was their own.

The writable surface is wider than "profile":

```
profiles          update
plan_items        update
user_program_state (ups)   insert · update · delete
document_status   (ds)     insert · update · delete
program_progress  (pp)     insert · delete
assessment_attempts (aa)   insert · delete
outcome_events    (oe)     insert · delete
documents                  delete
```

`documents_delete_case` is worth pausing on: **DELETE is in the set**, and
`app/api/documents/[id]/route.ts` is the route that reaches it.

### 3. The UI already tells the student the opposite — and two tables give two answers

MV-195 measured that a linked student **cannot** answer a document request, because
every INSERT policy on the three Stage 4 collaboration tables rides
`private.can_staff_case` (which is `can_access_case` minus the student disjunct).
It shipped a read-only page that says so in as many words: **"You can't upload a
file here yet."**

That is true of `case_document_versions`. It is **not** true of `documents`, the
older student vault, which is governed by `actor_case_ids()` instead — and
`/api/documents/upload` with `caseId=<the consultancy case>` takes the `case/`
storage prefix and writes through service-role (`route.ts:79-97`).

**Two tables, two policies, two answers, and the surface states the stricter one.**
Whichever way this slice decides, one of those two must move: either the student
genuinely may not put a file on a consultancy case (and the upload route must
enforce it), or they may (and MV-195's copy is now wrong). Deciding by measurement
is decision (C).

### 4. On `cases` columns the DATABASE is the only enforcement layer, and TS is the WIDER one

`app/api/cases/[caseId]/route.ts:57` authorizes `case.update` and **does not narrow
to staff**. A linked student passes it. What stops them is
`enforce_case_write_surface`, a TRIGGER, which refuses `operational_status` and
`archived_at` with `42501`; `lib/cases/write-repo.ts:161` maps `42501` → `denied`
and the route returns 403.

The outcome is correct. The *shape* is the one `lib/cases/README.md` names as
broken:

> This layer allowing something the database denies is a **broken feature**; the
> database allowing something this layer denies is a **security hole**.

It is already pinned as a deliberate asymmetry in
`tests/integration/tenant-isolation.itest.ts:1798` ("known layer asymmetries,
pinned"), whose own comment says a future change closing the gap should make that
test fail **and force the decision to be conscious**. This card is that decision.
Closing it means editing that test, on purpose, with reasoning — not deleting it.

### 5. `/workspace` is not the exposure; the API is

MV-195 fact 2 established that a linked student cannot reach
`/workspace/[organizationId]/…` at all — the org layout gates on active
`organization_memberships`, a set `student` is excluded from. **That protects the
pages and none of the nine routes**, which live under `/api/` and are directly
callable by any signed-in student with their own case id. The `manage` page's own
header already notes the linked student "holds `case.update` and so reaches here"
and narrows by `grantedRoles` — component by component. That is the subtraction
pattern MV-195 decision (A) rejected for the student surface, and it is what the
API layer currently has none of.

### 6. What I did NOT measure — do these first, do not assume them

- **End-to-end behaviour was NOT executed.** Facts 1–4 are read from route source
  and policy text. Whether a linked student's `POST /api/profile/section` with the
  consultancy `caseId` actually returns 200 and lands a row **must be proven in the
  integration harness before anything is changed** — that probe is criterion 1, and
  it is the red test this slice starts from. It is possible some other guard
  intervenes; the card must not assume its own premise.
- **Whether any student-facing client currently SENDS a consultancy case id.**
  Almost certainly not (MV-195 shipped a read-only surface), which is what makes
  this a boundary to close rather than a live incident — but it is unverified.
- **The hosted database's grants.** The Supabase MCP needs re-authorization, so
  production could not be read. See the migration note in Scope.

---

## The decisions this card forces

### (A) Where the field boundary is enforced — allowlist, schema, or route

Three candidate homes, and they are not equivalent:

1. **Per-route Zod `.strict()` + an explicit field allowlist.** Closest to where the
   payload is understood. But it is nine routes, so it is nine chances to forget.
2. **One shared gate in `resolveTargetCase`** — it already sees actor, case and
   permission, and every one of the nine calls it. A single place that can ask "is
   this actor the LINKED STUDENT on an ORG-OWNED case, and is this route one they
   may write there?" **Recommended**, because the alternative is the
   subtract-per-surface pattern this lane has twice rejected.
3. **A migration narrowing the RLS/grants.** Strongest, and the only one that holds
   if a future route forgets — but it carries ledger-drift risk and see Scope.

Recommended: **2, plus 3 only if (B) turns out to need it.** Not 1 alone.

### (B) What a linked student may legitimately write on a consultancy case

The genuinely open product question, and it should be answered narrowly first.

The defensible default is **nothing, for now** — the consultancy case is the
consultancy's workspace, MV-195 shipped it read-only, and a student writing profile
data there is a feature nobody has designed, not a right they are being denied.
Refusing it changes no shipped behaviour, because no client sends that id.

The argument the other way is real and should be recorded rather than dismissed:
Stage 4 shipped document *requests* against a case, and the whole point of slice 3
was that the student can see what has been asked of them. Answering is the obvious
next step. But answering is `case_document_versions`, which needs a migration
(fact 3) — so it is its own slice, and letting it in the back door through the
`documents` vault would be the accidental version of a decision that deserves the
front door.

### (C) Reconcile the two document tables — and MV-195's copy

Fact 3 leaves the product saying one thing and the API permitting another. Pick one
and make the other match, in this slice. If the answer is "the student may not put a
file on a consultancy case", then `/api/documents/upload` must refuse it and
MV-195's sentence becomes true rather than merely accurate-about-the-other-table.

### (D) Whether to close the pinned asymmetry, or re-pin it

Fact 4's test exists to force this decision consciously. Either narrow
`app/api/cases/[caseId]` so TS stops being wider than the trigger (and update the
test to pin the *new* alignment), or record why the asymmetry stays. Silently
leaving it is the one option the test was written to prevent.

---

## Scope

**In:**
- The field/route boundary for a linked student on an org-owned case, enforced in
  one place (decision A), with the nine routes proven to route through it.
- Reconciling the two document tables and MV-195's copy (decision C).
- The `lib/cases/README.md` footnote `¹` rewritten from "known gap" to what is
  actually enforced, and the matrix grid's `linked¹` cell updated with it.
- Decision (D) taken, and `tests/integration/tenant-isolation.itest.ts:1798`
  updated deliberately rather than incidentally.
- **Folded in from MV-195's "found, not fixed"** (items 3, 2, 5 of that list):
  - The `(student)` shell's `JourneyMarker` renders on `/consultancy` built from the
    **personal** case, where it can be misread as that case's progress. Decide and
    fix or record.
  - When an internal-notes table lands, MV-195 criterion 6 needs a **positive**
    test; today it is proved structurally (the page never reads the case row). Check
    whether a notes table has arrived; if not, leave the structural proof and say so.
  - `tests/integration/stage5-invitations.itest.ts`'s header still warns the
    integration lane must never run from `.claude/worktrees/`. That caution is
    stale. Correct it here, where a run can prove it.

**Out, deliberately:**
- **Letting the student ANSWER a document request.** That is
  `case_document_versions`, it needs a migration, and it is its own slice —
  see decision (B).
- Any data movement between the two cases. Foreclosed by the founder decision; a
  helpful copy is a defect.
- The Stage 5 exit gate (slice 5, in MV-191's shape).
- Team invitations, email.

**On migrations:** a migration is *permitted* if decision (A) lands on 3, using
MV-194's precedent that "no migration" was that slice's scope check and not a
standing law. **If one is taken, read MV-195's finding 6 first:** the local stack
reports the `case_document_versions` INSERT grant to `authenticated` as including an
extra `id` column, and MV-185 §8(4) asserts that list *without* `id` and raises if it
differs — so **re-applying `20260821120000_…` against the local database fails its own
apply-time assertion.** Not introduced by MV-195, unknown in production, and this is
the slice where it bites.

---

## Acceptance criteria

1. **The premise is proven before it is fixed.** An integration test shows what a
   linked student's write to the consultancy case does *today* — red first, against
   a real database, for at least `profiles` (update) and `documents/upload`. If the
   measurement contradicts facts 1–4, **the card is wrong and gets rewritten**, not
   worked around.
2. One enforcement point, and all nine routes demonstrably reach it — a test that
   enumerates the routes and fails when a tenth is added without it.
3. A linked student writing to their **personal** case is completely unaffected;
   the existing student suites pass untouched, and that is asserted, not assumed.
4. A **counsellor** naming a student's case is completely unaffected — this is the
   actor F-8 built the parameter for, and narrowing it by role must not narrow it
   for them.
5. The refusal is one shape for the student, and it is not an enumeration oracle:
   naming an unknown case, someone else's case, and their own consultancy case
   (if refused) must not be distinguishable.
6. `lib/cases/README.md` footnote `¹` no longer describes a gap, and the grid cell
   matches what the code enforces.
7. Decision (D) taken, with `tenant-isolation.itest.ts:1798` reflecting the outcome
   and its comment saying which way it went and why.
8. MV-195's copy (fact 3) and the API agree, whichever direction (C) goes.

## Test plan

**The discipline this lane has earned, and none of it is optional here:**

- A crashed vitest worker **reports as clean** — record file counts *and* test
  counts *and* a plausible duration, read from the raw log, never from the tick.
- Integration tests **skip silently** without `SUPABASE_TEST_*`. `81 skipped` is not
  `81 passed`.
- **RLS mutants must WIDEN, never drop** — a drop-mutant leaves every denial green.
  Verify `restore` byte-identical against `pg_policies` **and**
  `role_column_grants` before the first mutant and again after.
- A **denial-only suite passes identically against a missing policy**. Every denial
  needs a paired CONTROL that proves the surface works for someone.
- Case auth is enforced in **RLS and TypeScript independently**, so a single-layer
  mutant survives at full green. Where this slice adds a TS gate over a DB rule that
  already holds, the mutant must be **compound** or it proves nothing.
- Source scans split on `/\r?\n/` — on this CRLF tree `split("\n")` matches zero
  lines and assertions go **vacuously true**.
- Capture `role_column_grants`, `pg_policy`, `pg_trigger` and `pg_constraint`
  **together**; three of the four alone will mislead, and the COLUMN grant, not the
  table grant, is the real one (MISTAKES.md Trap 1).

**Specific to this slice:** the highest-value mutant is dropping the new
actor-narrowing predicate and confirming a **named** test dies — if the only thing
that goes red is a route-enumeration test, the boundary is asserted structurally but
not behaviourally.

## Resume notes (for a cold agent after a compaction)

- **Read fact 6 before believing facts 1–4.** They are a source reading, not a run.
  Criterion 1 exists because the card refuses to assume its own premise.
- The gap's own words are already in the tree: `lib/cases/README.md` footnote `¹`,
  and `tests/integration/tenant-isolation.itest.ts:1798`. Start there — both were
  written by people who saw this coming.
- `resolveTargetCase` is the choke point (`lib/cases/target-case.ts`). Nine callers,
  found with `grep -rn "resolveTargetCase\|requestedCaseId" app/`.
- **Do not widen `resolvePersonalCaseId` or `listLinkedConsultancyCases`.** They are
  a matched pair and MV-195 pinned both directions; widening either is the defect,
  not the shortcut.
- **`npm test` does not run from the main checkout** — its `node_modules` lacks
  vitest. Use a worktree under `.claude/worktrees/`, whose `node_modules` is a
  junction to a real install. The integration lane **does** run from a worktree
  (the `**/.claude/**` exclude is matched relative to `root`, and `root` is the
  worktree) — which is also MV-195 finding 5, folded into scope above.
- Board: this card was carved on `mv-196-stage5-student-permitted-fields`, the same
  branch that trues MV-195 to `done`.

## What comes after (sequence visibility, not to be built now)

- **The student answers a document request** — `case_document_versions`, migration-
  bearing, split out of this card by decision (B).
- **Slice 5 — the Stage 5 exit gate**, in MV-191's shape: replay, mismatch, expiry
  and revocation proven, for both existing and new users.
- Then **judgement-in-workspace** (per-case visa-risk + submittability), which is
  the wedge and the reason a consultancy buys.
