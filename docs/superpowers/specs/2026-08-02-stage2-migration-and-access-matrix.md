# Stage 2 — Per-table migration and access matrix

**Written:** 2026-08-02 · **Owner:** integrator session · **Status:** authoritative for Stage 2
**Companion to:** [`2026-08-02-stage1-canonical-access-matrix.md`](./2026-08-02-stage1-canonical-access-matrix.md) (authoritative for Stage 1 cells; this file does not move any of them)

---

## 1. Why this document exists

Stage 1 shipped MV-151 (the TypeScript permission layer) and MV-152 (the SQL RLS policies) **in
parallel, from the plan's prose, by separate sessions that could not see each other**. They diverged
in six cells. In four of them the SQL was *more permissive* than the TypeScript — the dangerous
direction. One cell had both PRs shipping a test asserting the opposite of the other. The canonical
access matrix was written after the fact to stop the bleeding, and it opens with the diagnosis:

> Neither layer was written from a single enumerated matrix; each derived one from the plan's prose.
> That is the root cause.

**Stage 2 is set up to repeat it exactly.** Six slices (MV-155 → MV-160) each touch the same nine
student-owned tables. Each dossier independently re-derives the schema from the plan's prose and from
sibling dossiers, and the plan's own "Known schema obstacles" section says so in as many words:

> Before the case-aware core work begins, expand this section into a per-table migration matrix.

That expansion was never written. This file is it.

**The rules that follow from that:**

1. **This file is the single source of truth Stage 2 slices build against.** Where a slice dossier
   disagrees with this file, **the slice is wrong** — the same rule the Stage 1 matrix established.
2. **It is grounded in the hosted schema, not in prose.** Every fact in §2 was read out of
   `obfvrxixtautamflzxzq` on 2026-08-02 via the Supabase MCP. Where a dossier disagrees with §2,
   §2 wins and the dossier is corrected. §9 lists every such disagreement found.
3. **A cell this file does not determine is a new decision** and gets an amendment here before it
   gets SQL. It is not invented in a migration. **A cell this file determines WRONGLY gets the same
   treatment** — the amendment lands here, not only in the migration comment and the slice card, or
   the next slice reads the stale cell and builds against it. §4.4 and §4.6's `UPDATE` grants were
   the first instance (amended 2026-08-03; see §12).
4. **Grants are role-wide, and that is the structural fact Stage 2 keeps forgetting.** `authenticated`
   is *one* Postgres role. Owner, admin, counsellor and student are all `authenticated`. A verb absent
   from the `authenticated` grant is absent for **every human role**, and no RLS policy can restore it.
   RLS narrows a grant; it never widens one. §7 is the consequence.

---

## 2. Captured hosted inventory — the evidence

> **Point-in-time capture, 2026-08-02**, from project `obfvrxixtautamflzxzq` via the Supabase MCP
> (`execute_sql` against `information_schema`, `pg_catalog`, `pg_policies`, `storage.*`). This is a
> **snapshot, not a contract.** Re-read it before any slice applies DDL. Row counts in particular have
> already moved since the plan's 2026-07-23 inspection (see §2.8).

### 2.1 Tables in scope

Nine student-owned (Stage 2 migrates these) and six tenancy (Stage 1, unchanged by Stage 2):

| Student-owned | rows | | Tenancy (Stage 1) | rows |
|---|---:|---|---|---:|
| `public.profiles` | 7 | | `public.organizations` | 0 |
| `public.assessments` | 36 | | `public.organization_memberships` | 0 |
| `public.plan_items` | 74 | | `public.cases` | 0 |
| `public.user_program_state` | 12 | | `public.case_assignments` | 0 |
| `public.documents` | 6 | | `public.invitations` | 0 |
| `public.document_status` | **0** | | `public.audit_events` | 0 |
| `public.program_predictions` | 10 | | | |
| `public.application_attempts` | 10 | | | |
| `public.outcome_events` | 19 | | | |

Out of scope and deliberately so: `public.leads` (RLS enabled, **0 policies, 0 grants to `anon`/
`authenticated`** — deny-all by design, the `harden_advisors` precedent), `public.universities`,
`public.programs`.

### 2.2 Columns (student-owned nine)

```
profiles              id uuid NN gen_random_uuid() · owner uuid NN · sections jsonb NN '{}' ·
                      completeness int NN 0 · created_at tstz NN now() · updated_at tstz NN now()
assessments           id uuid NN gen_random_uuid() · owner uuid NULLABLE · result jsonb NN ·
                      rule_version text NN · created_at tstz NN now() · expires_at tstz NN ·
                      claimed_at tstz NULL · destination_id text NN · is_primary bool NN false ·
                      profile_snapshot jsonb NN
                      [note: ordinal 3 is a dropped column — attnum gap]
plan_items            id bigint NN (identity/sequence, no column default) · owner uuid NN ·
                      kind text NN · impact text NN · title text NN · body text NULL ·
                      lift_estimate text NULL · time_estimate text NULL · status text NN 'todo' ·
                      created_at tstz NN now() · completed_at tstz NULL · started_at tstz NULL
user_program_state    owner uuid NN · program_id text NN · status text NN · notes text NULL ·
                      created_at tstz NN now() · updated_at tstz NN now()
documents             id uuid NN gen_random_uuid() · owner uuid NN · kind text NN · file_path text NN ·
                      file_size int NN · original_name text NN · created_at tstz NN now()
                      [note: ordinals 7-9 are dropped columns — attnum gap]
document_status       owner uuid NN · kind text NN · obtained bool NN true · updated_at tstz NN now()
program_predictions   id uuid NN gen_random_uuid() · owner uuid NN · assessment_id uuid NN ·
                      program_id text NN · verdict text NN · rule_version text NN ·
                      score_snapshot jsonb NN · supersedes_prediction_id uuid NULL ·
                      predicted_at tstz NN now()
application_attempts  id uuid NN gen_random_uuid() · owner uuid NN · prediction_id uuid NN ·
                      program_id text NN · institution_id text NULL · intake text NULL ·
                      destination text NN 'AU' · external_ref text NULL · created_at tstz NN now()
outcome_events        id uuid NN gen_random_uuid() · owner uuid NN · attempt_id uuid NN ·
                      event_type text NN · gate text NULL · reason_code text NULL ·
                      decision_authority text NULL · occurred_at tstz NN · occurred_on date NULL ·
                      source text NN 'self_reported' · verified_by uuid NULL · verified_at tstz NULL ·
                      detail jsonb NN '{}' · supersedes_event_id uuid NULL · recorded_at tstz NN now()
```

**`owner` is `NOT NULL` on eight; `assessments.owner` is the only nullable one.** Matches the plan.

### 2.3 Constraints

**Primary keys**
```
profiles(id) · assessments(id) · plan_items(id) · documents(id) · program_predictions(id) ·
application_attempts(id) · outcome_events(id)
user_program_state(owner, program_id)   ← owner IS a PK column
document_status(owner, kind)            ← owner IS a PK column
```

**Unique constraints**
```
profiles_owner_key                                              UNIQUE (owner)
documents_owner_kind_key                                        UNIQUE (owner, kind)
program_predictions_id_owner_key                                UNIQUE (id, owner)      ← composite-FK target
program_predictions_owner_assessment_id_program_id_rule_ver_key UNIQUE (owner, assessment_id, program_id, rule_version)
application_attempts_id_owner_key                               UNIQUE (id, owner)      ← composite-FK target
outcome_events_id_owner_key                                     UNIQUE (id, owner)      ← composite-FK target
```

**Foreign keys** (all `MATCH SIMPLE` — `confmatchtype = 's'` verified on both composites)
```
profiles.owner              → auth.users(id) ON DELETE CASCADE
assessments.owner           → auth.users(id) ON DELETE CASCADE
plan_items.owner            → auth.users(id) ON DELETE CASCADE
user_program_state.owner    → auth.users(id) ON DELETE CASCADE
user_program_state.program_id → programs(id) ON DELETE CASCADE
documents.owner             → auth.users(id) ON DELETE CASCADE
document_status.owner       → auth.users(id) ON DELETE CASCADE
program_predictions.owner   → auth.users(id) ON DELETE CASCADE
program_predictions.assessment_id → assessments(id) ON DELETE CASCADE
program_predictions.program_id    → programs(id) ON DELETE CASCADE
program_predictions.supersedes_prediction_id → program_predictions(id) ON DELETE SET NULL
application_attempts.owner  → auth.users(id) ON DELETE CASCADE
application_attempts.prediction_id → program_predictions(id) ON DELETE CASCADE   ← single-col, survives Stage 2
application_attempts.(prediction_id, owner) → program_predictions(id, owner)     ← composite, NO ACTION, MATCH SIMPLE
application_attempts.program_id → programs(id) ON DELETE CASCADE
outcome_events.owner        → auth.users(id) ON DELETE CASCADE
outcome_events.attempt_id   → application_attempts(id) ON DELETE CASCADE         ← single-col, survives Stage 2
outcome_events.(attempt_id, owner) → application_attempts(id, owner)             ← composite, NO ACTION, MATCH SIMPLE
outcome_events.supersedes_event_id → outcome_events(id) ON DELETE SET NULL
outcome_events.verified_by  → auth.users(id)  [no ON DELETE action]
```

**CHECK constraints**
```
plan_items_impact_check              impact IN (high, medium, low)
plan_items_status_check              status IN (todo, done, dismissed)
user_program_state_status_check      status IN (shortlisted, applied, withdrawn)
documents_kind_check                 kind IN (20 values: passport … other)
document_status_kind_check           kind IN (same 20 values)
program_predictions_verdict_check    verdict IN (strong, possible, reach)
outcome_events_event_type_check      11 values (applied … withdrawn)
outcome_events_gate_check            gate IN (admission, visa)
outcome_events_decision_authority_check  IN (institution, dha, student, agent)
outcome_events_source_check          IN (self_reported, document_verified, official_verified)
```
**No CHECK constraint exists on `profiles` or `assessments`.** No `_ownership_axis_present` family
exists yet (MV-156 creates it).

### 2.4 Indexes (including partial predicates)

```
profiles              profiles_pkey (id) U · profiles_owner_key (owner) U · profiles_owner_idx (owner)
assessments           assessments_pkey (id) U
                      assessments_primary_idx (owner) U WHERE is_primary
                      assessments_owner_idx (owner) WHERE owner IS NOT NULL
                      assessments_anon_purge_idx (created_at) WHERE owner IS NULL   ← MV-135 purge
plan_items            plan_items_pkey (id) U
                      plan_items_kind_open_idx (owner, kind) U WHERE status = 'todo'
                      plan_items_open_idx (owner, created_at DESC) WHERE status = 'todo'
                      plan_items_owner_idx (owner)
user_program_state    user_program_state_pkey (owner, program_id) U
                      user_program_state_owner_idx (owner) · user_program_state_program_id_idx (program_id)
documents             documents_pkey (id) U · documents_owner_kind_key (owner, kind) U
                      documents_owner_idx (owner)
document_status       document_status_pkey (owner, kind) U · document_status_owner_idx (owner)
program_predictions   program_predictions_pkey (id) U · program_predictions_id_owner_key (id, owner) U
                      program_predictions_owner_assessment_id_program_id_rule_ver_key
                        (owner, assessment_id, program_id, rule_version) U
                      program_predictions_owner_idx (owner) · _assessment_id_idx · _program_id_idx
                      program_predictions_supersedes_idx (supersedes_prediction_id)
application_attempts  application_attempts_pkey (id) U · application_attempts_id_owner_key (id, owner) U
                      application_attempts_owner_idx (owner)
                      application_attempts_prediction_id_owner_idx (prediction_id, owner)
                      application_attempts_program_id_idx (program_id)
outcome_events        outcome_events_pkey (id) U · outcome_events_id_owner_key (id, owner) U
                      outcome_events_owner_idx (owner)
                      outcome_events_attempt_id_owner_idx (attempt_id, owner)
                      outcome_events_supersedes_idx · outcome_events_verified_by_idx
```

### 2.5 Triggers on the nine

```
profiles              profiles_set_updated_at        BEFORE UPDATE  → private.set_updated_at()
user_program_state    user_program_state_set_updated_at BEFORE UPDATE → private.set_updated_at()
program_predictions   program_predictions_no_update  BEFORE UPDATE  → private.reject_prediction_update()
```
**`document_status` has an `updated_at` column but NO `set_updated_at` trigger.** Nothing else on the
nine carries a trigger. (Tenancy tables carry `cases_set_updated_at`, `cases_write_surface_guard` →
`private.enforce_case_write_surface()`, `audit_events_no_update`, and `set_updated_at` on
`organizations` / `organization_memberships` / `case_assignments` / `invitations`.)

Function properties (`pg_proc`):

| Function | security | `search_path` | EXECUTE ACL |
|---|---|---|---|
| `private.actor_org_ids/actor_admin_org_ids/actor_owner_org_ids/actor_assigned_case_ids` | **definer** | `""` | postgres, authenticated — **PUBLIC revoked** |
| `private.can_access_case / can_manage_case / can_staff_case / case_org_id / is_case_org_member / is_org_admin / org_role` | **definer** | `""` | postgres, authenticated — **PUBLIC revoked** |
| `private.write_audit_event(...)` | **definer** | `""` | postgres only |
| `private.enforce_case_write_surface()` | invoker | `""` | postgres only |
| `private.set_updated_at()`, `private.reject_prediction_update()`, `private.reject_audit_event_update()` | invoker | `""` | **PUBLIC (default acl)** |

The REVOKE-FROM-PUBLIC discipline holds on **every definer helper**, as designed. The three legacy
trigger functions retain the default PUBLIC EXECUTE, which is harmless because they are SECURITY
INVOKER and raise outside a trigger context — but **any new definer function Stage 2 adds must be
revoked**, and `private.mv155_backfill_personal_cases()` / `mv155_assert_case_backfill()` /
MV-155 §H's UPSERT-seam definer trigger (**un-qualified since MV-159 §1b — §4 rule 2**) are all in that class.

> **This §2.5 inventory is the PRE-STAGE-2 capture and is left as captured.** For the record, Stage 2
> adds two triggers to the nine, both on the upsert seam:
> `user_program_state_derive_case_id` and `document_status_derive_case_id`, `BEFORE INSERT OR UPDATE
> … FOR EACH ROW` → `private.mv155_derive_case_id_from_owner()`. MV-155 created them
> `WHEN (new.owner IS NOT NULL)`; **MV-159 §1b removed that clause** (`owner → NULL` is exactly what
> it excluded, and exactly what breaks `/api/account/delete`) and re-bodied the function as a
> binding guard. MV-159 asserts the absent `WHEN` at apply time, because restoring it would silently
> re-open the re-point.

### 2.6 RLS state and policies

**All nine tables: `relrowsecurity = true` AND `relforcerowsecurity = true`.** (All six tenancy tables
too.) Nothing needs enabling; everything needs preserving.

| Table | Policy | Cmd | Roles | USING / WITH CHECK |
|---|---|---|---|---|
| `profiles` | `profiles_select_own` | SELECT | `authenticated` | `(select auth.uid()) = owner` |
| `profiles` | `profiles_update_own` | UPDATE | `authenticated` | U + WC: `(select auth.uid()) = owner` |
| `assessments` | `assessments_select_own` | SELECT | `authenticated` | `(select auth.uid()) = owner` |
| `plan_items` | `plan_items_select_own` | SELECT | `authenticated` | `(select auth.uid()) = owner` |
| `plan_items` | `plan_items_update_own` | UPDATE | `authenticated` | U + WC: `(select auth.uid()) = owner` |
| `user_program_state` | `ups_select_own` / `ups_insert_own` / `ups_update_own` / `ups_delete_own` | S/I/U/D | `authenticated` | `(select auth.uid()) = owner` (UPDATE has both) |
| `documents` | `"Users read own documents"` | SELECT | **`public`** | `(select auth.uid()) = owner` |
| `documents` | `"Users delete own documents"` | DELETE | **`public`** | `(select auth.uid()) = owner` |
| `documents` | `"Service inserts documents"` | INSERT | `service_role` | WC: `true` |
| `document_status` | `ds_select_own` / `ds_insert_own` / `ds_update_own` / `ds_delete_own` | S/I/U/D | `authenticated` | `(select auth.uid()) = owner` |
| `program_predictions` | `pp_select_own` / `pp_delete_own` | S/D | `authenticated` | `(select auth.uid()) = owner` |
| `program_predictions` | `pp_insert_own` | INSERT | `authenticated` | WC: `owner = uid AND EXISTS (select 1 from assessments a where a.id = assessment_id and a.owner = uid)` |
| `application_attempts` | `aa_select_own` / `aa_delete_own` | S/D | `authenticated` | `(select auth.uid()) = owner` |
| `application_attempts` | `aa_insert_own` | INSERT | `authenticated` | WC: `owner = uid AND EXISTS (select 1 from program_predictions p where p.id = prediction_id and p.owner = uid)` |
| `outcome_events` | `oe_select_own` / `oe_delete_own` | S/D | `authenticated` | `(select auth.uid()) = owner` |
| `outcome_events` | `oe_insert_own` | INSERT | `authenticated` | WC: `owner = uid AND source = 'self_reported' AND verified_by IS NULL AND EXISTS (select 1 from application_attempts a where a.id = attempt_id and a.owner = uid)` |

**No table has an UPDATE policy on `program_predictions`, `application_attempts`, `outcome_events`,
`assessments`, or `documents`. `assessments` has no INSERT/UPDATE/DELETE policy at all.**

All predicates already use the `(select auth.uid())` InitPlan form — including the two `documents`
policies (rewritten by `20260618120000_harden_advisors.sql`). The `documents` defect that *is* real is
the missing `to authenticated` clause: both apply to `PUBLIC`, which includes `anon`. Only the absent
grant keeps `anon` out (§2.7).

### 2.7 Grants

**Table-level, `authenticated`** (`anon` holds **nothing** on any of the fifteen tables):

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|:--:|:--:|:--:|:--:|
| `profiles` | ✅ | ❌ | ✅ | ❌ |
| `assessments` | ✅ | ❌ | ❌ | ❌ |
| `plan_items` | ✅ | ❌ | ✅ | ❌ |
| `user_program_state` | ✅ | ✅ | ✅ | ✅ |
| `documents` | ✅ | ❌ | ❌ | ✅ |
| `document_status` | ✅ | ✅ | ✅ | ✅ |
| `program_predictions` | ✅ | ✅ | ❌ | ✅ |
| `application_attempts` | ✅ | ✅ | ❌ | ✅ |
| `outcome_events` | ✅ | ✅ | ❌ | ✅ |

`service_role` and `postgres` hold the full `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`
set on every one.

**Column-level, `authenticated`** — on the nine, every SELECT/INSERT/UPDATE grant covers **all
columns** (flat table-level grants, not column lists). This is exactly the hazard MV-155 §H exists to
close: adding `case_id` to a table with a flat grant silently extends the grant to it.

For contrast, the Stage-1 tables **do** carry narrowed UPDATE column lists, which is the precedent
MV-155 §H copies:
```
cases                    UPDATE (archived_at, display_name, email, operational_status)
organizations            UPDATE (name, slug)
organization_memberships UPDATE (role, status)
invitations              UPDATE (revoked_at)
```

### 2.8 Storage

```
bucket                  documents · public = false · no file_size_limit · no allowed_mime_types
storage.objects rows    8
object path shape       <owner_uuid>/<kind>/<filename>   (all 8; foldername() depth 2, seg1 is a uuid)
documents.file_path     all 6 rows: 3 segments, segment 1 == owner::text
orphans                 2 storage objects with NO matching documents.file_path row
policies                "Users read own document files"   SELECT  role public
                          USING bucket_id='documents' AND (storage.foldername(name))[1] = auth.uid()::text
                        "Users delete own document files" DELETE  role public   (same predicate)
                        "Service uploads document files"  INSERT  role service_role  WC bucket_id='documents'
                        NO UPDATE policy. NO authenticated INSERT policy.
grants on storage.objects   anon, authenticated, service_role ALL hold the full seven-privilege set
                            (Supabase platform default — NOT narrowed)
```

> **Read this next to §2.6.** On `public.documents` the missing `to authenticated` clause is covered by
> `anon` holding no grant. On `storage.objects` **that safety net does not exist** — `anon` holds full
> table grants. The only thing keeping an anonymous client out of the bucket is `auth.uid()` returning
> NULL inside the predicate. It is currently sound; it is one policy edit away from not being.

### 2.9 Live data, as of this capture

```
auth.users                                   9
distinct owners across the nine tables       7   (auth.users is a strict superset ✅ — MV-155 §A holds)
assessments total                            36
assessments with owner IS NULL (anonymous)   0   ← see §9.6
assessments with claimed_at IS NOT NULL      31
document_status rows                         0
storage objects / documents rows             8 / 6
```

---

## 3. The invariant every slice is implementing

One sentence, because six dossiers currently state six variants of it:

> **Every student-owned row belongs to exactly one case. During Stage 2 the row also keeps its `owner`,
> and where both are present they must agree: `case_id` resolves to the case whose
> `organization_id IS NULL AND student_user_id = owner`. A row with neither axis is forbidden.
> An `assessments` row with `owner IS NULL` must also have `case_id IS NULL`.**

- It is **cross-table**, so no `CHECK` can express it. It ships as
  `private.mv155_assert_case_backfill()` (MV-155 §F) and is re-run by MV-160 §B.
- It becomes **structural** in two steps: MV-156's composite FKs on `unique (id, case_id)` for the
  three chain tables, and MV-160's `case_id NOT NULL` for eight of the nine.
- It is **relaxed at Stage 3**, not before: once consultancy cases hold rows, `owner IS NULL` with
  `case_id` set is legitimate and the "they must agree" half applies only when `owner IS NOT NULL`.

---

## 4. Per-table matrix

Legend for the role × verb cells. **All four human roles are the single Postgres role
`authenticated`; the grant row is therefore role-blind and binds every one of them.** RLS narrows,
never widens.

- **O** = org owner · **A** = org admin · **C** = assigned counsellor · **S** = linked student ·
  **anon** = unauthenticated
- **S2** = in Stage 2 · **S3** = deferred to Stage 3 · **—** = never
- A cell marked **S3 (grant)** is blocked by the absent `authenticated` grant, not by policy. See §7.

**Five rules that apply across every table below, recorded once here so nine cells do not each state
them differently.** Rules 1, 2 and 4 were added 2026-08-02; **rule 3 was added 2026-08-03** from the
MV-157/MV-158 review, which found a residue class the cards had not named; **rule 5 was added
2026-08-05 by MV-161**, which found a column class no policy this project has ever shipped examined.

1. **The case-keyed uniqueness indexes are FULL, not partial.** MV-155 §E originally created each of
   them with `where case_id is not null`. Postgres infers a **partial** unique index for `ON CONFLICT`
   only when the statement supplies the index predicate, and PostgREST's `on_conflict=` emits a bare
   column list — so every upsert MV-157 §F re-points would raise **42P10**, making that section
   unexecutable and §4.4's stated dependency on it false. The predicate is therefore dropped: **NULLs
   are distinct in a unique index**, so legacy `case_id`-null rows still cannot collide during the
   nullable window, and a full unique on the same nullable columns *is* inferrable from a bare column
   list. Confirmed empirically against this project's own Postgres in a rolled-back transaction, in
   both directions. **Four of the indexes are `ON CONFLICT` arbiters and MUST be full** —
   `profiles (case_id)`, `user_program_state (case_id, program_id)`, `documents (case_id, kind)`,
   `document_status (case_id, kind)`. Two keep a predicate for a **domain** reason, not the nullable
   window, and neither is an arbiter: `assessments UNIQUE (case_id) WHERE is_primary` and
   `plan_items UNIQUE (case_id, kind) WHERE status = 'todo'`. The `assessments (case_id)` **lookup**
   index also stays partial — it keeps anonymous rows out of the index and a lookup index is never an
   arbiter.
2. **MV-155 §H's UPSERT-seam definer trigger is a BINDING GUARD that derives into a gap. AMENDED
   2026-08-04 (MV-159 review round 2) — this rule previously read "fires only
   `when (new.owner is not null)`… and **overwrites** any supplied value (the re-pointing hazard stays
   closed)", and BOTH halves of that parenthesis were false.** The overwrite did not close the
   re-pointing hazard, it *was* the re-pointing hazard, and the qualifier excluded the single
   transition that matters most.

   **What was measured.** A BEFORE ROW trigger fires *before* the RLS `WITH CHECK`, so the check
   never sees the row the client sent — it sees the row the trigger has already rewritten. `owner`
   **is** in the UPDATE grant on these two tables (the cell in §4.4 explains why PostgREST forces
   that). So an assigned counsellor issuing one `PATCH /rest/v1/document_status?id=eq.<id>` with
   `{"owner":"<their own uid>"}` against a client's consultancy row had `case_id` re-derived onto
   **their own personal case**, and the `WITH CHECK` then admitted it on `owner = auth.uid()`. The
   client's org admin could no longer see the row. The old reasoning only ever covered
   `owner → another user`; it inverted for `owner → self`. Not transitional: MV-160's pure case
   predicate admits it identically, because after the trigger the row genuinely *is* in the
   attacker's case.

   **The rule as it now stands** (`private.mv155_derive_case_id_from_owner`, re-bodied by MV-159
   §1b, trigger un-qualified on both tables):
   - `case_id` is **write-once**: derived from the owner's personal case only when it is NULL, and
     immutable once set. NULL → value stays open for the backfill and for residue adoption.
   - `owner` is **write-once on the same terms**, and the only value it may take is the
     **student of the row's own case**. This is what stops `owner → self`, `owner → another user`
     and `owner → NULL` alike, and it is why removing the `WHEN` clause was necessary rather than
     tidy: `owner → NULL` never fired a `WHEN (new.owner IS NOT NULL)` trigger at all.
     **READ THAT AS AN `UPDATE` PROPERTY — AMENDED 2026-08-04 (MV-159 review round 3).** The
     trigger's write-once clauses return early on `tg_op = 'INSERT'`, so an INSERT that *names* a
     third party as owner never met them. That is the exact mirror of the round-3 blocker in §9.2
     (d) and it is closed **one layer up**, in the five INSERT `WITH CHECK`s, by
     `owner is null or owner = private.case_student_id(case_id)` — the same helper clause (c) now
     reads, so the two halves cannot drift. It had to go there rather than here for a reason that
     is not stylistic: **three of the five INSERT-granted tables carry no derive trigger at all**
     (`program_predictions`, `application_attempts`, `outcome_events` — rule 3), so a trigger-only
     fix would have closed two of the five holes. The whole sentence is therefore: *this trigger
     says a row that EXISTS may not have either axis re-pointed; MV-159's INSERT predicates say a
     row being CREATED may name neither an unreachable case nor an owner who is not that case's
     student.*
   - Role-independent (the `program_predictions_no_update` precedent). It cannot be otherwise: the
     function is SECURITY DEFINER, so the `rolbypassrls` test `enforce_case_write_surface` uses
     would be unconditionally true inside it.

   With `owner IS NULL` the row is consultancy-created, there is nothing to derive from, and the
   **statement-supplied `case_id` is honoured** — bounded by MV-159's `WITH CHECK`, not by the
   trigger. `owner IS NULL` is also the one owner value that INSERT's owner-axis bound admits
   unconditionally, so the consultancy shape is untouched by the round-3 fix (measured: the
   `owner IS NULL` insert into a reachable case is ADMITTED on both tables). That property is preserved by the derive half's own `new.case_id is null and
   new.owner is not null` qualifier, so MV-160 §D's counsellor-write proof (INSERT/UPDATE/DELETE on
   these two tables "each succeeding with `owner IS NULL`") stays satisfiable. Residual seam, no
   Stage 2 caller, recorded as a Stage 3 input: a consultancy row written through an **upsert** must
   supply `case_id`, so its `ON CONFLICT DO UPDATE SET` list needs `UPDATE(case_id)`, which Stage 2
   does not grant — MV-160 §D drives plain statements, and MV-157 keeps `case_id` out of both
   upsert payloads.
3. **MV-155 RESIDUE IS A FAILURE MODE, NOT A DEGRADED ONE — added 2026-08-03 from the MV-157/MV-158
   review.** Rule 2 explains why only **two** of the nine tables carry a derive trigger. The
   consequence for the other **seven** was never written down, and it is not the consequence the cards
   assume. Those seven received `case_id` from a **one-shot** backfill, so a row written to any of
   them between the backfill and the MV-157 deploy carries `owner` and no `case_id`. Two populations,
   behaving differently:
   - A user with **no personal case** degrades gracefully. Every migrated read is `case_id`-scoped,
     returns nothing, and renders the same empty state a brand-new account sees.
   - A user who **has** a personal case but owns case-less rows **breaks**. Every new upsert
     conflict-targets `case_id`; an existing row whose `case_id` is NULL is not a conflict on that
     arbiter, so the write takes the INSERT branch — and the LEGACY owner-keyed uniques are still live
     until MV-160 drops them (`profiles_owner_key`, `documents_owner_kind_key`,
     `assessments_primary_idx`, `plan_items_kind_open_idx`). The write raises **23505**. Four paths
     reach it: profile save, document upload, the assessment persist's `is_primary` computation (its
     case-scoped lookup cannot see a legacy primary, so it computes `true` and collides), and
     `invalidatePlan`'s batch insert — where PostgREST sends the array as ONE statement, so a single
     colliding kind takes every other new item down with it.

   **The two mitigations, and which is primary.** The *process* one: MV-157 §J and MV-158 §J now
   require `private.mv155_backfill_personal_cases()` to be **re-run** against the hosted project as
   the last pre-merge step, with zero non-anonymous `case_id IS NULL` asserted across all nine and the
   output recorded — because counting at MV-155 apply time is not counting at merge time. The *code*
   one is defence in depth: the four paths adopt the residue onto the case and retry once, and only on
   a 23505, so a fully-backfilled user pays nothing (`lib/cases/residue.ts`). The two UPSERT-seam
   tables are deliberately excluded from the adopt — their routes run on the AUTHENTICATED client,
   which Stage 2 grants no `UPDATE (case_id)` (§4.4, §4.6), and they are the two tables whose derive
   trigger prevents the residue in the first place.

   Measured on `obfvrxixtautamflzxzq` on 2026-08-03: residue **zero on all nine tables**, and **zero**
   users without a personal case. A window to close before merge, not an outage.
4. **The policy lifecycle is two slices, not one.** Every *Policy form* row below describes what
   **MV-159** creates, including the transitional ownership disjunct.
   **MV-160 §D re-creates every one of those policies with the disjunct removed**, as step (d) of its
   migration — after its `SET NOT NULL`s, which are what make the disjunct redundant — and only then
   asserts that no predicate reads `owner`. Read each *Slice ownership* row's `policies → MV-159`
   as `policies → MV-159, disjunct removal → MV-160 §D`.
   **AND READ IT IN REVERSE THE SAME WAY — added 2026-08-05 (MV-160).** The disjunct is the **only**
   clause that leaves at MV-160, so it is the only clause that comes back on the way out. Everything
   else in these predicates — the round-3 owner-axis bound below, rule 5's parent-pointer bounds, the
   parentage clauses, `source = 'self_reported'` / `verified_by IS NULL` — is **kept** by MV-160 and
   must be **preserved**, not reconstructed, by a rollback. §10.1 R1 said only "restore the disjunct"
   and is amended 2026-08-05 for exactly that reason.

   **THE DISJUNCT HAS TWO SHAPES. AMENDED 2026-08-04 (MV-159 review round 2).** This rule used to
   describe one shape, `owner = (select auth.uid()) OR …`, and to note that MV-160's removal is
   "**strictly tightening on INSERT**, where it closes a cross-case insert the disjunct's first
   branch would have admitted". **That sentence was correct, and it was the bug report.** A
   cross-case INSERT that a Stage-2 predicate admits is a tenancy breach for the whole life of
   Stage 2; it is not a tightening to schedule for the next card. It was measured — a user who
   could not SELECT another user's assessment inserted `owner = self, case_id = <their case>,
   assessment_id = <their assessment>` into `program_predictions`, and the victim saw it in their
   own record — and it is a **regression** against legacy `pp_insert_own`, whose
   `exists (… a.owner = auth.uid())` required the actor to own the parent. On
   `application_attempts` / `outcome_events` the only thing refusing it was a legacy composite FK
   **that MV-160 drops**. So it is closed in MV-159, by shape:

   | Command | Disjunct |
   |---|---|
   | SELECT / UPDATE / DELETE (23 predicates) | `owner = (select auth.uid())` |
   | INSERT (5 predicates: ups, ds, pp, aa, oe) | `(owner = (select auth.uid()) and case_id is null)` |

   The property restored is **a row that names a case must name a case the actor can REACH**: with
   `case_id` non-null the predicate always routes through `private.actor_case_ids()`. The
   READ/UPDATE/DELETE shape keeps the bare form, because that is what holds a not-yet-backfilled
   row visible to its owner — the Stage 2 exit regression the disjunct exists to avoid.

   **AMENDED 2026-08-04 (MV-159 review round 3) — the INSERT case arm carries a THIRD conjunct, and
   the table above is only half the shape.** Bounding which CASE a row may name says nothing about
   which OWNER it may name, and the mirror (`owner = <victim>, case_id = <the actor's OWN case>`)
   was ADMITTED on all five. The full INSERT predicate is therefore:

   ```
   (owner = (select auth.uid()) and case_id is null)          <- transitional, MV-160 §D deletes
   or (
     case_id is not null
     and case_id = any ((select private.actor_case_ids())::uuid[])
     and (owner is null or owner = private.case_student_id(case_id))   <- MV-160 §D KEEPS THIS
   )
   ```

   **EVERY ARM BOUNDS BOTH AXES**, which is the invariant to hold onto rather than the syntax: the
   transitional arm pins `owner` to the actor and `case_id` to NULL; the case arm pins `case_id` to
   a reachable case and `owner` to that case's own student (`owner IS NULL` — the consultancy shape
   — is admitted unconditionally). Second property restored: **on INSERT, a non-NULL `owner` may
   only be the student of the case the row names**, which is the INSERT half of rule 2's sentence.
   MV-159 §13 (4) asserts the clause's presence at APPLY time precisely because MV-160 §D
   re-creates all five predicates — see §9.2's 2026-08-04 round-3 entry.

   MV-160's removal is therefore **behaviour-preserving on SELECT/UPDATE/DELETE** (a row's
   `case_id` provably resolves to the case whose `student_user_id` is its `owner`, and
   `private.actor_case_ids()` reaches every such case) and, now, a verifiable **no-op on INSERT**:
   on the three chain tables the arm is dead (`case_id is null` against a parentage clause that
   yields NULL, which a WITH CHECK refuses), and on the two upsert-seam tables it admits only a
   residue insert that MV-160's `SET NOT NULL` refuses with 23502 anyway. MV-160 still deletes
   **one marked line per predicate** — the shape differs, the edit does not.
5. **EVERY CLIENT-WRITABLE COLUMN ON AN INSERT SURFACE IS BOUNDED BY A CLAUSE OR RECORDED AS
   DELIBERATELY FREE — added 2026-08-05 (MV-161).** Rules 2 and 4 bound the two OWNERSHIP axes.
   They say nothing about the columns that POINT AT ANOTHER ROW, and neither did any predicate this
   project has ever shipped — including the legacy owner-only set.

   **What was measured** (`supabase/rehearsal/MV-161-supersedes.sql`, local stack, today's
   production shape). An attacker inserted a prediction **in their own case, on their own
   assessment, owned by themselves** — satisfying every axis rules 2 and 4 bound — carrying
   `supersedes_prediction_id = <a victim's prediction>`. **ADMITTED.** The column is
   `ON DELETE SET NULL`, so deleting the victim's prediction fires an **UPDATE** on the attacker's
   row, and `program_predictions_no_update` is SECURITY INVOKER and unconditional: `P0001`, for
   `service_role` too. The victim's `/api/account/delete` step 2, their parent assessment delete and
   their `auth.users` delete are all **permanently blocked, by a row they cannot see**. Re-creating
   legacy `pp_insert_own` admits the identical insert, so this is **not a Stage 2 regression** — it
   is a live pre-existing exposure that Stage 2 neither introduced nor widened.

   **The rule as it now stands.** A pointer column is bounded exactly as a parent column is:

   ```
   and (<pointer> is null or private.<target>_case_id(<pointer>) = case_id)
   ```

   `is null or …` because the pointer is nullable and NULL is what every legitimate insert carries;
   plain `=` for §4.7's recorded reason, so a NULL `case_id` yields NULL and is refused. **It goes at
   TOP LEVEL, `AND`ed after the ownership group — not inside the case arm.** Rules 2/4 put the OWNER
   bound inside the case arm because the two arms say different things about `owner`; a pointer bound
   is one sentence that must hold on every arm, so it belongs beside `private.assessment_case_id(...)
   = case_id` and `source = 'self_reported'`. The placements are provably equivalent today — the
   transitional arm requires `case_id IS NULL`, against which the parentage clause already yields
   NULL — and top level is preferred precisely because that equivalence is an argument about a
   NEIGHBOURING clause, which is the "protected by an accident" shape rounds 2 and 3 both found.

   **The enumeration is the rule, not the two conjuncts.** The pointer was never a missing probe; it
   was a column nobody had listed, so no probe had a reason to aim at it. Verb-aware and branch-aware
   completeness guards both enumerate the PREDICATE, and an unexamined column leaves no trace there.
   `tests/integration/student-data-rls.itest.ts` therefore carries a **column-axis** guard that
   enumerates the GRANT (`information_schema.column_privileges`) against the catalogue predicate, and
   fails CI on any client-writable column that is neither mentioned by its policy nor listed in
   `CLIENT_WRITABLE_EXEMPTIONS` with a reason. A stale exemption fails just as loudly.
   **44 client-writable INSERT columns across the five surfaces: 17 bounded, 27 recorded free.**

   Two exemptions are flagged **REVISIT WITH STAGE 3**: `outcome_events.decision_authority` and
   `outcome_events.verified_at` are client-settable and carry no authority **only because the same
   predicate pins `source = 'self_reported'` and `verified_by IS NULL`**. The day §6's verification
   path lets `source` be anything else, both become load-bearing.

---

### 4.1 `profiles`

| | |
|---|---|
| **Current shape** | `id` PK · `owner uuid NOT NULL UNIQUE` → auth.users CASCADE · `sections jsonb` · `completeness int` · `created_at` · `updated_at` (+ `set_updated_at` trigger) |
| **Target Stage 2 shape** | `+ case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT`; `owner` nullable; `profiles_owner_key` dropped |
| **Owner/case invariant** | §3. Profile-per-case is the domain rule; profile-per-owner is its Stage-1 shadow. |
| **Uniqueness before** | `UNIQUE (owner)` |
| **Uniqueness after** | `UNIQUE (case_id)` — **full, not partial; an `onConflict` arbiter (`upsertProfile`)** (MV-155 §E; rule 1 above) → legacy dropped at MV-160 |
| **Slice ownership** | `case_id` + index + backfill + grant rewrite → **MV-155**; `owner` nullable + `_ownership_axis_present` → **MV-156**; repositories + `onConflict` → **MV-157**; policies → **MV-159**; NOT NULL + drop `profiles_owner_key` → **MV-160** |
| **Grants before** | `authenticated`: SELECT(all), UPDATE(all). No INSERT, no DELETE. |
| **Grants after** | `authenticated`: SELECT(all), **UPDATE (sections, completeness)** — `case_id`, `owner`, `id`, `created_at`, `updated_at` all removed from the write surface. **No INSERT added in Stage 2.** |
| **Role × verb** | SELECT: O/A/C/S = **S2** · anon = — · UPDATE: O/A/C/S = **S2** (columns `sections`, `completeness` only) · INSERT: **S3 (grant)** for every role · DELETE: — (no grant, no policy; account deletion is a service-role path) |
| **Policy form** | `profiles_select_case` / `profiles_update_case`, both `to authenticated`, predicate `owner = (select auth.uid()) OR (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))`. UPDATE carries USING **and** WITH CHECK. |
| **Service-role disposition** | **Stays.** `app/api/profile/section/route.ts` is a registered `legacy-owner-scoped` exception; profile *creation* has no authenticated grant and no INSERT policy, so it remains service-role through Stage 2. MV-157 re-points its `requiredCaseCheck`; it does not leave the list. |
| **Storage path** | none |
| **Rollback** | Drop `case_id` (takes the FK + unique index with it); restore flat `UPDATE` grant; re-add `profiles_owner_key`; restore `profiles_select_own` / `profiles_update_own`. |
| **Final Stage 2 state** | `case_id NOT NULL`, unique per case, `owner` nullable and retained as provenance only, no owner-keyed unique, policies case-scoped with no owner disjunct. |

---

### 4.2 `assessments`

| | |
|---|---|
| **Current shape** | `id` PK · `owner uuid NULLABLE` → auth.users CASCADE · `result jsonb` · `rule_version` · `expires_at` · `claimed_at` · `destination_id` · `is_primary` · `profile_snapshot`. One dropped-column attnum gap. |
| **Target Stage 2 shape** | `+ case_id uuid NULLABLE REFERENCES cases(id) ON DELETE RESTRICT` — **the one column that stays nullable at MV-160**, covered instead by `CHECK (case_id IS NOT NULL OR (owner IS NULL AND claimed_at IS NULL))` |
| **Owner/case invariant** | §3, plus the anonymous carve-out: `owner IS NULL ⇒ case_id IS NULL`. A successful `SET NOT NULL` here means the anonymous rows were destroyed — treat as failure. |
| **Uniqueness before** | `assessments_primary_idx UNIQUE (owner) WHERE is_primary` |
| **Uniqueness after** | `+ UNIQUE (case_id) WHERE is_primary` — the `is_primary` predicate is the **domain** rule and stays; `AND case_id IS NOT NULL` is dropped (rule 1); not an `onConflict` arbiter (MV-155 §E), **both** live until MV-160 — the MV-158 interlock (a partial unique treats NULLs as distinct; swapping early makes two primaries per case insertable) |
| **Slice ownership** | MV-155 (`case_id`, **lookup** index `(case_id) WHERE case_id IS NOT NULL` — partial by design, it keeps anonymous rows out and is never an `ON CONFLICT` arbiter — backfill, anonymous rows left case-less); MV-158 (claim writes `owner` + `case_id` + `claimed_at` in **one** statement; **plus `healAssessmentCase`, the F2 repair for an owned row with a NULL `case_id`, added 2026-08-03** — it is the RUNTIME half of the same reconciliation MV-160 §B does in bulk, scoped `owner = caller AND case_id IS NULL` so it can never re-point an already-bound row); MV-159 (policies); MV-160 (CHECK, drop `assessments_primary_idx`) |
| **Claimed ⇒ owned, asserted 2026-08-03 (MV-158)** | MV-160 §B's CHECK also covers `claimed_at`-set rows, and MV-155's repair sweep only repairs *owned* rows — so a claimed-but-`owner`-NULL row would abort that tighten migration against live data. The claim path was *believed* to always set `owner`; nothing asserted it. It is now proved for **every** successful leg (Google-shaped session, email-OTP session with no display name, re-claim of the caller's own row) plus a corpus-level assertion that zero such rows exist, in `tests/integration/claim-path.itest.ts`. |
| **Grants before** | `authenticated`: **SELECT only.** |
| **Grants after** | **Unchanged — SELECT only.** MV-155 §H correctly excludes this table. |
| **Role × verb** | SELECT: O/A/C/S = **S2** · anon = — · INSERT / UPDATE / DELETE: **S3 (grant)** for every role. Anonymous assessment creation, refresh, and claim are and remain **service-role**. |
| **Policy form** | `assessments_select_case`, `to authenticated`, `owner = (select auth.uid()) OR (case_id is not null and case_id = any (…actor_case_ids…))`. **Anonymous rows (`owner IS NULL AND case_id IS NULL`) match neither disjunct and are therefore invisible to every authenticated client — including the user about to claim one. That is required, not incidental** (MV-159). Pair every such assertion with a service-role existence read. |
| **Service-role disposition** | **Stays, and grows in importance.** `app/api/assess/route.ts`, `/assess/refresh`, `/assess/claim`, `app/(focused)/assessment/[id]/page.tsx`, and `app/api/cron/purge-anonymous` are all registered exceptions. With no `authenticated` INSERT/UPDATE grant, there is no alternative. |
| **Storage path** | none |
| **Rollback** | Drop `case_id`; drop the CHECK; restore `assessments_select_own`. Anonymous rows are untouched throughout by construction. |
| **Final Stage 2 state** | `case_id` **nullable**, CHECK-covered, per-case primary uniqueness, legacy owner primary index dropped, `owner` retained (and `assessments_anon_purge_idx` / `assessments_owner_idx` **retained** — MV-135's 3-day purge keys on `owner IS NULL`). |

---

### 4.3 `plan_items`

| | |
|---|---|
| **Current shape** | `id bigint` PK · `owner uuid NOT NULL` → auth.users CASCADE · `kind` · `impact` · `title` · `body` · `lift_estimate` · `time_estimate` · `status NOT NULL 'todo'` · `created_at` · `completed_at` · `started_at`. No trigger. |
| **Target Stage 2 shape** | `+ case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT`; `owner` nullable |
| **Owner/case invariant** | §3 |
| **Uniqueness before** | `plan_items_kind_open_idx UNIQUE (owner, kind) WHERE status = 'todo'` (+ lookup `plan_items_open_idx (owner, created_at DESC) WHERE status='todo'`) |
| **Uniqueness after** | `+ UNIQUE (case_id, kind) WHERE status='todo'` — the `status` predicate is the **domain** rule and stays; `AND case_id IS NOT NULL` is dropped (rule 1); not an `onConflict` arbiter — plus lookup `(case_id, created_at DESC) WHERE status='todo'` — MV-155 §E. Legacy dropped at MV-160. |
| **Slice ownership** | MV-155 (column, indexes, backfill, grant rewrite); MV-156 (`owner` nullable, `_ownership_axis_present`); MV-157 (repos); MV-159 (policies); MV-160 (NOT NULL, drop `plan_items_kind_open_idx`) |
| **Grants before** | `authenticated`: SELECT(all), UPDATE(all). No INSERT, no DELETE. |
| **Grants after** | `authenticated`: SELECT(all), **UPDATE (status, completed_at, started_at)**. `case_id`/`owner`/`kind`/`title` off the write surface. **No INSERT added in Stage 2.** |
| **Role × verb** | SELECT: O/A/C/S = **S2** · UPDATE: O/A/C/S = **S2** (status transitions only) · INSERT: **S3 (grant)** · DELETE: — · anon = — |
| **Policy form** | `plan_items_select_case` / `plan_items_update_case`, transitional disjunct, USING + WITH CHECK. |
| **Service-role disposition** | **Stays.** Plan generation writes rows; `app/api/plan/action/route.ts` is a registered exception. No authenticated INSERT grant exists. |
| **Storage path** | none |
| **Rollback** | Drop `case_id`; restore flat UPDATE grant; restore `plan_items_select_own` / `plan_items_update_own`. |
| **Final Stage 2 state** | `case_id NOT NULL`, per-case open-item uniqueness, owner-keyed unique gone, plain `plan_items_owner_idx` may be dropped (nothing depends on it after MV-157) — **decide explicitly in MV-160's PR rather than implicitly.** |

---

### 4.4 `user_program_state`

| | |
|---|---|
| **Current shape** | **`PRIMARY KEY (owner, program_id)`** — no surrogate id · `owner` → auth.users CASCADE · `program_id` → programs CASCADE · `status` (CHECK) · `notes` · `created_at` · `updated_at` (+ `set_updated_at` trigger) |
| **Target Stage 2 shape** | `+ case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT`; **surrogate `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`**; composite PK dropped; `owner` nullable |
| **Owner/case invariant** | §3 |
| **Uniqueness before** | PK `(owner, program_id)` |
| **Uniqueness after** | `UNIQUE (case_id, program_id)` — **full, not partial; the `onConflict` arbiter for `upsertProgramState`, so it cannot be partial** (MV-155 §E; rule 1 above) **+** MV-156's interim `UNIQUE (owner, program_id)` — **FULL, not partial. AMENDED 2026-08-03; this cell previously read `WHERE owner IS NOT NULL`, which is UNEXECUTABLE as an arbiter.** `lib/matches/repo.ts:28` drives `upsertProgramState` with a bare `onConflict: "owner,program_id"`, and PostgREST's bare `on_conflict=` cannot infer a PARTIAL index (Postgres infers one only when the statement itself supplies the predicate) — so the partial form raises **42P10** on a live request for the whole MV-156 → MV-157 window. The predicate bought nothing anyway: **NULLs are distinct in a unique index**, so the full form already permits unlimited NULL-owner rows, which is the only thing the predicate was there to allow. Same failure as rule 1, on the owner axis. **Must also be dropped at MV-160** (§9.4) |
| **Slice ownership** | MV-155 (column, index, backfill, grant rewrite, the UPSERT-seam definer trigger — ~~**qualified `when (new.owner is not null)`**~~ **UN-qualified and re-bodied by MV-159 §1b; rule 2 above**); **MV-156 (PK replacement — a PK column cannot be nullable; this is not an `alter column`)**; MV-157 (`onConflict` string move); MV-159 (policies, incl. the INSERT owner-axis bound `private.case_student_id()`); MV-160 (NOT NULL, drop both legacy uniques) |
| **Grants before** | `authenticated`: SELECT(all), INSERT(all), UPDATE(all), DELETE. |
| **Grants after** | SELECT(all) · **INSERT (owner, program_id, status, notes, case_id)** · **UPDATE (owner, program_id, status, notes)** · DELETE. `case_id` is **in** the INSERT list and **out** of the UPDATE list — the asymmetry in MV-155 §H, and it is deliberate: INSERT creates a row (bounded by `WITH CHECK`), UPDATE re-points one. **AMENDED 2026-08-03 — this cell previously read `UPDATE (status, notes)`, which is UNEXECUTABLE; see §12 and the note below.** |
| **Why UPDATE is the payload list, not the mutable list** | `UPDATE (status, notes)` raises **42501 on the INSERT branch of the very first upsert, with no row present**. PostgREST compiles an upsert to `INSERT … ON CONFLICT DO UPDATE SET` and puts **every payload column in the SET list, including the conflict-target columns**; the privilege check happens at plan time, so neither branch is reachable. Measured against this project's own stack, incrementally: `(status,notes)` → 42501 · `(status,notes,program_id)` → 42501 · `(status,notes,owner)` → 42501 · `(status,notes,owner,program_id)` → **OK**. The shipped grant is the last of those. It is still strictly narrower than the flat table-level grant it replaces (`case_id`, `created_at` and `updated_at` all leave the surface), and §H's actual invariant is untouched: **`case_id` is in no UPDATE list, and an authenticated `update … set case_id` is 42501 under exactly these grants.** Granting `UPDATE(owner)` does not let a student move their own row to another user: `owner → another user` is **42501**. **AMENDED TWICE — READ BOTH.** *(a) 2026-08-04 (MV-159):* this cell originally said `owner → NULL` is 42501, which was true only of the LEGACY `ups_update_own` policy; under the case-aware `WITH CHECK` the case disjunct is TRUE for a row that stays in the actor's own case, so nulling `owner` became **admitted**, and the cell was amended to bless it, describing the cost as **"provenance on that row"**. *(b) **2026-08-04 (MV-159 review round 2) — that blessing is WITHDRAWN and the cost was understated.*** Measured end to end, the cost is not provenance, it is **the right to delete**: `/api/account/delete` step 2 deletes each owned table by `.eq("owner", userId)` and removes **0 rows** against a NULL-owner row; step 3 then fails **23503** on `user_program_state_case_id_fkey`, because all nine tables carry `case_id … ON DELETE RESTRICT` since MV-155. **One hand-rolled PATCH from a browser console permanently breaks that user's ability to delete their account**, with no privilege, no second account and no race. "No MeroVisa-authored caller can reach it" was true and irrelevant — the grant is on the public REST surface. The three reasons given for shipping it unpatched are also each withdrawn: the row staying in its case is not the property at issue; the "dangerous direction" argument covered `owner → another user` only and **inverted for `owner → self`**, which is the round-2 blocker; and "MV-160 admits it equally" is an argument that it never self-heals, not that it is safe. **Current behaviour: `owner → NULL`, `owner → self` on somebody else's row, and `owner → another user` are all 42501**, refused by MV-155 §H's derive trigger re-bodied as a binding guard (§4 rule 2), which is the only mechanism that can see a *transition* — a `WITH CHECK` sees only NEW, and `owner IS NULL` is legitimate on a consultancy row, so no predicate can distinguish "was null, stays null" from "was mine, now null". The guard is a trigger rather than a predicate reading `owner`, so **MV-160 §D's "no predicate reads `owner`" assertion is unaffected**. All four directions are traced and asserted in `tests/integration/case-backfill.itest.ts` and `tests/integration/student-data-rls.itest.ts`. |
| **Role × verb** | SELECT / INSERT / UPDATE / DELETE: O/A/C/S = **S2** for all four · anon = — |
| **Policy form** | Four policies — **`ups_select_case` / `ups_insert_case` / `ups_update_case` / `ups_delete_case`, the names MV-159 shipped (added 2026-08-04; this cell previously said only "four policies", and MV-160 §D re-creates them BY NAME)** — transitional disjunct, UPDATE with USING + WITH CHECK. This is one of only two tables where the assigned-counsellor **write** proof is expressible in Stage 2 (§7). **`ups_insert_case` carries the INSERT shape of the disjunct, `(owner = (select auth.uid()) and case_id is null)` — §4 rule 4 (round 2).** Without it the round-2 trigger fix would have re-opened a cross-case INSERT here: with `case_id` no longer re-derived, naming yourself as owner while naming somebody else's case would pass. **AND ITS CASE ARM CARRIES THE OWNER-AXIS BOUND `owner is null or owner = private.case_student_id(case_id)` — added 2026-08-04 round 3, recorded in this cell 2026-08-05 (MV-160), because this row is what a re-creation is transcribed from and it named only the disjunct.** The `Slice ownership` row above has said so since round 3; the two must agree. The derive trigger does **not** cover this on INSERT — its write-once clauses `return new` early on `tg_op = 'INSERT'` (§4 rule 2), so the predicate is the only thing bounding the owner axis on the path where the client chooses the value. **MV-160 §D keeps this clause while deleting the disjunct**; a rollback must put the disjunct back without disturbing it (§10.1 R1). |
| **Service-role disposition** | **Leaves the list.** `app/api/shortlist/route.ts` flips to the authenticated client at MV-157 §G — **sound only because MV-155 shipped the widened UPDATE list above. CORRECTED 2026-08-03: this cell previously read "sound, because the grant already exists", and that was false as written on two counts.** (1) The route writes through the **service-role** client today (`upsertProgramState(admin, …)`; the authenticated client on the line above is used for the auth check only), so no authenticated grant was being exercised at all. (2) The grant this cell pointed at — the pre-amendment `UPDATE (status, notes)` — would have made the flip raise 42501 on its first call. Depends on MV-155 §H's definer trigger deriving `case_id` from `owner`, because PostgREST compiles the upsert to `INSERT … ON CONFLICT DO UPDATE SET`, whose SET list would otherwise need `UPDATE(case_id)` — so **MV-157 must keep `case_id` out of the `upsertProgramState` payload**; the conflict *target* may name it, the payload may not. ~~The trigger fires only `when (new.owner is not null)`~~ **CORRECTED 2026-08-04 (MV-159 §1b): the trigger carries NO `WHEN` clause and fires on every row** (rule 2), so the personal-case path is derived **into a gap and never over an existing binding**, while the consultancy path (`owner IS NULL`) supplies its own `case_id`, bounded on BOTH axes by MV-159's `WITH CHECK`. Also depends on the `onConflict` arbiter being a **full** unique index (rule 1), or the upsert raises 42P10. |
| **Storage path** | none |
| **Rollback** | Drop `case_id`; drop the definer trigger (~~and its `WHEN` clause with it~~ — it carries none since MV-159 §1b); restore flat grants; restore the composite PK (requires no NULL owners — **this rollback expires when Stage 3 writes its first consultancy row**); restore the four `ups_*_own` policies. |
| **Final Stage 2 state** | Surrogate PK, `case_id NOT NULL`, unique per `(case_id, program_id)`, no owner-keyed unique, `owner` retained. |

---

### 4.5 `documents`

| | |
|---|---|
| **Current shape** | `id` PK · `owner uuid NOT NULL` → auth.users CASCADE · `kind` (CHECK, 20 values) · `file_path text NOT NULL` · `file_size` · `original_name` · `created_at` · `UNIQUE (owner, kind)`. Three dropped-column attnum gaps. No trigger. |
| **Target Stage 2 shape** | `+ case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT`; `owner` nullable. **Nothing else.** The header/versions replacement is Stage 4. |
| **Owner/case invariant** | §3 |
| **Uniqueness before** | `documents_owner_kind_key UNIQUE (owner, kind)` |
| **Uniqueness after** | `+ UNIQUE (case_id, kind)` — **full, not partial; the `onConflict` arbiter for `upsertDocument`** (rule 1 above); legacy dropped at MV-160 |
| **Slice ownership** | MV-155 (column, index, backfill — **no grant change needed**); MV-156 (`owner` nullable); MV-157 (`upsertDocument` `onConflict`); MV-159 (policies, incl. the two `to`-clause fixes); MV-160 (NOT NULL, drop `documents_owner_kind_key`) |
| **Grants before** | `authenticated`: SELECT(all), DELETE. **No INSERT, no UPDATE.** |
| **Grants after** | **Unchanged — SELECT, DELETE.** MV-155 §H correctly excludes this table. |
| **Role × verb** | SELECT: O/A/C/S = **S2** · DELETE: O/A/C/S = **S2** · INSERT: **S3 (grant)** · UPDATE: **S3 (grant)** · anon = — |
| **Policy form** | `documents_select_case` / `documents_delete_case`, **both gaining `to authenticated`** (today they are role `public`; only the absent grant keeps `anon` out). The `service_role` INSERT policy stays. |
| **Service-role disposition** | **Stays.** `app/api/documents/upload`, `/[id]`, `/[id]/view` are registered exceptions; upload has no authenticated INSERT grant *and* no non-service INSERT policy. |
| **Storage path** | `<owner_uuid>/<kind>/<filename>` in bucket `documents`. **See §8 — this is where the plan and the carve disagree.** |
| **Rollback** | Drop `case_id`; restore the two quoted `public`-role policies verbatim. |
| **Final Stage 2 state** | `case_id NOT NULL`, unique per `(case_id, kind)`, policies `to authenticated` and case-scoped, **object paths still owner-keyed** (§8). |

---

### 4.6 `document_status`

| | |
|---|---|
| **Current shape** | **`PRIMARY KEY (owner, kind)`** — no surrogate id · `owner` → auth.users CASCADE · `kind` (CHECK, 20 values) · `obtained bool NOT NULL true` · `updated_at NOT NULL now()` **with NO `set_updated_at` trigger**. **0 rows in production.** |
| **Target Stage 2 shape** | `+ case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT`; **surrogate `id uuid PRIMARY KEY`**; composite PK dropped; `owner` nullable |
| **Owner/case invariant** | §3 |
| **Uniqueness before** | PK `(owner, kind)` |
| **Uniqueness after** | `UNIQUE (case_id, kind)` — **full, not partial; the `onConflict` arbiter for `setObtained`** (rule 1 above) **+** MV-156's interim `UNIQUE (owner, kind)` — **FULL, not partial. AMENDED 2026-08-03; this cell previously read `WHERE owner IS NOT NULL`, which is UNEXECUTABLE as an arbiter, and here it is not hypothetical:** `lib/documents/status-repo.ts:36` drives `setObtained` with a bare `onConflict: "owner,kind"` and `app/api/documents/status/route.ts` calls it on the **authenticated** client **today**, so the partial form would have taken the live document checklist down with **42P10** the day MV-156 applied — not at some future flip. PostgREST's bare `on_conflict=` cannot infer a partial index. The predicate bought nothing: NULLs are distinct in a unique index, so the full form already permits unlimited NULL-owner rows. **Must also be dropped at MV-160** (§9.4) |
| **Slice ownership** | MV-155 (column, index, backfill, grant rewrite, the definer trigger — ~~**qualified `when (new.owner is not null)`**~~ **UN-qualified and re-bodied by MV-159 §1b; rule 2 above**); **MV-156 (PK replacement)**; MV-157 (`setObtained` `onConflict`); MV-159 (policies, incl. the INSERT owner-axis bound `private.case_student_id()`); MV-160 (NOT NULL, drop both legacy uniques) |
| **Grants before** | `authenticated`: SELECT(all), INSERT(all), UPDATE(all), DELETE. |
| **Grants after** | SELECT(all) · **INSERT (owner, kind, obtained, case_id)** · **UPDATE (owner, kind, obtained)** · DELETE. **AMENDED 2026-08-03 — this cell previously read `UPDATE (obtained)`, which is UNEXECUTABLE; see §12 and the note below.** |
| **Why UPDATE is the payload list, not the mutable list** | Same PostgREST mechanism as §4.4, and **more urgent here**: `app/api/documents/status/route.ts` already calls `setObtained` on the **authenticated** client today, so the narrow list would have taken the live document checklist down **the day MV-155 applied** — not at some future flip. Measured incrementally: `(obtained)` → 42501 · `(obtained,kind)` → 42501 · `(obtained,owner)` → 42501 · `(obtained,owner,kind)` → **OK**. Still strictly narrower than the flat grant it replaces (`case_id` and `updated_at` leave the surface), `case_id` is in no UPDATE list, and `owner → another user` is 42501 at the RLS `WITH CHECK`. **AMENDED 2026-08-04 (MV-159) — `owner → NULL` is NO LONGER refused**, for the reasons set out in §4.4's note; the row provably stays in the same case and invisible to everyone else, and MV-160's pure case predicate admits it equally. |
| **Role × verb** | SELECT / INSERT / UPDATE / DELETE: O/A/C/S = **S2** for all four · anon = — |
| **Policy form** | Four policies — **`ds_select_case` / `ds_insert_case` / `ds_update_case` / `ds_delete_case`, the names MV-159 shipped (added 2026-08-04, same reason as §4.4)** — transitional disjunct, UPDATE with USING + WITH CHECK. Second of the two tables where the counsellor write proof is expressible in Stage 2 (§7). **`ds_insert_case` carries the INSERT shape of the disjunct — §4 rule 4 (round 2), same reason as §4.4.** This is also the table the round-2 re-point was measured on. **AND ITS CASE ARM CARRIES THE OWNER-AXIS BOUND `owner is null or owner = private.case_student_id(case_id)` — added 2026-08-04 round 3, recorded in this cell 2026-08-05 (MV-160), same reason as §4.4: a re-creation is transcribed from this row, and it named only the disjunct.** On this table the clause is the one with a **measured live consequence** — it is what stops the planted `(owner = <victim>, kind = K)` row that breaks `setObtained` with `23505` forever (see this table's `Service-role disposition` cell). Not covered by the derive trigger on INSERT (§4 rule 2's early `return new`). **MV-160 §D keeps it while deleting the disjunct**; §10.1 R1 restores the disjunct without disturbing it. |
| **Service-role disposition** | **Not on the list today** — `app/api/documents/status/route.ts` already uses `createSupabaseServerClient()`. Stays authenticated; depends on MV-155 §H's definer trigger — ~~qualified `when (new.owner is not null)`~~ **un-qualified since MV-159 §1b** (rule 2) — for the same UPSERT reason as `user_program_state`, and on the `(case_id, kind)` arbiter being **full** (rule 1). **MV-157 must keep `case_id` out of the `setObtained` payload.** **AND THIS IS THE PATH THE ROUND-3 MIRROR BROKE (§9.2 (d)):** one planted `(owner = <victim>, kind = K)` row and this call returns 23505 on `document_status_owner_kind_idx` forever — the `(case_id, kind)` arbiter cannot absorb a violation of a different index, and the repo's heal path is case-scoped, so the app can neither see nor remove the planted row. The INSERT owner-axis bound is what stops the plant. |
| **Storage path** | none |
| **Rollback** | Drop `case_id`; drop the trigger; restore flat grants; restore composite PK; restore the four `ds_*_own` policies. **Trivially safe today — the table is empty.** |
| **Final Stage 2 state** | Surrogate PK, `case_id NOT NULL`, unique per `(case_id, kind)`, no owner-keyed unique. |

---

### 4.7 `program_predictions`

| | |
|---|---|
| **Current shape** | `id` PK · `owner NOT NULL` → auth.users CASCADE · `assessment_id` → assessments CASCADE · `program_id` → programs CASCADE · `verdict` (CHECK) · `rule_version` · `score_snapshot jsonb` · `supersedes_prediction_id` → self SET NULL · `predicted_at`. `UNIQUE (id, owner)` (composite-FK target) · `UNIQUE (owner, assessment_id, program_id, rule_version)`. **`program_predictions_no_update` BEFORE UPDATE → `private.reject_prediction_update()` (SECURITY INVOKER, so `service_role` does NOT bypass it).** |
| **Target Stage 2 shape** | `+ case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT`; `owner` nullable; `+ UNIQUE (id, case_id)` as the new composite-FK target; legacy `UNIQUE (id, owner)` retained through the window, dropped at MV-160 |
| **Owner/case invariant** | §3, **plus the chain invariant**: a child's `case_id` must equal its parent's. `MATCH SIMPLE` (verified, `confmatchtype='s'`) means a composite FK containing a NULL is satisfied **without any lookup** — so the case chain enforces nothing while `case_id` is nullable. MV-156's `check (owner is not null or case_id is not null)` plus the **retained owner chain** is what covers the window. |
| **Uniqueness before** | `UNIQUE (id, owner)` · `UNIQUE (owner, assessment_id, program_id, rule_version)` |
| **Uniqueness after** | `+ UNIQUE (id, case_id)` · `+ UNIQUE (case_id, assessment_id, program_id, rule_version)` (full — rule 1; predictions are insert-only, nothing upserts against it). **Both legacy uniques drop at MV-160 — including `program_predictions_owner_assessment_id_program_id_rule_ver_key`, which MV-160's drop list currently omits (§9.3).** |
| **Slice ownership** | **MV-155** (column, index, backfill **through the narrowed trigger**, and the `case_id`-in-INSERT-list grant rewrite); MV-156 (`owner` nullable, `unique (id, case_id)`, `_ownership_axis_present`); MV-157 (repos); MV-159 (policies via `private.assessment_case_id()`); MV-160 (NOT NULL, drop compensating check, drop legacy chain, restore the unconditional trigger body) |
| **Grants before** | `authenticated`: SELECT(all), INSERT(all), DELETE. **No UPDATE — and there must never be one.** |
| **Grants after** | SELECT(all) · **INSERT (id, owner, assessment_id, program_id, verdict, rule_version, score_snapshot, supersedes_prediction_id, case_id)** · DELETE. **No UPDATE grant, ever.** |
| **Role × verb** | SELECT / INSERT / DELETE: O/A/C/S = **S2** · **UPDATE: — for every role, permanently** (immutability is the point of `20260620000000`) · anon = — |
| **Policy form** | `pp_select_case` / `pp_insert_case` / `pp_delete_case`. The INSERT `WITH CHECK` is ~~TWO~~ ~~THREE~~ **FOUR** clauses (amended 2026-08-04 round 3; **amended again 2026-08-05 by MV-161, which adds the fourth — the PARENT-POINTER bound `supersedes_prediction_id is null or private.prediction_case_id(supersedes_prediction_id) = case_id`, at TOP LEVEL beside the parentage clause, per §4 rule 5**). THE POINTER CLAUSE IS THE ONE THIS TABLE NEEDED MOST AND HAD NEVER HAD: `supersedes_prediction_id` is `ON DELETE SET NULL`, so a planted cross-case pointer turns the victim's own row-delete into an UPDATE that `program_predictions_no_update` refuses with `P0001` forever — permanently blocking their `/api/account/delete`, on a row they cannot see. Measured ADMITTED under both `pp_insert_case` and legacy `pp_insert_own`, so it predates Stage 2. The remaining three clauses are: the ownership disjunct in its **INSERT shape**, `(owner = (select auth.uid()) and case_id is null)` (§4 rule 4), whose case arm now also carries the **owner-axis bound** `owner is null or owner = private.case_student_id(case_id)` — this table carries NO derive trigger, so that clause is the only thing bounding the owner axis on insert — **AND** `private.assessment_case_id(assessment_id) = <the case being written>` — the inline subquery it replaces is both an anti-recursion violation and a silent-denial hazard once `assessments` gains its own policy. **BOTH CLAUSES ARE LOAD-BEARING AND ROUND 2 MEASURED WHY (2026-08-04):** the parentage clause tests only that parent and child AGREE, never that the actor can REACH the case, so under the bare disjunct naming yourself as owner admitted a prediction into any case at all — a regression against legacy `pp_insert_own`'s `exists (… a.owner = auth.uid())`. **No UPDATE policy.** **CONSEQUENCE MADE EXPLICIT 2026-08-04 (MV-159), because it retires a property MV-156's suite asserted: the comparison is plain `=`, so a child carrying `case_id IS NULL` yields NULL and a WITH CHECK admits a row only on TRUE — an AUTHENTICATED client can therefore no longer create an owner-only, case-less chain row.** `=` rather than `is not distinct from` is deliberate and closes a hole the legacy `a.owner = uid` closed: an unclaimed anonymous assessment is `owner NULL, case_id NULL` and its id travels in a shareable URL, so a NULL-tolerant comparison would let any signed-in client hang a prediction-of-record off a stranger's assessment. Nothing live is affected — MV-157 routed every chain insert through `lib/cases/dual-write.ts`, which writes `case_id` unconditionally with no owner-only fallback — and the SCHEMA still permits the shape (`_ownership_axis_present` is a disjunct), so the service-role and backfill paths are untouched. `tests/integration/owner-nullable-rebase.itest.ts` asserts the new boundary in both directions. |
| **Service-role disposition** | `captureApplication` in `lib/outcomes/on-apply.ts` already runs RLS-scoped. Nothing to move. |
| **Storage path** | none |
| **Rollback** | Restore the unconditional `private.reject_prediction_update()` body **first**; then drop the FK/uniques; then drop `case_id`. Reverse of the apply order. |
| **Final Stage 2 state** | `case_id NOT NULL`, case-keyed composite-FK target, no owner-keyed unique, immutability trigger back to its unconditional body, still no UPDATE grant and no UPDATE policy. |

---

### 4.8 `application_attempts`

| | |
|---|---|
| **Current shape** | `id` PK · `owner NOT NULL` → auth.users CASCADE · `prediction_id NOT NULL` with **two** FKs: single-column → predictions ON DELETE CASCADE, **and** composite `(prediction_id, owner)` → `program_predictions(id, owner)` NO ACTION MATCH SIMPLE · `program_id` → programs CASCADE · `institution_id` · `intake` · `destination NOT NULL 'AU'` · `external_ref` · `created_at`. `UNIQUE (id, owner)`. No trigger. |
| **Target Stage 2 shape** | `+ case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT`; `owner` nullable; `+ UNIQUE (id, case_id)`; `+ FK (prediction_id, case_id) → program_predictions(id, case_id)`; **the single-column CASCADE FK survives** (it carries the delete semantics the composite does not) |
| **Owner/case invariant** | §3 + the chain invariant (see 4.7) |
| **Uniqueness before / after** | `UNIQUE (id, owner)` → `+ UNIQUE (id, case_id)`; legacy dropped at MV-160 **after** its dependent composite FK |
| **Slice ownership** | MV-155 (column, index, backfill, grant rewrite); MV-156 (`owner` nullable, chain rebase, `_ownership_axis_present`, covering index for the new composite FK); MV-157; MV-159 (`private.prediction_case_id()`); MV-160 |
| **Grants before** | `authenticated`: SELECT(all), INSERT(all), DELETE. No UPDATE. |
| **Grants after** | SELECT(all) · INSERT(all cols **+ `case_id`**) · DELETE. No UPDATE. |
| **Role × verb** | SELECT / INSERT / DELETE: O/A/C/S = **S2** · UPDATE: — (no grant today; **do not add one in Stage 2**) · anon = — |
| **Policy form** | `aa_select_case` / `aa_insert_case` / `aa_delete_case`; INSERT `WITH CHECK` is the ownership disjunct in its **INSERT shape** (§4 rule 4, case arm carrying the **owner-axis bound** `owner is null or owner = private.case_student_id(case_id)` — added 2026-08-04 round 3; no derive trigger on this table either) AND `private.prediction_case_id(prediction_id) = case_id`. Same plain-`=` consequence as §4.7, for the same reason (added 2026-08-04). **ROUND 2 (2026-08-04):** under the bare disjunct this table's cross-case INSERT was refused only by the legacy composite FK `application_attempts_prediction_id_owner_fkey` — **which MV-160 drops** — so the protection had a scheduled removal date and no test. |
| **Service-role disposition** | RLS-scoped already. |
| **Storage path** | none |
| **Rollback** | Drop the new composite FK → drop `UNIQUE (id, case_id)` → drop `case_id`. `2BP01` if reversed. |
| **Final Stage 2 state** | `case_id NOT NULL` (which is what makes the MATCH SIMPLE hole close), case chain live and biting with `23503`, legacy owner chain and `application_attempts_prediction_id_owner_idx` gone, single-column CASCADE FK retained. |

---

### 4.9 `outcome_events`

| | |
|---|---|
| **Current shape** | `id` PK · `owner NOT NULL` → auth.users CASCADE · `attempt_id NOT NULL` with **two** FKs (single-column CASCADE + composite `(attempt_id, owner)` MATCH SIMPLE) · `event_type`/`gate`/`decision_authority`/`source` (four CHECKs) · `occurred_at` · `occurred_on` · `verified_by` → auth.users (no ON DELETE) · `verified_at` · `detail jsonb` · `supersedes_event_id` → self SET NULL · `recorded_at`. `UNIQUE (id, owner)`. Append-only by convention (no UPDATE policy, no UPDATE grant). No trigger. |
| **Target Stage 2 shape** | `+ case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT`; `owner` nullable; `+ UNIQUE (id, case_id)`; `+ FK (attempt_id, case_id) → application_attempts(id, case_id)` |
| **Owner/case invariant** | §3 + the chain invariant |
| **Uniqueness before / after** | `UNIQUE (id, owner)` → `+ UNIQUE (id, case_id)`; legacy dropped at MV-160 after its dependent FK, then `outcome_events_attempt_id_owner_idx` as the orphaned cover |
| **Slice ownership** | MV-155 / MV-156 / MV-157 / MV-159 (`private.attempt_case_id()`) / MV-160 |
| **Grants before** | `authenticated`: SELECT(all), INSERT(all), DELETE. No UPDATE. |
| **Grants after** | SELECT(all) · INSERT(all cols **+ `case_id`**) · DELETE. No UPDATE. |
| **Role × verb** | SELECT / INSERT / DELETE: O/A/C/S = **S2** · UPDATE: — permanently (corrections are a new row + `supersedes_event_id`) · anon = — |
| **Policy form** | `oe_select_case` / `oe_insert_case` / `oe_delete_case`. The INSERT `WITH CHECK` **must retain the two integrity clauses that are not about ownership** — `source = 'self_reported'` and `verified_by IS NULL` — while replacing the inline `EXISTS` with `private.attempt_case_id(attempt_id) = case_id`. **AMENDED 2026-08-05 (MV-161): it also carries the PARENT-POINTER bound `supersedes_event_id is null or private.outcome_event_case_id(supersedes_event_id) = case_id`, at TOP LEVEL, per §4 rule 5 — which is what `private.outcome_event_case_id(uuid)`, the fourth parent-case helper, exists for (the pointer is self-referential, so §4.7's `prediction_case_id` had no equivalent here).** Plantable on identical terms to §4.7's and **harmless today** — this table has no no-update trigger, so its `ON DELETE SET NULL` succeeds and nothing locks. Bounded anyway: being harmless is a property of a trigger that does not exist yet, not of the predicate. **The owner equality is REPLACED, not dropped (amended 2026-08-04, round 3):** the case arm carries `owner is null or owner = private.case_student_id(case_id)`, which is the legacy `a.owner = auth.uid()` generalised to a case that may have a student who is not the actor — without it, `owner = <victim>, case_id = <the actor's own case>` planted a fabricated `visa_granted` **outcome event of record** in the victim's data. Dropping them while "making it case-aware" would let a client self-certify an `official_verified` outcome; both are retained and both are asserted in `tests/integration/student-data-rls.itest.ts` (added 2026-08-04). Same plain-`=` consequence as §4.7. The ownership disjunct is in its **INSERT shape** (§4 rule 4); **ROUND 2 (2026-08-04):** as with §4.8, the bare form's cross-case INSERT was refused here only by the legacy composite FK `outcome_events_attempt_id_owner_fkey`, which MV-160 drops. |
| **Service-role disposition** | RLS-scoped already. |
| **Storage path** | none |
| **Rollback** | Drop new composite FK → drop `UNIQUE (id, case_id)` → drop `case_id`. |
| **Final Stage 2 state** | `case_id NOT NULL`, case chain biting, append-only preserved, legacy owner chain + covering index gone. |

---

## 5. What Stage 2 does NOT change

Recorded so a reviewer can tell an omission from an oversight.

- **The six Stage-1 tenancy tables** get no column, no policy edit, no grant edit. The only Stage-1
  object Stage 2 touches is `public.cases`, which gains `cases_personal_student_idx`
  (`UNIQUE (student_user_id) WHERE organization_id IS NULL`) in MV-155 §A.
  - **ADDED 2026-08-03 (MV-157), because it constrains which client every caller must hand the
    resolver, and nothing in this file said it: an AUTHENTICATED client CANNOT create a personal
    case.** `cases_insert_admin` is the only INSERT policy on `cases`, and its `WITH CHECK` requires
    `organization_id IS NOT NULL` — so a student inserting their own organization-less personal case
    is refused **`42501 new row violates row-level security policy`**. Measured against this
    project's own Postgres in a rolled-back transaction, not reasoned; pinned in
    `tests/integration/case-data-access.itest.ts` §"personal case resolution".
    **Consequences, so the next slice does not re-derive them.** (1) `ensurePersonalCase` must be
    handed a **service-role** client, and its two Stage 2 callers are exactly the already-registered
    `sanctioned` account-linking exceptions (`lib/auth/finish-sign-in.ts`, plus `app/api/assess`
    and the dev harness) — so go-forward personal-case creation adds **no new service-role call
    site**. (2) No page and no ordinary route can create one; they call the read-only
    `resolvePersonalCaseId` and treat a null as "no rows yet". (3) `cases_personal_student_idx` is
    **partial**, so `ensurePersonalCase` is a read-then-insert-then-re-read that treats `23505` as a
    resolve — an upsert against a partial index is not an inferrable `ON CONFLICT` arbiter and would
    raise `42P10` (§4 rule 1, same mechanism). (4) **This is a policy fact, so widening it is
    MV-159's decision to take or refuse, not MV-157's** — Stage 2 changed no policy.
    **ANSWERED 2026-08-04: MV-159 REFUSED to widen it, and `cases_insert_admin` is unchanged.**
    Three reasons, recorded in the migration's closing omissions block so the refusal reads as a
    decision rather than an oversight: `ensurePersonalCase` is handed a **service-role** client at
    exactly two already-registered account-linking exceptions, so go-forward creation needs
    nothing; a client-side personal-case INSERT would be a **new write verb on a Stage 1 tenancy
    table**, which is precisely the "a grant change is a separate reviewed decision" MV-159
    refuses (§7); and `cases_personal_student_idx` is PARTIAL, so a client upsert against it
    raises `42P10` regardless of what any policy says. If Stage 3 or Stage 5 needs it, it arrives
    with its own review, like every other deferred verb in §6.
- **`leads`, `universities`, `programs`** — untouched. `leads` is deny-all by design.
- **Every cell of `2026-08-02-stage1-canonical-access-matrix.md`** — unmoved. If a Stage 1 suite needs
  an edit to stay green, Stage 2 moved a cell and is wrong.
- **`storage.objects`** — no policy change in Stage 2. See §8.
- **The `documents` header/versions model** — Stage 4.
- **`owner` columns** — never dropped in Stage 2. Column removal is a Stage 6 cleanup item.

---

## 6. Verbs deferred to Stage 3, enumerated

The consultancy write surface. Every one of these is blocked **by the absent `authenticated`
grant**, not by an RLS predicate, so no policy Stage 2 can write will unblock them.

| Table | Verb | Blocked by | Stage 3 must grant |
|---|---|---|---|
| `profiles` | INSERT | no grant, no INSERT policy | `INSERT (owner, case_id, sections, completeness)` + `profiles_insert_case` |
| `assessments` | INSERT | no grant, no INSERT policy | `INSERT (…, case_id)` + `assessments_insert_case` |
| `assessments` | UPDATE | no grant, no UPDATE policy | `UPDATE (is_primary, …)` + `assessments_update_case` |
| `assessments` | DELETE | no grant, no DELETE policy | only if the domain needs it |
| `plan_items` | INSERT | no grant, no INSERT policy | `INSERT (owner, case_id, kind, impact, title, body, …)` + `plan_items_insert_case` |
| `plan_items` | DELETE | no grant, no DELETE policy | only if the domain needs it |
| `documents` | INSERT | no grant; INSERT policy is `service_role`-only | `INSERT (…, case_id)` + `documents_insert_case` |
| `documents` | UPDATE | no grant, no UPDATE policy | probably never — Stage 4 replaces the model |
| `program_predictions` | UPDATE | grant absent **and** immutability trigger | **never** |
| `application_attempts` / `outcome_events` | UPDATE | grant absent by design | **never** (append-only) |

---

## 7. Resolution of the MV-159 / MV-160 grant contradiction (blocker 4)

### 7.1 The contradiction, stated against the real grant set

**MV-160 §D, final criterion** requires, as the operational proof of the Stage 2 exit gate:

> an integration test drives every migrated read *and* write path for a case with `organization_id`
> set, `student_user_id` **NULL**, and `owner` **NULL** on every row it creates, **acting as an
> assigned counsellor**: profile upsert + read, assessment, plan items, program state, document row +
> `document_status`, and the full prediction → attempt → outcome chain.

**MV-159 §"No write hole"** and its Decision log forbid the grants that would make that possible:

> This card adds **no verb and no column** to any grant … Consultancy write verbs are Stage 3 and a
> grant change is a separate reviewed decision.

**§2.7 says who is right about the facts.** An assigned counsellor is the Postgres role
`authenticated`. Against the real grant set, MV-160's proof decomposes as:

| MV-160's step | Verb needed | `authenticated` holds it? | Verdict |
|---|---|---|---|
| profile **upsert** | `profiles` INSERT | ❌ | **`42501` — impossible** |
| profile read | `profiles` SELECT | ✅ | expressible |
| **assessment** (create) | `assessments` INSERT | ❌ | **`42501` — impossible** |
| **plan items** (create) | `plan_items` INSERT | ❌ | **`42501` — impossible** |
| program state | `user_program_state` I/U/D | ✅ | expressible |
| **document row** (create) | `documents` INSERT | ❌ | **`42501` — impossible** |
| `document_status` | `document_status` I/U/D | ✅ | expressible |
| prediction → attempt → outcome | those three INSERT | ✅ | expressible |

**Four of the eight write paths MV-160 names cannot be executed by any `authenticated` client on any
policy.** MV-160's criterion is unsatisfiable as written, and it is unsatisfiable *before* a single
line of Stage 2 SQL is authored. Codex is right that this is a blocker and not a nit.

### 7.2 Decision

> **The four blocked write paths move to Stage 3. Stage 2 expands NO grant. MV-160's consultancy
> proof is narrowed to the provable subset, and the deferral is recorded with its exact grant list
> (§6) so Stage 3 inherits a specification rather than a surprise.**

**MV-160 §D's final criterion is amended to read:**

> **Read half (all nine tables, Stage 2):** acting as an assigned counsellor on a case with
> `organization_id` set, `student_user_id` NULL and `owner` NULL on every seeded row, every migrated
> **read** path returns the case's data — `profiles`, `assessments`, `plan_items`,
> `user_program_state`, `documents`, `document_status`, `program_predictions`,
> `application_attempts`, `outcome_events`. Rows are seeded service-role; the read is
> RLS-scoped. A `0 rows` result on any of the nine is a failure.
>
> **Write half (five tables, Stage 2):** the same counsellor, on the same case, executes every write
> the current `authenticated` grant set permits: INSERT/UPDATE/DELETE on `user_program_state` and
> `document_status`, and INSERT on `program_predictions` → `application_attempts` → `outcome_events`
> as a full chain, plus UPDATE on `profiles` (`sections`, `completeness`) and `plan_items` (`status`)
> against pre-seeded rows. Every one succeeds with `owner IS NULL`.
>
> **Deferred half (four tables, Stage 3), asserted as a NEGATIVE so the deferral cannot rot:** the
> same counsellor attempting INSERT on `profiles`, `assessments`, `plan_items` or `documents` is
> rejected with **`42501`**. When Stage 3 grants those verbs, this test goes red and forces the
> reviewer to the grant decision instead of letting it land unnoticed.

### 7.3 Why this resolution and not a Stage 2 grant expansion

1. **The plan's actual exit gate does not require it.** Plan line 637: *"existing students see the
   same correct data, while case-scoped repositories no longer depend on actor equals student."*
   That is a statement about **repositories**, and it is provable by MV-160 §D's type-level criterion
   ("no exported repository function takes a user id as its scoping argument"), by the nine-table
   counsellor **read**, and by the five-table counsellor **write** — all of which survive the
   narrowing. MV-160's full-write formulation over-reached the plan it cites.

2. **The Stage 0 legal gate points the same way.** Decision record D-B blocks *consultancy-entered*
   real student data pending the client-engagement agreement. `profiles` INSERT, `assessments` INSERT,
   `plan_items` INSERT and `documents` INSERT **are** the mechanism by which consultancy staff enter
   student data. Building that capability in Stage 2 would ship the gated surface one stage ahead of
   the gate, with no consent attestation (D-A live work item 2) and no APP 5 notice in place. Grant
   expansion and the legal gate should clear together, in Stage 3.

3. **No Stage 2 code path needs the grants.** All four writes are **already service-role today** and
   stay service-role through Stage 2 — `app/api/profile/section`, `app/api/assess` + `/refresh` +
   `/claim`, `app/api/plan/action`, `app/api/documents/upload` are registered `legacy-owner-scoped`
   exceptions in `lib/supabase/service-role-exceptions.ts`. MV-157 re-points their
   `requiredCaseCheck`; it does not need them to leave the list. Granting the verbs would therefore
   widen the client write surface **for zero Stage 2 caller** — the definition of an unforced hole.

4. **The enforcement boundary is not weakened by the deferral.** The plan asks for the service-role
   client to shrink to "a short, enumerated exception list — every entry named, justified, preceded by
   an explicit case authorization check, and audited." Stage 2 already delivers that for these four:
   they stay on the list, they gain a case check at MV-157, and MV-157 §G's flip of
   `app/api/shortlist/route.ts` — the one path whose grant already allows it — still happens. The list
   shrinks by one; it does not grow.

5. **MV-159 is internally right and MV-160 is internally wrong**, so the cheaper correction is the
   right one. MV-159 already names this exact temptation in its risk notes ("It is tempting … to hand
   `authenticated` the INSERT on `assessments` or `documents` that consultancy staff will eventually
   need. Don't."). Overriding it would delete a correct, reasoned guard to satisfy a criterion that
   was never checked against the grant table.

### 7.4 Consequential edits this resolution requires

- **MV-160 §D** — replace the final criterion with §7.2's three-part version; add the `42501`
  negative to `tests/integration/stage2-tighten.itest.ts`.
- **MV-159 §"No write hole"** — no change to the rule; add a pointer to §6 so the deferral is
  discoverable from the card that enforces it.
- **MV-154 (Stage 2 umbrella)** — record the deferral in the stage-exit evidence: "Stage 2 exit
  proved for read on 9 tables and write on 5; write on `profiles`/`assessments`/`plan_items`/
  `documents` deferred to Stage 3 with the grant list in
  `2026-08-02-stage2-migration-and-access-matrix.md` §6."
- **Stage 3 carve** — §6 is its input. The first Stage 3 card that grants any of those verbs must
  cite this section and must land the D-A consent attestation gate alongside it.

---

## 8. Storage: the deviation, recorded

**The plan (line ~318):**

> The migration should preserve current Storage objects initially. Existing object paths can remain
> valid while database rows gain a `case_id`. **New uploads should use the case-aware path
> convention.** Moving old objects can be a separate, verified operation.

**The carve:** every Stage 2 dossier defers **all** Storage work to Stage 4. MV-155 §Risk ("no
`storage.objects` policy retirement, no object re-pathing"), MV-159 §Risk ("Two authorization
conventions will coexist in the documents bucket, deliberately").

**These are not the same thing.** The plan splits Storage into *old objects* (leave them) and *new
uploads* (case-aware path). The carve defers both. **The carve deviates from the plan.**

### Decision

> **Accept the deviation. All Storage work — including new-upload paths — stays in Stage 4.
> Recorded here as a deliberate, dated decision with the risk stated, not as an oversight.**

**Reasoning.**

1. **A case-aware new-upload path in Stage 2 would create a bucket the shipped policies cannot
   authorize.** The live policies are `(storage.foldername(name))[1] = auth.uid()::text` (§2.8). An
   object written at `<case_id>/<kind>/<file>` matches that for **nobody** — not even its own student.
   Making new uploads case-aware therefore *forces* a `storage.objects` policy change into Stage 2,
   which is precisely the Stage 4 work both cards defer, and it would land it without the
   metadata-based authorization model Stage 4 is supposed to design.

2. **The split-path window is worse than either endpoint.** Two conventions in one bucket, with one
   policy set that only understands one of them, means every read of a Stage-2-era object needs a
   compatibility branch — in the download route, the signed-URL route, the delete route, and Stage 6's
   export/deletion jobs. Stage 4 would then have to migrate *three* populations (owner-pathed,
   case-pathed, and the mixed metadata) instead of one.

3. **Stage 2 creates no new upload volume.** Uploads are service-role and student-driven; Stage 2 adds
   no consultancy upload path (that is Stage 3, and it is behind the D-B gate). The set of objects
   written on the old convention during Stage 2 is the ordinary trickle of 6-to-8 documents' worth of
   real usage, not a migration-scale backlog.

**Risk accepted, stated plainly.**

- Every object created between MV-155 and Stage 4 lands on the **owner-keyed** path and must be
  re-pathed by Stage 4's migration. Stage 4's re-path population is therefore "all objects" rather
  than "objects predating Stage 2" — a larger set, but a *homogeneous* one, which is the trade.
- **`documents.file_path` (case-scoped row) and `storage.objects.name` (owner-scoped path) will
  disagree about the authorization model for the whole of Stages 2 and 3.** A reader examining either
  layer alone will conclude the other is buggy. That is the drift MV-159's risk note names.
- **Consultancy cases created in Stage 3 have no Auth user and therefore no valid owner-keyed path
  prefix.** Any Stage 3 upload against a `student_user_id IS NULL` case is unrepresentable under the
  current convention. **This makes Stage 4 a hard blocker for consultancy document upload, not a
  nice-to-have.** Record it on the Stage 3 carve.
- The two **orphan storage objects** (§2.8 — 8 objects, 6 `documents` rows) must be reconciled by
  Stage 4 and must not be silently absorbed into MV-160's identity-parity count.

**Amendment trigger:** if Stage 3 slips ahead of Stage 4, or if a consultancy upload path is carved
before Stage 4 lands, this decision is void and new-upload paths must be brought forward. Re-open this
section rather than working around it.

---

## 9. Where the dossiers contradict reality (or each other)

Each item is a required correction, not a note. `[R]` = dossier vs the **real hosted schema**;
`[D]` = dossier vs **dossier**; `[B]` = **board.json** summary vs the dossier it summarizes.

### 9.1 `[R]` MV-159 says the `documents` policies use bare `auth.uid()`. They do not.

MV-159 §"Proof it plans and proof it is clean" and its Decision log both assert:

> `documents` — whose two legacy policies use bare `auth.uid()` and are therefore a per-row evaluation
> this card fixes on the way past.

**Reality (§2.6):** both policies read `(( SELECT auth.uid() AS uid) = owner)` — the InitPlan form.
They were rewritten by `supabase/migrations/20260618120000_harden_advisors.sql` lines 26-32. There is
no `auth_rls_initplan` finding to fix.

**The other half of the claim is correct and must survive the correction:** both policies genuinely
carry **no `to` clause**, so they apply to `PUBLIC` including `anon`. Keep the `to authenticated` fix;
delete the `auth.uid()` rationale. An agent who "verifies" the stated defect will find it absent and
may conclude the whole criterion is stale.

### 9.2 `[R]` `document_status` has no `set_updated_at` trigger, and MV-160's excluded-field list assumes trigger behaviour it should re-derive.

MV-160 §A excludes `profiles.updated_at` and `user_program_state.updated_at` because the backfill
`UPDATE` fires `private.set_updated_at()`. ~~**That list is correct**~~ — §2.5 confirms those two
tables carry the trigger and `document_status` does not, despite having an `updated_at` column.
Recording it because the symmetry is misleading: a later reader will "notice the omission" and add
`document_status.updated_at` to the exclusion list, hollowing out the proof for no reason. The
omission is correct; `document_status.updated_at` must match exactly.

**AMENDED 2026-08-06 (MV-160) — the recommendation was right for the wrong reason, and the reason
inverts the conclusion for the other two entries. NO `updated_at` COLUMN IS EXCLUDED.**

This item told MV-160 to keep excluding `profiles.updated_at` and `user_program_state.updated_at`
because the backfill moves them. **It does not.** `private.mv155_backfill_personal_cases()` — read
from the live catalog, not from MV-155's dossier — opens with

```sql
alter table public.profiles           disable trigger profiles_set_updated_at;
alter table public.user_program_state disable trigger user_program_state_set_updated_at;
```

and re-enables both before it returns, with MV-155's own comment giving the reason: stamping
migration time onto "when did this student last edit their profile / shortlist" is **unrecoverable**,
because the rollback takes the column and not the clock. MV-155 saw this coming and suppressed the
movement. MV-160's sweep calls the same function, so it inherits the same suppression.

So both timestamps are **stable across Stage 2**, and excluding them cost the proof its only guard on
the mechanism that keeps them stable: had a later edit dropped that `disable trigger` pair, every
existing student's profile timestamp would have moved to migration time and the equivalence proof
would still have reported "equivalent". That is precisely the *"the excluded-field list is where the
proof gets quietly hollowed out"* failure MV-160's own Risk notes name. All three `updated_at`
columns are now compared exactly; the exclusion list is **eleven** entries (the nine `case_id`s and
the two MV-156 surrogate `id`s), not thirteen; and `tests/integration/stage2-data-equivalence.itest.ts`
asserts both halves — that no timestamp moved, and that the `disable`/`enable` pair is still in the
function that holds them still.

The original point of the item survives unchanged and is now general rather than special:
`document_status.updated_at` must match exactly — and so must the other two.

### 9.3 `[R]` MV-160's owner-drop list omits an owner-keyed unique constraint that exists.

MV-160 §D asserts "**no** unique constraint, primary key, or FK target on the nine migrated tables has
`owner` as a key column", then enumerates what to drop:

> `profiles.owner` unique, `assessments_primary_idx on (owner)`, `plan_items_kind_open_idx (owner, kind)`,
> `documents unique (owner, kind)` … the two legacy composite FKs … their `unique (id, owner)` targets …

**Missing from the list, present in the database (§2.3):**
`program_predictions_owner_assessment_id_program_id_rule_ver_key UNIQUE (owner, assessment_id, program_id, rule_version)`.

MV-155 §E creates its case-keyed mirror, so the replacement exists — but nothing drops the legacy one,
and MV-160's own assertion criterion would go red against its own migration. **Add it to MV-160 §D's
drop list.**

### 9.4 `[D]` MV-156's PK replacements create two more owner-keyed uniques that MV-160 does not know about.

MV-156 §33-34 replaces the PKs on `user_program_state` and `document_status` with surrogate `id`
columns and preserves the legacy rule as — **AMENDED 2026-08-03, these are the names and shapes that
actually shipped**:
```
create unique index user_program_state_owner_program_idx on public.user_program_state (owner, program_id);
create unique index document_status_owner_kind_idx      on public.document_status      (owner, kind);
```
**Both are FULL. This paragraph previously wrote them `where owner is not null`, and that form is
unexecutable in this codebase** — it is rule 1 again, arriving on the **owner** axis one slice later.
`lib/documents/status-repo.ts:36` (`setObtained`, `onConflict: "owner,kind"`, driven by
`app/api/documents/status/route.ts` on the **authenticated** client today) and `lib/matches/repo.ts:28`
(`upsertProgramState`, `onConflict: "owner,program_id"`) both name these indexes as `ON CONFLICT`
arbiters. PostgREST's bare `on_conflict=` emits a plain column list, and Postgres infers a **partial**
unique index as an arbiter only when the statement itself supplies the index predicate — so the
partial form raises **42P10** at runtime, on a live request, for the whole MV-156 → MV-157 window.
Measured in both directions in a rolled-back transaction: partial → 42P10, full → both branches
succeed. **The predicate was never load-bearing:** NULLs are distinct in a unique index, so the FULL
form already permits unlimited NULL-owner rows, which is the only behaviour the predicate was
proposed to buy.

Either way they are **owner-keyed unique indexes on migrated tables**. MV-160 §D's assertion forbids
them and MV-160 §D's drop list did not name them. Either the assertion or the drop list must move.
**Resolved here: add both to MV-160's drop list, BY THE NAMES ABOVE and with no predicate** (they are
superseded by MV-155 §E's `UNIQUE (case_id, program_id)` / `UNIQUE (case_id, kind)` once `case_id` is
NOT NULL). Recorded in §4.4, §4.6 and §10.1 R1.

### 9.5 `[B]` board.json's MV-156 summary states the compensating check MV-156 explicitly rejected.

**board.json, MV-156:**
> Mitigated by a validated **`check (case_id is not null)`** on the three chain tables (which also
> makes MV-160's `SET NOT NULL` a scan-free flip)

**MV-156's dossier**, §46 and its Decision log, rejects exactly that shape:
> The first draft shipped a validated `check (case_id is not null)` … That argument is real and it is
> outweighed: a CHECK is role-independent, `service_role` does not bypass it, and every live insert on
> those three tables today writes `owner` and no `case_id`. That draft therefore took the production
> outcomes write path down with `23514` … **Consequence accepted and handed to MV-160: its
> `SET NOT NULL` … no longer has a matching validated check to skip the verification scan.**

MV-160 §C independently confirms the disjunct is what ships and warns a migration written against the
wrong name "will simply fail to find it". **The board summary is stale and states both the rejected
constraint *and* the scan-free claim MV-160 explicitly disclaims.** An agent starting from the board
would write `alter table … drop constraint program_predictions_case_id_not_null` and get nothing.

**Correct shape, for the record:** `check (owner is not null or case_id is not null)`, named
`<table>_ownership_axis_present`, on **all eight** tables (MV-156 §45).

**DISCHARGED 2026-08-03.** The board summary was rewritten in `13c62b2` and now states the disjunct as
what ships, with the rejected `check (case_id is not null)` named only as the rejected draft and the
"no scan-free flip" consequence stated. Anything still asserting this item is out of date — including
MV-156's own migration comment, which was corrected in the same pass that wrote this line.

**BUT THE SAME SUMMARY ACQUIRED A NEW STALE CLAIM, AND IT IS THE ONE MV-156 ITSELF INVALIDATED.**
board.json's MV-156 summary said the two PK replacements each need *"a **partial** unique on the
legacy pair, and MV-160 must drop those two **partial** uniques as well"*. MV-156 shipped **FULL**
uniques for the 42P10 reason in §9.4, so an agent reading the board would hunt for a predicate that is
not in the catalog and would carry the unexecutable shape forward into MV-157 or MV-160. **Corrected
2026-08-03 in the same field**; no other field of board.json was touched. The lesson §9.4 already
carried is now twice-demonstrated: a correction that lands only in a migration comment, a Decision log
and a PR body does not reach the next slice, because the next slice reads the board and the spec.

### 9.6 `[R]` Every dossier's anonymous-assessment figures are stale; there are currently **zero** anonymous rows.

- Plan §"Current-state feasibility evidence" and MV-155 §Context: *"76 assessments (40 anonymous/
  unclaimed)"*, inspected 2026-07-23.
- MV-155 Risk: *"Giving the 40 unclaimed rows a case would take them out of MV-135's purge predicate."*

**Reality (§2.9), 2026-08-02:** 36 assessments, **0 with `owner IS NULL`**, 31 with `claimed_at` set.
MV-135's purge has run and cleared the anonymous population.

**What follows, and it is not "just update the number":**

- **MV-155's backfill is even more inert than the card expects.** With no `owner IS NULL` rows, the
  "anonymous stays case-less" behaviour has **no production data to exercise it**. It must be proven
  by synthetic seed in the itest, and the rehearsal cannot confirm it against live data.
- **MV-159's criterion "anonymous assessments stay invisible to every authenticated client" has no
  live subject either.** Same remedy: synthetic seed, paired with a service-role existence proof.
- **MV-160 §A's "anonymous assessments are in the snapshot too — by id and count"** will record a
  count of zero unless a real anonymous row appears in the rehearsal window. That is a valid snapshot,
  but a reviewer expecting 40 will read zero as a capture bug. State the expected value in the report.
- **`assessments.case_id` still must stay nullable** and the CHECK still ships. The rule is about the
  domain, not the current row count, and the population is transient by design (3-day TTL).
- MV-155 §Context already says "Re-count from the restored copy at rehearsal; do not plan against
  these numbers." That instruction is now load-bearing rather than cautious.

### 9.7 `[D]`/`[B]` Ownership of the six case-keyed uniqueness indexes is stated three different ways.

- **MV-155 §E** creates all six/seven case-keyed uniques — **FULL, not partial, as of 2026-08-02 (§4 rule 1)**; the two that keep a predicate keep it on a domain column (`is_primary`, `status = 'todo'`), never on `case_id is not null`. Unambiguous.
- **MV-157 §F and Decision log** correctly defer to MV-155: *"section F stops shipping the six
  uniqueness indexes — MV-155 §E already does … Two migrations creating the same six indexes means one
  fails on apply or is a silent no-op."* MV-157 ships **no migration**.
- **board.json, MV-157** still says MV-157 *"Moves the five uniqueness rules the plan names … as
  ADDITIVE indexes alongside the legacy owner-scoped ones"* — the pre-correction wording.
- **MV-160's Context links** also mis-attribute: *"MV-157 added the case-keyed rules alongside the
  legacy owner-keyed ones; MV-160 drops the legacy ones."*

**Canonical (this file, §4): MV-155 §E creates every case-keyed uniqueness index. MV-157 creates none
and ships no migration. MV-160 drops the legacy ones.** Correct board.json and MV-160's context link.

### 9.8 `[B]` board.json's MV-157 summary miscounts its own repository list.

> Moves all **8** student-data repositories (profiles, assessments-read, plan, matches/
> user_program_state, documents, document_status, outcomes)

Seven names for eight repositories. Minor, but it is the kind of unverifiable count MV-155 §I already
had to strip from a gate criterion (three different assertion counts for one gate). Either name the
eighth or drop the number.

**SETTLED 2026-08-03 by MV-157's builder, by counting the shipped diff rather than the prose. The
number is SEVEN, and the seven names already listed are the complete set:**
`lib/profiles/repo.ts` · `lib/assessments/repo.ts` (read side only — the write side is MV-158's) ·
`lib/plan/repo.ts` · `lib/matches/repo.ts` · `lib/documents/repo.ts` ·
`lib/documents/status-repo.ts` · `lib/outcomes/repo.ts`. There is no eighth repository; MV-157 §B's
own header ("all eight modules") carries the same off-by-one and is corrected on the card. What the
"8" appears to have absorbed is the ORCHESTRATOR layer above the repos — `lib/plan/invalidate.ts`,
`lib/outcomes/freeze.ts`, `lib/outcomes/on-apply.ts`, `lib/assessments/re-score.ts`,
`lib/journey/signals.ts` — which is five modules, not one, and which §B already lists separately.
**Drop the number rather than inventing an eighth.** board.json itself is NOT edited in this PR
(the builder was instructed to leave the generated board alone); this correction is handed to the
integrator with the rest of the board move.

### 9.8a `[D]` MV-157 §D enumerates ELEVEN Server Components and omits a twelfth case-scoped reader.

`app/(app)/layout.tsx` — the signed-in chrome — calls `getJourneySignals`, which fans out to six
case-scoped repository reads (primary assessment, profile, documents, plan, outcomes, shortlist) on
**every** signed-in page render. It is not on §D's list, and it is not on §C's route list either,
because it is neither.

Found by MV-157's builder when the compiler did **not** flag it: `getJourneySignals(supabase, string)`
still type-checked after the rename, because the parameter changed meaning from `userId` to `caseId`
without changing type. That is Risk 3's hazard on an orchestrator rather than an `onConflict` string,
and it is the reason MV-157 renames repositories but could not rename every orchestrator.

**Canonical: twelve case-scoped Server Components, the twelfth being `app/(app)/layout.tsx`.** It
resolves and authorizes exactly like a page, and degrades to *no journey marker* rather than a
redirect on a null case or a denial — wayfinding chrome must never be the thing that decides a
student cannot see their own app. The same sweep caught `app/api/outcomes/prediction/route.ts`,
which IS on §C's list but whose call to `freezePredictionForProgram(db, userId, programId)` likewise
still compiled; both are fixed in this PR.

### 9.9 `[R]` MV-159 states the anon safety net for `documents`; the same reasoning does **not** hold for `storage.objects`.

MV-159 §24 is correct that on `public.documents` the `PUBLIC`-role policies are covered because
"only the grant keeps anon out" — §2.7 confirms `anon` holds nothing on any of the nine.

**But §2.8 shows `anon` holds the full seven-privilege grant set on `storage.objects`** (Supabase
platform default, never narrowed), and the storage policies are *also* role `public`. The only thing
keeping an anonymous client out of the bucket is `auth.uid()` evaluating to NULL inside the predicate.
Sound today; there is no second line of defence. **This belongs in Stage 4's scope statement**, and it
should be recorded now rather than discovered when Stage 4 rewrites those policies.

### 9.10 `[R]` Two `storage.objects` rows have no `documents` row.

8 objects, 6 `documents` rows, 2 orphans (§2.8). MV-160 §A requires "every pre-migration row id still
exists post-migration, and the only rows Stage 2 added are the personal `cases`". The orphans are not
`documents` rows so they do not break that assertion — but they **will** surface in Stage 4's re-path
and in Stage 6's export/deletion work, and they are the kind of finding that reads as data loss when
found later. Record the count and the ids in the MV-160 equivalence report as a known pre-existing
condition.

### 9.11 `[R]` Confirmed-correct dossier claims, recorded so they are not re-litigated

Checked against §2 and found accurate: `owner NOT NULL` on exactly eight tables with `assessments`
the exception · `user_program_state` PK `(owner, program_id)` and `document_status` PK `(owner, kind)`
· both composite FKs are `MATCH SIMPLE` (`confmatchtype='s'`) · `program_predictions_no_update` exists
and its function is SECURITY INVOKER so `service_role` does not bypass it · `authenticated` holds
table-level UPDATE on exactly `profiles`/`plan_items`/`user_program_state`/`document_status` and INSERT
on exactly `user_program_state`/`document_status`/`program_predictions`/`application_attempts`/
`outcome_events` (MV-155 §H is right) · `assessments` is SELECT-only and `documents` is SELECT+DELETE
(MV-155 §H's stated omissions are right) · `anon` holds nothing on any of the nine (MV-159 right) ·
`leads` is RLS-on / 0 policies / 0 grants (MV-159 right) · RLS is **enabled and forced** on all nine
already · `auth.users` (9) is a strict superset of the nine tables' distinct owners (7), so MV-155 §A's
backfill-join argument holds · `cases_student_user_id_idx` already exists from MV-150 · every `private`
**definer** helper has PUBLIC EXECUTE revoked.

---

## 10. Stage-level reverse-order rollback

Slice-by-slice rollbacks are necessary and **not sufficient**. Once MV-156 has added the case-side
composite FKs and the `_ownership_axis_present` checks, MV-155's rollback ("drop column `case_id` ×9")
**can no longer run** — Postgres refuses to drop a column a constraint depends on, and the personal-
case delete in MV-155's step 3 would fail against `ON DELETE RESTRICT` from rows MV-156 has since
constrained. The true unwind is stage-level and strictly reverse-DAG.

### 10.1 Reverse order

Apply order is `MV-155 → MV-156 → MV-157 → MV-158 → MV-159 → MV-160`. Unwind is the exact reverse.
**Each script is valid only against the predecessor state named in its row.** Running one out of order
either fails loudly (`2BP01`, `23503`) or — the dangerous case — succeeds and leaves an unenforced
schema.

| # | Undo | Valid predecessor state (what must be true before this script runs) | Failure if run out of order |
|---:|---|---|---|
| **R1** | **MV-160** — **FIRST, re-create the live policy set — MV-159's AS AMENDED BY MV-161 — with the transitional owner disjunct restored AND EVERY OTHER CLAUSE KEPT VERBATIM** (MV-160 §D removes the disjunct as step (d) of its apply, so the undo puts it back — and it must go back *before* the column is re-widened: a pure case predicate over re-widened nullable rows makes a case-less row invisible to its own owner, silently, for the length of the window). **AMENDED 2026-08-05 (MV-160): "restore the disjunct" was this row's ENTIRE instruction for the policy step, and it is not the whole edit. A script written from the old wording RE-OPENS TWO P0s ON THE WAY BACK** — the failure mode a reverse script is least likely to be tested for, because after it every legitimate write still succeeds and only an attacker notices. **(a) The five INSERT `WITH CHECK`s carry a PERMANENT owner-axis bound** — `owner is null or owner = private.case_student_id(case_id)` (MV-159 review round 3; §4 rule 4). It is **not** the transitional disjunct, it carries **no delete marker**, and MV-160 §D **keeps** it: the shipped migration marks all five `-- KEEP: round-3 owner axis`. Drop it while restoring the disjunct and `owner = <a victim>, case_id = <the actor's own case>` is admitted again on all five — a fabricated `visa_granted` **outcome event of record** in a stranger's data (§4.9), and a **permanently broken `document_status` checklist** for a chosen kind, `23505` on `(owner, kind)` which the `(case_id, kind)` arbiter cannot absorb (§4.6). **(b) `pp_insert_case` and `oe_insert_case` carry MV-161's PARENT-POINTER bounds** at top level (§4 rule 5) — `supersedes_prediction_id is null or private.prediction_case_id(supersedes_prediction_id) = case_id` and `supersedes_event_id is null or private.outcome_event_case_id(supersedes_event_id) = case_id`. **MV-161 is not a Stage 2 slice and has no row in this table**; it closes a **pre-existing** exposure Stage 2 neither introduced nor widened, so R1 **preserves** those clauses rather than unwinding them (they leave at **R2**, by design — see that row). Drop them here and MV-161's measured account-delete lock returns: `ON DELETE SET NULL` on a planted cross-case pointer turns the victim's own delete into an UPDATE that `program_predictions_no_update` refuses with **P0001**, for `service_role` too, on a row they cannot see. **The rule for this row and any future one: the disjunct is the only clause that leaves at MV-160, so it is the only clause that comes back at R1 — everything else in a re-created policy is restored exactly as it stands in the catalog before the unwind starts.** Then re-widen `case_id` to nullable on the eight; drop the `assessments` CHECK; **re-create** the eight `_ownership_axis_present` checks; re-create `UNIQUE (id, owner)` ×3, then the two legacy composite FKs `(prediction_id, owner)` / `(attempt_id, owner)`, then `outcome_events_attempt_id_owner_idx`; re-create **all SEVEN superseded owner-keyed uniqueness rules. AMENDED 2026-08-05 (MV-160): this row named SIX and MV-160 drops SEVEN** — it omitted `program_predictions_owner_assessment_id_program_id_rule_ver_key UNIQUE (owner, assessment_id, program_id, rule_version)`, which is **§9.3**'s own finding, is in the live catalog (§2.3), and is in MV-160 §D's drop list *because* §9.3 put it there. An unwind written from the old six leaves that uniqueness rule **permanently gone** — silently, since nothing re-checks it. The seven, **by catalog kind, because `add constraint … unique` and `create unique index` are no more interchangeable on the way back than `drop constraint` and `drop index` are on the way in**: three UNIQUE **constraints** — `profiles_owner_key (owner)`, `documents_owner_kind_key (owner, kind)`, `program_predictions_owner_assessment_id_program_id_rule_ver_key (owner, assessment_id, program_id, rule_version)` (**§9.3**); four UNIQUE **indexes** — `assessments_primary_idx (owner) WHERE is_primary`, `plan_items_kind_open_idx (owner, kind) WHERE status = 'todo'`, and the two from **§9.4**, `user_program_state_owner_program_idx (owner, program_id)` and `document_status_owner_kind_idx (owner, kind)`. The two `WHERE` clauses above are **domain** predicates and are restored with the index; the §9.4 pair is **FULL**, and what may never come back on any of the seven is a `where owner is not null` predicate. **AMENDED 2026-08-03:** this row used to say only "the two from §9.4" while §9.4 quoted the partial form, so an unwind written from this table would have re-created an index PostgREST's bare `on_conflict=` cannot infer and taken the live document checklist down with **42P10** — re-introducing, during a rollback, the exact defect MV-156 corrected on the way in. Re-create them by the shapes MV-156 shipped, not by the shapes it was told to ship; restore the narrowed `reject_prediction_update()` body | Stage 2 fully applied. **Re-creating a `unique (id, owner)` requires no duplicate `(id, owner)` pairs and no NULL owners in those rows** — true only if Stage 3 has written nothing. | Re-create the FKs before their unique targets → `42830`. Re-widen `case_id` **without** re-creating `_ownership_axis_present` → the MATCH SIMPLE hole reopens **silently**; nothing complains. This is the one step whose misordering does not fail loudly. |
| **R2** | **MV-159** — re-apply the **pre-Stage-2 (legacy owner)** policy set verbatim, then drop the **FIVE** new `private` helpers (`actor_case_ids`, `assessment_case_id`, `prediction_case_id`, `attempt_case_id`, **`case_student_id`**). **AMENDED 2026-08-05 (MV-160): this row said FOUR and MV-159 ships FIVE** — `case_student_id` is review round 3's owner-axis helper, the one the five INSERT `WITH CHECK`s and the re-bodied derive trigger both call (§4 rule 4). **The shipped script is already right and only this prose was wrong**, which is the point: it drops five, with the count and the reason in its own header. Two further facts a full-unwind author needs, recorded here 2026-08-05: **(i) `private.outcome_event_case_id(uuid)` is MV-161's, not MV-159's, and is NOT R2's to drop** — it is left orphaned but harmless (EXECUTE revoked from PUBLIC), and MV-152's Stage 1 helpers are untouched for the reason the script states. **(ii) R2 IS WHERE MV-161's PARENT-POINTER BOUNDS LEAVE, and that re-opens a live P0 by design, not by oversight** — restoring `pp_insert_own` / `oe_insert_own` verbatim restores predicates that admit the cross-case `supersedes_*` plant (§4 rule 5 measured it ADMITTED under the legacy policies too, which is why it is a **pre-existing** exposure rather than a Stage 2 regression). It leaves here by the same principle this row already applies to the `documents` `to authenticated` fix — a rollback that silently keeps a fix is a second unreviewed migration — but a founder authorizing a full unwind is authorizing the return of MV-161's account-delete lock, and that must be said out loud rather than discovered. **SHIPPED 2026-08-04 as `supabase/rehearsal/MV-159-rollback.sql`** — one transaction (a table with RLS FORCED and zero policies returns zero rows to every client, so no session may observe the gap), with guards that refuse unless MV-159 is applied AND MV-160 is not. It restores the two `documents` policies **without** their `to authenticated` clause, i.e. with the `PUBLIC`-role defect MV-159 fixed, because a rollback that silently keeps the fix is a second unreviewed migration; the closing assert re-checks that `anon` still holds no grant, which is what makes that safe. | R1 done. Policy-only, so exact and instant. **No point of no return: it mutates no data and can be re-run.** | Dropping a helper while a policy still references it → `2BP01`. Drop policies **first**, helpers second. Running it AFTER MV-160 would restore `(select auth.uid()) = owner` over `owner IS NULL` consultancy rows and hide them from the counsellor who owns the case, silently — Guard 2 refuses that. |
| **R3** | **MV-158** — revert the claim path to the owner-only bind | R2 done. Any assessment claimed under the case model keeps a valid `owner`, so no data repair is needed — **this is only true because MV-158 binds `owner` and `case_id` in one statement**. If it ever regressed to two statements, R3 needs a repair pass for owned-but-case-less rows. | Reverting the code while MV-159's case-only policies are still live hides claimed assessments from their owners. |
| **R4** | **MV-157** — revert repositories/routes to `.eq("owner", …)`; restore the service-role exception registry entries that flipped | R3 done, **and MV-159 reverted (R2) so the owner-only predicate still authorizes**. Code-only: MV-157 ships no migration. | Reverting repositories while MV-159's policies are live = every read returns 0 rows for a case-scoped actor. |
| **R5** | **MV-156** — drop the two case-side composite FKs, then the three `UNIQUE (id, case_id)` targets, then their covering indexes; drop all eight `_ownership_axis_present` checks; restore the composite PKs on `user_program_state` / `document_status` and drop the surrogate `id` columns; `SET NOT NULL` on `owner` ×8 | R4 done. **`SET NOT NULL` on `owner` succeeds only while no NULL-owner row exists** — i.e. only before Stage 3's first consultancy row. **This is the stage's hard rollback expiry.** Restoring a composite PK requires no NULL owners and no duplicate `(owner, program_id)` / `(owner, kind)` pairs. | Drop the unique targets before their FKs → `2BP01`. `SET NOT NULL` with a consultancy row present → `23502`, and the only way forward is deleting consultancy data. |
| **R6** | **MV-155** — restore the unconditional `private.reject_prediction_update()` body **first**; `alter table … drop column case_id` ×9 (takes the FKs and all case indexes with it); drop MV-155 §H's definer trigger on `user_program_state` / `document_status`; restore the flat table-level `UPDATE`/`INSERT` grants on the **seven** rewritten tables (`profiles` + `plan_items` for UPDATE; `user_program_state` + `document_status` + `program_predictions` + `application_attempts` + `outcome_events` for INSERT — **corrected 2026-08-03 from "six"**, which would leave one table holding a column list naming a dropped column); `drop index cases_personal_student_idx`; delete the personal cases | R5 done — **no constraint may still depend on `case_id`**. **The personal-case delete is valid only until MV-157 merges**; after a live create-or-resolve path exists, a blanket `delete from cases where organization_id is null and student_user_id is not null` destroys cases created by real signups and must be narrowed to a recorded id list. **THE ID LIST IS PRODUCED BY THE FORWARD MIGRATION AND MUST BE CAPTURED AT APPLY TIME — amended 2026-08-03.** `private.mv155_backfill_personal_cases()` returns `personal_case_ids` (a `jsonb` array) in its report, which the migration emits via `raise notice`; `supabase/rehearsal/README.md` §"Applying MV-155 to production" step 4 makes capturing that notice a numbered step. Nothing reconstructs the list after the fact: `created_by`, `student_user_id`, `operational_status` and `organization_id` all take values a real MV-157 signup also takes, and the inserts do not go through `private.write_audit_event`. Restoring the trigger body **before** dropping the column, so no window exists where predictions are updatable. | Drop `case_id` while an MV-156 FK still references it → `2BP01`. Delete personal cases while student-owned rows still reference them → `23503` from `ON DELETE RESTRICT`. Delete them after MV-157 without an id list → **irreversible data loss.** Note step 7 also **cascades** into `case_assignments` and `invitations` (both `case_id` ON DELETE CASCADE); for MV-155-minted personal cases both are empty, but the cascade is real and a non-empty one would go silently. |

### 10.2 Two properties this ordering exists to preserve

1. **There is never an instant, mid-unwind, where a row is unconstrained on both axes.** R1
   re-creates `_ownership_axis_present` in the same script that re-widens `case_id`; R5 does not drop
   those checks until the case chain is already gone and `owner` is about to become `NOT NULL` again.

   **AMENDED 2026-08-05 (MV-160) — "both axes" now names TWO different things, and this property only
   ever covered one of them.** As written above it is about the **stored row**: the
   `_ownership_axis_present` CHECK, which says a row must carry an `owner` or a `case_id`. §4 rule 4's
   *every arm bounds both axes* is about the **row being written**: the five INSERT `WITH CHECK`s bound
   which case a row may name **and** which owner it may name, and §4 rule 5 adds the parent-pointer
   bound on two of them. Both senses now hold across the unwind — but the second one holds **only
   because R1 is now written to preserve those clauses**. Under R1's previous wording ("re-create
   MV-159's policy set with the transitional owner disjunct restored", full stop) every INSERT
   predicate would have come back bounding the case axis and nothing else. **That failure is not an
   instant. It is the terminal state of the rollback** — which makes it strictly worse than the
   mid-unwind window this property was written to exclude, and is why it is stated here as well as in
   the row.
2. **The expiry is stated, not discovered.** Two steps have hard expiries — R6's personal-case delete
   (expires when MV-157 merges) and R5's `SET NOT NULL` on `owner` (expires when Stage 3 writes its
   first consultancy row). Both must be written **into the scripts** as a refusal guard, not only into
   this table. After both expire, Stage 2 is effectively irreversible and the recovery path is a
   restore from backup — **which is itself a decision the founder should make knowingly, at the point
   MV-157 merges.**

### 10.3 Rehearsal obligation

Every script R1-R6 is rehearsed on the restored copy of live data in the same session that rehearses
the forward migration, **as a full reverse sweep R1→R6 and then a full re-apply**, not as six
independent spot checks. MV-155 §G already requires replay-and-re-apply for its own slice; this
generalizes it to the stage. A slice whose rollback has only ever been tested in isolation has not
been tested against the state it will actually meet.

---

## 11. D-A data map — discharged

Stage 0 decision record D-A, live work item 1: *"Data map — every table and Storage path assigned to a
layer; grey-zone rule: **the uploader determines the layer**."* The layers are **Platform** (MeroVisa),
**Case** (consultancy, MeroVisa acting on instructions), and **Student-contributed** (MeroVisa,
visible to the consultancy under the case).

### 11.1 The nine student-owned tables

| Table | Layer | Basis |
|---|---|---|
| `profiles` | **Split — the uploader rule governs, row by row** | D-A puts "staff-entered profile and financial detail" in **Case** and "whatever the student enters through their own claimed account" in **Student-contributed**. A `profiles` row is a single `sections jsonb` blob, so the layer is a property of *who wrote the section*, not of the table. **Consequence: `profiles.sections` needs per-section provenance before Stage 3 writes staff-entered detail into it.** Not a Stage 2 deliverable — but it is a Stage 3 blocker discovered here, and it is the sharpest edge in the whole data map. Stage 2, where every row is student-derived, is uniformly **Student-contributed**. |
| `assessments` | **Platform** | D-A: "assessment and scoring outputs". Generated by MeroVisa's rules engine from student input; `profile_snapshot` and `result` are MeroVisa's determinations. Anonymous rows are Platform with no case at all. |
| `plan_items` | **Platform** | D-A: "generated plan". MeroVisa determines content and impact; the student determines only `status`/`completed_at`/`started_at` — which is exactly the Stage 2 UPDATE column list (§4.3), so the split is already structural. |
| `user_program_state` | **Student-contributed** | The student's own shortlist/applied/withdrawn decisions plus free-text `notes`. Not a MeroVisa determination and not staff-entered in Stage 2. |
| `documents` | **Student-contributed** in Stage 2; **grey zone from Stage 3** | Every current row is a student upload through their own account. From Stage 3, staff-requested/staff-uploaded documents arrive and the **uploader rule** decides per row. **This requires an uploader marker on the row, which the current schema has no column for.** Stage 4's header/versions replacement must carry it — recorded here as a D-A-derived requirement on Stage 4, not a Stage 2 change. |
| `document_status` | **Student-contributed** in Stage 2; **grey zone from Stage 3** | A student's own "I have this" checklist today. A counsellor recording a review decision is Case-layer. Same uploader-marker requirement as `documents`. |
| `program_predictions` | **Platform** | D-A: "matches" / scoring outputs. Immutable MeroVisa determination — which is why the immutability trigger is a data-protection control and not only an integrity one. |
| `application_attempts` | **Platform** | Outcome-validation telemetry. Derived from student action but recorded and shaped by MeroVisa for calibration. |
| `outcome_events` | **Platform** | Same, and D-A's "telemetry" plus "platform retention defaults" apply. `source`/`verified_by`/`decision_authority` are MeroVisa's provenance fields — the reason §4.9 forbids dropping the `source = 'self_reported'` clause. |

### 11.2 The six Stage-1 tenancy tables (for completeness — the map must be total)

| Table | Layer |
|---|---|
| `organizations`, `organization_memberships`, `invitations` | **Case** — the consultancy's own team and engagement structure |
| `cases` | **Case** for consultancy cases (`organization_id` non-null); **Platform** for the personal cases MV-155 mints (`organization_id IS NULL`) — those are derived from an Auth account MeroVisa already holds |
| `case_assignments` | **Case** — D-A: "assignment" |
| `audit_events` | **Platform** — D-A: "security and audit records" |

### 11.3 Non-student tables

`leads` — **Platform** (MeroVisa's own marketing capture; RLS-on/deny-all). `universities`, `programs`
— reference data, no personal information, unassigned.

### 11.4 Storage paths

| Path | Bucket | Layer | Notes |
|---|---|---|---|
| `<owner_uuid>/<kind>/<filename>` | `documents` (private) | **Student-contributed** | The only convention in use today; all 8 objects. Uploader is always the student through their own account. |
| The 2 orphan objects (§2.8) | `documents` | **Student-contributed**, presumed | No `documents` row to attribute them to. Reconcile in Stage 4; if provenance cannot be established, treat as Student-contributed and include in any student export/deletion. |
| *(future)* `<case_id>/…` | `documents` | **Grey zone — uploader rule** | Does not exist yet (§8). When Stage 4 introduces it, the object's layer follows its uploader: student upload → Student-contributed; staff upload → Case. **This is the concrete reason the object needs an uploader marker in metadata, not only a case-scoped path** — the path alone cannot express the layer. |

### 11.5 What this discharges, and what it does not

**Discharged:** every table and every Storage path in the system now carries a layer assignment.
D-A work item 1 is satisfied for the current schema.

**Explicitly left open, with an owner:**

1. **`profiles.sections` per-section provenance** — blocks Stage 3's staff-entered profile detail
   (§11.1). Carve it on the Stage 3 board before any consultancy write path is built.
2. **An uploader marker on documents** — blocks the grey-zone rule from being *mechanically* applied
   rather than assumed. Belongs to Stage 4's header/versions model.
3. **Re-assignment on claim.** When an anonymous assessment is claimed (MV-158), a Platform-layer row
   with no case acquires a case. Its layer does not change — it stays Platform — but its *visibility*
   does. Recorded so nobody re-derives it as a layer change.
4. This map is **point-in-time with §2**. Any Stage 2 or Stage 3 migration adding a table or a Storage
   path must add a row here in the same PR. That is the standing form of D-A work item 1.

---

## 12. Decision log

- **2026-08-02** — Written by the integrator session in response to the Codex NEEDS REWORK review of
  PR #113, discharging blocker 1 (no committed per-table migration/access matrix) and blocker 4 (the
  MV-159/MV-160 grant contradiction). Grounded in a live capture of `obfvrxixtautamflzxzq`, not in the
  plan's prose — the Stage 1 root cause was six slices each deriving a matrix independently.
- **2026-08-02** — **Blocker 4 resolved: no grant expansion in Stage 2.** The four blocked write paths
  (`profiles`, `assessments`, `plan_items`, `documents` INSERT) move to Stage 3 with their exact grant
  list in §6, and MV-160's consultancy proof is narrowed to read-on-nine + write-on-five, with the
  deferral pinned by a `42501` negative assertion so it cannot rot. Reasoning in §7.3: the plan's exit
  gate does not require the writes; D-B gates consultancy-entered data to Stage 3; no Stage 2 caller
  needs the grants (all four are already service-role); and MV-159's refusal to widen is correct.
- **2026-08-02** — **Storage deviation accepted (§8).** The plan asks for case-aware *new-upload*
  paths; the carve defers all Storage to Stage 4. Deferral upheld, because a case-aware path would
  match no shipped `storage.objects` policy and would force the Stage 4 policy rewrite into Stage 2
  without its authorization model. Risk stated: every Stage 2/3 object lands owner-keyed, the two
  layers disagree for two stages, and **Stage 4 becomes a hard blocker for consultancy document
  upload** because a `student_user_id IS NULL` case has no valid owner-keyed prefix.
- **2026-08-02** — **Rollback is defined at stage level, reverse-DAG (§10).** Slice rollbacks are not
  composable: after MV-156, MV-155's "drop column `case_id`" cannot run. Two hard expiries are named
  and must be encoded as refusal guards in the scripts — R6's personal-case delete expires when MV-157
  merges; R5's `SET NOT NULL` on `owner` expires when Stage 3 writes its first consultancy row.
- **2026-08-02** — **The `assessments` anonymous population is currently ZERO (§9.6).** Every dossier
  plans against "40 anonymous/unclaimed" from 2026-07-23. MV-135's purge has cleared them. The
  case-less behaviour must be proven by synthetic seed; the rehearsal cannot exercise it against live
  data; the nullable `case_id` and its CHECK still ship because the rule is about the domain, not the
  row count.
- **2026-08-02** — **D-A work item 1 discharged (§11)**, with three open items handed to owners:
  `profiles.sections` per-section provenance (Stage 3 blocker), a documents uploader marker (Stage 4),
  and the standing rule that any new table or Storage path adds a row to §11 in the same PR.
- **2026-08-02** — **Three collisions BETWEEN the blocker fixes, found on a second pass and resolved
  here as §4 rules 1-3.** Each was produced by one correct fix meeting another correct fix, which is why
  none existed before the first pass and none was visible from a single card.
  **(a) ~~The UPSERT-seam definer trigger is qualified `when (new.owner is not null)`.~~ SUPERSEDED
  2026-08-04 — it carries no `WHEN` clause; see the amendment at the end of this entry and §4 rule 2.** MV-155 §H
  specified it to derive `case_id` from `owner` on every write and to *overwrite* any supplied value;
  blocker 4's fix then narrowed MV-160 §D to require counsellor INSERT/UPDATE/DELETE on exactly those
  two tables with `owner IS NULL`. An `owner IS NULL` row has nothing to derive from, and the overwrite
  destroys the only value that could identify its case — the two criteria were mutually unsatisfiable.
  Qualifying the trigger ~~keeps the re-pointing hazard closed on the owner-set branch and~~ moves the
  bound on the owner-null branch to MV-159's `WITH CHECK`, which is the right layer for what is an
  authorization question. Rejected alternative: re-narrow MV-160 §D to owner-set writes, which would
  delete the one Stage 2 proof that a write path needs no Auth user — the property Stage 3 depends on.
  **AMENDED 2026-08-04 (MV-159 review round 2): the struck clause was false, and inverted.** The
  overwrite did not close the re-pointing hazard on the owner-set branch — it *was* the mechanism of
  one, because a BEFORE ROW trigger runs before the `WITH CHECK` and `owner` is in the UPDATE grant,
  so `set owner = <self>` re-derived a client's row onto the actor's OWN case and the check then
  admitted it. The qualifier was also excluding `owner → NULL`, the transition that breaks account
  deletion. MV-159 §1b keeps the CONCLUSION of this note — the owner-null branch is bounded by the
  `WITH CHECK`, and the derive still fills a gap it finds — while removing the `WHEN` clause and
  making both axes write-once. §4 rule 2 is the current statement.
  Residual seam recorded rather than hidden: a consultancy row written through an **upsert** still needs
  `UPDATE(case_id)`; no Stage 2 caller does that, and it joins §6's Stage 3 list.
  **(b) The case-keyed uniques are FULL, not partial.** `where case_id is not null` makes an index
  uninferrable by PostgREST's bare `on_conflict=`, so MV-157 §F's only remaining job — moving every
  `onConflict` target onto them — would have raised **42P10** at runtime, and §4.4's stated dependency
  on that path was false. Confirmed empirically in both directions against the project's own Postgres in
  a rolled-back transaction. NULLs are distinct in a unique index, so dropping the predicate costs
  nothing during the nullable window; the two indexes that keep a predicate keep it on a **domain**
  column (`is_primary`, `status = 'todo'`) and neither is an arbiter.
  **(c) MV-160 ships the policy rewrite that drops MV-159's transitional owner disjunct.** MV-159 stated
  four times that the removal was MV-160's; MV-160 held no policy DDL anywhere, only an assertion that
  no predicate reads `owner` — which would have gone red against MV-159's own correct output, with ~20
  policies owned by nobody in executable form. It lands as step (d) of MV-160's migration, after the
  `SET NOT NULL`s that make the disjunct redundant. Recorded alongside it: MV-159's transitional-window
  test cannot survive those `SET NOT NULL`s **whatever** happens to the policies — the case-less fixture
  becomes unseedable (`23502`) — so MV-160 §E's "MV-159's suites pass UNEDITED" was already false before
  this change. It now carries one named exception: the deletion of a single isolated block that MV-159
  is required to keep free of any matrix cell.
- **2026-08-02** — Eleven dossier/board/reality contradictions recorded in §9, each with the required
  correction. Two would have produced a migration that cannot apply (§9.3 owner-keyed unique omitted
  from MV-160's drop list; §9.4 MV-156's replacement uniques unknown to MV-160), one would have sent
  an agent hunting a defect that no longer exists (§9.1), and one would have had an agent drop a
  constraint by a name that will never be in the database (§9.5).
- **2026-08-03** — **§4.4 and §4.6's `UPDATE` grant cells were WRONG, and are amended to the grants
  MV-155 actually shipped: `UPDATE (owner, program_id, status, notes)` and `UPDATE (owner, kind,
  obtained)`.** Discovered by MV-155's builder while implementing §H, by measurement rather than
  reasoning. `UPDATE (status, notes)` and `UPDATE (obtained)` are **unexecutable**: PostgREST compiles
  an upsert to `INSERT … ON CONFLICT DO UPDATE SET` and puts every payload column in the SET list
  including the conflict-target columns, and the privilege check happens at plan time — so both raise
  **42501 on the INSERT branch of the first call, with no row present and neither branch reachable**.
  Probed incrementally against this project's own stack; the ladders are recorded in the two cells.
  **The widening is justified and bounded:** both lists are still strictly narrower than the flat
  table-level grants they replace, `case_id` is in **no** UPDATE list anywhere (§H's actual
  invariant), and `UPDATE(owner)` grants no new power — `owner → another user` and `owner → NULL` are
  both refused **42501** by the existing `ups_update_own` / `ds_update_own` `WITH CHECK`, since a WITH
  CHECK admits a row only on TRUE and `auth.uid() = NULL` is NULL. Both directions are asserted in
  `tests/integration/case-backfill.itest.ts` rather than left to this prose.
  **Consequences for downstream slices, stated so they are not re-derived:** MV-159's "assert the
  grant set is unchanged" baseline is the **post-MV-155** set above, not the pre-MV-155 table-level
  set; MV-160's §4.4/§4.6 "final Stage 2 state" reads from these amended cells. §4.4's
  service-role-disposition remark *"sound, because the grant already exists"* was **false as written**
  and is corrected in place: `app/api/shortlist/route.ts` writes through the service-role client
  today, so no authenticated grant was in play, and the grant it named would have 42501'd the flip.
  Recorded here under §1 rule 3, which this entry extends to cells the spec determines wrongly.
- **2026-08-03** — **§10.1 R6 amended: the rollback's `personal_case_ids` list now has a producer.**
  R6's non-destructive path (the only correct one once MV-157 has merged) required an id list that
  nothing generated — the migration's only output was a `raise notice` of COUNTS, and no column
  distinguishes an MV-155-minted case from a real MV-157 signup. `private.mv155_backfill_personal_
  cases()` now returns `personal_case_ids` in its report and `supabase/rehearsal/README.md` makes
  capturing it a numbered apply step. R6's "six rewritten tables" is corrected to **seven** in the
  same pass, and its cascade into `case_assignments` / `invitations` is noted.
- **2026-08-03** — **§4.4, §4.6, §9.4 and §10.1 R1 were WRONG about MV-156's two replacement uniques,
  and are amended to the shape that shipped: `user_program_state_owner_program_idx (owner, program_id)`
  and `document_status_owner_kind_idx (owner, kind)`, both FULL, neither carrying
  `WHERE OWNER IS NOT NULL`.** Discovered by MV-156's builder while implementing the PK replacements,
  by measurement rather than reasoning — the same way MV-155's builder found the `UPDATE` grant cells.
  **This is §4 rule 1 arriving on the OWNER axis one slice later, and the mechanism is identical:**
  Postgres infers a PARTIAL unique index as an `ON CONFLICT` arbiter only when the statement itself
  supplies the index predicate, PostgREST's `on_conflict=` emits a bare column list, and the privilege
  of naming the index belongs to code that is live **today** and that MV-157 has not yet re-pointed —
  `lib/documents/status-repo.ts:36` `setObtained` (`onConflict: "owner,kind"`, driven by
  `app/api/documents/status/route.ts` on the **authenticated** client) and `lib/matches/repo.ts:28`
  `upsertProgramState` (`onConflict: "owner,program_id"`). The partial form therefore raises **42P10**
  at runtime, on a live request, for the whole MV-156 → MV-157 window; the document checklist would
  have gone down the day MV-156 applied. Probed in both directions against this project's own Postgres
  in a rolled-back transaction: partial → 42P10, full → both the INSERT and the DO UPDATE branch
  succeed. **The predicate was never load-bearing** — NULLs are distinct in a unique index, so the FULL
  form already permits unlimited NULL-owner rows, which is the only behaviour the predicate was
  proposed to buy; both stated verifications (23505 on a duplicate non-null pair, two NULL-owner rows
  accepted) hold unchanged and are pinned in `tests/integration/owner-nullable-rebase.itest.ts` §J.
  **The §10.1 R1 correction is the one with teeth:** that row's unwind said "the two from §9.4" while
  §9.4 quoted the partial form, so unwinding Stage 2 from this table would have *re-created* the
  broken shape mid-rollback. **Also corrected in the same pass:** MV-160 §D's drop list (which named
  the partial form), MV-160 §D's "re-keyed onto `case_id`" description of the two PK replacements
  (nothing was re-keyed onto `case_id` — a `case_id`-keyed PK is impossible while `case_id` is
  nullable, which is MV-160's own job to change, so a surrogate `id` was the only available shape),
  and board.json's MV-156 `summary`, whose "partial unique" wording was the newly-stale claim §9.5's
  discharged item left behind. Recorded here under §1 rule 3.
- **2026-08-03** — **MV-157 + MV-158 (one PR): four amendments, all found by measurement, none of
  which contradicted a §4 cell — which is itself worth recording, because it means the per-table
  matrix survived first contact with the code that has to satisfy it.** What this file was missing
  was one policy fact and two counts.
  **(a) §5 — an AUTHENTICATED client cannot create a personal case.** `cases_insert_admin`'s
  `WITH CHECK` requires `organization_id IS NOT NULL`, so a student inserting their own
  organization-less case is refused `42501`. Probed in a rolled-back transaction. It is the fact
  that decides which client every caller hands `ensurePersonalCase`, and it was nowhere in this
  file — §5 said only that `cases` gains an index. Recorded with its four consequences, including
  that widening it is **MV-159's** call to take or refuse, since Stage 2 changes no policy.
  **(b) §9.8 — the repository count is SEVEN, settled by counting the diff.** There is no eighth
  repository; the "8" appears to have absorbed the five-module orchestrator layer that §B already
  lists separately. board.json is deliberately NOT edited in that PR (the builder was instructed to
  leave the generated board alone) and the correction is handed to the integrator.
  **(c) §9.8a — MV-157 §D enumerates eleven Server Components and there are TWELVE.**
  `app/(app)/layout.tsx` reads six case-scoped repositories on every signed-in render.
  **The way it was found is the transferable part:** the compiler did not flag it, because
  `getJourneySignals(supabase, string)` still type-checks when the parameter changes meaning from
  `userId` to `caseId` without changing type. MV-157's rename discipline (`…ForUser` → `…ForCase`)
  makes the compiler enumerate REPOSITORY call sites; it does nothing for orchestrators whose
  scoping argument is a bare `string`. `app/api/outcomes/prediction/route.ts` was caught by the same
  sweep. **Stage 3 should expect this class again** — a positional `string` scoping argument is
  invisible to a rename.
  **(d) §4.2 — the claimed ⇒ owned invariant is now ASSERTED, not believed**, and `healAssessmentCase`
  is added to that table's slice ownership as the runtime half of MV-160 §B's bulk reconciliation.
- **2026-08-03** — **§1 rule 3 is now an explicit, per-card acceptance criterion on every remaining
  Stage 2 slice, because stating it once in this file did not work twice running.** MV-155 and MV-156
  each had a builder correctly discover this spec was wrong, correctly ship the right thing, and
  correctly report it — in a Decision log and a PR body, and **not** in this file. Both times the
  amendment had to be made afterwards by a reviewer, and in MV-156's case the un-amended cell was one
  a rollback would have executed. Prose in §1 is read once at the start of a slice; an unticked
  acceptance criterion is read at the end, when the contradiction is actually known. MV-157, MV-158,
  MV-159 and MV-160 now each carry the criterion verbatim, and MV-154 carries it as a stage-level rule.
- **2026-08-03** — **§4 rule 3 added: MV-155 residue BREAKS rather than degrades, for one population
  neither MV-157 nor MV-158 named.** Found by the three-lens review of PR #119. The cards reason about
  "a user with no personal case" (which degrades to an empty state, correctly) and never about "a user
  who HAS a personal case but owns rows the one-shot backfill did not reach". For the second, the
  `case_id` conflict target does not match the case-less row, the write takes the INSERT branch, and a
  still-live legacy owner-keyed unique raises 23505 — a hard failure on profile save, document upload,
  the assessment persist and `invalidatePlan`'s batch insert. The claim path reaches it directly:
  STEP 3's `getProfileForCase` cannot see an owner-set / case-null profile, so it decides to bootstrap
  one and collides on `profiles_owner_key`. The remedy is stated in rule 3 and is two-part — MV-157 §J
  and MV-158 §J now **re-run** `private.mv155_backfill_personal_cases()` as the last pre-merge step
  instead of counting at MV-155 apply time, and the four write paths adopt-and-retry on a 23505 as
  defence in depth. Production measured the same day: **zero** residue on all nine tables, **zero**
  users without a personal case — so the exposure is the window between that measurement and the
  merge, which the re-run closes.
- **2026-08-03** — **§3's "one defence" is now literally true; it was previously approximately true.**
  The invariant section and `lib/cases/dual-write.ts` both assert that no repository signature accepts
  both `owner` and `caseId`, and MV-160 §D is being designed around that assertion. Four `owner:`
  write payloads lived outside the choke point, all on `assessments`, and `claimAssessment` took both
  axes as independent parameters — on the one table whose `case_id` stays nullable at MV-160 and whose
  `owner IS NULL` drives MV-135's purge. Three were routed through the choke point (`claimAssessment`
  now takes one derived `ownership` value; `/api/assess` and the dev sign-in harness spread the same).
  The fourth, `createAnonymousAssessment`'s literal `owner: null`, is **not** a counter-example and is
  recorded here as the single named exception: it writes a row with no case at all, which is the
  anonymous carve-out itself, so there is no pair that can diverge. MV-160 §D's payload sweep should
  allow-list exactly that site, by that reason.
- **2026-08-03** — **The four id-keyed reads on §4.7/§4.8/§4.9 now carry a `case_id` filter.**
  `getPredictionById`, `getAttemptById`, `listAttemptsForPrediction` and `listEventTypesForAttempt`
  selected by a CLIENT-SUPPLIED id with no case predicate, resting on "RLS scopes to the owner". That
  is a description of a policy **MV-159 is about to replace** — the moment the owner disjunct leaves,
  they become unscoped reads of an id the caller chose, in a card that is not looking at this file.
  They now take the already-authorized `caseId`, which puts the read inside the boundary the route
  established and does so while the legacy policy is still there to catch a mistake rather than after
  it is gone. No grant or policy changes; MV-159 should not treat these as blocked paths.
- **2026-08-04** — **MV-159 shipped the 24 case-aware policies and 4 definer helpers, and found
  THREE places this file was wrong or silent. All three are amended above, in the cells, not only
  here.** The per-table §4 *Policy form* matrix survived contact with the SQL — every policy is a
  transcription of its cell — so what moved was a second-order consequence, a name gap, and an
  unanswered question this file had explicitly assigned to this card.
  **(a) §4.4/§4.6 said `owner → NULL` is refused 42501. That is a property of the LEGACY policy
  MV-159 replaces, and it stops holding.** The case-aware `WITH CHECK`'s second disjunct is TRUE
  for a row that stays in the actor's own case, so an authenticated client may now null `owner` on
  its own row. Measured, not reasoned: the shipped assertion in `case-backfill.itest.ts` went red
  against a correct migration. ~~It ships UNPATCHED and the three reasons are in §4.4~~ —
  **SUPERSEDED 2026-08-04 by the round-2 entry below. It ships PATCHED; all three reasons were
  wrong or beside the point, and the "residual loss is provenance" framing was an understatement
  of a right-to-delete break.**
  **(b) §4.7-§4.9's parentage clause is plain `=`, and that RETIRES a property MV-156's suite
  asserted.** A child carrying `case_id IS NULL` compares NULL against any parent, and a WITH CHECK
  admits only TRUE — so an authenticated client can no longer create an owner-only chain row, and
  `owner-nullable-rebase.itest.ts`'s "an authenticated user can still write owner-only rows on all
  three chain tables" went red. `=` is this file's own wording and it is load-bearing rather than
  incidental: `is not distinct from` would compare TRUE against an unclaimed ANONYMOUS assessment
  (`owner NULL, case_id NULL`, id shareable in a URL) and let any signed-in client hang a
  prediction-of-record off a stranger's assessment — which the legacy `a.owner = uid` refused.
  Nothing live is affected (MV-157 routed every chain insert through `lib/cases/dual-write.ts`,
  which writes `case_id` unconditionally and has no owner-only fallback) and the SCHEMA still
  permits the shape, so the service-role and backfill paths are untouched. The MV-156 assertion is
  inverted rather than deleted, with the reasoning on it.
  **(c) §5's open question — may an authenticated client create its own personal case — is
  ANSWERED: REFUSED.** `cases_insert_admin` is unchanged. Reasoning in §5.
  **Also recorded, because they are facts the next slice inherits rather than decisions:** the 24
  policy names and 4 helper names MV-160 §D re-creates are now in §4.4/§4.6/§4.7-§4.9 and in the
  migration header; the rollback R2 exists as a real file with guards (§10.1); and MV-153's
  `readGrantedWriteSurface()` had a BLIND SPOT this card had to fix before its completeness guard
  meant anything — INSERT was read from `role_table_grants`, and MV-155 §H's **column-level**
  INSERT grants write no row there, so five of the nine reported "no INSERT grant" while holding
  one. It now reads INSERT from `column_privileges`; the six Stage 1 tables are unaffected.
- **2026-08-04** — **MV-159 REVIEW ROUND 2: two security blockers, both caught BEFORE the migration
  was applied to production, both fixed in the same PR.** The mechanics of round 1 held up — the
  helpers cannot recurse, the calls are InitPlan-hoisted, the 9x4 coverage matrix is complete, no
  grant widened, the anonymous row is invisible, MV-135's purge and MV-158's claim are untouched.
  Both blockers were in the `WITH CHECK` predicates and in the probes that should have caught them.
  **(a) CROSS-CASE INSERT VIA THE OWNER DISJUNCT.** `(owner = auth.uid() OR <case arm>)` is
  satisfied unconditionally by naming yourself as owner, and on the three chain tables the only
  other clause tests that parent and child AGREE, never that the actor can REACH the case. Measured:
  a user who could not SELECT another user's assessment inserted `owner = self, case_id = <their
  case>, assessment_id = <their assessment>` into `program_predictions`, and the victim saw it in
  their own record. A **regression** against legacy `pp_insert_own`. `aa`/`oe` were refused only by
  legacy composite FKs **MV-160 drops**. §4 rule 4 had *predicted* this ("strictly tightening on
  INSERT, where it closes a cross-case insert the disjunct's first branch would have admitted") and
  scheduled the fix for MV-160; a cross-case INSERT admitted for the life of Stage 2 is a breach,
  not a tightening to schedule. **Fixed:** the five INSERT predicates take the disjunct's INSERT
  shape, `(owner = (select auth.uid()) and case_id is null)` — §4 rule 4's table. Property restored:
  *a row that names a case must name a case the actor can reach.*
  **(b) A CLIENT COULD CARRY A ROW OUT OF ITS CASE, AND MV-160 DID NOT CLOSE IT.** §13 of the
  migration and this file both claimed re-pointing was "unexpressible" because `case_id` is in no
  UPDATE grant. But `owner` **is** in the UPDATE grant on `user_program_state` / `document_status`,
  a BEFORE ROW trigger fires *before* the `WITH CHECK`, and MV-155 §H's derive trigger performed an
  unconditional `new.case_id := …`. Measured: an assigned counsellor issued ONE
  `PATCH /rest/v1/document_status` with `{"owner":"<own uid>"}` against a client's consultancy row
  and the row's `case_id` became the counsellor's own personal case, invisible to the client's org
  admin. **Not transitional** — MV-160's pure case predicate admits it identically. **Fixed** at the
  trigger (§4 rule 2): `case_id` and `owner` are both write-once, and `owner` may only become the
  student of the row's own case. The `WHEN (new.owner IS NOT NULL)` clause was removed because
  `owner → NULL` is the one transition it excluded — see (c).
  **(c) `owner → NULL` WAS NOT A PROVENANCE LOSS, IT WAS A RIGHT-TO-DELETE BREAK**, and the
  understatement was the justification for shipping it unpatched. `/api/account/delete` step 2
  deletes by `.eq("owner", userId)` (0 rows), step 3 then fails 23503 on the `ON DELETE RESTRICT`
  case FK. One PATCH from a browser console, permanently. The round-1 entry above is marked
  superseded rather than rewritten, and §4.4's cell carries both amendments in order.
  **(d) THE PROBES COULD NOT SEE EITHER BLOCKER.** All eight cross-boundary write probes passed
  `owner: null`, so every `WITH CHECK` was exercised through its case branch only, and the
  completeness guard derived coverage **per verb** from `information_schema` — full coverage over
  probes that all took one path. The guard is now **branch-aware**: it enumerates the top-level OR
  arms of every `WITH CHECK` out of `pg_policy` and requires a cross-boundary probe aimed at each.
  Scoped to `WITH CHECK` deliberately — a `USING` clause matches a row that already exists and the
  actor cannot steer which arm fires, and §E's fixture covers both arms by construction.
  **(e) MV-160 INHERITED THREE COUPLED BLOCKS, NOT THE PROMISED ONE.** The disjunct-shape assertion
  and the `InitPlan 2` count were both coupled to the disjunct MV-160 removes. The first MOVED into
  the single transitional block; the second was rewritten as "an InitPlan and no SubPlan", which is
  MV-160-durable and a strictly stronger statement. The promise is now true by construction.
- **2026-08-04** — **MV-159 REVIEW ROUND 3: one security blocker — the MIRROR of round 2's, on the
  axis round 2's fix did not touch. Caught before the migration reached the hosted project.**
  **(a) THE FIVE INSERT PREDICATES BOUNDED WHICH CASE A ROW MAY NAME, AND NOTHING BOUNDED WHICH
  OWNER.** Round 2's hole was *name yourself owner, point `case_id` at the victim's case*; the
  mirror is *name the VICTIM owner, point `case_id` at YOUR OWN case*, and the victim then saw the
  row through the transitional `owner = (select auth.uid())` SELECT disjunct. §4 rule 2 and MV-159
  §1b both **claimed** the property — "`owner` is write-once … and the only value it may be given
  is the student of the row's own case" — but the trigger's write-once clauses return early on
  `tg_op = 'INSERT'`, so the property did not hold on the path where the client chooses the value.
  Measured over real PostgREST with real JWTs, two ordinary students: `POST` with
  `{owner: B, case_id: <A's own case>}` **ADMITTED** on all five INSERT-granted tables, `GET` as B
  returned them, and — planting B-owned parents first so the legacy composite owner FKs are
  satisfied down the chain — B ended up with a fabricated `visa_granted` **outcome event of
  record**. A **regression**, not a pre-existing gap: legacy `ups_insert_own`
  (`with check (owner = auth.uid())`) refuses the identical insert with 42501.
  **(b) THE SHARPEST CONSEQUENCE IS A DENIAL OF SERVICE ON THE ONE LIVE STUDENT-FACING PATH.** After
  A plants `(owner = B, kind = 'toefl')` on `document_status`, B's own `setObtained` (§4.6, the one
  table of the nine with no service-role fallback behind it) returns **23505 on
  `document_status_owner_kind_idx`** — forever. The upsert arbiter is `(case_id, kind)` and the
  violated index is `(owner, kind)`, so `ON CONFLICT` cannot absorb it, and the repo's heal path is
  case-scoped, so the app can neither see nor remove the planted row. ONE REST CALL PERMANENTLY
  BREAKS AN ARBITRARY VICTIM'S CHECKLIST FOR A CHOSEN DOCUMENT KIND. Those rows also fail
  `private.mv155_assert_case_backfill()` — MV-160 §B's exit gate — turning a data-integrity incident
  into a stage-exit blocker needing hand cleanup.
  **(c) FIXED IN THE PREDICATE, NOT THE TRIGGER, AND THE REASON IS COUNTING.** New helper
  `private.case_student_id(uuid)` (§1a, SECURITY DEFINER, `search_path = ''`, EXECUTE revoked from
  PUBLIC then granted to `authenticated`), and each of the five INSERT `WITH CHECK`s gains a third
  conjunct **inside its case arm**: `owner is null or owner = private.case_student_id(case_id)`. So
  EVERY arm of every INSERT predicate now bounds BOTH axes — the transitional arm pins `owner` to
  the actor and `case_id` to NULL; the case arm pins `case_id` to a reachable case and `owner` to
  that case's own student. The obvious-looking alternative — drop the trigger's early
  `return new` — was **rejected because the trigger exists on two of the five tables**
  (`program_predictions`, `application_attempts` and `outcome_events` carry none, rule 3), so it
  would have closed two holes and left three; and because `OLD` is unassigned in a PL/pgSQL INSERT
  trigger, so clause (c) needs a `tg_op` guard around every `old.*` reference to be reachable at
  all. §1b clause (c) now reads the SAME helper, so the UPDATE and INSERT halves cannot drift.
  **(d) IT IS ASSERTED AT APPLY TIME, NOT ONLY TESTED.** MV-159 §13 gains **(4)**: every one of the
  five INSERT policies must still name `case_student_id` in its `WITH CHECK`, and all five must
  exist. The case axis is self-announcing (drop it and the counsellor suite goes red immediately);
  the owner axis is **not** — drop it and every legitimate write still works, because
  `caseWriteColumns` / `caseBindColumns` / `caseUpsertColumns` all derive `owner` from
  `cases.student_user_id` and never accept it from a caller. Only an attacker notices. **MV-160 §D
  re-creates all five policies; if its re-creation drops this clause, the apply FAILS** rather than
  silently re-opening the mirror.
  **(e) THE PROBES COULD NOT SEE IT, AGAIN, AND FOR A NEW REASON.** Round 2 made the completeness
  guard **branch-aware**, and it stayed green: the mirror aims at the SAME case arm the existing
  probes aim at, differing only in the value of a column the predicate never read. Arm coverage
  cannot see an unbounded column. The suite now carries the behavioural probe (all five tables,
  asserting `42501` **specifically** — "any error" would have stayed green through MV-160's FK drop,
  since `23503` refuses some shapes today) plus a structural probe pinning the clause text.
  Mutation-tested: reverting the clause turns both red with *admitted*.
- **2026-08-03** — **A failed case-scoped read now THROWS (`CaseReadError`) instead of rendering as
  no-data.** MV-133 shipped this idiom for the catalogue; MV-157 re-introduced the defect on the case
  axis — `resolvePersonalCaseId` ended `if (error || !data) return null` with no log, and
  `lib/documents/repo.ts`, `lib/documents/status-repo.ts` and `getOutcomesForCase` did not destructure
  `error` at all. The failure that hid is precisely the one both cards gate the merge on: a hosted
  database without MV-155's migration answers **42703** to every migrated read, and the product would
  have rendered as "you have no data" rather than as an outage. `null` / `[]` is now reserved for the
  query that answered with nothing.
- **2026-08-05** — **MV-160: §10.1's R1 row was wrong twice, and BOTH defects are in the ROLLBACK
  direction only — the forward migration is unaffected. Amended under §1 rule 3 / MV-160 A0, in the
  cells and in the rows, not only here.** The forward apply had been reviewed three times; the reverse
  script had been reviewed by nobody, because nothing has ever executed it. That asymmetry is the
  lesson, and it generalizes past this stage: **a rollback row is prose until it is run, and every
  correction that lands only on the forward path silently invalidates it.**
  **(a) R1's re-create list named SIX owner-keyed uniques and MV-160 drops SEVEN.** The omission is
  `program_predictions_owner_assessment_id_program_id_rule_ver_key UNIQUE (owner, assessment_id,
  program_id, rule_version)` — **§9.3's own finding**, present in the live catalog (§2.3), and in
  MV-160 §D's drop list *because* §9.3 put it there. §9.3's correction reached the drop list and never
  reached the undo list, so an unwind written from R1 would have left that uniqueness rule permanently
  gone, with nothing to notice: no error, no failing assert, just a constraint that used to exist.
  R1 now names all seven and cross-references §9.3 the way it already cross-references §9.4, and it
  groups them **by catalog kind** — three UNIQUE constraints, four UNIQUE indexes — because
  `add constraint … unique` and `create unique index` are no more interchangeable coming back than
  `drop constraint` and `drop index` were going in (MV-160's migration flags the same distinction at
  its step (h)).
  **(b) R1's policy instruction was "re-create MV-159's policy set with the transitional owner disjunct
  restored", full stop — and a script written from it RE-OPENS TWO P0s ON THE WAY BACK.** This is the
  failure mode a reverse script is least likely to be tested for: after it, every legitimate write
  still succeeds and only an attacker notices. **(i)** MV-159 review round 3 added a **permanent**
  owner-axis bound to the five INSERT `WITH CHECK`s — `owner is null or owner =
  private.case_student_id(case_id)`. It is not the disjunct, it carries no delete marker, and MV-160
  §D **keeps** it (all five marked `-- KEEP: round-3 owner axis` in the shipped SQL). Restore the
  disjunct while dropping it and `owner = <a victim>, case_id = <the actor's own case>` is admitted
  again on all five — the fabricated `visa_granted` outcome event of record (§4.9) and the
  permanently-broken `document_status` checklist (`23505` on `(owner, kind)`, which the
  `(case_id, kind)` arbiter cannot absorb — §4.6). **(ii)** MV-161 added parent-pointer bounds to
  `pp_insert_case` / `oe_insert_case` and amended §4 (rule 5) and the §4.7/§4.9 policy-form cells —
  **but not §10.1**. MV-161 is not a Stage 2 slice and has no R-row, so R1 must **preserve** its
  clauses rather than unwind them; dropping them returns MV-161's measured account-delete lock
  (`P0001`, `service_role` included, on a row the victim cannot see).
  **The general rule now stated in both directions (§4 rule 4):** the disjunct is the only clause that
  leaves at MV-160, therefore the only clause that comes back at R1; everything else is preserved, not
  reconstructed.
  **Also corrected in the same pass, all the same class — a place that describes the policy set as if
  the round-3 or MV-161 clauses do not exist:** **§10.1 R2**'s helper list said FOUR and MV-159 ships
  **FIVE** (`case_student_id` is round 3's; the shipped `supabase/rehearsal/MV-159-rollback.sql` drops
  five and says so in its own header — only this prose was stale), with two facts added to that row:
  `private.outcome_event_case_id(uuid)` is MV-161's and is **not** R2's to drop, and **R2 is where
  MV-161's pointer bounds legitimately leave**, re-opening a pre-existing P0 by the same principle
  that row already applies to the `documents` `to authenticated` fix — said out loud because a founder
  authorizing a full unwind is authorizing that return. **§4.4 and §4.6's *Policy form* cells** named
  the disjunct's INSERT shape and not the owner-axis bound, while their own *Slice ownership* cells
  named it — and the *Policy form* row is what a re-creation is transcribed from (§12, 2026-08-04:
  "every policy is a transcription of its cell"). §4.7/§4.8/§4.9 already named it; those two now do
  too, with the note that the derive trigger does **not** cover the owner axis on INSERT because its
  write-once clauses `return new` early on `tg_op = 'INSERT'`. **§10.2 property 1** was left
  ambiguous by all of this: "unconstrained on both axes" meant the stored row's
  `_ownership_axis_present` CHECK, and §4 rules 4/5 have since given "both axes" a second meaning
  about the row being **written**. Both senses now hold across the unwind, the second only because R1
  is now written to preserve those clauses — and the property records that the policy version of the
  hazard is **not an instant but the terminal state**, which is worse than the mid-unwind window the
  property was written for.
  **No access-control cell changed.** Every edit in this entry corrects a rollback description or a
  stale policy-form description to match what shipped; the matrix is untouched.

- **2026-08-06 — MV-160 §A/§D: two spec cells corrected against the live catalog, and neither was
  discoverable by reading the sibling dossiers.**
  **(1) §9.2's excluded-field recommendation is REVERSED.** It blessed MV-160 §A's exclusion of
  `profiles.updated_at` and `user_program_state.updated_at` on the ground that the backfill `UPDATE`
  fires `private.set_updated_at()`. Measured: `private.mv155_backfill_personal_cases()` **disables
  both triggers** for the duration of the backfill and re-enables them before returning — MV-155
  suppressed the movement deliberately, because the rollback takes the `case_id` column and not the
  clock, so a stamped timestamp is unrecoverable. The exclusions were therefore covering for a
  mechanism nobody was guarding: dropping that `disable trigger` pair would move every existing
  student's timestamp to migration time and the proof would still have said "equivalent". Exclusion
  list is now **eleven** entries, all three `updated_at` columns are compared exactly, and the
  `disable`/`enable` pair is asserted structurally in `stage2-data-equivalence.itest.ts`.
  **(2) MV-160 §D's single allowlisted `owner:` payload names the wrong file.** The card registers
  "MV-157's writer helper (`lib/cases/dual-write.ts`)". `lib/cases/dual-write.ts` performs **no
  write**: it reads `cases`, derives `{ case_id, owner }` and returns the fragment, which its callers
  spread into their own payloads. It carries no `.insert(`/`.upsert(`, so a payload-scoped detector
  never sees it. The one literal `owner:` write payload in the tree is `lib/assessments/repo.ts`'s
  `createAnonymousAssessment` (`owner: null` on a case-less row — the §3 anonymous carve-out), which
  MV-157 §E's own header already nominates for this allowlist by this reason. The **count** the card
  fixes at one is right; the path is not. The card's separate requirement — that deleting the
  dual-write must also turn the sweep red — is carried by a choke-point assertion (exports +
  importers) rather than by a payload entry, since a module the detector cannot see cannot be pinned
  by one. Both mutations measured red: deleting the module, and unhooking one repository from it.
  **No access-control cell changed.** Both edits correct a claim about data-shape or source
  structure; the matrix is untouched.
