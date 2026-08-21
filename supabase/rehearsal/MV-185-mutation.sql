-- MV-185 — the MUTATION harness: revert ONE clause, prove a NAMED test goes red.
--
-- Card: docs/kanban/cards/MV-185-collaboration-schema.md, test plan — "RLS mutation tests, not
--       denial-only probes. A denial-only suite passes identically against a *missing* policy —
--       read the failing test NAMES, not just the count."
-- Migration under test: supabase/migrations/20260821120000_stage4_case_document_collaboration.sql
--
-- WHY THIS FILE EXISTS. `rls-negative-probes-are-inert` is a standing lesson on this project: a
-- table with RLS FORCED and no policy at all denies everything, so every "role X may not write Y"
-- assertion is satisfied by a BROKEN migration exactly as well as by a correct one. The only
-- evidence that a conjunct is load-bearing is removing it and watching a specific `it(...)` fail
-- for the reason it names. `tests/integration/stage4-document-collaboration.itest.ts` pairs every
-- denial with a positive, and this file is what turns those pairs into measurements.
--
-- LOCAL ONLY, AND IT MUTATES COMMITTED STATE: it re-creates a live policy without one of its
-- bounds, or drops a live trigger. Between the mutation and the restore the local database is
-- deliberately vulnerable. Restoring is a STEP, not a `rollback`, because the swap has to be
-- visible to the test run's own connections. NEVER point this at the hosted project.
--
-- Usage — four calls per mutant, in this order:
--   $PSQL = "docker exec -i supabase_db_merovisa psql -U postgres -d postgres -v ON_ERROR_STOP=1"
--   $PSQL -v mutant=reviews_staff -f - < supabase/rehearsal/MV-185-mutation.sql   # revert ONE clause
--   npx vitest run --config vitest.integration.config.ts tests/integration/stage4-document-collaboration.itest.ts
--   $PSQL -f - < supabase/migrations/20260821120000_stage4_case_document_collaboration.sql  # restore 1
--   $PSQL -f - < supabase/migrations/20260821150000_stage4_case_storage_paths.sql           # restore 2
--
-- The restore is the migrations themselves, which are re-runnable by construction and re-assert
-- every guard in their §8/§3 — so a restore that did not restore refuses instead of passing quietly.
--
-- THE SECOND FILE IS NOT OPTIONAL, AND THE REASON WAS MEASURED RATHER THAN REASONED. §6 of the
-- migration opens with `revoke all on public.case_document_versions from anon, authenticated;` and
-- then re-grants ITS OWN nine columns. MV-190 granted a tenth — `id`, so a client can name the
-- Storage object BEFORE it writes the row (spec §6.2) — so re-running the MV-185 file ALONE
-- silently un-grants it and leaves the collaboration path unwritable again. MV-185's own §8 (4)
-- cannot catch that: the file has just restored the exact state that assertion pins. Running
-- MV-190's migration second re-grants and re-asserts, and
-- `tests/integration/stage4-case-storage.itest.ts` names the grant in its first test, so a skipped
-- restore 2 is red rather than quiet. (The MV-190 CHECK constraint survives a lone re-run of this
-- file; nothing in it drops one.)
--
-- EVERY CONJUNCT BELOW IS RESTATED BYTE-FOR-BYTE FROM THE MIGRATION. A mutant differs from the
-- shipped policy in exactly the named clause, so a red test cannot be blamed on anything else.
--
-- ---------------------------------------------------------------------------------------------
-- mutant             reverts                                     the test that must go red
-- ---------------------------------------------------------------------------------------------
-- versions_select    drop case_document_versions_select_actor     "the ASSIGNED counsellor sees
--                                                                  their case's versions and reviews"
-- reviews_select     drop case_document_reviews_select_actor      "the LINKED STUDENT may read the
--                                                                  versions ... AND the reviews of them"
-- versions_staff     can_staff_case -> can_access_case            "the LINKED STUDENT may NOT upload a
--                                                                  counsellor-side version on their own case"
-- versions_org       drop the organization_id bound               "a FORGED organization_id is refused even
--                                                                  for an actor who may staff the case"
-- versions_parent    drop the request parentage bound             "may NOT hang a version off ANOTHER
--                                                                  case's request"
-- versions_pointer   drop the document_id bound                   "may name THIS case's vault row, and may
--                                                                  NOT name another case's"
-- versions_prov      drop uploaded_by = auth.uid()                "a FORGED uploaded_by is refused — one
--                                                                  counsellor cannot file for another"
-- reviews_staff      can_staff_case -> can_access_case            "THE LINKED STUDENT MAY NOT REVIEW THEIR
--                                                                  OWN FILE"
-- reviews_org        drop the organization_id bound               "a FORGED organization_id on a review is
--                                                                  refused even for staff"
-- reviews_parent     drop the version parentage bound             "may NOT judge ANOTHER case's version"
-- reviews_prov       drop reviewed_by = auth.uid()                "a FORGED reviewed_by is refused — one
--                                                                  counsellor cannot judge in another's name"
-- sync               drop both sync triggers                      "accepting the newest version resolves the
--                                                                  request, and the MV-182 trigger dates it"
-- guard              drop case_document_requests_status_guard     "REFUSES a hand-written status that
--                                                                  contradicts the newest version"
-- ---------------------------------------------------------------------------------------------

\set ON_ERROR_STOP on
\if :{?mutant}
\else
  \echo 'MV-185 mutation harness: pass -v mutant=<name>. See the table in this file for the names.'
  \quit
\endif

select set_config('mv185.mutant', :'mutant', false);

do $$
declare
  m text := current_setting('mv185.mutant', true);

  -- The versions INSERT policy, one conjunct per constant, restated from §7 of the migration.
  v_staff   text := 'private.can_staff_case(case_id)';
  v_org     text := 'organization_id = private.case_org_id(case_id)';
  v_parent  text := 'private.document_request_case_id(request_id) = case_id';
  v_pointer text := '(document_id is null or private.document_case_id(document_id) = case_id)';
  v_prov    text := 'uploaded_by = (select auth.uid())';

  -- The reviews INSERT policy, likewise.
  r_staff   text := 'private.can_staff_case(case_id)';
  r_org     text := 'organization_id = private.case_org_id(case_id)';
  r_parent  text := 'private.document_version_case_id(version_id) = case_id';
  r_prov    text := 'reviewed_by = (select auth.uid())';

  parts text[];
  known text[] := array['versions_select','reviews_select','versions_staff','versions_org',
                        'versions_parent','versions_pointer','versions_prov','reviews_staff',
                        'reviews_org','reviews_parent','reviews_prov','sync','guard'];
begin
  if m is null or not (m = any (known)) then
    raise exception 'MV-185 mutation: unknown mutant %. Known: %', coalesce(m, '<none>'), array_to_string(known, ', ');
  end if;

  -- --- the two READ policies -------------------------------------------------------------
  -- Dropped rather than weakened: a SELECT policy has exactly one conjunct, so "without the
  -- conjunct" and "without the policy" are the same mutant. RLS is FORCED, so the table then
  -- denies every read — which is precisely the state a denial-only suite cannot tell from health.
  if m = 'versions_select' then
    drop policy if exists case_document_versions_select_actor on public.case_document_versions;
    raise notice 'MUTANT versions_select: case_document_versions has no SELECT policy.';
  end if;

  if m = 'reviews_select' then
    drop policy if exists case_document_reviews_select_actor on public.case_document_reviews;
    raise notice 'MUTANT reviews_select: case_document_reviews has no SELECT policy.';
  end if;

  -- --- the versions INSERT policy --------------------------------------------------------
  if m in ('versions_staff','versions_org','versions_parent','versions_pointer','versions_prov') then
    -- `can_access_case` rather than a removal: it is `can_staff_case` PLUS the student disjunct,
    -- so this mutant admits exactly one new actor — the linked student — and kills exactly the
    -- test that names them. Removing the conjunct outright would also admit strangers and blur
    -- which sentence the red test is about.
    if m = 'versions_staff' then
      parts := array['private.can_access_case(case_id)', v_org, v_parent, v_pointer, v_prov];
    else
      parts := array[v_staff, v_org, v_parent, v_pointer, v_prov];
      if m = 'versions_org'     then parts := array_remove(parts, v_org);     end if;
      if m = 'versions_parent'  then parts := array_remove(parts, v_parent);  end if;
      if m = 'versions_pointer' then parts := array_remove(parts, v_pointer); end if;
      if m = 'versions_prov'    then parts := array_remove(parts, v_prov);    end if;
    end if;

    execute 'drop policy if exists case_document_versions_insert_staff on public.case_document_versions';
    execute format(
      'create policy case_document_versions_insert_staff on public.case_document_versions '
      'for insert to authenticated with check (%s)',
      array_to_string(parts, E'\n    and '));
    raise notice 'MUTANT %: versions WITH CHECK is now (%)', m, array_to_string(parts, ' and ');
  end if;

  -- --- the reviews INSERT policy ---------------------------------------------------------
  if m in ('reviews_staff','reviews_org','reviews_parent','reviews_prov') then
    if m = 'reviews_staff' then
      parts := array['private.can_access_case(case_id)', r_org, r_parent, r_prov];
    else
      parts := array[r_staff, r_org, r_parent, r_prov];
      if m = 'reviews_org'    then parts := array_remove(parts, r_org);    end if;
      if m = 'reviews_parent' then parts := array_remove(parts, r_parent); end if;
      if m = 'reviews_prov'   then parts := array_remove(parts, r_prov);   end if;
    end if;

    execute 'drop policy if exists case_document_reviews_insert_staff on public.case_document_reviews';
    execute format(
      'create policy case_document_reviews_insert_staff on public.case_document_reviews '
      'for insert to authenticated with check (%s)',
      array_to_string(parts, E'\n    and '));
    raise notice 'MUTANT %: reviews WITH CHECK is now (%)', m, array_to_string(parts, ' and ');
  end if;

  -- --- the three triggers ----------------------------------------------------------------
  if m = 'sync' then
    drop trigger if exists case_document_versions_sync_request_status on public.case_document_versions;
    drop trigger if exists case_document_reviews_sync_request_status  on public.case_document_reviews;
    raise notice 'MUTANT sync: nothing writes a request''s derived status any more.';
  end if;

  if m = 'guard' then
    drop trigger if exists case_document_requests_status_guard on public.case_document_requests;
    raise notice 'MUTANT guard: a hand-written status may now contradict the newest version.';
  end if;

  raise notice 'MV-185 mutation applied: %. RESTORE with the migration itself when the run finishes.', m;
end $$;
