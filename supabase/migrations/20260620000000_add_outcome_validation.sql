-- MV-08 — Outcome-validation loop ("the moat").
-- Design & schema: docs/superpowers/specs/2026-06-19-outcome-validation-loop-design.md
--
-- Three new tables forming the chain prediction -> attempt -> event:
--   program_predictions  immutable verdict snapshot ("what we predicted")
--   application_attempts  attribution layer ("what the student applied to")  [B1]
--   outcome_events        append-only funnel log ("what actually happened")  [B2/B3]
--
-- Mirrors the conventions in 20260604002139_add_programs_universities_state.sql:
-- owner uuid -> auth.users on delete cascade, program_id text -> programs(id),
-- (select auth.uid()) per-statement RLS, force RLS, explicit revoke/grant,
-- every FK indexed (advisor-clean). assessments.id confirmed uuid
-- (20260603011208_init_assessments_and_leads.sql).
--
-- Inert on apply: no request path writes these tables yet (capture is the
-- build-phase slice). Founder-approved 2026-06-20 (apply now, storage ahead of
-- traffic — the attribution entity B1 is the costly thing to retrofit later).

-- =====================================================================
-- 4.1  program_predictions — immutable verdict snapshot
-- =====================================================================
-- Prediction-*run* model (S5): keyed on rule_version so the same program can be
-- re-predicted under a new rule version without destroying drift history; the
-- "current" prediction is the latest non-superseded run per
-- (owner, assessment_id, program_id). Immutable via the UPDATE-guard trigger
-- below (S4) — true even against the service-role client. DELETE stays open so
-- the MV-05 right-to-delete cascade works.
create table public.program_predictions (
  id                       uuid primary key default gen_random_uuid(),
  owner                    uuid not null references auth.users(id)         on delete cascade,
  assessment_id            uuid not null references public.assessments(id) on delete cascade,
  program_id               text not null references public.programs(id)    on delete cascade,
  verdict                  text not null check (verdict in ('strong','possible','reach')),
  rule_version             text not null,             -- RULE_VERSION at snapshot time, e.g. 'v0.5.0'
  score_snapshot           jsonb not null,            -- { gradeGap, englishGap, bandGap, tuitionGap }
  supersedes_prediction_id uuid references public.program_predictions(id)  on delete set null,
  predicted_at             timestamptz not null default now(),
  unique (owner, assessment_id, program_id, rule_version), -- one frozen run per rule version
  unique (id, owner)                                       -- composite-FK target (S12)
);
create index program_predictions_owner_idx         on public.program_predictions (owner);
create index program_predictions_assessment_id_idx on public.program_predictions (assessment_id);
create index program_predictions_program_id_idx    on public.program_predictions (program_id);
create index program_predictions_supersedes_idx    on public.program_predictions (supersedes_prediction_id);

-- S4: table-level immutability, role-independent. "No UPDATE policy" is not
-- immutability — the service-role client bypasses RLS. A BEFORE UPDATE guard
-- raises so any UPDATE (even a bug, even service-role) fails loudly instead of
-- silently rewriting a prediction-of-record.
create function private.reject_prediction_update()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception 'program_predictions is immutable (no UPDATE permitted)';
end;
$$;
create trigger program_predictions_no_update
  before update on public.program_predictions
  for each row execute function private.reject_prediction_update();

-- =====================================================================
-- 4.2  application_attempts — attribution layer (B1)
-- =====================================================================
-- One row per real application. Ties every later outcome to the specific
-- program/institution/intake the student applied to (a visa is issued against
-- one CoE at one provider). The composite FK (prediction_id, owner) ->
-- program_predictions(id, owner) makes it structurally impossible for an
-- attempt's owner to diverge from its prediction's owner (S12) — no trigger.
create table public.application_attempts (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null references auth.users(id) on delete cascade,
  prediction_id  uuid not null references public.program_predictions(id) on delete cascade,
  program_id     text not null references public.programs(id) on delete cascade, -- program actually applied to
  institution_id text,        -- CRICOS provider / university applied to; offer/CoE/visa attach here
  intake         text,        -- e.g. '2027-02' — disambiguates re-applications across intakes
  destination    text not null default 'AU',  -- destination-country dimension (MVP: AU)
  external_ref   text,        -- optional student-supplied application/offer/CoE reference
  created_at     timestamptz not null default now(),
  unique (id, owner),                                          -- composite-FK target (S12)
  foreign key (prediction_id, owner)
    references public.program_predictions (id, owner)          -- owner can't diverge from the prediction (S12)
);
create index application_attempts_owner_idx         on public.application_attempts (owner);
create index application_attempts_prediction_id_idx on public.application_attempts (prediction_id);
create index application_attempts_program_id_idx    on public.application_attempts (program_id);

-- =====================================================================
-- 4.3  outcome_events — append-only funnel log (B2/B3, S6/S8)
-- =====================================================================
-- One row per observed event, append-only. Current stage = latest
-- non-superseded event for the attempt; a correction inserts a new row pointing
-- at the one it replaces (supersedes_event_id, S6) — never an overwrite.
-- gate + reason_code + decision_authority (B3) let each half of the verdict
-- calibrate independently; source/verified_by/verified_at (B2) keep
-- self-reports out of calibration training (admin-only promotion, §8).
create table public.outcome_events (
  id                  uuid primary key default gen_random_uuid(),
  owner               uuid not null references auth.users(id) on delete cascade,
  attempt_id          uuid not null references public.application_attempts(id) on delete cascade,
  event_type          text not null check (event_type in (
                        'applied','offer_received','conditional_offer','application_rejected',
                        'offer_accepted','coe_issued','visa_lodged','visa_granted','visa_refused',
                        'enrolled','withdrawn')),
  gate                text check (gate in ('admission','visa')),  -- null for neutral steps
  reason_code         text,        -- normalized refusal/rejection reason; null unless a negative outcome
  decision_authority  text check (decision_authority in ('institution','dha','student','agent')),
  occurred_at         timestamptz not null,                       -- S8: full timestamp for same-day ordering
  occurred_on         date,                                       -- optional user-facing local date
  source              text not null default 'self_reported'
                        check (source in ('self_reported','document_verified','official_verified')),
  verified_by         uuid references auth.users(id),             -- admin who promoted past self_reported
  verified_at         timestamptz,
  detail              jsonb not null default '{}',                -- structured, Zod-validated
  supersedes_event_id uuid references public.outcome_events(id) on delete set null,  -- S6: lineage, not a flag
  recorded_at         timestamptz not null default now(),
  unique (id, owner),
  foreign key (attempt_id, owner)
    references public.application_attempts (id, owner)            -- owner consistency (S12)
);
create index outcome_events_attempt_id_owner_idx on public.outcome_events (attempt_id, owner); -- S11: RLS exists + lookup
create index outcome_events_owner_idx            on public.outcome_events (owner);
create index outcome_events_supersedes_idx       on public.outcome_events (supersedes_event_id);
create index outcome_events_verified_by_idx      on public.outcome_events (verified_by); -- FK index (advisor-clean)

-- =====================================================================
-- 4.4  RLS, grants
-- =====================================================================
alter table public.program_predictions enable row level security;
alter table public.program_predictions force  row level security;
alter table public.application_attempts enable row level security;
alter table public.application_attempts force  row level security;
alter table public.outcome_events       enable row level security;
alter table public.outcome_events       force  row level security;

-- program_predictions: owner-scoped SELECT + INSERT + DELETE.
-- No UPDATE policy (immutable via trigger above). DELETE supports right-to-delete (MV-05).
-- Insert re-asserts ownership of the parent assessment so a user cannot freeze a
-- prediction against someone else's assessment_id (Codex 2026-06-20).
create policy pp_select_own on public.program_predictions
  for select to authenticated using ((select auth.uid()) = owner);
create policy pp_insert_own on public.program_predictions
  for insert to authenticated
  with check (
    (select auth.uid()) = owner
    and exists (
      select 1 from public.assessments a
      where a.id = assessment_id and a.owner = (select auth.uid())
    )
  );
create policy pp_delete_own on public.program_predictions
  for delete to authenticated using ((select auth.uid()) = owner);

-- application_attempts: owner-scoped; insert re-asserts ownership of the parent prediction.
create policy aa_select_own on public.application_attempts
  for select to authenticated using ((select auth.uid()) = owner);
create policy aa_insert_own on public.application_attempts
  for insert to authenticated
  with check (
    (select auth.uid()) = owner
    and exists (
      select 1 from public.program_predictions p
      where p.id = prediction_id and p.owner = (select auth.uid())
    )
  );
create policy aa_delete_own on public.application_attempts
  for delete to authenticated using ((select auth.uid()) = owner);

-- outcome_events: owner-scoped; a user may only file unverified self-reports.
-- Verification promotion (source/verified_by) is admin-only via a restricted path (§8).
-- No UPDATE policy — corrections are append-only (new row + supersedes_event_id).
create policy oe_select_own on public.outcome_events
  for select to authenticated using ((select auth.uid()) = owner);
create policy oe_insert_own on public.outcome_events
  for insert to authenticated
  with check (
    (select auth.uid()) = owner
    and source = 'self_reported'
    and verified_by is null
    and exists (
      select 1 from public.application_attempts a
      where a.id = attempt_id and a.owner = (select auth.uid())
    )
  );
create policy oe_delete_own on public.outcome_events
  for delete to authenticated using ((select auth.uid()) = owner);

revoke all on public.program_predictions, public.application_attempts, public.outcome_events
  from anon, authenticated;
grant select, insert, delete on public.program_predictions to authenticated;
grant select, insert, delete on public.application_attempts to authenticated;
grant select, insert, delete on public.outcome_events       to authenticated;
