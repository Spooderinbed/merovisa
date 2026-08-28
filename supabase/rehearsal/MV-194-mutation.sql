-- MV-194 — the Stage 5 slice 2 mutation harness: widen ONE boundary, prove a NAMED test goes red.
--
-- Card: docs/kanban/cards/MV-194-stage5-invitation-accept.md, Test plan — "Mutation-test every
--       policy relied on … Mutants must WIDEN — a drop-mutant leaves every denial green because
--       the actor is refused by the ABSENCE of a grant, not by the policy. Read the failing test
--       NAMES, not the counts."
-- Suite under test: tests/integration/stage5-invitations.itest.ts
-- Format copied from: supabase/rehearsal/MV-193-mutation.sql, which copied MV-191's.
--
-- ---------------------------------------------------------------------------------------------
-- WHAT THIS SLICE ACTUALLY RELIES ON, AND WHY MOST OF IT IS AN ABSENCE
-- ---------------------------------------------------------------------------------------------
-- Acceptance runs as `service_role`, which bypasses every policy on this page. So the question a
-- mutation run has to answer here is NOT "does RLS let the acceptance through" — it always does —
-- but the opposite one: **what stops a CLIENT doing the same two writes for itself?**
--
-- Measured against the live database on 2026-08-24, `information_schema.role_column_grants`:
--
--   public.cases        authenticated UPDATE (archived_at, display_name, email, operational_status)
--   public.invitations  authenticated UPDATE (revoked_at)
--   anon                NOTHING, on either table
--
-- `student_user_id` and `accepted_at` are in no UPDATE grant. Those two ABSENCES are the entire
-- reason acceptance is server-side, and MV-150 wrote the intent into the migration itself:
-- linking a case to somebody else's Auth account "is invitation acceptance (an atomic
-- compare-and-swap, Stage 5), never a field a consultancy can point at a stranger."
--
-- **An absence cannot be dropped, so for an absence the mutant is an ADDITION.** Every mutant
-- below either grants a column that is deliberately ungranted, or widens a policy so that the
-- grant becomes the only remaining layer.
--
-- AND ONE LAYER THAT DOES NOT EXIST, WHICH IS WORTH KNOWING BEFORE READING THE RESULTS.
-- `cases` carries a BEFORE UPDATE trigger, `cases_write_surface_guard`, and it looks like a
-- second line of defence until you read it: it refuses `archived_at` to a non-admin and
-- `operational_status` to a non-staffer, and it says nothing at all about `student_user_id`.
-- (It also exempts `rolbypassrls` roles by name, and the comment naming the exemption names THIS
-- flow: "Stage 2's anonymous-claim path and Stage 5's invitation acceptance run as service_role.")
-- So for a counsellor or an org admin — both of whom `cases_update_accessor` admits on the row —
-- **the column grant is the ONLY thing standing between them and re-pointing a case at any Auth
-- user they like.** `student_link_grant` is the mutant that measures that, and it is the most
-- important one in this file.
--
-- ---------------------------------------------------------------------------------------------
-- Usage — three calls per mutant, in this order:
--   $DB = "supabase_db_merovisa"
--   docker exec -i $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v mutant=student_link_grant -f - < supabase/rehearsal/MV-194-mutation.sql
--   npx vitest run --config vitest.integration.config.ts tests/integration/stage5-invitations.itest.ts
--   docker exec -i $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v mutant=restore -f - < supabase/rehearsal/MV-194-mutation.sql
--
-- `restore` is SELF-CONTAINED, as MV-193's and MV-191's are: it re-creates both `cases` policies
-- byte-for-byte from the shipped `pg_policies` text and revokes every grant it planted, so no
-- migration re-run is required. That matters — 20260730180000 opens with
-- `revoke all … from authenticated` and re-grants only its own set, so leaning on a migration to
-- restore can silently un-grant a column a LATER migration added (MISTAKES.md, Supabase/Postgres).
--
-- LOCAL ONLY, AND IT MUTATES COMMITTED STATE. Between the mutation and the restore the local
-- database hands a client the ability to point a consultancy's case at any account. NEVER point
-- this at the hosted project.
--
-- ---------------------------------------------------------------------------------------------
-- MEASURED RESULTS — 2026-08-24, against tests/integration/stage5-invitations.itest.ts
-- Clean schema: 81 passed / 81. Every mutant applied ALONE, run, then restored. `restore` was
-- verified byte-identical against pg_policies BEFORE any mutant was applied.
-- ---------------------------------------------------------------------------------------------
-- mutant                   widens                                the tests that went RED
-- ---------------------------------------------------------------------------------------------
-- student_link_grant       GRANTS update (student_user_id) on    "counsellorAssignedA CANNOT write
--                          public.cases to authenticated. An      cases.student_user_id — the
--                          ABSENCE, so the mutant ADDS.           column is in no grant"
--                          4 failed / 77 passed                  "adminA CANNOT write …"
--                                                                "ownerA CANNOT write …"
--                                                                "studentA CANNOT write …"
--                          THE MOST IMPORTANT MUTANT IN THIS FILE. For the counsellor and the two
--                          admins the grant is the ONLY layer — cases_update_accessor admits them
--                          on the row and cases_write_surface_guard ignores this column entirely.
--                          Grant it and a consultancy can point any of its cases at any Auth
--                          account, which is exactly what MV-150 refused.
--
--                          AND ONE TEST IT DOES **NOT** KILL, WHICH IS THE FINDING: "the LINKED
--                          student cannot re-point their own case at somebody else" stays green.
--                          With the grant planted, `cases_update_accessor`'s USING admits the
--                          linked student — but its WITH CHECK is evaluated against the NEW row,
--                          where `student_user_id` is now somebody else's id, so the write is
--                          refused as a WITH CHECK violation, which is ALSO a 42501. That
--                          boundary is defended in two layers; the four above are defended in
--                          one. Reading the failing NAMES rather than the count is what makes
--                          the difference visible.
--
-- student_link_open_policy the same grant PLUS cases_update_      the same four
--                          accessor -> using (true)               4 failed / 77 passed
--                          with check (true)
--                          The both-layers-gone case, for calibration: any authenticated actor
--                          can now evict a linked student from any case in the database. It does
--                          not kill MORE than the grant alone, which measures something worth
--                          knowing — for these four actors the POLICY was never the layer doing
--                          the work.
--
--                          FIRST RUN OF THIS MUTANT WAS INCONCLUSIVE and is recorded rather than
--                          quietly re-run: vitest reported "4 passed (81)" with a "Worker exited
--                          unexpectedly" above it. A crashed worker prints a clean-looking
--                          summary having run almost nothing. Re-run alone, it reported 4 failed
--                          / 77 passed. Read the file count and the duration, never the tick.
--
-- accepted_at_grant        GRANTS update (accepted_at) on        "`accepted_at` is NOT writable by
--                          public.invitations to authenticated    an authenticated client —
--                          1 failed / 80 passed                   acceptance stays server-only"
--                          MV-193 shipped this mutant and this file re-runs it, because slice 2
--                          is what the absence was PROTECTING: a client that can stamp
--                          accepted_at can accept an invitation it merely knows the id of, and
--                          the compare-and-swap stops being the authorization.
--
-- case_select_unlinked     cases_select_accessor gains          "CONTROL: the student cannot see
--                          `OR (student_user_id IS NULL)`         the case BEFORE accepting — the
--                          1 failed / 80 passed                   denial the link lifts"
--                          The REALISTIC bug: "let a student find the case they were invited to".
--                          It hands every authenticated user in the product every unclaimed case
--                          of every consultancy, and it also destroys the pairing that makes the
--                          positive test meaningful — with it, "the student can read the case
--                          afterwards" would pass without acceptance having done anything.
--
-- anon_case_write          GRANTS anon select + update           "anon holds nothing on cases
--                          (student_user_id) on public.cases,     either — the grant surface, not
--                          plants permissive anon policies,       the policy"
--                          AND grants USAGE + EXECUTE on         1 failed / 80 passed
--                          schema private
--                          THE MUTANT THAT TOOK THREE ATTEMPTS, and each attempt was a finding.
--                          Grant + policy alone: 81/81, SURVIVOR — the anon UPDATE never reaches
--                          RLS, it dies as `42501 permission denied for schema private` because
--                          `cases_write_surface_guard` is a BEFORE UPDATE trigger whose function
--                          is SECURITY INVOKER in a schema `anon` cannot enter. Adding USAGE:
--                          still 81/81 — `42501 permission denied for function is_org_admin`,
--                          because the guard calls `private.is_org_admin` and Postgres does not
--                          guarantee `AND` short-circuits, so the helper is reached even on an
--                          UPDATE touching neither guarded column. Adding EXECUTE on the schema's
--                          functions: RED at last.
--
--                          So the anon write refusal on `cases` is over-determined FOUR TIMES
--                          OVER. That is good news about the schema and bad news about the
--                          evidence value of the test on its own: any three of the four layers
--                          would hold with the fourth gone, so this assertion cannot tell you
--                          which one is load-bearing. Both facts are the reason the mutant is
--                          recorded here rather than dropped as "it does not bite".
--
-- ---------------------------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT RE-MUTATE
-- ---------------------------------------------------------------------------------------------
-- `invitations_insert_staff` / `_select_staff` / `_update_staff` are mutated by
-- MV-193-mutation.sql against this same suite, and its measured table stands. MV-194 adds no
-- assertion that depends on them differently — its one new read through
-- `invitations_select_staff` ("the counsellor sees the invitation as ACCEPTED") is a POSITIVE,
-- and a widening cannot kill a positive. Re-mutating them here would produce a second table
-- saying what the first one already says.
--
-- THE COMPARE-AND-SWAP ITSELF IS MUTATED IN CODE, NOT IN SQL. Its four gate predicates live in
-- `lib/invitations/accept.ts`, not in a policy, so the mutants that measure them drop one
-- predicate at a time from that statement. Six were run and each killed a different named test;
-- the table is on the card's dossier. A SQL harness cannot reach them.

\set ON_ERROR_STOP on
\if :{?mutant}
\else
  \echo 'MV-194 mutation harness: pass -v mutant=<name>. See the table in this file for the names.'
  \quit
\endif

select set_config('mv194.mutant', :'mutant', false);

do $$
declare
  m text := current_setting('mv194.mutant', true);

  -- ---- the SHIPPED predicate, restated BYTE-FOR-BYTE from pg_policies --------------------
  -- `cases_select_accessor` and `cases_update_accessor` carry the SAME expression, and
  -- `_update_accessor` carries it as both USING and WITH CHECK. Restated once so a mutant
  -- differs from the real schema in exactly the named clause, and a red test cannot be blamed
  -- on anything else.
  shipped_accessor text :=
    '((student_user_id = ( SELECT auth.uid() AS uid))'
    ' OR (organization_id = ANY (( SELECT private.actor_admin_org_ids() AS actor_admin_org_ids)::uuid[]))'
    ' OR (id = ANY (( SELECT private.actor_assigned_case_ids() AS actor_assigned_case_ids)::uuid[])))';

  known text[] := array['student_link_grant','student_link_open_policy','accepted_at_grant',
                        'case_select_unlinked','anon_case_write','restore'];
begin
  if m is null or not (m = any (known)) then
    raise exception 'MV-194 mutation: unknown mutant %. Known: %', coalesce(m, '<none>'), array_to_string(known, ', ');
  end if;

  -- ---- the column grant that is the WHOLE defence for staff -------------------------------
  if m in ('student_link_grant', 'student_link_open_policy') then
    grant update (student_user_id) on public.cases to authenticated;
    raise notice 'MUTANT %: authenticated may now write cases.student_user_id. For a counsellor '
      'or an org admin this was the ONLY layer - the policy admits them on the row and '
      'cases_write_surface_guard does not look at this column.', m;
  end if;

  if m = 'student_link_open_policy' then
    drop policy if exists cases_update_accessor on public.cases;
    create policy cases_update_accessor on public.cases
      for update to authenticated using (true) with check (true);
    raise notice 'MUTANT student_link_open_policy: and the ROW check is gone too, so any '
      'authenticated actor can evict the linked student from any case in the database. If a '
      'denial is still green under this one, it is not testing.';
  end if;

  -- ---- the absence slice 1 protected, re-measured against slice 2's suite ------------------
  if m = 'accepted_at_grant' then
    grant update (accepted_at) on public.invitations to authenticated;
    raise notice 'MUTANT accepted_at_grant: authenticated may now stamp invitations.accepted_at, '
      'so a client can accept an invitation it merely knows the id of and the compare-and-swap '
      'stops being the authorization.';
  end if;

  -- ---- the realistic read widening --------------------------------------------------------
  if m = 'case_select_unlinked' then
    drop policy if exists cases_select_accessor on public.cases;
    execute format(
      'create policy cases_select_accessor on public.cases
         for select to authenticated using (%s OR (student_user_id IS NULL))',
      shipped_accessor);
    raise notice 'MUTANT case_select_unlinked: every authenticated user in the product now reads '
      'every UNCLAIMED case of every consultancy - and the CONTROL that makes "the student can '
      'read the case after accepting" mean anything is gone with it.';
  end if;

  -- ---- the anon boundary, which no policy mutant can reach ---------------------------------
  if m = 'anon_case_write' then
    grant select, update (student_user_id) on public.cases to anon;
    drop policy if exists mv194_mutant_anon_cases_select on public.cases;
    drop policy if exists mv194_mutant_anon_cases_update on public.cases;
    create policy mv194_mutant_anon_cases_select on public.cases
      for select to anon using (true);
    create policy mv194_mutant_anon_cases_update on public.cases
      for update to anon using (true) with check (true);
    -- THE THIRD LAYER, and it was MEASURED rather than assumed. With only the grant and the
    -- policy planted this mutant killed NOTHING at 81/81 — because an anon UPDATE on
    -- `public.cases` never reaches RLS at all. `cases_write_surface_guard` is a BEFORE UPDATE
    -- trigger whose function lives in schema `private`, it is SECURITY INVOKER, and `anon`
    -- holds no USAGE there: the statement dies as `42501 permission denied for schema
    -- private` before the policy is consulted. (`authenticated` holds that USAGE;
    -- `service_role` does not need it — the guard returns early for `rolbypassrls` roles.)
    --
    -- And then a FOURTH, also measured: with USAGE granted the statement got one step
    -- further and died as `42501 permission denied for function is_org_admin`. The guard is
    -- SECURITY INVOKER and calls `private.is_org_admin` / `private.can_staff_case`, and
    -- Postgres does not guarantee that `AND` short-circuits — so the helper is reached even
    -- on an UPDATE that touches neither `archived_at` nor `operational_status`.
    --
    -- So the anon write refusal on `cases` is defended in FOUR independent layers: the column
    -- grant, the absence of an anon policy, USAGE on schema `private`, and EXECUTE on the
    -- guard's helpers. A three-layer mutant proves only that three of them are enough.
    -- Planting all four is what makes this mutant measure the sentence the test claims —
    -- and the over-determination is itself the finding.
    grant usage on schema private to anon;
    grant execute on all functions in schema private to anon;
    raise notice 'MUTANT anon_case_write: an UNAUTHENTICATED caller may now read and re-point '
      'every case. FOUR layers planted - the column grant, an anon policy, USAGE on schema '
      'private, and EXECUTE on its functions. Any THREE of them alone leave the denial green, '
      'which is the finding this mutant exists to record.';
  end if;

  -- ---- restore: self-contained, byte-for-byte ---------------------------------------------
  if m = 'restore' then
    revoke update (student_user_id) on public.cases from authenticated;
    revoke update (accepted_at) on public.invitations from authenticated;
    revoke all on public.cases from anon;
    -- Measured baseline (2026-08-24): `has_schema_privilege('anon','private','usage')` is
    -- FALSE and `authenticated` is TRUE, so revoking from `anon` alone restores exactly the
    -- shipped state and touches neither of the other two roles.
    revoke execute on all functions in schema private from anon;
    revoke usage on schema private from anon;

    drop policy if exists mv194_mutant_anon_cases_select on public.cases;
    drop policy if exists mv194_mutant_anon_cases_update on public.cases;

    drop policy if exists cases_select_accessor on public.cases;
    execute format(
      'create policy cases_select_accessor on public.cases
         for select to authenticated using (%s)', shipped_accessor);

    drop policy if exists cases_update_accessor on public.cases;
    execute format(
      'create policy cases_update_accessor on public.cases
         for update to authenticated using (%s) with check (%s)',
      shipped_accessor, shipped_accessor);

    raise notice 'RESTORED. Verify with: select policyname, pg_get_expr(polqual, polrelid) from '
      'pg_policy join pg_class on pg_class.oid = polrelid where relname = ''cases''; and with '
      'information_schema.role_column_grants for cases + invitations.';
  end if;
end;
$$;
