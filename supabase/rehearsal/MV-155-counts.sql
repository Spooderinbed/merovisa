-- MV-155 — the reconciliation snapshot. Run before the migration, after it, after the rollback and
-- after the re-apply; the four outputs are the rehearsal log.
--
-- Row counts are the row-count-parity proof (§C: the backfill only ever UPDATEs, so every per-table
-- count is identical across the whole sequence). The case_id columns are guarded with to_regclass /
-- a catalogue lookup so the SAME script runs against the pre-migration and post-rollback states,
-- where the column does not exist — a snapshot script that only runs in one direction cannot
-- compare the two.

\pset footer off

select 'auth.users' as table_name, count(*)::text as rows, '' as cased, '' as caseless from auth.users
union all select 'cases (personal)', count(*)::text, '', ''
  from public.cases where organization_id is null and student_user_id is not null
union all select 'cases (all)', count(*)::text, '', '' from public.cases
order by 1;

do $$
declare
  v_tables text[] := array['profiles','assessments','plan_items','user_program_state','documents',
                           'document_status','program_predictions','application_attempts','outcome_events'];
  v_table  text;
  v_has    boolean;
  v_total  bigint;
  v_cased  bigint;
  v_owned  bigint;
  v_anon   bigint;
begin
  raise notice '% | % | % | % | %', rpad('table', 22), lpad('rows', 6), lpad('case_id set', 12),
                                    lpad('owner set', 10), lpad('owner null', 10);
  foreach v_table in array v_tables loop
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_table and column_name = 'case_id'
    ) into v_has;

    execute format('select count(*), count(*) filter (where owner is not null), count(*) filter (where owner is null) from public.%I', v_table)
      into v_total, v_owned, v_anon;

    if v_has then
      execute format('select count(*) filter (where case_id is not null) from public.%I', v_table) into v_cased;
    else
      v_cased := null;
    end if;

    raise notice '% | % | % | % | %', rpad(v_table, 22), lpad(v_total::text, 6),
                 lpad(coalesce(v_cased::text, 'no column'), 12), lpad(v_owned::text, 10), lpad(v_anon::text, 10);
  end loop;
end;
$$;

-- The reconciliation itself, when it exists. Raises on any violation; silent when clean.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'private' and p.proname = 'mv155_assert_case_backfill') then
    perform private.mv155_assert_case_backfill();
    raise notice 'mv155_assert_case_backfill(): CLEAN';
  else
    raise notice 'mv155_assert_case_backfill(): not present (pre-migration or post-rollback state)';
  end if;
end;
$$;

-- The write surface `authenticated` holds, column by column — the §H assertion in snapshot form,
-- so the rollback's restoration of the flat grants is visible in the log rather than inferred.
select table_name || '.' || lower(privilege_type) || '(' || column_name || ')' as write_surface
  from information_schema.column_privileges
 where table_schema = 'public' and grantee = 'authenticated'
   and privilege_type in ('INSERT', 'UPDATE')
   and table_name in ('profiles','assessments','plan_items','user_program_state','documents',
                      'document_status','program_predictions','application_attempts','outcome_events')
 order by 1;

-- =====================================================================
-- APPLY VERIFICATION — the part that RAISES, not the part that prints
-- =====================================================================
-- Everything above is a snapshot: it prints, and comparing two prints is a human diff of two logs.
-- That is enough for a rehearsal, where a person is reading both, and NOT enough for the production
-- apply, where the question is the narrower and more urgent one: **did the whole migration land, or
-- only part of it?**
--
-- The apply is atomic (see README §"Applying MV-155 to production"), so a FAILED apply leaves
-- nothing behind. What atomicity does not prove is that the operator ran the whole file rather than
-- a fragment of it, and the fragment is silent: `case_id` present on nine tables but everywhere NULL
-- leaves the app working perfectly and surfaces weeks later in MV-156.
--
-- So this block asserts the SIX things that are only all true of a complete apply, and raises with
-- the full list of what is missing rather than the first thing it hits. It is a no-op in the
-- pre-migration and post-rollback states (detected by the absence of `profiles.case_id`), so the
-- same script still runs unchanged at all four points of the rehearsal.
do $$
declare
  v_applied   boolean;
  v_problems  text[] := '{}';
  v_n         bigint;
  v_expected  text[] := array[
    'profiles','assessments','plan_items','user_program_state','documents',
    'document_status','program_predictions','application_attempts','outcome_events'];
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'case_id'
  ) into v_applied;

  if not v_applied then
    raise notice 'MV-155 apply verification: SKIPPED (pre-migration or post-rollback state)';
    return;
  end if;

  -- (1) case_id on exactly the nine, nullable, FK → cases ON DELETE RESTRICT.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and column_name = 'case_id'
     and table_name = any (v_expected) and is_nullable = 'YES';
  if v_n <> 9 then v_problems := v_problems || format('case_id present+nullable on %s/9 tables', v_n); end if;

  select count(*) into v_n from pg_constraint
   where contype = 'f' and confrelid = 'public.cases'::regclass and confdeltype = 'r'
     and conrelid::regclass::text = any (v_expected);
  if v_n <> 9 then v_problems := v_problems || format('ON DELETE RESTRICT case_id FKs: %s/9', v_n); end if;

  -- (2) all thirteen MV-155 indexes, plus cases_personal_student_idx.
  select count(*) into v_n from pg_indexes
   where schemaname = 'public' and indexname in (
     'cases_personal_student_idx','profiles_case_idx','assessments_case_id_idx',
     'assessments_case_primary_idx','plan_items_case_id_idx','plan_items_case_open_idx',
     'plan_items_case_kind_open_idx','user_program_state_case_program_idx','documents_case_kind_idx',
     'document_status_case_kind_idx','program_predictions_case_assessment_program_rule_idx',
     'application_attempts_case_id_idx','outcome_events_case_id_idx');
  if v_n <> 13 then v_problems := v_problems || format('MV-155 indexes: %s/13', v_n); end if;

  -- (3) all three definer objects and both seam triggers.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname like 'mv155\_%';
  if v_n <> 3 then v_problems := v_problems || format('private.mv155_* functions: %s/3', v_n); end if;

  select count(*) into v_n from pg_trigger
   where not tgisinternal
     and tgname in ('user_program_state_derive_case_id','document_status_derive_case_id');
  if v_n <> 2 then v_problems := v_problems || format('UPSERT-seam triggers: %s/2', v_n); end if;

  -- (4) the prediction guard is the NARROWED body, not the original one.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'reject_prediction_update'
       and p.prosrc like '%case_id%'
  ) then
    v_problems := v_problems || 'reject_prediction_update() is not the narrowed body';
  end if;

  -- (5) THE ONE THAT CATCHES A STOP BETWEEN THE GRANTS AND THE BACKFILL — the silent case.
  --     Every Auth user has a personal case, and no owned row anywhere lacks one.
  select count(*) into v_n from auth.users u
   where not exists (select 1 from public.cases c
                      where c.organization_id is null and c.student_user_id = u.id);
  if v_n <> 0 then v_problems := v_problems || format('auth.users with no personal case: %s', v_n); end if;

  declare
    v_t text;
    v_gap bigint;
    v_total_gap bigint := 0;
  begin
    foreach v_t in array v_expected loop
      execute format('select count(*) from public.%I where owner is not null and case_id is null', v_t) into v_gap;
      v_total_gap := v_total_gap + v_gap;
    end loop;
    if v_total_gap <> 0 then
      v_problems := v_problems || format('owned rows still carrying case_id NULL: %s', v_total_gap);
    end if;
  end;

  -- (6) the grant rewrite landed: `case_id` is in no UPDATE list, and IS in the five INSERT lists.
  select count(*) into v_n from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'authenticated'
     and privilege_type = 'UPDATE' and column_name = 'case_id' and table_name = any (v_expected);
  if v_n <> 0 then v_problems := v_problems || format('authenticated holds UPDATE(case_id) on %s tables', v_n); end if;

  select count(*) into v_n from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'authenticated'
     and privilege_type = 'INSERT' and column_name = 'case_id'
     and table_name in ('user_program_state','document_status','program_predictions',
                        'application_attempts','outcome_events');
  if v_n <> 5 then v_problems := v_problems || format('INSERT(case_id) grants: %s/5', v_n); end if;

  if array_length(v_problems, 1) is not null then
    raise exception 'MV-155 apply verification FAILED — the apply is INCOMPLETE: %',
      array_to_string(v_problems, '; ');
  end if;

  raise notice 'MV-155 apply verification: COMPLETE';
end;
$$;
