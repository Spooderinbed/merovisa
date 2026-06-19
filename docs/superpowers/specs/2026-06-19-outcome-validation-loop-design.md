# Outcome-validation loop ("the moat") — design & schema

**Card:** MV-08 · **Status:** design only (no shipping code) · **Date:** 2026-06-19
**Owner:** agent · **Gate to build:** founder approval of the proposed migration + traffic.

> This document is a **build spec**, not an implementation. It defines the data model,
> RLS, API contracts, capture UX, calibration method, and cold-start plan for the
> outcome-validation loop. **Nothing here ships until (a) the founder approves the
> migration — prod DB changes need approval — and (b) real traffic exists** (the loop
> is useless with zero resolved outcomes; see §9 cold-start).

---

## 1. Why this exists — the moat

Today the app validates scoring **sensitivity** (golden tests prove inputs move the
verdict), never real-world **correctness**. A competing consultancy can clone our
questionnaire and scrape the same official sources — the *inputs* are public. The one
asset they cannot copy is **the resolved-outcome distribution of our own users**: did the
student who got a "Strong" verdict actually get an offer? A visa?

The defensible moat is a **verdict-validation / outcome feedback loop** that captures the
real funnel — **applied → offer → refused → visa outcome** — and links each real outcome
back to the **prediction we showed** (verdict + RULE_VERSION + scoreSnapshot). Over time
this lets us answer "do our bands predict reality, and where are they wrong?" — a
proprietary calibration signal, plus an honest-copy obligation (§11).

Until this loop has data, **"real chances" is an honest rules-based estimate from official
criteria, not an outcome-backed probability** — the copy must say so (§11).

---

## 2. The two-gate insight (drives the schema)

Our verdict bands a single ordinal value (Strong / Possible / Reach), but a real student
passes **two independent gates**, each validating a *different half* of our model:

1. **Admission gate** — the institution's offer/reject decision. Validates the
   academic/program-fit half of the verdict (`gradeGap`, `englishGap`, `bandGap`,
   `tuitionGap`).
2. **Visa gate** — the DHA subclass-500 grant/refuse decision. Validates the
   Genuine-Student / financial-capacity / immigration-risk half (the GS panel, financial
   thresholds, refusal history).

A "Strong" verdict that yields an offer but a **visa refusal** is a calibration miss on
the visa side, not the admission side. **The schema must record both outcomes separately**
so each half calibrates independently. A single "did it work out" flag would conflate the
two and waste the signal.

---

## 3. What already exists (reuse, don't duplicate)

- **`public.user_program_state`** (live, 5 rows) already tracks per-user per-program
  product state: `status in ('shortlisted','applied','withdrawn')`, keyed `(owner,
  program_id)`. **The funnel's entry point already exists** — but it is *mutable
  current-state*, has no assessment link, no frozen verdict, no offer/visa stages, no
  per-transition timestamps, and no provenance. It answers "what's on my shortlist," not
  "what did we predict and what happened."
- **The verdict + snapshot** are computed server-side per (assessment, program):
  `verdict ∈ {strong, possible, reach}`, `RULE_VERSION` (currently `"v0.5.0"`,
  `lib/scoring/engine.ts:19`), and `scoreSnapshot = { gradeGap, englishGap, bandGap,
  tuitionGap }` (`lib/matches/types.ts`). These are **not persisted per program today** —
  they are recomputed on read.

**Design decision:** `user_program_state` stays the product's "my shortlist" surface. The
moat adds a thin **validation layer** beside it. The existing `status → 'applied'`
transition becomes the **trigger that freezes a prediction** (§4) — reusing the UX the
user already has, rather than adding a parallel "I applied" control.

---

## 4. Data model (two new tables)

Mirrors the established migration conventions
(`20260604002139_add_programs_universities_state.sql`): `owner uuid → auth.users on delete
cascade`, `program_id text → programs(id)` (programs PK is `text`), `(select auth.uid())`
per-statement RLS, `force` RLS, explicit `revoke`/`grant`, `private.set_updated_at()`
trigger with pinned `search_path`.

### 4.1 `program_predictions` — immutable verdict snapshot ("what we predicted")

One row per (owner, assessment, program), frozen at the moment the user commits to a
program (status → `applied`). Immutable so a later `RULE_VERSION` change never rewrites
history — a new assessment produces a new `assessment_id` and thus a new prediction row.

```sql
create table public.program_predictions (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null references auth.users(id)      on delete cascade,
  assessment_id   uuid not null references public.assessments(id) on delete cascade,
  program_id      text not null references public.programs(id) on delete cascade,
  verdict         text not null check (verdict in ('strong','possible','reach')),
  rule_version    text not null,            -- RULE_VERSION at snapshot time, e.g. 'v0.5.0'
  score_snapshot  jsonb not null,           -- { gradeGap, englishGap, bandGap, tuitionGap }
  predicted_at    timestamptz not null default now(),
  unique (owner, assessment_id, program_id) -- one frozen prediction per program per assessment
);
create index program_predictions_owner_idx         on public.program_predictions (owner);
create index program_predictions_assessment_id_idx on public.program_predictions (assessment_id);
create index program_predictions_program_id_idx    on public.program_predictions (program_id);
```

> **Confirm before building:** `assessments.id` type — written here as `uuid` per the
> Supabase default; verify against the live schema (`20260603011208_init_*`) and match it.

**Immutable on purpose:** SELECT + INSERT policies only, **no UPDATE policy**. The verdict
is the prediction-of-record; it must not drift.

### 4.2 `outcome_events` — append-only funnel log ("what actually happened")

One row per observed real-world event, append-only. The current funnel stage is *derived*
as the latest non-superseded event; we never overwrite a claimed outcome (trust-first +
audit). Append-only also gives time-to-offer / time-to-visa for free.

```sql
create table public.outcome_events (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users(id) on delete cascade,
  prediction_id uuid not null references public.program_predictions(id) on delete cascade,
  event_type    text not null check (event_type in (
                  'applied','offer_received','conditional_offer','application_rejected',
                  'offer_accepted','coe_issued','visa_lodged','visa_granted','visa_refused',
                  'enrolled','withdrawn')),
  occurred_on   date not null,           -- user-reported DATE of the event (no false time precision; PII-minimal)
  source        text not null default 'self_reported'
                  check (source in ('self_reported','document_verified','official_verified')),
  detail        jsonb not null default '{}',  -- structured, Zod-validated: refusal reason code, offer conditions, etc.
  superseded    boolean not null default false, -- a user correction marks the prior event superseded; we don't hard-delete
  recorded_at   timestamptz not null default now()
);
create index outcome_events_prediction_id_idx on public.outcome_events (prediction_id);
create index outcome_events_owner_idx         on public.outcome_events (owner);
```

`event_type` spans both gates of §2: admission (`offer_received` / `conditional_offer` /
`application_rejected`), commitment (`offer_accepted` / `coe_issued`), and visa
(`visa_lodged` / `visa_granted` / `visa_refused`), plus terminal `enrolled` / `withdrawn`.
`owner` is denormalized (must equal `prediction.owner`) so RLS is a cheap column check; the
API enforces the match on insert.

### 4.3 RLS, grants, migration

```sql
alter table public.program_predictions enable row level security;
alter table public.program_predictions force  row level security;
alter table public.outcome_events       enable row level security;
alter table public.outcome_events       force  row level security;

-- program_predictions: owner-scoped, INSERT + SELECT only (immutable; no UPDATE policy)
create policy pp_select_own on public.program_predictions
  for select to authenticated using ((select auth.uid()) = owner);
create policy pp_insert_own on public.program_predictions
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy pp_delete_own on public.program_predictions
  for delete to authenticated using ((select auth.uid()) = owner); -- right-to-delete (MV-05)

-- outcome_events: owner-scoped; UPDATE limited to flipping `superseded`
create policy oe_select_own on public.outcome_events
  for select to authenticated using ((select auth.uid()) = owner);
create policy oe_insert_own on public.outcome_events
  for insert to authenticated
  with check (
    (select auth.uid()) = owner
    and exists (select 1 from public.program_predictions p
                where p.id = prediction_id and p.owner = (select auth.uid()))
  );
create policy oe_update_own on public.outcome_events
  for update to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy oe_delete_own on public.outcome_events
  for delete to authenticated using ((select auth.uid()) = owner);

revoke all on public.program_predictions from anon, authenticated;
revoke all on public.outcome_events       from anon, authenticated;
grant select, insert, delete         on public.program_predictions to authenticated;
grant select, insert, update, delete on public.outcome_events       to authenticated;
```

- **Writes go through API routes (service-role admin client)**, per the architecture rule;
  the owner policies above also permit the user to **read** their own funnel for the
  dashboard.
- **Right-to-delete (MV-05):** all rows cascade on `auth.users` delete; `_delete` policies
  let the account-delete path remove them. No new orphan risk.
- **No `updated_at` trigger** on either table — `program_predictions` is immutable and
  `outcome_events` is append-only (`recorded_at` is set once). If a future column needs it,
  reuse the hardened `private.set_updated_at()`.
- **Advisor-clean from day one:** every FK above is indexed (the exact class the
  2026-06-18 audit flagged); RLS uses `(select auth.uid())` (no per-row re-eval).
- **Migration:** ship as `supabase/migrations/<ts>_add_outcome_validation.sql`. **Founder
  reviews and applies** (prod DB approval). Re-run `get_advisors` after apply; expect zero
  new findings.

---

## 5. API surface (server-side, Zod-validated)

Three endpoints; all Zod-validated, all reading `owner` from the session (never the body),
no sensitive data in URLs/query params.

| Route | Method | Purpose |
|---|---|---|
| `/api/outcomes/prediction` | POST | **Freeze a prediction** for (assessment, program). Idempotent on `(owner, assessment_id, program_id)` — insert-once, return existing on conflict. |
| `/api/outcomes/event` | POST | **Append an outcome event** `{ prediction_id, event_type, occurred_on, detail }`. Server stamps `owner`, `source='self_reported'`, `recorded_at`. |
| `/api/outcomes` | GET | The user's own funnel (predictions + events) for the dashboard. |

**F16 (never expose scoring rules to the client):** `/api/outcomes/prediction` **recomputes
the verdict server-side** from the assessment + program via the scoring engine and stores
that — it must **never trust a client-supplied verdict/snapshot**. The client only names
the program it's committing to.

**Calibration is not a public endpoint.** It runs offline / admin via the service-role
client (a script or cron), so no scoring rule or aggregate is exposed in client JS (§8).

---

## 6. Capture UX (the loop only closes if we ask)

- **Snapshot trigger:** when a signed-in user moves a program to `applied` (existing
  `user_program_state` control), the app calls `/api/outcomes/prediction` to freeze the
  live verdict. No new UI — the existing transition becomes the capture point.
- **Status updates:** a lightweight, **always-optional** "Update your status" affordance per
  applied program on the dashboard/matches — "Heard back? (Offer / Conditional / Rejected)",
  then later "Visa decision? (Granted / Refused)". Each tap appends an `outcome_events` row.
  Never blocks, never gates content.
- **Nudges (later phase):** the 3-day assessment-expiry email and post-intake reminders are
  the natural harvest points. Out of scope for this slice; noted so the build phase wires
  capture, not just storage.

---

## 7. Calibration method

We never show users percentages (standing decision), so calibration validates **ordinal
behavior**, not calibrated probabilities:

1. **Separation + monotonicity.** Within a single `rule_version`, the observed offer-rate
   (and, separately, visa-grant-rate) must be **monotone in band**: Strong ≥ Possible ≥
   Reach. If the ordering collapses or inverts, the rules are miscalibrated — that's the
   alarm.
2. **Per-gate (§2).** Compute admission separation from `offer_received`/`conditional_offer`
   vs `application_rejected`; compute visa separation from `visa_granted` vs `visa_refused`.
   Report them independently.
3. **Windowed by `rule_version`.** Never pool outcomes across rule versions — a rules change
   resets the calibration window. (Ties to the recalibration-epoch design,
   `2026-06-07-phase-b-recalibration-epoch-design.md`.)
4. **Minimum-sample gate.** Define a threshold (proposed: **≥ 30 resolved outcomes per band
   per gate per rule_version**) below which calibration is reported as **"insufficient
   data,"** never as signal. This is the cold-start guard (§9) made explicit.

Output: an internal calibration report (not user-facing in v1) — per (rule_version, gate,
band): n, resolved-n, observed rate, monotonicity verdict.

---

## 8. Cold-start plan (this is why it's design-only today)

The loop is **worthless with zero resolved outcomes** and cannot be tested for correctness
until students complete real funnels (months after launch). Therefore:

- **Phase 0 (now):** this design + the approved migration. **Storage exists, calibration
  sleeps.** No calibration claim is computed or shown.
- **Phase 1 (first traffic):** wire the snapshot trigger (§6) + the optional status updates.
  Accumulate `self_reported` events. Calibration still reports "insufficient data" until the
  §7.4 threshold.
- **Phase 2 (threshold reached):** turn on the internal calibration report; review
  monotonicity per gate; feed misses back into the rules (a proper recalibration epoch).
- **Phase 3 (trust layer):** the **verification ladder** — upgrade `source` from
  `self_reported` to `document_verified` (offer letter / CoE / visa-grant notice uploaded
  via the existing Storage path) and eventually `official_verified`. Calibration can then
  weight or filter by `source` to resist gaming.

---

## 9. Known limitations (document them, don't pretend they're solved)

- **Selection / survivorship bias.** Students with good outcomes self-report more. Mitigation:
  prompt *all* applied users, track non-response as its own signal, and caveat every
  calibration figure. This bias is why early calibration is *directional*, not authoritative.
- **Self-report integrity / gaming.** v1 trusts the user. The `source` ladder (§8 Phase 3)
  is the answer; until then, down-weight or simply label calibration as self-reported.
- **Small-n corridors.** Nepal→Australia is one corridor; per-band n grows slowly. The §7.4
  gate prevents over-claiming on thin data.
- **Two-sided attribution.** A refusal can be the student's (missing funds) or our model's
  (wrong band). The per-gate split (§2) localizes it but can't fully disentangle it from n
  alone — `detail` (e.g., refusal reason code) helps.

---

## 10. Honest-copy implications

- **Until calibration passes §7,** verdict copy must stay an **estimate from official
  criteria**, not an outcome-backed probability. This reinforces the existing
  `VerdictDisclaimer` (MV-05) and the data-freshness degradation (MV-04) — same honesty
  posture. **Never show percentages** (standing decision).
- **After** calibration is monotone and past threshold, copy *may* strengthen to language
  like "consistent with outcomes from N students on the same corridor" — but only then, and
  still banded, never a percentage.

---

## 11. Scope — what this slice does and does NOT do

**Does (this slice):** produce this design + the proposed migration SQL + Zod/API contracts
as a build spec; bridge to the existing `applied` transition; define calibration and the
cold-start ladder.

**Does NOT (deferred to the build phase, after founder approval + traffic):**
- No shipping code, no live tables until the founder applies the migration.
- No verification layer, no email nudges, no admin calibration dashboard.
- No change to the scoring engine or goldens.
- No user-facing calibration claim (sleeps until §7.4 threshold).

---

## 12. Acceptance criteria for the eventual build (not this slice)

- [ ] Migration applied by founder; `get_advisors` returns **zero new** findings (FKs
      indexed, RLS uses `(select auth.uid())`, force RLS on both tables).
- [ ] `applied` transition freezes a prediction; verdict is **recomputed server-side**
      (F16), never taken from the client. TDD: failing test first.
- [ ] `outcome_events` is append-only; a correction marks `superseded`, never overwrites.
- [ ] RLS proven: user A cannot read/insert against user B's prediction (insert policy's
      `exists` check holds).
- [ ] Account-delete (MV-05) cascades both tables to zero rows for that owner.
- [ ] Calibration report computes per (rule_version, gate, band) and returns "insufficient
      data" below the §7.4 threshold; nothing user-facing.
- [ ] Zod validates every endpoint; no verdict/snapshot/sensitive field in URLs or query
      params or client logs.

---

## 13. Open questions for the founder (gate to build)

1. **Migration approval** — apply the two-table migration now (storage ahead of traffic), or
   wait until launch is closer? (Recommend: apply now — it's inert, advisor-clean, and lets
   capture wire in the moment traffic starts.)
2. **Minimum-sample threshold** (§7.4) — is **30 per band/gate/rule_version** the right bar
   for a first honest calibration claim, or higher?
3. **Verification priority** (§8 Phase 3) — is document-verified outcome capture (offer
   letter / visa notice upload) a near-term trust feature or a much-later one?
4. **Capture aggressiveness** (§6) — how hard do we nudge for outcomes (email harvest) vs.
   keep it purely passive? Trades data volume against perceived pressure on students.
