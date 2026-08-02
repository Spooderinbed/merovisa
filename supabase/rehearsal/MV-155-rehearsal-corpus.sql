-- MV-155 — PRODUCTION-SHAPED REHEARSAL CORPUS.
--
-- WHAT THIS IS, AND WHAT IT IS NOT. The card's rehearsal asks for "a restored copy of live data",
-- produced by a founder-gated read-only `supabase db dump` of the hosted project. An agent session
-- holds no production credentials and must not touch the hosted project, so this file is the
-- STAND-IN: a corpus whose per-table row counts and shapes reproduce the live inventory captured on
-- 2026-08-02 in `docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md` §2.9.
--
-- It is NOT a substitute for the real dump and the card's Done evidence says so. It is what makes
-- the rehearsal REPRODUCIBLE: run it, or restore the real dump instead, and the same runner
-- produces the same log. When the founder supplies the dump, restore that in place of this file and
-- re-run `supabase/rehearsal/README.md`'s sequence unchanged.
--
-- LIVE INVENTORY REPRODUCED (§2.9 / §2.1):
--     auth.users                                    9
--     distinct owners across the nine tables        7   (auth.users a strict superset — §A's join)
--     profiles                                      7
--     assessments                                  36   owned, of which 31 have claimed_at
--     assessments with owner IS NULL                 0   live … +1 seeded here, see below
--     plan_items                                   74
--     user_program_state                           12
--     documents                                     6   across 3 users
--     document_status                               0   ← live really is empty; NOT an oversight
--     program_predictions                          10
--     application_attempts                         10
--     outcome_events                               19
--
-- THE ONE DELIBERATE DEPARTURE, AND WHY. Live has ZERO anonymous assessments — MV-135's purge
-- cleared the population, which is transient by design under a 3-day TTL (§9.6). So the rehearsal
-- CANNOT exercise "anonymous rows stay case-less" against live-shaped data: the branch is never
-- entered, and a log reading "0 anonymous rows left case-less" is evidence the branch was never
-- reached, not evidence it works. One synthetic anonymous row is therefore seeded ON TOP of the 36,
-- clearly separated in the counts, so the rehearsal exercises the branch that production cannot.
--
-- SHAPES, not just counts, because a count-only corpus would let a real constraint pass unexercised:
--   * every branch of §A's display_name coalesce chain has a user that lands on it, including the
--     'MeroVisa student' literal (a user with no profile, no metadata and no email);
--   * exactly one is_primary assessment per owner, so `assessments_primary_idx` is loaded;
--   * open plan items with distinct kinds per owner, so `plan_items_kind_open_idx` is loaded;
--   * two Auth users own NOTHING, which is what makes "auth.users is a strict superset" a real
--     condition rather than an identity.
--
-- Run against a stack pinned at 20260730180000 (pre-MV-155). LOCAL ONLY.

begin;

-- =====================================================================
-- auth.users — 9
-- =====================================================================
-- Metadata is deliberately uneven so §A's coalesce chain is exercised end to end:
--   u01 profile name · u02 full_name · u03 name · u04 email · u09 the 'MeroVisa student' literal
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                        email_confirmed_at, created_at, updated_at)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated',
       case when n = 9 then null else 'rehearsal-u' || lpad(n::text, 2, '0') || '@example.test' end,
       '{"provider":"google","providers":["google"]}'::jsonb,
       case
         when n = 2 then '{"full_name":"  Bishal Gurung  "}'::jsonb   -- btrim is load-bearing
         when n = 3 then '{"name":"Chandani Rai"}'::jsonb             -- 'name', not 'full_name'
         when n = 4 then '{}'::jsonb                                  -- falls through to email
         when n = 9 then '{}'::jsonb                                  -- no email either → literal
         else jsonb_build_object('full_name', 'Rehearsal Student ' || n)
       end,
       now(), now() - interval '90 days', now()
from generate_series(1, 9) n;

-- =====================================================================
-- profiles — 7 (u01..u07). u08 and u09 own nothing anywhere.
-- =====================================================================
insert into public.profiles (owner, sections, completeness)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       case
         when n = 1 then '{"personal":{"name":"Aarav Sharma"},"destination":{"country":"australia"}}'::jsonb
         when n = 2 then '{"destination":{"country":"australia"}}'::jsonb   -- no personal.name
         when n = 3 then '{"personal":{"name":"   "}}'::jsonb               -- blank → nullif(btrim)
         when n = 4 then '{"destination":{"country":"australia"}}'::jsonb   -- and no metadata → email
         else jsonb_build_object('personal', jsonb_build_object('name', 'Student ' || n))
       end,
       40 + n
from generate_series(1, 7) n;

-- =====================================================================
-- assessments — 36 owned (31 claimed, exactly one primary per owner) + 1 anonymous
-- =====================================================================
insert into public.assessments (id, owner, result, rule_version, created_at, expires_at, claimed_at,
                                destination_id, is_primary, profile_snapshot)
select ('00000001-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((((n - 1) % 7) + 1)::text, 12, '0'))::uuid,
       jsonb_build_object('verdict', (array['strong','possible','reach'])[1 + (n % 3)]),
       'v0.5.0',
       now() - (n || ' days')::interval,
       now() - (n || ' days')::interval + interval '3 days',
       case when n <= 31 then now() - (n || ' days')::interval else null end,
       'australia',
       n <= 7,                                   -- one primary per owner: n=1..7 → u01..u07
       '{"destination":"australia"}'::jsonb
from generate_series(1, 36) n;

-- The row production has none of. Backdated past MV-135's window so the purge predicate genuinely
-- selects it; `owner` and `claimed_at` both null, which is the only legal anonymous shape.
insert into public.assessments (id, owner, result, rule_version, created_at, expires_at,
                                destination_id, is_primary, profile_snapshot)
values ('00000001-0000-4000-8000-999999999999', null, '{"verdict":"reach"}'::jsonb, 'v0.5.0',
        now() - interval '30 days', now() - interval '27 days', 'australia', false,
        '{"destination":"australia"}'::jsonb);

-- =====================================================================
-- plan_items — 74 (35 open with distinct kinds per owner, 39 closed)
-- =====================================================================
-- The 35 open rows are what load `plan_items_kind_open_idx`; the closed ones deliberately repeat
-- kinds, because the index is partial on `status = 'todo'` and a corpus that never repeats a closed
-- kind would not notice a migration that dropped the predicate.
insert into public.plan_items (owner, kind, impact, title, status, created_at)
select ('00000000-0000-4000-8000-' || lpad(o::text, 12, '0'))::uuid,
       'open-kind-' || k, 'high', 'Open action ' || k, 'todo', now() - (k || ' days')::interval
from generate_series(1, 7) o, generate_series(1, 5) k;

insert into public.plan_items (owner, kind, impact, title, status, completed_at, created_at)
select ('00000000-0000-4000-8000-' || lpad((((n - 1) % 7) + 1)::text, 12, '0'))::uuid,
       'closed-kind-' || (1 + (n % 3)), 'medium', 'Completed action ' || n, 'done',
       now() - interval '5 days', now() - interval '20 days'
from generate_series(1, 39) n;

-- =====================================================================
-- user_program_state — 12 (6 owners × 2 programs)
-- =====================================================================
insert into public.user_program_state (owner, program_id, status, notes)
select ('00000000-0000-4000-8000-' || lpad(o::text, 12, '0'))::uuid,
       p.id, (array['shortlisted','applied'])[1 + (o % 2)], null
from generate_series(1, 6) o,
     lateral (select id from public.programs order by id limit 2) p;

-- =====================================================================
-- documents — 6, across exactly 3 users (2 kinds each). document_status stays EMPTY.
-- =====================================================================
-- The object path convention is `<owner_uuid>/<kind>/<filename>` and Stage 2 does not change it
-- (spec §8): every object created between MV-155 and Stage 4 lands owner-keyed by design.
insert into public.documents (owner, kind, file_path, file_size, original_name)
select o.owner, k.kind, o.owner::text || '/' || k.kind || '/file.pdf', 1024, 'file.pdf'
from (select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid as owner
        from generate_series(1, 3) n) o,
     (select unnest(array['passport','ielts']) as kind) k;

-- =====================================================================
-- program_predictions — 10 (5 owners × 2 programs, against each owner's primary assessment)
-- =====================================================================
insert into public.program_predictions (id, owner, assessment_id, program_id, verdict, rule_version,
                                        score_snapshot, predicted_at)
select ('00000002-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((((i - 1) % 5) + 1)::text, 12, '0'))::uuid,
       ('00000001-0000-4000-8000-' || lpad((((i - 1) % 5) + 1)::text, 12, '0'))::uuid,
       (select id from public.programs order by id offset ((i - 1) / 5) limit 1),
       (array['strong','possible','reach'])[1 + (i % 3)],
       'v0.5.0', jsonb_build_object('total', 40 + i), now() - interval '10 days'
from generate_series(1, 10) i;

-- =====================================================================
-- application_attempts — 10, one per prediction (composite FK on (prediction_id, owner))
-- =====================================================================
insert into public.application_attempts (id, owner, prediction_id, program_id, destination, created_at)
select ('00000003-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       p.owner, p.id, p.program_id, 'AU', now() - interval '9 days'
from generate_series(1, 10) i
join public.program_predictions p on p.id = ('00000002-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;

-- =====================================================================
-- outcome_events — 19, spread over the 10 attempts (composite FK on (attempt_id, owner))
-- =====================================================================
insert into public.outcome_events (id, owner, attempt_id, event_type, gate, source, occurred_at, detail)
select ('00000004-0000-4000-8000-' || lpad(j::text, 12, '0'))::uuid,
       a.owner, a.id,
       case when j <= 10 then 'applied' else 'offer_received' end,
       'admission', 'self_reported', now() - interval '8 days', '{}'::jsonb
from generate_series(1, 19) j
join public.application_attempts a
  on a.id = ('00000003-0000-4000-8000-' || lpad((((j - 1) % 10) + 1)::text, 12, '0'))::uuid;

commit;
