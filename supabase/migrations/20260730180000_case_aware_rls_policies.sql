-- MV-152 — Case-aware RLS policies: replace MV-150's deny-all with real tenant isolation.
-- Plan: docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md
--       §"Enforcement boundary" (RLS as the authenticated user is load-bearing)
--       §"Authorization rules" · §"Enforcement layers" item 2
-- Card: docs/kanban/cards/MV-152-case-aware-rls-policies.md
--
-- MV-150 (20260730120000) shipped six tenancy tables LOCKED SHUT: RLS enabled AND forced,
-- one named `*_deny_all` policy each, every grant revoked from anon and authenticated. This
-- migration performs the clean seam MV-150 designed for — drop the deny-all, add the real
-- matrix, grant the reviewed minimum:
--
--   organization owner / admin  ->  every case in their organization
--   counsellor                  ->  only cases they are assigned to
--   student                     ->  only the case linked to their Auth user
--   membership status inactive  ->  nothing, immediately, without re-login
--   anon                        ->  nothing anywhere
--
-- STRICTLY POLICY + FUNCTION + GRANT. No table is created, altered, or dropped; no data is
-- touched. `owner`-column relaxation and any backfill remain Stage 2.
--
-- =====================================================================
-- THE RECURSION LANDMINE, and why every lookup is a definer helper
-- =====================================================================
-- A policy on `organization_memberships` whose predicate selects from
-- `organization_memberships` recurses and Postgres aborts the query (42P17, "infinite
-- recursion detected in policy for relation"). The escape is that these helpers are
-- SECURITY DEFINER: they execute as their owner, `postgres`, which holds BYPASSRLS
-- (verified: `select rolbypassrls from pg_roles where rolname='postgres'` is true on both the
-- local stack and the hosted project), so the reads inside them are not re-filtered by the
-- very policies that called them. FORCE ROW LEVEL SECURITY would otherwise subject the table
-- owner to its own policies — BYPASSRLS is what wins, not ownership.
--
-- Consequences, all of them load-bearing:
--   * every helper pins `set search_path = ''` and fully qualifies every object, so a
--     hostile search_path cannot redirect a definer's reads (the same
--     function_search_path_mutable class that 20260618120000 fixed);
--   * every helper derives the actor from `auth.uid()` INTERNALLY and never accepts a
--     caller-supplied actor. `is_case_org_member(case, user)` is the one function taking a
--     user id, and that id is the SUBJECT being validated, never the authority;
--   * every helper is STABLE and side-effect free;
--   * NO policy predicate below contains an inline subquery against a tenancy table.
--     `tests/integration/case-rls.itest.ts` asserts that structurally, from pg_policy.
--
-- =====================================================================
-- Why helper calls are wrapped as `(select f())::uuid[]` and not `(select f(col))`
-- =====================================================================
-- The card proposed `(select private.can_access_case(id))`, extending the `(select auth.uid())`
-- initplan fix from 20260618120000. Measured on the local stack, that shape is wrong twice:
--
--   * `(select f(id))` CORRELATES on a column, so it can never be hoisted to an InitPlan — it
--     becomes a per-row SubPlan, strictly worse than calling `f(id)` directly;
--   * `x = any ((select f()))` does not even parse as the array form: the planner reads
--     `ANY (subquery)` and fails with `operator does not exist: uuid = uuid[]`.
--
-- What actually delivers once-per-statement evaluation AND an index scan is a scalar subquery
-- with an explicit cast — `x = any ((select private.actor_admin_org_ids())::uuid[])`. The cast
-- forces expression context, the subquery becomes an InitPlan evaluated exactly once, and the
-- resulting array parameter is still usable as a ScalarArrayOpExpr index condition:
--
--     Bitmap Heap Scan on cases
--       Recheck Cond: (organization_id = ANY ((InitPlan 1).col1))
--       InitPlan 1 -> Result
--       -> Bitmap Index Scan on cases_organization_id_idx
--
-- So the org-scoped list predicates use the uncorrelated array helpers, and the child tables
-- (`case_assignments`, `invitations`), which are always queried case-scoped, call the boolean
-- helper directly — for those a subselect wrapper would only add a SubPlan. The itest asserts
-- the InitPlan and the absence of a Seq Scan on `cases` at 2000+ rows, where the planner has a
-- real choice.

-- =====================================================================
-- 0  the BYPASSRLS precondition, asserted rather than assumed
-- =====================================================================
-- Everything below rests on the header's claim that the definer helpers' owner holds
-- BYPASSRLS. Until now that claim was a comment with a hand-run verification beside it. Make
-- it a precondition: applied by a role without BYPASSRLS, this migration produces a database
-- whose every membership policy aborts with 42P17 on the first query — a failure that surfaces
-- in a browser, hours later, and reads as an application bug. Fail here instead.
do $$
begin
  if not coalesce((select r.rolbypassrls from pg_catalog.pg_roles r where r.rolname = current_user), false) then
    raise exception
      'MV-152 requires the migration role (%) to hold BYPASSRLS: the private.* helpers below are '
      'SECURITY DEFINER and execute as their OWNER, and it is that owner''s BYPASSRLS -- not '
      'ownership, which FORCE ROW LEVEL SECURITY deliberately defeats -- that stops their reads '
      'being re-filtered by the very policies that call them.', current_user;
  end if;
end;
$$;

-- =====================================================================
-- 1  private helpers — the anti-recursion mechanism
-- =====================================================================

-- The actor's role in one organization, or null when they are not an ACTIVE member. Every
-- other helper funnels through this, so `status = 'inactive'` is a single choke point:
-- revoking a member is a row edit that takes effect on their next statement, with no token
-- change and no re-login. Reads (organization_id, user_id) — the unique constraint's index.
create function private.org_role(p_organization_id uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.role
  from public.organization_memberships m
  where m.organization_id = p_organization_id
    and m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

create function private.is_org_admin(p_organization_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  -- coalesce: a null organization_id (a personal case) yields null, which must read as "no",
  -- not as null propagating into a policy predicate.
  select coalesce(private.org_role(p_organization_id) in ('owner', 'admin'), false);
$$;

-- Management right over a case = admin/owner of the organization that owns it. A personal
-- case (organization_id null) has no manager: nobody administers it, by construction.
create function private.can_manage_case(p_case_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select private.is_org_admin(c.organization_id) from public.cases c where c.id = p_case_id),
    false
  );
$$;

-- CONSULTANCY-SIDE access to a case: org admin/owner, OR a counsellor who is BOTH an active
-- member of the case's organization AND assigned to this case. The membership re-check is what
-- makes a stale `case_assignments` row worthless the moment a membership goes inactive.
--
-- This is `can_access_case` MINUS the student disjunct, and that subtraction is the point.
-- The canonical access matrix (docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md,
-- divergence 6) rules that the student link grants student-scoped rights on one case and NEVER
-- org-scoped rights. Anywhere the question is "may this actor act as the consultancy on this
-- case" — the operational write surface, the assignment roster, the student invitation — the
-- predicate must be this one, not can_access_case, or the student's own link launders them into
-- the counsellor's chair on their own file.
create function private.can_staff_case(p_case_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = p_case_id
      and (
        private.is_org_admin(c.organization_id)
        or (
          exists (
            select 1 from public.organization_memberships m
            where m.organization_id = c.organization_id
              and m.user_id = (select auth.uid())
              and m.status = 'active'
          )
          and exists (
            select 1 from public.case_assignments a
            where a.case_id = c.id and a.user_id = (select auth.uid())
          )
        )
      )
  );
$$;

-- The authorization rules of plan §"Authorization rules", in one predicate: linked student, OR
-- consultancy staff on the case. The two disjuncts are ADDITIVE and independent — that is the
-- canonical dual-role rule (matrix, divergence 6): an actor who is both a member of the org and
-- the case's student holds both sets, revoking the membership removes only the staff half, and
-- an inactive membership contributes nothing because every path into can_staff_case filters
-- `status = 'active'`.
--
-- No policy below uses this predicate directly — the `cases` policies spell the disjuncts out
-- inline so each one lands on its own index (see the InitPlan note in the header), and every
-- child table wants the narrower can_staff_case. It is kept, and kept in sync by construction,
-- because it is the named predicate MV-151's TypeScript matrix and the Stage-5 Storage policies
-- are checked against: one definition of "may this actor touch this case at all".
create function private.can_access_case(p_case_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = p_case_id
      and (
        c.student_user_id = (select auth.uid())
        or private.can_staff_case(c.id)
      )
  );
$$;

-- The organization that owns a case, or null for a personal case. Exists so a policy can tie a
-- child row's `organization_id` to its case's real owner WITHOUT an inline subquery against
-- `cases` (which the anti-recursion rule, and the itest that enforces it structurally, forbid).
create function private.case_org_id(p_case_id uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select c.organization_id from public.cases c where c.id = p_case_id;
$$;

-- Is p_user_id an active member of the organization that owns p_case_id? p_user_id is the
-- SUBJECT under validation (the proposed assignee), never the actor — the actor's own right
-- to act is established separately by can_manage_case. Used to stop an admin from assigning a
-- case to somebody outside the tenant, which would hand their case to another org's staff.
create function private.is_case_org_member(p_case_id uuid, p_user_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.cases c
    join public.organization_memberships m
      on m.organization_id = c.organization_id
     and m.user_id = p_user_id
     and m.status = 'active'
    where c.id = p_case_id
  );
$$;

-- The three actor->organization sets, and the actor->case set. Uncorrelated and argument-free
-- on purpose: that is what lets a policy evaluate them once per statement as an InitPlan
-- (see the header note). Each returns '{}' rather than null so `= any (...)` is always false
-- for a non-member instead of null.
create function private.actor_org_ids()
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(array_agg(m.organization_id), '{}'::uuid[])
  from public.organization_memberships m
  where m.user_id = (select auth.uid()) and m.status = 'active';
$$;

create function private.actor_admin_org_ids()
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(array_agg(m.organization_id), '{}'::uuid[])
  from public.organization_memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.role in ('owner', 'admin');
$$;

create function private.actor_owner_org_ids()
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(array_agg(m.organization_id), '{}'::uuid[])
  from public.organization_memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.role = 'owner';
$$;

-- Assigned cases, gated on the membership still being active — the join is the revocation
-- switch for counsellors, exactly as `status` is for admins.
create function private.actor_assigned_case_ids()
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(array_agg(a.case_id), '{}'::uuid[])
  from public.case_assignments a
  join public.cases c
    on c.id = a.case_id
  join public.organization_memberships m
    on m.organization_id = c.organization_id
   and m.user_id = (select auth.uid())
   and m.status = 'active'
  where a.user_id = (select auth.uid());
$$;

-- =====================================================================
-- 2  drop MV-150's deny-all
-- =====================================================================
drop policy if exists organizations_deny_all            on public.organizations;
drop policy if exists organization_memberships_deny_all on public.organization_memberships;
drop policy if exists cases_deny_all                    on public.cases;
drop policy if exists case_assignments_deny_all         on public.case_assignments;
drop policy if exists invitations_deny_all              on public.invitations;
drop policy if exists audit_events_deny_all             on public.audit_events;

-- =====================================================================
-- 3  organizations — members read, OWNERS rename, owners delete
-- =====================================================================
-- No INSERT policy and no INSERT grant: creating a tenant is an onboarding path that also
-- has to mint the first owner membership atomically, which is a service-role operation on the
-- enforcement boundary's enumerated exception list (Stage 5), not something a browser does.
create policy organizations_select_member on public.organizations
  for select to authenticated
  using (id = any ((select private.actor_org_ids())::uuid[]));

-- Owner-only, not admin. The plan reserves "controls organization-level settings" to the owner
-- and gives the admin "manages team access" and "all organization cases" — the tenant's own
-- name and slug are neither (canonical access matrix, divergence 1). The columns in the grant
-- are `name` and `slug`: slug is the tenant's URL identity and unique across the whole table,
-- so an admin holding this verb could rename their org onto a slug a competitor is about to
-- claim, or break every existing link to it. Same reasoning that already reserves
-- `organizations` DELETE and owner memberships to the owner.
create policy organizations_update_owner on public.organizations
  for update to authenticated
  using       (id = any ((select private.actor_owner_org_ids())::uuid[]))
  with check  (id = any ((select private.actor_owner_org_ids())::uuid[]));

create policy organizations_delete_owner on public.organizations
  for delete to authenticated
  using (id = any ((select private.actor_owner_org_ids())::uuid[]));

-- =====================================================================
-- 4  organization_memberships — the recursion hotspot
-- =====================================================================
-- Members see their own row plus their co-members. An inactive member keeps sight of their
-- own row (it is theirs, and it must survive for the audit trail) but loses every co-member,
-- because actor_org_ids() no longer returns the org.
create policy organization_memberships_select_member on public.organization_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or organization_id = any ((select private.actor_org_ids())::uuid[])
  );

-- Admins manage the team, with one carve-out: only an OWNER may mint, alter, or remove an
-- `owner` membership. Without it an admin could promote themselves to owner and then delete
-- the organization — an in-tenant privilege escalation the case-access matrix says nothing
-- about. Deliberate, and noted on the card so MV-151's matrix can mirror it.
create policy organization_memberships_insert_admin on public.organization_memberships
  for insert to authenticated
  with check (
    organization_id = any ((select private.actor_admin_org_ids())::uuid[])
    and (role <> 'owner' or organization_id = any ((select private.actor_owner_org_ids())::uuid[]))
  );

-- USING gates the row as it stands; WITH CHECK gates the row as it would become, so neither
-- "demote the owner" nor "promote myself to owner" is reachable from an admin session. The
-- tenant-identifying columns (organization_id, user_id) are not in the column grant at all,
-- so a membership cannot be walked into another org either.
create policy organization_memberships_update_admin on public.organization_memberships
  for update to authenticated
  using (
    organization_id = any ((select private.actor_admin_org_ids())::uuid[])
    and (role <> 'owner' or organization_id = any ((select private.actor_owner_org_ids())::uuid[]))
  )
  with check (
    organization_id = any ((select private.actor_admin_org_ids())::uuid[])
    and (role <> 'owner' or organization_id = any ((select private.actor_owner_org_ids())::uuid[]))
  );

create policy organization_memberships_delete_admin on public.organization_memberships
  for delete to authenticated
  using (
    organization_id = any ((select private.actor_admin_org_ids())::uuid[])
    and (role <> 'owner' or organization_id = any ((select private.actor_owner_org_ids())::uuid[]))
  );

-- =====================================================================
-- 5  cases — the unit the whole matrix exists to protect
-- =====================================================================
-- Three disjuncts, each backed by its own MV-150 index (cases_student_user_id_idx,
-- cases_organization_id_idx, cases_pkey), so the planner can answer "which cases may I see"
-- with a BitmapOr of index scans rather than a heap sweep. The third disjunct is the
-- counsellor's assigned-only grant; membership-active is already folded into the helper.
create policy cases_select_accessor on public.cases
  for select to authenticated
  using (
    student_user_id = (select auth.uid())
    or organization_id = any ((select private.actor_admin_org_ids())::uuid[])
    or id = any ((select private.actor_assigned_case_ids())::uuid[])
  );

-- Only an org admin creates a case, and only inside their own organization. A personal case
-- (organization_id null) is created by the anonymous-claim path in Stage 2, which runs as
-- service-role — deliberately not opened to clients here.
-- `student_user_id` may only be null or the creator themselves: linking a case to somebody
-- else's Auth account is invitation acceptance (an atomic compare-and-swap, Stage 5), never a
-- field a consultancy can point at a stranger.
create policy cases_insert_admin on public.cases
  for insert to authenticated
  with check (
    organization_id is not null
    and organization_id = any ((select private.actor_admin_org_ids())::uuid[])
    and (student_user_id is null or student_user_id = (select auth.uid()))
  );

-- WITH CHECK repeats USING against the NEW row: if a row were ever moved to an organization
-- the actor does not administer, or de-tenanted to a personal case that is not theirs, the
-- new row fails the same predicate and the statement is rejected. Belt: the tenant-defining
-- columns are absent from the column-level UPDATE grant, so the escape is not even
-- expressible from a client. Braces: this clause, which still holds if that grant widens.
--
-- This policy answers "may this actor update this ROW". It deliberately does NOT answer "which
-- COLUMNS" — a linked student passes the first disjunct and would otherwise inherit the whole
-- counsellor write surface. Section 5a is the column half.
create policy cases_update_accessor on public.cases
  for update to authenticated
  using (
    student_user_id = (select auth.uid())
    or organization_id = any ((select private.actor_admin_org_ids())::uuid[])
    or id = any ((select private.actor_assigned_case_ids())::uuid[])
  )
  with check (
    student_user_id = (select auth.uid())
    or organization_id = any ((select private.actor_admin_org_ids())::uuid[])
    or id = any ((select private.actor_assigned_case_ids())::uuid[])
  );

create policy cases_delete_admin on public.cases
  for delete to authenticated
  using (organization_id = any ((select private.actor_admin_org_ids())::uuid[]));

-- =====================================================================
-- 5a  cases — the COLUMN half of the write surface
-- =====================================================================
-- RLS gates rows. It cannot gate columns, and a column GRANT cannot gate actors: every client
-- in this system arrives as the single role `authenticated`, so `grant update (…) to
-- authenticated` is necessarily flat across owner, admin, counsellor and student alike. That
-- flatness is a privilege-escalation path, not a cosmetic gap — cases_update_accessor admits
-- the linked student on the student disjunct, and the flat grant then hands them
-- `operational_status` and `archived_at`: the consultancy's own operational record on a case
-- the consultancy owns.
--
-- The canonical access matrix (divergences 2 and 4) settles the split:
--
--   display_name, email       — profile fields. The student's surface, per the plan's
--                               "updates permitted profile fields"; staff hold it too, per
--                               "manages the student profile".
--   operational_status        — consultancy staff only (org admin/owner, or the assigned
--                               counsellor "records review decisions"). Never the student.
--   archived_at               — org owner/admin only. The plan lists archive under the owner
--                               and gives the admin "all organization cases"; a counsellor
--                               never archives, and neither does a student.
--
-- A BEFORE UPDATE trigger is the mechanism because the rule needs OLD and NEW in one place: a
-- WITH CHECK sees only NEW, so it cannot tell "the student is archiving this case" from "the
-- student is renaming a case that was already archived". `is distinct from` makes the guard
-- fire on a real change only, nulls included, so an unrelated column edit on an archived case
-- is untouched.
create function private.enforce_case_write_surface()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  -- SECURITY INVOKER, and this is why: the guard must see the CALLER's role. Roles holding
  -- BYPASSRLS — the migration owner, and `service_role` — are already exempt from every policy
  -- above; this trigger is the column half of the same boundary and must be exempt on exactly
  -- the same terms, no wider. Stage 2's anonymous-claim path and Stage 5's invitation
  -- acceptance run as service_role and must be able to set operational_status.
  --
  -- Deliberately UNLIKE MV-150's append-only audit trigger, which raises even for service_role.
  -- Audit immutability is an absolute property of the table; this is an authorization rule
  -- about actors, and the server acting on an authorized flow's behalf is not one of them.
  if coalesce((select r.rolbypassrls from pg_catalog.pg_roles r where r.rolname = current_user), false) then
    return new;
  end if;

  if new.archived_at is distinct from old.archived_at
     and not private.is_org_admin(old.organization_id) then
    -- 42501 insufficient_privilege: PostgREST maps it to 403, and it is the same code a
    -- missing column grant raises — so a client cannot tell the two refusals apart, and a
    -- reviewer reading the itest sees one vocabulary for "denied".
    raise exception 'cases.archived_at is writable only by an organization owner or admin'
      using errcode = '42501';
  end if;

  if new.operational_status is distinct from old.operational_status
     and not private.can_staff_case(old.id) then
    raise exception 'cases.operational_status is writable only by consultancy staff on this case'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger cases_write_surface_guard
  before update on public.cases
  for each row execute function private.enforce_case_write_surface();

-- =====================================================================
-- 6  case_assignments — who a case is worked by
-- =====================================================================
-- Case-scoped in every real query, so the boolean helper is called directly (a subselect
-- wrapper would only turn it into a per-row SubPlan).
--
-- ONE predicate, `can_staff_case`, replacing an earlier `user_id = auth.uid() or
-- can_access_case(case_id)`. Both of those disjuncts were leaks the canonical matrix closes:
--
--   * `user_id = (select auth.uid())` was ungated on membership status. It was there for the
--     index, and it meant a REVOKED counsellor kept reading their own assignment rows — the
--     roster of which of the org's cases they had worked — forever. "Inactive membership
--     grants nothing" has to mean nothing (matrix, structural rule 1). can_staff_case reaches
--     the same rows through actor-side membership checks that all filter `status = 'active'`;
--     real queries here are case- or user-scoped and hit an index on the column, not on this
--     predicate.
--   * `can_access_case` carries the student disjunct, so a linked student could read the
--     assignment roster of their own case. Who staffs a case is consultancy-internal operating
--     data — the plan's "cannot see consultancy-only notes, audit data" — and the student link
--     must not confer org-scoped rights (matrix, divergence 6).
create policy case_assignments_select_accessor on public.case_assignments
  for select to authenticated
  using (private.can_staff_case(case_id));

-- Two conditions, two different jobs: can_manage_case says the ACTOR may hand out work on
-- this case; is_case_org_member says the ASSIGNEE is inside the same tenant. Without the
-- second, an admin could assign another organization's staff to their case and leak it
-- outward — an insider-initiated cross-tenant grant.
create policy case_assignments_insert_admin on public.case_assignments
  for insert to authenticated
  with check (
    private.can_manage_case(case_id)
    and private.is_case_org_member(case_id, user_id)
  );

-- No UPDATE policy and no UPDATE grant: re-assignment is delete + insert, which keeps the
-- partial unique index (one primary counsellor per case) the only arbiter.
create policy case_assignments_delete_admin on public.case_assignments
  for delete to authenticated
  using (private.can_manage_case(case_id));

-- =====================================================================
-- 7  invitations — two shapes, two different authorities
-- =====================================================================
-- TEAM invite  — `organization_id` set, `case_id` null, role in (owner, admin, counsellor).
--                Org admins mint it; only an OWNER may mint role = 'owner'.
-- STUDENT invite — `case_id` set, role = 'student', organization_id tied to the case's org.
--                Consultancy staff on that case mint it — INCLUDING the assigned counsellor,
--                whose job description in the plan is literally "invites the student to
--                collaborate" (matrix, divergence 3).
--
-- THE SCHEMA TRAP, stated so the next reader does not walk into it: `invitations.role` and
-- `organization_memberships.role` are DIFFERENT SETS. invitations adds 'student'; memberships
-- does not have it. They are never to be cross-checked or refactored into a shared predicate —
-- an invitation's role names the membership it will mint OR the student link it will create,
-- and only invitations_shape_check knows which.
--
-- Each branch below spells out its own `case_id is null` / `case_id is not null` and its own
-- role condition rather than leaning on invitations_shape_check to keep them disjoint. A CHECK
-- constraint is a data-integrity rule that a later migration may relax; this is a security
-- predicate, and it must be readable as sound on its own face.
--
-- token_hash needs no column-level treatment: an actor with no authority over either the org
-- or the case matches no row at all, so there is nothing to read it from. Revoking column
-- SELECT on token_hash was considered and rejected — it would make `select *` fail for every
-- client while protecting only a non-reversible hash from the very person who minted it.
create policy invitations_select_staff on public.invitations
  for select to authenticated
  using (
    (case_id is null and organization_id = any ((select private.actor_admin_org_ids())::uuid[]))
    or (case_id is not null and private.can_staff_case(case_id))
  );

create policy invitations_insert_staff on public.invitations
  for insert to authenticated
  with check (
    (
      -- Team invite. The `role <> 'owner'` carve-out mirrors organization_memberships exactly:
      -- without it, an admin denied an owner MEMBERSHIP just mints an owner INVITATION instead
      -- and walks through the same door with a different key. Same escalation, same close.
      case_id is null
      and organization_id = any ((select private.actor_admin_org_ids())::uuid[])
      and role <> 'student'
      and (role <> 'owner' or organization_id = any ((select private.actor_owner_org_ids())::uuid[]))
    )
    or (
      -- Student invite. `is not distinct from` (not `=`) because a personal case has a null
      -- organization_id and null = null is null, not true. Without this tie the shape check
      -- leaves organization_id entirely unconstrained on a case invite, so a student invite
      -- could be stamped with ANOTHER tenant's org id — which invitations_select_staff's first
      -- branch would then show to that tenant's admins, handing them the row (and the email of
      -- a student who is not theirs) for a case they cannot see.
      case_id is not null
      and role = 'student'
      and private.can_staff_case(case_id)
      and organization_id is not distinct from private.case_org_id(case_id)
    )
  );

-- Revocation only. `accepted_at` is outside the column grant, so acceptance stays a
-- service-role compare-and-swap (Stage 5) — a client that could write accepted_at could
-- accept an invitation it merely knows the id of. No DELETE policy either: revocation is the
-- audited path, and a deleted invitation is a deleted record of who was invited.
-- The predicate is the SELECT predicate: whoever may see an invitation may revoke it. Neither
-- `role` nor `organization_id` is in the column grant, so the INSERT-time constraints above
-- cannot be walked around by minting a legal invitation and then editing it.
create policy invitations_update_staff on public.invitations
  for update to authenticated
  using (
    (case_id is null and organization_id = any ((select private.actor_admin_org_ids())::uuid[]))
    or (case_id is not null and private.can_staff_case(case_id))
  )
  with check (
    (case_id is null and organization_id = any ((select private.actor_admin_org_ids())::uuid[]))
    or (case_id is not null and private.can_staff_case(case_id))
  );

-- =====================================================================
-- 8  audit_events — org-admin SELECT, and nothing else, ever
-- =====================================================================
-- Append-only is a database property (MV-150's BEFORE UPDATE trigger raises even for
-- service_role). MV-152 narrows visibility and adds NOTHING else: no INSERT policy (writes
-- stay behind private.write_audit_event), no UPDATE policy, no DELETE policy. Adding a CRUD
-- set here while "doing all six tables" would quietly retire the audit guarantee.
create policy audit_events_select_admin on public.audit_events
  for select to authenticated
  using (organization_id = any ((select private.actor_admin_org_ids())::uuid[]));

-- =====================================================================
-- 9  grant review
-- =====================================================================
-- Start from MV-150's revoked state and re-assert it, so this block is the complete and
-- readable statement of what a client role may do. anon is named in the revoke and appears
-- nowhere else: it holds no table verb, no column, and no helper.
revoke all on public.organizations, public.organization_memberships, public.cases,
              public.case_assignments, public.invitations, public.audit_events
  from anon, authenticated;

-- Table-level verbs.
grant select, delete                 on public.organizations            to authenticated;
grant select, insert, delete         on public.organization_memberships to authenticated;
grant select, insert, delete         on public.cases                    to authenticated;
grant select, insert, delete         on public.case_assignments         to authenticated;
grant select, insert                 on public.invitations              to authenticated;
grant select                         on public.audit_events             to authenticated;

-- Column-level UPDATE. This list is a security boundary, not ergonomics: a column absent here
-- cannot be written by any client on any code path, whatever a policy says. In particular
-- cases.organization_id and cases.student_user_id are absent, which is what makes "move this
-- case to another tenant" and "repoint it at another student" unexpressible rather than
-- merely rejected; and invitations.accepted_at is absent, which is what keeps acceptance a
-- server-side compare-and-swap.
grant update (name, slug)                                       on public.organizations            to authenticated;
grant update (role, status)                                     on public.organization_memberships to authenticated;
grant update (display_name, email, operational_status, archived_at)
                                                                on public.cases                    to authenticated;
grant update (revoked_at)                                       on public.invitations              to authenticated;

-- Policy predicates are evaluated as the calling role, so `authenticated` needs USAGE on the
-- schema and EXECUTE on each helper or every policy above raises permission denied. This is
-- safe ONLY because `private` is not a PostgREST-exposed schema (supabase/config.toml
-- `[api] schemas = ["public", "graphql_public"]`, and the hosted project matches): there is no
-- RPC route to any of these, so a client cannot call can_access_case as an oracle. If a future
-- migration ever exposes `private`, that assumption dies and these grants must be revisited.
--
-- The revoke is not ceremony. A new function's EXECUTE defaults to PUBLIC, and anon is in
-- PUBLIC — so without this, `has_function_privilege('anon', 'private.org_role(uuid)',
-- 'execute')` is TRUE the moment the function is created. Schema USAGE still keeps anon out
-- today, which is exactly what makes it the kind of latent grant nobody notices until a
-- later migration widens the schema. Same pattern MV-150 applied to private.write_audit_event.
revoke all on function
  private.org_role(uuid),
  private.is_org_admin(uuid),
  private.can_manage_case(uuid),
  private.can_staff_case(uuid),
  private.can_access_case(uuid),
  private.case_org_id(uuid),
  private.is_case_org_member(uuid, uuid),
  private.actor_org_ids(),
  private.actor_admin_org_ids(),
  private.actor_owner_org_ids(),
  private.actor_assigned_case_ids(),
  private.enforce_case_write_surface()
  from public;

grant usage on schema private to authenticated;
grant execute on function private.org_role(uuid)                     to authenticated;
grant execute on function private.is_org_admin(uuid)                 to authenticated;
grant execute on function private.can_manage_case(uuid)              to authenticated;
grant execute on function private.can_staff_case(uuid)               to authenticated;
grant execute on function private.can_access_case(uuid)              to authenticated;
grant execute on function private.case_org_id(uuid)                  to authenticated;
grant execute on function private.is_case_org_member(uuid, uuid)     to authenticated;
grant execute on function private.actor_org_ids()                    to authenticated;
grant execute on function private.actor_admin_org_ids()              to authenticated;
grant execute on function private.actor_owner_org_ids()              to authenticated;
grant execute on function private.actor_assigned_case_ids()          to authenticated;

-- The trigger guard is SECURITY INVOKER, so it runs with the updating client's privileges and
-- needs EXECUTE. Granting it opens nothing: a function returning `trigger` cannot be called
-- directly ("trigger functions can only be called as triggers"), and `private` is not a
-- PostgREST-exposed schema in any case.
grant execute on function private.enforce_case_write_surface()       to authenticated;

-- private.write_audit_event keeps MV-150's grants unchanged: the review's conclusion is that
-- NO client role gets EXECUTE. Audit rows are written by server paths running as service_role
-- or by the definer's owner; whichever Stage-5 path needs it grants it then, with the same
-- named justification MV-150 asked for.

-- =====================================================================
-- Deliberate omissions (recorded so a reviewer sees refusal, not oversight)
-- =====================================================================
--   * organizations INSERT — tenant creation is service-role onboarding (Stage 5).
--   * cases INSERT for a personal case — created by the anonymous-claim path (Stage 2).
--   * cases DELETE for a personal case's own student — right-to-delete for personal cases
--     lands with the personal-case path (Stage 2), not before it exists.
--   * a student reading `organizations` — students hold no membership, so they cannot see the
--     name of the consultancy handling their case. Real journey gap, opened deliberately:
--     closing it needs a case->org read grant that widens the tenancy surface, which belongs
--     with the Stage-5 student portal.
--   * archiving a PERSONAL case — section 5a makes archived_at owner/admin-only, and a personal
--     case (organization_id null) has no organization and therefore no owner or admin. So
--     nobody can archive one from a client. That is the same shape as the personal-case DELETE
--     gap above and lands with the same Stage-2 personal-case path; it is a gap in a surface
--     MV-150 shipped closed, never a regression.
--   * finer per-field splitting on `cases` beyond section 5a's three tiers — the document
--     request/review model and the internal-note visibility classification (plan §"Document
--     request and review model") are Stage 5, on tables that do not exist yet.
--   * invitations DELETE and case_assignments UPDATE — revocation and delete+insert are the
--     audited equivalents.
