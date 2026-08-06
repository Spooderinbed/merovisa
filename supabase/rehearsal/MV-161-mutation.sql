-- MV-161 — the MUTATION harness: revert one conjunct, prove the probe goes red with ADMITTED.
--
-- Card: docs/kanban/cards/MV-161-unbounded-insert-columns.md, acceptance criterion
--       "reverting the conjunct turns the probe red with **admitted**, not merely uncaught".
--
-- WHY THE DISTINCTION IS THE WHOLE POINT. `rls-negative-probes-are-inert` is a standing lesson on
-- this project: a denial-only suite passes IDENTICALLY against a missing policy, so "the probe went
-- red" is not evidence unless you read HOW it went red. A probe that errors, skips, or fails on a
-- seed step proves nothing about the clause. The verdict this file demands is the specific one —
-- `MV161|P1|ADMITTED` — which can only be printed by an insert the database actually accepted.
--
-- LOCAL ONLY, and this one MUTATES COMMITTED STATE: it re-creates a live policy without its bound.
-- Between the mutation and the restore, the local database is deliberately vulnerable. Restoring is
-- a step, not a `rollback`, because the policy swap has to be visible to the harness's own
-- transaction. Never point this at the hosted project.
--
-- Usage — three calls, in this order, per mutant:
--   PSQL="docker exec -i supabase_db_merovisa psql -U postgres -d postgres -v ON_ERROR_STOP=1"
--   $PSQL -v mutant=pp < supabase/rehearsal/MV-161-mutation.sql     # revert ONE conjunct
--   $PSQL -v drop_composite_fks=no < supabase/rehearsal/MV-161-supersedes.sql   # observe
--   $PSQL < supabase/migrations/20260805120000_bound_insert_pointer_columns.sql # restore
--
-- `mutant` is `pp` (drop the bound from program_predictions), `oe` (from outcome_events), or
-- `both`. Everything else about each predicate is re-stated byte-for-byte from the migration, so
-- the mutant differs from the shipped policy in exactly one conjunct and a red probe cannot be
-- blamed on anything else.

\set ON_ERROR_STOP on
\if :{?mutant}
\else
  \set mutant both
\endif

select set_config('mv161.mutant', :'mutant', false);

do $$
declare
  v_mutant text := current_setting('mv161.mutant', true);
begin
  if v_mutant in ('pp', 'both') then
    drop policy if exists pp_insert_case on public.program_predictions;
    create policy pp_insert_case on public.program_predictions
      for insert to authenticated
      with check (
        (
          (owner = (select auth.uid()) and case_id is null)
          or (
            case_id is not null
            and case_id = any ((select private.actor_case_ids())::uuid[])
            and (owner is null or owner = private.case_student_id(case_id))
          )
        )
        and private.assessment_case_id(assessment_id) = case_id
        -- MUTANT: the `supersedes_prediction_id` conjunct is REMOVED here and nowhere else.
      );
    raise notice 'MV161|mutation|pp_insert_case reverted to its pre-MV-161 form';
  end if;

  if v_mutant in ('oe', 'both') then
    drop policy if exists oe_insert_case on public.outcome_events;
    create policy oe_insert_case on public.outcome_events
      for insert to authenticated
      with check (
        (
          (owner = (select auth.uid()) and case_id is null)
          or (
            case_id is not null
            and case_id = any ((select private.actor_case_ids())::uuid[])
            and (owner is null or owner = private.case_student_id(case_id))
          )
        )
        and private.attempt_case_id(attempt_id) = case_id
        and source = 'self_reported'
        and verified_by is null
        -- MUTANT: the `supersedes_event_id` conjunct is REMOVED here and nowhere else.
      );
    raise notice 'MV161|mutation|oe_insert_case reverted to its pre-MV-161 form';
  end if;
end;
$$;
