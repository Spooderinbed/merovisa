-- MV-159 — Case-aware RLS for the nine migrated student-owned tables (Stage 2 step 11).
--
-- Card:  docs/kanban/cards/MV-159-rls-migrated-tables.md
-- Spec:  docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md  (AUTHORITATIVE)
--          §2.6 the legacy policy set this file replaces, verbatim · §2.7 the grant baseline it
--          leaves untouched · §3 the invariant · §4.1-§4.9 the per-table *Policy form* cells this
--          file is a TRANSCRIPTION of · §4 rule 4 the two-slice policy lifecycle · §6 the verbs
--          deferred to Stage 3 · §7 why no grant widens here · §10.1 R2 this file's rollback.
-- Matrix: docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md — every access-control
--          CELL. This card adds TABLES to the model; it adds no cell and moves none.
--
-- Application code has read and written case-scoped since MV-157. The DATABASE has not: all nine
-- tables still carry `(select auth.uid()) = owner`, so a bug in a repository, a route, or MV-151's
-- TypeScript permission layer is currently sufficient to cross a case boundary. This migration
-- closes that gap and nothing else.
--
--   STRICTLY POLICY + FUNCTION + FUNCTION-GRANT. No table is created, altered or dropped; no
--   column, index, constraint or trigger is touched; NO TABLE OR COLUMN GRANT CHANGES (§7 below
--   asserts that rather than restating it); no data is written.
--
-- ============================== THE MATRIX VERB EACH POLICY IMPLEMENTS ==============================
-- Canonical matrix verbs, mapped once here rather than nine times below (card acceptance criterion
-- "the migration carries a comment mapping each table to the matrix verb it implements"):
--
--   SELECT on any of the nine        -> `case.read`    — "views permitted case information"
--   UPDATE on any of the nine        -> `case.update`  — the student's "updates permitted profile
--                                                        fields" and staff's "manages the student
--                                                        profile, assessment, matches, plan and
--                                                        documents", narrowed to COLUMNS by the
--                                                        MV-155 §H column grants, not by these
--                                                        predicates (RLS gates rows, never columns)
--   INSERT / DELETE on the five that hold the grant   -> the same `case.update` surface
--
-- WHICH ACTORS THOSE VERBS REACH IS `private.actor_case_ids()` AND NOTHING ELSE, and that function
-- is `private.can_access_case`'s disjunction turned inside out (set-wise instead of row-wise) so
-- the two cannot drift. The four human roles are all the single Postgres role `authenticated`;
-- RLS narrows a grant and never widens one.
--
-- ============================== THE TRANSITIONAL OWNER DISJUNCT ==============================
-- EVERY predicate below is
--
--     owner = (select auth.uid())                                    <- transitional, MV-160 drops
--     or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
--
-- and the first line is a DATED, SINGLE-STAGE widening, not the shape. `case_id` is nullable until
-- MV-160, so a pure case predicate would hide a not-yet-backfilled row from its own owner —
-- silently, because an RLS SELECT refusal returns zero rows and no error. That is the Stage 2 exit
-- regression this file exists to avoid creating.
--
-- MV-160 §D step (d) RE-CREATES EVERY POLICY BELOW WITH THAT LINE REMOVED, after its `SET NOT NULL`s
-- make it redundant (spec §4 rule 4). To keep that a PREDICATE EDIT AND NOTHING MORE, every policy
-- here writes the disjunct identically, as the outermost `OR` of its own parenthesised ownership
-- group, marked `-- MV-160 §D:` on the exact line to delete. A predicate MV-160 has to restructure
-- is a predicate MV-160 will get wrong.
--
-- The removal is behaviour-preserving on SELECT/UPDATE and strictly tightening on INSERT, and the
-- reason it is safe is one property this file must not break: `private.actor_case_ids()`'s
-- STUDENT-LINK ARM IS NOT GATED ON MEMBERSHIP STATUS. `owner = auth.uid()` implies the case branch
-- ONLY because a personal case is always reachable by its linked student. Gate that arm and
-- MV-160's drop hides every personal student's own data from them, silently. See §1.
--
-- ============================== WHAT THIS FILE REFUSES TO DO ==============================
--   * NO GRANT IS ADDED OR WIDENED (spec §7, card §"No write hole"). `authenticated` holds no
--     INSERT on `profiles` / `assessments` / `plan_items` / `documents`, and that stays true — so
--     four of the eight consultancy write paths are `42501` regardless of any predicate written
--     here. They are Stage 3 and their exact grant + policy list is spec §6. A policy cannot
--     unblock a missing grant, and none below tries.
--   * NO `case_id NOT NULL`, no owner-keyed index or check dropped — MV-160.
--   * NO `storage.objects` policy change. `documents` ROWS become case-scoped here while object
--     PATHS stay `<owner_uuid>/<kind>/<file>` (spec §8, decided and dated). Two authorization
--     conventions coexist in that bucket for the whole of Stages 2-3, deliberately. Note the
--     asymmetry spec §9.9 records: on `public.documents` the missing `to` clause was covered by
--     `anon` holding no grant; on `storage.objects` `anon` holds the FULL grant set, so the same
--     reasoning does not transfer and that policy set is Stage 4's.
--   * NO application-code change. MV-157 already reads and writes case-scoped.
--
-- Conventions inherited from 20260730180000 (MV-152), which is the pattern this extends rather
-- than forks: the BYPASSRLS precondition; `private` SECURITY DEFINER STABLE helpers with a pinned
-- empty `search_path`; `revoke all on function … from public` BEFORE granting EXECUTE to
-- `authenticated` only; the uncorrelated-array InitPlan shape `x = any ((select f())::uuid[])`;
-- one policy per table per command; no inline subquery against a `public` table in any predicate.
--
-- No `begin;`/`commit;` — `supabase db push` submits the file as ONE multi-statement simple query
-- that Postgres runs as a single implicit transaction, and an inner `commit` ends it early, leaving
-- a half-applied schema the migration history does not know about (measured at MV-155; see
-- supabase/rehearsal/README.md). `lock_timeout` bounds the ACCESS EXCLUSIVE that each
-- `drop policy` / `create policy` takes on a student-facing table: failing fast and retrying beats
-- an unbounded stall behind an open transaction, and an abort rolls the whole file back.
set lock_timeout = '10s';

-- =====================================================================
-- 0  the BYPASSRLS precondition, asserted rather than assumed
-- =====================================================================
-- Identical in force to MV-152 §0 and re-stated because this file adds FOUR more definer helpers
-- whose whole anti-recursion argument is that their owner bypasses RLS. Applied by a role without
-- it, `private.actor_case_ids()` would be re-filtered by `cases_select_accessor` — which is not an
-- abort, it is a SILENT under-read: every case-scoped row would vanish from every client. That is
-- the one failure mode this card cannot allow to be quiet.
do $$
begin
  if not coalesce((select r.rolbypassrls from pg_catalog.pg_roles r where r.rolname = current_user), false) then
    raise exception
      'MV-159 requires the migration role (%) to hold BYPASSRLS: the private.* helpers below are '
      'SECURITY DEFINER and execute as their OWNER, and it is that owner''s BYPASSRLS -- not '
      'ownership, which FORCE ROW LEVEL SECURITY deliberately defeats -- that stops their reads '
      'being re-filtered by the policies of the tables they read.', current_user;
  end if;
end;
$$;

-- =====================================================================
-- 1  private.actor_case_ids() — every case this actor may reach
-- =====================================================================
-- THE SEMANTICS ARE `private.can_access_case`'s, SET-WISE INSTEAD OF ROW-WISE, and the three
-- disjuncts are `cases_select_accessor`'s verbatim (20260730180000 §5) so a reviewer can check
-- equivalence by eye and the itest can check it by measurement:
--
--     can_access_case(c) = c.student_user_id = uid                        <- the student link
--                       or is_org_admin(c.organization_id)                <- }  can_staff_case
--                       or (active member of c's org AND assigned to c)   <- }
--
--     actor_case_ids()   = { c : c.student_user_id = uid }
--                        u { c : c.organization_id in actor_admin_org_ids() }   == is_org_admin
--                        u actor_assigned_case_ids()                            == the third arm
--
-- `actor_admin_org_ids()` and `actor_assigned_case_ids()` each already filter `status = 'active'`,
-- so REVOCATION IS IMMEDIATE on both consultancy arms: flipping a membership to `inactive` is a row
-- edit that takes effect on the actor's next statement, with no token change and no re-login.
-- `tests/integration/student-data-rls.itest.ts` asserts set equality against `can_access_case` for
-- every case in the fixture, so "cannot drift" is a test rather than a comment.
--
-- ---------------------------------------------------------------------------------------------
-- THE STUDENT-LINK ARM IS DELIBERATELY **NOT** MEMBERSHIP-GATED, AND IT IS LOAD-BEARING TWICE.
--
--   (a) It is the canonical dual-role rule (stage1-canonical-access-matrix §"The dual-role rule"):
--       membership grants ORG-scoped rights and the student link grants STUDENT-scoped rights on
--       one case; the two are additive and an inactive membership contributes nothing — but
--       revoking a membership never removes a person's rights over their own student case. A fired
--       counsellor loses the org; they do not lose their own file.
--   (b) It is what makes MV-160's disjunct removal SAFE. `owner = auth.uid()` implies the case
--       branch only because a personal case is always reachable by its linked student. Gate this
--       arm on membership status and MV-160's drop hides every personal student's own data from
--       them, with no error anywhere.
--
-- A personal case has `organization_id is null`, so the second arm cannot match it (`null = any(…)`
-- is NULL) and the third cannot either (its membership join is on the case's org). The student link
-- is the ONLY arm that reaches a personal case — which is exactly why it must never be gated.
-- ---------------------------------------------------------------------------------------------
--
-- Argument-free and uncorrelated on purpose: that is what lets a policy evaluate it ONCE per
-- statement as an InitPlan (MV-152's measured finding — `(select f(col))` correlates on a column
-- and can only ever be a per-row SubPlan, and `x = any ((select f()))` does not even parse as the
-- array form). Returns '{}' rather than null so `= any (…)` is false, never null, for an actor who
-- may reach nothing.
--
-- PERFORMANCE, stated because it is the one thing that grows: for a personal student this is a
-- one-element array; for a consultancy admin it is every case in the organization. Each disjunct
-- lands on its own MV-150 index (cases_student_user_id_idx, cases_organization_id_idx, cases_pkey).
create function private.actor_case_ids()
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
  from public.cases c
  where c.student_user_id = (select auth.uid())
     or c.organization_id = any (private.actor_admin_org_ids())
     or c.id = any (private.actor_assigned_case_ids());
$$;

-- =====================================================================
-- 1a  the three PARENT-CASE helpers — case parentage, never `owner`, never an inline `exists`
-- =====================================================================
-- The legacy `pp_insert_own` / `aa_insert_own` / `oe_insert_own` re-assert parentage with an inline
-- `EXISTS (select 1 from <peer table> where … and owner = uid)`. Both halves of that have to go, for
-- two different reasons (card Decision log 2026-08-02, spec §4.7-§4.9):
--
--   * THE INLINE SUBQUERY. A table referenced inside a policy expression has ITS OWN RLS applied.
--     The moment `assessments` / `program_predictions` / `application_attempts` acquire the case
--     policies below, those subqueries become (i) a recursion hazard and (ii) — the quieter and
--     worse one — a SILENT DENIAL: a legitimate insert fails because the parent row is not visible
--     to the actor through whichever disjunct the planner happened to use. A SECURITY DEFINER
--     helper reads the parent as its owner, so the parentage question is answered on the DATA and
--     not on the actor's current view of it.
--   * THE `owner` EQUALITY. It is the actor-equals-student assumption Stage 2 exists to delete: a
--     counsellor inserting for a consultancy case is not the row's owner and there may be no owner
--     at all.
--
-- Each returns the parent's `case_id`, or NULL when the parent does not exist. NULL is the correct
-- and SAFE answer: the policies below compare it with `=`, and a comparison against NULL is NULL,
-- which a WITH CHECK refuses exactly like FALSE. So "parent not found", "parent has no case" and
-- "parent is in another case" all deny, and none of them can be turned into an existence oracle —
-- `private` is not a PostgREST-exposed schema, so there is no RPC route to call them directly.
create function private.assessment_case_id(p_assessment_id uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select a.case_id from public.assessments a where a.id = p_assessment_id;
$$;

create function private.prediction_case_id(p_prediction_id uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select p.case_id from public.program_predictions p where p.id = p_prediction_id;
$$;

create function private.attempt_case_id(p_attempt_id uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select a.case_id from public.application_attempts a where a.id = p_attempt_id;
$$;

-- =====================================================================
-- 2  drop the legacy owner-only policy set (spec §2.6, verbatim)
-- =====================================================================
-- `if exists` on every one so a partial re-run is not a different script. The two `documents`
-- policies are QUOTED because that is how they were created (20260604060000 / 20260605130000, and
-- rewritten to the InitPlan form by 20260618120000) — a rename is unavoidable here and is itself
-- an acceptance criterion, because they carry no `to` clause and therefore apply to `PUBLIC`,
-- which includes `anon`.
--
-- `"Service inserts documents"` (INSERT, role `service_role`, `with check true`) is NOT dropped:
-- upload has no authenticated INSERT grant and no non-service INSERT policy, and it stays that way
-- through Stage 2 (spec §4.5, §6).
drop policy if exists profiles_select_own          on public.profiles;
drop policy if exists profiles_update_own          on public.profiles;
drop policy if exists assessments_select_own       on public.assessments;
drop policy if exists plan_items_select_own        on public.plan_items;
drop policy if exists plan_items_update_own        on public.plan_items;
drop policy if exists ups_select_own               on public.user_program_state;
drop policy if exists ups_insert_own               on public.user_program_state;
drop policy if exists ups_update_own               on public.user_program_state;
drop policy if exists ups_delete_own               on public.user_program_state;
drop policy if exists "Users read own documents"   on public.documents;
drop policy if exists "Users delete own documents" on public.documents;
drop policy if exists ds_select_own                on public.document_status;
drop policy if exists ds_insert_own                on public.document_status;
drop policy if exists ds_update_own                on public.document_status;
drop policy if exists ds_delete_own                on public.document_status;
drop policy if exists pp_select_own                on public.program_predictions;
drop policy if exists pp_insert_own                on public.program_predictions;
drop policy if exists pp_delete_own                on public.program_predictions;
drop policy if exists aa_select_own                on public.application_attempts;
drop policy if exists aa_insert_own                on public.application_attempts;
drop policy if exists aa_delete_own                on public.application_attempts;
drop policy if exists oe_select_own                on public.outcome_events;
drop policy if exists oe_insert_own                on public.outcome_events;
drop policy if exists oe_delete_own                on public.outcome_events;

-- =====================================================================
-- 3  profiles — spec §4.1.  SELECT: O/A/C/S.  UPDATE: O/A/C/S (sections, completeness only).
-- =====================================================================
-- INSERT and DELETE have no grant and get no policy. Profile CREATION is service-role through
-- Stage 2 (`app/api/profile/section/route.ts`, a registered `legacy-owner-scoped` exception);
-- account deletion is a service-role path. Both are deliberate omissions, not gaps — spec §6 holds
-- the Stage 3 grant + policy for the INSERT.
--
-- WHICH COLUMNS a client may write is `grant update (sections, completeness)` (MV-155 §H) and is
-- NOT expressible here: a WITH CHECK sees only the NEW row and structurally cannot say "this column
-- may not change" (MV-152's build-time finding, adopted verbatim). `case_id` and `owner` are absent
-- from that grant, so re-pointing a profile into another case is UNEXPRESSIBLE by any client on any
-- path — the WITH CHECK below is defence in depth for the day that grant ever widens.
create policy profiles_select_case on public.profiles
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy profiles_update_case on public.profiles
  for update to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  )
  with check (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- =====================================================================
-- 4  assessments — spec §4.2.  SELECT only, for every role. Nothing else, by grant.
-- =====================================================================
-- `authenticated` holds SELECT and nothing else on this table, and MV-155 §H correctly left it
-- alone. Anonymous creation, refresh and claim are and remain service-role.
--
-- ANONYMOUS ROWS ARE INVISIBLE TO EVERY AUTHENTICATED CLIENT — INCLUDING THE USER ABOUT TO CLAIM
-- ONE — AND THAT IS REQUIRED, NOT INCIDENTAL (spec §4.2). An unclaimed row is
-- `owner IS NULL AND case_id IS NULL`: the first line is `NULL = uid` -> NULL, the second is false
-- because `case_id is not null` is false. NULL or FALSE is not TRUE, so the row matches neither
-- disjunct. It stays readable and writable by the service-role claim path (MV-158) and stays inside
-- MV-135's `owner is null` purge predicate. Every assertion of this in the suite is PAIRED with a
-- service-role existence read, because an RLS refusal and an empty table are the same observation.
create policy assessments_select_case on public.assessments
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- =====================================================================
-- 5  plan_items — spec §4.3.  SELECT + UPDATE (status, completed_at, started_at).
-- =====================================================================
-- Plan GENERATION writes rows and is service-role (`app/api/plan/action/route.ts`, a registered
-- exception); there is no authenticated INSERT grant and no INSERT policy, and no DELETE of either.
create policy plan_items_select_case on public.plan_items
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy plan_items_update_case on public.plan_items
  for update to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  )
  with check (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- =====================================================================
-- 6  user_program_state — spec §4.4.  All four verbs, O/A/C/S.
-- =====================================================================
-- ONE OF ONLY TWO TABLES WHERE THE ASSIGNED-COUNSELLOR **WRITE** PROOF IS EXPRESSIBLE IN STAGE 2
-- (spec §7.2's "write half"), because it is one of only two whose `authenticated` grant set covers
-- INSERT/UPDATE/DELETE. The other is `document_status` (§8).
--
-- THE INSERT `WITH CHECK` IS WHERE THE `owner IS NULL` BOUND LIVES, and that is by design rather
-- than by accident. MV-155 §H's definer trigger `user_program_state_derive_case_id` fires only
-- `when (new.owner is not null)`: with `owner` set it DERIVES `case_id` from that owner's personal
-- case and overwrites whatever the statement supplied (the re-pointing hazard stays closed at the
-- strongest available point), and with `owner` NULL it does not fire at all and the
-- statement-supplied `case_id` is honoured. Spec §4 rule 2 is explicit that the bound on WHICH case
-- such a row may name is THIS `WITH CHECK` and not that trigger — "which case may this row name" is
-- an authorization question, and the trigger is a provenance mechanism.
--
-- The two interact in the direction that matters, and it is worth stating because it is the reason
-- `update (owner, …)` (MV-155 §H's measured, PostgREST-forced grant) hands nobody a cross-user
-- write: `set owner = <another user>` fires the trigger, which re-derives `case_id` onto THAT
-- user's personal case, which is not in the actor's `actor_case_ids()` — so the WITH CHECK refuses
-- with 42501. Asserted, not argued.
create policy ups_select_case on public.user_program_state
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy ups_insert_case on public.user_program_state
  for insert to authenticated
  with check (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy ups_update_case on public.user_program_state
  for update to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  )
  with check (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy ups_delete_case on public.user_program_state
  for delete to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- =====================================================================
-- 7  documents — spec §4.5.  SELECT + DELETE, and BOTH GAIN `to authenticated`.
-- =====================================================================
-- THE RENAME IS THE FIX. The two legacy policies carry NO `to` clause, so they apply to `PUBLIC` —
-- which includes `anon`. Nothing was exploitable, because `anon` holds no grant on this table
-- (spec §2.7, re-verified); that is precisely the latent-grant class MV-152 found on helper
-- EXECUTE, and it is one grant edit away from mattering.
--
-- SPEC §9.1, RECORDED SO NOBODY GOES HUNTING: the OTHER half of this card's original `documents`
-- claim — that these two policies use a bare `auth.uid()` and are a per-row `auth_rls_initplan`
-- evaluation — IS FALSE. Both already read `(select auth.uid())`, rewritten by
-- 20260618120000_harden_advisors.sql lines 26-32. There is no InitPlan defect here to fix.
--
-- INSERT and UPDATE stay ungranted and unpolicied for `authenticated`: upload is service-role
-- (`app/api/documents/upload`, a registered exception) and the header/versions replacement is
-- Stage 4. `documents.file_path` is now a case-scoped row pointing at an OWNER-keyed object path;
-- spec §8 decided and dated that divergence.
create policy documents_select_case on public.documents
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy documents_delete_case on public.documents
  for delete to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- =====================================================================
-- 8  document_status — spec §4.6.  All four verbs, O/A/C/S.
-- =====================================================================
-- The second of the two tables where the counsellor write proof is expressible (spec §7.2). Same
-- UPSERT-seam trigger as §6 (`document_status_derive_case_id`, `when (new.owner is not null)`),
-- same consequence: the `owner IS NULL` branch is bounded HERE.
--
-- `app/api/documents/status/route.ts` already drives `setObtained` on the AUTHENTICATED client, so
-- this is the one table of the nine whose live student-facing path runs entirely through these
-- policies with no service-role fallback behind it.
create policy ds_select_case on public.document_status
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy ds_insert_case on public.document_status
  for insert to authenticated
  with check (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy ds_update_case on public.document_status
  for update to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  )
  with check (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy ds_delete_case on public.document_status
  for delete to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- =====================================================================
-- 9  program_predictions — spec §4.7.  SELECT + INSERT + DELETE. **NEVER UPDATE.**
-- =====================================================================
-- NO UPDATE POLICY AND NO UPDATE GRANT, PERMANENTLY. Immutability is the point of
-- 20260620000000, and it is enforced BELOW the policy layer by
-- `program_predictions_no_update -> private.reject_prediction_update()`, which is SECURITY INVOKER
-- and therefore raises for `service_role` too. "No UPDATE policy" is not immutability; the trigger
-- is. MV-155 narrowed its body to permit exactly the `case_id`-only backfill and MV-160 restores
-- the unconditional form. This file does not touch it — and the suite asserts it still raises,
-- including in that narrowed shape.
--
-- THE INSERT `WITH CHECK` IS TWO CLAUSES AND BOTH ARE LOAD-BEARING:
--
--   (1) the ownership disjunct — may this actor write into this case at all;
--   (2) `private.assessment_case_id(assessment_id) = case_id` — CASE PARENTAGE, replacing the
--       legacy inline `EXISTS (… assessments … and a.owner = uid)` (spec §4.7).
--
-- `=` AND NOT `is not distinct from`, AND THE DIFFERENCE IS A HOLE. Under `is not distinct from`, a
-- child with `case_id` NULL against a parent with `case_id` NULL compares TRUE — and an unclaimed
-- ANONYMOUS assessment is exactly `owner NULL, case_id NULL`, whose id travels in a shareable URL.
-- Any signed-in client could then hang a prediction-of-record off a stranger's anonymous
-- assessment, which the legacy policy's `a.owner = uid` refused. Plain `=` yields NULL there, a
-- WITH CHECK admits a row only on TRUE, and the hole never opens. It also means an INSERT must
-- carry `case_id` — which every writer has done since MV-157 routed all three inserts through
-- `lib/cases/dual-write.ts` (`case_id` always, `owner` only when the case has a student).
create policy pp_select_case on public.program_predictions
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy pp_insert_case on public.program_predictions
  for insert to authenticated
  with check (
    (
      owner = (select auth.uid())                                               -- MV-160 §D: delete this line
      or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
    )
    and private.assessment_case_id(assessment_id) = case_id
  );

create policy pp_delete_case on public.program_predictions
  for delete to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- =====================================================================
-- 10  application_attempts — spec §4.8.  SELECT + INSERT + DELETE. No UPDATE, and none added.
-- =====================================================================
-- Case parentage through `private.prediction_case_id()`. MV-156's composite FK
-- `(prediction_id, case_id) -> program_predictions (id, case_id)` says the same thing structurally
-- — but it is MATCH SIMPLE, so it is satisfied WITHOUT ANY LOOKUP whenever `case_id` is NULL, and
-- it therefore enforces nothing for the whole nullable window. This clause is what bites until
-- MV-160 closes that hole, and after it the two agree row for row.
create policy aa_select_case on public.application_attempts
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy aa_insert_case on public.application_attempts
  for insert to authenticated
  with check (
    (
      owner = (select auth.uid())                                               -- MV-160 §D: delete this line
      or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
    )
    and private.prediction_case_id(prediction_id) = case_id
  );

create policy aa_delete_case on public.application_attempts
  for delete to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- =====================================================================
-- 11  outcome_events — spec §4.9.  SELECT + INSERT + DELETE. Append-only.
-- =====================================================================
-- THE TWO INTEGRITY CLAUSES THAT ARE NOT ABOUT OWNERSHIP MUST SURVIVE, and spec §4.9 says so in
-- as many words: `source = 'self_reported'` and `verified_by IS NULL`. They are what stops a client
-- SELF-CERTIFYING an `official_verified` outcome — the difference between "the student says they
-- were granted a visa" and "the record says a decision authority did". Dropping them while "making
-- the policy case-aware" would be a trust regression wearing a refactor's clothes.
--
-- No UPDATE policy and no UPDATE grant: a correction is a NEW row plus `supersedes_event_id`.
create policy oe_select_case on public.outcome_events
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

create policy oe_insert_case on public.outcome_events
  for insert to authenticated
  with check (
    (
      owner = (select auth.uid())                                               -- MV-160 §D: delete this line
      or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
    )
    and private.attempt_case_id(attempt_id) = case_id
    and source = 'self_reported'
    and verified_by is null
  );

create policy oe_delete_case on public.outcome_events
  for delete to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- =====================================================================
-- 12  helper EXECUTE — revoke from PUBLIC first, then grant to `authenticated` only
-- =====================================================================
-- A policy predicate is evaluated as the CALLING role, so `authenticated` needs EXECUTE on each
-- helper or every policy above raises permission denied. The revoke is not ceremony: a new
-- function's EXECUTE defaults to PUBLIC, `anon` is in PUBLIC, and `authenticated` already holds
-- USAGE on `private` from 20260730180000 — so without this line
-- `has_function_privilege('anon', …, 'execute')` is TRUE the moment the function is created. Schema
-- USAGE is what keeps `anon` out today, which is exactly what makes it the kind of latent grant
-- nobody notices until a later migration widens the schema. MV-152 shipped that grant on its first
-- green and only caught it with an assertion; this file inherits the assertion.
--
-- Safe ONLY because `private` is not a PostgREST-exposed schema (supabase/config.toml
-- `[api] schemas = ["public", "graphql_public"]`): there is no RPC route, so a client cannot call
-- `actor_case_ids()` or the parent helpers as an oracle. If a future migration exposes `private`,
-- that assumption dies and these grants must be revisited.
revoke all on function
  private.actor_case_ids(),
  private.assessment_case_id(uuid),
  private.prediction_case_id(uuid),
  private.attempt_case_id(uuid)
  from public;

grant execute on function private.actor_case_ids()             to authenticated;
grant execute on function private.assessment_case_id(uuid)     to authenticated;
grant execute on function private.prediction_case_id(uuid)     to authenticated;
grant execute on function private.attempt_case_id(uuid)        to authenticated;

-- =====================================================================
-- 13  the grant review — this file changes NOTHING, and says so by assertion
-- =====================================================================
-- MV-152 §9 re-asserted its grants because it was opening a set MV-150 had revoked. THIS CARD'S
-- RULE IS THE OPPOSITE: it re-scopes rows and hands `authenticated` no verb and no column it did
-- not already hold (spec §7, card §"No write hole"). So there is no `grant` or `revoke` on any of
-- the nine anywhere in this file — and rather than leave "unchanged" as a claim in a PR body, the
-- two properties that make it load-bearing are asserted here, at apply time, on whatever database
-- this runs against.
--
-- The BASELINE is the POST-MV-155 set (explicit column lists, `case_id` in every INSERT list and in
-- no UPDATE list), not the pre-MV-155 table-level verbs; `tests/integration/case-backfill.itest.ts`
-- pins it column by column and this card does not re-transcribe it.
do $$
declare
  v_bad text;
begin
  -- (1) `case_id` is client-writable on NO update path. This is MV-155 §H's actual invariant and
  --     the mechanism that makes re-pointing a row into another case UNEXPRESSIBLE rather than
  --     merely rejected — a WITH CHECK sees only NEW and structurally cannot forbid a change.
  select string_agg(c.table_name, ', ' order by c.table_name) into v_bad
    from information_schema.column_privileges c
   where c.table_schema = 'public'
     and c.grantee = 'authenticated'
     and c.privilege_type = 'UPDATE'
     and c.column_name = 'case_id'
     and c.table_name in ('profiles','assessments','plan_items','user_program_state','documents',
                          'document_status','program_predictions','application_attempts','outcome_events');
  if v_bad is not null then
    raise exception 'MV-159: authenticated holds UPDATE(case_id) on % — the policies below trust '
      'case_id, so a client that can write it can re-point a row into another case', v_bad;
  end if;

  -- (2) `anon` holds nothing on any of the nine. The two `documents` policies applied to PUBLIC
  --     until this migration renamed them, and the ONLY thing that kept `anon` out was this
  --     absence. Now that they carry `to authenticated` the property is belt rather than the
  --     single strand — but it is asserted because spec §9.9 records the mirror case where the net
  --     does NOT exist (`storage.objects`, where `anon` holds the full grant set).
  select string_agg(distinct g.table_name, ', ' order by g.table_name) into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.grantee = 'anon'
     and g.table_name in ('profiles','assessments','plan_items','user_program_state','documents',
                          'document_status','program_predictions','application_attempts','outcome_events');
  if v_bad is not null then
    raise exception 'MV-159: anon holds a grant on % — no policy in this file is written to keep '
      'an unauthenticated client out, because none should have to', v_bad;
  end if;
end;
$$;

-- =====================================================================
-- Deliberate omissions (recorded so a reviewer sees refusal, not oversight)
-- =====================================================================
--   * `profiles` INSERT · `assessments` INSERT/UPDATE/DELETE · `plan_items` INSERT/DELETE ·
--     `documents` INSERT/UPDATE — no grant, therefore no policy. Every one is `42501` for every
--     role including an assigned counsellor, and NO predicate written here could change that.
--     They are Stage 3, enumerated with their exact grant + policy in spec §6, and pinned by a
--     `42501` NEGATIVE assertion in MV-160's tighten suite so Stage 3 cannot land them unnoticed
--     (spec §7.2 "deferred half"). This is the refusal spec §7 upheld in this card's favour.
--   * `program_predictions` UPDATE — never, for any role. Grant absent AND the immutability
--     trigger. `outcome_events` / `application_attempts` UPDATE — never; append-only.
--   * `documents`' `"Service inserts documents"` policy — untouched, and the only INSERT path.
--   * `leads` — RLS on, zero policies, zero grants, deny-all by design (the `harden_advisors`
--     precedent). It carries no case and is not one of the nine.
--   * `storage.objects` — Stage 4 (spec §8, §9.9). Object paths stay owner-keyed for Stages 2-3.
--   * A student CREATING their own personal case. `cases_insert_admin` is the only INSERT policy on
--     `cases` and its WITH CHECK requires `organization_id IS NOT NULL`, so an authenticated client
--     inserting an organization-less personal case is refused 42501 (spec §5, measured by MV-157).
--     Spec §5 records that WIDENING THAT IS MV-159's DECISION TO TAKE OR REFUSE. **REFUSED, and
--     here is the reasoning rather than silence:** `ensurePersonalCase` is handed a service-role
--     client at exactly two already-registered account-linking exceptions, so go-forward creation
--     adds no new service-role call site and needs nothing; a client-side personal-case INSERT
--     would be a NEW write verb on a Stage 1 tenancy table, which is precisely the "grant change is
--     a separate reviewed decision" this card refuses; and `cases_personal_student_idx` is PARTIAL,
--     so a client upsert against it would raise 42P10 anyway (spec §4 rule 1, same mechanism).
--     Recorded here because spec §5 names this card as the place the question is answered.
--   * A student reading `organizations` — unchanged from MV-152's recorded gap; Stage 5.
--
-- Release the bound set at the head of the file so it cannot leak into a later migration applied on
-- the same connection. Last line, so it never runs on a failed apply.
reset lock_timeout;
