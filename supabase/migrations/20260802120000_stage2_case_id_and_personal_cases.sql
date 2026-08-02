-- MV-155 — Stage 2 personal cases + `case_id` on the nine student-owned tables + owner→case backfill.
--
-- Card:  docs/kanban/cards/MV-155-personal-cases-and-backfill.md
-- Spec:  docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md  (AUTHORITATIVE)
--          §2 the hosted capture this migration was transcribed from · §3 the invariant ·
--          §4.1-§4.9 the per-table target shape, uniqueness and grants · §10.1 R6 the rollback.
-- Plan:  docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md
--          §"Additive migration sequence" steps 2-7 · §"Known schema obstacles".
--
-- THIS IS THE FIRST MIGRATION IN THE PROGRAMME THAT MUTATES LIVE USER DATA. It is INERT on a
-- fresh `supabase db reset` (no `auth.users` ⇒ 0 cases created, 0 rows updated), so a green local
-- run proves the DDL and proves nothing about the data movement. The evidence that matters is the
-- rehearsal recorded on the card, against a production-shaped copy, with the rollback executed and
-- the forward migration re-applied.
--
-- WHAT THIS MIGRATION DOES (and, as importantly, what it refuses to do):
--   1  cases_personal_student_idx — one personal case per Auth user, structurally
--   2  `case_id uuid null references public.cases(id) on delete restrict` on exactly nine tables
--   3  case-keyed lookup + uniqueness indexes, BESIDE the owner-keyed ones (the swap is MV-160)
--   4  private.reject_prediction_update() narrowed to permit exactly the case_id backfill
--   5  private.mv155_backfill_personal_cases() / private.mv155_assert_case_backfill()
--   5a private.mv155_derive_case_id_from_owner() + its two UPSERT-seam triggers
--   6  the column-grant rewrite that keeps `case_id` off the client UPDATE surface
--   7  run the backfill, report it
--   8  assert the invariant as the last statement
--
-- NOT here, deliberately: no `owner` relaxation and no composite-FK rebase (MV-156); no repository,
-- route or lib/** change (MV-157); no claim-path change (MV-158); no RLS POLICY added, altered or
-- dropped on any of the nine (MV-159); no `case_id NOT NULL` and no owner-keyed index dropped
-- (MV-160); no document_requests/_versions/_reviews and no storage.objects re-scoping (Stage 4).
--
-- Conventions inherited: `private` definer helpers with a pinned `search_path = ''` and PUBLIC
-- EXECUTE revoked in the same migration (20260730120000 / 20260730180000); split-the-flat-column-
-- grant as the remedy for a write surface that is wider than the policy (20260730180000 §9);
-- role-independent immutability triggers (20260620000000).

-- =====================================================================
-- 1  cases_personal_student_idx — one personal case per Auth user
-- =====================================================================
-- Partial on `organization_id is null` so consultancy cases are untouched: an org may hold many
-- cases for the same student. `student_user_id` is nullable and NULLs are distinct in a unique
-- index, so an UNCLAIMED personal case (student_user_id null) is still expressible — the rule is
-- "at most one personal case per LINKED student", which is exactly the backfill's join key.
--
-- Created BEFORE the personal cases are minted so a double-run cannot race itself: the `where not
-- exists` guard in the backfill is the cheap path and this index is the one that cannot be lost.
create unique index cases_personal_student_idx
  on public.cases (student_user_id)
  where organization_id is null;

-- =====================================================================
-- 2  case_id on exactly nine tables — nullable, FK to cases, ON DELETE RESTRICT
-- =====================================================================
-- `on delete restrict` is the deliberate choice and the other two are both wrong while `owner` is
-- still the authoritative axis: `cascade` would let deleting a case erase a real student's profile,
-- plan, documents and outcome history; `set null` would orphan those rows silently, which is the
-- same data loss with no error to notice it by. Case-deletion ordering is Stage 6's deliverable.
--
-- Nullable on every one. Mandatory-where-the-domain-requires-it is MV-160; the anonymous
-- `assessments` carve-out (`owner is null ⇒ case_id is null`) is permanent for Stage 2 and beyond.
alter table public.profiles             add column case_id uuid references public.cases(id) on delete restrict;
alter table public.assessments          add column case_id uuid references public.cases(id) on delete restrict;
alter table public.plan_items           add column case_id uuid references public.cases(id) on delete restrict;
alter table public.user_program_state   add column case_id uuid references public.cases(id) on delete restrict;
alter table public.documents            add column case_id uuid references public.cases(id) on delete restrict;
alter table public.document_status      add column case_id uuid references public.cases(id) on delete restrict;
alter table public.program_predictions  add column case_id uuid references public.cases(id) on delete restrict;
alter table public.application_attempts add column case_id uuid references public.cases(id) on delete restrict;
alter table public.outcome_events       add column case_id uuid references public.cases(id) on delete restrict;

-- =====================================================================
-- 3  case-keyed indexes — lookup cover, and per-case uniqueness BESIDE per-owner uniqueness
-- =====================================================================
-- THE FOUR `ON CONFLICT` ARBITER INDEXES ARE **FULL, NOT PARTIAL**, AND THAT IS LOAD-BEARING:
--
--     profiles_case_idx                    (case_id)               ← upsertProfile
--     user_program_state_case_program_idx  (case_id, program_id)   ← upsertProgramState
--     documents_case_kind_idx              (case_id, kind)         ← upsertDocument
--     document_status_case_kind_idx        (case_id, kind)         ← setObtained
--
-- Postgres infers a PARTIAL unique index for `ON CONFLICT` only when the statement itself supplies
-- the index predicate, and PostgREST's `on_conflict=` emits a bare column list — so re-adding
-- `where case_id is not null` to any of the four makes every upsert MV-157 re-points raise 42P10 at
-- RUNTIME, on a live request, not at migration time. The safety a predicate would have expressed is
-- not lost: NULLs are distinct in a unique index, so the legacy `case_id`-null rows cannot collide
-- during the nullable window. (Spec §4 rule 1 — confirmed empirically in both directions.)
--
-- The three indexes that DO keep a predicate keep it for a DOMAIN reason, and none of them is an
-- arbiter: `assessments … where is_primary` (only the primary row is constrained),
-- `plan_items … where status = 'todo'` (only open items are constrained), and the `assessments`
-- LOOKUP index `where case_id is not null` (keeps the anonymous population out of the index, the
-- same idiom as assessments_owner_idx).
--
-- WHY THE BACKFILL CANNOT VIOLATE ANY OF THESE: each case-keyed unique is the 1:1 image of an
-- owner-keyed rule that ALREADY holds, under a mapping that is itself one-to-one — one personal case
-- per Auth user (§1), and every backfilled row takes its own owner's case. `unique (owner)` →
-- `unique (case_id)`, `(owner, program_id)` → `(case_id, program_id)`, `(owner, kind)` →
-- `(case_id, kind)`, `(owner) where is_primary` → `(case_id) where is_primary`, and so on. A 23505
-- from this migration would mean the personal-case mapping is not one-to-one, which
-- cases_personal_student_idx makes unrepresentable — so it is a loud failure, never silent damage.

-- 3a  profiles — profile per case. FULL unique, and it also covers the case_id FK.
create unique index profiles_case_idx on public.profiles (case_id);

-- 3b  assessments — lookup (partial, anonymous rows excluded) + primary-per-case (partial on the
--     domain rule). BOTH the owner-keyed assessments_primary_idx and this one live until MV-160:
--     a partial unique treats NULLs as distinct, so swapping early would make two primaries per
--     case insertable during the window (the MV-158 interlock).
create index assessments_case_id_idx on public.assessments (case_id) where case_id is not null;
create unique index assessments_case_primary_idx on public.assessments (case_id) where is_primary;

-- 3c  plan_items — lookup, open-items lookup (mirrors plan_items_open_idx), open-item-per-kind
--     uniqueness (mirrors plan_items_kind_open_idx).
create index plan_items_case_id_idx on public.plan_items (case_id);
create index plan_items_case_open_idx on public.plan_items (case_id, created_at desc) where status = 'todo';
create unique index plan_items_case_kind_open_idx on public.plan_items (case_id, kind) where status = 'todo';

-- 3d  user_program_state — program state per case/program. ARBITER: full.
create unique index user_program_state_case_program_idx on public.user_program_state (case_id, program_id);

-- 3e  documents — document per case/kind. ARBITER: full.
create unique index documents_case_kind_idx on public.documents (case_id, kind);

-- 3f  document_status — checklist row per case/kind. ARBITER: full.
create unique index document_status_case_kind_idx on public.document_status (case_id, kind);

-- 3g  program_predictions — the case-keyed mirror of
--     program_predictions_owner_assessment_id_program_id_rule_ver_key. Full: predictions are
--     insert-only and nothing upserts against it. (MV-160 drops the legacy one — spec §9.3.)
create unique index program_predictions_case_assessment_program_rule_idx
  on public.program_predictions (case_id, assessment_id, program_id, rule_version);

-- 3h  application_attempts / outcome_events — lookup only. `unique (id, case_id)` and the case-side
--     composite FKs are MV-156's, not this card's.
create index application_attempts_case_id_idx on public.application_attempts (case_id);
create index outcome_events_case_id_idx on public.outcome_events (case_id);

-- CASE_ID INDEX-COVERAGE MAP (the same discipline as 20260730120000's closing note: a `case_id`
-- lookup and the `case_id` FK must be indexed on all nine, and no REDUNDANT single-column index is
-- created where an index already LEADS with case_id — a prefix match satisfies the advisor's
-- unindexed_foreign_keys check and a duplicate only costs write amplification):
--   profiles.case_id              profiles_case_idx (case_id) U                        [leads]
--   assessments.case_id           assessments_case_id_idx (case_id) partial            [dedicated]
--   plan_items.case_id            plan_items_case_id_idx (case_id)                     [dedicated]
--   user_program_state.case_id    user_program_state_case_program_idx (case_id, …) U   [leads]
--   documents.case_id             documents_case_kind_idx (case_id, kind) U            [leads]
--   document_status.case_id       document_status_case_kind_idx (case_id, kind) U      [leads]
--   program_predictions.case_id   program_predictions_case_assessment_program_rule_idx [leads]
--   application_attempts.case_id  application_attempts_case_id_idx (case_id)           [dedicated]
--   outcome_events.case_id        outcome_events_case_id_idx (case_id)                 [dedicated]

-- =====================================================================
-- 4  program_predictions immutability — narrowed, not dropped
-- =====================================================================
-- The obstacle the plan names: a plain `UPDATE … SET case_id` on program_predictions FAILS, because
-- `program_predictions_no_update` raises unconditionally and its function is SECURITY INVOKER, so
-- `service_role` does not bypass it either.
--
-- The alternative — drop the trigger, update, recreate, all under the ACCESS EXCLUSIVE lock the DDL
-- takes — is safe against concurrent writers but leaves the BACKFILL STATEMENT ITSELF unguarded, so
-- a mistyped `set` in the same transaction would rewrite a prediction-of-record with nothing
-- raising. The narrowed trigger keeps the guard live during the exact operation it exists to
-- protect against.
--
-- Exactly ONE transition is permitted: case_id null → not-null, with every other column
-- byte-identical. The `to_jsonb(new) - 'case_id' = to_jsonb(old) - 'case_id'` comparison covers
-- columns added LATER automatically, so the allowance cannot silently widen.
--
-- It is SELF-CLOSING: once MV-160 sets `case_id NOT NULL`, `old.case_id is null` is unreachable and
-- the guard is unconditional again by construction. MV-160 additionally restores the original body
-- — recorded here as a hand-off, not assumed.
--
-- `set search_path = ''` is RESTATED because `create or replace function` does not inherit the
-- previous definition's configuration if omitted (MV-150's advisor discipline). SECURITY INVOKER is
-- preserved by omission of `security definer`, and that is the property 20260620000000 exists to
-- guarantee: the guard must raise for service_role too.
create or replace function private.reject_prediction_update()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.case_id is null
     and new.case_id is not null
     and (to_jsonb(new) - 'case_id'::text) = (to_jsonb(old) - 'case_id'::text) then
    return new;
  end if;
  raise exception 'program_predictions is immutable (no UPDATE permitted)';
end;
$$;

-- =====================================================================
-- 5  the backfill — one owner→case statement per table, in a testable function
-- =====================================================================
-- A `private` function rather than inline SQL because the house rule ("business logic lives in the
-- Next.js codebase") is about product behaviour, and a one-shot migration mechanism is not that.
-- In a function it is idempotent, re-runnable during the rehearsal, callable from the itest, and
-- REPORTABLE (a count per table) instead of invisible.
--
-- The population is `auth.users`, which §2.9 confirms is a strict SUPERSET of the nine tables'
-- distinct owners — so the join can never miss an owner and no data-owner scan is required.
--
-- NO FIRST-USE PATH IS BUILT HERE. A user created AFTER this migration has no personal case until
-- MV-157/MV-158 ship create-or-resolve. This card states the gap; it does not fill it. See §5a for
-- how the UPSERT-seam trigger behaves in that window (it derives NULL, it does not raise).
create function private.mv155_backfill_personal_cases()
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_cases                int;
  v_profiles             int;
  v_assessments          int;
  v_plan_items           int;
  v_user_program_state   int;
  v_documents            int;
  v_document_status      int;
  v_program_predictions  int;
  v_application_attempts int;
  v_outcome_events       int;
begin
  -- ---- personal cases, one per Auth user, idempotent -----------------------------------------
  -- display_name is `not null` on public.cases, so the coalesce chain must end in a literal. The
  -- profile name is preferred over the OAuth metadata because it is the name the student edited.
  insert into public.cases (organization_id, student_user_id, created_by, email, display_name)
  select null,
         u.id,
         u.id,
         u.email,
         coalesce(
           nullif(btrim(p.sections -> 'personal' ->> 'name'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
           u.email,
           'MeroVisa student'
         )
    from auth.users u
    left join public.profiles p on p.owner = u.id   -- profiles_owner_key is unique: cannot fan out
   where not exists (
           select 1
             from public.cases c
            where c.organization_id is null
              and c.student_user_id = u.id
         );
  get diagnostics v_cases = row_count;

  -- ---- owner → case, one statement per table -------------------------------------------------
  -- Every one has the SAME shape, and every clause in it is load-bearing:
  --   `c.organization_id is null`  the personal case, never a consultancy case
  --   `t.owner is not null`        anonymous assessments stay case-less (MV-135's purge predicate)
  --   `t.case_id is null`          idempotency: a second call updates zero rows
  -- It only ever UPDATEs. No student-owned row is inserted or deleted by this migration.
  update public.profiles t set case_id = c.id from public.cases c
   where c.organization_id is null and c.student_user_id = t.owner
     and t.owner is not null and t.case_id is null;
  get diagnostics v_profiles = row_count;

  update public.assessments t set case_id = c.id from public.cases c
   where c.organization_id is null and c.student_user_id = t.owner
     and t.owner is not null and t.case_id is null;
  get diagnostics v_assessments = row_count;

  update public.plan_items t set case_id = c.id from public.cases c
   where c.organization_id is null and c.student_user_id = t.owner
     and t.owner is not null and t.case_id is null;
  get diagnostics v_plan_items = row_count;

  update public.user_program_state t set case_id = c.id from public.cases c
   where c.organization_id is null and c.student_user_id = t.owner
     and t.owner is not null and t.case_id is null;
  get diagnostics v_user_program_state = row_count;

  update public.documents t set case_id = c.id from public.cases c
   where c.organization_id is null and c.student_user_id = t.owner
     and t.owner is not null and t.case_id is null;
  get diagnostics v_documents = row_count;

  update public.document_status t set case_id = c.id from public.cases c
   where c.organization_id is null and c.student_user_id = t.owner
     and t.owner is not null and t.case_id is null;
  get diagnostics v_document_status = row_count;

  -- Routed through the NARROWED immutability trigger (§4), not around it. A plain
  -- `UPDATE … SET case_id` is exactly what the plan says fails; it succeeds here only because the
  -- statement touches case_id and nothing else, which is the one transition §4 permits.
  update public.program_predictions t set case_id = c.id from public.cases c
   where c.organization_id is null and c.student_user_id = t.owner
     and t.owner is not null and t.case_id is null;
  get diagnostics v_program_predictions = row_count;

  update public.application_attempts t set case_id = c.id from public.cases c
   where c.organization_id is null and c.student_user_id = t.owner
     and t.owner is not null and t.case_id is null;
  get diagnostics v_application_attempts = row_count;

  update public.outcome_events t set case_id = c.id from public.cases c
   where c.organization_id is null and c.student_user_id = t.owner
     and t.owner is not null and t.case_id is null;
  get diagnostics v_outcome_events = row_count;

  return jsonb_build_object(
    'cases_created',        v_cases,
    'profiles',             v_profiles,
    'assessments',          v_assessments,
    'plan_items',           v_plan_items,
    'user_program_state',   v_user_program_state,
    'documents',            v_documents,
    'document_status',      v_document_status,
    'program_predictions',  v_program_predictions,
    'application_attempts', v_application_attempts,
    'outcome_events',       v_outcome_events
  );
end;
$$;
-- A new function's EXECUTE defaults to PUBLIC and `authenticated` already holds USAGE on `private`
-- (20260730180000), so without this line any signed-in browser could call — through PostgREST's RPC
-- surface — a SECURITY DEFINER function that rewrites case_id on all nine student-owned tables and
-- inserts into `cases`. It is not exploitable today only because the function is idempotent and
-- derives everything from `owner`; that is a property of this implementation, not a boundary.
-- NO role is granted EXECUTE in its place: the migration calls it as the table owner, and the itest
-- and the rehearsal call it through psql as `postgres`.
revoke all on function private.mv155_backfill_personal_cases() from public;

-- =====================================================================
-- 6  the owner↔case invariant — ASSERTED, because it cannot be a CHECK
-- =====================================================================
-- Spec §3, in one sentence: every student-owned row belongs to exactly one case; during Stage 2 it
-- also keeps its `owner`, and where both are present they must agree — `case_id` resolves to the
-- case whose `organization_id is null and student_user_id = owner`. An `assessments` row with
-- `owner is null` must also have `case_id is null`.
--
-- It is CROSS-TABLE, so no CHECK can express it. A `NOT VALID` check is not a substitute: Postgres
-- still enforces it on new rows, which would break every live owner-only write between this card
-- and MV-157. Enforcement becomes STRUCTURAL at MV-156 (composite FKs) and MV-160 (NOT NULL + drop
-- legacy). Until then this function is the detector, and it is one definition shared by the
-- migration (last statement) and the itest — not two descriptions of one rule.
--
-- It reports EVERY violation rather than the first, because "which tables are wrong" is the
-- question a rehearsal log has to answer.
create function private.mv155_assert_case_backfill()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_violations text[];
begin
  select array_agg(v order by v) into v_violations from (
    -- (1) an OWNED row with no case, on any of the nine
    select 'profiles: ' || count(*) || ' owned rows with case_id null' as v
      from public.profiles where owner is not null and case_id is null having count(*) > 0
    union all select 'assessments: ' || count(*) || ' owned rows with case_id null'
      from public.assessments where owner is not null and case_id is null having count(*) > 0
    union all select 'plan_items: ' || count(*) || ' owned rows with case_id null'
      from public.plan_items where owner is not null and case_id is null having count(*) > 0
    union all select 'user_program_state: ' || count(*) || ' owned rows with case_id null'
      from public.user_program_state where owner is not null and case_id is null having count(*) > 0
    union all select 'documents: ' || count(*) || ' owned rows with case_id null'
      from public.documents where owner is not null and case_id is null having count(*) > 0
    union all select 'document_status: ' || count(*) || ' owned rows with case_id null'
      from public.document_status where owner is not null and case_id is null having count(*) > 0
    union all select 'program_predictions: ' || count(*) || ' owned rows with case_id null'
      from public.program_predictions where owner is not null and case_id is null having count(*) > 0
    union all select 'application_attempts: ' || count(*) || ' owned rows with case_id null'
      from public.application_attempts where owner is not null and case_id is null having count(*) > 0
    union all select 'outcome_events: ' || count(*) || ' owned rows with case_id null'
      from public.outcome_events where owner is not null and case_id is null having count(*) > 0

    -- (2) a row whose case_id does NOT resolve to its owner's personal case. Guarded on
    --     `owner is not null`: from Stage 3 a consultancy row legitimately has case_id and no
    --     owner, and "they must agree" applies only when both are present (§3).
    union all select 'profiles: ' || count(*) || ' rows whose case_id is not the owner''s personal case'
      from public.profiles t where t.owner is not null and t.case_id is not null
       and not exists (select 1 from public.cases c where c.id = t.case_id
                        and c.organization_id is null and c.student_user_id = t.owner) having count(*) > 0
    union all select 'assessments: ' || count(*) || ' rows whose case_id is not the owner''s personal case'
      from public.assessments t where t.owner is not null and t.case_id is not null
       and not exists (select 1 from public.cases c where c.id = t.case_id
                        and c.organization_id is null and c.student_user_id = t.owner) having count(*) > 0
    union all select 'plan_items: ' || count(*) || ' rows whose case_id is not the owner''s personal case'
      from public.plan_items t where t.owner is not null and t.case_id is not null
       and not exists (select 1 from public.cases c where c.id = t.case_id
                        and c.organization_id is null and c.student_user_id = t.owner) having count(*) > 0
    union all select 'user_program_state: ' || count(*) || ' rows whose case_id is not the owner''s personal case'
      from public.user_program_state t where t.owner is not null and t.case_id is not null
       and not exists (select 1 from public.cases c where c.id = t.case_id
                        and c.organization_id is null and c.student_user_id = t.owner) having count(*) > 0
    union all select 'documents: ' || count(*) || ' rows whose case_id is not the owner''s personal case'
      from public.documents t where t.owner is not null and t.case_id is not null
       and not exists (select 1 from public.cases c where c.id = t.case_id
                        and c.organization_id is null and c.student_user_id = t.owner) having count(*) > 0
    union all select 'document_status: ' || count(*) || ' rows whose case_id is not the owner''s personal case'
      from public.document_status t where t.owner is not null and t.case_id is not null
       and not exists (select 1 from public.cases c where c.id = t.case_id
                        and c.organization_id is null and c.student_user_id = t.owner) having count(*) > 0
    union all select 'program_predictions: ' || count(*) || ' rows whose case_id is not the owner''s personal case'
      from public.program_predictions t where t.owner is not null and t.case_id is not null
       and not exists (select 1 from public.cases c where c.id = t.case_id
                        and c.organization_id is null and c.student_user_id = t.owner) having count(*) > 0
    union all select 'application_attempts: ' || count(*) || ' rows whose case_id is not the owner''s personal case'
      from public.application_attempts t where t.owner is not null and t.case_id is not null
       and not exists (select 1 from public.cases c where c.id = t.case_id
                        and c.organization_id is null and c.student_user_id = t.owner) having count(*) > 0
    union all select 'outcome_events: ' || count(*) || ' rows whose case_id is not the owner''s personal case'
      from public.outcome_events t where t.owner is not null and t.case_id is not null
       and not exists (select 1 from public.cases c where c.id = t.case_id
                        and c.organization_id is null and c.student_user_id = t.owner) having count(*) > 0

    -- (3) the anonymous carve-out, in the direction that matters. Giving an unclaimed row a case
    --     would take it out of MV-135's `owner is null` purge predicate and turn a shipped 3-day
    --     retention promise into a lie, silently.
    union all select 'assessments: ' || count(*) || ' anonymous rows (owner null) carry a case_id'
      from public.assessments where owner is null and case_id is not null having count(*) > 0
  ) violations;

  if v_violations is not null then
    raise exception 'mv155_assert_case_backfill: owner/case invariant violated — %',
      array_to_string(v_violations, '; ');
  end if;
end;
$$;
-- Read-only, so the exposure it would leave is a disclosure channel rather than a write channel.
-- Revoked anyway: the rule is "every `private` definer function has PUBLIC EXECUTE revoked", and a
-- rule with a judgement call in it is not a rule.
revoke all on function private.mv155_assert_case_backfill() from public;

-- =====================================================================
-- 6a  the UPSERT seam — a definer trigger that derives case_id from owner
-- =====================================================================
-- THE PROBLEM. `upsertProgramState` and `setObtained` are UPSERTS. PostgREST compiles them to
-- `INSERT … ON CONFLICT DO UPDATE SET`, and the SET list covers every column in the payload — so
-- the moment MV-157 puts `case_id` in either payload, those statements need `UPDATE(case_id)` as
-- well as `INSERT(case_id)`, and `UPDATE(case_id)` is the one grant §7 below deliberately refuses:
-- a client that can UPDATE case_id can re-point an existing row into another case.
--
-- THE RESOLUTION (card §H, integrator 2026-08-02, option (a)). A `before insert or update`
-- SECURITY DEFINER trigger derives `case_id` from `owner` server-side, so the client never supplies
-- it, the ON CONFLICT SET list never names it, and no UPDATE(case_id) grant is needed. MV-157 must
-- therefore keep `case_id` OUT of the `upsertProgramState` and `setObtained` payloads — a payload
-- that carries it fails the grant check with 42501 BEFORE any trigger runs. That is the seam this
-- closes, not a case it handles.
--
-- THE `WHEN (new.owner is not null)` CLAUSE IS PART OF THE SPECIFICATION, NOT AN OPTIMISATION:
--
--   * owner SET (a personal case) — derive from that owner's personal case and OVERWRITE whatever
--     the statement supplied. The re-pointing hazard stays closed at the strongest available point:
--     not by a grant somebody could widen later, but by the row never carrying a client-chosen
--     value at all.
--   * owner NULL (a consultancy-created row) — nothing to derive from, the trigger does not fire,
--     and the statement-supplied `case_id` is HONOURED. The bound on which case it may name is
--     MV-159's `WITH CHECK`, not this trigger; "which case may this row name" is an authorization
--     question and this is a provenance mechanism. MV-155 asserts only that the value survives.
--
-- Unqualified, the overwrite would destroy the only `case_id` an `owner IS NULL` row could carry,
-- which makes MV-160 §D's counsellor-write proof ("each succeeding with owner IS NULL" on exactly
-- these two tables) unsatisfiable by construction.
--
-- IT DERIVES NULL RATHER THAN RAISING when the owner has no personal case. That case is real and
-- dated: a user who signs up AFTER this migration and BEFORE MV-157's create-or-resolve path has no
-- personal case, and raising here would take `/api/shortlist` and `/api/documents/status` down for
-- them — a live self-serve regression, in a migration whose §H criterion is "behaviour-preserving".
-- Deriving NULL reproduces today's behaviour exactly (today neither path writes case_id at all) and
-- leaves an owner-set/case-less row, which is legal during the nullable window and is precisely
-- what MV-160's reconciliation sweep exists to repair.
create function private.mv155_derive_case_id_from_owner()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_case_id uuid;
begin
  -- cases_personal_student_idx makes this at most one row.
  select c.id into v_case_id
    from public.cases c
   where c.organization_id is null
     and c.student_user_id = new.owner;

  new.case_id := v_case_id;   -- unconditional: derived-or-null always beats client-supplied
  return new;
end;
$$;
-- A trigger fires as the table owner regardless of who holds EXECUTE, so this revoke costs nothing
-- functionally. What it removes is the ability for any signed-in client to invoke a definer
-- function DIRECTLY through PostgREST RPC, outside a trigger context, with a hand-built record.
revoke all on function private.mv155_derive_case_id_from_owner() from public;

create trigger user_program_state_derive_case_id
  before insert or update on public.user_program_state
  for each row when (new.owner is not null)
  execute function private.mv155_derive_case_id_from_owner();

create trigger document_status_derive_case_id
  before insert or update on public.document_status
  for each row when (new.owner is not null)
  execute function private.mv155_derive_case_id_from_owner();

-- =====================================================================
-- 7  the column-grant rewrite — case_id is NOT client-writable
-- =====================================================================
-- Adding a column to a table with a TABLE-LEVEL grant silently extends that grant to the new
-- column. This is the one way an additive migration widens the client write surface, and without
-- this section a student could `update profiles set case_id = <another case>` through the anon key
-- the moment MV-159's policies start trusting the column. Each affected grant is replaced with an
-- explicit column list — MV-152's split-the-flat-grant remedy (20260730180000 §9), applied here.
--
-- THE ASYMMETRY IS THE POINT AND IT IS NOT A SLIP: `case_id` is OMITTED from every UPDATE list and
-- INCLUDED in every INSERT list.
--   * UPDATE is where the hazard lives — a client that can UPDATE case_id RE-POINTS an existing row
--     into another case. The hazard is re-pointing, and re-pointing is UPDATE.
--   * INSERT cannot re-point anything; it creates a row, and MV-159's `WITH CHECK` bounds which
--     case the inserted value may name.
-- Three authenticated-client paths must write `case_id` under MV-157 and NO OTHER CARD GRANTS IT
-- (MV-157 §G forbids itself from adding grants; MV-159 asserts the grant set is unchanged):
-- app/api/documents/status/route.ts → setObtained, app/api/shortlist/route.ts → upsertProgramState,
-- and captureApplication in lib/outcomes/on-apply.ts → the prediction/attempt/event chain. Omitting
-- case_id from the INSERT lists would fail all three with 42501 with no card responsible.
--
-- `assessments` (SELECT only) and `documents` (SELECT, DELETE) need NO change — stated so a
-- reviewer sees the omission is deliberate. SELECT stays table-level and therefore now covers
-- `case_id`, which is what spec §4's "SELECT(all)" means on every one of the nine.

-- profiles — UPDATE narrows to the two columns the student actually edits. `case_id`, `owner`,
-- `id`, `created_at` and `updated_at` all leave the write surface.
revoke update on public.profiles from authenticated;
grant update (sections, completeness) on public.profiles to authenticated;

-- plan_items — the student determines status/completed_at/started_at and nothing else. `kind`,
-- `title`, `impact` and the rest are MeroVisa's determination (spec §11.1's Platform layer).
revoke update on public.plan_items from authenticated;
grant update (status, completed_at, started_at) on public.plan_items to authenticated;

-- user_program_state / document_status — the two UPSERT-seam tables.
--
-- THE UPDATE LISTS ARE THE PAYLOAD COLUMNS, NOT JUST THE MUTABLE ONES, AND THAT IS FORCED BY
-- MEASURED PostgREST BEHAVIOUR RATHER THAN CHOSEN. Spec §4.4/§4.6 specify `UPDATE (status, notes)`
-- and `UPDATE (obtained)`. Both were probed against this project's own stack and both FAIL: an
-- upsert compiles to `INSERT … ON CONFLICT DO UPDATE SET`, and PostgREST puts EVERY payload column
-- in that SET list — including the conflict-target columns. The privilege check happens at plan
-- time, so even the insert branch raises 42501, on the FIRST call, with no row present:
--
--   update(status,notes)                    -> 42501   update(obtained)            -> 42501
--   update(status,notes,program_id)         -> 42501   update(obtained,kind)       -> 42501
--   update(status,notes,owner)              -> 42501   update(obtained,owner)      -> 42501
--   update(status,notes,owner,program_id)   -> OK      update(obtained,owner,kind) -> OK
--
-- `app/api/documents/status/route.ts` already calls `setObtained` on the AUTHENTICATED client, so
-- the narrow list breaks the live document checklist the day this migration applies; and spec
-- §4.4's "MV-157 §G flips app/api/shortlist/route.ts … sound, because the grant already exists"
-- would not be sound either. Recorded as a finding against the spec, not resolved silently.
--
-- WHAT §H ACTUALLY ASKS FOR IS UNCHANGED AND STILL HOLDS: `case_id` appears in NO UPDATE list
-- anywhere. Probed: an authenticated `update … set case_id` on this table is 42501 under exactly
-- these grants, and an authenticated attempt to re-point `owner` is 42501 too — refused by the RLS
-- WITH CHECK, which is where an authorization question belongs. Both lists remain strictly NARROWER
-- than the flat table-level grant they replace: `case_id`, `created_at` and `updated_at` are off
-- `user_program_state`'s surface and `case_id` and `updated_at` are off `document_status`'s.
revoke insert, update on public.user_program_state from authenticated;
grant insert (owner, program_id, status, notes, case_id) on public.user_program_state to authenticated;
grant update (owner, program_id, status, notes) on public.user_program_state to authenticated;

revoke insert, update on public.document_status from authenticated;
grant insert (owner, kind, obtained, case_id) on public.document_status to authenticated;
grant update (owner, kind, obtained) on public.document_status to authenticated;

-- program_predictions — INSERT gains `case_id`; `predicted_at` LEAVES the surface (spec §4.7's
-- enumerated list). Nothing writes it — lib/outcomes/repo.ts insertPrediction supplies owner,
-- assessment_id, program_id, verdict, rule_version, score_snapshot — and a client-settable
-- prediction timestamp is a provenance hole on the immutable prediction-of-record.
-- NO UPDATE GRANT, EVER: immutability is the point of 20260620000000.
revoke insert on public.program_predictions from authenticated;
grant insert (id, owner, assessment_id, program_id, verdict, rule_version, score_snapshot,
              supersedes_prediction_id, case_id)
  on public.program_predictions to authenticated;

-- application_attempts — INSERT stays every column, plus `case_id`. Written as an explicit list
-- rather than left flat so a column added later does not silently join the client write surface.
-- No UPDATE grant today and none added: append-only by design.
revoke insert on public.application_attempts from authenticated;
grant insert (id, owner, prediction_id, program_id, institution_id, intake, destination,
              external_ref, created_at, case_id)
  on public.application_attempts to authenticated;

-- outcome_events — same. Corrections are a new row plus `supersedes_event_id`, never an UPDATE.
revoke insert on public.outcome_events from authenticated;
grant insert (id, owner, attempt_id, event_type, gate, reason_code, decision_authority,
              occurred_at, occurred_on, source, verified_by, verified_at, detail,
              supersedes_event_id, recorded_at, case_id)
  on public.outcome_events to authenticated;

-- =====================================================================
-- 8  run the backfill, and report it
-- =====================================================================
-- INERT on a fresh database: no auth.users ⇒ 0 cases, 0 rows updated on all nine. The notice is the
-- rehearsal's primary artifact against real data.
do $$
declare
  v_report jsonb;
begin
  v_report := private.mv155_backfill_personal_cases();
  raise notice 'MV-155 backfill report: %', v_report;
end;
$$;

-- =====================================================================
-- 9  assert the invariant — the LAST statement, so a violation aborts the whole migration
-- =====================================================================
select private.mv155_assert_case_backfill();
