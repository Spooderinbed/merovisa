-- MV-168 — ROLLBACK. This is a SCRIPT, not a migration: it is never applied by
-- `supabase db push` and it carries no entry in supabase_migrations.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/rehearsal/MV-168-rollback.sql
--
-- Unwinds `supabase/migrations/20260808120000_stage3_consultancy_write_grants.sql` — the three
-- Stage 3 write grants and their three policies — leaving the database in MV-160's end state.
--
-- ============================ WHERE THIS SITS IN THE CHAIN ============================
--
-- Stage 2 spec §10.1 unwinds strictly reverse-DAG: **R1** (`MV-160-rollback.sql`) before **R2**
-- (`MV-159-rollback.sql`). MV-168 is Stage 3 and lands after both, so it unwinds FIRST:
--
--     MV-168-rollback.sql  →  MV-161-rollback.sql  →  MV-160-rollback.sql  →  MV-159-rollback.sql
--
-- **This is not advisory.** `MV-160-rollback.sql`'s Guard 1 counts the `%_case` policies on the
-- nine student tables and expects exactly MV-159's twenty-four. MV-168's three are named to the
-- same convention, so with them still in place that guard refuses — correctly, since the database
-- would not be in the state R1 was written against. Run this script first and the count is 24
-- again. R1 carries a guard that names this file, so an operator who reaches for it out of order
-- reads the instruction rather than a count they have to decode.
--
-- ============================ WHAT THIS DOES NOT TOUCH ============================
--
--   * No schema object. MV-168 added no column, index, constraint or trigger; there is nothing
--     here to re-widen or re-create, which is why this file is short and why it has no expiry
--     window of the kind R1's Guard 3 carries.
--   * `lib/` is not rolled back by SQL. The three repositories MV-168 converted off `.upsert()`
--     keep working after this script: a plain INSERT that loses its grant fails with 42501 the
--     same way the `.upsert()` did, and every one of those call sites already reports the failure
--     rather than swallowing it. **A consultancy case becomes unwritable again — that is the
--     point of the rollback — but no personal-case path changes**, because a personal case is
--     reached by service-role or by the student's own pre-existing grants either way.
--   * `caseUpsertColumns` is NOT restored. It was TypeScript, it had no callers left, and code is
--     reverted by git rather than by psql.
--
-- ONE transaction, for the reason its two predecessors give: between the `drop policy` and the
-- revoke, a table is momentarily granted-but-unfiltered, and no other session may observe that.

begin;

-- =====================================================================
-- Guard 0 — MV-168 is applied, and applied WHOLE
-- =====================================================================
-- A partial state is the one an operator most needs told about: three grants and three policies
-- land together, and unwinding half of a half leaves a granted verb with no policy behind it,
-- which is an UNFILTERED verb. Refuse rather than guess.
do $$
declare
  v_policies int;
  v_grants   int;
begin
  select count(*) into v_policies
    from pg_catalog.pg_policy p
   where p.polname in ('profiles_insert_case', 'plan_items_insert_case', 'assessments_update_case');

  select count(*) into v_grants
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and (
       (table_name = 'profiles' and privilege_type = 'INSERT')
       or (table_name = 'plan_items' and privilege_type = 'INSERT')
       or (table_name = 'assessments' and privilege_type = 'UPDATE')
     );

  if v_policies = 0 and v_grants = 0 then
    raise exception 'MV-168 rollback REFUSED: none of the three policies and none of the three '
      'grants are present, so MV-168 is not applied and there is nothing to unwind. Running this '
      'against a pre-MV-168 database is a no-op at best and a sign you are on the wrong host.';
  end if;

  -- 4 profiles columns + 9 plan_items columns + 1 assessments column = 14.
  if v_policies <> 3 or v_grants <> 14 then
    raise exception 'MV-168 rollback REFUSED: found % of 3 policies and % of 14 granted columns. '
      'MV-168 is applied PARTIALLY — unwinding from here can leave a granted verb with no policy, '
      'which is an unfiltered verb. Reconcile by hand before running this.', v_policies, v_grants;
  end if;
end $$;

-- =====================================================================
-- 1  the policies come off BEFORE the grants
-- =====================================================================
-- Order matters and it is not a mirror of the migration's. Dropping the grant first would leave a
-- policy with nothing to filter — harmless. Dropping the policy first leaves a GRANT with nothing
-- filtering it — an unfiltered INSERT on `profiles` for every authenticated user — which is why
-- both halves are inside one transaction and why the revokes follow immediately.
drop policy if exists profiles_insert_case on public.profiles;
drop policy if exists plan_items_insert_case on public.plan_items;
drop policy if exists assessments_update_case on public.assessments;

-- =====================================================================
-- 2  the grants
-- =====================================================================
-- Column-scoped revokes matching the column-scoped grants. A bare
-- `revoke insert on public.profiles from authenticated` would also revoke a column grant some
-- LATER stage had added, which is the class of over-revoke an incident script must not commit.
revoke insert (owner, case_id, sections, completeness) on public.profiles from authenticated;
revoke insert (owner, case_id, kind, impact, title, body, status, lift_estimate, time_estimate)
  on public.plan_items from authenticated;
revoke update (is_primary) on public.assessments from authenticated;

-- =====================================================================
-- 3  assert the restored state — MV-160's end state, exactly
-- =====================================================================
do $$
declare
  v_bad text;
  v_n   int;
begin
  -- (1) all three policies gone.
  select string_agg(p.polname, ', ' order by p.polname) into v_bad
    from pg_catalog.pg_policy p
   where p.polname in ('profiles_insert_case', 'plan_items_insert_case', 'assessments_update_case');
  if v_bad is not null then
    raise exception 'MV-168 rollback INCOMPLETE: policy/policies % survived the drop', v_bad;
  end if;

  -- (2) all three grants gone. Read from `column_privileges` and not `role_table_grants`: the
  --     grants are column-scoped and write no row in the table-level catalogue at all, which is
  --     the reader defect MV-159 had to fix in the test harness for exactly this reason.
  select string_agg(distinct table_name || '.' || lower(privilege_type), ', ') into v_bad
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and (
       (table_name = 'profiles' and privilege_type = 'INSERT')
       or (table_name = 'plan_items' and privilege_type = 'INSERT')
       or (table_name = 'assessments' and privilege_type = 'UPDATE')
     );
  if v_bad is not null then
    raise exception 'MV-168 rollback INCOMPLETE: grant(s) % survived the revoke', v_bad;
  end if;

  -- (3) MV-159's twenty-four `%_case` policies are back to being the whole set on the nine — the
  --     precondition `MV-160-rollback.sql`'s Guard 1 checks. Asserting it HERE means this script
  --     fails on its own terms rather than handing the operator a confusing refusal one file later.
  select count(*) into v_n
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polname like '%\_case';
  if v_n <> 24 then
    raise exception 'MV-168 rollback INCOMPLETE: % `%%_case` policies remain on the nine, expected '
      'MV-159''s 24. R1 will refuse until this is 24.', v_n;
  end if;

  -- (4) MV-160's own end state is untouched: `authenticated` still holds the UPDATE grants Stage 2
  --     left behind. An over-broad revoke above would have taken `profiles.update(sections)` with
  --     it and silently broken every student's profile save.
  select string_agg(table_name || '(' || column_name || ')', ', ' order by table_name, column_name)
    into v_bad
    from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'UPDATE'
     and table_name in ('profiles', 'plan_items');
  if v_bad is distinct from 'plan_items(completed_at), plan_items(started_at), plan_items(status), '
                            'profiles(completeness), profiles(sections)' then
    raise exception 'MV-168 rollback OVER-REVOKED: the surviving UPDATE grants are (%), expected '
      'Stage 2''s five. A student can no longer save their profile.', coalesce(v_bad, '<none>');
  end if;
end $$;

commit;
