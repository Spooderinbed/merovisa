-- MV-191 — the Stage 4 EXIT GATE mutation harness: widen ONE boundary, prove a NAMED test goes red.
--
-- Card: docs/kanban/cards/MV-191-stage4-exit-gate.md, risk notes — "A denial-only suite passes
--       identically against a MISSING policy. Mutate every policy the gate claims to cover and read
--       the failing test NAMES."
-- Inventory: docs/audits/2026-08-22-stage4-document-boundary-coverage.md
-- Suite under test: tests/integration/stage4-exit-gate.itest.ts
--
-- ---------------------------------------------------------------------------------------------
-- WHY EVERY MUTANT HERE WIDENS, WHERE MV-185's MOSTLY DROP
-- ---------------------------------------------------------------------------------------------
-- MV-185 mutated by SUBTRACTION because its suite is dominated by POSITIVE claims: remove a policy
-- and the actor who should see stops seeing. That does not work for an exit gate, which is
-- dominated by NEGATIVE claims. Dropping a SELECT policy makes a table deny MORE, so every
-- "unauthorized actor sees nothing" assertion stays GREEN against the drop — passing for the wrong
-- reason, which is the precise failure this card exists to rule out.
--
-- **A denial dies to PERMISSIVENESS.** So each mutant below widens exactly one boundary and names
-- the assertions that must go red. Two shapes:
--
--   * `*_select_org` — the REALISTIC bug. The shipped predicate admits a case when the actor is its
--     student, an ADMIN of its organization, or ASSIGNED to it. The mutant swaps
--     `actor_admin_org_ids()` for `actor_org_ids()`, so ANY member of the tenant sees every case in
--     it. This is what a later author reaches for when a counsellor complains they cannot see a
--     colleague's case, and it is invisible to a suite that only probes org B and outsiders —
--     `counsellorUnassignedA` is the actor it breaks, and the only one.
--   * `*_select_true` — the BLUNT bug, for calibration. `using (true)` admits every authenticated
--     actor, so a mutant that leaves ANY authenticated denial green has found a test that is not
--     testing.
--
-- The two are kept apart deliberately. A single blunt mutant would kill every denial at once and
-- prove only that the suite notices catastrophe; the narrow one is what proves the boundary is
-- drawn at the CASE and not merely at the tenant.
--
-- The anon and Storage mutants are different in kind and are labelled as such below: those two
-- boundaries are enforced by an ABSENCE (no grant, no policy), and for an absence the mutant is an
-- ADDITION.
--
-- LOCAL ONLY, AND IT MUTATES COMMITTED STATE. Between the mutation and the restore the local
-- database is deliberately vulnerable — it hands one actor, or every actor, a read they must not
-- have. NEVER point this at the hosted project.
--
-- Usage — three calls per mutant, in this order:
--   $DB = "supabase_db_merovisa"
--   docker exec -i $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v mutant=versions_select_org -f - < supabase/rehearsal/MV-191-mutation.sql
--   npx vitest run --config vitest.integration.config.ts tests/integration/stage4-exit-gate.itest.ts
--   docker exec -i $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v mutant=restore -f - < supabase/rehearsal/MV-191-mutation.sql
--
-- `restore` is SELF-CONTAINED here — unlike MV-190's, it re-creates every policy it touched
-- byte-for-byte from the live catalogue and revokes every grant it planted, so no migration re-run
-- is required. That matters: re-running MV-185's migration ALONE silently un-grants `id` on
-- `case_document_versions` (it opens with `revoke all … from authenticated` and re-grants only its
-- own nine columns), so a harness that leaned on a migration to restore would leave the tree in a
-- state MV-190's tests fail against. Restoring MV-185's migration properly takes TWO calls,
-- MV-185 then MV-190; this file avoids needing either.
--
-- Every restored clause is restated BYTE-FOR-BYTE from `pg_policies` as shipped, so a mutant
-- differs from the real schema in exactly the named clause and a red test cannot be blamed on
-- anything else.
--
-- ---------------------------------------------------------------------------------------------
-- mutant                 widens                                   the tests that must go red
-- ---------------------------------------------------------------------------------------------
-- versions_select_org    case_document_versions_select_actor:     "counsellorUnassignedA … learns
--                        admin-of-org -> ANY member of org         NOTHING from listCaseDocument-
--                                                                  Versions"
--                                                                 "counsellorUnassignedA … counts
--                                                                  ZERO on case_document_versions"
--                                                                 "counsellorUnassignedA … gets the
--                                                                  SAME answer for a real version
--                                                                  id and a fabricated one"
--                        (org B and the outsider stay GREEN — they hold no membership in org A at
--                         all, which is what makes this mutant a measurement of the CASE bound
--                         rather than of the tenant bound.)
-- requests_select_org    case_document_requests_select_actor,     "counsellorUnassignedA … learns
--                        same swap                                 NOTHING from listCaseDocument-
--                                                                  Requests"
--                                                                 "counsellorUnassignedA … counts
--                                                                  ZERO on case_document_requests"
-- reviews_select_org     case_document_reviews_select_actor,      "counsellorUnassignedA … learns
--                        same swap                                 NOTHING from listCaseDocument-
--                                                                  Reviews"
--                                                                 "counsellorUnassignedA … counts
--                                                                  ZERO on case_document_reviews"
-- versions_select_true   case_document_versions_select_actor      every "learns NOTHING from
--                        -> using (true)                           listCaseDocumentVersions", every
--                                                                  "counts ZERO on
--                                                                  case_document_versions", and
--                                                                  every version parity test — for
--                                                                  ALL THREE denied actors
-- cases_select_org       cases_select_accessor: admin-of-org      NOTHING, ON ITS OWN - and that is
--                        -> ANY member of org                      the finding. See "the download
--                                                                  verb takes TWO mutants" below.
-- assign_tenant_         a trigger assigning every tenant         NOTHING - `case_assignments` is
--   counsellors          counsellor to any case receiving a        UNIQUE on (case_id) where
--                        version                                   assignment_role =
--                                                                  'primary_counsellor', and the
--                                                                  CHECK admits no other role, so a
--                                                                  case has EXACTLY ONE assigned
--                                                                  counsellor and the widening is
--                                                                  unreachable by adding a row.
--                                                                  Retained as documentation of
--                                                                  that schema fact.
-- storage_case_list      PLANTS a SELECT policy on                "counsellorUnassignedA … lists
--                        storage.objects for the `case/` prefix    NOTHING under case/<case A>"
--                        (an ABSENCE, so the mutant ADDS)         "counsellorAssignedB …", "outsider
--                                                                  …", "the ASSIGNED counsellor also
--                                                                  lists nothing", "listing the BARE
--                                                                  case/ root discloses no case id"
-- anon_read_grant        GRANTS anon SELECT + a permissive        "the ANONYMOUS caller learns
--                        policy on the three tables               nothing from any of the three"
--                        (an ABSENCE — anon holds NO grant at
--                         all today, so its refusal is a `42501`
--                         from the grant surface and NOT from a
--                         policy. Recorded plainly because the
--                         two are different guarantees.)
-- anon_write_grant       GRANTS anon INSERT on all three          "an anonymous client may NOT
--                        tables + a permissive INSERT policy       insert a version" / "… a review"
--                                                                  / "… a request"
--                                                                 "nothing the anonymous caller
--                                                                  attempted actually landed"
-- restore                undoes every widening and every plant    - (self-contained; no migration
--                                                                    re-run needed)
-- ---------------------------------------------------------------------------------------------
--
-- ---------------------------------------------------------------------------------------------
-- THE DOWNLOAD VERB TAKES TWO MUTANTS, AND THAT IS THE MOST INTERESTING RESULT IN THIS FILE
-- ---------------------------------------------------------------------------------------------
-- The two mint denials -
--   "REFUSES counsellorUnassignedA (in the tenant, but not on this case) - and the refusal is a
--    DENIAL, not a mint failure"
--   "the mint answers a refused actor identically whether the object exists or not"
-- survive `cases_select_org` on its own, and they survive a TypeScript widening on its own. They
-- die only when BOTH are applied together. Measured, in this order:
--
--   1. `cases_select_org` alone            -> 50/50 green. The row becomes visible, but
--                                             `deriveCaseGrants` still refuses an unassigned
--                                             counsellor, so TypeScript denies.
--   2. TS widening alone                   -> 50/50 green. TypeScript would allow, but
--                                             `getCaseContext` reads `cases` through the ACTOR'S
--                                             RLS client, so the row is invisible, `caseExists` is
--                                             false, and it denies before facts are derived.
--   3. both together                       -> exactly those two tests go red.
--
-- So the download boundary is defended INDEPENDENTLY IN TWO LAYERS, and neither is load-bearing
-- alone. That is the property MV-153 built its whole matrix around, now shown to hold for the
-- document surface. Recording it matters because a future author who removes one layer will see a
-- fully green exit gate and conclude the layer was redundant. It is not - it is the second half of
-- a belt-and-braces the other half of which is one refactor away from being the only one left.
--
-- The TypeScript half cannot live in this file; SQL cannot reach it. It is applied by hand and is
-- reproduced here so the measurement can be repeated exactly. In `lib/cases/permissions.ts`,
-- inside `deriveCaseGrants`, replace:
--
--     if (facts.isAssignedToCase) grants.push({ role: "counsellor", scope: "assigned" });
--     else reason = "not-assigned";
--
--   with:
--
--     grants.push({ role: "counsellor", scope: "assigned" });
--
-- A NOTE ON THE OBVIOUS-LOOKING TS MUTANT THAT IS WRONG: setting the grid cell
-- `counsellor["case.read"]` to "all-org" does NOT widen. `decideCasePermission` requires the
-- GRANTED scope to equal the grid cell EXACTLY, and the granted scope comes from the facts, so
-- raising the cell to "all-org" makes a counsellor's "assigned" grant stop matching and DENIES
-- everyone - it killed the positive control and left every denial green. A mutant that makes the
-- suite redder is not automatically a widening; check which test died before believing it.
-- ---------------------------------------------------------------------------------------------

\set ON_ERROR_STOP on
\if :{?mutant}
\else
  \echo 'MV-191 mutation harness: pass -v mutant=<name>. See the table in this file for the names.'
  \quit
\endif

select set_config('mv191.mutant', :'mutant', false);

do $$
declare
  m text := current_setting('mv191.mutant', true);

  -- The SHIPPED predicate on all three collaboration tables, restated from pg_policies.
  shipped_doc text :=
    '(case_id = ANY ((select private.actor_case_ids())::uuid[]))';

  -- The WIDENED predicate: the actor's own cases, PLUS every case in any organization they are a
  -- member of — admin or not. Inlined rather than mutating `private.actor_case_ids()` itself, and
  -- that is deliberate: the helper is shared by policies on nine tables, so mutating it would kill
  -- a superset of tests and no single red name could be attributed to the sentence under test.
  --
  -- `private.case_org_id()` rather than a subquery on `public.cases`. MEASURED: the first draft of
  -- this mutant read `case_id in (select c.id from public.cases c where c.organization_id = any
  -- (private.actor_org_ids()))` and was INERT — it survived the whole suite at 50/50. A subquery
  -- inside a policy is itself subject to RLS, and `cases_select_accessor` already hides case A from
  -- the very actor the mutant exists to let in, so the widening widened nothing. `case_org_id` is
  -- SECURITY DEFINER and answers regardless. A mutant that kills nothing is a finding; this one was
  -- a finding about the MUTANT, and reading only the pass COUNT would have recorded it as evidence
  -- that the test was sound.
  widened_doc text :=
    '(case_id = ANY ((select private.actor_case_ids())::uuid[])'
    ' or private.case_org_id(case_id) = any (private.actor_org_ids()))';

  -- The SHIPPED `cases` read, restated from pg_policies.
  shipped_cases text :=
    '((student_user_id = (select auth.uid()))'
    ' OR (organization_id = ANY ((select private.actor_admin_org_ids())::uuid[]))'
    ' OR (id = ANY ((select private.actor_assigned_case_ids())::uuid[])))';

  -- The same read with ADMIN-of-org widened to MEMBER-of-org.
  widened_cases text :=
    '((student_user_id = (select auth.uid()))'
    ' OR (organization_id = ANY ((select private.actor_org_ids())::uuid[]))'
    ' OR (id = ANY ((select private.actor_assigned_case_ids())::uuid[])))';

  known text[] := array['versions_select_org','requests_select_org','reviews_select_org',
                        'versions_select_true','cases_select_org','assign_tenant_counsellors',
                        'storage_case_list','anon_read_grant','anon_write_grant','restore'];
begin
  if m is null or not (m = any (known)) then
    raise exception 'MV-191 mutation: unknown mutant %. Known: %', coalesce(m, '<none>'), array_to_string(known, ', ');
  end if;

  -- --- the three collaboration SELECT policies, widened to the whole tenant ------------------
  if m = 'versions_select_org' then
    drop policy if exists case_document_versions_select_actor on public.case_document_versions;
    execute format(
      'create policy case_document_versions_select_actor on public.case_document_versions
         for select to authenticated using (%s)', widened_doc);
    raise notice 'MUTANT versions_select_org: ANY member of the tenant now reads every version in it.';
  end if;

  if m = 'requests_select_org' then
    drop policy if exists case_document_requests_select_actor on public.case_document_requests;
    execute format(
      'create policy case_document_requests_select_actor on public.case_document_requests
         for select to authenticated using (%s)', widened_doc);
    raise notice 'MUTANT requests_select_org: ANY member of the tenant now reads every request in it.';
  end if;

  if m = 'reviews_select_org' then
    drop policy if exists case_document_reviews_select_actor on public.case_document_reviews;
    execute format(
      'create policy case_document_reviews_select_actor on public.case_document_reviews
         for select to authenticated using (%s)', widened_doc);
    raise notice 'MUTANT reviews_select_org: ANY member of the tenant now reads every review in it.';
  end if;

  -- --- the blunt calibration mutant ---------------------------------------------------------
  if m = 'versions_select_true' then
    drop policy if exists case_document_versions_select_actor on public.case_document_versions;
    create policy case_document_versions_select_actor on public.case_document_versions
      for select to authenticated using (true);
    raise notice 'MUTANT versions_select_true: EVERY authenticated actor reads EVERY version. Any '
      'version denial still green is a test that is not testing.';
  end if;

  -- --- the boundary the DOWNLOAD verb rests on ----------------------------------------------
  -- MEASURED, and it changed this mutant. The first attempt widened `cases_select_accessor` on the
  -- theory that the mint decides on what the actor can SEE in `cases`; it SURVIVED at 50/50. It
  -- widened nothing that matters, because `checkCasePermission` does not infer access from row
  -- visibility — `getCaseContext` gathers FACTS (membership role, `case_assignments`, student link)
  -- and `deriveAccessScope` grants a counsellor `case.read` at `assigned` scope only. Making the
  -- case row visible to an unassigned counsellor leaves them unassigned, so the mint still refuses.
  --
  -- That is a finding worth stating rather than papering over: THE MINT'S DENIAL IS ENFORCED IN
  -- TYPESCRIPT, not by an RLS policy. The falsifier therefore has to move the fact the TypeScript
  -- reads, which is the assignment itself.
  if m = 'cases_select_org' then
    drop policy if exists cases_select_accessor on public.cases;
    execute format(
      'create policy cases_select_accessor on public.cases
         for select to authenticated using (%s)', widened_cases);
    raise notice 'MUTANT cases_select_org: every tenant member now READS every case in it. Expected '
      'to leave the mint denials GREEN - it is retained as the negative control that proves the '
      'download boundary is a TypeScript scope decision and not a row-visibility one.';
  end if;

  -- The mutant that DOES reach it: assign every tenant counsellor to every case in their
  -- organization that carries a document version. That is "assigned" widened to "any counsellor in
  -- the tenant" - the same realistic bug shape as the `*_select_org` family, one layer up.
  --
  -- A TRIGGER rather than a one-shot INSERT, and that too is MEASURED. The first attempt inserted
  -- the assignment rows directly and SURVIVED at 50/50: a mutant is applied BEFORE the run, and the
  -- suite seeds its own organizations, users and cases in `beforeAll` AFTER that, so at mutation
  -- time there was no case for the INSERT to widen. Schema mutants persist across the seeding;
  -- DATA mutants do not, and must fire during it. This one hangs off the version insert, which is
  -- exactly when the fixture creates the row the gate is about.
  --
  -- It kills more than the mint tests, and that is correct rather than sloppy: an assigned
  -- counsellor legitimately holds the read too. What it isolates is the DIRECTION of the mint's
  -- answer - the refusal tracks the assignment fact, and is not a mint that refuses everyone.
  if m = 'assign_tenant_counsellors' then
    create or replace function private.mv191_mutant_autoassign() returns trigger
      language plpgsql security definer set search_path to '' as $fn$
    begin
      insert into public.case_assignments (id, case_id, user_id, assignment_role)
      select md5(new.case_id::text || m2.user_id::text || 'mv191')::uuid, new.case_id, m2.user_id,
             'primary_counsellor'
        from public.organization_memberships m2
        join public.cases c on c.id = new.case_id
       where m2.organization_id = c.organization_id
         and m2.role = 'counsellor'
         and m2.status = 'active'
      -- Untargeted: `case_assignments` is unique on (case_id, user_id) as well as on the primary
      -- key, and the fixture has ALREADY assigned the real counsellor to this case. An
      -- `on conflict (id)` here raised 23505 inside the fixture's own seeding and took the whole
      -- suite down as a harness defect - 49 skipped, which reads nothing like a surviving mutant.
      on conflict do nothing;
      return new;
    end $fn$;

    drop trigger if exists mv191_mutant_autoassign on public.case_document_versions;
    create trigger mv191_mutant_autoassign
      after insert on public.case_document_versions
      for each row execute function private.mv191_mutant_autoassign();
    raise notice 'MUTANT assign_tenant_counsellors: every tenant counsellor is ASSIGNED to any case '
      'the moment it receives a version.';
  end if;

  -- --- an ABSENCE, so the mutant is an ADDITION ----------------------------------------------
  -- MV-190 D4 declined a `storage.objects` policy for the `case/` prefix. The generous form below
  -- is what a later author reaches for first — and note it is a SELECT policy, which governs
  -- LISTING as well as downloading. That is the whole reason enumerate is a separate verb: the
  -- listing leaks `case/<case_id>/<version_id>` keys even where every object stays shut.
  if m = 'storage_case_list' then
    drop policy if exists mv191_mutant_case_prefix_list on storage.objects;
    create policy mv191_mutant_case_prefix_list on storage.objects
      for select to authenticated
      using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'case');
    raise notice 'MUTANT storage_case_list: any authenticated actor may LIST the case/ prefix.';
  end if;

  -- --- anon: also an absence, and a GRANT rather than a policy --------------------------------
  -- `anon` holds no grant at all on the three tables today, so its refusal is a 42501 raised by
  -- the grant surface before any policy is consulted. Both halves are planted here, because a
  -- grant without a policy would still deny and the mutant would prove nothing.
  if m = 'anon_read_grant' then
    grant select on public.case_document_requests, public.case_document_versions,
                    public.case_document_reviews to anon;
    drop policy if exists mv191_mutant_anon_read_v on public.case_document_versions;
    drop policy if exists mv191_mutant_anon_read_q on public.case_document_requests;
    drop policy if exists mv191_mutant_anon_read_r on public.case_document_reviews;
    create policy mv191_mutant_anon_read_v on public.case_document_versions for select to anon using (true);
    create policy mv191_mutant_anon_read_q on public.case_document_requests for select to anon using (true);
    create policy mv191_mutant_anon_read_r on public.case_document_reviews  for select to anon using (true);
    raise notice 'MUTANT anon_read_grant: the ANONYMOUS caller now reads all three tables.';
  end if;

  if m = 'anon_write_grant' then
    grant insert on public.case_document_requests, public.case_document_versions,
                    public.case_document_reviews to anon;
    drop policy if exists mv191_mutant_anon_write_v on public.case_document_versions;
    drop policy if exists mv191_mutant_anon_write_q on public.case_document_requests;
    drop policy if exists mv191_mutant_anon_write_r on public.case_document_reviews;
    create policy mv191_mutant_anon_write_v on public.case_document_versions for insert to anon with check (true);
    create policy mv191_mutant_anon_write_q on public.case_document_requests for insert to anon with check (true);
    create policy mv191_mutant_anon_write_r on public.case_document_reviews  for insert to anon with check (true);
    raise notice 'MUTANT anon_write_grant: the ANONYMOUS caller may now insert into all three tables.';
  end if;

  -- --- restore --------------------------------------------------------------------------------
  -- Self-contained by design: see the header. Every policy is re-created from the shipped text and
  -- every planted grant revoked, so the tree is back to the committed schema without re-running a
  -- migration whose `revoke all` opener would un-grant a column a LATER migration added.
  if m = 'restore' then
    drop policy if exists mv191_mutant_case_prefix_list on storage.objects;

    drop trigger if exists mv191_mutant_autoassign on public.case_document_versions;
    drop function if exists private.mv191_mutant_autoassign();

    -- Exactly the rows `assign_tenant_counsellors` planted, identified by the derived id, so a
    -- real assignment can never be caught by this delete.
    delete from public.case_assignments a
     where a.id = md5(a.case_id::text || a.user_id::text || 'mv191')::uuid;

    drop policy if exists mv191_mutant_anon_read_v on public.case_document_versions;
    drop policy if exists mv191_mutant_anon_read_q on public.case_document_requests;
    drop policy if exists mv191_mutant_anon_read_r on public.case_document_reviews;
    drop policy if exists mv191_mutant_anon_write_v on public.case_document_versions;
    drop policy if exists mv191_mutant_anon_write_q on public.case_document_requests;
    drop policy if exists mv191_mutant_anon_write_r on public.case_document_reviews;

    revoke select, insert on public.case_document_requests, public.case_document_versions,
                             public.case_document_reviews from anon;

    drop policy if exists case_document_versions_select_actor on public.case_document_versions;
    execute format(
      'create policy case_document_versions_select_actor on public.case_document_versions
         for select to authenticated using (%s)', shipped_doc);

    drop policy if exists case_document_requests_select_actor on public.case_document_requests;
    execute format(
      'create policy case_document_requests_select_actor on public.case_document_requests
         for select to authenticated using (%s)', shipped_doc);

    drop policy if exists case_document_reviews_select_actor on public.case_document_reviews;
    execute format(
      'create policy case_document_reviews_select_actor on public.case_document_reviews
         for select to authenticated using (%s)', shipped_doc);

    drop policy if exists cases_select_accessor on public.cases;
    execute format(
      'create policy cases_select_accessor on public.cases
         for select to authenticated using (%s)', shipped_cases);

    raise notice 'RESTORE: every widening reverted, every plant dropped, every anon grant revoked.';
  end if;
end $$;
