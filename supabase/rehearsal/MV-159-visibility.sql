-- MV-159 — THE VISIBILITY REHEARSAL. This is a SCRIPT, not a migration.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/rehearsal/MV-159-visibility.sql
--
-- WHY THIS CARD'S REHEARSAL LOOKS NOTHING LIKE MV-155's OR MV-156's. MV-159 mutates NO DATA, so
-- there is no backfill to replay and no before/after row count to compare. What it changes is what
-- live users can SEE — the same blast radius, with a failure mode that is worse because it is
-- silent: an RLS SELECT refusal returns zero rows and no error, so a wrong predicate does not throw,
-- it just makes a real student's assessments disappear. A `0 rows` result for a real owner is
-- exactly what this rehearsal exists to catch, and nothing else in the lane would.
--
-- WHAT IT DOES, in one rolled-back transaction so it is repeatable and leaves nothing behind:
--   1  capture, FOR EVERY OWNER, the set of row ids visible on each of the nine tables — read AS
--      THAT AUTHENTICATED USER, not as postgres (which holds BYPASSRLS and would capture the whole
--      table nine times over and call it a pass)
--   2  apply MV-159's migration inline
--   3  capture again
--   4  diff, per owner per table, and RAISE if any set moved
--   5  roll back
--
-- PRECONDITION: a stack with every migration through MV-156 applied, MV-159 NOT applied, and
-- production-shaped data loaded and backfilled. `supabase/rehearsal/README.md` §"Running the MV-159
-- rehearsal" is the numbered sequence that produces it. Running this against an EMPTY database is
-- not a failure, but it is not evidence either: the diff is trivially empty. The guard below
-- refuses that case rather than printing a green log nobody should trust.
--
-- WHAT IT CANNOT PROVE, stated so the log is not over-read: the corpus reproduces the live
-- inventory's shapes and counts, not the real `sections` / `result` / `profile_snapshot` payloads.
-- No policy in this card reads any of those columns, so the gap is narrower here than it was for
-- MV-155 — but it is still a gap, and the founder-gated dump replay is still owed at apply time.

begin;

-- =====================================================================
-- 0  refuse a rehearsal with nothing to rehearse
-- =====================================================================
do $$
declare
  v_owners int;
  v_cased  int;
begin
  select count(distinct owner) into v_owners from (
    select owner from public.profiles where owner is not null
    union select owner from public.assessments where owner is not null
    union select owner from public.plan_items where owner is not null
    union select owner from public.documents where owner is not null
  ) o;
  if v_owners = 0 then
    raise exception 'MV-159 visibility rehearsal refuses to run against an empty database: with no '
      'owners the before/after diff is trivially empty and proves nothing. Load '
      'supabase/rehearsal/MV-155-rehearsal-corpus.sql (or the founder-supplied dump) and run '
      'private.mv155_backfill_personal_cases() first — README §"Running the MV-159 rehearsal".';
  end if;

  select count(*) into v_cased from public.profiles where owner is not null and case_id is not null;
  if v_cased = 0 then
    raise exception 'MV-159 visibility rehearsal refuses: % owners are present but NO profile has a '
      'case_id, so the backfill has not been run. Every case predicate would match nothing and the '
      'transitional owner disjunct would be carrying 100%% of the load — the suite would be green '
      'and the rehearsal would have proven nothing.', v_owners;
  end if;

  if exists (select 1 from pg_policy where polname = 'profiles_select_case') then
    raise exception 'MV-159 visibility rehearsal refuses: MV-159 is already applied, so there is no '
      '"before" to capture. Run supabase/rehearsal/MV-159-rollback.sql first.';
  end if;

  raise notice 'MV-159 rehearsal precondition OK: % owners, profiles backfilled, MV-159 not applied.', v_owners;
end;
$$;

create temp table mv159_visibility (
  phase text not null,
  owner_id uuid not null,
  owner_email text,
  tbl text not null,
  row_count int not null,
  ids text not null
) on commit drop;

-- =====================================================================
-- 1  the capture — read as the authenticated user, never as postgres
-- =====================================================================
-- `set local role authenticated` is what makes this evidence rather than decoration: `postgres`
-- holds BYPASSRLS, so the identical query run without it returns every row of every table for
-- every "owner" and the diff is empty no matter how wrong the policies are. That is the single
-- defect most likely to produce a rehearsal log that means nothing.
create function pg_temp.mv159_capture(p_phase text) returns void
  language plpgsql
as $$
declare
  v_user record;
  v_tbl  text;
  v_ids  text;
  v_n    int;
begin
  for v_user in
    select u.id, u.email from auth.users u
     where exists (select 1 from public.cases c where c.organization_id is null and c.student_user_id = u.id)
     order by u.email, u.id
  loop
    foreach v_tbl in array array['profiles','assessments','plan_items','user_program_state','documents',
                                 'document_status','program_predictions','application_attempts','outcome_events']
    loop
      execute format('set local request.jwt.claims = %L',
                     json_build_object('sub', v_user.id, 'role', 'authenticated')::text);
      set local role authenticated;
      execute format(
        'select coalesce(string_agg(t.id::text, '','' order by t.id::text), ''(none)''), count(*)::int
           from public.%I t', v_tbl)
        into v_ids, v_n;
      reset role;
      insert into mv159_visibility values (p_phase, v_user.id, v_user.email, v_tbl, v_n, v_ids);
    end loop;
  end loop;
end;
$$;

select pg_temp.mv159_capture('before');

-- =====================================================================
-- 2  apply MV-159
-- =====================================================================
\echo '--- applying 20260803180000_case_aware_student_data_rls.sql ---'
\i supabase/migrations/20260803180000_case_aware_student_data_rls.sql

-- =====================================================================
-- 3  capture again
-- =====================================================================
select pg_temp.mv159_capture('after');

-- =====================================================================
-- 4  the report, then the diff, then the verdict
-- =====================================================================
\echo ''
\echo '--- visible row counts per owner per table (before -> after) ---'
select b.owner_email,
       b.tbl,
       b.row_count as before,
       a.row_count as after,
       case when b.ids = a.ids then 'same' else '*** MOVED ***' end as verdict
  from mv159_visibility b
  join mv159_visibility a on a.owner_id = b.owner_id and a.tbl = b.tbl and a.phase = 'after'
 where b.phase = 'before'
 order by b.owner_email, b.tbl;

\echo ''
\echo '--- totals ---'
select phase, sum(row_count) as rows_visible, count(*) as owner_table_pairs
  from mv159_visibility group by phase order by phase;

do $$
declare
  v_moved int;
  v_detail text;
  v_pairs int;
begin
  select count(*), string_agg(b.owner_email || '/' || b.tbl, ', ' order by b.owner_email, b.tbl)
    into v_moved, v_detail
    from mv159_visibility b
    join mv159_visibility a on a.owner_id = b.owner_id and a.tbl = b.tbl and a.phase = 'after'
   where b.phase = 'before' and b.ids is distinct from a.ids;

  select count(*) into v_pairs from mv159_visibility where phase = 'before';

  if v_moved > 0 then
    raise exception 'MV-159 VISIBILITY REHEARSAL FAILED: % of % owner/table pairs changed: %. '
      'Any non-empty diff is a BLOCKER, not a note — a student losing sight of their own rows is '
      'the Stage 2 exit-gate regression this card exists not to create.', v_moved, v_pairs, v_detail;
  end if;

  raise notice 'MV-159 VISIBILITY REHEARSAL PASSED: % owner/table pairs, all byte-identical '
    'before and after the policy swap.', v_pairs;
end;
$$;

-- =====================================================================
-- 5  leave nothing behind
-- =====================================================================
rollback;
