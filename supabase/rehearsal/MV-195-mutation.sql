-- MV-195 — the Stage 5 slice 3 mutation harness: widen ONE boundary, prove a NAMED test goes red.
--
-- Card: docs/kanban/cards/MV-195-stage5-two-case-experience.md, Test plan — "RLS / grant mutation
--       … mutants must WIDEN, never drop (a drop-mutant leaves every denial green), and `restore`
--       must be verified byte-identical against `pg_policies` AND `role_column_grants` before the
--       first mutant and again after. Read the failing test NAMES, not just the count."
-- Suite under test: tests/integration/stage5-student-case.itest.ts
-- Format copied from: supabase/rehearsal/MV-194-mutation.sql, which copied MV-193's.
--
-- ---------------------------------------------------------------------------------------------
-- WHAT THIS SLICE RELIES ON — AND WHY THE FIRST MUTANT IS THE ONE THAT MATTERS
-- ---------------------------------------------------------------------------------------------
-- Decision D ("how much does the student see, and can they ANSWER?") was settled by MEASUREMENT
-- rather than preference, and the measurement is a clean split across the three Stage 4 tables:
--
--   READ  — `case_document_requests_select_actor`, `case_document_versions_select_actor` and
--           `case_document_reviews_select_actor` all ride `private.actor_case_ids()`, whose first
--           disjunct is `student_user_id = auth.uid()`. The linked student sees all three.
--   WRITE — all three INSERT policies, and `case_document_requests_update_staff`, ride
--           `private.can_staff_case`, which is `can_access_case` MINUS the student disjunct.
--           The linked student writes nothing.
--
-- That subtraction is the whole of decision D. `staff_to_access` below is the mutant that
-- measures it: replace `can_staff_case` with `can_access_case` on those four policies and the
-- student silently acquires the ability to upload against their own case, judge their own file,
-- mint requests against themselves, and mark them resolved — with no grant change, no migration
-- anybody would notice, and a fully green unit suite. It is the exact edit a future
-- "let students answer a request" slice will be tempted to make in one line, and the four tests
-- it must turn red are what force that slice to be a deliberate decision instead.
--
-- ---------------------------------------------------------------------------------------------
-- AND THE LAYER NO SQL MUTANT CAN REACH
-- ---------------------------------------------------------------------------------------------
-- Case authorization is enforced in RLS **and** in TypeScript independently, so a single-layer
-- mutant survives at full green. `lib/cases/student-case-route.ts` carries two refusals that no
-- policy expresses — a PERSONAL case under the consultancy URL, and a STAFF viewer at the
-- student's door — because neither is a permission question: both actors legitimately hold
-- `case.read`. Those are mutated IN CODE, one line at a time, and the results table is on the
-- card's dossier. A SQL harness cannot reach them, and a run of this file alone is therefore only
-- half the argument.
--
-- ---------------------------------------------------------------------------------------------
-- Usage — three calls per mutant, in this order:
--   $DB = "supabase_db_merovisa"
--   docker exec -i $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v mutant=staff_to_access -f - < supabase/rehearsal/MV-195-mutation.sql
--   npx vitest run --config vitest.integration.config.ts tests/integration/stage5-student-case.itest.ts
--   docker exec -i $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v mutant=restore -f - < supabase/rehearsal/MV-195-mutation.sql
--
-- `restore` is SELF-CONTAINED, as MV-194's and MV-193's are: it re-creates every policy it touches
-- byte-for-byte from the shipped `pg_policies` text rather than re-running a migration. That
-- matters — 20260818120000 and 20260821120000 both open with `revoke all … from authenticated`
-- and re-grant only their own set, so leaning on a migration to restore can silently un-grant a
-- column a LATER migration added (MISTAKES.md, Supabase/Postgres).
--
-- LOCAL ONLY, AND IT MUTATES COMMITTED STATE. Between the mutation and the restore the local
-- database lets a student write on their consultancy's case. NEVER point this at the hosted
-- project.
--
-- ---------------------------------------------------------------------------------------------
-- MEASURED RESULTS — see the dossier. The local Docker engine would not start in the session that
-- built this slice (Docker Desktop's WSL backend never opened its named pipe in a
-- non-interactive session), so the table below records what each mutant is BUILT to kill and is
-- marked UNRUN rather than filled in with numbers nobody measured. `81 skipped` is not
-- `81 passed`, and neither is an unrun mutant a survivor.
-- ---------------------------------------------------------------------------------------------
-- mutant                widens                                    the tests it MUST turn red
-- ---------------------------------------------------------------------------------------------
-- staff_to_access       the four WRITE policies on the three      "cannot upload a version against
--                       Stage 4 tables swap `can_staff_case`       their own case"
--                       for `can_access_case` — i.e. the          "cannot review — a student must
--                       student disjunct comes back                not judge their own file"
--                                                                 "cannot mint a request against
--                       THE MOST IMPORTANT MUTANT IN THIS FILE.    themselves"
--                       This is decision D, and nothing else      "cannot mark a request resolved
--                       defends it: the column grants are          by hand"
--                       identical for staff and student, so the
--                       predicate IS the boundary. If any of      MUST NOT kill the CONTROL
--                       those four stays green under this          ("the assigned counsellor CAN do
--                       mutant, decision D is untested.            all four") — `can_access_case`
--                                                                  is a superset, so a mutant that
--                                                                  killed the control would mean
--                                                                  the control was measuring the
--                                                                  wrong thing.
--
-- request_select_open   `case_document_requests_select_actor`     "a DIFFERENT student sees none of
--                       -> `using (true)`                          the three, though all three
--                                                                  exist"
--                       The realistic read bug: a chase list
--                       readable by every authenticated user in
--                       the product. It must NOT kill "sees the
--                       request their consultancy made" — a
--                       widening cannot kill a positive, and if
--                       it does, that positive was passing for
--                       the wrong reason.
--
-- version_select_open   the same widening one table down, on      "a DIFFERENT student sees none of
--                       `case_document_versions_select_actor`      the three …"
--                       Separated from the one above because a
--                       single test covers all three tables in a
--                       loop: run them one at a time and the
--                       failing ASSERTION names the table, which
--                       is what tells you each policy is
--                       independently covered rather than
--                       collectively.
--
-- review_select_open    the same widening on                      "a DIFFERENT student sees none of
--                       `case_document_reviews_select_actor`       the three …"
--                       This one carries the rejection NOTE, so
--                       it is the widening with the most
--                       personal content behind it.
--
-- org_select_case       `organizations_select_member` gains       "the linked student cannot read
--                       `OR (id = private.case_org_id(...))`       their consultancy's
--                       for any case the actor can reach —         `organizations` row"
--                       i.e. the helpful "let the student see
--                       who their consultancy is".               MUST NOT kill "CONTROL: a member
--                                                                  of that organization CAN read
--                       This is decision A's measurement, and      it".
--                       the reason the student surface names no
--                       consultancy: there is nothing for it to
--                       leak. The mutant is here because that
--                       absence is a fact about the schema, and
--                       a fact nobody tests is a fact that
--                       changes quietly. It is ALSO the most
--                       plausible future widening in this file —
--                       "the student should see who they are
--                       working with" is a reasonable product
--                       request, and it would be a schema change
--                       rather than a page change.
--
-- ---------------------------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT RE-MUTATE
-- ---------------------------------------------------------------------------------------------
-- `cases_select_accessor` and `cases_update_accessor` are mutated by MV-194-mutation.sql against
-- the sibling suite, and its measured table stands. This slice's use of `cases` is a READ through
-- the same policy MV-194 already widened as `case_select_unlinked`; re-mutating it here would
-- produce a second table saying what the first one already says.
--
-- The `%_case` policy CENSUS is untouched: none of the four `_select_actor` / `_insert_staff`
-- names this file rewrites carries the `_case` suffix, so MV-185 §8 (10)'s "27 policies on 9
-- tables" assertion is unaffected — by construction, and worth re-checking after a restore.

\set ON_ERROR_STOP on
\if :{?mutant}
\else
  \echo 'MV-195 mutation harness: pass -v mutant=<name>. See the table in this file for the names.'
  \quit
\endif

select set_config('mv195.mutant', :'mutant', false);

do $$
declare
  m text := current_setting('mv195.mutant', true);

  -- ---- the SHIPPED predicates, restated BYTE-FOR-BYTE ------------------------------------
  -- All three READ policies carry the same expression (…20260818120000….sql:190 and
  -- …20260821120000….sql:444, 481). Restated once so a mutant differs from the real schema in
  -- exactly the named clause, and a red test cannot be blamed on anything else.
  shipped_select text :=
    '(case_id = ANY ((( SELECT private.actor_case_ids() AS actor_case_ids))::uuid[]))';

  -- The four WRITE predicates, each verbatim from its migration.
  shipped_request_insert text :=
    '((private.can_staff_case(case_id)'
    ' AND (organization_id = private.case_org_id(case_id))'
    ' AND (requested_by = ( SELECT auth.uid() AS uid))))';
  shipped_request_update text := '(private.can_staff_case(case_id))';
  shipped_version_insert text :=
    '((private.can_staff_case(case_id)'
    ' AND (organization_id = private.case_org_id(case_id))'
    ' AND (private.document_request_case_id(request_id) = case_id)'
    ' AND ((document_id IS NULL) OR (private.document_case_id(document_id) = case_id))'
    ' AND (uploaded_by = ( SELECT auth.uid() AS uid))))';
  shipped_review_insert text :=
    '((private.can_staff_case(case_id)'
    ' AND (organization_id = private.case_org_id(case_id))'
    ' AND (private.document_version_case_id(version_id) = case_id)'
    ' AND (reviewed_by = ( SELECT auth.uid() AS uid))))';

  -- `organizations_select_member` (…20260730180000….sql:325).
  shipped_org_select text :=
    '(id = ANY ((( SELECT private.actor_org_ids() AS actor_org_ids))::uuid[]))';

  known text[] := array['staff_to_access','request_select_open','version_select_open',
                        'review_select_open','org_select_case','restore'];
begin
  if m is null or not (m = any (known)) then
    raise exception 'MV-195 mutation: unknown mutant %. Known: %', coalesce(m, '<none>'), array_to_string(known, ', ');
  end if;

  -- ---- DECISION D, and the only thing defending it ----------------------------------------
  if m = 'staff_to_access' then
    -- `can_access_case` is `can_staff_case` PLUS `student_user_id = auth.uid()`. Swapping the
    -- predicate is therefore a pure widening, and it hands the linked student every write verb
    -- on their own consultancy case. The column grants do not differ between staff and student,
    -- so after this edit there is no second layer left at the database at all.
    drop policy if exists case_document_requests_insert_staff on public.case_document_requests;
    execute
      'create policy case_document_requests_insert_staff on public.case_document_requests
         for insert to authenticated
         with check (private.can_access_case(case_id)
                     and organization_id = private.case_org_id(case_id)
                     and requested_by = (select auth.uid()))';

    drop policy if exists case_document_requests_update_staff on public.case_document_requests;
    execute
      'create policy case_document_requests_update_staff on public.case_document_requests
         for update to authenticated
         using (private.can_access_case(case_id))
         with check (private.can_access_case(case_id))';

    drop policy if exists case_document_versions_insert_staff on public.case_document_versions;
    execute
      'create policy case_document_versions_insert_staff on public.case_document_versions
         for insert to authenticated
         with check (private.can_access_case(case_id)
                     and organization_id = private.case_org_id(case_id)
                     and private.document_request_case_id(request_id) = case_id
                     and (document_id is null or private.document_case_id(document_id) = case_id)
                     and uploaded_by = (select auth.uid()))';

    drop policy if exists case_document_reviews_insert_staff on public.case_document_reviews;
    execute
      'create policy case_document_reviews_insert_staff on public.case_document_reviews
         for insert to authenticated
         with check (private.can_access_case(case_id)
                     and organization_id = private.case_org_id(case_id)
                     and private.document_version_case_id(version_id) = case_id
                     and reviewed_by = (select auth.uid()))';

    raise notice 'MUTANT staff_to_access: the student disjunct is BACK on all four write '
      'policies. A linked student may now upload against their own case, judge their own file, '
      'mint requests against themselves and resolve them. This is decision D with nothing left '
      'defending it - if any of the four denials is still green, decision D is untested.';
  end if;

  -- ---- the three read widenings, one table at a time ---------------------------------------
  if m = 'request_select_open' then
    drop policy if exists case_document_requests_select_actor on public.case_document_requests;
    execute 'create policy case_document_requests_select_actor on public.case_document_requests
               for select to authenticated using (true)';
    raise notice 'MUTANT request_select_open: every authenticated user in the product now reads '
      'every consultancy chase list.';
  end if;

  if m = 'version_select_open' then
    drop policy if exists case_document_versions_select_actor on public.case_document_versions;
    execute 'create policy case_document_versions_select_actor on public.case_document_versions
               for select to authenticated using (true)';
    raise notice 'MUTANT version_select_open: every authenticated user now reads every arrived '
      'file row, storage_path included.';
  end if;

  if m = 'review_select_open' then
    drop policy if exists case_document_reviews_select_actor on public.case_document_reviews;
    execute 'create policy case_document_reviews_select_actor on public.case_document_reviews
               for select to authenticated using (true)';
    raise notice 'MUTANT review_select_open: every authenticated user now reads every judgement '
      'and every rejection NOTE in the product.';
  end if;

  -- ---- decision A's measurement ------------------------------------------------------------
  if m = 'org_select_case' then
    drop policy if exists organizations_select_member on public.organizations;
    -- "Let the student see who their consultancy is" — a reasonable product request, and a
    -- SCHEMA change rather than a page change. This is what it would look like.
    execute format(
      'create policy organizations_select_member on public.organizations
         for select to authenticated
         using (%s OR (id = ANY ((select array(
                 select c.organization_id from public.cases c
                  where c.student_user_id = (select auth.uid())
                    and c.organization_id is not null)))))',
      shipped_org_select);
    raise notice 'MUTANT org_select_case: a linked student may now read their consultancy''s '
      'organizations row. The student surface names no consultancy BECAUSE there is nothing to '
      'name - this mutant is what keeps that a measured fact rather than a stale assumption.';
  end if;

  -- ---- restore: self-contained, byte-for-byte ---------------------------------------------
  if m = 'restore' then
    drop policy if exists case_document_requests_select_actor on public.case_document_requests;
    execute format('create policy case_document_requests_select_actor on public.case_document_requests
                      for select to authenticated using (%s)', shipped_select);

    drop policy if exists case_document_versions_select_actor on public.case_document_versions;
    execute format('create policy case_document_versions_select_actor on public.case_document_versions
                      for select to authenticated using (%s)', shipped_select);

    drop policy if exists case_document_reviews_select_actor on public.case_document_reviews;
    execute format('create policy case_document_reviews_select_actor on public.case_document_reviews
                      for select to authenticated using (%s)', shipped_select);

    drop policy if exists case_document_requests_insert_staff on public.case_document_requests;
    execute format('create policy case_document_requests_insert_staff on public.case_document_requests
                      for insert to authenticated with check (%s)', shipped_request_insert);

    drop policy if exists case_document_requests_update_staff on public.case_document_requests;
    execute format('create policy case_document_requests_update_staff on public.case_document_requests
                      for update to authenticated using (%s) with check (%s)',
                   shipped_request_update, shipped_request_update);

    drop policy if exists case_document_versions_insert_staff on public.case_document_versions;
    execute format('create policy case_document_versions_insert_staff on public.case_document_versions
                      for insert to authenticated with check (%s)', shipped_version_insert);

    drop policy if exists case_document_reviews_insert_staff on public.case_document_reviews;
    execute format('create policy case_document_reviews_insert_staff on public.case_document_reviews
                      for insert to authenticated with check (%s)', shipped_review_insert);

    drop policy if exists organizations_select_member on public.organizations;
    execute format('create policy organizations_select_member on public.organizations
                      for select to authenticated using (%s)', shipped_org_select);

    raise notice 'RESTORED. Verify BOTH layers before trusting the next run: '
      '(1) select polname, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) '
      'from pg_policy join pg_class on pg_class.oid = polrelid where relname in '
      '(''case_document_requests'',''case_document_versions'',''case_document_reviews'',''organizations''); '
      'and (2) information_schema.role_column_grants for those tables. A policy restored while a '
      'grant stayed planted is a schema neither shipped nor mutated.';
  end if;
end;
$$;
