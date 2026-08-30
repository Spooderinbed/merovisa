-- MV-196 — Stage 5 slice 4: a linked student READS their consultancy case and WRITES nothing.
--
-- ---------------------------------------------------------------------------------------
-- WHAT WAS OPEN, AND HOW IT WAS MEASURED
-- ---------------------------------------------------------------------------------------
-- `private.actor_case_ids()` answers "which cases may this actor touch", and its first
-- disjunct is `c.student_user_id = auth.uid()`. That was written when the student link meant
-- one thing — a case the student OWNS. MV-194 ended that: accepting an invitation makes the
-- student `cases.student_user_id` on an ORG-OWNED case, and every WRITE policy on the nine
-- student-data tables rides the same function the READ policies do.
--
-- `tests/integration/stage5-student-write-boundary.itest.ts` measured the result against a real
-- database, as the linked student, through their own JWT, straight to PostgREST with no route
-- in between. Seven of eight write probes on the consultancy case SUCCEEDED: updating the case
-- profile, updating a plan item, DELETING A DOCUMENT, and inserting shortlist state, a checklist
-- tick, an application attempt and an outcome event. Only `program_predictions` refused, and
-- only incidentally — `pp_insert_case` carries an extra `assessment_case_id(...) = case_id`
-- conjunct that happened not to hold, which is not a student boundary and would not survive a
-- differently-shaped payload.
--
-- ---------------------------------------------------------------------------------------
-- THE FIX, AND WHY IT IS NOT `can_staff_case`
-- ---------------------------------------------------------------------------------------
-- `private.can_staff_case` is `can_access_case` MINUS the student disjunct, and Stage 4's
-- `case_document_*` policies use it precisely to keep the student out of the counsellor's chair.
-- It is the WRONG predicate here. On a PERSONAL case there is no staff at all — the student is
-- the only writer there is, and the entire self-serve product writes through these policies.
-- Swapping to `can_staff_case` would not narrow the student version, it would silently make it
-- read-only.
--
-- So the predicate this needs is neither of the two that exist: staff of the case, OR the
-- student of a case that belongs to NO organization. That is `private.actor_writable_case_ids()`
-- below — `actor_case_ids()` with its student arm narrowed by `organization_id is null`, and
-- nothing else changed. The admin and assignment arms are byte-identical, so no counsellor,
-- admin or owner loses anything.
--
-- READ POLICIES ARE DELIBERATELY UNTOUCHED. MV-195 decision D is that the linked student sees
-- the request, the version and the rejection note on their consultancy case and answers none of
-- them. Every `*_select_*` policy keeps riding `actor_case_ids()`; this migration is the write
-- half of that same split, and `lib/cases/permissions.ts` carries it as the `linked` /
-- `linked-personal` scope pair so the two layers cannot drift.
--
-- WHY BOTH LAYERS. `lib/cases/README.md`: "This layer allowing something the database denies is
-- a broken feature; the database allowing something this layer denies is a SECURITY HOLE." The
-- TypeScript cell alone would not have closed this, because `NEXT_PUBLIC_SUPABASE_URL` and the
-- anon key ship in client JS and the student's access token is in their own browser — PostgREST
-- is reachable without passing through a single line of TypeScript. That is exactly how the
-- seven probes above were issued.

begin;

-- ---------------------------------------------------------------------------------------
-- The predicate
-- ---------------------------------------------------------------------------------------
-- Mirrors `private.actor_case_ids()` exactly — security definer, stable, empty search_path so
-- every reference is schema-qualified — except for the `c.organization_id is null` qualifier on
-- the student arm. Kept as a SEPARATE function rather than a parameter on the existing one so
-- that a future reader diffing the two sees the single difference, and so no read policy can be
-- accidentally re-pointed at the narrower set by editing one shared body.
create or replace function private.actor_writable_case_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
  from public.cases c
  where (c.organization_id is null and c.student_user_id = (select auth.uid()))
     or c.organization_id = any (private.actor_admin_org_ids())
     or c.id = any (private.actor_assigned_case_ids());
$$;

revoke all on function private.actor_writable_case_ids() from public;
grant execute on function private.actor_writable_case_ids() to authenticated;

comment on function private.actor_writable_case_ids() is
  'MV-196: cases this actor may WRITE — staff of the case, or the student of a case that belongs '
  'to no organization. Differs from private.actor_case_ids() only by `organization_id is null` on '
  'the student arm, which is what stops a linked student writing their consultancy''s case. Read '
  'policies must keep using actor_case_ids(): the student READS that case (MV-195 decision D).';

-- ---------------------------------------------------------------------------------------
-- The eighteen write policies, re-pointed. Every extra conjunct is preserved verbatim.
-- ---------------------------------------------------------------------------------------

-- profiles ------------------------------------------------------------------------------
drop policy if exists profiles_insert_case on public.profiles;
create policy profiles_insert_case on public.profiles
  as permissive for insert to authenticated
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
    and (owner is null or owner = private.case_student_id(case_id))
  );

drop policy if exists profiles_update_case on public.profiles;
create policy profiles_update_case on public.profiles
  as permissive for update to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  )
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  );

-- cases -----------------------------------------------------------------------------------
-- THE CASE ROW ITSELF. `cases_update_accessor` is deliberately NOT touched, and the reason is
-- worth stating because narrowing it was the obvious move and it was wrong.
--
-- That policy inlines the same three arms as `actor_case_ids()`, so re-pointing the data tables
-- left `case.update` at case granularity open — MV-153's matrix caught exactly that, with the
-- TypeScript cell denying while the database still reported "row updated". The obvious fix is to
-- add `organization_id is null` to its student arm. Doing so REGRESSES MV-152: that policy is
-- what lets the row be reached at all, and `enforce_case_write_surface` is what decides which
-- COLUMNS may change. Filtering the row away instead turns MV-152's explicit
-- "cases.operational_status is writable only by consultancy staff" (42501) into a silent
-- zero-row update — the precise failure its own test is named for: "must be rejected, not
-- silently applied".
--
-- So the refusal belongs in the trigger, where the vocabulary already is.
--
-- WHAT CHANGES: a non-staff actor on an ORG-OWNED case may now write NO column of it. Before,
-- the linked student could edit the case's profile fields — a surface designed at MV-152, when a
-- "linked student" could only mean a student on their own case, because no student could accept
-- an invitation until MV-194. Stage 5 gave that link a second meaning, and MV-195 decided which
-- one governs: on a consultancy's case the student READS and answers nothing.
--
-- WHAT DOES NOT CHANGE: the personal case. `organization_id is null` skips the new clause
-- entirely, so the student still drives their own case and is still refused `operational_status`
-- and `archived_at` there by the two clauses below — the asymmetry MV-153 re-pins.
create or replace function private.enforce_case_write_surface()
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

  -- MV-196: on a case a CONSULTANCY owns, only its staff write anything at all.
  --
  -- FIRST, so its message is the one a linked student actually receives rather than the
  -- narrower column complaints below. `can_staff_case` is `can_access_case` minus the student
  -- disjunct, which is exactly the distinction this clause needs; on a personal case
  -- (`organization_id is null`) there is no staff and the clause is skipped, leaving the student
  -- their own workspace.
  if old.organization_id is not null and not private.can_staff_case(old.id) then
    raise exception 'this case belongs to a consultancy: only its staff may edit it'
      using errcode = '42501',
            hint = 'MV-196: a linked student reads their consultancy case and answers through '
                   'the document-request flow, never by writing the case row.';
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

-- assessments ---------------------------------------------------------------------------
-- Found by ENUMERATION, not by the probe: after re-pointing the sixteen policies the probe
-- covers, a `pg_policies` sweep for write policies still naming `actor_case_ids()` returned this
-- one. The probe measured eight tables; the boundary is nine. Keeping the sweep in the test
-- suite (criterion 2) is what stops the next table from being missed the same way.
drop policy if exists assessments_update_case on public.assessments;
create policy assessments_update_case on public.assessments
  as permissive for update to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  )
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  );

-- plan_items ----------------------------------------------------------------------------
drop policy if exists plan_items_insert_case on public.plan_items;
create policy plan_items_insert_case on public.plan_items
  as permissive for insert to authenticated
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
    and (owner is null or owner = private.case_student_id(case_id))
  );

drop policy if exists plan_items_update_case on public.plan_items;
create policy plan_items_update_case on public.plan_items
  as permissive for update to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  )
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  );

-- documents -----------------------------------------------------------------------------
-- INSERT is not here on purpose: `documents` grants `authenticated` no INSERT at all, and the
-- only insert policy is `Service inserts documents` (to service_role). That is why
-- `app/api/documents/upload/route.ts` writes through the admin client, and why the TypeScript
-- `case.update` check is the ONLY gate on the upload path — the database cannot be the backstop
-- for a write it never sees as the user. DELETE is a different story and is closed here.
drop policy if exists documents_delete_case on public.documents;
create policy documents_delete_case on public.documents
  as permissive for delete to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  );

-- user_program_state --------------------------------------------------------------------
drop policy if exists ups_insert_case on public.user_program_state;
create policy ups_insert_case on public.user_program_state
  as permissive for insert to authenticated
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
    and (owner is null or owner = private.case_student_id(case_id))
  );

drop policy if exists ups_update_case on public.user_program_state;
create policy ups_update_case on public.user_program_state
  as permissive for update to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  )
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  );

drop policy if exists ups_delete_case on public.user_program_state;
create policy ups_delete_case on public.user_program_state
  as permissive for delete to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  );

-- document_status -----------------------------------------------------------------------
drop policy if exists ds_insert_case on public.document_status;
create policy ds_insert_case on public.document_status
  as permissive for insert to authenticated
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
    and (owner is null or owner = private.case_student_id(case_id))
  );

drop policy if exists ds_update_case on public.document_status;
create policy ds_update_case on public.document_status
  as permissive for update to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  )
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  );

drop policy if exists ds_delete_case on public.document_status;
create policy ds_delete_case on public.document_status
  as permissive for delete to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  );

-- program_predictions -------------------------------------------------------------------
drop policy if exists pp_insert_case on public.program_predictions;
create policy pp_insert_case on public.program_predictions
  as permissive for insert to authenticated
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
    and (owner is null or owner = private.case_student_id(case_id))
    and private.assessment_case_id(assessment_id) = case_id
    and (
      supersedes_prediction_id is null
      or private.prediction_case_id(supersedes_prediction_id) = case_id
    )
  );

drop policy if exists pp_delete_case on public.program_predictions;
create policy pp_delete_case on public.program_predictions
  as permissive for delete to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  );

-- application_attempts ------------------------------------------------------------------
drop policy if exists aa_insert_case on public.application_attempts;
create policy aa_insert_case on public.application_attempts
  as permissive for insert to authenticated
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
    and (owner is null or owner = private.case_student_id(case_id))
    and private.prediction_case_id(prediction_id) = case_id
  );

drop policy if exists aa_delete_case on public.application_attempts;
create policy aa_delete_case on public.application_attempts
  as permissive for delete to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  );

-- outcome_events ------------------------------------------------------------------------
drop policy if exists oe_insert_case on public.outcome_events;
create policy oe_insert_case on public.outcome_events
  as permissive for insert to authenticated
  with check (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
    and (owner is null or owner = private.case_student_id(case_id))
    and private.attempt_case_id(attempt_id) = case_id
    and source = 'self_reported'::text
    and verified_by is null
    and (
      supersedes_event_id is null
      or private.outcome_event_case_id(supersedes_event_id) = case_id
    )
  );

drop policy if exists oe_delete_case on public.outcome_events;
create policy oe_delete_case on public.outcome_events
  as permissive for delete to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_writable_case_ids())::uuid[])
  );

commit;
