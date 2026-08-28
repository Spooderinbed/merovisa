# MV-194 — Stage 5 slice 2: accepting a student invitation (the bridge's read half)

## The founder decision this card is built on (2026-08-24)

MV-193 named the personal-case collision and deliberately refused to answer it. **It has now been answered:
the two cases stay separate.**

A student who used the self-serve product has a personal case (`organization_id is null`,
`student_user_id = them`). When a consultancy invites that same human and they accept, they are linked to a
**second** case — the consultancy's. **Their profile and their documents do not follow them across the
invitation boundary.** One human, two cases, no merge.

What that buys this slice:

- **Acceptance is a link, never a merge.** No data movement between cases, no ownership transfer, no
  reconciliation of a student's self-reported answers against a counsellor's. The hardest question in Stage 5's
  "link the student account to an existing case without duplication" bullet is now closed: *without duplication*
  means **do not create a second case for a case that already exists**, not *do not let one human hold two cases*.
- **The service-role surface stays small.** A merge would have needed read-and-copy across two tenancy domains —
  precisely the shape the Stage 3 spec spent a card refusing.

What it costs, and what this card owes because of it:

- **A returning student will see an empty consultancy case.** That is now an accepted outcome, not a bug. But it
  creates an honesty obligation: **nothing in this slice may imply their existing data came with them, and nothing
  may imply it was lost.** The accept page's copy is in scope for exactly that reason.
- *What* the student sees when they sign in holding two cases — which one lands, how they move between them — is
  **slice 3**, and is now a UI question rather than a product-decision question.

## Context links

- **The stage:** `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`, "Stage 5 —
  Invitations and student portal".
- **The slice this one consumes:** `docs/kanban/cards/MV-193-stage5-invitation-mint.md`. Read its "Build
  evidence" section before starting — it records four decisions (TTL, refuse-don't-auto-revoke, the audit
  vocabulary, service-role-is-audit-only) that this slice either extends or must deliberately depart from.
- **The credential module:** `lib/invitations/token.ts` — `hashInvitationToken`, `INVITATION_TTL_DAYS = 7`, and
  `invitationLink(origin, token)`, which already fixes the spelling of the route this card builds.
- **The schema:** `supabase/migrations/20260730120000_stage1_tenancy_core.sql` §5; policies in
  `20260730180000_case_aware_rls_policies.sql` §7.

## What is already true (verified 2026-08-24 against the tree and the migrations — do not re-derive)

Five facts. Each removes work a reasonable reader would assume, or names a hole they would fall into.

1. **`/invite/[token]` does not exist.** There is no `app/invite` directory of any kind. Slice 1 minted the
   address and built nothing that answers on it; `invitationLink()` is the single place the path is spelled, and
   this route must keep it that way rather than re-spelling `/invite/` in a second file.

2. **The acceptance statement is already specified — by MV-150, in the schema's own comment.** Verbatim:

   > `unique (token_hash)` is what makes the atomic compare-and-swap acceptance enforceable — one statement
   > setting `accepted_at` where the hash matches AND `accepted_at is null` AND `revoked_at is null` AND
   > `expires_at > now()`, with the affected row count deciding success. That statement is Stage 5 app code;
   > MV-150 ships only the columns and the uniqueness it needs.

   **Do not invent a different mechanism.** This card is the redemption of a promise made three stages ago. Note
   how cleanly the exit gate's four words map onto four predicates: **mismatch** → the `token_hash` lookup,
   **replay** → `accepted_at is null`, **revocation** → `revoked_at is null`, **expiry** → `expires_at > now()`.
   Losing any predicate loses exactly one of the four gate words, which is what makes this testable by mutation.

3. **`authenticated` can update `public.cases` — but `student_user_id` is deliberately excluded from the column
   grant.** The grants are `select, insert, delete` at table level, **plus**
   `grant update (display_name, email, operational_status, archived_at) on public.cases`. A
   `cases_update_accessor` policy admits the linked student, the org admin, and the assigned counsellor, but it
   answers *"may this actor update this ROW"* and deliberately not *"which COLUMNS"* — the column grant is the
   other half. `student_user_id` is in neither, and MV-150 says why in the migration itself: linking a case to
   somebody else's Auth account **"is invitation acceptance (an atomic compare-and-swap, Stage 5), never a field
   a consultancy can point at a stranger."** So the link write is service-role by design, and **this card is the
   compare-and-swap that comment is waiting for.**

   **Read the column grant, not the table grant.** This is Trap 1 in `MISTAKES.md` and it was re-hit while
   carving this card: `information_schema.role_table_grants` — and a naive grep that expects `grant … on
   public.cases` on one line — **understates the write surface**, because MV-161 replaced table-wide privileges
   with column-scoped ones and the statement wraps across two lines. Capture all four before making any
   access-model claim here: `role_column_grants`, `pg_policy` + `pg_get_expr`, `pg_trigger` +
   `pg_get_triggerdef`, and `pg_constraint`. Three of the four alone will mislead you — there is a
   `cases_write_surface_guard` BEFORE UPDATE trigger that refuses columns the grants appear to permit.

4. **`accepted_at` is not grantable either** — `authenticated` holds `select, insert` and `update (revoked_at)`
   on `invitations`, and MV-193 verified that against the live database and refused to widen it. So **both writes
   this slice needs are service-role writes**, and that is by design rather than by accident: server-only
   acceptance is what MV-193's criterion 2 was protecting.

5. **`invitation.accepted` is reserved vocabulary, not a name to coin.** Stage 1's
   `SANCTIONED_SERVICE_ROLE_CATEGORIES` named "invitation acceptance, account linking" as a sanctioned category
   before any of it existed, and MV-193 shipped `invitation.minted` / `invitation.revoked` as its siblings. Add
   `invitation.accepted` to the closed `AUDIT_ACTIONS` list. **Check `AUDIT_METADATA_KEYS` before adding a
   metadata key** — MV-193 deliberately carried *no* metadata on its two events because the invited address is
   raw student detail and `entity_id` already names the row. The same reasoning applies here.

## The atomicity gap this card must confront, not paper over

Acceptance is **two writes**: the compare-and-swap on `invitations`, and setting `cases.student_user_id`.
PostgREST gives one statement per request, so **these cannot be one transaction without a database function**,
and there is no such function today. A partial failure is therefore reachable, and the two orderings fail
differently:

- **CAS first, then link.** If the link fails, the token is burned and the student is unlinked. Recoverable by a
  counsellor re-minting; the failure is *support load*.
- **Link first, then CAS.** If the CAS fails, a case has been pointed at a student on the strength of a token
  that turned out to be **expired, revoked, or already used**. The failure is a *security regression*.

**The card's position: CAS first.** The compare-and-swap is the authorization decision and must be the single
atomic thing that decides a winner; the link is its consequence. A burned token costs a support round trip, and
pointing a consultancy's case at a person on an invalid credential costs the property the whole design exists to
protect. Make the link's failure **loud** — an honest error to the student and an audit row — never a silent 200.

**You may take a migration for a `private.accept_invitation()` function instead, and close the gap properly.**
MV-193's "no migration" rule was that slice's scope check, not a standing law, and this is the slice where the
argument for one is real. If you do, say so in the dossier and keep it minimal: a `security definer` function that
does both writes in one statement pair and returns the outcome. If you don't, **the residual gap must be written
down as a finding**, not left for the exit gate to discover.

## The trap this card is mostly about: the token is now in a URL

The house rule is **no sensitive data in URLs, query params, or client-side logs**. Slice 1 honoured it by
returning the token in a POST body and keeping it out of every counsellor-side URL. **Slice 2 cannot** — the link
the student clicks *is* the token, in a path segment. That is the design, and it is a normal one, but it drags in
obligations that no functional test will fail without:

- The token lands in **browser history**, in the **`Referer` header of any outbound request the page makes**, and
  in any **server access log**. So the accept page must carry **no third-party scripts, no external images, no
  outbound links**, and must send **`Referrer-Policy: no-referrer`**.
- **The token must be consumed and never re-echoed** — not into a redirect target, not into an error page's
  querystring, not into the audit event, not into a client-side log.
- **The sign-in round trip is the sharp edge.** A student clicking the link will usually not be signed in. They
  must authenticate (email OTP already exists — `app/api/auth/email/start/route.ts`) and come back **without the
  token being lost and without it riding in the OTP redirect URL**. Slice 1's `lib/auth/site-origin.ts`
  (`resolveSiteOrigin`) is what already makes any redirect safe from host-header injection — reuse it, do not
  re-implement it — but host safety is a different property from *not putting the credential in the redirect at
  all*. Solve the hand-off deliberately and write down what you chose.
- Write the source-scan test for all of this, and **split on `/\r?\n/`**. On this CRLF tree a `split("\n")`
  matches zero lines and the assertion goes **vacuously true** — which is precisely how a secrecy test stops
  testing while staying green.

## The decisions this card must take explicitly

Each of these is a real fork. Pick one, state the reason in the code, and test the choice.

**A. Must the invitation's `email` match the signed-in account?** MV-150 left this here on purpose — *"email is
stored as given; normalized-address matching at acceptance time is Stage 5."* This is **mismatch**, the first of
the exit gate's four words. The token is already a 256-bit bearer credential, so the check is not what makes
acceptance secure; what it defends is a **counsellor sending the link to the wrong address**, which is the likely
real-world failure. **Recommended: require a normalized match and refuse with its own distinct reason.**
Normalization must be spelled out and conservative — case-fold and trim, and **do not** strip Gmail dots or
`+tags`: address-canonicalization shortcuts are a spoofing surface, not a convenience.

**B. What does an unauthenticated visitor see?** They cannot be shown case detail — they have proven nothing yet.
The page must be useful without leaking: it may say an invitation exists and which consultancy sent it only if
you can argue that is not itself a disclosure. **Erring toward showing less is correct here**, and "sign in to
continue" leaks nothing at all.

**C. Second click by the same student, after a successful acceptance.** Replay refusal is right for a *different*
actor. For the same actor it should land them in the case rather than on an error — the token is spent, but the
outcome it bought is theirs. Pick one, and make sure the choice does not weaken the replay defence for anyone
else.

**D. An invitation whose case already has a different `student_user_id`.** Distinct from replay: the token is
valid but the case is taken. Refuse, and do not overwrite — overwriting would let a stale token evict a linked
student.

## Scope

**In:**

- `app/invite/[token]/` — the student-facing route `invitationLink()` already points at;
- the acceptance path: the MV-150 compare-and-swap, then the `cases.student_user_id` link;
- the four refusals — replay, mismatch, expiry, revocation — each with its **own** honest, distinguishable
  message, because a single "this link doesn't work" makes the gate untestable from the outside;
- decisions A–D above;
- the `invitation.accepted` audit event;
- a new `SERVICE_ROLE_EXCEPTIONS` entry written to the standard MV-193 set — the *reason* the client cannot do
  this, not just the fact that service-role does it.

**Out, and deliberately:**

- **copying, merging, or migrating any data between the student's two cases.** The founder decision forecloses
  it; a helpful "we brought your profile over" is now a *defect*, not a nicety.
- **what the student sees when they hold two cases** — slice 3, and now a UI question only.
- student-visible vs consultancy-only fields (slice 4); the Stage 5 exit gate (slice 5).
- team invitations (`role in (owner, admin, counsellor)`) — different authority, different blast radius.
- any email sending. Still no vendor, still not this slice's argument to have.

## Acceptance criteria

1. A student holding a valid token, signed in with a matching address, is linked to the case: `accepted_at` is
   stamped, `cases.student_user_id` is set to their account, and they can read the case afterwards. **Proven
   against real Supabase, not mocks.**
2. **Replay:** a second acceptance of the same token by a *different* account is refused, and the first
   acceptance is untouched. Two concurrent acceptances produce **exactly one winner** — assert the row count, not
   just the absence of an error.
3. **Expiry:** a token past `expires_at` is refused. **Revocation:** a token with `revoked_at` set is refused —
   including one revoked *after* being minted but *before* being accepted. **Mismatch:** per decision A.
4. Each of the four refusals is **distinguishable** in the test, and none of them reveals whether the token
   existed, whose case it was, or which consultancy minted it beyond what decision B permits.
5. **The student's personal case is untouched.** Assert it explicitly: same `id`, same `student_user_id`, same
   profile row, same document rows, before and after acceptance. This is the founder decision expressed as a
   test, and it is the one that stops a later author from "helpfully" merging.
6. **No data crosses.** The consultancy case's profile and documents are unchanged by acceptance — a student who
   completed the whole wizard brings nothing with them. Assert on both sides.
7. The plaintext token appears in **no** URL other than the student's own inbound link, in no redirect, in no
   audit event, in no log, and in no error response. Extend `tests/invitations/token-secrecy.test.ts` rather than
   starting a second secrecy suite.
8. `invitation.accepted` is written through `lib/audit/write-audit-event.ts` on success, with **no** student
   detail in metadata. A failed acceptance does not write a success event.
9. Any service-role use is registered in `lib/supabase/service-role-exceptions.ts` with its reason, and the
   guard test's count is updated deliberately rather than incidentally.
10. If a migration is taken for atomicity, it is **one** function and nothing else — no grant widening, no policy
    change. Diff `supabase/migrations` and the grant block and say what changed. If no migration is taken, the
    residual atomicity gap is recorded as a finding.

## Test plan

- **Integration, real Supabase** (`tests/integration/`): extend `tests/integration/fixtures/tenancy.ts` and the
  Stage 5 harness MV-193 built (`stage5-invitations.itest.ts`) rather than starting a third. Every denial gets a
  positive **CONTROL** beside it or it passes vacuously.
- **Mutation-test the compare-and-swap by dropping one predicate at a time.** This is the highest-value test in
  the slice and it is cheap: four mutants, each removing exactly one of `accepted_at is null`,
  `revoked_at is null`, `expires_at > now()`, and the hash match. **Each must kill a different named test.** If
  two mutants kill the same set, the four gate words are not independently covered and the gate is weaker than it
  reads.
- **Mutation-test every policy relied on**, in `supabase/rehearsal/MV-194-mutation.sql`, in the format
  `MV-193-mutation.sql` established. Mutants must **WIDEN** — a drop-mutant leaves every denial green because the
  actor is refused by the *absence of a grant*, not by the policy. Read the failing test **names**, not the
  counts. MV-193 measured a specific instance of this worth re-reading: **a SELECT policy can mask an UPDATE
  policy entirely**, because an UPDATE carrying a WHERE clause must SELECT first — so a single-layer mutant can
  survive at full green.
- **Race the acceptance.** Fire two concurrent accepts against one token and assert exactly one wins. The
  compare-and-swap is the only thing standing between this design and a double-link, and a sequential test cannot
  see it fail.
- **Route level** (`tests/api/`): a malformed token, an absent token, an unauthenticated visitor, and a
  signed-in visitor whose address does not match.

## Before you write a line

Read `MISTAKES.md` — the Supabase-grants, RLS-mutation, and Windows/CRLF sections at minimum. Beyond the
CRLF-vacuous-assertion trap already named above:

- **An INSERT grant cannot serve an `.upsert()`**, and an upsert's arbiter index must be FULL, not partial.
- **Some divergences are enforced by a TRIGGER, not by RLS** — check `pg_trigger` before concluding anything
  about what can be written.
- Integration tests **skip silently** without `SUPABASE_TEST_*`, and a skipped suite reads as a pass. Run them
  one file at a time on Windows, and **never from `.claude/worktrees/`** — `vitest.integration.config.ts`
  excludes `**/.claude/**`, so the run collects zero tests and looks green.
- The local Docker stack is long-lived and **accumulates residue**. MV-193 lost time to three integration
  failures that were leftover rows, not defects: suites asserting over whole-database contents break on it. Clear
  and re-run in isolation before blaming your branch — and check whether the failing file is even in your diff.

## What comes after (for sequence visibility, not to be built now)

- **Slice 3 — the two-case experience.** Now a UI question: what a student holding a personal case *and* a
  consultancy case sees on sign-in, and how they move between them. The product decision underneath it was taken
  on 2026-08-24 and is recorded at the top of this card.
- **Slice 4 — student-visible versus consultancy-only fields.** Stage 5's fourth bullet.
- **Slice 5 — the Stage 5 exit gate**, in the shape MV-191 established for Stage 4.

## Resume notes

- Branch `mv-194-stage5-invitation-accept`; card carved 2026-08-24 on the same branch that trues MV-193 to done.
- Gate before claiming done: `npm run typecheck`, `npm run lint`, `npm test`, and the integration suite. Quote
  **file and test counts plus a non-trivial duration** — a crashed vitest worker prints a clean summary having
  run nothing.
- Board ritual: set `col`/`entered` in `board.json` and run `npm run board` as the **first** commit, then build.
  A stale board is this project's top failure mode. Discard any regeneration warning of
  `⚠ PR data unavailable (HTTP 504)`.
- `npm run board` may warn that this card "is in inprogress but its PR is already merged" — the guard joins a
  card to a PR by the id in its title and cannot tell a **carve** PR from a **build** PR. Not a defect; it exits
  0.
- Master **is** production and auto-deploys. Merges are founder-gated: open the PR and stop.

## Build evidence (2026-08-24, branch `mv-194-stage5-invitation-accept-build`)

Built off `origin/mv-194-stage5-invitation-accept` at `45cccf9`, because PR #161 (the carve) was
still **open** — checked before branching. The plain name was taken by that PR, so the build
branch carries the `-build` suffix, the precedent MV-191 and MV-193 set.

### Gate

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **4110 passed / 4110**, 394 files, 75.4s |
| `npm run test:integration` | **1095 passed / 1095**, 21 files, 222.2s |
| `stage5-invitations.itest.ts` alone | **81 passed / 81**, 4.0s (52/52 on the base) |

Counts and durations are quoted because they are the check that matters. Base was 3989/390 and
1066 integration tests (MV-193's recorded numbers on `4652ff7`), so this slice is **+4 test
files, +121 tests, +29 integration tests** — 98 in the four new files (35 repo + 33 route + 16
copy + 14 page), plus 14 extending `token-secrecy` and 7 extending `redact-url`.

**No residue this time.** MV-193 hit three shared-stack failures and had to trace them; the full
integration run here was clean on the first attempt.

#### Correcting a claim this card and MV-193 both carry

Both say the integration lane collects **zero tests** when run from `.claude/worktrees/`, because
`vitest.integration.config.ts` excludes `**/.claude/**`. **Measured, and it is not true on this
vitest (4.1.8).** Both configs use the same exclude, and both collect normally from a worktree:
`npm test` ran 394 files here, and the integration lane reported `81 passed` in 4.02s against the
real database. The exclude is matched against paths RELATIVE to `root`, and `root` is the worktree
directory, so `.claude/` never appears in the string being tested. Every number above was produced
from `.claude/worktrees/sleepy-lederberg-3abb73`.

The underlying caution still stands and is worth keeping: an integration run **skips silently**
without `SUPABASE_TEST_*`, and a skipped suite reads as a pass. The distinguishing signal is
`81 skipped` versus `81 passed` plus a non-trivial duration — not the exit code.

### Criterion 10 — no migration was taken

- `git diff origin/master -- supabase/migrations` → **empty**
- `git diff origin/master -- supabase/config.toml` → **empty**
- `git diff origin/master -- supabase/` → **one file**, `supabase/rehearsal/MV-194-mutation.sql`,
  which is explicitly not a migration (`supabase/rehearsal/README.md`).
- Grant surface re-read live after the mutation run and byte-identical to before it:
  `cases` UPDATE = `(archived_at, display_name, email, operational_status)`, `invitations`
  UPDATE = `(revoked_at)`, `anon` holds nothing on either.

**The atomicity gap is therefore a finding, not a fix — see Findings 1.**

### The compare-and-swap, mutation-tested in CODE

The four gate words live in `lib/invitations/accept.ts`, not in a policy, so a SQL harness cannot
reach them. Six mutants, each **dropping exactly one predicate** from the swap and applied alone
against the real database. Clean schema: 81/81.

| mutant | tests that went RED |
|---|---|
| `drop_hash` | "MISMATCH (token): a token nothing minted is refused, and nothing is consumed" |
| `drop_role` | "MISMATCH (token): a TEAM invitation is not redeemable on the student path" |
| `drop_email` | "MISMATCH (address): decision A refuses, and does not burn the counsellor's typo"; "four states, four different reasons" |
| `drop_replay` | "FOUR CONCURRENT acceptances produce exactly ONE winner"; "a second click by the SAME student does not RE-STAMP accepted_at — decision C" |
| `drop_revocation` | "REVOCATION: revoked after minting, before acceptance, is refused"; "four states, four different reasons" |
| `drop_expiry` | "EXPIRY: a token past expires_at is refused, and is not burned" |

**Every mutant kills a set no other mutant kills**, which is what the card asked for: the four
gate words are independently covered, not collectively.

Two results are worth carrying forward.

1. **`drop_role` first ran as a SURVIVOR at 81/81, and the cause was a FIXTURE BUG, not a weak
   test.** The team-invitation row was seeded by a direct service-role insert with
   `email: actor.email` — raw. The product case-folds on write inside
   `normalizeInvitationEmail`, and the fixture actor addresses carry an upper-case letter
   (`mv153-studentA-…`), so the fixture produced a row the product could never create and the
   swap's `email` predicate refused it for the wrong reason. Traced by probing the same UPDATE
   directly through psql and then through PostgREST, which both matched — proving the statement
   was fine and the row was not. One `.toLowerCase()` later the mutant kills.
2. **`drop_replay` produced an inconclusive run that looked like a result**: `Tests 9 passed (81)`
   with `Worker exited unexpectedly` above it. A crashed vitest worker prints a clean-looking
   summary having run almost nothing. Re-run alone it killed two named tests. Read the file
   count and the duration, never the tick.

### The RLS / grant mutation run — `supabase/rehearsal/MV-194-mutation.sql`

Five mutants, all **widening** (for an ABSENCE the widening is an ADDITION — see the file's
header). `restore` was verified **byte-identical against `pg_policies` and
`role_column_grants` BEFORE any mutant was applied**, and again after the whole run. Full table
in the file. Three results worth carrying:

1. **`student_link_grant` is the most important mutant in the file** and kills four named tests.
   For a counsellor or an org admin the column grant is the **only** layer: `cases_update_accessor`
   admits them on the row, and `cases_write_surface_guard` — which looks like a second line of
   defence — guards `archived_at` and `operational_status` and says nothing about
   `student_user_id`.
2. **It does NOT kill "the LINKED student cannot re-point their own case at somebody else",** and
   that is the finding rather than a gap. With the grant planted, `cases_update_accessor`'s USING
   admits the linked student but its WITH CHECK is evaluated against the NEW row, where
   `student_user_id` is somebody else's — refused as a WITH CHECK violation, which is also a
   42501. That one boundary is two-layered; the other four are not. Only reading the failing
   **names** makes the difference visible.
3. **`anon_case_write` took three attempts, and each attempt was a finding.** Grant + policy
   alone: 81/81 survivor — the anon UPDATE never reaches RLS, dying as `42501 permission denied
   for schema private` because `cases_write_surface_guard` is SECURITY INVOKER in a schema `anon`
   cannot enter. Plus USAGE: still 81/81, now `permission denied for function is_org_admin`,
   because Postgres does not guarantee `AND` short-circuits so the helper is reached even on an
   UPDATE touching neither guarded column. Plus EXECUTE: red at last. **The anon write refusal on
   `cases` is over-determined four times over** — good news about the schema, and a caveat about
   what that single assertion can be said to prove.

### Decisions taken, and where each is written down

- **A — the address must match, and it rides IN the swap.** `.eq("email", address)` is a
  predicate of the same statement, so a wrong address can neither be raced past it nor **burn the
  token** — which is the whole point, since the failure decision A defends against is a counsellor
  sending the link to the wrong place. Normalisation is `normalizeInvitationEmail`, reused from
  the mint rather than re-implemented, so both ends of one comparison cannot drift: case-fold and
  trim, and **Gmail dots and `+tags` are deliberately NOT stripped** — address canonicalisation is
  a spoofing surface, not a convenience. Two tests pin the non-stripping.
- **B — a signed-out visitor is told nothing.** Not whether the invitation exists, not which
  consultancy sent it. An earlier draft read "the address your consultancy invited" and
  `tests/app/invite-page.test.tsx` refused it. The token is also withheld from the client
  component until a session exists.
- **C — a second click by the same student lands them in the case,** reported as
  `already-yours`, and the short-circuit lives **downstream of the swap**. Asked before it,
  "is this already yours?" would stop the already-accepted state ever reaching the
  `accepted_at is null` predicate, every mutant on it would survive, and the replay defence would
  look identical in the source while being enforced nowhere.
- **D — a taken case is refused, never overwritten,** and the refusal is the `is null` PREDICATE
  on the link write rather than a check around it. An eviction is unrecoverable: nothing records
  what the previous `student_user_id` was.
- **Order: swap → audit → link.** Swap-first is the card's position. Auditing BETWEEN the two
  writes is this slice's own decision: `invitation.accepted` records that the credential was
  consumed, which is true the instant the swap commits and stays true whatever the link does — so
  the one state the card worries about (a spent token with nobody linked) is recorded rather than
  invisible. D12 holds both ways: a failed audit is a 500 with the link never attempted, and no
  2xx without the audit row committed.
- **The sign-in hand-off: IN PLACE, and no cookie.** `EmailSignIn` gained an optional
  `onSignedIn` callback; the invite page passes it and calls `router.refresh()`, so the page never
  navigates, the token is passed as no `next`, reaches no auth endpoint, and enters no
  `emailRedirectTo`. **A cookie was the obvious alternative and is deliberately refused**: it
  would create a SECOND copy of a live bearer credential, on the same device, outliving the page
  that needed it. There is no round trip to survive. **Google sign-in is absent from this page on
  purpose** — OAuth needs a return URL and the only honest one is `/invite/<token>`, which would
  put the credential in a parameter handed to Google. The email path needs no return URL, and the
  email carries no link at all (see `EmailSignIn`'s header).
- **`invitation.accepted`, and no `invitation.accept_failed` sibling.** Every entry in
  `SERVICE_ROLE_EXCEPTIONS` claims exactly one action — `tests/audit/audit-metadata-pii.test.ts`
  pins that as a set equality — so a second action would need a second call site to claim it. The
  half-done state is covered by this row plus a case surface that already shows an accepted
  invitation and no linked student.

### Live verification (dev server, headers measured rather than reasoned)

The Browser pane could not display in this non-interactive session — `navigate` aborted, so there
is **no screenshot evidence**. Headers and served HTML were read directly from the running dev
server instead:

- `/invite/<token>` → `200`, `referrer-policy: no-referrer`, `x-robots-tag: noindex, nofollow`,
  `<meta name="robots" content="noindex, nofollow, nocache">`, **zero external subresources**.
- `/` → `200`, `referrer-policy: strict-origin-when-cross-origin` — unchanged.
- `POST /api/invitations/accept` unauthenticated → `401`, no `Location`, body echoes no token.
- Signed-out page text reads exactly: *"Sign in to continue / Sign in with the email address this
  link was sent to, and we'll take it from there."*

Next **replaces** `Referrer-Policy` rather than appending, so the later, stricter rule wins
outright — better than the spec-based reasoning the config comment originally carried, and now
recorded as a measurement.

### Findings

1. **THE RESIDUAL ATOMICITY GAP, recorded as the card requires.** No migration was taken, so
   acceptance is still two statements. Reachable failure window: the swap commits, then the link
   fails from a genuine race or a database outage, leaving a spent token and an unlinked student.
   It is **loud** — 409 or 500 with a message that says plainly the link has been used and not to
   retry — and **recorded**, by the `invitation.accepted` row written between the two writes, plus
   a case surface showing an accepted invitation with no linked student. The migration was
   declined because it creates a deploy-order dependency whose failure mode is "the entire student
   acceptance flow 404s in production until someone remembers to apply it", against a documented
   history of exactly that ledger drift — and `private.*` is not PostgREST-reachable (MV-189), so
   the function would have to live in `public` with EXECUTE granted to `service_role`. If a later
   slice wants it: **one** `security definer` function doing both writes and returning the
   outcome, and nothing else.
2. **A REAL PostHog LEAK, found and closed.** `/invite/<token>` puts a live bearer credential in
   `$current_url`, and `redactSearchParams` could not reach it — it cleans query parameters, and
   the token is a path segment. A student clicking their link would have shipped a working
   invitation to a third party, which is the defect `token_hash` exists to prevent, one layer up.
   Closed by `redactPathSecrets`. Redaction rather than suppressing analytics on the route,
   because `$referrer` and `$session_entry_url` carry the invite URL to every LATER page of the
   session — suppressing init on `/invite` would have leaked it from the dashboard instead.
3. **A REAL client/server boundary violation, caught by the guard.** The outcome vocabulary was
   first declared in `accept.ts` (`server-only`) and imported as a TYPE by the client-safe message
   module. `tests/architecture/client-server-boundary.test.ts` refused the edge — it walks the
   import graph rather than trusting `import type` to be erased, which is right, because that
   distinction dies to one careless edit. The direction is inverted: the names now live in
   `accept-messages.ts` and `accept.ts` imports them.
4. **An overclaim in this slice's own comment, corrected after measuring.** The page header said
   withholding the token from the client component kept it out of the RSC payload. It does not:
   the served HTML carries it twice inside Next's own router state (the path segments and the
   `[token]` param), and no page code puts it there or can remove it. Not a disclosure — a cache
   can only hold that document under a URL that already contains the credential — but the comment
   now says what is true, and the withholding is justified on the ground that actually holds
   (keeping the credential out of surfaces a future edit could widen).
5. **`Cache-Control: no-store` was tried, served, and does not take.** Next writes its own
   `Cache-Control` for a page route and overwrites `next.config.ts`, so `/invite/<token>` ships
   `no-cache, must-revalidate` whatever the config says. The line was **removed rather than left
   in place looking effective**, and a test now pins its ABSENCE so nobody re-adds it and believes
   it did something. On inspection the weaker header is sufficient: the URL is the secret, so a
   cache hit requires already holding it.
6. **A rate limit was added that the card did not ask for** — `invitation-accept`, 10/min, keyed
   per ACCOUNT and applied after the 401. Not a guessing defence (256 bits closes that
   arithmetically); it bounds an authenticated caller hammering an endpoint that costs two
   service-role statements per attempt.
7. **Guard counts moved, deliberately.** `SERVICE_ROLE_EXCEPTIONS` gains one entry, so the audited
   path count moves 7 → 8 in both guard suites. The metadata allow-list is **unchanged** —
   `invitation.accepted` carries no metadata at all, because the invited address is raw student
   detail and `entity_id` already names the row, the same reasoning MV-193 gave for its two
   events. The thirteen `null` entries stay thirteen.
8. **A new service-role SHAPE, admitted rather than hidden.** MV-193's two entries reach for
   service-role to write `audit_events` only. This one is the first where service-role performs
   the tenant-table writes themselves, and the registry entry says so in detail: three
   RLS-bypassing statements, each named, plus why every one of them is structural rather than a
   deferred grant.
9. **A brand-new invitee ends up holding two cases immediately,** and that is the founder decision
   working. `resolveSignInDestination` creates a personal case for every account at sign-in, so a
   student invited by a consultancy who has never used the self-serve product signs in, gets a
   personal case, and is then linked to the consultancy's. Nothing crosses between them. The
   confirmation copy is written for exactly this reader.
10. **Test-plan item not taken: `tests/integration/fixtures/tenancy.ts` was not extended.** The
    card offered it; the harness already had every shape the slice needed (`unclaimedA` is an org
    case with a null `student_user_id` and an assigned counsellor, `personalA` is the student's
    own). What was added lives in the itest: a `clearLinks()` beside `clearInvitations()`, and one
    `createStudentDataSeeder` call so "no data crosses" is asserted over real profile and document
    rows rather than over two empty sets.
