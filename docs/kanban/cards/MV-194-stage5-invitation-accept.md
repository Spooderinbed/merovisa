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
