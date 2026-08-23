-- MV-193 — the Stage 5 slice 1 mutation harness: widen ONE boundary, prove a NAMED test goes red.
--
-- Card: docs/kanban/cards/MV-193-stage5-invitation-mint.md, Test plan — "Mutation-test every
--       policy this slice relies on. A denial-only suite passes IDENTICALLY against a missing
--       policy … Mutants must WIDEN — a drop-mutant leaves every denial green. Read the failing
--       test NAMES, not the counts."
-- Suite under test: tests/integration/stage5-invitations.itest.ts
-- Format copied from: supabase/rehearsal/MV-191-mutation.sql (the worked example).
--
-- ---------------------------------------------------------------------------------------------
-- WHY EVERY MUTANT HERE WIDENS
-- ---------------------------------------------------------------------------------------------
-- This suite is dominated by NEGATIVE claims — "this actor cannot mint", "cannot revoke",
-- "learns nothing". Dropping a policy makes the table deny MORE, so every one of those stays
-- GREEN against a drop, passing for the wrong reason. **A denial dies to PERMISSIVENESS.** So
-- each mutant below widens exactly one boundary and names the assertions that must go red.
--
-- Three shapes:
--
--   * `*_case_org` — the REALISTIC bug. The shipped student branch admits an actor who
--     `private.can_staff_case(case_id)` — an org ADMIN, or a counsellor ASSIGNED to the case.
--     The mutant also admits any MEMBER of the case's organization. This is what a later author
--     reaches for when a counsellor complains they cannot see a colleague's case, and it is
--     invisible to a suite that only probes org B and outsiders — `counsellorUnassignedA` is the
--     actor it breaks, and the only one.
--   * `insert_true` — the BLUNT bug, for calibration. `with check (true)` admits every
--     authenticated actor, so a mutant that leaves ANY authenticated insert denial green has
--     found a test that is not testing.
--   * the GRANT mutants — `accepted_at_grant`, `delete_grant`, `anon_grants`. Those three
--     boundaries are enforced by an ABSENCE (no column in the grant, no verb, no privilege at
--     all), and for an absence the mutant is an ADDITION. Where a grant alone would still be
--     denied by policy, the mutant plants the policy too — otherwise it proves nothing.
--
-- The narrow and blunt mutants are kept apart deliberately. A single blunt mutant would kill
-- every denial at once and prove only that the suite notices catastrophe; the narrow ones are
-- what prove the boundary is drawn at the CASE and not merely at the tenant.
--
-- ON THE HELPERS, AND A TRAP MV-191 MEASURED. Each widening is INLINED into the invitations
-- policy rather than applied to `private.can_staff_case` itself: that helper backs policies on
-- many tables, so mutating it would kill a superset of tests and no single red name could be
-- attributed to the sentence under test. And the widening reads `private.case_org_id(case_id)`
-- and `private.actor_org_ids()` — both SECURITY DEFINER — rather than a subquery over
-- `public.cases`. MV-191 measured that a subquery inside a policy is ITSELF subject to RLS, so
-- `cases_select_accessor` hides the very row the mutant exists to admit and the widening widens
-- nothing. A mutant that kills nothing is a finding; that one would have been a finding about
-- the mutant.
--
-- LOCAL ONLY, AND IT MUTATES COMMITTED STATE. Between the mutation and the restore the local
-- database is deliberately vulnerable — it hands one actor, or every actor, a write they must
-- not have. NEVER point this at the hosted project.
--
-- Usage — three calls per mutant, in this order:
--   $DB = "supabase_db_merovisa"
--   docker exec -i $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v mutant=insert_case_org -f - < supabase/rehearsal/MV-193-mutation.sql
--   npx vitest run --config vitest.integration.config.ts tests/integration/stage5-invitations.itest.ts
--   docker exec -i $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v mutant=restore -f - < supabase/rehearsal/MV-193-mutation.sql
--
-- `restore` is SELF-CONTAINED, as MV-191's is: it re-creates every policy it touched
-- byte-for-byte from the shipped text and revokes every grant it planted, so no migration
-- re-run is required. That matters — 20260730180000 opens with `revoke all … from authenticated`
-- and re-grants only its own set, so leaning on a migration to restore can silently un-grant a
-- column a LATER migration added (MISTAKES.md, Supabase/Postgres).
--
-- ---------------------------------------------------------------------------------------------
-- MEASURED RESULTS — 2026-08-23, against tests/integration/stage5-invitations.itest.ts
-- Clean schema: 52 passed / 52. Every mutant applied ALONE, run, then restored.
-- ---------------------------------------------------------------------------------------------
-- mutant                  widens                              the tests that went RED
-- ---------------------------------------------------------------------------------------------
-- insert_case_org         invitations_insert_staff student    "REFUSES the UNASSIGNED
--                         branch: can_staff_case -> ALSO       counsellor's direct insert —
--                         any member of the case's org         can_staff_case, not row
--                                                              visibility"
--                         (org B, the outsider and the STUDENT stay refused — none of them is a
--                          member of org A, which is what makes this a measurement of the CASE
--                          bound rather than of the tenant bound.)
--
-- insert_true             invitations_insert_staff ->         "REFUSES the UNASSIGNED
--                         with check (true)                    counsellor's direct insert …"
--                                                             "REFUSES a counsellor from ANOTHER
--                                                              organization"
--                                                             "REFUSES an outsider with no
--                                                              membership anywhere"
--                                                             "REFUSES the LINKED STUDENT — who
--                                                              CAN see this case, so the policy
--                                                              is the only layer"
--                                                             "REFUSES a TEAM invitation minted
--                                                              by a counsellor — a different
--                                                              authority entirely"
--                                                             "cannot be stamped with ANOTHER
--                                                              tenant's organization — the
--                                                              policy's org tie holds"
--
-- insert_untied           drops ONLY the org tie              "cannot be stamped with ANOTHER
--                         `NOT (organization_id IS DISTINCT    tenant's organization — the
--                         FROM private.case_org_id(case_id))`  policy's org tie holds"
--
-- select_case_org         invitations_select_staff student    "an UNASSIGNED counsellor of the
--                         branch, same widening                same tenant learns NOTHING, with
--                                                              a row there to learn"
--
-- update_case_org         invitations_update_staff student    NOTHING — A SURVIVOR, and that is
--                         branch, same widening (USING and     the finding. See "the revoke verb
--                         WITH CHECK both)                     takes TWO mutants" below.
--
-- select_update_case_org  BOTH the select and the update      "REFUSES an unassigned counsellor
--                         student branches, together           of the same tenant, and the row
--                                                              stays live"
--                                                             "the UNASSIGNED counsellor's
--                                                              direct revoke does not land"
--                                                             "nobody can UN-revoke by writing
--                                                              revoked_at back to null"
--                                                             "an UNASSIGNED counsellor … learns
--                                                              NOTHING, with a row there to
--                                                              learn"
--
-- accepted_at_grant       GRANTS update (accepted_at) to      "`accepted_at` is NOT writable by
--                         authenticated (an ABSENCE, so the    an authenticated client —
--                         mutant ADDS)                         acceptance stays server-only"
--                         THE MOST IMPORTANT MUTANT IN THIS FILE. That grant's absence is what
--                         keeps slice 2's acceptance a server-side compare-and-swap; a client
--                         that could write accepted_at could accept an invitation it merely
--                         knows the id of.
--
-- delete_grant            GRANTS delete + plants a            "cannot DELETE an invitation, even
--                         permissive DELETE policy             as the counsellor who minted it"
--
-- anon_grants             GRANTS anon select/insert/update    "REFUSES an ANONYMOUS caller — anon
--                         + permissive anon policies           holds no grant on invitations at
--                                                              all"
--                                                             "REFUSES an anonymous caller — anon
--                                                              holds no UPDATE grant either"
--                                                             "an ANONYMOUS caller reads nothing
--                                                              from invitations, with a row there
--                                                              to be read"
--
-- restore                 undoes every widening and every     -  (self-contained; verified
--                         plant                                  byte-identical against
--                                                                pg_policies, and the grant set
--                                                                back to exactly
--                                                                select/insert + update
--                                                                (revoked_at), anon nothing)
-- ---------------------------------------------------------------------------------------------
--
-- ---------------------------------------------------------------------------------------------
-- THE REVOKE VERB TAKES TWO MUTANTS — and it is the most useful result in this file
-- ---------------------------------------------------------------------------------------------
-- `update_case_org` widens `invitations_update_staff` to admit every member of the tenant, and it
-- kills NOTHING. Measured twice: once through the repository, and again through a direct
-- `.update()` with no `.select()` in front of it. Both green.
--
-- The reason is a Postgres rule that is easy to forget: **an UPDATE carrying a WHERE clause has to
-- SELECT the existing rows first, and SELECT policies apply to that read.** So an actor
-- `invitations_select_staff` hides the row from updates nothing at all, whatever the UPDATE policy
-- says. `select_update_case_org` widens both and kills four named tests.
--
-- So the revoke boundary is defended INDEPENDENTLY IN TWO LAYERS, and neither is load-bearing
-- alone. Recording it matters because a future author who removes one will see a fully green
-- suite and conclude the layer was redundant. It is not — it is the second half of a
-- belt-and-braces the other half of which is one refactor away from being the only one left.
--
-- THE SAME SHAPE, ONE VERB OVER, ON THE MINT. `createStudentInvitation` reads the case before it
-- writes, on the actor's own RLS client, and `cases_select_accessor` admits only the student, an
-- org ADMIN, or an ASSIGNED counsellor. So for an unassigned counsellor the repository returns
-- `unknown-case` and `invitations_insert_staff` is never consulted — and the FIRST run of
-- `insert_case_org`, against a suite that probed only through the repository, survived at 39/39.
-- The direct-insert block in the itest is what was added to isolate the policy, and it is why
-- `insert_case_org` now kills a named test. The repository-level test pins the REASON
-- (`unknown-case`) so the layering stays visible rather than hiding behind a bare `ok === false`.
--
-- ---------------------------------------------------------------------------------------------
-- AND THE RESULT WORTH READING TWICE
-- ---------------------------------------------------------------------------------------------
-- `insert_true` — the bluntest possible widening, admitting EVERY authenticated actor — leaves
-- the ANONYMOUS insert denial green. That is not a test failing to bite. `anon` holds no
-- privilege on `public.invitations` at all, so its refusal is a `42501` raised by the GRANT
-- surface before any policy is consulted, and no policy mutant can reach it. The anon boundary
-- and the staff boundary are DIFFERENT GUARANTEES, and `anon_grants` is the mutant that measures
-- the first one. Recorded plainly because a reader who saw only `insert_true`'s result might
-- conclude the anon tests were inert.

\set ON_ERROR_STOP on
\if :{?mutant}
\else
  \echo 'MV-193 mutation harness: pass -v mutant=<name>. See the table in this file for the names.'
  \quit
\endif

select set_config('mv193.mutant', :'mutant', false);

do $$
declare
  m text := current_setting('mv193.mutant', true);

  -- ---- the SHIPPED predicates, restated BYTE-FOR-BYTE from pg_policies -------------------
  -- So a mutant differs from the real schema in exactly the named clause, and a red test
  -- cannot be blamed on anything else.
  shipped_insert text :=
    '(((case_id IS NULL) AND (organization_id = ANY (( SELECT private.actor_admin_org_ids() AS actor_admin_org_ids)::uuid[]))'
    ' AND (role <> ''student''::text) AND ((role <> ''owner''::text) OR (organization_id = ANY (( SELECT private.actor_owner_org_ids() AS actor_owner_org_ids)::uuid[]))))'
    ' OR ((case_id IS NOT NULL) AND (role = ''student''::text) AND private.can_staff_case(case_id)'
    ' AND (NOT (organization_id IS DISTINCT FROM private.case_org_id(case_id)))))';

  shipped_select text :=
    '((organization_id = ANY (( SELECT private.actor_admin_org_ids() AS actor_admin_org_ids)::uuid[]))'
    ' OR ((case_id IS NOT NULL) AND (role = ''student''::text) AND private.can_staff_case(case_id)))';

  shipped_update text :=
    '(((organization_id = ANY (( SELECT private.actor_admin_org_ids() AS actor_admin_org_ids)::uuid[]))'
    ' AND ((role <> ''owner''::text) OR (organization_id = ANY (( SELECT private.actor_owner_org_ids() AS actor_owner_org_ids)::uuid[]))))'
    ' OR ((case_id IS NOT NULL) AND (role = ''student''::text) AND private.can_staff_case(case_id)))';

  -- ---- the WIDENINGS ---------------------------------------------------------------------
  -- `can_staff_case(case_id)` becomes "…or any member of the case's organization". Both
  -- helpers are SECURITY DEFINER, so the predicate answers regardless of what the actor can
  -- SEE in `public.cases` — see the note on MV-191's inert subquery above.
  widened_staff text :=
    '(private.can_staff_case(case_id) OR (private.case_org_id(case_id) = ANY (private.actor_org_ids())))';

  known text[] := array['insert_case_org','insert_true','insert_untied','select_case_org',
                        'update_case_org','select_update_case_org','accepted_at_grant',
                        'delete_grant','anon_grants','restore'];
begin
  if m is null or not (m = any (known)) then
    raise exception 'MV-193 mutation: unknown mutant %. Known: %', coalesce(m, '<none>'), array_to_string(known, ', ');
  end if;

  -- ---- INSERT: the mint ------------------------------------------------------------------
  if m = 'insert_case_org' then
    drop policy if exists invitations_insert_staff on public.invitations;
    execute format(
      'create policy invitations_insert_staff on public.invitations
         for insert to authenticated with check (%s)',
      replace(shipped_insert, 'private.can_staff_case(case_id)', widened_staff));
    raise notice 'MUTANT insert_case_org: ANY member of the tenant may now mint a student '
      'invitation for any case in it.';
  end if;

  if m = 'insert_true' then
    drop policy if exists invitations_insert_staff on public.invitations;
    create policy invitations_insert_staff on public.invitations
      for insert to authenticated with check (true);
    raise notice 'MUTANT insert_true: EVERY authenticated actor may mint ANY invitation. Any '
      'AUTHENTICATED insert denial still green is a test that is not testing. The ANONYMOUS one '
      'stays green legitimately - anon is refused by the grant, not by this policy.';
  end if;

  if m = 'insert_untied' then
    drop policy if exists invitations_insert_staff on public.invitations;
    execute format(
      'create policy invitations_insert_staff on public.invitations
         for insert to authenticated with check (%s)',
      replace(shipped_insert,
              ' AND (NOT (organization_id IS DISTINCT FROM private.case_org_id(case_id)))', ''));
    raise notice 'MUTANT insert_untied: a student invitation may now be stamped with ANOTHER '
      'tenant''s organization id - which invitations_select_staff''s first branch then shows to '
      'that tenant''s admins, handing them the email of a student who is not theirs.';
  end if;

  -- ---- SELECT: the list ------------------------------------------------------------------
  if m = 'select_case_org' then
    drop policy if exists invitations_select_staff on public.invitations;
    execute format(
      'create policy invitations_select_staff on public.invitations
         for select to authenticated using (%s)',
      replace(shipped_select, 'private.can_staff_case(case_id)', widened_staff));
    raise notice 'MUTANT select_case_org: ANY member of the tenant now reads every student '
      'invitation in it, student email included.';
  end if;

  -- ---- UPDATE: the revoke ----------------------------------------------------------------
  if m = 'update_case_org' then
    drop policy if exists invitations_update_staff on public.invitations;
    execute format(
      'create policy invitations_update_staff on public.invitations
         for update to authenticated using (%s) with check (%s)',
      replace(shipped_update, 'private.can_staff_case(case_id)', widened_staff),
      replace(shipped_update, 'private.can_staff_case(case_id)', widened_staff));
    raise notice 'MUTANT update_case_org: ANY member of the tenant may now revoke any student '
      'invitation in it. EXPECTED TO SURVIVE ON ITS OWN - see select_update_case_org.';
  end if;

  -- THE COMPOUND MUTANT, and it is the most instructive one in this file.
  --
  -- `update_case_org` alone is INERT. An UPDATE carrying a WHERE clause has to SELECT the
  -- existing rows first, and Postgres applies SELECT policies to that read - so an actor
  -- `invitations_select_staff` hides the row from updates nothing, whatever the UPDATE policy
  -- says. The revoke boundary is therefore defended in TWO layers, and neither is load-bearing
  -- alone. Widening both is what moves it.
  if m = 'select_update_case_org' then
    drop policy if exists invitations_select_staff on public.invitations;
    execute format(
      'create policy invitations_select_staff on public.invitations
         for select to authenticated using (%s)',
      replace(shipped_select, 'private.can_staff_case(case_id)', widened_staff));

    drop policy if exists invitations_update_staff on public.invitations;
    execute format(
      'create policy invitations_update_staff on public.invitations
         for update to authenticated using (%s) with check (%s)',
      replace(shipped_update, 'private.can_staff_case(case_id)', widened_staff),
      replace(shipped_update, 'private.can_staff_case(case_id)', widened_staff));
    raise notice 'MUTANT select_update_case_org: BOTH layers widened - any tenant member now '
      'sees AND revokes any student invitation in the tenant.';
  end if;

  -- ---- the GRANT boundaries: an ABSENCE, so the mutant ADDS -------------------------------
  -- `accepted_at` is outside `grant update (revoked_at)`, which is what keeps acceptance a
  -- server-side compare-and-swap for slice 2. No policy is planted: the shipped
  -- invitations_update_staff already admits the assigned counsellor, so the column grant is
  -- the ONLY thing refusing, and granting it alone is the precise widening.
  if m = 'accepted_at_grant' then
    grant update (accepted_at) on public.invitations to authenticated;
    raise notice 'MUTANT accepted_at_grant: a client may now write accepted_at, i.e. accept an '
      'invitation it merely knows the id of. THE MOST IMPORTANT MUTANT IN THIS FILE.';
  end if;

  -- No DELETE grant AND no DELETE policy today, so both halves are planted - a grant without a
  -- policy would still deny and the mutant would prove nothing.
  if m = 'delete_grant' then
    grant delete on public.invitations to authenticated;
    drop policy if exists mv193_mutant_delete on public.invitations;
    create policy mv193_mutant_delete on public.invitations
      for delete to authenticated
      using (case_id is not null and role = 'student' and private.can_staff_case(case_id));
    raise notice 'MUTANT delete_grant: an invitation may now be DELETED rather than revoked - '
      'erasing the record of who was invited, which is the thing revocation exists to keep.';
  end if;

  if m = 'anon_grants' then
    grant select, insert on public.invitations to anon;
    grant update (revoked_at) on public.invitations to anon;
    drop policy if exists mv193_mutant_anon_read on public.invitations;
    drop policy if exists mv193_mutant_anon_write on public.invitations;
    drop policy if exists mv193_mutant_anon_update on public.invitations;
    create policy mv193_mutant_anon_read   on public.invitations for select to anon using (true);
    create policy mv193_mutant_anon_write  on public.invitations for insert to anon with check (true);
    create policy mv193_mutant_anon_update on public.invitations for update to anon using (true) with check (true);
    raise notice 'MUTANT anon_grants: the ANONYMOUS caller now reads, mints and revokes '
      'invitations. This is the ONLY mutant that reaches the anon boundary - the policy mutants '
      'above cannot, because anon is refused by the GRANT before any policy is consulted.';
  end if;

  -- ---- restore ---------------------------------------------------------------------------
  if m = 'restore' then
    drop policy if exists mv193_mutant_delete on public.invitations;
    drop policy if exists mv193_mutant_anon_read on public.invitations;
    drop policy if exists mv193_mutant_anon_write on public.invitations;
    drop policy if exists mv193_mutant_anon_update on public.invitations;

    revoke all on public.invitations from anon;
    -- Column grants are not covered by `revoke all` on some versions; named explicitly so the
    -- restore cannot leave the single most load-bearing grant widened.
    revoke update (accepted_at) on public.invitations from authenticated;
    revoke delete on public.invitations from authenticated;

    drop policy if exists invitations_insert_staff on public.invitations;
    execute format(
      'create policy invitations_insert_staff on public.invitations
         for insert to authenticated with check (%s)', shipped_insert);

    drop policy if exists invitations_select_staff on public.invitations;
    execute format(
      'create policy invitations_select_staff on public.invitations
         for select to authenticated using (%s)', shipped_select);

    drop policy if exists invitations_update_staff on public.invitations;
    execute format(
      'create policy invitations_update_staff on public.invitations
         for update to authenticated using (%s) with check (%s)', shipped_update, shipped_update);

    raise notice 'RESTORE: every widening reverted, every plant dropped, every grant revoked.';
  end if;
end $$;
