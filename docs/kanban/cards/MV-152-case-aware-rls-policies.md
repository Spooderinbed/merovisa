# MV-152 — Case-aware RLS policies — replace deny-all with role-aware tenant isolation

**Priority:** P1   **Owner:** agent
**Goal:** Tenant isolation is enforced at the database layer — an authenticated user can read and change exactly the organization cases and case data their *active* role permits, so a bug in the server boundary (MV-151) is never sufficient to cross a tenant. RLS evaluated as the authenticated user is the load-bearing layer.

## Context links
- Enforcement boundary + helper strategy (the doctrine this card implements): plan §"Authorization and tenant isolation" → "Enforcement boundary", `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md` lines 331–345 (RLS as the authenticated user is load-bearing; use a small set of `SECURITY DEFINER`, `STABLE` helpers with pinned `search_path` so policies stay non-recursive; index the columns those helpers read).
- RLS layer requirements: same plan, §"Enforcement layers" item 2, lines 368–374 (enable + force RLS; scope to authenticated; USING **and** WITH CHECK on updates; explicit grant review; security-invoker views; index membership/assignment/org/case/student-link columns).
- Authorization rules (the matrix these policies encode): same plan, lines 347–356 (owner/admin full org; counsellor assigned-only; student linked-case-only; inactive membership = no access; knowing an id grants nothing; service-role never in the browser).
- Append-only audit as a DB property: same plan, §"Activity history and security audit", lines 502–504 (no client role holds UPDATE/DELETE on the audit table; security audit visible to org admins only).
- Negative catalogue this card must make passable (owned by MV-153): same plan, §"Required negative security tests", lines 394–405.
- Controller model (who sees what): `docs/legal/2026-07-29-stage0-decision-record.md` §D-A (Option B layered — case-layer data is the consultancy's; the student sees their own linked case).
- RLS idioms to mirror exactly: `supabase/migrations/20260620000000_add_outcome_validation.sql` (`enable`+`force` RLS, `(select auth.uid())` scalar-subselect, `revoke all … from anon, authenticated` + explicit `grant`, WITH CHECK that re-asserts parent ownership); `supabase/migrations/20260618120000_harden_advisors.sql` (pinned `set search_path = ''`, the `auth_rls_initplan` per-row→per-statement fix, and the deliberate "leads: RLS on, no policy" advisor note).
- `private` schema already exists (created in `supabase/migrations/20260603170655_add_profiles_evolve_assessments.sql`) with the `private.set_updated_at` / `private.reject_prediction_update` convention — helpers belong there.
- Sibling cards: **MV-150** (ships the six tables, their deny-all default policies, the append-only audit mechanism, and the indexes these predicates read — this card drops+replaces the deny-all); **MV-151** (the lib role→permission matrix that must match these predicates); **MV-153** (the negative-test harness / stage exit gate that consumes these policies).

## Acceptance criteria
- [x] MV-150's deny-all default policies are **dropped and replaced** on all six tenancy tables (`organizations`, `organization_memberships`, `cases`, `case_assignments`, `invitations`, `audit_events`); `enable` + `force` RLS remains true on every one after the swap (no table silently loses forced RLS).
- [x] Every membership/assignment/case lookup inside a policy runs through a `private` **SECURITY DEFINER STABLE** helper with `set search_path = ''` (e.g. `private.org_role(uuid)`, `private.is_org_admin(uuid)`, `private.can_access_case(uuid)`). **No policy predicate contains an inline subquery against the same or a peer tenancy table it protects** (anti-recursion).
- [x] Every helper filters `organization_memberships.status = 'active'`: an inactive/revoked membership yields no role and no access. Observable — flip a membership to inactive and the same authenticated client's next SELECT on that org's cases returns zero rows, no re-login.
- [x] The positive matrix holds at the DB layer **evaluated as the authenticated user (not service-role)**: org owner/admin can SELECT+UPDATE+DELETE every case in their org; a counsellor can SELECT+UPDATE only cases present in `case_assignments` for them; a student can SELECT only the case whose `student_user_id` = their uid; anon sees nothing on any table.
- [x] Every UPDATE policy carries **both** `using` and `with check`, and the `with check` forbids a row escaping its tenant: an admin cannot UPDATE a case to set `organization_id` to an org they do not administer, nor repoint `student_user_id` — the statement is rejected, not silently no-op'd.
- [x] Grants are reviewed and minimal: `revoke all … from anon, authenticated` then `grant` only the required verbs to `authenticated`; anon holds nothing on any of the six tables. `grant usage on schema private` + `grant execute` on each helper to `authenticated` only (never anon/public), and the helpers remain unreachable as PostgREST RPC (they live in the unexposed `private` schema).
- [x] `audit_events` keeps MV-150's **append-only shape**: MV-152 adds only a SELECT policy scoped to org owner/admin; it introduces **no** UPDATE/DELETE policy and grants no UPDATE/DELETE to authenticated; INSERT stays the MV-150 controlled-writer path.
- [x] `invitations.token_hash` is never selectable by a non-admin, and client-side acceptance UPDATE stays closed (acceptance is the service-role/definer compare-and-swap per the enforcement boundary, Stage 5) — Stage 1 invitation policies cover org-admin create / list / revoke only.
- [x] `get_advisors` (security **and** performance) reports zero new findings for these objects: no `rls_disabled_in_public`, no `rls_enabled_no_policy`, no `function_search_path_mutable` on the helpers, no `auth_rls_initplan` regression. — *Met, but by catalog SQL running each advisor rule directly against the migrated local stack, because the Supabase MCP is unauthenticated in this session. `get_advisors` itself must be re-run against the hosted project once the integrator applies the migration.*
- [x] Regenerated `lib/supabase/types.ts` is byte-unchanged by this card (policies + `private` functions do not alter `Database` table types) — a drift check confirms no accidental shape change rode along.

## Test plan
- Extend the real-DB `*.itest.ts` harness (pattern + hard localhost guard from `tests/integration/anon-purge.itest.ts`) into a new `tests/integration/case-rls.itest.ts`. MV-152 ships a **focused policy smoke** proving each table's core allow/deny **as the authenticated user** — mint users, sign in to obtain an authenticated client (NOT the service-role client, which bypasses RLS), then assert SELECT/UPDATE/DELETE outcomes. The exhaustive negative catalogue + full positive matrix that *are* the stage exit gate belong to MV-153; MV-152 proves its own policies function so MV-153 builds on green.
- **Anti-recursion proof:** a SELECT on `organization_memberships` as an active member returns co-members without raising `infinite recursion detected in policy for relation "organization_memberships"` — the exact failure if a helper is missing or not SECURITY DEFINER.
- **Inactive-membership proof:** seed an active membership, confirm case visibility, flip `status` to inactive, confirm the same authenticated client now sees zero rows on the next query with no session refresh.
- **WITH CHECK proof:** as an org admin, attempt `update cases set organization_id = <other org>` and `set student_user_id = <someone else>` → both rejected by the policy; a legitimate in-tenant field UPDATE succeeds.
- **EXPLAIN check (perf requirement):** `EXPLAIN (ANALYZE, BUFFERS)` on the representative authenticated-user SELECT (list cases in an org) shows Index Scan / Index Only Scan on the MV-150 indexes for the membership/assignment/case lookups — **no Seq Scan** on `organization_memberships`, `case_assignments`, or `cases` — and the helper predicate is wrapped in a scalar subselect (`(select private.can_access_case(id))`) so it evaluates **once per statement** (initplan), not once per row, extending the `(select auth.uid())` fix in `harden_advisors.sql`. Capture the plan as evidence in the PR.
- **Advisor pass:** run Supabase security + performance advisors (Supabase MCP `get_advisors`; if MCP is unauthenticated, the dashboard Advisors page or the CLI) and record zero new findings for these objects.
- `npm test` stays green (no unit regressions); `npm run test:integration` green against a local stack.

## Integration gate
- `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:integration`
- `test:integration` is **mandatory** here: this card produces real-DB authorization behavior, and mocked clients structurally cannot exercise RLS, definer helpers, or WITH CHECK rejection.

## Dependencies / blocked-by
- **Blocked by MV-150** — the six tables, their deny-all default policies (this card drops + replaces them), the append-only audit mechanism, and the index on every column these predicates read must exist first. Missing indexes make the EXPLAIN check fail.
- **Coordinates with MV-151** — the lib role→permission matrix (owner/admin/counsellor assigned-only/student linked-only) must be *identical* to these SQL predicates: the two layers are the same policy expressed twice (defense in depth, RLS load-bearing). Divergence is a bug in whichever lands second; cross-check role names and assigned/linked semantics.
- **Consumed by MV-153** — its negative-test harness exercises these exact policies as the stage exit gate; MV-152 must be green before MV-153 can pass.
- No app code, no UI, no migration beyond the one policy/function migration; the six base tables and their FK/predicate indexes are MV-150's, but this migration MAY add any partial/covering index MV-152's final helper predicates require (per MV-150's index-tuning handoff) — owner-column and backfill changes remain Stage 2.

## Risk notes
- **THE RECURSION LANDMINE (read before writing any policy).** A policy on `organization_memberships` whose predicate selects from `organization_memberships` recurses infinitely and Postgres aborts the query. The whole reason the helpers are SECURITY DEFINER is that they run with owner rights and bypass RLS on the tables they read, breaking the loop. Every membership/assignment/case lookup inside a policy MUST go through a helper — never an inline subquery against a self-referential or peer tenancy table. Plan line 345 mandates exactly this.
- **SECURITY DEFINER is a loaded gun.** These functions see ALL rows. They must (a) pin `set search_path = ''` and fully-qualify every object (defeats search_path hijacking — the same `function_search_path_mutable` advisor `harden_advisors.sql` fixed); (b) take only the id under check and derive the actor from `auth.uid()` internally — **never** trust a caller-passed user id as the actor; (c) be STABLE and side-effect-free. A definer helper that trusts an argument as the actor is a tenant-crossing hole.
- **USING without WITH CHECK is a silent write hole.** An UPDATE policy with only USING lets a permitted row be mutated *into* a tenant-escaping state (e.g. reassigning `organization_id`). Both clauses on every UPDATE, always (plan line 372).
- **Test as the authenticated user, never service-role.** Service-role bypasses RLS entirely, so a green service-role test proves nothing about tenant isolation. Per the enforcement boundary (plan lines 337–344), a bug in MV-151's lib layer must not be sufficient to cross a tenant — which only holds if these policies are correct standing alone.
- **Grants on `private` helpers.** authenticated needs USAGE on schema `private` + EXECUTE on each helper for policy predicates to evaluate; safe **only** because `private` is not a PostgREST-exposed schema (no RPC surface). Verify no migration ever exposes `private`, or the definer helpers become directly callable by clients.
- **audit_events append-only must survive the swap.** While "doing all six tables" it is tempting to add a full CRUD policy set; do NOT add UPDATE/DELETE to `audit_events`. Append-only is a DB property (plan line 504) and MV-150 revoked those verbs — MV-152 only narrows SELECT to org admins.
- **Scope boundary — no note-level visibility here.** The student-visible-vs-consultancy-only field/note split is Stage 5, not table RLS. MV-152 gates access to *rows*, not the internal-note visibility classification; do not try to encode note visibility in these policies.

## Agent resume notes (for a cold start)
- First concrete action: read plan §"Authorization and tenant isolation" (`docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`, lines 331–406) and MV-150's shipped migration + card (`supabase/migrations/*` for the six tables and their deny-all/indexes, and `docs/kanban/cards/MV-150-*.md`). Confirm exact table/column names and that an index exists on **every** column your predicates will read.
- Then study the two idiom migrations you must mirror: `supabase/migrations/20260620000000_add_outcome_validation.sql` (enable+force RLS, `(select auth.uid())` subselect, `revoke all … from anon, authenticated` + explicit `grant`, WITH CHECK re-asserting parent ownership) and `supabase/migrations/20260618120000_harden_advisors.sql` (pinned `set search_path = ''`, the `auth_rls_initplan` per-row→per-statement fix, the leads "RLS on, no policy" precedent). The `private` schema already exists (from `20260603170655_add_profiles_evolve_assessments.sql`).
- Write ONE new migration `supabase/migrations/<timestamp>_case_aware_rls_policies.sql` (timestamp sorted AFTER all MV-150 migrations): (1) create `private.org_role(uuid)`, `private.is_org_admin(uuid)`, `private.can_access_case(uuid)` as `security definer stable set search_path = ''`, granting execute to authenticated; (2) drop MV-150's deny-all policies per table; (3) create the real per-table policies with USING + WITH CHECK, wrapping helper calls in scalar subselects; (4) re-review grants.
- Per-table target (derive precise columns from MV-150): `organizations` — members read, admins update (USING+WITH CHECK), owner deletes; `organization_memberships` — members read co-members via helper (recursion hotspot), admins manage; `cases` — `can_access_case` for SELECT/UPDATE, admins create/delete, personal case keyed on `student_user_id = auth.uid()` with null org; `case_assignments` — admins manage, case-accessors read; `invitations` — admins only, `token_hash` never exposed, acceptance UPDATE stays closed; `audit_events` — org-admin SELECT only, no UPDATE/DELETE.
- TDD: write the failing `tests/integration/case-rls.itest.ts` first (reuse the anon-purge harness shape + hard localhost guard) — sign IN as each role to get an authenticated client, assert allow/deny — then make it pass.
- Commands (PowerShell): `npx supabase start`; `npx supabase db reset` (applies all migrations locally); capture env via `npx supabase status -o env` → set `$env:SUPABASE_TEST_URL`, `$env:SUPABASE_TEST_SERVICE_ROLE_KEY` (plus the anon key / a way to mint per-role authenticated JWTs); `npm run test:integration`; run `EXPLAIN (ANALYZE, BUFFERS)` via the Studio SQL editor or psql; then `npm run typecheck; npm run lint; npm test`; regenerate types `npx supabase gen types typescript --local > lib/supabase/types.ts` and confirm no diff.
- Never point the harness at a non-local database — its hard guard refuses non-localhost URLs; keep that guard.

## Decision log
- 2026-07-30 — Card carved from Stage 1 of the revised consultancy plan (integrator session).
- 2026-07-30 — Helper strategy fixed to `private` SECURITY DEFINER STABLE with `set search_path = ''`, matching the repo's existing `private.set_updated_at` / `private.reject_prediction_update` convention; this is the anti-recursion mechanism the plan mandates (line 345), not a stylistic choice.
- 2026-07-30 — Scope seam with MV-153: MV-152 ships a focused policy smoke (proves its own allow/deny + EXPLAIN + advisors clean); the exhaustive negative catalogue and full positive matrix that ARE the stage exit gate belong to MV-153, which must run against a green MV-152.
- 2026-07-30 — audit_events adds only an org-admin SELECT policy; UPDATE/DELETE stay absent to preserve MV-150's append-only property — deliberately not re-litigated while "doing all six tables."
- 2026-07-30 — Grants: authenticated gets USAGE on `private` + EXECUTE on the helpers; judged safe because `private` is not PostgREST-exposed (no RPC surface), so no client can invoke the definer helpers directly. anon gets nothing on tables or functions.
- 2026-07-30 — Helper calls wrapped in scalar subselects in policy bodies (`(select private.can_access_case(id))`) to force once-per-statement evaluation, extending the `harden_advisors` `auth_rls_initplan` fix to the case helpers; the EXPLAIN check is the proof.

### Build-time decisions (implementation session, 2026-07-30)

- **The subselect wrapper was re-derived from measurement, and the card's proposed form corrected.** `(select private.can_access_case(id))` is wrong twice: it *correlates* on a column, so it can never become an InitPlan (it degrades to a per-row SubPlan, strictly worse than calling the function directly), and `x = any ((select f()))` does not even parse as the array form — Postgres reads `ANY (subquery)` and raises `operator does not exist: uuid = uuid[]`. The shape that actually delivers the card's *intent* is a scalar subquery with an explicit cast, `x = any ((select private.actor_admin_org_ids())::uuid[])`: the cast forces expression context, the subquery becomes an InitPlan evaluated exactly once, and the resulting array parameter is still usable as a ScalarArrayOpExpr index condition. So org-scoped list predicates use uncorrelated **array** helpers, and the always-case-scoped child tables call the **boolean** helper directly. EXPLAIN in Done evidence is the proof.
- **Anti-recursion verified, not assumed.** SECURITY DEFINER only breaks the loop because the function owner (`postgres`) holds `BYPASSRLS` — `force row level security` would otherwise subject even the table owner to its own policies. Confirmed `rolbypassrls = true` for `postgres` before relying on it, and the itest proves it behaviourally (a member lists co-members without 42P17).
- **Column-level UPDATE grants are the "cannot repoint" mechanism; WITH CHECK is defence in depth.** `WITH CHECK` sees only the NEW row, so it structurally *cannot* express "student_user_id may not change". Leaving `organization_id` / `student_user_id` (and `invitations.accepted_at`) out of the column grant makes the tenant escape unexpressible by any client on any path, while the WITH CHECK still holds if that grant ever widens. Both are shipped; the acceptance criterion ("rejected, not silently no-op'd") is met — the rejection code is 42501.
- **New finding: helpers inherited `EXECUTE` by `anon`.** A new function's EXECUTE defaults to PUBLIC and anon is in PUBLIC, so `has_function_privilege('anon', 'private.org_role(uuid)', 'execute')` was TRUE on first green. Schema USAGE still kept anon out, which is exactly what makes it a latent grant nobody notices until a later migration widens the schema. Added `revoke all on function … from public` before the grants, mirroring MV-150's treatment of `private.write_audit_event`. Caught by the grant assertion, not by eye.
- **In-tenant escalation closed: only an owner may mint, alter, or remove an `owner` membership.** The card's per-table target says "admins manage"; taken literally, an admin could promote themselves to owner and then delete the organization. The carve-out is two clauses on the memberships INSERT/UPDATE/DELETE policies. Flagged for MV-151 — this is team management, not case access, so it should not collide with its matrix, but it is the one place these policies are stricter than "admins manage".
- **Assignment must stay in-tenant.** `case_assignments` INSERT requires `is_case_org_member(case_id, user_id)` as well as `can_manage_case(case_id)`: without it an admin could assign another organization's staff to their own case, an insider-initiated outward leak. The two arguments do different jobs — the actor's authority comes from `auth.uid()` internally, `p_user_id` is only the *subject* being validated.
- **Column-level SELECT revoke on `invitations.token_hash` considered and rejected.** A non-admin matches no invitation row at all, so the criterion is already met by row policies. Revoking the column would additionally make `select *` fail for every client, to protect a non-reversible hash from the very admin who minted it. Row-level only; recorded in the migration.
- **No new index was needed.** The card permitted one. The final `cases` SELECT predicate resolves as a BitmapOr over three MV-150 indexes (`cases_student_user_id_idx`, `cases_organization_id_idx`, `cases_pkey`), so adding anything would only cost write amplification.
- **MV-150's `tenancy-schema.itest.ts` was updated deliberately, as that card anticipated.** Two assertions became false by design (one deny-all policy per table; no grants to anon *or* authenticated) and were narrowed to what survives the swap: no deny-all left behind, every table still policied, anon still holds nothing. A third changed *shape* rather than outcome — a non-member's UPDATE/DELETE is now a silent USING miss (PostgREST reports success over zero rows) rather than a 42501, so the row-unchanged check became the real assertion.
- **A student cannot read the `organizations` row of the consultancy handling their case** (they hold no membership). Real journey gap, opened knowingly: closing it needs a case→org read grant that widens the tenancy surface, which belongs with the Stage-5 student portal. Listed with the other deliberate omissions at the foot of the migration.

### Matrix-alignment amendment (2026-08-02, same PR — migration edited in place)

MV-151 and MV-152 were built in parallel by separate sessions and a three-lens review found six
divergences between the SQL and TypeScript layers. `docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md`
is now authoritative over both; where these policies disagreed with it, **the policies were wrong**.
The migration has not been applied to production, so all six were fixed **in place** rather than
bolted on as a corrective migration — a Stage-1 database that never had the holes beats one that had
them for one migration.

- **`organizations` UPDATE is owner-only, not admin** (divergence 1). The plan reserves
  "organization-level settings" to the owner. Not cosmetic: `slug` is in the same column grant and is
  the tenant's globally-unique URL identity, so the admin verb also carried "rename onto a slug a
  competitor is about to claim, and break every existing link". Policy renamed `organizations_update_owner`.
- **The `cases` write surface is split by actor** (divergences 2 and 4) — the second of the two
  privilege-escalation paths. `cases_update_accessor` admits the linked student on the student
  disjunct, and the flat column grant then handed them `operational_status` and `archived_at`: the
  consultancy's own operational record on a case the consultancy owns. **The mechanism had to change,
  because a column GRANT cannot express this.** Every client arrives as the single role
  `authenticated`, so `grant update (…) to authenticated` is necessarily flat across owner, admin,
  counsellor and student; and a policy `WITH CHECK` sees only NEW, so it cannot distinguish "the
  student is archiving this case" from "the student is renaming a case that was already archived".
  Shipped as a `BEFORE UPDATE` trigger (`cases_write_surface_guard` → `private.enforce_case_write_surface()`)
  comparing OLD/NEW with `is distinct from`: `archived_at` → org owner/admin, `operational_status` →
  `can_staff_case`, `display_name`/`email` → whoever the row policy already admits. It is
  `SECURITY INVOKER` **on purpose** — that is what lets it read the caller's role and exempt exactly
  the `rolbypassrls` roles RLS itself exempts, so Stage-2 claim and Stage-5 acceptance still work as
  `service_role`. Deliberately unlike MV-150's append-only audit trigger, which raises even for
  `service_role`: audit immutability is absolute, a write-surface split is a rule about actors.
- **An assigned counsellor may now invite their own student** (divergence 3) — the plan's counsellor
  "invites the student to collaborate", stated as an explicit duty.
- **`invitations` INSERT constrains `role`** (divergence 5) — the first privilege-escalation path.
  The memberships policies already reserve `owner` rows to owners; leaving invitations unconstrained
  let an admin mint an owner *invitation* instead and walk through the same door with a different key.
  Same two-clause carve-out, mirrored. **The schema trap is recorded in the migration**: `invitations.role`
  includes `'student'` and `organization_memberships.role` does not — different sets, never to be
  cross-checked or refactored into a shared predicate.
- **The dual-role rule** (divergence 6, flagged in the matrix for founder override). Two leaks closed,
  both on `case_assignments` SELECT: `user_id = (select auth.uid())` was ungated on membership status,
  so a **revoked** counsellor kept the roster of every case they had worked, indefinitely; and
  `can_access_case` carries the student disjunct, so a linked student could read who staffs their own
  case — consultancy-internal operating data. Both collapse into one predicate,
  `private.can_staff_case(case_id)`. The student's rights over their *own case* survive revocation
  untouched, which is the half of the rule the matrix exists to protect.
- **Minors from the same review:** `invitations.organization_id` is tied to the case's org with
  `is not distinct from private.case_org_id(case_id)` (the shape check left it unconstrained, so a
  student invite could be stamped with another tenant's org id — which the SELECT policy's org branch
  would then have shown to *that* tenant's admins); the migration now **asserts** the migration role's
  `BYPASSRLS` in a `do` block instead of relying on it implicitly, with a matching catalog assertion
  that every definer helper's owner holds it; and the `case_assignments` INSERT happy-path fixture was
  aimed at a case that already had a primary counsellor, so `case_assignments_primary_idx` made it a
  guaranteed 23505 — the test could only assert "at least it wasn't a 42501", and would have stayed
  green with the INSERT policy deleted outright. Re-aimed at the one case with a free slot, and it now
  asserts the insert *succeeds* and the row lands.

**Two new helpers.** `private.can_staff_case(uuid)` is `can_access_case` minus the student disjunct,
and that subtraction is the point — anywhere the question is "may this actor act *as the consultancy*
on this case", the student's own link must not answer yes. `can_access_case` is now defined as
`student link OR can_staff_case`, so the two cannot drift. `private.case_org_id(uuid)` exists so the
invitations org-tie can be expressed without an inline subquery against `cases`, which the
anti-recursion rule (and the itest that enforces it structurally) forbids.

**One deviation from the matrix's literal wording, recorded rather than hidden.** The checklist says
"split the flat column grant". In PostgreSQL that is not expressible: a column grant is per-*role*,
and every client is `authenticated`. The *outcome* the matrix specifies is implemented exactly; the
mechanism is the trigger above. The grant list is unchanged, and the itest still asserts it.

**One journey gap this opens, recorded with the other deliberate omissions:** nobody can archive a
**personal** case (`organization_id` null) from a client, because archiving is now owner/admin-only
and a personal case has no organization. Same shape as the personal-case DELETE gap already recorded,
lands with the same Stage-2 personal-case path. Not a regression — MV-150 shipped that surface closed.

**Deviation recorded (permissive direction, deliberate).** The checklist authorises exactly one
invitations change for divergence 3 — INSERT. This ships SELECT and UPDATE for the assigned
counsellor too, moving the case-scoped branch from `can_manage_case` to `can_staff_case`. Reason:
INSERT alone is a broken cell, not a narrow one. PostgREST's `return=representation` needs the row
to pass the SELECT policy, so `.insert().select()` fails outright; and an invite you can mint but
cannot list or revoke is not a duty anyone can discharge. The widening is strictly case-scoped —
team invites carry `case_id null` and stay invisible to counsellors, and the counsellor already has
full access to the case in question. Flagged for the integrator rather than assumed.

### Follow-up round — adversarial review of the amendment (same PR)

A 64-agent red-team was run against the amended diff, with every finding put through three
independent refutation attempts. Three survived and are fixed here; the rest are reported to the
integrator rather than actioned, because they are pre-existing or out of MV-152's scope.

- **A second un-minted-owner path, same class as divergence 5.** Closing `role='owner'` on INSERT is
  only half a door. `revoked_at` is the sole column in the invitations UPDATE grant and that surface
  is **bidirectional** — setting it back to null resurrects the invitation. An owner mints and
  revokes an owner invitation; any admin un-revokes it. `invitations_update_staff` now carries the
  same carve-out, so an admin may SEE an owner invitation and may not ALTER it — exactly how
  `organization_memberships` already treats owner rows.
- **Two performance regressions I introduced, both measured.** Gating the org branch on
  `case_id is null` stopped student invitations ever matching the cheap InitPlan disjunct, so every
  one fell through to a per-row `can_staff_case`: org-wide invitation listing went **1.0 ms → 141.9 ms**
  (3,000 student + 3,000 team invites). Collapsing `case_assignments` SELECT to the bare helper left
  a counsellor's own-assignments query with nothing to short-circuit on: **0.97 ms → 6.31 ms** (100 of
  5,000 rows). Both restored with disjuncts that are strict *subsets* of the helper — the org branch
  is sound on its own terms and the assignment branch (`actor_assigned_case_ids()`) is
  revocation-gated — so no safety is traded for speed. An EXPLAIN assertion now guards both shapes.
- **A comment of mine that was factually wrong.** I claimed the `SECURITY INVOKER` trigger function
  needs `EXECUTE` from the updating client. It does not: PostgreSQL checks EXECUTE on a trigger
  function once, at `CREATE TRIGGER` time, against the trigger's creator — never at fire time.
  Verified by revoking it and confirming the guard still raises. The grant is removed; a security
  boundary resting on a false premise is worse than no comment.
- **The BYPASSRLS exemption was asserted only as catalog metadata.** Deleting the early-return from
  the guard left the entire suite green while breaking Stage-2 claim and Stage-5 acceptance in
  production. Replaced with a behavioural test that writes both guarded columns as `service_role`.
- **Two omissions recorded rather than left implicit**, both raised by the review: `operational_status`
  is frozen on a personal case for the same structural reason `archived_at` is (no org ⇒ no staff),
  and `organization_memberships` keeps the one status-ungated `user_id = auth.uid()` disjunct that
  the amendment deleted from `case_assignments`. The second is a knowing partial implementation of
  the matrix's structural rule 1 and the migration now argues for it explicitly.

**Mutation-tested, not merely green.** The four security fixes were reverted directly on the live
local database (policy `ALTER`s + `DROP TRIGGER`) and the suite re-run: **12 tests failed, each one the
test written for the reverted cell**, and every other test stayed green. A passing suite here proves
nothing on its own — an RLS SELECT denial is silent, so `expect(data).toEqual([])` passes just as
happily against a deleted policy. Every "sees nothing" assertion is now paired with a service-role
read proving the rows exist, and usually with the actor who legitimately does see them.

## Done evidence

**Branch** `mv-152-case-aware-rls` (off `origin/master` @ `78414d0`) · **PR** [#108](https://github.com/Spooderinbed/merovisa/pull/108) — *not merged; integrator applies the migration at merge time.*

**Migration shipped:** `supabase/migrations/20260730180000_case_aware_rls_policies.sql` (policy + function + grant only — no table created, altered, or dropped, no data touched). **NOT applied to production.**

**Helpers** — all `private`, `security definer`, `stable`, `set search_path = ''`, EXECUTE revoked from `public` then granted to `authenticated` only:

| Signature | Returns | Role |
|---|---|---|
| `private.org_role(p_organization_id uuid)` | `text` | active-membership role, else null — the single `status='active'` choke point |
| `private.is_org_admin(p_organization_id uuid)` | `boolean` | `org_role in ('owner','admin')`, null-safe |
| `private.can_manage_case(p_case_id uuid)` | `boolean` | admin/owner of the case's org |
| `private.can_staff_case(p_case_id uuid)` | `boolean` | **consultancy-side** access — org admin **or** active-member assigned counsellor. `can_access_case` minus the student disjunct |
| `private.can_access_case(p_case_id uuid)` | `boolean` | linked student **or** `can_staff_case` — the two halves of the dual-role rule, additive by construction |
| `private.case_org_id(p_case_id uuid)` | `uuid` | the case's owning org (null for a personal case) — lets a child policy tie itself to the tenant without an inline `cases` subquery |
| `private.is_case_org_member(p_case_id uuid, p_user_id uuid)` | `boolean` | is the *subject* an active member of the case's org (assignee validation) |
| `private.actor_org_ids()` | `uuid[]` | uncorrelated InitPlan set — any active membership |
| `private.actor_admin_org_ids()` | `uuid[]` | uncorrelated InitPlan set — owner/admin |
| `private.actor_owner_org_ids()` | `uuid[]` | uncorrelated InitPlan set — owner |
| `private.actor_assigned_case_ids()` | `uuid[]` | assigned cases, gated on the membership still being active |

**Policies** (17; one per table × command, so `multiple_permissive_policies` is clean):

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `organizations` | `organizations_select_member` | — (service-role onboarding) | `organizations_update_owner` | `organizations_delete_owner` |
| `organization_memberships` | `organization_memberships_select_member` | `organization_memberships_insert_admin` | `organization_memberships_update_admin` | `organization_memberships_delete_admin` |
| `cases` | `cases_select_accessor` | `cases_insert_admin` | `cases_update_accessor` + `cases_write_surface_guard` (trigger — the column half) | `cases_delete_admin` |
| `case_assignments` | `case_assignments_select_accessor` | `case_assignments_insert_admin` | — (delete+insert) | `case_assignments_delete_admin` |
| `invitations` | `invitations_select_staff` | `invitations_insert_staff` | `invitations_update_staff` (revoke only) | — (revocation is the audited path) |
| `audit_events` | `audit_events_select_admin` | — | — | — (append-only preserved) |

**Integration gate — all green** (local stack, `npx supabase db reset` applying all 19 migrations):

- `npm run typecheck` — clean.
- `npm run lint` — clean, 0 errors 0 warnings.
- `npm test` — **318 files / 2230 tests passed**.
- `npm run test:integration` — **4 files / 99 tests passed**, including `tests/integration/case-rls.itest.ts` (67 tests, evaluated as the **authenticated** user throughout; the service-role client is used only to seed fixtures, to read back rows for assertions, and to prove that a denied read was denied rather than empty).

**The four named proofs, all passing in `case-rls.itest.ts`:**

- *Anti-recursion* — an active member lists co-members with no `42P17 infinite recursion detected in policy for relation "organization_memberships"`. Also asserted **structurally** from `pg_policy`: no policy predicate on any of the six names a tenancy table, i.e. every lookup goes through a helper.
- *Inactive membership* — the same signed-in client, JWT untouched, drops from `[caseA2]` to `[]` on its next query after `status` is flipped to `'inactive'`; loses its organization row and every co-member, and keeps only its own membership row.
- *WITH CHECK / no write hole* — `update cases set organization_id = <other org>` and `set student_user_id = <someone else>` both rejected `42501`, row verified unchanged; an in-tenant `display_name` update succeeds. `pg_policy` is asserted to have **both** `polqual` and `polwithcheck` on every UPDATE policy.
- *EXPLAIN (perf)* — see below.

**EXPLAIN evidence** — `explain (analyze, buffers) select id, display_name from public.cases` as an **org admin** (`set local role authenticated` + real `request.jwt.claims`), 400 organizations / 10,000 cases:

```
Bitmap Heap Scan on cases  (cost=88.69..212.33 rows=257 width=19) (actual time=1.006..1.008 rows=25 loops=1)
  Recheck Cond: ((student_user_id = (InitPlan 1).col1) OR (organization_id = ANY ((InitPlan 2).col1)) OR (id = ANY ((InitPlan 3).col1)))
  InitPlan 1 ->  Result   (actual time=0.013..0.013 rows=1 loops=1)
  InitPlan 2 ->  Result   (actual time=0.422..0.423 rows=1 loops=1)
  InitPlan 3 ->  Result   (actual time=0.553..0.553 rows=1 loops=1)
  ->  BitmapOr
        ->  Bitmap Index Scan on cases_student_user_id_idx   Index Cond: (student_user_id = (InitPlan 1).col1)
        ->  Bitmap Index Scan on cases_organization_id_idx   Index Cond: (organization_id = ANY ((InitPlan 2).col1))
        ->  Bitmap Index Scan on cases_pkey                  Index Cond: (id = ANY ((InitPlan 3).col1))
Planning Time: 0.333 ms   Execution Time: 1.031 ms
```

No Seq Scan; one MV-150 index per disjunct; **three InitPlans = each helper evaluated once per statement**, not once per row. The itest asserts all four facts. Note on the fixture: *tenant count*, not row count, is what makes this plan appear — Postgres cannot see inside `= ANY ($initplan)` and assumes ~10 elements, so at 40 orgs the predicate reads as ~22% of the table and a Seq Scan genuinely is cheaper (and measured faster, 1.4 ms). At 400 orgs — a realistic consultancy population — it estimates ~2.5% and the BitmapOr wins. Shrinking the fixture would turn that assertion into a false alarm; the test says so.

**Advisors** — Supabase MCP is unauthenticated in this session, so the four relevant advisor rules were run directly as catalog SQL against the migrated local stack. Zero findings for these objects: `rls_disabled_in_public` none · `rls_enabled_no_policy` none · `function_search_path_mutable` none in schema `private` · `auth_rls_initplan` none (every `auth.uid()` renders as `( SELECT auth.uid() AS uid)`) · `multiple_permissive_policies` none. `unindexed_foreign_keys` is unchanged — this migration adds no index and no constraint. **Re-run `get_advisors` against the hosted project after the integrator applies the migration.**

**Type drift** — `npx supabase gen types typescript --local` against the migrated stack differs from the committed `lib/supabase/types.ts` by exactly one hunk: the `__InternalSupabase.PostgrestVersion: "14.5"` banner, a CLI/PostgREST-version artifact of the local stack. **No table, column, or relationship type changed**, so `types.ts` is deliberately left untouched rather than committing an unrelated banner diff.

**Deferred / not built (siblings own these):** the TypeScript permission layer (MV-151), the cross-tenant negative-test catalogue and full positive matrix that are the stage exit gate (MV-153). Deliberate omissions inside this card's own scope are enumerated at the foot of the migration file and in the build-time decision log above.
