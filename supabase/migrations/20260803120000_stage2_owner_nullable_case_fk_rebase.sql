-- MV-156 — Stage 2 `owner` nullable on the eight NOT NULL tables + the predictions→attempts→
-- outcome_events ownership chain re-based from `unique (id, owner)` onto `unique (id, case_id)`.
--
-- Card:  docs/kanban/cards/MV-156-owner-nullable-composite-fk.md
-- Spec:  docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md  (AUTHORITATIVE)
--          §2.3/§2.4 the real constraint + index set this was transcribed from ·  §3 the invariant ·
--          §4.4/§4.6 the two PRIMARY KEY replacements · §4.7-§4.9 the chain rebase ·
--          §9.4 the two replacement uniques MV-160 must also drop · §10.1 R5 this file's rollback.
-- Plan:  docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md
--          §"Additive migration sequence" step 8 · §"Known schema obstacles" 1 and 3.
--
-- WHY THIS EXISTS: a consultancy case has NO Auth user. While `owner` is NOT NULL on these eight
-- tables, no row can exist for such a case — so Stage 3's exit gate ("create, find, assign and
-- manage a case WITHOUT a student account") is unreachable by construction, not by omission.
--
-- WHAT THIS MIGRATION DOES:
--   1  `unique (id, case_id)` on the three chain tables — the new composite-FK targets
--   2  the two case-side composite FKs, re-basing the chain onto the case
--   3  their covering indexes (the 20260620010000 discipline: every composite FK gets one)
--   4  `<table>_ownership_axis_present` on the three chain tables — the compensating check
--   5  the two PRIMARY KEY replacements (user_program_state, document_status)
--   6  `<table>_ownership_axis_present` on the remaining five
--   7  `alter column owner drop not null` ×8 — LAST, and the ordering is load-bearing
--
-- NOT here, deliberately: no `case_id` column and no backfill (MV-155); no repository, route or
-- lib/** ownership change (MV-157); no claim-path change (MV-158); no RLS POLICY, helper or GRANT
-- added, altered or dropped anywhere (MV-159); no `case_id NOT NULL`, no `_ownership_axis_present`
-- dropped and no legacy owner chain dropped (MV-160); `public.assessments` is NOT TOUCHED — its
-- `owner` has been nullable since 20260603011208 and it is the ninth table, not one of the eight.
-- `private.reject_prediction_update` is NOT touched either: it is MV-155's object, DDL does not fire
-- row-level triggers, and two cards editing one trigger is a merge collision on the highest-
-- consequence object in the schema.
--
-- Conventions inherited from 20260802120000 (MV-155): no `begin;`/`commit;` — `supabase db push`
-- submits the file as ONE multi-statement simple query that Postgres runs as a single IMPLICIT
-- transaction, and an inner `commit` ends it early, leaving a half-applied schema the migration
-- history does not know about. That was MEASURED, not assumed; see supabase/rehearsal/README.md
-- §"Applying MV-155 to production". A plain `set lock_timeout` (not `set local`, which emits a
-- permanent cosmetic 25P01 warning on every apply) with a matching `reset` at the foot.
--
-- `lock_timeout` matters MORE here than it did for MV-155. §5 below adds a column with a VOLATILE
-- default to two student-facing tables, which REWRITES them under ACCESS EXCLUSIVE, and §7 takes the
-- same lock on eight. The work is sub-millisecond at this scale (12 and 0 rows); what the timeout
-- bounds is the WAIT to acquire, behind which every reader of those tables would queue. Failing fast
-- and retrying beats an unbounded stall on the shortlist and the document checklist.
set lock_timeout = '10s';

-- =====================================================================
-- 1  `unique (id, case_id)` — the new composite-FK targets
-- =====================================================================
-- These are REDUNDANT AS UNIQUENESS and that is not a defect: `id` is already the PRIMARY KEY on all
-- three, so `(id, <anything>)` is unique for free. They exist ONLY so a composite FOREIGN KEY can
-- reference them — exactly the role `unique (id, owner)` has played on these same three tables since
-- 20260620000000. A composite FK may only reference a unique constraint, so the target has to exist
-- before the key that points at it (reversed → 42830).
--
-- `outcome_events` gets one too, and nothing currently references it — mirroring
-- `outcome_events_id_owner_key`, which is likewise not the target of any FK today. Spec §4.9 lists it
-- in the table's Stage 2 target shape and §10.1 R5 unwinds "the three `unique (id, case_id)`
-- targets", so three is the settled number. (This card's acceptance criterion names only the two that
-- are actually pointed at; the third is required by the spec and by the rollback, and is reported as
-- a card/spec wording gap rather than resolved silently.)
--
-- Nullable `case_id` is fine in a unique constraint — NULLs are distinct, so the legacy case-less
-- rows cannot collide during the nullable window.
alter table public.program_predictions
  add constraint program_predictions_id_case_id_key unique (id, case_id);
alter table public.application_attempts
  add constraint application_attempts_id_case_id_key unique (id, case_id);
alter table public.outcome_events
  add constraint outcome_events_id_case_id_key unique (id, case_id);

-- =====================================================================
-- 2  the case-side composite FKs — the chain, re-based
-- =====================================================================
-- The invariant 20260620000000 shipped, in its own words: the composite FK "makes it structurally
-- impossible for an attempt's owner to diverge from its prediction's owner (S12) — NO TRIGGER."
-- This re-states that guarantee on the CASE axis, which is the axis Stage 3 will actually have.
--
-- NO `on delete` ACTION, matching the legacy composites exactly. The delete semantics live on the
-- SINGLE-COLUMN FKs (`prediction_id` → predictions ON DELETE CASCADE, `attempt_id` → attempts ON
-- DELETE CASCADE), which SURVIVE this card untouched. A second CASCADE here would be a second,
-- differently-shaped delete path on the same edge.
--
-- READ THIS BEFORE TRUSTING THEM: both are MATCH SIMPLE (the Postgres default, and `confmatchtype
-- = 's'` is verified on the legacy pair in spec §2.3). A multi-column FK under MATCH SIMPLE is
-- satisfied WITHOUT ANY LOOKUP AT ALL when any referencing column is NULL. So for every row whose
-- `case_id` is NULL — which is every row a pre-MV-157 writer produces — these two constraints sit in
-- `pg_constraint` looking healthy and enforce NOTHING. There is no error, no warning, no advisor
-- finding. That hole is covered for the whole window by TWO things, and both are load-bearing:
-- the RETAINED legacy owner chain (§7's note), and §4/§6's `_ownership_axis_present` check. It is
-- closed for good by MV-160's `case_id NOT NULL`. `tests/integration/owner-nullable-rebase.itest.ts`
-- DEMONSTRATES the hole with both covers removed in a rolled-back transaction, rather than asserting
-- on faith that it is there.
alter table public.application_attempts
  add constraint application_attempts_prediction_id_case_id_fkey
  foreign key (prediction_id, case_id) references public.program_predictions (id, case_id);
alter table public.outcome_events
  add constraint outcome_events_attempt_id_case_id_fkey
  foreign key (attempt_id, case_id) references public.application_attempts (id, case_id);

-- =====================================================================
-- 3  covering indexes for the two new composite FKs
-- =====================================================================
-- `20260620010000_index_application_attempts_composite_fk.sql` exists SOLELY because this was missed
-- once already, on this exact chain: an unindexed FK makes the referenced-side DELETE a sequential
-- scan and the performance advisor flags `unindexed_foreign_keys`. One index per new FK, on its exact
-- column pair, mirroring `application_attempts_prediction_id_owner_idx` /
-- `outcome_events_attempt_id_owner_idx`.
create index application_attempts_prediction_id_case_id_idx
  on public.application_attempts (prediction_id, case_id);
create index outcome_events_attempt_id_case_id_idx
  on public.outcome_events (attempt_id, case_id);

-- =====================================================================
-- 4  the compensating check — chain tables
-- =====================================================================
-- IT IS THE DISJUNCT, NOT `check (case_id is not null)`, AND THE DIFFERENCE IS A PRODUCTION OUTAGE.
-- A CHECK is role-independent: `service_role` does NOT bypass it. Every live insert on these three
-- tables today writes `owner` and NO `case_id` (`lib/outcomes/on-apply.ts` captureApplication →
-- insertPrediction/insertAttempt/insertEvent, `lib/outcomes/freeze.ts`, and
-- `app/api/outcomes/{prediction,attempt,event}/route.ts`). `check (case_id is not null)` therefore
-- raises 23514 on every one of them, from the moment this migration applies until MV-157 deploys —
-- a window this card does not control. board.json's MV-156 summary still states that rejected shape;
-- spec §9.5 records it as stale. This is the shape that ships.
--
-- What the disjunct forbids is EXACTLY the one row shape no chain covers — both axes NULL — which is
-- the MATCH SIMPLE hole from §2. An owner-set / case-less row is still structurally enforced by the
-- retained OWNER chain; an owner-null / case-set row by the new CASE chain. Nothing legitimate is
-- refused, and a row owned by nothing — invisible to every RLS policy, reached by no cascade,
-- deletable only by service_role — becomes unrepresentable.
--
-- `not valid` then `validate constraint` is the card's prescribed two-step. Every existing row has
-- `owner` set, so validation cannot fail here; the point is that the end state is a VALIDATED
-- constraint (`convalidated = true`) reached through the idiom that does not hold ACCESS EXCLUSIVE
-- across the verification scan.
--
-- CONSEQUENCE ACCEPTED AND HANDED TO MV-160: because this is not `check (case_id is not null)`,
-- MV-160's `SET NOT NULL` on `case_id` has no matching validated check to skip its verification scan
-- and takes a full one under ACCESS EXCLUSIVE. Negligible at these row counts; already in MV-160's
-- own risk note.
alter table public.program_predictions
  add constraint program_predictions_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.program_predictions validate constraint program_predictions_ownership_axis_present;

alter table public.application_attempts
  add constraint application_attempts_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.application_attempts validate constraint application_attempts_ownership_axis_present;

alter table public.outcome_events
  add constraint outcome_events_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.outcome_events validate constraint outcome_events_ownership_axis_present;

-- =====================================================================
-- 5  the two PRIMARY KEY replacements — the seventh schema obstacle
-- =====================================================================
-- `user_program_state` is `primary key (owner, program_id)` and `document_status` is
-- `primary key (owner, kind)`. A PRIMARY KEY column is NOT NULL by definition, so
-- `alter column owner drop not null` FAILS on both — this is a key replacement, not a constraint
-- relaxation. It is the obstacle the plan's original six do not name (spec §4.4/§4.6, MV-154's risk
-- table). Verified against pg_constraint at build time: NOTHING references either primary key, so the
-- swap re-points no foreign key. (Confirmed again by the itest, not assumed.)
--
-- Dropping the PK does NOT clear `attnotnull` on its columns — measured on this stack, PostgreSQL
-- 17.6: after `drop constraint … _pkey`, `owner` still reads `attnotnull = true`. §7's explicit
-- `drop not null` is therefore required, not belt-and-braces.
--
-- ---------------------------------------------------------------------------------------------
-- THE REPLACEMENT UNIQUE IS **FULL**, NOT `where owner is not null`. THIS IS A CORRECTION TO THE
-- CARD AND TO SPEC §4.4/§4.6, AND IT WAS FOUND BY MEASUREMENT. It is the same failure the spec
-- already records as §4 rule 1 for the case-keyed indexes, arriving on the OWNER axis instead.
--
--   Postgres infers a PARTIAL unique index as an `ON CONFLICT` arbiter only when the statement
--   itself supplies the index predicate. PostgREST's `on_conflict=` emits a BARE COLUMN LIST. Both
--   of these tables are upsert targets of code that is LIVE RIGHT NOW and that MV-157 has not yet
--   re-pointed:
--       lib/documents/status-repo.ts:36  setObtained        onConflict: "owner,kind"
--       lib/matches/repo.ts:28           upsertProgramState onConflict: "owner,program_id"
--   `app/api/documents/status/route.ts` drives the first on the AUTHENTICATED client today. With a
--   partial replacement index there is no inferrable arbiter, and both raise **42P10** — "there is
--   no unique or exclusion constraint matching the ON CONFLICT specification" — at RUNTIME, on a
--   live request, for the entire MV-156 → MV-157 window. Measured on this project's own Postgres in
--   a rolled-back transaction: partial → 42P10; full → both the INSERT and the DO UPDATE branch
--   succeed.
--
--   THE PREDICATE WAS NEVER LOAD-BEARING. **NULLs are distinct in a unique index**, so a FULL unique
--   on the nullable pair already permits unlimited NULL-owner rows — which is the entire reason the
--   predicate was proposed. Both of the card's stated verifications hold unchanged and both are
--   pinned in the itest: a duplicate `(owner, program_id)` / `(owner, kind)` for a NON-NULL owner
--   still raises 23505, and two NULL-owner rows sharing the other key column are both accepted.
--
--   The rule this follows is the spec's own, generalised: a unique index that any live `ON CONFLICT`
--   can name MUST be full. MV-160 drops both of these regardless (spec §9.4).
-- ---------------------------------------------------------------------------------------------
--
-- `gen_random_uuid()` is VOLATILE, so ADD COLUMN rewrites the table rather than taking the PG11
-- fast path. That is the one place this migration writes existing rows, and it is confined to these
-- two tables — the acceptance criterion's "inert for existing rows apart from the two surrogate-key
-- additions". DDL does not fire row-level triggers, so neither `user_program_state_set_updated_at`
-- nor `user_program_state_derive_case_id` runs: `updated_at` and `case_id` are carried through
-- untouched. The rehearsal asserts that with an md5 fingerprint rather than trusting it.

-- 5a  user_program_state
alter table public.user_program_state add column id uuid not null default gen_random_uuid();
alter table public.user_program_state drop constraint user_program_state_pkey;
alter table public.user_program_state add constraint user_program_state_pkey primary key (id);
create unique index user_program_state_owner_program_idx
  on public.user_program_state (owner, program_id);

-- 5b  document_status  (0 rows in production — spec §2.1; the rewrite is trivially safe here)
alter table public.document_status add column id uuid not null default gen_random_uuid();
alter table public.document_status drop constraint document_status_pkey;
alter table public.document_status add constraint document_status_pkey primary key (id);
create unique index document_status_owner_kind_idx
  on public.document_status (owner, kind);

-- =====================================================================
-- 6  the compensating check — the remaining five
-- =====================================================================
-- The plan asks for a compensating check only on the three chain tables. It goes on all eight
-- because relaxing `owner` on the other five newly permits the same both-axes-null row there, with
-- the same consequences and no chain to catch it. One shape across all eight also gives MV-160 a
-- single family to drop by name instead of a judgement call.
--
-- `public.assessments` is deliberately NOT in this family. An unclaimed anonymous assessment is
-- `owner IS NULL AND case_id IS NULL` BY DESIGN — it is what an anonymous assessment IS — so this
-- disjunct would reject the shape MV-135's 3-day purge exists to collect. Spec §4.2 covers that
-- table with `check (case_id is not null or (owner is null and claimed_at is null))` at MV-160
-- instead. Eight, never nine.
alter table public.profiles
  add constraint profiles_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.profiles validate constraint profiles_ownership_axis_present;

alter table public.plan_items
  add constraint plan_items_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.plan_items validate constraint plan_items_ownership_axis_present;

alter table public.user_program_state
  add constraint user_program_state_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.user_program_state validate constraint user_program_state_ownership_axis_present;

alter table public.documents
  add constraint documents_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.documents validate constraint documents_ownership_axis_present;

alter table public.document_status
  add constraint document_status_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.document_status validate constraint document_status_ownership_axis_present;

-- =====================================================================
-- 7  owner → NULLABLE on the eight — LAST, and the ordering is the point
-- =====================================================================
-- Everything above runs FIRST so there is no instant — not even mid-apply on a run that later fails
-- — in which `owner` is nullable and the case chain or the compensating checks are absent. The
-- plan's "keep the nullable window short" is satisfied twice over: the intra-migration window is
-- ZERO, and the stage-level window (MV-155 → MV-160) is covered on day one by the retained owner
-- chain plus the validated disjunct, leaving no row uncovered by SOME chain.
--
-- THE LEGACY OWNER CHAIN IS RETAINED, NOT DROPPED, AND IT IS LOAD-BEARING RATHER THAN VESTIGIAL.
-- `unique (id, owner)` ×3 and the `(prediction_id, owner)` / `(attempt_id, owner)` FKs all survive
-- this card. Both chains are MATCH SIMPLE and each enforces exactly on the rows where its own column
-- is non-null, so together they cover every row: the case chain bites once `case_id` is set, and
-- until then the owner chain is the ONLY thing holding the 39 existing chain rows together. A hard
-- swap was considered and rejected — it would have removed enforcement from every legacy row for the
-- whole MV-156 → MV-160 window while buying nothing. MV-160 drops the owner chain, AFTER
-- `case_id NOT NULL`, and not before.
--
-- WHAT THIS DOES NOT DO IS OPEN A READ HOLE — it closes access, which is correct and will look like
-- a bug. Every policy on these tables is `(select auth.uid()) = owner`; against a NULL owner that
-- predicate is NULL, so a NULL-owner row is invisible to every authenticated client and unwritable
-- by them. Consultancy rows are unreadable BY THE COUNSELLOR WHO SHOULD SEE THEM until MV-159 lands.
-- That is the intended fail-closed interim posture. Do NOT add a policy here to make Stage 3
-- demoable: it would be written against no canonical matrix cell, which is the parallel-derivation
-- failure `2026-08-02-stage1-canonical-access-matrix.md` exists to prevent.
--
-- Cascade coverage shrinks PERMANENTLY as a result: `owner … on delete cascade` cleans up nothing
-- for a NULL-owner row. That is the desired semantics — deleting a student's Auth account must not
-- delete a consultancy case's data — but MV-05's right-to-delete and Stage 6's case deletion can no
-- longer use the Auth cascade as their sweep. Recorded, not solved here.
--
-- One statement each, in the order the acceptance criteria list them.
alter table public.profiles             alter column owner drop not null;
alter table public.plan_items           alter column owner drop not null;
alter table public.user_program_state   alter column owner drop not null;
alter table public.documents            alter column owner drop not null;
alter table public.document_status      alter column owner drop not null;
alter table public.program_predictions  alter column owner drop not null;
alter table public.application_attempts alter column owner drop not null;
alter table public.outcome_events       alter column owner drop not null;

-- =====================================================================
-- HAND-OFF TO MV-160 — the exact names to drop, IN DROP ORDER
-- =====================================================================
-- Dependencies make this order mandatory, not stylistic. Reversed, Postgres refuses with 2BP01.
--
--  (a) AFTER `case_id` is NOT NULL on the eight — all eight compensating checks. None survives into
--      Stage 3: once `case_id` is NOT NULL the right branch of the disjunct is unconditionally true,
--      and a check that can never fire again is not a safeguard, it is a constraint the next author
--      reads as load-bearing and designs around.
--          profiles_ownership_axis_present
--          plan_items_ownership_axis_present
--          user_program_state_ownership_axis_present
--          documents_ownership_axis_present
--          document_status_ownership_axis_present
--          program_predictions_ownership_axis_present
--          application_attempts_ownership_axis_present
--          outcome_events_ownership_axis_present
--
--  (b) the two legacy composite FKs — BEFORE the unique targets they depend on:
--          application_attempts_prediction_id_owner_fkey
--          outcome_events_attempt_id_owner_fkey
--
--  (c) then, and only then, the three legacy `unique (id, owner)` targets:
--          program_predictions_id_owner_key
--          application_attempts_id_owner_key
--          outcome_events_id_owner_key
--
--  (d) then the now-orphaned covering indexes for the FKs dropped in (b):
--          application_attempts_prediction_id_owner_idx
--          outcome_events_attempt_id_owner_idx
--
--  (e) the four legacy owner-keyed uniqueness rules named in MV-160 §D:
--          profiles_owner_key · assessments_primary_idx · plan_items_kind_open_idx ·
--          documents_owner_kind_key
--      PLUS the one spec §9.3 found MISSING from that list but present in the database:
--          program_predictions_owner_assessment_id_program_id_rule_ver_key
--      PLUS the two THIS CARD created, which spec §9.4 requires MV-160 to add to its drop list —
--      they are superseded by MV-155's `unique (case_id, program_id)` / `unique (case_id, kind)`
--      once `case_id` is NOT NULL:
--          user_program_state_owner_program_idx
--          document_status_owner_kind_idx
--
-- MV-160 also restores the unconditional `private.reject_prediction_update()` body (MV-155's
-- hand-off, not this card's) and re-creates MV-159's policies with the transitional owner disjunct
-- removed, as step (d) of its own migration.
--
-- NOT dropped by MV-160, and named here so it is not swept up: the two SINGLE-COLUMN FKs
-- `application_attempts_prediction_id_fkey` and `outcome_events_attempt_id_fkey` carry the ON DELETE
-- CASCADE semantics the composites never had, and the surrogate `id` primary keys and the case-side
-- objects §1-§3 created are the permanent shape.

-- Release the bound set at the head of the file so it cannot leak into a later migration applied on
-- the same connection. Last line, so it never runs on a failed apply.
reset lock_timeout;
