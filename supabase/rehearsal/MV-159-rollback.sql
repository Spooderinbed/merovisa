-- MV-159 — ROLLBACK. This is a SCRIPT, not a migration: it is never applied by
-- `supabase db push` and it carries no entry in supabase_migrations.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/rehearsal/MV-159-rollback.sql
--
-- Order is spec §10.1 **R2**, which is authoritative
-- (docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md):
--   1  drop the 24 case-aware policies
--   2  re-apply the pre-Stage-2 (legacy owner) policy set VERBATIM — the 24 shapes captured in
--      spec §2.6 from the hosted project on 2026-08-02
--   3  THEN drop the four new `private` helpers    ← reversed, Postgres refuses with 2BP01
--
-- The whole script is ONE transaction, so no session ever observes a table with no policy at all.
-- That matters more here than it did on MV-155/MV-156: RLS is FORCED on all nine, and a table with
-- RLS forced and zero policies returns ZERO ROWS to every client — a total, silent outage of the
-- student-facing product for the length of the window.
--
-- ============================ ITS PREDECESSOR, AND ITS POINT OF NO RETURN ============================
--
-- VALID PREDECESSOR STATE: **MV-159 applied and MV-160 NOT applied.** Guards 0-2 below check
-- exactly that against the DATABASE rather than trusting the operator.
--
-- WHY MV-160 IS THE HARD BOUNDARY, and it is not a policy question: MV-160 sets `case_id NOT NULL`
-- on eight of the nine and DROPS the legacy owner-keyed uniques and the legacy owner composite-FK
-- chain. The legacy policies this script restores are `(select auth.uid()) = owner` — and after
-- MV-160 a consultancy row legitimately has `owner IS NULL`, so restoring them would make every
-- such row invisible to the counsellor who owns the case, silently. Spec §10.1 is explicit that
-- the unwind is stage-level and strictly reverse-DAG: **R1 (MV-160) must run before this script.**
-- Guard 2 refuses rather than producing that state.
--
-- POINT OF NO RETURN, STATED PLAINLY: there isn't one for THIS script. It mutates no data, creates
-- no object a later slice depends on, and can be run and re-run. The stage's real expiries live
-- one and two steps further down the unwind — R5's `SET NOT NULL` on `owner` (expires the moment
-- Stage 3 writes its first consultancy row) and R6's personal-case delete (expired when MV-157
-- merged, which it has). This script is the cheap, exact, instant step; everything expensive is
-- below it.
--
-- WHAT IT DOES NOT RESTORE, DELIBERATELY: the `documents` policies come back with **no `to` clause**,
-- exactly as they were. That is a defect MV-159 fixed (they apply to `PUBLIC`, which includes
-- `anon`), and a rollback that quietly kept the fix would not be a rollback — it would be a second,
-- unreviewed migration wearing an unwind's name. It is harmless in the restored state for the same
-- reason it was harmless before: `anon` holds no grant on `documents`. Guard 3 re-asserts that.

begin;

-- =====================================================================
-- Guard 0 — this database has MV-159 applied
-- =====================================================================
do $$
declare
  v_policies int;
begin
  select count(*) into v_policies
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polname like '%\_case';
  if v_policies <> 24 then
    raise exception 'MV-159 rollback refuses: expected 24 *_case policies on the nine student '
      'tables, found %. This script only runs against a database with MV-159 applied.', v_policies;
  end if;
end;
$$;

-- =====================================================================
-- Guard 1 — the four helpers this script drops are the ones MV-159 created
-- =====================================================================
do $$
declare
  v_helpers int;
begin
  select count(*) into v_helpers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('actor_case_ids', 'assessment_case_id', 'prediction_case_id', 'attempt_case_id');
  if v_helpers <> 4 then
    raise exception 'MV-159 rollback refuses: expected 4 MV-159 helpers in schema private, found %.', v_helpers;
  end if;
end;
$$;

-- =====================================================================
-- Guard 2 — no `owner IS NULL` row exists, and (as a proxy) MV-160 has not been applied
-- =====================================================================
-- ROUND 2 REORDERED THIS GUARD AROUND THE ACTUAL HAZARD. It used to key ONLY on "has MV-160 run?",
-- which is a PROXY: the thing that makes restoring `(select auth.uid()) = owner` dangerous is not
-- MV-160 itself, it is the existence of rows with `owner IS NULL`, because those become invisible
-- to the counsellor who legitimately owns their case — silently, since an RLS SELECT refusal
-- returns zero rows and no error.
--
-- The proxy and the hazard are NOT the same set, and the gap is reachable today rather than
-- theoretical: MV-156 made `owner` nullable and MV-157's dual-write writes `owner IS NULL` on
-- every consultancy-created row, so the FIRST consultancy row makes this rollback lossy while
-- MV-160 is still months away and every proxy check below still passes happily. Stage 3 is when
-- that starts happening in volume; nothing prevents it before then.
--
-- So the hazard is checked FIRST and directly, and the MV-160 proxies are kept as the ORDERING
-- guard they always really were (spec §10.1: the unwind is strictly reverse-DAG, R1 before R2).
do $$
declare
  v_ownerless int;
  v_detail    text;
begin
  select coalesce(sum(n), 0), string_agg(tbl || '=' || n, ', ' order by tbl)
    into v_ownerless, v_detail
    from (
      select 'profiles' as tbl, count(*) as n from public.profiles where owner is null and case_id is not null
      union all select 'plan_items', count(*) from public.plan_items where owner is null and case_id is not null
      union all select 'user_program_state', count(*) from public.user_program_state where owner is null and case_id is not null
      union all select 'documents', count(*) from public.documents where owner is null and case_id is not null
      union all select 'document_status', count(*) from public.document_status where owner is null and case_id is not null
      union all select 'program_predictions', count(*) from public.program_predictions where owner is null and case_id is not null
      union all select 'application_attempts', count(*) from public.application_attempts where owner is null and case_id is not null
      union all select 'outcome_events', count(*) from public.outcome_events where owner is null and case_id is not null
      union all select 'assessments', count(*) from public.assessments where owner is null and case_id is not null
    ) s
   where n > 0;

  if v_ownerless > 0 then
    raise exception 'MV-159 rollback refuses: % case-bearing rows have `owner IS NULL` (%). The '
      'legacy `(select auth.uid()) = owner` policies this script restores evaluate NULL for every '
      'one of them, and a WITH CHECK/USING admits only TRUE — so each row would vanish from the '
      'counsellor and admin who legitimately own its case, with no error anywhere. This is the '
      'hazard Guard 2 exists for; MV-160 is only its most common cause. If you must unwind with '
      'consultancy rows present, they have to be exported or re-owned FIRST, as a separate '
      'decision with its own record.', v_ownerless, v_detail;
  end if;
end;
$$;

-- `case_id` still nullable on the eight, and the legacy owner-keyed uniques still present. If
-- MV-160 has run, this script is out of order regardless of whether any `owner IS NULL` row
-- happens to exist yet. Unwind R1 first.
do $$
declare
  v_notnull int;
  v_legacy  int;
begin
  select count(*) into v_notnull
    from information_schema.columns
   where table_schema = 'public' and column_name = 'case_id' and is_nullable = 'NO'
     and table_name in ('profiles', 'plan_items', 'user_program_state', 'documents', 'document_status',
                        'program_predictions', 'application_attempts', 'outcome_events');
  if v_notnull > 0 then
    raise exception 'MV-159 rollback refuses: case_id is already NOT NULL on % of the eight, so '
      'MV-160 has been applied. Spec §10.1 unwinds strictly in reverse: run R1 (MV-160) first, '
      'which also re-creates MV-159''s policies WITH the transitional owner disjunct.', v_notnull;
  end if;

  select count(*) into v_legacy from pg_class where relname in
    ('profiles_owner_key', 'assessments_primary_idx', 'plan_items_kind_open_idx', 'documents_owner_kind_key');
  if v_legacy <> 4 then
    raise exception 'MV-159 rollback refuses: only % of the 4 legacy owner-keyed uniques survive, '
      'so MV-160''s drop list has partially run. Unwind R1 first.', v_legacy;
  end if;
end;
$$;

-- =====================================================================
-- 1  drop the 24 case-aware policies
-- =====================================================================
drop policy if exists profiles_select_case    on public.profiles;
drop policy if exists profiles_update_case    on public.profiles;
drop policy if exists assessments_select_case on public.assessments;
drop policy if exists plan_items_select_case  on public.plan_items;
drop policy if exists plan_items_update_case  on public.plan_items;
drop policy if exists ups_select_case         on public.user_program_state;
drop policy if exists ups_insert_case         on public.user_program_state;
drop policy if exists ups_update_case         on public.user_program_state;
drop policy if exists ups_delete_case         on public.user_program_state;
drop policy if exists documents_select_case   on public.documents;
drop policy if exists documents_delete_case   on public.documents;
drop policy if exists ds_select_case          on public.document_status;
drop policy if exists ds_insert_case          on public.document_status;
drop policy if exists ds_update_case          on public.document_status;
drop policy if exists ds_delete_case          on public.document_status;
drop policy if exists pp_select_case          on public.program_predictions;
drop policy if exists pp_insert_case          on public.program_predictions;
drop policy if exists pp_delete_case          on public.program_predictions;
drop policy if exists aa_select_case          on public.application_attempts;
drop policy if exists aa_insert_case          on public.application_attempts;
drop policy if exists aa_delete_case          on public.application_attempts;
drop policy if exists oe_select_case          on public.outcome_events;
drop policy if exists oe_insert_case          on public.outcome_events;
drop policy if exists oe_delete_case          on public.outcome_events;

-- =====================================================================
-- 2  re-apply the pre-Stage-2 legacy policy set, VERBATIM
-- =====================================================================
-- Transcribed from spec §2.6 (captured from the hosted project 2026-08-02) and cross-checked
-- against the migrations that created them: 20260603170655 (profiles), 20260603011208
-- (assessments), 20260604024609 (plan_items), 20260604002139 (user_program_state), 20260604060000
-- + 20260605130000 + 20260618120000 (documents), 20260626000000 (document_status), 20260620000000
-- (the three chain tables).
--
-- The `(select auth.uid())` form is the InitPlan shape 20260618120000 rewrote them into — NOT the
-- bare `auth.uid()` of the original files. Restoring the bare form would re-introduce an
-- `auth_rls_initplan` advisor finding that was fixed two months before Stage 2 began.

-- profiles
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = owner);
create policy profiles_update_own on public.profiles
  for update to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);

-- assessments — SELECT only; there was never an INSERT/UPDATE/DELETE policy on this table.
create policy assessments_select_own on public.assessments
  for select to authenticated using ((select auth.uid()) = owner);

-- plan_items
create policy plan_items_select_own on public.plan_items
  for select to authenticated using ((select auth.uid()) = owner);
create policy plan_items_update_own on public.plan_items
  for update to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);

-- user_program_state
create policy ups_select_own on public.user_program_state
  for select to authenticated using ((select auth.uid()) = owner);
create policy ups_insert_own on public.user_program_state
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy ups_update_own on public.user_program_state
  for update to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy ups_delete_own on public.user_program_state
  for delete to authenticated using ((select auth.uid()) = owner);

-- documents — QUOTED names and NO `to` clause, both restored exactly as they were. See the header:
-- the missing `to` clause is a defect MV-159 fixed, and a rollback does not keep the fix.
create policy "Users read own documents" on public.documents
  for select using ((select auth.uid()) = owner);
create policy "Users delete own documents" on public.documents
  for delete using ((select auth.uid()) = owner);

-- document_status
create policy ds_select_own on public.document_status
  for select to authenticated using ((select auth.uid()) = owner);
create policy ds_insert_own on public.document_status
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy ds_update_own on public.document_status
  for update to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy ds_delete_own on public.document_status
  for delete to authenticated using ((select auth.uid()) = owner);

-- program_predictions — the INSERT policy's inline `EXISTS` against `assessments` comes back with
-- it. It is an anti-recursion violation and a silent-denial hazard the moment `assessments` has a
-- policy of its own, which is precisely why MV-159 replaced it — but with MV-159 unwound,
-- `assessments` is back to a plain owner predicate and the hazard is back to being latent.
create policy pp_select_own on public.program_predictions
  for select to authenticated using ((select auth.uid()) = owner);
create policy pp_insert_own on public.program_predictions
  for insert to authenticated
  with check (
    -- Operand order matches 20260620000000 verbatim: `(select auth.uid()) = owner`, not
    -- `owner = (select auth.uid())`. The two are semantically identical and `pg_get_expr` renders
    -- them DIFFERENTLY, so the §4 catalogue fingerprint below — which is what turns "the rollback
    -- ran" into "the rollback restored" — would report a diff on these three chain policies.
    -- Measured: it did, on exactly these three, until this was corrected.
    (select auth.uid()) = owner
    and exists (
      select 1 from public.assessments a
       where a.id = program_predictions.assessment_id and a.owner = (select auth.uid())
    )
  );
create policy pp_delete_own on public.program_predictions
  for delete to authenticated using ((select auth.uid()) = owner);

-- application_attempts
create policy aa_select_own on public.application_attempts
  for select to authenticated using ((select auth.uid()) = owner);
create policy aa_insert_own on public.application_attempts
  for insert to authenticated
  with check (
    -- Operand order verbatim per 20260620000000 — see the note on `pp_insert_own`.
    (select auth.uid()) = owner
    and exists (
      select 1 from public.program_predictions p
       where p.id = application_attempts.prediction_id and p.owner = (select auth.uid())
    )
  );
create policy aa_delete_own on public.application_attempts
  for delete to authenticated using ((select auth.uid()) = owner);

-- outcome_events — the two non-ownership integrity clauses (`source`, `verified_by`) are part of
-- the original policy and come back with it; MV-159 retained them deliberately, so this is one
-- place the forward and reverse scripts agree.
create policy oe_select_own on public.outcome_events
  for select to authenticated using ((select auth.uid()) = owner);
create policy oe_insert_own on public.outcome_events
  for insert to authenticated
  with check (
    -- Operand order verbatim per 20260620000000 — see the note on `pp_insert_own`.
    (select auth.uid()) = owner
    and source = 'self_reported'
    and verified_by is null
    and exists (
      select 1 from public.application_attempts a
       where a.id = outcome_events.attempt_id and a.owner = (select auth.uid())
    )
  );
create policy oe_delete_own on public.outcome_events
  for delete to authenticated using ((select auth.uid()) = owner);

-- =====================================================================
-- 3  drop the four MV-159 helpers — LAST, and the ordering is mandatory
-- =====================================================================
-- Dropping a helper while a policy still references it raises 2BP01 (spec §10.1 R2's stated
-- failure mode). No `cascade`: if something still depends on one of these, the correct outcome is
-- a loud abort, not a silent removal of whatever that was.
drop function private.actor_case_ids();
drop function private.assessment_case_id(uuid);
drop function private.prediction_case_id(uuid);
drop function private.attempt_case_id(uuid);

-- MV-152's helpers are NOT dropped: `actor_admin_org_ids`, `actor_assigned_case_ids`,
-- `can_access_case` and the rest are Stage 1's and are still load-bearing for the six tenancy
-- tables' policies, which this script does not touch.

-- =====================================================================
-- 4  assert the restored state — the last statements, so a failure aborts the whole unwind
-- =====================================================================
do $$
declare
  v_own    int;
  v_case   int;
  v_forced int;
  v_anon   int;
begin
  select count(*) into v_own
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('profiles','assessments','plan_items','user_program_state','documents',
                       'document_status','program_predictions','application_attempts','outcome_events');
  -- 24 legacy + the untouched service_role INSERT policy on documents.
  if v_own <> 25 then
    raise exception 'MV-159 rollback: expected 25 policies on the nine after the restore, found %.', v_own;
  end if;

  select count(*) into v_case from pg_policy where polname like '%\_case';
  if v_case <> 0 then
    raise exception 'MV-159 rollback: % case-aware policies survived the drop.', v_case;
  end if;

  -- RLS must still be ENABLED and FORCED on all nine. A rollback that left a table with RLS off
  -- would be a tenant hole created by the unwind itself.
  select count(*) into v_forced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relforcerowsecurity
     and c.relname in ('profiles','assessments','plan_items','user_program_state','documents',
                       'document_status','program_predictions','application_attempts','outcome_events');
  if v_forced <> 9 then
    raise exception 'MV-159 rollback: RLS is enabled AND forced on only % of the nine.', v_forced;
  end if;

  -- The restored `documents` policies apply to PUBLIC. That is only safe because `anon` holds no
  -- grant — the same latent-grant argument spec §9.9 records. Asserted rather than assumed, here,
  -- at the moment the safety net becomes the ONLY thing keeping anon out.
  select count(*) into v_anon
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
     and table_name in ('profiles','assessments','plan_items','user_program_state','documents',
                        'document_status','program_predictions','application_attempts','outcome_events');
  if v_anon > 0 then
    raise exception 'MV-159 rollback: anon holds % grant(s) on the nine, and the restored documents '
      'policies apply to PUBLIC. Do not commit this.', v_anon;
  end if;

  raise notice 'MV-159 rollback complete: 25 policies restored, 4 helpers dropped, RLS forced on 9/9.';
end;
$$;

-- =====================================================================
-- 5  THE RESTORE FINGERPRINT — "it ran" and "it restored" are different claims
-- =====================================================================
-- ROUND 2 ADDED THIS. Everything above proves the script RAN: 25 policies exist, none is
-- case-aware, the helpers are gone, RLS is forced. None of it proves the policies are the ones
-- that were there BEFORE — a rollback that restored 25 subtly different predicates satisfies
-- every count above and is not a rollback.
--
-- So the closing assertion is a FINGERPRINT of the rendered catalogue, compared against the
-- literal below. The literal was produced by MEASUREMENT rather than transcription: a stack was
-- reset with `20260803180000_case_aware_student_data_rls.sql` moved out of the migrations
-- directory, which is the true pre-MV-159 state, and its `pg_get_expr` output hashed. Doing that
-- is how the three chain-table operand-order differences above were found — they are semantically
-- identical, they render differently, and no count-based check could see them.
--
-- IF THIS FIRES AFTER A LEGITIMATE CHANGE, re-measure rather than edit the hash to match: the
-- procedure is in README §"Rolling MV-159 back in production".
do $$
declare
  v_fingerprint text;
  -- MEASURED 2026-08-04 on a stack reset with 20260803180000_case_aware_student_data_rls.sql moved
  -- OUT of supabase/migrations/ — i.e. the true pre-MV-159 catalogue — and confirmed byte-identical
  -- to the catalogue this script produces. Re-measure, never retype, if it ever has to change.
  v_expected constant text := '827bf303bff5f90d84780f03f5e6c0e6';
begin
  select md5(string_agg(
           c.relname || '|' || p.polname || '|' || p.polcmd::text || '|' ||
           coalesce((select string_agg(r.rolname, ',' order by r.rolname)
                       from pg_roles r where r.oid = any (p.polroles)), 'PUBLIC') || '|' ||
           coalesce(pg_get_expr(p.polqual, p.polrelid), '-') || '|' ||
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-'),
           E'\n' order by c.relname, p.polname))
    into v_fingerprint
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('profiles','assessments','plan_items','user_program_state','documents',
                       'document_status','program_predictions','application_attempts','outcome_events');

  if v_fingerprint <> v_expected then
    raise exception 'MV-159 rollback: the restored catalogue does not match the pre-MV-159 state. '
      'expected % / got %. Every count-based check above passed, so this is a restore that RAN '
      'without RESTORING. Reproduce the baseline (reset with the MV-159 migration moved out of '
      'supabase/migrations/), dump both catalogues and diff them policy by policy — README '
      '§"Rolling MV-159 back in production" has the exact commands. Do not commit until they '
      'agree or the difference is a decision somebody recorded.', v_expected, v_fingerprint;
  end if;
  raise notice 'MV-159 restored-catalogue fingerprint matches the pre-MV-159 baseline: %', v_fingerprint;

  -- The one property the hash cannot express on its own, asserted directly so a mismatch is
  -- actionable rather than merely alarming: no restored predicate may mention the MV-159 helpers,
  -- which are dropped above and would make every policy raise at query time.
  if exists (
    select 1 from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles','assessments','plan_items','user_program_state','documents',
                        'document_status','program_predictions','application_attempts','outcome_events')
      and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%actor_case_ids%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%actor_case_ids%'
        or coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%_case_id(%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%_case_id(%')
  ) then
    raise exception 'MV-159 rollback: a restored predicate still calls an MV-159 helper, which this '
      'script has just dropped. Every query against that table would raise. Do not commit.';
  end if;

  -- And the three chain INSERT policies must carry their inline EXISTS back, in the legacy
  -- operand order. These are the three the measured catalogue diff caught.
  if (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
       where p.polname in ('pp_insert_own', 'aa_insert_own', 'oe_insert_own')
         and pg_get_expr(p.polwithcheck, p.polrelid) like '%( SELECT auth.uid() AS uid) = owner%'
         and pg_get_expr(p.polwithcheck, p.polrelid) like '%EXISTS%') <> 3 then
    raise exception 'MV-159 rollback: the three chain INSERT policies are not textually the legacy '
      'ones. They render as `(select auth.uid()) = owner AND exists (…)`; anything else means the '
      'restore was retyped rather than reproduced.';
  end if;
end;
$$;

commit;
