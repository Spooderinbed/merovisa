-- =====================================================================================
-- MV-168 — Stage 3 slice 1: the consultancy write grants.
--
-- Spec: docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md §2.3, §6.1.
--
-- Stage 2 deferred TEN write verbs (Stage 2 spec §6). This file resolves three of them and
-- leaves the other seven refused or deferred, each with a reason recorded in Stage 3 spec §6.1
-- and in the amended Stage 2 spec §6. A verb Stage 2 deferred and Stage 3 leaves unmentioned is
-- how a deferral becomes permanent by accident.
--
--   GRANTED HERE
--     1. profiles     INSERT (owner, case_id, sections, completeness)          + profiles_insert_case
--     3. assessments  UPDATE (is_primary)              — NARROWED, not whole   + assessments_update_case
--     5. plan_items   INSERT (owner, case_id, kind, impact, title, body,
--                             status, lift_estimate, time_estimate)            + plan_items_insert_case
--
--   NOT GRANTED, and each is a decision rather than an omission
--     2. assessments  INSERT  — REFUSED PERMANENTLY. `result` and `rule_version` are scoring
--        outputs. A client that can write them MINTS ITS OWN VERDICT against the server-side
--        rule, which is the trust property this product sells. A column-scoped grant excluding
--        them does not rescue the verb either: both are NOT NULL, so the grant would be
--        ungrantable in a useful form. `app/api/assess/route.ts` stays service-role, forever.
--     4. assessments  DELETE  — REFUSED. Row removal is account teardown (Stage 6).
--     6. plan_items   DELETE  — REFUSED. Plan items are dismissed (`status='dismissed'`).
--     7. documents    INSERT  — DEFERRED TO STAGE 4. Its only caller must also write a Storage
--        object, and the bucket policy that would let the authenticated client do that is
--        Stage 4's. Granting the row INSERT alone retires no service-role path.
--     8/9/10. documents UPDATE, program_predictions UPDATE, application_attempts /
--        outcome_events UPDATE — NEVER. Append-only by design; §9's `reject_prediction_update`
--        trigger already enforces one of them at the table.
--
-- WHY THE ASSESSMENTS UPDATE IS NARROWED RATHER THAN GRANTED WHOLE. `is_primary` is a USER
-- CHOICE — which assessment leads — and it is already governed by the partial unique
-- `assessments_case_primary_idx`, so the database keeps "one primary per case" whoever writes
-- it. The re-score columns are a different kind of thing and stay on service-role;
-- `app/api/assess/refresh/route.ts` is unchanged by this file.
--
-- WHAT THIS FILE DOES NOT DO, and must never do:
--   * NO `UPDATE (case_id)` GRANT ON ANY TABLE. `…20260802120000….sql:602-604` states the rule
--     it would break — "THE ASYMMETRY IS THE POINT AND IT IS NOT A SLIP: case_id is OMITTED
--     from every UPDATE list and INCLUDED in every INSERT list… a client that can UPDATE
--     case_id RE-POINTS an existing row into another case." §4 (2) below asserts it at apply.
--     It will look like the obvious unblock for the `.upsert()` call sites. The unblock is
--     TypeScript — MV-168 converts all three to read-then-insert in the same PR.
--   * no schema change. No column added, altered or dropped.
--   * nothing to `cases_insert_admin` or the `cases` column write-surface guard.
--
-- Re-runnable in the MV-159 idiom: `drop policy if exists` + `create policy`, and grants are
-- idempotent.
-- =====================================================================================

-- =====================================================================
-- 1  profiles — INSERT. Spec §6.1 row 1.
-- =====================================================================
-- The grant is COLUMN-SCOPED, like every other write grant Stage 2 left behind: a table-level
-- INSERT would hand `authenticated` `created_at`/`updated_at` as well, and those are the
-- server's account of when something happened rather than the client's.
grant insert (owner, case_id, sections, completeness) on public.profiles to authenticated;

drop policy if exists profiles_insert_case on public.profiles;

-- THE THREE-CONJUNCT TEMPLATE, verbatim from its five siblings (`ups_insert_case`,
-- `ds_insert_case`, `pp_insert_case`, `aa_insert_case`, `oe_insert_case`). The third conjunct
-- is the consultancy-row clause and OMITTING IT IS THE BUG: it is what lets a row exist with
-- `owner IS NULL` on a case that has no student, while forbidding a row that names SOMEONE
-- ELSE'S user id inside a case the actor may legitimately reach.
create policy profiles_insert_case on public.profiles
  for insert to authenticated
  with check (
    case_id is not null
    and case_id = any ((select private.actor_case_ids())::uuid[])
    and (owner is null or owner = private.case_student_id(case_id))
  );

-- =====================================================================
-- 2  plan_items — INSERT. Spec §6.1 row 5.
-- =====================================================================
-- `status` IS in the list and `completed_at`/`started_at` are not, which is the same split the
-- existing `UPDATE (status, completed_at, started_at)` grant makes for the opposite reason: a
-- new plan item is created in a status (`todo`, or `dismissed` for a step that arrives already
-- irrelevant), but it cannot be created already-completed at a time the client chose.
grant insert (owner, case_id, kind, impact, title, body, status, lift_estimate, time_estimate)
  on public.plan_items to authenticated;

drop policy if exists plan_items_insert_case on public.plan_items;

create policy plan_items_insert_case on public.plan_items
  for insert to authenticated
  with check (
    case_id is not null
    and case_id = any ((select private.actor_case_ids())::uuid[])
    and (owner is null or owner = private.case_student_id(case_id))
  );

-- =====================================================================
-- 3  assessments — UPDATE, narrowed to `is_primary`. Spec §6.1 row 3.
-- =====================================================================
grant update (is_primary) on public.assessments to authenticated;

drop policy if exists assessments_update_case on public.assessments;

-- Two conjuncts, not three, and that is deliberate rather than an oversight: the owner arm of
-- the INSERT template guards a column THE CLIENT SUPPLIES, and `owner` is not in this grant, so
-- there is no owner value for a predicate to judge. This is the shape `profiles_update_case`
-- and `plan_items_update_case` already have.
--
-- `case_id is not null` also does the anonymous carve-out's work here, on the one table where
-- `case_id` is still nullable: an unclaimed anonymous assessment has `owner IS NULL` AND
-- `case_id IS NULL` (spec §3), and this predicate refuses it in both directions.
create policy assessments_update_case on public.assessments
  for update to authenticated
  using (
    case_id is not null
    and case_id = any ((select private.actor_case_ids())::uuid[])
  )
  with check (
    case_id is not null
    and case_id = any ((select private.actor_case_ids())::uuid[])
  );

-- =====================================================================
-- 4  the grants are asserted at APPLY time, in the MV-159 §13 idiom
-- =====================================================================
-- Every assertion here answers a way this file could be silently widened by a LATER migration
-- that re-creates one of these three objects. A policy conjunct only an attacker notices is
-- exactly the conjunct a future "simplification" removes, and the suite would stay green:
-- nothing in `lib/` or `app/` writes a foreign `owner`, so no legitimate path would break.
do $$
declare
  v_bad text;
  v_cols text;
begin
  -- (1) both INSERT predicates bound the OWNER axis. Without `case_student_id` an actor who may
  --     reach a case can write rows inside it ATTRIBUTED TO ANOTHER USER.
  select string_agg(p.polname, ', ' order by p.polname) into v_bad
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
   where p.polname in ('profiles_insert_case', 'plan_items_insert_case')
     and (p.polwithcheck is null
          or pg_catalog.pg_get_expr(p.polwithcheck, c.oid) not like '%case_student_id%');
  if v_bad is not null then
    raise exception 'MV-168: INSERT policy % no longer bounds the OWNER axis — an actor could write '
      'a row inside a case it may reach while attributing that row to another user', v_bad;
  end if;

  -- (2) THE ASYMMETRY, re-asserted over the whole nine. This is the first migration since
  --     MV-155 to add write grants, and the temptation it creates is precisely the forbidden
  --     one: `UPDATE (case_id)` is what would make the three `.upsert()` call sites work
  --     without touching TypeScript, and it is what lets a client RE-POINT a row into another
  --     case. Checked across every table rather than the three this file touches, because the
  --     rule is the schema's and not this file's.
  select string_agg(distinct table_name, ', ' order by table_name) into v_bad
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and privilege_type = 'UPDATE'
     and column_name = 'case_id';
  if v_bad is not null then
    raise exception 'MV-168: `authenticated` holds UPDATE (case_id) on % — a client with that grant '
      'can re-point an existing row into another case, which is the corruption the whole '
      'case axis exists to prevent (…20260802120000….sql:602-604)', v_bad;
  end if;

  -- (3) the `assessments` UPDATE grant is EXACTLY `is_primary`. Widening it to `result` or
  --     `rule_version` would let any signed-in actor mint a verdict for a case they can already
  --     reach — the refusal in row 2 above, arriving through the UPDATE door instead.
  select string_agg(column_name, ', ' order by column_name) into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and table_name = 'assessments'
     and privilege_type = 'UPDATE';
  if v_cols is distinct from 'is_primary' then
    raise exception 'MV-168: `authenticated` holds UPDATE (%) on assessments — expected exactly '
      '`is_primary`. `result` and `rule_version` are scoring outputs and a client that can write '
      'them forges its own verdict', coalesce(v_cols, '<none>');
  end if;

  -- (4) `assessments` still has NO INSERT and NO DELETE grant. Row 2 refuses INSERT permanently
  --     and row 4 refuses DELETE; both are the ABSENCE of a grant, which is the kind of fact
  --     that disappears without anybody deciding to remove it.
  select string_agg(privilege_type, ', ' order by privilege_type) into v_bad
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and table_name = 'assessments'
     and privilege_type in ('INSERT', 'DELETE');
  if v_bad is not null then
    raise exception 'MV-168: `authenticated` acquired % on assessments — spec §6.1 rows 2 and 4 '
      'refuse both permanently', v_bad;
  end if;

  -- (5) the two new INSERT grants did not leak past their enumerated column lists. A later
  --     `grant insert on public.profiles to authenticated` (table-level, no column list) would
  --     hand over `created_at`/`updated_at` too and this catches it.
  select string_agg(column_name, ', ' order by column_name) into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and table_name = 'profiles'
     and privilege_type = 'INSERT';
  if v_cols is distinct from 'case_id, completeness, owner, sections' then
    raise exception 'MV-168: profiles INSERT grant is (%), expected exactly '
      '(case_id, completeness, owner, sections)', coalesce(v_cols, '<none>');
  end if;

  select string_agg(column_name, ', ' order by column_name) into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and table_name = 'plan_items'
     and privilege_type = 'INSERT';
  if v_cols is distinct from 'body, case_id, impact, kind, lift_estimate, owner, status, time_estimate, title' then
    raise exception 'MV-168: plan_items INSERT grant is (%), expected exactly (body, case_id, impact, '
      'kind, lift_estimate, owner, status, time_estimate, title)', coalesce(v_cols, '<none>');
  end if;

  -- (6) all three policies exist and are attached to the verb they claim. A `drop policy` in a
  --     later file leaves the GRANT behind, and a grant with no policy is unfiltered.
  select string_agg(want.polname || ' (' || want.cmd || ')', ', ' order by want.polname) into v_bad
    from (values
      ('profiles_insert_case', 'a'),
      ('plan_items_insert_case', 'a'),
      ('assessments_update_case', 'w')
    ) as want(polname, cmd)
   where not exists (
     select 1 from pg_catalog.pg_policy p
      where p.polname = want.polname and p.polcmd = want.cmd::"char"
   );
  if v_bad is not null then
    raise exception 'MV-168: missing policy %, but the matching grant is in place — a granted verb '
      'with no policy is an UNFILTERED verb', v_bad;
  end if;
end $$;
