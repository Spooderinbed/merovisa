-- MV-161 — the pointer-axis plant, measured end to end on a LOCAL stack.
--
-- Card: docs/kanban/cards/MV-161-unbounded-insert-columns.md
--
-- WHAT THIS MEASURES, and why it is a harness rather than only an itest. The itest
-- (`tests/integration/student-data-rls.itest.ts`) is the CI guard; this file is the instrument that
-- produced the RED, the mutation table and the FK simulation on the card's Done evidence. It runs
-- the same four probes under three different databases-of-the-moment — before the fix, after the
-- fix, and with the composite FKs dropped — which a vitest suite cannot do without shipping DDL it
-- would then have to un-ship.
--
-- LOCAL ONLY. It writes `auth.users` directly and (in FK-simulation mode) drops constraints. Every
-- statement runs inside ONE transaction that ends in `rollback`, so the database is byte-identical
-- afterwards — but a `rollback` is not an authorization, and this must never be pointed at the
-- hosted project.
--
-- Usage:
--   PSQL="docker exec -i supabase_db_merovisa psql -U postgres -d postgres -v ON_ERROR_STOP=1"
--   $PSQL -v drop_composite_fks=no  < supabase/rehearsal/MV-161-supersedes.sql
--   $PSQL -v drop_composite_fks=yes < supabase/rehearsal/MV-161-supersedes.sql
--
-- THE FOUR PROBES. Two attacks and two controls, because a bound that also refuses the legitimate
-- correction shape is a regression wearing a fix's clothes:
--
--   P1 ATTACK   A inserts a prediction in A's OWN case, on A's OWN assessment, owned by A --
--               every axis MV-159 bounds is satisfied -- with `supersedes_prediction_id` = B's
--               prediction. Must be REFUSED 42501.
--   P2 ATTACK   the same shape on `outcome_events.supersedes_event_id`. Must be REFUSED 42501.
--   P3 CONTROL  A supersedes A's OWN prediction, in A's own case. Must stay ADMITTED.
--   P4 CONTROL  A supersedes A's OWN outcome event. Must stay ADMITTED.
--
-- P5 is the consequence rather than a probe: with a plant in place, deleting the victim's
-- prediction fires the `ON DELETE SET NULL` as an UPDATE on the ATTACKER'S row, and
-- `program_predictions_no_update` refuses it unconditionally -- so the victim's
-- `/api/account/delete` step 2 can never complete. It is measured both ways.
--
-- Every line the harness prints is prefixed `MV161|` so a caller can grep the verdicts out.

\set ON_ERROR_STOP on
\if :{?drop_composite_fks}
\else
  \set drop_composite_fks no
\endif

begin;

-- psql does NOT interpolate `:vars` inside a dollar-quoted body, so the mode is handed to the
-- blocks below through a transaction-local GUC rather than through the lexer.
select set_config('mv161.drop_composite_fks', :'drop_composite_fks', true);

-- ---------------------------------------------------------------------------------------------
-- 0  optional: the MV-160 FK SIMULATION.
--
-- The card asks whether the refusal is the POLICY's or an FK's. `supersedes_prediction_id` carries
-- only a simple self-FK, so no composite ever constrained it -- but the three-table chain below it
-- was protected by the two legacy composite owner FKs, and MV-160 §(f) drops both. Dropping all
-- FOUR composites (the two owner ones MV-160 removes AND MV-156's two case ones, which it keeps) is
-- deliberately STRONGER than MV-160: a refusal that survives this survives MV-160 a fortiori.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if current_setting('mv161.drop_composite_fks', true) = 'yes' then
    alter table public.application_attempts drop constraint application_attempts_prediction_id_owner_fkey;
    alter table public.outcome_events       drop constraint outcome_events_attempt_id_owner_fkey;
    alter table public.application_attempts drop constraint application_attempts_prediction_id_case_id_fkey;
    alter table public.outcome_events       drop constraint outcome_events_attempt_id_case_id_fkey;
    raise notice 'MV161|mode|FK-SIMULATION: all four composite FKs dropped';
  else
    raise notice 'MV161|mode|BASELINE: composite FKs intact';
  end if;
end;
$$;

do $$
declare
  v_a          uuid := '00000000-0000-4000-8000-00000000a161';  -- attacker
  v_b          uuid := '00000000-0000-4000-8000-00000000b161';  -- victim
  v_case_a     uuid;
  v_case_b     uuid;
  v_assess_a   uuid;
  v_assess_b   uuid;
  v_pred_a     uuid;
  v_pred_b     uuid;
  v_att_a      uuid;
  v_att_b      uuid;
  v_evt_a      uuid;
  v_evt_b      uuid;
  v_prog       text;
  v_planted    uuid;
  v_admitted   boolean;
  -- Becoming the attacker is `set_config(..., true)`: transaction-local, and a caught exception
  -- rolls the sub-transaction back, which restores the role on its own. The explicit reset in
  -- each handler is belt rather than braces.
begin
  select id into v_prog from public.programs order by id limit 1;

  -- ============================ seed: two ordinary students ============================
  insert into auth.users (id, email) values
    (v_a, 'mv161-attacker@local.test'),
    (v_b, 'mv161-victim@local.test');

  insert into public.cases (organization_id, student_user_id, display_name)
    values (null, v_a, 'MV-161 attacker') returning id into v_case_a;
  insert into public.cases (organization_id, student_user_id, display_name)
    values (null, v_b, 'MV-161 victim') returning id into v_case_b;

  insert into public.assessments (owner, case_id, result, rule_version, expires_at, destination_id, profile_snapshot)
    values (v_a, v_case_a, '{}', 'v1', now() + interval '3 days', 'AU', '{}') returning id into v_assess_a;
  insert into public.assessments (owner, case_id, result, rule_version, expires_at, destination_id, profile_snapshot)
    values (v_b, v_case_b, '{}', 'v1', now() + interval '3 days', 'AU', '{}') returning id into v_assess_b;

  insert into public.program_predictions (owner, case_id, assessment_id, program_id, verdict, rule_version, score_snapshot)
    values (v_a, v_case_a, v_assess_a, v_prog, 'strong', 'v1', '{}') returning id into v_pred_a;
  insert into public.program_predictions (owner, case_id, assessment_id, program_id, verdict, rule_version, score_snapshot)
    values (v_b, v_case_b, v_assess_b, v_prog, 'strong', 'v1', '{}') returning id into v_pred_b;

  insert into public.application_attempts (owner, case_id, prediction_id, program_id, destination, intake)
    values (v_a, v_case_a, v_pred_a, v_prog, 'AU', '2027-02') returning id into v_att_a;
  insert into public.application_attempts (owner, case_id, prediction_id, program_id, destination, intake)
    values (v_b, v_case_b, v_pred_b, v_prog, 'AU', '2027-02') returning id into v_att_b;

  insert into public.outcome_events (owner, case_id, attempt_id, event_type, occurred_at, source)
    values (v_a, v_case_a, v_att_a, 'applied', now(), 'self_reported') returning id into v_evt_a;
  insert into public.outcome_events (owner, case_id, attempt_id, event_type, occurred_at, source)
    values (v_b, v_case_b, v_att_b, 'applied', now(), 'self_reported') returning id into v_evt_b;

  raise notice 'MV161|seed|attacker case=% pred=% evt=%  victim case=% pred=% evt=%',
    v_case_a, v_pred_a, v_evt_a, v_case_b, v_pred_b, v_evt_b;

  -- ============================ P1 — ATTACK on program_predictions ============================
  -- Every axis MV-159 bounds is satisfied: A's own case, A's own assessment, owned by A. The ONLY
  -- hostile column is the pointer.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    insert into public.program_predictions
      (owner, case_id, assessment_id, program_id, verdict, rule_version, score_snapshot, supersedes_prediction_id)
      values (v_a, v_case_a, v_assess_a, v_prog, 'possible', 'v2', '{}', v_pred_b)
      returning id into v_planted;
    perform set_config('role', 'postgres', true);
    v_admitted := true;
    raise notice 'MV161|P1|ADMITTED|planted=%|the victim''s prediction is now pointed at by a row they cannot see', v_planted;
  exception when others then
    perform set_config('role', 'postgres', true);
    v_admitted := false;
    v_planted := null;
    raise notice 'MV161|P1|REFUSED|sqlstate=%|%', sqlstate, sqlerrm;
  end;

  -- ============================ P2 — ATTACK on outcome_events ============================
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    insert into public.outcome_events
      (owner, case_id, attempt_id, event_type, occurred_at, source, supersedes_event_id)
      values (v_a, v_case_a, v_att_a, 'offer_received', now(), 'self_reported', v_evt_b);
    perform set_config('role', 'postgres', true);
    raise notice 'MV161|P2|ADMITTED|the victim''s outcome event is now pointed at from another case';
  exception when others then
    perform set_config('role', 'postgres', true);
    raise notice 'MV161|P2|REFUSED|sqlstate=%|%', sqlstate, sqlerrm;
  end;

  -- ============================ P3 — CONTROL: supersede your OWN prediction ============================
  -- The legitimate correction shape. It must survive the fix, or the fix is a regression.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    insert into public.program_predictions
      (owner, case_id, assessment_id, program_id, verdict, rule_version, score_snapshot, supersedes_prediction_id)
      values (v_a, v_case_a, v_assess_a, v_prog, 'reach', 'v3', '{}', v_pred_a);
    perform set_config('role', 'postgres', true);
    raise notice 'MV161|P3|ADMITTED|in-case supersede still works';
  exception when others then
    perform set_config('role', 'postgres', true);
    raise notice 'MV161|P3|REFUSED|sqlstate=%|% <- REGRESSION: the legitimate correction shape was refused', sqlstate, sqlerrm;
  end;

  -- ============================ P4 — CONTROL: supersede your OWN outcome event ============================
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    insert into public.outcome_events
      (owner, case_id, attempt_id, event_type, occurred_at, source, supersedes_event_id)
      values (v_a, v_case_a, v_att_a, 'offer_accepted', now(), 'self_reported', v_evt_a);
    perform set_config('role', 'postgres', true);
    raise notice 'MV161|P4|ADMITTED|in-case supersede still works';
  exception when others then
    perform set_config('role', 'postgres', true);
    raise notice 'MV161|P4|REFUSED|sqlstate=%|% <- REGRESSION: the legitimate correction shape was refused', sqlstate, sqlerrm;
  end;

  -- ============================ P5 — the consequence: /api/account/delete step 2 ============================
  -- The route deletes the victim's rows by `owner`. When a plant survives, the `ON DELETE SET NULL`
  -- on the ATTACKER'S row is an UPDATE, and `private.reject_prediction_update()` is SECURITY
  -- INVOKER and unconditional, so it raises for every role -- service_role included.
  begin
    delete from public.outcome_events       where owner = v_b;
    delete from public.application_attempts where owner = v_b;
    delete from public.program_predictions  where owner = v_b;
    raise notice 'MV161|P5|DELETE-OK|the victim can still delete their account (plant admitted=%)', coalesce(v_admitted, false);
  exception when others then
    raise notice 'MV161|P5|DELETE-BLOCKED|sqlstate=%|% <- the victim is permanently locked out of account deletion', sqlstate, sqlerrm;
  end;

  raise notice 'MV161|done|';
end;
$$;

rollback;
