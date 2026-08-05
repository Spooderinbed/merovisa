# MV-163 — Enumerate the client-writable INSERT columns on the four Stage 1 tenancy tables, and extend the column-axis guard to cover them

**Priority:** P2   **Owner:** agent
**Goal:** Do for `cases`, `case_assignments`, `invitations` and `organization_memberships` what MV-161 did for the five case INSERT surfaces: enumerate **every** column a client may write on INSERT, bound each hostile axis in the policy or record it exempt-with-reason, and extend MV-161's column-axis completeness guard so that these four tables are covered by CI — so an unbounded, unexempted client-writable column on a tenancy table can never again be both **unbounded and unnoticed**.

## Context links

- **Where this came from — an incidental finding, not a new audit.** MV-161's enumeration pass (`docs/kanban/cards/MV-161-unbounded-insert-columns.md`, §"Not done here, deliberately") records: *"The four Stage 1 tenancy tables … show the same class of question on their own INSERT surfaces — the enumeration query surfaced them incidentally. Out of this card's scope (it is scoped to the five case INSERT surfaces) and **not** covered by the new guard. Worth its own card."* This card is that card. It inherits a **mechanism that already exists and is proven**; it does not inherit a measured breach.
- **The guard to extend, and the thing that makes this card cheap:** `tests/integration/student-data-rls.itest.ts` — the test `"bounds or explicitly exempts every CLIENT-WRITABLE column on all five INSERT surfaces"` (≈line 1453), its scope constant `INSERT_SURFACES` (≈line 184), and its `CLIENT_WRITABLE_EXEMPTIONS` registry (≈line 129). **Read the guard before designing anything** — the design decision that makes it work is that **both sides are derived at run time**: the columns come from `information_schema.column_privileges` (`grantee = 'authenticated'`, `privilege_type = 'INSERT'`) and the clauses from `pg_policy` (`polcmd = 'a'`). Nothing is a hand-written list of what the schema is believed to hold; the only hand-written thing is the exemption list, and a **stale** exemption fails as loudly as a missing bound, so the registry cannot rot into a rubber stamp.
- **The four ways that guard fails, all of which this card must inherit rather than re-invent:** (1) an unaccounted column — client-writable and mentioned by no policy clause and no exemption; (2) a stale exemption — an entry that no longer describes reality; (3) a placeholder reason — an exemption whose reason is empty (this one actually fired during MV-161's build); (4) a positive assertion that the **ownership axes stay on the bound side**, so a failure can never be "fixed" by exempting the column that carries authorization.
- **The tables and where they come from:** all four are created, with their initial RLS, in `supabase/migrations/20260730120000_stage1_tenancy_core.sql` (MV-150). Their policies are then rewritten by `supabase/migrations/20260730180000_case_aware_rls_policies.sql` (MV-152), and `cases` is touched again by `supabase/migrations/20260802120000_stage2_case_id_and_personal_cases.sql` (MV-155, personal cases). **Read `pg_policy` at run time, not these three files** — that is the same instruction MV-161 followed and the reason its enumeration found columns no dossier had listed.
- **The access-control expectations these tables already carry, which this card must not move:** `docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md` is authoritative for every cell; `tests/integration/case-rls.itest.ts` (MV-152) and `tests/integration/tenant-isolation.itest.ts` (MV-153) are the suites that pin them. **Bounding a column is a tightening of a WITH CHECK, and it must not change a matrix cell.** If a matrix expectation has to be edited to keep a suite green, this card has changed authorization behaviour and is wrong — reconcile against the spec, never update the expectation.
- **Evidence-rigor precedent:** `docs/kanban/cards/MV-153-cross-tenant-negative-tests.md` (two load-bearing claims that overstated what an artifact proved) and MV-161 itself, whose finding was that a **denial-only** probe set cannot see a column no probe had a reason to aim at. Every claim on this card must be backed by something that goes red when the claim stops being true.
- **Siblings:** MV-161 (the five case INSERT surfaces — the mechanism), MV-150 (tenancy core schema), MV-152 (case-aware RLS), MV-153 (cross-tenant negative tests), MV-159 (case-aware student-data RLS).

## Acceptance criteria

### A — The enumeration is complete and derived, not asserted
- [ ] **Every client-writable INSERT column on all four tables is enumerated from the catalog**, by the same query shape MV-161 used (`information_schema.column_privileges` × `pg_policy` with `polcmd = 'a'`), and the enumeration is **recorded in the card's Done evidence as a table**: table · column · bounded-or-exempt · the clause or the reason. A count alone is not the evidence; MV-161's finding was a specific column, not a number.
- [ ] **Non-vacuity is asserted first.** If the catalogue query returns nothing, or if any of the four tables contributes zero columns, the test **fails as a harness defect** rather than passing silently. This is not hypothetical: MV-161 records that `readGrantedWriteSurface` once read INSERT from the wrong catalogue and five tables reported "no grant" while holding one.
- [ ] **A table with no INSERT grant to `authenticated` is recorded as such, explicitly, and is not silently absent.** Some of these four may legitimately have no client INSERT path at all (`case_assignments` and `organization_memberships` are plausible candidates — staff-managed, possibly service-role or SECURITY DEFINER only). "No grant" is a **finding to state**, not an empty result to skip over, because a later grant added by Stage 3 would otherwise land uncovered.

### B — Each hostile axis is bounded, or exempt with a reason that is about the verb
- [ ] **Every enumerated column is either named by its INSERT policy clause or carries an exemption with a real reason.** The reason must explain *why free is safe*, in terms of what a hostile value actually buys — the standard MV-161 set (e.g. *"client-chosen PK; a collision is 23505 and there is no UPDATE path to overwrite through"*), not *"not used by the client"*, which is a statement about today's callers and not about the grant.
- [ ] **The ownership / tenancy axes are bounded, never exempted** — on these tables that means at minimum `organization_id` and whatever column carries the actor-to-tenant link on each table (`user_id` / `student_user_id` / `invited_email` as applicable, read from the schema). Asserted **positively**, the way MV-161 asserts `case_id` and `owner` stay on the bound side, so a red guard cannot be greened by exempting the column that carries authorization.
- [ ] **Any pointer or FK column that names another row is treated as MV-161 treated `supersedes_prediction_id` / `supersedes_event_id`:** a client-writable pointer whose target the actor cannot reach is the exact shape MV-161 measured as a live P0. Each such column on these four tables is either bounded to the actor's own tenancy or exempted with a reason that explains why a cross-tenant pointer is harmless there.
- [ ] **If the enumeration finds a live hostile column, it is fixed in this card and the card is re-triaged upward** — see Risk notes. A found breach is not deferred to a follow-up; MV-161's precedent is that the fix and the enumeration ship together.

### C — The guard covers these four tables in CI
- [ ] **The column-axis completeness guard is EXTENDED to cover the four tenancy tables, and an unbounded/unexempted column on any of them FAILS CI.** This is the criterion the card exists for; an enumeration recorded only in a document is exactly what MV-161 refused to ship.
- [ ] **The guard is SHARED, not copy-pasted.** Extract MV-161's guard body into a helper both callers use (scope constant + exemption registry passed in), so the two families cannot drift. A second hand-maintained copy of a completeness guard is a guard that is complete for one family and stale for the other — and the failure is silent on whichever copy was not updated. **If extraction turns out to be genuinely costly, state why in the Decision log and get it reviewed; do not silently duplicate.**
- [ ] **The tenancy guard lives with the tenancy suites**, i.e. it runs against the tables `case-rls.itest.ts` / `tenant-isolation.itest.ts` already cover, and it gets a `✓ <path>` CI guard like every other integration suite. A suite that skips is a red run, not a green one.
- [ ] **Both failure directions are tested** — a new unaccounted column fails, and a stale exemption fails. Proven by mutation, not by reading the code.

## Test plan

- **Extend / add the integration suite** (real DB, local stack). Catalog assertions via the `psql`-in-`supabase_db_*` idiom that `tenancy-schema.itest.ts` established (`information_schema` and `pg_catalog` are not PostgREST-exposed):
  - the enumeration query returns a non-empty set and every one of the four tables is represented (or is explicitly recorded as holding no `authenticated` INSERT grant);
  - every client-writable column is bounded or exempt-with-reason;
  - no exemption is stale; no reason is a placeholder;
  - the tenancy/ownership axes are positively asserted **bounded**.
- **Behavioural probes for anything newly bounded.** A structural bound that nothing exercises is the MV-153 tautology. For each column this card newly bounds, seed the hostile shape as an RLS-scoped client and assert it is **refused by the POLICY** — `42501`, distinguished from an FK's `23503`, which is the distinction MV-161 had to make explicit for `supersedes_*` — and assert the **legitimate** shape is still ADMITTED, so the bound is not a blanket refusal that closes a real path.
- **Mutation evidence — the assertions must be shown to bite** (the MV-153/MV-161 standard; a table of these belongs in Done evidence):
  - **N1** grant `authenticated` INSERT on one currently-ungranted column of one of the four tables → the guard goes red and **names that column**.
  - **N2** delete one exemption entry → the guard goes red as an *unaccounted* column (proves the registry is read).
  - **N3** add an exemption for a column that is already bounded → the guard goes red as a *stale* exemption (proves the second direction, the one a rubber-stamp list would pass).
  - **N4** blank one exemption's reason → the guard goes red on the placeholder check.
  - **N5** exempt a tenancy/ownership axis → the guard goes red on the positive assertion, proving the escape hatch is closed.
  - **N6** (only if this card bounds anything) revert one new conjunct → the behavioural probe goes red reading *admitted* rather than merely uncaught.
- **Regression:** `npm test` in full plus `npm run test:integration`; `case-rls.itest.ts` and `tenant-isolation.itest.ts` must pass **with no edits** (`git diff --stat` shows zero changes to them). Needing to edit one means a matrix cell moved.

## Integration gate

- `npm run typecheck` · `npm run lint` · `npm test` · **`npm run test:integration`** (mandatory — this card's value is real-DB catalog and policy behaviour; it is not "done" on `npm test` alone).
- Locally: `npx supabase start`, then export `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `SUPABASE_TEST_ANON_KEY` from `npx supabase status -o env`.
- Master is protected: required checks `integration` and `validate`, strict/up-to-date, PR required, no bypass. **Applying anything to the hosted project is founder-gated.**
- **Harness notes inherited from MV-161, both of which cost that card time:** a mid-run vitest worker crash on Windows skips `afterAll`, and the orphaned fixture rows then fail `private.mv155_assert_case_backfill()` in a *later, unrelated* suite; and `npm run test:integration | tail` reports **`tail`'s** exit code, so redirect to a file and read `$?` rather than trusting a piped "green".

## Dependencies / blocked-by

- **MV-161 must be merged first** — this card extends the guard MV-161 introduces (`tests/integration/student-data-rls.itest.ts`). Starting before it lands means extracting a helper out of a file that is still moving. MV-161 is PR #123 at carve time.
- **Coordinate with MV-152 and MV-153**, which own the RLS and the negative-test coverage on exactly these four tables. Any bound this card adds is a change to a policy those suites assert against; the matrix spec is authoritative and neither suite's expectations may be edited to accommodate this card.
- **Not blocked by Stage 2.** These are Stage 1 tenancy tables; MV-160's tightening does not touch them. But if MV-160 has landed, re-read `pg_policy` rather than assuming the policy text a Stage 2 card quoted.
- Requires a local Supabase stack (Docker). No production apply.

## Risk notes

- **The triage is P2 *because nothing live has been measured*, and that is a claim with an expiry date.** MV-161 was P0 because a specific column (`supersedes_prediction_id`) was measured **admitting** a plant that then **locked the victim's account deletion** (`P0001`). No equivalent live lock has been measured on these four tables — the finding is *structural symmetry*, not a reproduced breach. **The first action of this card is the enumeration, and if it surfaces a column that is actually hostile — a cross-tenant pointer, an unbounded `organization_id`, a role/status column that escalates a membership — this card is re-triaged to P0/P1 immediately and the fix ships with the enumeration.** Do not let a P2 label slow down a breach the enumeration finds; the label was assigned before anyone looked.
- **These tables are the tenancy boundary itself, so a bad bound is worse here than on student data.** An over-tight WITH CHECK on `organization_memberships` or `invitations` can break staff onboarding or invitation acceptance outright — paths with fewer tests behind them than the student journey. Every new bound needs the ADMITTED control alongside the REFUSED probe, or the card ships a lockout.
- **`invitations` deserves specific suspicion.** It is the one table whose INSERT is plausibly reachable by a lower-privileged actor and whose columns (invited email, role, organization, token/expiry) map directly onto privilege escalation: an unbounded role column on an invitation is an admin-grant primitive. Enumerate it first.
- **The "no INSERT grant" answer is the one most likely to be recorded wrongly.** If a table has no `authenticated` INSERT grant today, the honest guard records that fact and fails when a grant appears. A guard that simply finds nothing to check for that table is indistinguishable from a guard that is not running — which is the MV-161 lesson restated.
- **A copy-pasted guard is the predictable failure of this card.** Extending by duplication passes review, passes CI, and silently stops covering whichever family the next author forgets. The shared-helper criterion is not style.

## Agent resume notes (for a cold start)

1. **Check MV-161 has merged** (`git log --oneline origin/master | head -20`, look for the `20260805120000_bound_insert_pointer_columns.sql` migration and the guard in `student-data-rls.itest.ts`). If it has not, stop — extract nothing from a file still under review.
2. **Read the existing guard first**, in this order: `tests/integration/student-data-rls.itest.ts` around `INSERT_SURFACES` (≈184), `CLIENT_WRITABLE_EXEMPTIONS` (≈129), and the guard test (≈1453). Then MV-161's card, §"Not done here, deliberately" (≈line 170) for the finding that spawned this one.
3. **Bring up the stack and run the enumeration query FIRST, before writing any test or any SQL** — scoped to `cases`, `case_assignments`, `invitations`, `organization_memberships`. Paste the raw result into the card. The whole card is a reaction to what that query returns, and every downstream decision (P2 or not, bound or exempt, one table or four) depends on it.
4. **Triage what it returns before building.** A hostile column → fix it in this card and re-triage. Only structural gaps → proceed as P2, extend the guard, exempt with reasons.
5. Extract the guard into a shared helper, extend it over the four tables, then run the mutation table N1–N6.
6. Run the full gate, record the enumeration table and the mutation table as Done evidence, move the card to In Review, regenerate the board, open a PR. **Do not merge — founder-gated.**

## Decision log

- 2026-08-05 — **Carved from MV-161's enumeration pass (agent session, during MV-160).** MV-161's column-axis guard is deliberately scoped to the five case INSERT surfaces; its query incidentally showed the same class of unbounded client-writable INSERT columns on the four Stage 1 tenancy tables, which the new guard does **not** cover. Recorded on MV-161 as out-of-scope and "worth its own card" rather than scope-crept into it — the same de-scoping discipline MV-145 came from.
- 2026-08-05 — **Triaged P2, explicitly and provisionally.** MV-161 earned P0 by *measuring* a live account-delete lock; this card has a structural symmetry argument and no reproduced breach. Rather than inherit MV-161's urgency by association, it is triaged P2 **with the enumeration as its first action and an explicit instruction to re-triage upward if the enumeration finds a live hostile column.** The alternative — carrying it as P0 on suspicion — would have competed with measured work on the strength of an untested hypothesis.
- 2026-08-05 — **The deliverable is a GUARD, not a document.** MV-161's central lesson is that its finding was not a missing probe but a column no probe had a reason to aim at, because nobody had listed the columns. An enumeration written into a dossier decays the moment a migration adds a column; only a test that derives both sides from the catalog at run time keeps the property true. So this card's acceptance is "CI fails on an unbounded column", not "the columns are enumerated".

## Done evidence

(pending)
