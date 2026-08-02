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
