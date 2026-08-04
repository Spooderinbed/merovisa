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
  -- EVERY AUTH USER, NOT ONLY THOSE WITH A PERSONAL CASE. Round 2: the loop used to be
  -- `where exists (… personal case …)`, which made the rehearsal structurally unable to observe a
  -- WIDENING — a predicate that newly exposed rows to a user who happens to hold no personal case
  -- produced no row in either phase, so the diff stayed empty and the script printed PASSED. The
  -- unfiltered loop plus the anon capture below is what makes "nothing moved" mean nothing moved
  -- FOR ANYBODY, rather than nothing moved for the people we thought to look at.
  for v_user in
    select u.id, u.email from auth.users u
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

  -- THE UNAUTHENTICATED READER. `documents`' legacy policies carried no `to` clause and therefore
  -- applied to PUBLIC; the only thing keeping `anon` out was the absent grant. A rehearsal that
  -- never reads as `anon` cannot tell you whether that changed.
  foreach v_tbl in array array['profiles','assessments','plan_items','user_program_state','documents',
                               'document_status','program_predictions','application_attempts','outcome_events']
  loop
    set local request.jwt.claims = '{"role":"anon"}';
    set local role anon;
    begin
      execute format(
        'select coalesce(string_agg(t.id::text, '','' order by t.id::text), ''(none)''), count(*)::int
           from public.%I t', v_tbl)
        into v_ids, v_n;
    exception when insufficient_privilege then
      v_ids := '(no grant)'; v_n := 0;
    end;
    reset role;
    insert into mv159_visibility
      values (p_phase, '00000000-0000-0000-0000-000000000000'::uuid, 'anon', v_tbl, v_n, v_ids);
  end loop;
end;
$$;

select pg_temp.mv159_capture('before');

-- =====================================================================
-- 2  apply MV-159
-- =====================================================================
-- `\ir`, NOT `\i`, AND THAT IS A FIX RATHER THAN A FLOURISH. `\i` resolves relative to psql's
-- CURRENT WORKING DIRECTORY. README step 4 pipes this script in on stdin (`-f -`), where the CWD
-- is whatever the container happens to be sitting in — which mounts only pgdata, so the migration
-- was `No such file or directory` and the documented procedure aborted before capturing anything.
-- `\ir` resolves relative to THIS SCRIPT's own location, so the rehearsal runs wherever the two
-- files are copied to, together. The README's step 4 now copies them in and runs with `-f <path>`,
-- because `\ir` on stdin has no script location to be relative TO and degrades back to `\i`.
\echo '--- applying 20260803180000_case_aware_student_data_rls.sql ---'
\ir ../migrations/20260803180000_case_aware_student_data_rls.sql

-- =====================================================================
-- 3  capture again
-- =====================================================================
select pg_temp.mv159_capture('after');

-- =====================================================================
-- 3a  IS THE CASE BRANCH ACTUALLY CARRYING THE LOAD? (round 2)
-- =====================================================================
-- THE DEFECT THIS CLOSES: every row in a production-shaped corpus is an owner-keyed personal row,
-- so the TRANSITIONAL OWNER DISJUNCT alone reproduces the "before" set exactly. The before/after
-- diff is therefore empty whether the case branch works or is COMPLETELY INERT — a policy set
-- whose case arm matched nothing at all would print PASSED, and the first thing anyone would
-- notice is MV-160 deleting the owner disjunct in production and blanking the product.
--
-- So capture a third phase that reads through the CASE ARM ONLY: same authenticated read, with a
-- WHERE that keeps only the rows `private.actor_case_ids()` reaches. If that reproduces the
-- "after" set for every owner and every table, the case branch is load-bearing AND MV-160's
-- disjunct removal is a no-op on this corpus — which is the single most useful thing this
-- rehearsal can tell the next card. If the case branch is inert, this phase is empty everywhere
-- and the verdict below says so.
create function pg_temp.mv159_capture_case_only() returns void
  language plpgsql
as $$
declare
  v_user record;
  v_tbl  text;
  v_ids  text;
  v_n    int;
begin
  for v_user in select u.id, u.email from auth.users u order by u.email, u.id
  loop
    foreach v_tbl in array array['profiles','assessments','plan_items','user_program_state','documents',
                                 'document_status','program_predictions','application_attempts','outcome_events']
    loop
      execute format('set local request.jwt.claims = %L',
                     json_build_object('sub', v_user.id, 'role', 'authenticated')::text);
      set local role authenticated;
      execute format(
        'select coalesce(string_agg(t.id::text, '','' order by t.id::text), ''(none)''), count(*)::int
           from public.%I t
          where t.case_id is not null
            and t.case_id = any ((select private.actor_case_ids())::uuid[])', v_tbl)
        into v_ids, v_n;
      reset role;
      insert into mv159_visibility values ('case-only', v_user.id, v_user.email, v_tbl, v_n, v_ids);
    end loop;
  end loop;
end;
$$;

select pg_temp.mv159_capture_case_only();

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

\echo ''
\echo '--- is the CASE branch load-bearing? (case-arm-only read vs the full predicate) ---'
select a.owner_email, a.tbl, a.row_count as after, c.row_count as case_only,
       case when a.ids = c.ids then 'carried by case' else '*** OWNER DISJUNCT IS CARRYING IT ***' end as verdict
  from mv159_visibility a
  join mv159_visibility c on c.owner_id = a.owner_id and c.tbl = a.tbl and c.phase = 'case-only'
 where a.phase = 'after' and a.ids is distinct from c.ids
 order by a.owner_email, a.tbl;

do $$
declare
  v_moved int;
  v_detail text;
  v_pairs int;
  v_widened int;
  v_inert int;
  v_inert_detail text;
begin
  select count(*), string_agg(b.owner_email || '/' || b.tbl, ', ' order by b.owner_email, b.tbl)
    into v_moved, v_detail
    from mv159_visibility b
    join mv159_visibility a on a.owner_id = b.owner_id and a.tbl = b.tbl and a.phase = 'after'
   where b.phase = 'before' and b.ids is distinct from a.ids;

  select count(*) into v_pairs from mv159_visibility where phase = 'before';

  -- Reported separately because the two directions are different failures. A row DISAPPEARING is
  -- the Stage 2 exit regression; a row APPEARING for somebody who could not see it before is a
  -- tenancy breach, and it is the one the old owner-filtered loop could not observe at all.
  select count(*) into v_widened
    from mv159_visibility b
    join mv159_visibility a on a.owner_id = b.owner_id and a.tbl = b.tbl and a.phase = 'after'
   where b.phase = 'before' and a.row_count > b.row_count;

  if v_moved > 0 then
    raise exception 'MV-159 VISIBILITY REHEARSAL FAILED: % of % owner/table pairs changed (% of them '
      'a WIDENING): %. Any non-empty diff is a BLOCKER, not a note — a student losing sight of '
      'their own rows is the Stage 2 exit-gate regression this card exists not to create, and a '
      'student GAINING sight of somebody else''s is worse.', v_moved, v_pairs, v_widened, v_detail;
  end if;

  -- THE INERTNESS CHECK. Without it this script prints PASSED against a policy set whose case arm
  -- matches nothing, because the transitional owner disjunct reproduces the whole corpus on its
  -- own. See §3a.
  select count(*), string_agg(a.owner_email || '/' || a.tbl, ', ' order by a.owner_email, a.tbl)
    into v_inert, v_inert_detail
    from mv159_visibility a
    join mv159_visibility c on c.owner_id = a.owner_id and c.tbl = a.tbl and c.phase = 'case-only'
   where a.phase = 'after' and a.row_count > 0 and a.ids is distinct from c.ids;

  if v_inert > 0 then
    raise exception 'MV-159 VISIBILITY REHEARSAL FAILED: % owner/table pairs are visible ONLY '
      'through the transitional owner disjunct, not through the case branch: %. The before/after '
      'diff is empty either way, so this is the assertion that distinguishes "the case predicate '
      'works" from "the case predicate matches nothing and the owner disjunct is carrying 100%% of '
      'the load". MV-160 deletes that disjunct — on this corpus it would blank those pairs.',
      v_inert, v_inert_detail;
  end if;

  raise notice 'MV-159 VISIBILITY REHEARSAL PASSED: % owner/table pairs (every auth user + anon x '
    'nine tables), all byte-identical before and after the policy swap, no widening, and every '
    'visible row reachable through the CASE branch alone — so MV-160''s disjunct removal is a '
    'no-op on this corpus.', v_pairs;
end;
$$;

-- =====================================================================
-- 5  leave nothing behind
-- =====================================================================
rollback;
