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
