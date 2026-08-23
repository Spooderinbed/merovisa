# MV-193 — Stage 5 slice 1: mint and revoke a student invitation (Stage 5 slice 1)

## Context links

- **The stage:** `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`, "Stage 5 —
  Invitations and student portal". Four bullets, one exit gate.
- **The table already exists** and was shipped locked shut in MV-150, then given real policies in MV-152:
  `supabase/migrations/20260730120000_stage1_tenancy_core.sql` (§5 `invitations`) and
  `20260730180000_case_aware_rls_policies.sql` (§7).
- **The honest placeholder this card replaces:** `components/workspace/case-invite-block.tsx` — it currently
  renders "Sending the invitation isn't built yet." Stage 3 deliberately shipped a sentence rather than a dead
  button. This card is what earns the control.
- **The precedent for the shape of the work:** MV-182 (case document requests) — a server-owned write path onto a
  Stage 1 table that already had policies, no new table.

## What is already true (verified 2026-08-23, do not re-derive)

Four facts were measured before this card was carved. Each one removes work a reasonable reader would assume.

1. **The `invitations` table is complete and needs no migration.** Columns: `organization_id`, `case_id`, `email`,
   `role` (`owner|admin|counsellor|student`), `token_hash` (**not null, unique**), `expires_at`, `accepted_at`,
   `revoked_at`, `invited_by`, timestamps. `invitations_shape_check` already enforces the two legal shapes —
   *either* `organization_id is not null and case_id is null and role <> 'student'` (a team invite) *or*
   `case_id is not null and role = 'student'` (a student invite). **You cannot mint a malformed invitation; the
   database will not let you.** Do not add a migration. If you believe you need one, stop and report.
2. **The grant set is deliberately narrow, and it is the design.** `authenticated` holds `select, insert` on
   `invitations` and `update (revoked_at)` — *only* that column. `accepted_at` is **not** grantable, which is what
   makes acceptance a server-only operation rather than something a client can claim. Slice 2 will consume that;
   this slice must not widen it. **Widening the grant to make a test pass is the failure mode to refuse.**
3. **Email-based sign-in already exists** — `app/api/auth/email/start/route.ts` uses `signInWithOtp`, and
   `components/auth/email-sign-in.tsx` records that a code beat a magic link ("no stronger than the code, and
   unmeterable"). Stage 5's first bullet, "confirm email-based sign-in … supports the invitation flows", is
   therefore a **confirm, not a build**. Assert it and move on.
4. **There is NO transactional email infrastructure. None.** No Resend, SendGrid, Postmark or nodemailer
   dependency; no mailer module anywhere in `app/` or `lib/`. The only mail the product sends is Supabase's own
   OTP. **This is the constraint that shapes the slice** — see the decision below.

## The decision this card takes: a copyable link, not an email

The app cannot send an invitation email today, and adding a vendor is a new dependency, a new production secret, a
new deliverability surface and a new privacy leg in the cross-border review — all of it out of proportion to one
slice, and none of it the wedge.

**So slice 1 mints an invitation and shows the counsellor a link to send themselves.** The counsellor already
communicates with the student; they do not need us to be an email provider to do it. This keeps the whole slice
inside the existing trust boundary and leaves the vendor decision to be taken on its own merits later, if ever.

State this in the UI copy honestly — the counsellor is sending the link, and should know that.

## Scope

**In:**

- a server-owned mint path: given a case and an email, create exactly one `invitations` row with `role = 'student'`,
  `case_id` set, a **hashed** token, and an expiry;
- returning the **plaintext token exactly once**, at mint time, and never again;
- a revoke path (`revoked_at`), which is the one column the client grant already permits;
- replacing `CaseInviteBlock`'s "isn't built yet" sentence with the real control plus the copyable link;
- listing a case's outstanding invitations so a counsellor can see one is already pending and revoke it.

**Out, and deliberately:**

- **acceptance** — that is slice 2, and it is where replay / mismatch / expiry / revocation are *proven*. This
  slice must make those states *representable and tested at the data layer*, not consumed.
- **team invitations** (`role in (owner, admin, counsellor)`). The table serves both shapes, and it will be
  tempting to do both at once. Don't: team invites land a person in an organization, which is a different
  authority and a different blast radius, and they belong with the team page.
- **any email sending.**
- **the personal-case collision** — see below. It is real, it is slice 2's or slice 3's problem, and this card must
  not silently pick an answer for it.

## The trap this card is mostly about: the token must never be stored

`token_hash` is `not null unique` and is named `token_hash` for a reason. The whole security value of the design is
that **a database reader — including a compromised backup, an over-broad service-role query, or a future audit
export — cannot mint a working link.**

The mistake that would pass every functional test: store the plaintext token in the row (or log it, or return it
from a list endpoint, or put it in the audit event payload). Every test would stay green and the property would be
gone.

So the acceptance criteria below include a test that goes looking for the plaintext in places it must not be. That
test is the point of the slice, not a nicety. Note also the house rule: **no sensitive data in URLs, query params,
or client-side logs** — the token appears in a URL when the *student* clicks the link, which is slice 2's problem to
scope, but it must never appear in a *counsellor-side* URL or in any log on either side.

## The collision to NAME but not solve

A student who used the self-serve product already has a **personal case** (`organization_id is null`,
`student_user_id = them`), created by `20260802120000_stage2_case_id_and_personal_cases.sql`. When a consultancy
invites that same human, accepting would link them to a **second** case — the consultancy's — and Stage 5's third
bullet says "link the student account to an existing case **without duplication**."

Two cases for one human is not obviously wrong (one is the consultancy's file, one is theirs), but *which one the
student sees when they sign in*, and whether their profile and documents follow them, is a product decision with a
trust dimension: a student who has done the wizard should not find an empty profile after accepting.

**This card's only obligation is to make sure the mint path does not foreclose any answer.** Do not merge cases, do
not block minting when the email matches an existing account, and do not assume one case per human anywhere in the
code you write. Write the collision up in the dossier's findings when you hit it.

## Acceptance criteria

1. A counsellor assigned to a case can mint a student invitation for it; an unassigned counsellor, a member of
   another organization, and an anonymous client each cannot. **Proven against real Supabase, not mocks.**
2. Exactly one row is created, with `role = 'student'`, the case's id in `case_id`, `organization_id` null, and
   `invited_by` set to the actual actor.
3. **The plaintext token is not recoverable from the database.** A test must assert that the stored `token_hash`
   does not equal the returned token, that no other column contains it, and that re-reading the row through any
   read path the product exposes does not return it.
4. The token is returned **exactly once**, from the mint call. A second call to any read path returns the
   invitation without it.
5. `expires_at` is set, in the future, and the value is a named constant with a stated reason — not a magic number
   inline. (The product's existing 3-day assessment expiry is a precedent for the *shape* of that decision, not
   necessarily the right number here; state why you chose what you chose.)
6. Revocation sets `revoked_at`, is permitted for a counsellor who could have minted it, and is refused for
   everyone else. A revoked invitation still exists — it is not deleted.
7. Minting a second invitation while one is outstanding does not silently create a duplicate: either it is refused
   with a clear reason, or the previous one is revoked in the same transaction. **Pick one, state which, test it.**
8. No migration. No widening of any grant or policy. Verify by diffing `supabase/migrations` and the grant
   block — if either changed, the slice is out of scope.
9. `CaseInviteBlock` no longer claims the feature is unbuilt. Its copy tells the counsellor plainly that **they**
   are sending the link.
10. A `case-invite` audit event is written through the existing `private.write_audit_event` path, for both mint and
    revoke. Check what MV-189 established before inventing an event name.

## Test plan

- **Integration, real Supabase** (`tests/integration/`): extend the existing tenancy harness rather than starting a
  new one — `tests/integration/fixtures/tenancy.ts` already builds two real organizations, which is what makes
  cross-org denial expressible at all. Every denial gets a positive **CONTROL** beside it, or it passes vacuously.
- **Mutation-test every policy this slice relies on.** A denial-only suite passes *identically* against a missing
  policy, because the actor is refused by the absence of a grant rather than by the policy. Mutants must **widen**
  — a drop-mutant leaves every denial green. Read the failing test **names**, not the counts. This is the single
  most load-bearing sentence on the card; MV-191's `supabase/rehearsal/MV-191-mutation.sql` is the worked example
  and the format to copy.
- **Route level** (`tests/api/`): Zod rejection of a malformed email, and refusal for each unauthorized actor.
- The token-secrecy assertion in criterion 3 is the one test that must not be written to fit the implementation.
  Write it first.

## Before you write a line

Read `MISTAKES.md` — at minimum the Supabase-grants, the RLS-mutation, and the Windows/CRLF sections. Three
specific traps that have cost this project time and apply here:

- **An INSERT grant cannot serve an `.upsert()`**, and an upsert's arbiter index must be FULL, not partial.
- **Table-level grants understate the write surface**, and some divergences are enforced by a TRIGGER rather than
  by RLS — check `pg_trigger` before concluding anything about what can be written.
- **Source scans must split on `/\r?\n/`.** On this CRLF tree a `split("\n")` matches zero lines and the assertion
  goes *vacuously true* — which is exactly how a secrecy test like criterion 3 would silently stop testing.

Integration tests skip silently without `SUPABASE_TEST_*` in the environment; a skipped suite reads as a pass. Run
them one at a time on Windows, and **never from `.claude/worktrees/`** — `vitest.integration.config.ts` excludes
`**/.claude/**`, so the run collects zero tests and looks green.

## What comes after (carved here so the sequence is visible, not to be built now)

- **Slice 2 — acceptance.** The token → account link, and where the exit gate's four words are actually earned:
  replay, mismatch, expiry, revocation. Consumes the fact that `accepted_at` is server-only.
- **Slice 3 — linking without duplication.** The personal-case collision above, and the product decision under it.
- **Slice 4 — student-visible versus consultancy-only fields.** Stage 5's fourth bullet; untouched by this card.
- **Slice 5 — the Stage 5 exit gate**, in the shape MV-191 established for Stage 4.

## Resume notes

- Branch `mv-193-stage5-invitation-mint`; card carved 2026-08-23 on the same branch that trues MV-192 to done.
- Gate before claiming done: `npm run typecheck`, `npm run lint`, `npm test`, and the integration suite.
- Board ritual: set `col`/`entered` in `board.json` and run `npm run board` as the **first** commit, then build.
  A stale board is this project's top failure mode. Discard any regeneration that warns
  `⚠ PR data unavailable (HTTP 504)` — it strips the live PR chips from `board.md`.
- Master **is** production and auto-deploys. Merges are founder-gated: open the PR and stop.

## Build evidence (2026-08-23, branch `mv-193-stage5-invitation-mint-build`)

Built off `origin/master` at `c1574e8`. The plain `mv-193-stage5-invitation-mint` name was
already taken by the merged carve PR #159, so the build branch carries the `-build` suffix —
the precedent MV-191 set with `mv-191-stage4-exit-gate-build`.

### Gate

| Command | Result |
|---|---|
| `npm run typecheck` | clean (after clearing a stale `.next` — MISTAKES.md's phantom `TS2307`) |
| `npm run lint` | clean |
| `npm test` | **3989 passed / 3989**, 390 files |
| `npm run test:integration` | **1063 passed / 1066**, 21 files — see "the three local failures" below |
| `stage5-invitations.itest.ts` alone | **52 passed / 52** |

`npm test` was 3913/388 on the base commit; +76 tests and +2 files is exactly this slice's
71 new tests (34 repo + 37 route) plus 5 extended assertions in the two guard suites it moved.

Counts are quoted because they are the check that matters: integration tests **skip silently**
without `SUPABASE_TEST_*`, and a run from `.claude/worktrees/` collects **zero** files and looks
green (`vitest.integration.config.ts` excludes `**/.claude/**`). 21 files and 1066 tests is the
proof the lane actually ran. All work was done in the main checkout for exactly that reason.

#### The three local integration failures are shared-stack residue, not this branch

`stage2-data-equivalence.itest.ts` (1) and `case-backfill.itest.ts` (2) failed. Both files are
**byte-identical to master** (`git diff origin/master` lists neither), and both assert over
**global database contents** rather than over their own fixtures. Traced to the end:

- The `stage2` failure asserted the database holds exactly one anonymous assessment and found
  two — the stray being `7b56f2a6-…`, created at `07:31:26.431Z`, part of the same 13-row
  seeding burst (`07:31:25.977Z`–`07:31:26.431Z`) left behind when an earlier local run died
  mid-file. It is not a row anything in this slice can create: MV-193 writes `invitations` and
  `audit_events` and touches `assessments` nowhere.
- Twelve of that burst carried a `case_id` with a null `owner`, which trips
  `private.mv155_assert_case_backfill()` — the *precondition guard* both
  `case-data-access.itest.ts` and `claim-path.itest.ts` run before doing anything. That is the
  guard working correctly: it refuses to run against a polluted database.
- **Cleared the residue and re-ran both files in isolation: `stage2-data-equivalence.itest.ts`
  19/19, `case-backfill.itest.ts` 35/35.** That is the conclusive check — all three failures
  were residue, and nothing in them was a defect.

Worth noting for whoever hits this next: `stage2-data-equivalence.itest.ts` had been *silently
dead* on Windows for five cards' worth of runs (MISTAKES.md — a CRLF-terminated shebang made its
import unparseable) and MV-192 revived it one commit ago. This is close to its first real local
execution here, so its sensitivity to a long-lived shared stack has simply not been felt before.

CI is the authority here and it agrees: run
[32622068281](https://github.com/Spooderinbed/merovisa/actions/runs/32622068281) on `c1574e8` —
the exact commit this branch is cut from — is green, and its `integration` job starts a **fresh**
Supabase stack, so it cannot accumulate this residue. The local Docker stack on this machine is
long-lived and does.

### Criterion 8 — the slice stayed in scope

- `git diff origin/master -- supabase/migrations` → **empty**
- `git diff origin/master -- supabase/config.toml` → **empty**
- `git diff origin/master -- supabase/` → **one file**, `supabase/rehearsal/MV-193-mutation.sql`.
  That directory is explicitly *not* migrations (`supabase/rehearsal/README.md`: "Nothing here
  is applied by `supabase db push`; nothing here has a row in
  `supabase_migrations.schema_migrations`"), and MV-191's harness lives in the same place —
  the card names it as the format to copy. The literal "`supabase/` diff is empty" check is
  therefore satisfied in substance: **no migration, no grant change, no policy change.**
- Verified against the live database after the mutation run: `authenticated` holds exactly
  `SELECT`, `INSERT`, and `UPDATE (revoked_at)`; `anon` holds nothing; the three policies are
  byte-identical to their shipped `pg_policies` text.

### Criterion 3 — the token-secrecy test, written first, and made to bite

`tests/invitations/token-secrecy.test.ts` was written before any implementation existed and
failed on the missing module. It captures every insert payload, update patch, filter value and
`.select()` projection the repository sends, and asserts the plaintext appears in exactly one
place: the mint's return value. Five deliberate mutants, each applied alone:

| mutant | tests that went RED |
|---|---|
| plaintext written to `token_hash` | "the stored token_hash does not equal the token that was returned"; "NO column of the written row carries the token — not just token_hash"; "nothing sent to the database ANYWHERE contains the token — inserts, patches, filters" |
| list read projects `*` | "the read path never even ASKS PostgREST for token_hash" |
| digest returned by the list surface | "a listed invitation carries no token field, whatever the row held" |
| token placed in the audit payload | "no token-bearing value is passed to writeAuditEvent — criterion 3's audit-payload half" |
| token-bearing link written to `console.error` | "app/api/cases/[caseId]/invitations/route.ts passes no token-bearing value to a console call" |

The integration suite proves the same property against what Postgres actually **stored**: it
reads the committed row back with `select *` on the service-role client — what a compromised
backup would see — and asserts no column carries the token, with a column-count control so the
loop cannot pass against a short read.

All source scans split on `/\r?\n/` and carry two vacuous-green controls (line count, and
non-empty after comment-stripping).

### The RLS mutation run — `supabase/rehearsal/MV-193-mutation.sql`

Nine mutants, all **widening** (a drop-mutant makes a table deny *more*, so it leaves every
denial green — the trap the card names). Clean schema is 52/52; each mutant was applied alone,
run, and restored, and `restore` was verified byte-identical against `pg_policies` **before**
any mutant was applied. Full table in the file's header. Two results are worth carrying forward:

1. **`update_case_org` is a SURVIVOR.** Widening `invitations_update_staff` alone kills
   nothing — measured through the repository *and* through a direct `.update()` with no
   `.select()`. An UPDATE carrying a WHERE clause must SELECT the existing rows first, and
   SELECT policies apply to that read, so `invitations_select_staff` masks the update policy
   entirely. `select_update_case_org` widens both and kills four named tests. **The revoke
   boundary is defended in two independent layers, neither load-bearing alone.**
2. **The same shape on the mint.** `createStudentInvitation` reads the case first on the
   actor's RLS client, and `cases_select_accessor` hides it from an unassigned counsellor — so
   the first `insert_case_org` run survived at 39/39 against a suite that probed only through
   the repository. The itest now carries a direct-insert block that isolates
   `invitations_insert_staff`, and the repository-level test pins the *reason*
   (`unknown-case`) so the layering stays visible instead of hiding behind `ok === false`.

`insert_true` — the bluntest widening — leaves the anonymous denials green, correctly: `anon`
holds no privilege at all, so its refusal is a `42501` from the grant surface that no policy
mutant can reach. `anon_grants` is the mutant that measures that boundary.

`restore` was verified byte-identical against `pg_policies` **before** any mutant was applied,
and the grant surface re-checked after the run.

### Decisions taken, and where each is written down

- **Criterion 7 — refuse, do not auto-revoke.** A 409 `already-outstanding`. "Revoke the
  previous one in the same transaction" is unavailable: PostgREST gives one statement per
  request, and doing it as two round trips means a successful revoke followed by a failed mint
  leaves the case with no usable invitation and a counsellor who believes they just sent one.
  One commit needs a database function — a migration, which criterion 8 forbids.
- **Criterion 5 — `INVITATION_TTL_DAYS = 7`,** with the argument on the constant. Deliberately
  not the product's 3-day assessment expiry: that clock is an urgency driver pressing the
  person who benefits; this one is a blast-radius bound whose expiry presses the *counsellor*.
  Seven days is the shortest window spanning a weekend and a working week.
- **Criterion 10 — `invitation.minted` / `invitation.revoked`,** siblings of the
  `invitation.accepted` that `SANCTIONED_SERVICE_ROLE_CATEGORIES` reserved for slice 2 back in
  Stage 1. The card says "through the existing `private.write_audit_event` path"; MV-189
  **measured that path unreachable** (`private` is not a PostgREST-exposed schema: `404
  PGRST202` with EXECUTE granted to both roles, `406 PGRST106` forcing `Content-Profile`), so
  the existing path *is* `lib/audit/write-audit-event.ts`. Recorded in that module rather than
  quietly reinterpreted.
- **Service-role in the two routes is audit-only.** `authenticated` holds SELECT on
  `audit_events` and no INSERT; granting it INSERT would be the widening criterion 8 forbids,
  and would let any client forge an evidence row. The invitation row itself is written on the
  authenticated client through `invitations_insert_staff`. Both new `SERVICE_ROLE_EXCEPTIONS`
  entries say so.

### Findings

- **The personal-case collision is NAMED and NOT solved,** as instructed. The mint does not
  look the invited address up against `auth.users`, does not refuse a known address, and
  assumes one-case-per-human nowhere. A test asserts the *absence* of that lookup, so a later
  author cannot add one without a named failure. The product decision — which case a returning
  student sees, and whether their profile follows them — remains open for slice 2/3.
- **`case-invite` vs `invitation.*`.** Criterion 10 asked for "a `case-invite` audit event".
  Coining that would put a second noun beside `invitation.accepted` describing the same object,
  so the reserved vocabulary was followed instead. Flagged rather than silently substituted.
- **Guard counts moved, deliberately.** `tests/audit/audit-metadata-pii.test.ts` and
  `tests/supabase/service-role-exceptions.test.ts` pinned "exactly five audited paths"; it is
  seven now. The metadata allow-list is **unchanged** — both invitation events carry no
  metadata at all, because the invited address is raw student detail and `entity_id` already
  names the row. `tests/app/case-overview.test.tsx` pinned Stage 3's "offers no control that
  does nothing"; that was true until Stage 5 existed, and it now asserts the control is there
  and that no copy claims MeroVisa sends the mail.
- **A board-generator warning that is not a defect.** `npm run board` reports "MV-193 is in
  inprogress but its PR #159 is already merged". #159 is the *carve* PR; the guard joins a card
  to a PR by the id in its title and cannot tell a carve from a build. It exits 0.
