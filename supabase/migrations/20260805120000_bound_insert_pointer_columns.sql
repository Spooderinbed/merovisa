-- MV-161 — bound the PARENT-POINTER axis on the two INSERT surfaces that carry one.
--
-- Card:  docs/kanban/cards/MV-161-unbounded-insert-columns.md
-- Spec:  docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md §4 (AMENDED IN
--          THIS PR with the per-table client-writable COLUMN bounds this file establishes; §4.7 and
--          §4.9 gain the pointer clause, and §4 gains rule 5 — the column-axis enumeration).
-- Extends: 20260803180000_case_aware_student_data_rls.sql (MV-159), whose five INSERT `WITH CHECK`s
--          this file adds one conjunct to on two of the five. It does not re-create the other three
--          and changes nothing else about the five.
--
-- POLICY + ONE FUNCTION + ONE FUNCTION-GRANT. No table, column, index, constraint or grant is
-- created, altered or dropped; no data is written.
--
-- ============================== WHAT WAS MEASURED, AND WHY IT IS A P0 SHAPE ==============================
-- MV-159 bounds TWO axes on insert — which CASE a row may name, and which OWNER it may name. It
-- bounds nothing about the columns that POINT AT ANOTHER ROW. Measured on a local stack in today's
-- production shape (`supabase/rehearsal/MV-161-supersedes.sql`, mode `drop_composite_fks=no`):
--
--   Attacker A inserted a prediction in A's OWN case, on A's OWN assessment, owned by A — every
--   axis MV-159 bounds is satisfied — carrying `supersedes_prediction_id = <victim B's prediction>`.
--   ADMITTED. `MV161|P1|ADMITTED`.
--
-- THE COLUMN IS `ON DELETE SET NULL`, WHICH IS WHAT TURNS A PLANT INTO A PERMANENT LOCK. Deleting
-- B's prediction fires an UPDATE on A's row; `program_predictions_no_update ->
-- private.reject_prediction_update()` (20260620000000) is SECURITY INVOKER and unconditional, so it
-- raises `P0001` for every role — `service_role` included. Measured: `MV161|P5|DELETE-BLOCKED|
-- sqlstate=P0001`. The consequences all follow from that one refusal:
--
--   * `/api/account/delete` step 2 (`DELETE … WHERE owner = userId`) can never complete. B cannot
--     delete their account, ever.
--   * Deleting B's parent assessment, and B's `auth.users` row, are blocked the same way.
--   * B CANNOT SEE THE BLOCKING ROW. It lives in A's case, owned by A, so no policy shows it to B
--     and no client surface of B's can clear it. The victim cannot even diagnose it.
--
-- ONE REST CALL, from any signed-in user, against any user whose prediction id they can learn.
--
-- NOT A STAGE 2 REGRESSION, AND THAT IS THE UNCOMFORTABLE PART. Re-creating the legacy
-- `pp_insert_own` policy and re-running the same plant admits it identically: legacy required
-- `exists (select 1 from assessments a where a.id = assessment_id and a.owner = auth.uid())`, which
-- the attacker SATISFIES — they are inserting against their own assessment. The pointer was never
-- examined by any predicate this project has ever shipped. It is live on production today.
--
-- `outcome_events.supersedes_event_id` is plantable on identical terms and is HARMLESS today —
-- `outcome_events` carries no no-update trigger, so its `ON DELETE SET NULL` succeeds and nothing
-- locks. It is bounded here anyway, for the reason the card gives: it costs one conjunct now, and
-- being harmless is a property of a trigger that does not exist yet rather than of the predicate.
--
-- ============================== WHERE THE CONJUNCT GOES, AND WHY NOT INSIDE THE CASE ARM ==============================
-- The owner bound MV-159 added lives INSIDE the case arm, because the two arms say different things
-- about `owner`: the transitional arm pins it to the actor, the case arm pins it to the case's
-- student. THE POINTER BOUND IS NOT LIKE THAT. It is one sentence that must hold on every arm —
-- "a row may only supersede a row in its own case" — so it goes where MV-159 already puts exactly
-- this kind of clause: at TOP LEVEL, `AND`ed after the ownership group, alongside
-- `private.assessment_case_id(assessment_id) = case_id` and `source = 'self_reported'`.
--
-- THE TWO PLACEMENTS ARE PROVABLY EQUIVALENT TODAY, so this is a robustness choice and not a
-- behaviour change. Inside-the-arm and top-level differ only on a row where the transitional arm is
-- TRUE, which requires `case_id IS NULL`; on both these tables the parentage clause is then
-- `private.<parent>_case_id(x) = NULL` -> NULL, and a WITH CHECK admits only TRUE, so the row is
-- refused either way. THE POINT OF PREFERRING TOP LEVEL IS THAT THE EQUIVALENCE IS AN ARGUMENT
-- ABOUT A NEIGHBOURING CLAUSE. Inside the arm, this bound would hold only for as long as the
-- parentage clause keeps the transitional arm dead — which is precisely the "protected by an
-- accident with a scheduled removal date" shape MV-159's header records as the thing that keeps
-- biting this project. At top level it stands on its own, before and after MV-160 §D.
--
-- MV-160 §D IS UNAFFECTED. It deletes the ONE line marked `-- MV-160 §D: delete this line` from
-- each predicate and nothing else. Both policies below keep that line in the same position, in the
-- INSERT shape, with the new conjunct added outside the ownership group — so MV-160's edit stays a
-- one-line deletion per predicate.
--
-- ============================== ZERO REGRESSION, GREPPED RATHER THAN ASSERTED ==============================
-- `grep -rn 'supersedes' lib/ app/ components/ scripts/` returns FOUR files and NO writer:
-- `lib/supabase/types.ts` (generated column types + the two FK names), `lib/outcomes/state-machine.ts`
-- (a comment saying corrections append a row carrying `supersedes_event_id`),
-- `app/api/documents/upload/route.ts` (an unrelated comment about object bytes). No repository, no
-- route and no dual-write column list names either pointer: `caseWriteColumns` / `caseBindColumns` /
-- `caseUpsertColumns` (lib/cases/dual-write.ts) do not carry them. NOTHING LEGITIMATE WRITES THESE
-- COLUMNS — the correction path that will eventually use them is not built. Only an attacker
-- populates them today, which is why the fix is one conjunct and not a migration of live rows.
--
-- The in-case correction shape is nonetheless kept working and PROVEN working rather than assumed:
-- harness probes P3/P4 supersede a row in the actor's OWN case and must stay ADMITTED, so the bound
-- cannot be satisfied by refusing the pointer outright.
--
-- No `begin;`/`commit;`, and `lock_timeout` bounds the ACCESS EXCLUSIVE each `drop policy` /
-- `create policy` takes — both for MV-159's recorded reasons, which this file inherits rather than
-- restates.
set lock_timeout = '10s';

-- =====================================================================
-- 0  the BYPASSRLS precondition, asserted rather than assumed
-- =====================================================================
-- §1 adds a fifth `private` parent-case helper whose entire anti-recursion argument is that its
-- owner bypasses RLS. Applied by a role without it, `private.outcome_event_case_id()` would be
-- re-filtered by `oe_select_case` and would answer NULL for a row the actor cannot see — which
-- would not abort, it would SILENTLY REFUSE legitimate in-case corrections. Same assertion, same
-- wording and the same reason as MV-159 §0.
do $$
begin
  if not coalesce((select r.rolbypassrls from pg_catalog.pg_roles r where r.rolname = current_user), false) then
    raise exception
      'MV-161 requires the migration role (%) to hold BYPASSRLS: private.outcome_event_case_id() is '
      'SECURITY DEFINER and executes as its OWNER, and it is that owner''s BYPASSRLS that stops its '
      'read of public.outcome_events being re-filtered by that table''s own policy.', current_user;
  end if;
end;
$$;

-- =====================================================================
-- 1  private.outcome_event_case_id() — the fourth parent-case helper
-- =====================================================================
-- MV-159 §1a ships three parent-case helpers — assessment, prediction, attempt — because those are
-- the three CHILD relationships in the chain. `supersedes_event_id` is a SELF relationship, so it
-- needs a fourth that answers the same question about `outcome_events` itself.
-- `private.prediction_case_id()` already exists and already answers it for the prediction pointer,
-- which is why only one helper is added here rather than two.
--
-- Same shape as its three siblings and for the same recorded reasons: SECURITY DEFINER so the
-- parentage question is answered on the DATA rather than on the actor's current view of it; STABLE;
-- pinned empty `search_path`; and NULL — "no such row" — is the correct and SAFE answer, because
-- the policies below compare it with `=`, a comparison against NULL is NULL, and a WITH CHECK
-- refuses NULL exactly like FALSE. It cannot be used as an existence oracle: `private` is not a
-- PostgREST-exposed schema (supabase/config.toml `[api] schemas = ["public", "graphql_public"]`),
-- so there is no RPC route to call it directly.
create function private.outcome_event_case_id(p_event_id uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select e.case_id from public.outcome_events e where e.id = p_event_id;
$$;

-- A new function's EXECUTE defaults to PUBLIC, and `anon` is in PUBLIC and already holds USAGE on
-- `private` — so without the revoke, `has_function_privilege('anon', …, 'execute')` is TRUE the
-- moment the function is created. MV-152 shipped that latent grant on its first green and caught it
-- only with an assertion; MV-159 §12 inherited the fix and so does this file.
revoke all on function private.outcome_event_case_id(uuid) from public;
grant execute on function private.outcome_event_case_id(uuid) to authenticated;

-- =====================================================================
-- 2  program_predictions — spec §4.7. THE LIVE ONE.
-- =====================================================================
-- Byte-identical to MV-159 §9's `pp_insert_case` but for the final conjunct. The ownership group,
-- its two arms, the `-- MV-160 §D:` line and the parentage clause are unchanged and in the same
-- positions, so a reviewer diffing the two files sees exactly one added line.
--
-- `drop` + `create` rather than `create or replace policy`: MV-159 §2's idiom, and it keeps this
-- file re-runnable in the same way.
drop policy if exists pp_insert_case on public.program_predictions;

create policy pp_insert_case on public.program_predictions
  for insert to authenticated
  with check (
    (
      (owner = (select auth.uid()) and case_id is null)                         -- MV-160 §D: delete this line
      or (
        case_id is not null
        and case_id = any ((select private.actor_case_ids())::uuid[])
        and (owner is null or owner = private.case_student_id(case_id))
      )
    )
    and private.assessment_case_id(assessment_id) = case_id
    -- MV-161: THE PARENT-POINTER AXIS. `is null or …` and not a bare `=`, because the pointer is
    -- nullable and NULL is the shape every legitimate insert carries today — a bare equality would
    -- refuse every live write. When it IS set, the superseded row must live in the SAME case, which
    -- is the same sentence the parentage clause above makes about `assessment_id`.
    and (
      supersedes_prediction_id is null
      or private.prediction_case_id(supersedes_prediction_id) = case_id
    )
  );

-- =====================================================================
-- 3  outcome_events — spec §4.9. THE MIRROR, HARMLESS TODAY.
-- =====================================================================
-- Byte-identical to MV-159 §11's `oe_insert_case` but for the final conjunct, including the two
-- non-ownership integrity clauses `source = 'self_reported'` and `verified_by is null` — spec §4.9
-- requires both, and they are what stop a client self-certifying an `official_verified` outcome.
-- Dropping either while "adding the pointer bound" would be a trust regression wearing a fix's
-- clothes, so they are re-stated here verbatim.
drop policy if exists oe_insert_case on public.outcome_events;

create policy oe_insert_case on public.outcome_events
  for insert to authenticated
  with check (
    (
      (owner = (select auth.uid()) and case_id is null)                         -- MV-160 §D: delete this line
      or (
        case_id is not null
        and case_id = any ((select private.actor_case_ids())::uuid[])
        and (owner is null or owner = private.case_student_id(case_id))
      )
    )
    and private.attempt_case_id(attempt_id) = case_id
    and source = 'self_reported'
    and verified_by is null
    -- MV-161: the same bound, through the self-referential helper §1 adds.
    and (
      supersedes_event_id is null
      or private.outcome_event_case_id(supersedes_event_id) = case_id
    )
  );

-- =====================================================================
-- 4  the bound is asserted at APPLY time, the standard MV-159 §13 set
-- =====================================================================
-- MV-159 §13 (4) asserts the OWNER-axis clause survives every future re-creation, on the reasoning
-- that a clause only an attacker notices is exactly the clause a later migration "simplifies" out.
-- THE POINTER CLAUSE IS THE SAME KIND, ONLY MORE SO: nothing in `lib/` or `app/` writes either
-- column, so dropping this conjunct breaks NO test that exercises a legitimate path and NO live
-- write — the suite would stay green and production would keep working, with the account-delete
-- lock silently back. MV-160 §D re-creates both policies below. If it drops this clause, THIS
-- ASSERTION FAILS ITS APPLY rather than re-opening the hole quietly.
do $$
declare
  v_bad text;
begin
  -- (1) both INSERT predicates still bound the POINTER axis.
  select string_agg(p.polname, ', ' order by p.polname) into v_bad
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
   where p.polname in ('pp_insert_case', 'oe_insert_case')
     and (p.polwithcheck is null
          or pg_catalog.pg_get_expr(p.polwithcheck, c.oid) not like '%supersedes%');
  if v_bad is not null then
    raise exception 'MV-161: INSERT policy % no longer bounds the parent-pointer axis — a client may '
      'point a row in its OWN case at ANOTHER USER''S row, and on program_predictions the '
      'ON DELETE SET NULL then makes the victim''s /api/account/delete raise P0001 forever, on a '
      'row the victim cannot see', v_bad;
  end if;

  -- (2) MV-159 §13 (4)'s owner-axis assertion, re-run over the two policies this file RE-CREATES.
  --     §13 (4) ran at MV-159's apply and cannot see what this file did afterwards; a re-creation
  --     here that dropped `case_student_id` would sail past it. Same sentence, checked again at the
  --     moment the two predicates change.
  select string_agg(p.polname, ', ' order by p.polname) into v_bad
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
   where p.polname in ('pp_insert_case', 'oe_insert_case')
     and pg_catalog.pg_get_expr(p.polwithcheck, c.oid) not like '%case_student_id%';
  if v_bad is not null then
    raise exception 'MV-161: re-creating % dropped MV-159''s OWNER-axis bound — this file may only '
      'ADD a conjunct, never remove one', v_bad;
  end if;

  -- (3) `outcome_events`' two non-ownership integrity clauses survived the re-creation (spec §4.9).
  --     They are the difference between "the student says they were granted a visa" and "the record
  --     says a decision authority did", and this file re-types the whole predicate to add one line.
  if (select pg_catalog.pg_get_expr(p.polwithcheck, c.oid)
        from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid = p.polrelid
       where p.polname = 'oe_insert_case') not like '%self_reported%' then
    raise exception 'MV-161: oe_insert_case lost `source = ''self_reported''` — a client could '
      'self-certify an official_verified outcome of record';
  end if;

  -- (4) the fourth parent-case helper is hardened like its three MV-159 siblings. A SECURITY
  --     INVOKER version would be re-filtered by `oe_select_case` and would silently refuse
  --     legitimate in-case corrections; a PUBLIC EXECUTE would hand `anon` the same oracle MV-152
  --     shipped by accident.
  --
  --     COMPARED AGAINST A SIBLING RATHER THAN AGAINST LITERALS, and that is a lesson this
  --     assertion taught at its own first apply: written as `proconfig @> array['search_path=']` it
  --     raised against a function that was correctly pinned, because Postgres renders the empty
  --     setting as `search_path=""`. A literal encodes a catalogue rendering; `private.prediction_
  --     case_id` IS the property, it is the helper this one is modelled on, and it is re-created by
  --     nothing here — so drift can only mean this file's helper drifted.
  if not exists (
    select 1
      from pg_catalog.pg_proc pr
      join pg_catalog.pg_namespace n on n.oid = pr.pronamespace
      join pg_catalog.pg_proc sib on sib.pronamespace = n.oid and sib.proname = 'prediction_case_id'
     where n.nspname = 'private'
       and pr.proname = 'outcome_event_case_id'
       and (pr.prosecdef, pr.provolatile, pr.proconfig)
           is not distinct from (sib.prosecdef, sib.provolatile, sib.proconfig)
  ) then
    raise exception 'MV-161: private.outcome_event_case_id() must be hardened exactly as its MV-159 '
      'sibling private.prediction_case_id() is — SECURITY DEFINER, STABLE, empty search_path';
  end if;

  if has_function_privilege('anon', 'private.outcome_event_case_id(uuid)', 'execute') then
    raise exception 'MV-161: anon holds EXECUTE on private.outcome_event_case_id() — the revoke '
      'before the grant is what keeps a new function out of PUBLIC';
  end if;
end;
$$;

-- =====================================================================
-- Deliberate omissions (recorded so a reviewer sees refusal, not oversight)
-- =====================================================================
--   * THE OTHER THREE INSERT POLICIES ARE NOT RE-CREATED. `ups_insert_case`, `ds_insert_case` and
--     `aa_insert_case` carry no pointer column: `user_program_state` and `document_status` have no
--     self-reference at all, and `application_attempts.prediction_id` is a PARENT pointer that
--     MV-159 §10 already bounds with `private.prediction_case_id(prediction_id) = case_id`. Adding
--     a clause to a policy that needs none would be three more predicates for MV-160 §D to
--     re-create correctly, for nothing.
--   * NO CHANGE TO `private.reject_prediction_update()`. Weakening it — exempting `service_role`,
--     or letting the `ON DELETE SET NULL` through — is the OTHER way to unblock the victim's
--     account deletion and it is refused: the immutability guarantee is load-bearing for the
--     outcome ledger, and an attacker-plantable pointer that quietly rewrites a row of record is a
--     worse bug than the one it would fix. Bound the pointer; keep the trigger unconditional.
--     MV-160 §(i) restores its original body and this file leaves that untouched.
--   * NO CLEANUP OF EXISTING PLANTED ROWS. Production residue is a question for the founder with a
--     query, not for a migration with a `DELETE`: the shape is indistinguishable from a legitimate
--     future correction, and this card's remit is to stop new ones. The detection query is
--     `select id, owner, case_id, supersedes_prediction_id from public.program_predictions p
--      where p.supersedes_prediction_id is not null
--        and private.prediction_case_id(p.supersedes_prediction_id) is distinct from p.case_id;`
--     — it returns zero rows on a clean database, which is itself the useful measurement.
--   * NO COLUMN GRANT IS NARROWED. Revoking INSERT(`supersedes_prediction_id`) from `authenticated`
--     would also close this, in one line, with no helper — and it is refused because it closes the
--     CORRECTION PATH the column exists for (spec §4.9: "a correction is a NEW row plus
--     `supersedes_event_id`"). A grant change is also a separate reviewed decision under spec §7.
--     The predicate permits the legitimate in-case shape and refuses the cross-case one; a revoke
--     cannot tell them apart.
--
-- Release the bound set at the head of the file so it cannot leak into a later migration applied on
-- the same connection. Last line, so it never runs on a failed apply.
reset lock_timeout;
