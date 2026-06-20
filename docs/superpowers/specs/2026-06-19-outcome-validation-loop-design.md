# Outcome-validation loop ("the moat") — design & schema

**Card:** MV-08 · **Status:** design only (no shipping code) · **Date:** 2026-06-19
**Owner:** agent · **Gate to build:** founder approval of the proposed migration + traffic.

> This document is a **build spec**, not an implementation. It defines the data model,
> RLS, API contracts, capture UX, calibration method, and cold-start plan for the
> outcome-validation loop. **Nothing here ships until (a) the founder approves the
> migration — prod DB changes need approval — and (b) real traffic exists** (the loop
> is useless with zero resolved outcomes; see §8 cold-start).

> **Codex adversarial review folded in (2026-06-19).** A refute-each-decision pass over
> the first draft confirmed the direction (immutable predictions, separate admission/visa
> calibration, bands-never-percentages) but found three structural defects that are
> near-free to fix in design and brutal to retrofit once outcome data exists. All three
> are now in the schema below:
> - **B1 — attribution.** A flat event log can't prove an offer/CoE/visa belongs to the
>   *matched* program; students apply to several programs/institutions/intakes. A new
>   **`application_attempts`** entity sits between prediction and event (§4.2).
> - **B2 — verification.** Self-reported labels can be fabricated, so they must not train
>   calibration. `outcome_events` carries **verification metadata** and calibration
>   **excludes `self_reported`** (§4.3, §7).
> - **B3 — two-gate in the data.** A bare `visa_refused` doesn't say *which* sub-factor it
>   falsifies. Events now carry an explicit **`gate`** + normalized **`reason_code`** +
>   decision authority (§4.3).
>
> The lighter should-fixes (S4–S12) are folded into §4 and §7 inline.

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
proprietary calibration signal, plus an honest-copy obligation (§10).

Until this loop has data, **"real chances" is an honest rules-based estimate from official
criteria, not an outcome-backed probability** — the copy must say so (§10).

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
the visa side, not the admission side. **The schema records both outcomes separately**, and
**every event is tagged with its `gate`** (§4.3) so each half calibrates independently. A
single "did it work out" flag would conflate the two and waste the signal. Going further, a
refusal carries a normalized **`reason_code`** so a visa miss localizes to *which* sub-factor
failed (GS intent vs financial vs documents) — without it, `visa_refused` can't tell us
which half of the verdict to recalibrate.

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
transition becomes the **trigger that opens an application attempt and freezes a
prediction** (§4) — reusing the UX the user already has, rather than adding a parallel "I
applied" control. The real application carries institution + intake granularity that
`user_program_state` does not (§4.2), which is why the attempt is its own entity, not a
column on the shortlist.

---

## 4. Data model (three new tables)

Mirrors the established migration conventions
(`20260604002139_add_programs_universities_state.sql`): `owner uuid → auth.users on delete
cascade`, `program_id text → programs(id)` (programs PK is `text`), `(select auth.uid())`
per-statement RLS, `force` RLS, explicit `revoke`/`grant`, every FK indexed.

The chain is **prediction → attempt → event**:

- **`program_predictions`** — what we predicted (immutable snapshot).
- **`application_attempts`** — what the student actually applied to (institution, program,
  intake), and which prediction it resolves. *(B1 — the attribution layer.)*
- **`outcome_events`** — what happened to that attempt (append-only funnel log).

### 4.1 `program_predictions` — immutable verdict snapshot ("what we predicted")

Frozen when the user commits to a program (status → `applied`). Immutable so a later
`RULE_VERSION` change never rewrites history.

**S5 — model prediction *runs*, not one row per program.** The first draft's
`unique (owner, assessment_id, program_id)` blocked ever re-predicting the same program
under a new rule version, destroying drift history. We instead key on `rule_version` too and
keep a `supersedes_prediction_id` lineage pointer; the **"current" prediction is derived** as
the latest non-superseded run per (owner, assessment_id, program_id).

```sql
create table public.program_predictions (
  id                       uuid primary key default gen_random_uuid(),
  owner                    uuid not null references auth.users(id)      on delete cascade,
  assessment_id            uuid not null references public.assessments(id) on delete cascade,
  program_id               text not null references public.programs(id) on delete cascade,
  verdict                  text not null check (verdict in ('strong','possible','reach')),
  rule_version             text not null,            -- RULE_VERSION at snapshot time, e.g. 'v0.5.0'
  score_snapshot           jsonb not null,           -- { gradeGap, englishGap, bandGap, tuitionGap }
  supersedes_prediction_id uuid references public.program_predictions(id) on delete set null,
  predicted_at             timestamptz not null default now(),
  unique (owner, assessment_id, program_id, rule_version), -- one frozen run per rule version
  unique (id, owner)                                       -- composite-FK target (S12)
);
create index program_predictions_owner_idx         on public.program_predictions (owner);
create index program_predictions_assessment_id_idx on public.program_predictions (assessment_id);
create index program_predictions_program_id_idx    on public.program_predictions (program_id);
create index program_predictions_supersedes_idx    on public.program_predictions (supersedes_prediction_id);
```

> **Confirm before building:** `assessments.id` type — written here as `uuid` per the
> Supabase default; verify against the live schema (`20260603011208_init_*`) and match it.

**Immutable on purpose — and enforced (S4).** "No UPDATE policy" is *not* immutability: a
service-role client (which the API uses, per the architecture rule) bypasses RLS entirely. So
immutability is enforced at the **table level**, role-independent, by a `BEFORE UPDATE` guard
trigger that raises:

```sql
create function private.reject_prediction_update() returns trigger
  language plpgsql set search_path = '' as $$
begin
  raise exception 'program_predictions is immutable (no UPDATE permitted)';
end $$;
create trigger program_predictions_no_update
  before update on public.program_predictions
  for each row execute function private.reject_prediction_update();
```

`DELETE` is *not* blocked — right-to-delete (MV-05) must cascade. Any UPDATE attempt (even
via service-role, even a bug) fails loudly rather than silently rewriting a prediction-of-record.

### 4.2 `application_attempts` — the attribution layer ("what the student applied to")

**B1 — the blocker that's hardest to retrofit.** An offer letter, CoE, or visa decision must
attach to the *specific* program/institution/intake the student applied to, not float against
a flat event log. Students apply to several programs across institutions and intakes; a visa is
issued against one CoE at one provider. Without this entity there is no way to attribute an
outcome to the matched program after the fact — and no clean way to add it once historical rows
exist. One row per real application; it names which prediction it resolves.

```sql
create table public.application_attempts (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null references auth.users(id) on delete cascade,
  prediction_id   uuid not null references public.program_predictions(id) on delete cascade,
  program_id      text not null references public.programs(id) on delete cascade, -- program actually applied to
  institution_id  text,        -- CRICOS provider / university applied to; offer/CoE/visa attach here
  intake          text,        -- e.g. '2027-02' — disambiguates re-applications across intakes
  destination     text not null default 'AU',  -- destination-country dimension (MVP: AU; source country is on the assessment)
  external_ref    text,        -- optional student-supplied application/offer/CoE reference
  created_at      timestamptz not null default now(),
  unique (id, owner),                                                      -- composite-FK target (S12)
  foreign key (prediction_id, owner)
    references public.program_predictions (id, owner)                      -- owner can't diverge from the prediction (S12)
);
create index application_attempts_owner_idx         on public.application_attempts (owner);
create index application_attempts_prediction_id_idx on public.application_attempts (prediction_id);
create index application_attempts_program_id_idx    on public.application_attempts (program_id);
```

The composite FK `(prediction_id, owner) → program_predictions(id, owner)` makes it
**structurally impossible** for an attempt's `owner` to differ from its prediction's owner
(S12) — no trigger needed.

### 4.3 `outcome_events` — append-only funnel log ("what actually happened")

One row per observed event, append-only. The current funnel stage is *derived* as the latest
non-superseded event for the attempt; we never overwrite a claimed outcome (trust-first +
audit). Append-only also yields time-to-offer / time-to-visa for free.

This table carries the **B2** (verification) and **B3** (gate + reason) columns, plus the
should-fix corrections S6 (lineage pointer) and S8 (timestamp precision).

```sql
create table public.outcome_events (
  id                 uuid primary key default gen_random_uuid(),
  owner              uuid not null references auth.users(id) on delete cascade,
  attempt_id         uuid not null references public.application_attempts(id) on delete cascade,
  event_type         text not null check (event_type in (
                       'applied','offer_received','conditional_offer','application_rejected',
                       'offer_accepted','coe_issued','visa_lodged','visa_granted','visa_refused',
                       'enrolled','withdrawn')),
  -- B3: which gate this event validates + why + who decided
  gate               text check (gate in ('admission','visa')),  -- null for neutral steps (offer_accepted/coe_issued/enrolled/withdrawn)
  reason_code        text,        -- normalized refusal/rejection reason (taxonomy below); null unless a negative outcome
  decision_authority text check (decision_authority in ('institution','dha','student','agent')),
  -- S8: full timestamp for same-day ordering; optional user-facing local date
  occurred_at        timestamptz not null,
  occurred_on        date,        -- optional: the day the student reports, when no time is known
  -- B2: verification metadata (default unverified self-report)
  source             text not null default 'self_reported'
                       check (source in ('self_reported','document_verified','official_verified')),
  verified_by        uuid references auth.users(id),  -- admin who promoted past self_reported; null while self_reported
  verified_at        timestamptz,
  detail             jsonb not null default '{}',     -- structured, Zod-validated (offer conditions, refusal narrative, etc.)
  -- S6: correction lineage instead of a flat boolean
  supersedes_event_id uuid references public.outcome_events(id) on delete set null,
  recorded_at        timestamptz not null default now(),
  unique (id, owner),
  foreign key (attempt_id, owner)
    references public.application_attempts (id, owner)  -- owner consistency (S12)
);
create index outcome_events_attempt_id_owner_idx on public.outcome_events (attempt_id, owner); -- S11: matches RLS + lookup
create index outcome_events_owner_idx            on public.outcome_events (owner);
create index outcome_events_supersedes_idx       on public.outcome_events (supersedes_event_id);
```

- **`event_type`** spans both gates of §2: admission (`offer_received` / `conditional_offer` /
  `application_rejected`), commitment (`offer_accepted` / `coe_issued`), visa (`visa_lodged` /
  `visa_granted` / `visa_refused`), and terminal (`enrolled` / `withdrawn`).
- **`gate` (B3)** is `'admission'` for the institution decisions, `'visa'` for the DHA
  decisions, and `null` for neutral commitment/terminal steps. The API sets it from
  `event_type`; it is stored (not derived on read) so calibration queries stay a cheap column
  filter.
- **`reason_code` (B3)** — normalized taxonomy, mapped back to the half it falsifies so a
  negative outcome localizes the calibration miss:
  - *admission rejections:* `academic_below_threshold`, `english_below_threshold`,
    `program_full`, `incomplete_application`, `other`.
  - *visa refusals:* `gs_intent` (Genuine Student), `financial_capacity`, `english`,
    `documents`, `health_character`, `other`.

  Free-text narrative stays in `detail`; the code is the queryable, calibration-grade field.
- **`source` + `verified_by`/`verified_at` (B2)** — every event starts `self_reported`.
  Promotion to `document_verified` / `official_verified` is **admin-only** (§8 Phase 3) and
  stamps the verifier. Calibration **excludes `self_reported`** from training (§7) so a user
  cannot move a band by fabricating `visa_granted` — they can only move it with evidence an
  admin has verified.
- **S6 — lineage, not a flag.** A correction inserts a new event pointing at the one it
  replaces via `supersedes_event_id`; the prior row is retained. "Active" = the head of each
  supersession chain (no later row points at it). This preserves the full claim history and
  supports a build-phase deferred-constraint trigger that rejects *multiple active terminal
  outcomes* per (attempt, gate).
- **S7 — sequence integrity.** Illegal orderings (e.g. `visa_granted` before `applied`) are
  rejected by an **app-side state machine** in the event API (the canonical guard, since the
  taxonomy lives server-side per F16), backed at the build phase by a deferred constraint
  trigger for the terminal-conflict case the app can't catch across concurrent writes.

### 4.4 RLS, grants, migration

```sql
alter table public.program_predictions  enable row level security;
alter table public.program_predictions  force  row level security;
alter table public.application_attempts  enable row level security;
alter table public.application_attempts  force  row level security;
alter table public.outcome_events        enable row level security;
alter table public.outcome_events        force  row level security;

-- program_predictions: owner-scoped, SELECT + INSERT + DELETE (immutable via trigger; no UPDATE policy)
create policy pp_select_own on public.program_predictions
  for select to authenticated using ((select auth.uid()) = owner);
create policy pp_insert_own on public.program_predictions
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy pp_delete_own on public.program_predictions
  for delete to authenticated using ((select auth.uid()) = owner); -- right-to-delete (MV-05)

-- application_attempts: owner-scoped; the insert WITH CHECK re-asserts ownership of the parent prediction
create policy aa_select_own on public.application_attempts
  for select to authenticated using ((select auth.uid()) = owner);
create policy aa_insert_own on public.application_attempts
  for insert to authenticated
  with check (
    (select auth.uid()) = owner
    and exists (select 1 from public.program_predictions p
                where p.id = prediction_id and p.owner = (select auth.uid()))
  );
create policy aa_delete_own on public.application_attempts
  for delete to authenticated using ((select auth.uid()) = owner);

-- outcome_events: owner-scoped; users may NOT update verification columns (admin/service-role only)
create policy oe_select_own on public.outcome_events
  for select to authenticated using ((select auth.uid()) = owner);
create policy oe_insert_own on public.outcome_events
  for insert to authenticated
  with check (
    (select auth.uid()) = owner
    and source = 'self_reported' and verified_by is null  -- a user can only file self-reports
    and exists (select 1 from public.application_attempts a
                where a.id = attempt_id and a.owner = (select auth.uid()))
  );
create policy oe_delete_own on public.outcome_events
  for delete to authenticated using ((select auth.uid()) = owner);
-- NB: no oe_update_own policy. Corrections are append-only (new row + supersedes_event_id).
-- Verification promotion (set source/verified_by) runs admin-only via a restricted path (§8).

revoke all on public.program_predictions, public.application_attempts, public.outcome_events
  from anon, authenticated;
grant select, insert, delete on public.program_predictions to authenticated;
grant select, insert, delete on public.application_attempts to authenticated;
grant select, insert, delete on public.outcome_events       to authenticated;
```

- **Write path (S4).** The architecture rule routes writes through API routes. For these
  tables the route uses the **authenticated user's own session** (RLS-scoped) for inserts
  rather than the service-role client, so a bug can't escape the owner scope. The **only**
  service-role/admin writes are (a) verification promotion and (b) calibration reads — both
  outside any request path. Never instantiate the service-role client in a user-facing route
  for these tables.
- **Immutability** of `program_predictions` is the trigger in §4.1, not the absence of a
  policy — true even against service-role.
- **Right-to-delete (MV-05):** every table cascades on `auth.users` delete; the `_delete`
  policies let the account-delete path clear them. No new orphan risk.
- **No `updated_at` trigger** — `program_predictions` is immutable, the other two are
  append-only (`recorded_at`/`created_at` set once).
- **Advisor-clean from day one (S11):** every FK is indexed; `outcome_events(attempt_id,
  owner)` is a composite index that both serves the RLS `exists` join and the attempt-funnel
  lookup. Verify the insert policy's `exists` plan under the `authenticated` role after apply
  (`explain` the policy expression) — it should be an index scan on the parent's `(id, owner)`.
  RLS uses `(select auth.uid())` throughout (no per-row re-eval).
- **Migration:** ship as `supabase/migrations/<ts>_add_outcome_validation.sql`. **Founder
  reviews and applies** (prod DB approval). Re-run `get_advisors` after apply; expect zero new
  findings.

---

## 5. API surface (server-side, Zod-validated)

Four endpoints; all Zod-validated, all reading `owner` from the session (never the body), no
sensitive data in URLs/query params.

| Route | Method | Purpose |
|---|---|---|
| `/api/outcomes/prediction` | POST | **Freeze a prediction run** for (assessment, program). Idempotent on `(owner, assessment_id, program_id, rule_version)` — insert-once, return existing on conflict. |
| `/api/outcomes/attempt` | POST | **Open an application attempt** `{ prediction_id, institution_id?, intake?, external_ref? }`. Server stamps `owner`, copies `program_id` from the prediction. |
| `/api/outcomes/event` | POST | **Append an outcome event** `{ attempt_id, event_type, occurred_at, occurred_on?, reason_code?, detail? }`. Server derives `gate` + `decision_authority` from `event_type`, validates the transition (state machine, S7), stamps `owner`, `source='self_reported'`, `recorded_at`. |
| `/api/outcomes` | GET | The user's own funnel (predictions + attempts + events) for the dashboard. |

**F16 (never expose scoring rules to the client):** `/api/outcomes/prediction` **recomputes
the verdict server-side** from the assessment + program via the scoring engine and stores that
— it must **never trust a client-supplied verdict/snapshot**. The client only names the program
it's committing to. The `reason_code` taxonomy and the legal-transition state machine also live
server-side.

**Calibration and verification are not public endpoints.** Calibration runs offline / admin via
a restricted path (§7); verification promotion is admin-only (§8). No scoring rule, aggregate,
or verifier identity is exposed in client JS.

---

## 6. Capture UX (the loop only closes if we ask)

- **Snapshot + attempt trigger:** when a signed-in user moves a program to `applied` (existing
  `user_program_state` control), the app calls `/api/outcomes/prediction` to freeze the live
  verdict, then `/api/outcomes/attempt` to open the attempt. No new primary UI — the existing
  transition becomes the capture point; institution/intake can be confirmed inline or left to
  the first status update.
- **Status updates:** a lightweight, **always-optional** "Update your status" affordance per
  attempt on the dashboard/matches — "Heard back? (Offer / Conditional / Rejected)", then later
  "Visa decision? (Granted / Refused)", and on a refusal an optional reason picker mapping to
  the `reason_code` taxonomy. Each tap appends an `outcome_events` row. Never blocks, never
  gates content.
- **Verified capture — forward-to-address + DKIM (the primary `document_verified` path).** Each
  user gets a unique, high-entropy (128-bit) forward address `<token>@verify.myvisa.app`. The
  student forwards the genuine offer / CoE / visa-decision email **as an attachment**
  (`.eml` / `message/rfc822`); a Cloudflare Email Worker reads the **raw MIME** and verifies the
  issuer's **original DKIM signature at receipt** — cryptographic proof the message genuinely came
  from the university / Home Affairs and was not altered (DKIM survives forwarding; SPF does not).
  **An inline "Forward" is NOT DKIM-eligible** (Gmail/Outlook re-wrap the body and break the `bh=`
  body hash) and auto-downgrades to `self_reported`. On a DKIM pass the handler **must also bind
  the email to the student** — a match on ≥2 strong identifiers (legal name + one of
  DOB / passport fragment / application ref / CoE / TRN) — before the event leaves draft; no strong
  match → human review, never auto-confirm (DKIM proves the email is genuine, *not* that it is
  *this* student's). Extraction tops ~85%, so the extracted fields are always a **draft the
  student confirms**; we never auto-mark an outcome validated (a wrong auto-read of "visa refused"
  is a catastrophic trust failure). Per-token rate-limit + dedup on `Message-ID`+body-hash guard
  the inbound surface. *(Gmail OAuth inbox-scanning was researched and rejected — restricted scope
  → annual CASA audit; Google "Limited Use" forbids feeding inbox data to a cross-user model, i.e.
  our calibration. Forward-to-address needs no Google API and the evidence is stronger.)* Mechanism
  **Codex-vetted GO-WITH-CHANGES, 2026-06-20.**
- **Nudges (later phase):** the 3-day assessment-expiry email and post-intake reminders are the
  natural harvest points. Out of scope for this slice; noted so the build phase wires capture,
  not just storage.

---

## 7. Calibration method

We never show users percentages (standing decision), so calibration validates **ordinal
behavior**, not calibrated probabilities. **Training set excludes `source='self_reported'` (B2).
The *primary* training set is `official_verified` only** — VEVO for the visa gate, CoE/CRICOS for
enrolment — the only sources that independently bind the outcome to the student. **`document_verified`
events feed a separate, lower-weighted secondary analysis**, never the primary calibration claim
(Codex 2026-06-20: a DKIM-genuine email proves *issuer authenticity*, not that it is *this*
student's outcome — see §6 identity-binding and §9). Self-reports are tracked for funnel/UX only
and cannot move a published calibration claim.

1. **Separation + monotonicity.** Within comparable rule versions, the observed offer-rate
   (and, separately, visa-grant-rate) must be **monotone in band**: Strong ≥ Possible ≥ Reach.
   If the ordering collapses or inverts, the rules are miscalibrated — that's the alarm.
2. **Per-gate, with reason attribution (§2, B3).** Compute admission separation from
   `offer_received`/`conditional_offer` vs `application_rejected` (events where `gate='admission'`);
   compute visa separation from `visa_granted` vs `visa_refused` (`gate='visa'`). On the visa
   side, break refusals down by `reason_code` so a miss points at the sub-factor to recalibrate
   (GS intent vs financial vs documents), not just "visa side."
3. **Version lineage, not strict per-version windows (S10).** Pooling outcomes naively across
   rule versions is wrong, but a *strict* per-`rule_version` window starves calibration whenever
   rules churn faster than outcomes resolve (months on this corridor). Instead, the
   recalibration-epoch design (`2026-06-07-phase-b-recalibration-epoch-design.md`) defines
   **compatibility groups** — versions that did not change the relevant factor pool pool together
   — and a **rolling window** over comparable versions. A version that touched only admission
   factors does not reset the visa window, and vice-versa.
4. **Evidence test, not a hard n≥30 (S9).** The first draft's "≥30 per band/gate/rule_version"
   is a weak ordinal bar. Instead: put **confidence intervals** on each band's observed rate and
   require the intervals to establish the monotonic separation (Strong's lower bound clears
   Reach's upper bound, etc.); for thin bands, **shrink toward a corridor-level prior via a
   Bayesian / hierarchical pooling** model so small-n bands borrow strength from the whole
   corridor instead of swinging wildly. Report **"insufficient evidence"** when the intervals are
   too wide to establish separation — a data-driven gate, not a fixed count.

Output: an internal calibration report (not user-facing in v1) — per (compatibility-group, gate,
band): n, verified-n, observed rate + CI, pooled estimate, monotonicity verdict, and (visa) a
`reason_code` breakdown.

---

## 8. Cold-start plan (this is why it's design-only today)

The loop is **worthless with zero resolved outcomes** and cannot be tested for correctness until
students complete real funnels (months after launch). Therefore:

- **Phase 0 (now):** this design + the approved migration. **Storage exists, calibration
  sleeps.** No calibration claim is computed or shown.
- **Phase 1 (first traffic):** wire the snapshot + attempt triggers (§6) + the optional status
  updates. Accumulate `self_reported` events. Calibration still reports "insufficient evidence"
  (§7.4) and, regardless, ignores self-reports for training (B2).
- **Phase 2 (evidence accrues):** turn on the internal calibration report; review monotonicity
  per gate and per visa `reason_code`; feed misses back into the rules (a proper recalibration
  epoch).
- **Phase 3 (trust layer):** the **verification ladder**. `self_reported` → `document_verified`
  via two paths: **(primary) forward-to-address + DKIM** (§6) — verified automatically **at
  receipt**, with the verification record persisted **immutably** (canonical body hash, full
  `DKIM-Signature`, `d/s/i/a/t/x`, the DNS TXT verbatim, verifier version, timestamp) so a later
  DNS selector-rotation can't invalidate a once-good signature; **(fallback) human-reviewed
  upload** (offer letter / CoE / visa notice via the existing Storage path) for students who can't
  forward. The evidence subtype (`dkim_identity_bound` / `dkim_identity_weak` / `human_reviewed`)
  is stamped in `detail` jsonb — **no schema change**. ARC is **not** accepted as
  `document_verified` (chain-of-custody, not an issuer proof). `document_verified` →
  `official_verified` only by independent re-check (VEVO visa / CoE/CRICOS enrolment).
  `verified_by`/`verified_at` are stamped on any admin promotion; users can never self-promote
  (§4.4 insert policy forbids it). **Raw forwarded MIME is deleted promptly (~24h); only extracted
  fields + the verification record persist** (AU APP data-minimization). A privacy PIA + APP-5
  collection notice + minor-consent flow are **required before this phase ships** (§13).

---

## 9. Known limitations (document them, don't pretend they're solved)

- **Attribution (now structural, B1).** The `application_attempts` entity ties every outcome to
  a specific program/institution/intake, so multi-application students no longer corrupt
  per-program calibration. Residual: a student may open an attempt and never report its outcome
  (non-response), handled as bias below.
- **Selection / survivorship bias.** Students with good outcomes self-report more. Mitigation:
  prompt *all* applied attempts, track non-response as its own signal, and caveat every
  calibration figure. This bias is why early calibration is *directional*, not authoritative.
- **Self-report integrity / gaming (addressed, B2).** Self-reports are excluded from training and
  promotion is admin-only, so a user cannot move a band by fabricating an outcome. Cost: the
  verified set grows slower than the reported set — the §7.4 evidence test absorbs that.
- **Small-n corridors.** Nepal→Australia is one corridor; per-band verified-n grows slowly. The
  §7.4 CIs + Bayesian pooling prevent over-claiming on thin data far better than a fixed cutoff.
- **Two-sided attribution within a gate.** A visa refusal can be the student's (missing funds) or
  our model's (wrong band). The per-gate split (§2) plus `reason_code` (§4.3) localizes it, but
  can't fully disentangle it from n alone.
- **Identity binding on forwarded evidence (Codex 2026-06-20).** DKIM proves a forwarded email is a
  genuine, untampered message from the uni/DHA — *not* that it is *this* student's. A student could
  forward someone else's real grant/offer. Mitigation: the ≥2-strong-identifier match before a
  `document_verified` event leaves draft (§6); residual risk is exactly why **only
  `official_verified` (VEVO/CoE) feeds the primary calibration set** (§7), with DKIM evidence
  weighted separately.

---

## 10. Honest-copy implications

- **Until calibration passes §7,** verdict copy must stay an **estimate from official
  criteria**, not an outcome-backed probability. This reinforces the existing
  `VerdictDisclaimer` (MV-05) and the data-freshness degradation (MV-04) — same honesty posture.
  **Never show percentages** (standing decision).
- **After** calibration is monotone, past the evidence test, and computed on *verified* outcomes,
  copy *may* strengthen to language like "consistent with outcomes from N students on the same
  corridor" — but only then, and still banded, never a percentage.

---

## 11. Scope — what this slice does and does NOT do

**Does (this slice):** produce this design + the proposed migration SQL + Zod/API contracts as a
build spec; bridge to the existing `applied` transition; define the attribution entity,
calibration method, and the cold-start ladder.

**Does NOT (deferred to the build phase, after founder approval + traffic):**
- No shipping code, no live tables until the founder applies the migration.
- No verification admin path, no email nudges, no admin calibration dashboard.
- No change to the scoring engine or goldens.
- No user-facing calibration claim (sleeps until §7.4 evidence test passes on verified data).

---

## 12. Acceptance criteria for the eventual build (not this slice)

- [ ] Migration applied by founder; `get_advisors` returns **zero new** findings (FKs indexed,
      RLS uses `(select auth.uid())`, force RLS on all three tables).
- [ ] `applied` transition freezes a prediction run **and** opens an `application_attempts` row;
      verdict is **recomputed server-side** (F16), never taken from the client. TDD: failing test first.
- [ ] **B1:** every `outcome_events` row resolves through an attempt to exactly one
      (prediction, program, institution, intake); a multi-application fixture proves outcomes are
      attributed to the right program.
- [ ] **B2:** a user-filed event is always `self_reported` with `verified_by` null (insert policy
      enforces it); promotion is admin-only; the calibration query excludes `self_reported`.
- [ ] **B3:** admission/visa events carry the correct `gate`; refusals/rejections carry a
      `reason_code` from the taxonomy; calibration reports a per-`reason_code` visa breakdown.
- [ ] **S4:** the `program_predictions` UPDATE-guard trigger raises even under the service-role
      client (test it directly).
- [ ] `outcome_events` is append-only; a correction inserts a new row with `supersedes_event_id`
      and never overwrites; the active event is the head of the chain.
- [ ] **S7:** the event state machine rejects illegal orderings (e.g. `visa_granted` before
      `applied`); a deferred trigger rejects multiple active terminal outcomes per (attempt, gate).
- [ ] RLS proven: user A cannot read/insert against user B's prediction/attempt/event (the
      `exists` checks and composite FKs hold).
- [ ] Account-delete (MV-05) cascades all three tables to zero rows for that owner.
- [ ] Calibration computes per (compatibility-group, gate, band) on **verified** outcomes,
      returns "insufficient evidence" when CIs can't establish separation; nothing user-facing.
- [ ] Zod validates every endpoint; no verdict/snapshot/sensitive field in URLs, query params, or
      client logs.

---

## 13. Open questions for the founder (gate to build)

1. **Migration approval** — apply the three-table migration now (storage ahead of traffic), or
   wait until launch is closer? (Recommend: apply now — it's inert, advisor-clean, and lets
   capture wire in the moment traffic starts. The attribution entity (B1) is the costly thing to
   add later, so getting the shape in now is the whole point.)
2. **Calibration evidence bar** (§7.4) — *(updated by the Codex review)* the question is no longer
   "is 30 the right count" — n≥30 is too weak. Confirm the approach: **confidence intervals +
   Bayesian/hierarchical pooling on verified outcomes**, reporting "insufficient evidence" until
   the bands separate. Sign-off needed on using a statistical evidence test rather than a fixed
   count.
3. **Verification path** (§6 + §8 Phase 3) — *(mechanism now decided: forward-to-address + DKIM,
   Codex-vetted GO-WITH-CHANGES 2026-06-20; fallback = human-reviewed upload).* Remaining
   founder/legal gates before Phase 3 can ship: **(a)** a privacy PIA + APP-5 notice +
   minor-consent flow for ingesting university/government email content; **(b)** confirm VEVO
   programmatic/org-access ToS (gates `official_verified` for the visa gate); **(c)** accept that
   the **primary calibration set is `official_verified` only** — DKIM `document_verified` is
   secondary/lower-weighted — which means a live calibration *claim* waits on VEVO-class
   verification, not just DKIM volume. Near-term or later? (Nothing here blocks applying the
   migration; storage already supports all of it.)
4. **Capture aggressiveness** (§6) — how hard do we nudge for outcomes (email harvest) vs. keep it
   purely passive? Trades data volume against perceived pressure on students.
