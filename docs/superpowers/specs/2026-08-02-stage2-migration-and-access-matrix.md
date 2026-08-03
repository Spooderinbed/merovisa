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
MV-155 §H's UPSERT-seam definer trigger (the one qualified `when (new.owner is not null)` — §4 rule 2) are all in that class.

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

**Four rules that apply across every table below, recorded once here so nine cells do not each state
them differently.** Rules 1, 2 and 4 were added 2026-08-02; **rule 3 was added 2026-08-03** from the
MV-157/MV-158 review, which found a residue class the cards had not named.

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
2. **MV-155 §H's UPSERT-seam definer trigger fires only `when (new.owner is not null)`.** With `owner`
   set it derives `case_id` from that owner's personal case and **overwrites** any supplied value (the
   re-pointing hazard stays closed). With `owner IS NULL` the row is consultancy-created, there is
   nothing to derive from, the trigger does not fire, and the **statement-supplied `case_id` is
   honoured** — bounded by MV-159's `WITH CHECK`, not by the trigger. Unqualified, the trigger's
   overwrite hardening destroyed the only `case_id` an `owner IS NULL` row could carry, which made
   MV-160 §D's counsellor-write proof (INSERT/UPDATE/DELETE on these two tables "each succeeding with
   `owner IS NULL`") unsatisfiable by construction. Residual seam, no Stage 2 caller, recorded as a
   Stage 3 input: a consultancy row written through an **upsert** must supply `case_id`, so its
   `ON CONFLICT DO UPDATE SET` list needs `UPDATE(case_id)`, which Stage 2 does not grant — MV-160 §D
   drives plain statements, and MV-157 keeps `case_id` out of both upsert payloads.
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
   **MV-159** creates, including the transitional `owner = (select auth.uid()) OR …` disjunct.
   **MV-160 §D re-creates every one of those policies with the disjunct removed**, as step (d) of its
   migration — after its `SET NOT NULL`s, which are what make the disjunct redundant — and only then
   asserts that no predicate reads `owner`. Read each *Slice ownership* row's `policies → MV-159`
   as `policies → MV-159, disjunct removal → MV-160 §D`. The removal is behaviour-preserving on
   SELECT and UPDATE (a row's `case_id` provably resolves to the case whose `student_user_id` is its
   `owner`, and `private.actor_case_ids()` reaches every such case) and **strictly tightening on
   INSERT**, where it closes a cross-case insert the disjunct's first branch would have admitted.

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
| **Slice ownership** | MV-155 (column, index, backfill, grant rewrite, the UPSERT-seam definer trigger **qualified `when (new.owner is not null)`** — rule 2 above); **MV-156 (PK replacement — a PK column cannot be nullable; this is not an `alter column`)**; MV-157 (`onConflict` string move); MV-159 (policies); MV-160 (NOT NULL, drop both legacy uniques) |
| **Grants before** | `authenticated`: SELECT(all), INSERT(all), UPDATE(all), DELETE. |
| **Grants after** | SELECT(all) · **INSERT (owner, program_id, status, notes, case_id)** · **UPDATE (owner, program_id, status, notes)** · DELETE. `case_id` is **in** the INSERT list and **out** of the UPDATE list — the asymmetry in MV-155 §H, and it is deliberate: INSERT creates a row (bounded by `WITH CHECK`), UPDATE re-points one. **AMENDED 2026-08-03 — this cell previously read `UPDATE (status, notes)`, which is UNEXECUTABLE; see §12 and the note below.** |
| **Why UPDATE is the payload list, not the mutable list** | `UPDATE (status, notes)` raises **42501 on the INSERT branch of the very first upsert, with no row present**. PostgREST compiles an upsert to `INSERT … ON CONFLICT DO UPDATE SET` and puts **every payload column in the SET list, including the conflict-target columns**; the privilege check happens at plan time, so neither branch is reachable. Measured against this project's own stack, incrementally: `(status,notes)` → 42501 · `(status,notes,program_id)` → 42501 · `(status,notes,owner)` → 42501 · `(status,notes,owner,program_id)` → **OK**. The shipped grant is the last of those. It is still strictly narrower than the flat table-level grant it replaces (`case_id`, `created_at` and `updated_at` all leave the surface), and §H's actual invariant is untouched: **`case_id` is in no UPDATE list, and an authenticated `update … set case_id` is 42501 under exactly these grants.** Granting `UPDATE(owner)` does not let a student move their own row to another user: `owner → another user` is **42501, `new row violates row-level security policy`**. **AMENDED 2026-08-04 (MV-159) — this cell also said `owner → NULL` is 42501, and that was true only of the LEGACY `ups_update_own` policy, which MV-159 replaces.** Under the case-aware `WITH CHECK` the second disjunct (`case_id = any(actor_case_ids())`) is TRUE for a row that stays in the actor's own case, so **nulling `owner` on one's own row is now ADMITTED**. It is not a hole and it was not patched, for three measured reasons: the row cannot leave the case (`case_id` is in no UPDATE list, so it is unchanged, and the row stays invisible to everyone else); the dangerous direction is still closed by the MV-155 §H derive trigger, which fires `when (new.owner is not null)` and re-derives `case_id` onto the NEW owner's personal case, which the actor cannot reach; and it is the END STATE rather than a transitional wrinkle — MV-160's pure case predicate admits it equally, because `owner` stops being the authorization axis, which is the point of Stage 2. Closing it would need a predicate that reads `owner` outside the one line MV-160 deletes, and MV-160 §D asserts no predicate reads `owner`. What is genuinely lost is **provenance on that row**: `owner … on delete cascade` no longer reaches it, which is Stage 6's `owner`-column removal to settle. No MeroVisa-authored caller can reach it (`lib/supabase/types.ts` types `owner` non-nullable; every write goes through `lib/cases/dual-write.ts`, which derives `owner` and never nulls it). Both directions are traced and asserted in `tests/integration/case-backfill.itest.ts`. |
| **Role × verb** | SELECT / INSERT / UPDATE / DELETE: O/A/C/S = **S2** for all four · anon = — |
| **Policy form** | Four policies — **`ups_select_case` / `ups_insert_case` / `ups_update_case` / `ups_delete_case`, the names MV-159 shipped (added 2026-08-04; this cell previously said only "four policies", and MV-160 §D re-creates them BY NAME)** — transitional disjunct, UPDATE with USING + WITH CHECK. This is one of only two tables where the assigned-counsellor **write** proof is expressible in Stage 2 (§7). |
| **Service-role disposition** | **Leaves the list.** `app/api/shortlist/route.ts` flips to the authenticated client at MV-157 §G — **sound only because MV-155 shipped the widened UPDATE list above. CORRECTED 2026-08-03: this cell previously read "sound, because the grant already exists", and that was false as written on two counts.** (1) The route writes through the **service-role** client today (`upsertProgramState(admin, …)`; the authenticated client on the line above is used for the auth check only), so no authenticated grant was being exercised at all. (2) The grant this cell pointed at — the pre-amendment `UPDATE (status, notes)` — would have made the flip raise 42501 on its first call. Depends on MV-155 §H's definer trigger deriving `case_id` from `owner`, because PostgREST compiles the upsert to `INSERT … ON CONFLICT DO UPDATE SET`, whose SET list would otherwise need `UPDATE(case_id)` — so **MV-157 must keep `case_id` out of the `upsertProgramState` payload**; the conflict *target* may name it, the payload may not. The trigger fires only `when (new.owner is not null)` (rule 2), so the personal-case path is derived-and-overwritten while the consultancy path (`owner IS NULL`) supplies its own `case_id`, bounded by MV-159's `WITH CHECK`. Also depends on the `onConflict` arbiter being a **full** unique index (rule 1), or the upsert raises 42P10. |
| **Storage path** | none |
| **Rollback** | Drop `case_id`; drop the definer trigger (and its `WHEN` clause with it); restore flat grants; restore the composite PK (requires no NULL owners — **this rollback expires when Stage 3 writes its first consultancy row**); restore the four `ups_*_own` policies. |
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
| **Slice ownership** | MV-155 (column, index, backfill, grant rewrite, the definer trigger **qualified `when (new.owner is not null)`** — rule 2 above); **MV-156 (PK replacement)**; MV-157 (`setObtained` `onConflict`); MV-159 (policies); MV-160 (NOT NULL, drop both legacy uniques) |
| **Grants before** | `authenticated`: SELECT(all), INSERT(all), UPDATE(all), DELETE. |
| **Grants after** | SELECT(all) · **INSERT (owner, kind, obtained, case_id)** · **UPDATE (owner, kind, obtained)** · DELETE. **AMENDED 2026-08-03 — this cell previously read `UPDATE (obtained)`, which is UNEXECUTABLE; see §12 and the note below.** |
| **Why UPDATE is the payload list, not the mutable list** | Same PostgREST mechanism as §4.4, and **more urgent here**: `app/api/documents/status/route.ts` already calls `setObtained` on the **authenticated** client today, so the narrow list would have taken the live document checklist down **the day MV-155 applied** — not at some future flip. Measured incrementally: `(obtained)` → 42501 · `(obtained,kind)` → 42501 · `(obtained,owner)` → 42501 · `(obtained,owner,kind)` → **OK**. Still strictly narrower than the flat grant it replaces (`case_id` and `updated_at` leave the surface), `case_id` is in no UPDATE list, and `owner → another user` is 42501 at the RLS `WITH CHECK`. **AMENDED 2026-08-04 (MV-159) — `owner → NULL` is NO LONGER refused**, for the reasons set out in §4.4's note; the row provably stays in the same case and invisible to everyone else, and MV-160's pure case predicate admits it equally. |
| **Role × verb** | SELECT / INSERT / UPDATE / DELETE: O/A/C/S = **S2** for all four · anon = — |
| **Policy form** | Four policies — **`ds_select_case` / `ds_insert_case` / `ds_update_case` / `ds_delete_case`, the names MV-159 shipped (added 2026-08-04, same reason as §4.4)** — transitional disjunct, UPDATE with USING + WITH CHECK. Second of the two tables where the counsellor write proof is expressible in Stage 2 (§7). |
| **Service-role disposition** | **Not on the list today** — `app/api/documents/status/route.ts` already uses `createSupabaseServerClient()`. Stays authenticated; depends on MV-155 §H's definer trigger — qualified `when (new.owner is not null)` (rule 2) — for the same UPSERT reason as `user_program_state`, and on the `(case_id, kind)` arbiter being **full** (rule 1). **MV-157 must keep `case_id` out of the `setObtained` payload.** |
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
| **Policy form** | `pp_select_case` / `pp_insert_case` / `pp_delete_case`. The INSERT `WITH CHECK` replaces the inline `EXISTS (… assessments …)` with `private.assessment_case_id(assessment_id) = <the case being written>` — the inline subquery is both an anti-recursion violation and a silent-denial hazard once `assessments` gains its own policy. **No UPDATE policy.** **CONSEQUENCE MADE EXPLICIT 2026-08-04 (MV-159), because it retires a property MV-156's suite asserted: the comparison is plain `=`, so a child carrying `case_id IS NULL` yields NULL and a WITH CHECK admits a row only on TRUE — an AUTHENTICATED client can therefore no longer create an owner-only, case-less chain row.** `=` rather than `is not distinct from` is deliberate and closes a hole the legacy `a.owner = uid` closed: an unclaimed anonymous assessment is `owner NULL, case_id NULL` and its id travels in a shareable URL, so a NULL-tolerant comparison would let any signed-in client hang a prediction-of-record off a stranger's assessment. Nothing live is affected — MV-157 routed every chain insert through `lib/cases/dual-write.ts`, which writes `case_id` unconditionally with no owner-only fallback — and the SCHEMA still permits the shape (`_ownership_axis_present` is a disjunct), so the service-role and backfill paths are untouched. `tests/integration/owner-nullable-rebase.itest.ts` asserts the new boundary in both directions. |
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
| **Policy form** | `aa_select_case` / `aa_insert_case` / `aa_delete_case`; INSERT `WITH CHECK` uses `private.prediction_case_id(prediction_id) = case_id`. Same plain-`=` consequence as §4.7, for the same reason (added 2026-08-04). |
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
| **Policy form** | `oe_select_case` / `oe_insert_case` / `oe_delete_case`. The INSERT `WITH CHECK` **must retain the two integrity clauses that are not about ownership** — `source = 'self_reported'` and `verified_by IS NULL` — while replacing the owner equality and the inline `EXISTS` with `private.attempt_case_id(attempt_id) = case_id`. Dropping them while "making it case-aware" would let a client self-certify an `official_verified` outcome; both are retained and both are asserted in `tests/integration/student-data-rls.itest.ts` (added 2026-08-04). Same plain-`=` consequence as §4.7. |
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
`UPDATE` fires `private.set_updated_at()`. **That list is correct** — §2.5 confirms those two tables
carry the trigger and `document_status` does not, despite having an `updated_at` column. Recording it
because the symmetry is misleading: a later reader will "notice the omission" and add
`document_status.updated_at` to the exclusion list, hollowing out the proof for no reason. The
omission is correct; `document_status.updated_at` must match exactly.

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
| **R1** | **MV-160** — **FIRST, re-create MV-159's policy set with the transitional owner disjunct restored** (MV-160 §D removes it as step (d) of its apply, so the undo puts it back — and it must go back *before* the column is re-widened: a pure case predicate over re-widened nullable rows makes a case-less row invisible to its own owner, silently, for the length of the window); then re-widen `case_id` to nullable on the eight; drop the `assessments` CHECK; **re-create** the eight `_ownership_axis_present` checks; re-create `UNIQUE (id, owner)` ×3, then the two legacy composite FKs `(prediction_id, owner)` / `(attempt_id, owner)`, then `outcome_events_attempt_id_owner_idx`; re-create the four legacy owner uniques (`profiles_owner_key`, `assessments_primary_idx`, `plan_items_kind_open_idx`, `documents_owner_kind_key`) **and** the two from §9.4 — `user_program_state_owner_program_idx (owner, program_id)` and `document_status_owner_kind_idx (owner, kind)`, **FULL, with NO `where owner is not null` predicate. AMENDED 2026-08-03:** this row used to say only "the two from §9.4" while §9.4 quoted the partial form, so an unwind written from this table would have re-created an index PostgREST's bare `on_conflict=` cannot infer and taken the live document checklist down with **42P10** — re-introducing, during a rollback, the exact defect MV-156 corrected on the way in. Re-create them by the shapes MV-156 shipped, not by the shapes it was told to ship; restore the narrowed `reject_prediction_update()` body | Stage 2 fully applied. **Re-creating a `unique (id, owner)` requires no duplicate `(id, owner)` pairs and no NULL owners in those rows** — true only if Stage 3 has written nothing. | Re-create the FKs before their unique targets → `42830`. Re-widen `case_id` **without** re-creating `_ownership_axis_present` → the MATCH SIMPLE hole reopens **silently**; nothing complains. This is the one step whose misordering does not fail loudly. |
| **R2** | **MV-159** — re-apply the **pre-Stage-2 (legacy owner)** policy set verbatim, then drop the new `private` helpers (`actor_case_ids`, `assessment_case_id`, `prediction_case_id`, `attempt_case_id`). **SHIPPED 2026-08-04 as `supabase/rehearsal/MV-159-rollback.sql`** — one transaction (a table with RLS FORCED and zero policies returns zero rows to every client, so no session may observe the gap), with guards that refuse unless MV-159 is applied AND MV-160 is not. It restores the two `documents` policies **without** their `to authenticated` clause, i.e. with the `PUBLIC`-role defect MV-159 fixed, because a rollback that silently keeps the fix is a second unreviewed migration; the closing assert re-checks that `anon` still holds no grant, which is what makes that safe. | R1 done. Policy-only, so exact and instant. **No point of no return: it mutates no data and can be re-run.** | Dropping a helper while a policy still references it → `2BP01`. Drop policies **first**, helpers second. Running it AFTER MV-160 would restore `(select auth.uid()) = owner` over `owner IS NULL` consultancy rows and hide them from the counsellor who owns the case, silently — Guard 2 refuses that. |
| **R3** | **MV-158** — revert the claim path to the owner-only bind | R2 done. Any assessment claimed under the case model keeps a valid `owner`, so no data repair is needed — **this is only true because MV-158 binds `owner` and `case_id` in one statement**. If it ever regressed to two statements, R3 needs a repair pass for owned-but-case-less rows. | Reverting the code while MV-159's case-only policies are still live hides claimed assessments from their owners. |
| **R4** | **MV-157** — revert repositories/routes to `.eq("owner", …)`; restore the service-role exception registry entries that flipped | R3 done, **and MV-159 reverted (R2) so the owner-only predicate still authorizes**. Code-only: MV-157 ships no migration. | Reverting repositories while MV-159's policies are live = every read returns 0 rows for a case-scoped actor. |
| **R5** | **MV-156** — drop the two case-side composite FKs, then the three `UNIQUE (id, case_id)` targets, then their covering indexes; drop all eight `_ownership_axis_present` checks; restore the composite PKs on `user_program_state` / `document_status` and drop the surrogate `id` columns; `SET NOT NULL` on `owner` ×8 | R4 done. **`SET NOT NULL` on `owner` succeeds only while no NULL-owner row exists** — i.e. only before Stage 3's first consultancy row. **This is the stage's hard rollback expiry.** Restoring a composite PK requires no NULL owners and no duplicate `(owner, program_id)` / `(owner, kind)` pairs. | Drop the unique targets before their FKs → `2BP01`. `SET NOT NULL` with a consultancy row present → `23502`, and the only way forward is deleting consultancy data. |
| **R6** | **MV-155** — restore the unconditional `private.reject_prediction_update()` body **first**; `alter table … drop column case_id` ×9 (takes the FKs and all case indexes with it); drop MV-155 §H's definer trigger on `user_program_state` / `document_status`; restore the flat table-level `UPDATE`/`INSERT` grants on the **seven** rewritten tables (`profiles` + `plan_items` for UPDATE; `user_program_state` + `document_status` + `program_predictions` + `application_attempts` + `outcome_events` for INSERT — **corrected 2026-08-03 from "six"**, which would leave one table holding a column list naming a dropped column); `drop index cases_personal_student_idx`; delete the personal cases | R5 done — **no constraint may still depend on `case_id`**. **The personal-case delete is valid only until MV-157 merges**; after a live create-or-resolve path exists, a blanket `delete from cases where organization_id is null and student_user_id is not null` destroys cases created by real signups and must be narrowed to a recorded id list. **THE ID LIST IS PRODUCED BY THE FORWARD MIGRATION AND MUST BE CAPTURED AT APPLY TIME — amended 2026-08-03.** `private.mv155_backfill_personal_cases()` returns `personal_case_ids` (a `jsonb` array) in its report, which the migration emits via `raise notice`; `supabase/rehearsal/README.md` §"Applying MV-155 to production" step 4 makes capturing that notice a numbered step. Nothing reconstructs the list after the fact: `created_by`, `student_user_id`, `operational_status` and `organization_id` all take values a real MV-157 signup also takes, and the inserts do not go through `private.write_audit_event`. Restoring the trigger body **before** dropping the column, so no window exists where predictions are updatable. | Drop `case_id` while an MV-156 FK still references it → `2BP01`. Delete personal cases while student-owned rows still reference them → `23503` from `ON DELETE RESTRICT`. Delete them after MV-157 without an id list → **irreversible data loss.** Note step 7 also **cascades** into `case_assignments` and `invitations` (both `case_id` ON DELETE CASCADE); for MV-155-minted personal cases both are empty, but the cascade is real and a non-empty one would go silently. |

### 10.2 Two properties this ordering exists to preserve

1. **There is never an instant, mid-unwind, where a row is unconstrained on both axes.** R1
   re-creates `_ownership_axis_present` in the same script that re-widens `case_id`; R5 does not drop
   those checks until the case chain is already gone and `owner` is about to become `NOT NULL` again.
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
  **(a) The UPSERT-seam definer trigger is qualified `when (new.owner is not null)`.** MV-155 §H
  specified it to derive `case_id` from `owner` on every write and to *overwrite* any supplied value;
  blocker 4's fix then narrowed MV-160 §D to require counsellor INSERT/UPDATE/DELETE on exactly those
  two tables with `owner IS NULL`. An `owner IS NULL` row has nothing to derive from, and the overwrite
  destroys the only value that could identify its case — the two criteria were mutually unsatisfiable.
  Qualifying the trigger keeps the re-pointing hazard closed on the owner-set branch and moves the bound
  on the owner-null branch to MV-159's `WITH CHECK`, which is the right layer for what is an
  authorization question. Rejected alternative: re-narrow MV-160 §D to owner-set writes, which would
  delete the one Stage 2 proof that a write path needs no Auth user — the property Stage 3 depends on.
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
  against a correct migration. It ships UNPATCHED and the three reasons are in §4.4 — the row
  cannot leave the case; the dangerous direction (`owner → another user`) is still 42501 via
  MV-155 §H's derive trigger re-deriving `case_id` onto the new owner's case; and it is the END
  STATE, since MV-160's pure case predicate admits it equally. Patching it would need a predicate
  that reads `owner` outside the single line MV-160 deletes, which MV-160 §D forbids. The residual
  loss is provenance on that row (`owner … on delete cascade` no longer reaches it) and it is
  Stage 6's column removal to settle.
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
- **2026-08-03** — **A failed case-scoped read now THROWS (`CaseReadError`) instead of rendering as
  no-data.** MV-133 shipped this idiom for the catalogue; MV-157 re-introduced the defect on the case
  axis — `resolvePersonalCaseId` ended `if (error || !data) return null` with no log, and
  `lib/documents/repo.ts`, `lib/documents/status-repo.ts` and `getOutcomesForCase` did not destructure
  `error` at all. The failure that hid is precisely the one both cards gate the merge on: a hosted
  database without MV-155's migration answers **42703** to every migrated read, and the product would
  have rendered as "you have no data" rather than as an outage. `null` / `[]` is now reserved for the
  query that answered with nothing.
