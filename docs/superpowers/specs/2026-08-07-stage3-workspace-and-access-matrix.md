# Stage 3 — Consultancy workspace: access matrix, grant resolution, and slice carve

**Written:** 2026-08-07 · **Owner:** MV-166 (spec session) · **Status:** authoritative for Stage 3

## 1. Why this document exists, and the rule it imposes

Stage 3's entire written planning is **four bullets** — `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`
lines 639–646. Stage 1 was carved off prose exactly like that, six slices each derived an access
matrix from it independently, and the Stage 2 spec's §9 lists **eleven** dossier/board/reality
contradictions that had to be reconciled afterwards. Stage 2 was written spec-first and reached
production without repeating it. This file is Stage 3's version of that document.

**Three rules, binding on every Stage 3 slice:**

1. **This file is authoritative for Stage 3.** Where a slice dossier disagrees with it, the dossier
   is wrong. Where this file disagrees with the live database, **that is a finding to raise, not
   something to resolve in SQL.**
2. **A slice that contradicts this spec amends it IN THAT SLICE'S OWN PR.** Recording the
   contradiction in a decision log or a PR body does not discharge this. The next slice reads the
   spec, not your log. This rule is carried verbatim from MV-154 because the prose version of the
   same instruction failed twice running in Stage 2.
3. **This spec adds surfaces to the Stage 1 canonical access matrix; it never moves a cell.**
   `docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md` is settled. Where this file
   appears to disagree with it, this file is wrong — and the disagreement is recorded in §7 as a
   finding for the founder, not silently reconciled here.

### Grounding

Every schema, grant, policy, constraint and trigger claim below was derived from a **live read** of
this project's own Postgres on 2026-08-07, and the query is recorded in the appendix (§10) and cited
inline as `[Q1]`…`[Q8]`. Nothing here is copied from the plan, from a prior spec, or from a card
dossier — where a prior document is quoted, it is quoted **as a claim under test** and the live
result is stated next to it.

**Which database, and why not production.** The read ran against the local Docker stack
(`supabase_db_merovisa`), which is at the repo migration head and holds **no** extra migrations:
24 files in `supabase/migrations/`, 24 rows in `supabase_migrations.schema_migrations`, identical set
`[Q1]`. Production was **not** read. It was not required: the schema is the same DDL, and MV-164's
host guard on the §A2 capture driver exists precisely so that reaching for production is a deliberate,
founder-gated act. **That guard is not to be weakened, bypassed, or "fixed" by any Stage 3 slice.**
Where a claim below genuinely depends on production *data* rather than production *schema*, it is
marked **[inherited]** and attributed to MV-165's record rather than re-asserted here.

---

## 2. Captured inventory — the evidence

### 2.1 The actor model, as the database actually computes it `[Q5]`

Seven `private` SECURITY DEFINER STABLE helpers with `search_path = ''` compute every access
decision. Their bodies, reduced to their predicates:

| Helper | Computes | Membership requirement |
|---|---|---|
| `actor_org_ids()` | orgs the actor belongs to | `status = 'active'` |
| `actor_admin_org_ids()` | orgs where actor is owner/admin | `status = 'active'` AND `role IN ('owner','admin')` |
| `actor_owner_org_ids()` | orgs where actor is owner | `status = 'active'` AND `role = 'owner'` |
| `actor_assigned_case_ids()` | cases assigned to the actor | joins memberships with `status = 'active'` |
| `actor_case_ids()` | **every case the actor may touch** | `student_user_id = auth.uid()` **OR** admin-org **OR** assigned |
| `can_staff_case(case)` | consultancy staff on this case | `is_org_admin` OR (active member AND assigned) |
| `can_manage_case(case)` | may administer this case | `is_org_admin(case.organization_id)` only |

**The inactive-membership rule holds mechanically, on every path.** Every one of the five
`actor_*_ids()` helpers filters `status = 'active'`, `actor_assigned_case_ids()` re-checks it on the
join (so a revoked member loses assigned cases even though the `case_assignments` row survives), and
`can_staff_case` re-checks it again. There is no path by which an `inactive` membership contributes
a single id. Verified by reading all seven bodies, not by assuming the pattern `[Q5]`.

**The dual-role rule holds mechanically too.** `actor_case_ids()` reaches the student's own case
through the `student_user_id` disjunct, which yields **one case id** and confers nothing org-scoped;
org rights come only from `actor_*_org_ids()`, which require an active membership. So revoking a
membership removes org access and leaves the person's own case intact — exactly the canonical rule.

### 2.2 Grants: table-level is a red herring; the real grants are column-scoped `[Q2, Q3]`

`information_schema.role_table_grants` **understates** the write surface and reading it alone will
mislead a slice. MV-161 replaced table-wide privileges with **column-scoped** grants, which surface
only in `role_column_grants`. Both were captured. The authoritative `authenticated` write surface:

| Table | INSERT columns | UPDATE columns | DELETE |
|---|---|---|---|
| `cases` | all 10 | `archived_at, display_name, email, operational_status` | yes |
| `case_assignments` | all 6 | — | yes |
| `organizations` | **none** | `name, slug` | yes |
| `organization_memberships` | all 7 | `role, status` | yes |
| `invitations` | all 12 | `revoked_at` | **no** |
| `profiles` | **none** | `completeness, sections` | no |
| `assessments` | **none** | **none** | no |
| `plan_items` | **none** | `completed_at, started_at, status` | no |
| `documents` | **none** | **none** | yes |
| `document_status` | `case_id, kind, obtained, owner` | `kind, obtained, owner` | yes |
| `user_program_state` | `case_id, notes, owner, program_id, status` | `notes, owner, program_id, status` | yes |
| `program_predictions` | all 9 | **none** | yes |
| `application_attempts` | all 10 | **none** | yes |
| `outcome_events` | all 16 | **none** | yes |
| `audit_events` | none | none | no |

**`anon` holds no grant on any `public` table** — it appears in neither capture `[Q2, Q3]`. Every
anonymous path is therefore service-role by construction, not by choice.

### 2.3 The policy/grant pairing rule, measured

A verb is reachable only when **both** a grant and a policy exist. Stage 3 must ship both halves or
neither; a policy without a grant is dead code, and RLS narrows a grant, never widens one.

Measured against `[Q3, Q4]`, the four tables Stage 2 deferred are missing **both** halves:

| Table | INSERT grant | INSERT policy |
|---|---|---|
| `profiles` | absent | absent |
| `assessments` | absent | absent |
| `plan_items` | absent | absent |
| `documents` | absent | `service_role` only ("Service inserts documents") |

Five sibling tables show the working template both halves must match — `ds_insert_case`,
`ups_insert_case`, `pp_insert_case`, `aa_insert_case`, `oe_insert_case`. Every one of the five
carries the same three-part `WITH CHECK` `[Q4]`:

```
case_id IS NOT NULL
AND case_id = ANY (SELECT private.actor_case_ids())
AND (owner IS NULL OR owner = private.case_student_id(case_id))
```

**That third conjunct is the consultancy-row clause**, and it is already written five times. It is
what lets a row exist with `owner IS NULL` for a case that has no student, while forbidding a row
that names *someone else's* user id. Any Stage 3 INSERT policy that omits it is wrong.

### 2.4 The column write-surface guard `[Q6]`

`cases` carries a `BEFORE UPDATE` trigger, `cases_write_surface_guard` → `private.enforce_case_write_surface()`.
It is **SECURITY INVOKER** and exempts only `rolbypassrls` roles. It raises `42501` when:

- `archived_at` changes and the actor is not `is_org_admin(old.organization_id)`;
- `operational_status` changes and the actor is not `can_staff_case(old.id)`.

**This is where canonical divergences #2 and #4 are actually enforced** — not in the policy. The
`cases_update_accessor` policy permits the linked student to update the row, and the column grant
includes `archived_at` and `operational_status`; only the trigger stops them. A slice reading policy
and grant alone would conclude the student can archive their own case, and would be wrong.

### 2.5 Uniqueness has already moved from `owner` to `case_id` `[Q7]`

Every uniqueness index on the student-owned tables is now case-keyed. Not one references `owner`:

| Index | Definition |
|---|---|
| `profiles_case_idx` | `UNIQUE (case_id)` |
| `assessments_case_primary_idx` | `UNIQUE (case_id) WHERE is_primary` |
| `plan_items_case_kind_open_idx` | `UNIQUE (case_id, kind) WHERE status = 'todo'` |
| `documents_case_kind_idx` | `UNIQUE (case_id, kind)` |
| `document_status_case_kind_idx` | `UNIQUE (case_id, kind)` |
| `user_program_state_case_program_idx` | `UNIQUE (case_id, program_id)` |
| `program_predictions_case_assessment_program_rule_idx` | `UNIQUE (case_id, assessment_id, program_id, rule_version)` |
| `cases_personal_student_idx` | `UNIQUE (student_user_id) WHERE organization_id IS NULL` |
| `case_assignments_primary_idx` | `UNIQUE (case_id) WHERE assignment_role = 'primary_counsellor'` |

**This is the single most load-bearing fact in this document, and it is good news:** the schema work
that makes a student-less consultancy case possible is *already done*. Stage 3 does not need a
migration to support `owner IS NULL` rows. It needs grants and policies.

Two consequences a slice must not re-derive:

- `case_assignments_primary_idx` means a case has **at most one** primary counsellor, and
  `case_assignments_assignment_role_check` restricts `assignment_role` to the single literal
  `'primary_counsellor'` `[Q8]`. "Assignment" in Stage 3 is therefore **reassignment of one slot**,
  not a multi-counsellor collaboration model. The plan's bullet does not say this.
- Four of these indexes are **partial**. An upsert against a partial index is not an inferrable
  `ON CONFLICT` arbiter and raises `42P10`. Stage 3 writers use read-then-insert with `23505`
  treated as a resolve, exactly as `ensurePersonalCase` does.

### 2.6 Nullability — the consultancy row shape is already legal `[Q7]`

- `owner` is **nullable on all nine** student-owned tables.
- `case_id` is **`NOT NULL` on eight**; `assessments.case_id` is nullable, guarded by
  `assessments_case_required_when_owned`: `CHECK (case_id IS NOT NULL OR (owner IS NULL AND claimed_at IS NULL))` `[Q8]`.
  That is the anonymous-assessment escape hatch and it stays.
- `cases.student_user_id` and `cases.organization_id` are both nullable.

### 2.7 The composite FK chain `[Q8]`

`outcome_events (attempt_id, case_id) → application_attempts (id, case_id) → program_predictions (id, case_id)`,
each backed by a `UNIQUE (id, case_id)` on the parent. The chain is keyed on `case_id`, so it holds
identically for a consultancy row with `owner IS NULL`. Two `INSERT` policies additionally re-check
it in `WITH CHECK` (`private.prediction_case_id(prediction_id) = case_id`,
`private.attempt_case_id(attempt_id) = case_id`) `[Q4]` — belt and braces, both already shipped.

---

## 3. The invariant every Stage 3 slice implements

> **A Stage 3 surface resolves an organization or a case first, authorizes the actor against it
> through the AUTHENTICATED client, and only then reads or writes — and every row it writes carries
> `case_id`, with `owner` set only when the case has a student Auth user to set it to.**

The corollary that distinguishes Stage 3 from Stage 2: **`owner IS NULL` is now a normal row, not an
error state.** Stage 2 dual-wrote `owner` and `case_id` because every case had a student. Stage 3 is
where the second half of MV-157's rule first actually happens.

---

## 4. The Stage 3 access matrix

Rows are actors; columns are Stage 3 surfaces. Each cell gives the verb, then its enforcement point.
**Every cell traces to the Stage 1 canonical matrix or is marked NEW.** `∅` = no access at all.

Actors, exactly as Stage 1 defines them, plus the two Stage 1 got wrong most often:

- **O** org owner · **A** org admin · **C+** counsellor **assigned** to this case ·
  **C−** counsellor **not** assigned (active member of the org) · **S** the linked student ·
  **I** an `inactive` membership · **N** anonymous / not signed in

| # | Surface | O | A | C+ | C− | S | I | N | Enforced by | Slice | Traces to |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Org selection (list my orgs) | list | list | list | list | ∅ | **∅** | ∅ | `organizations_select_member` → `actor_org_ids()` | MV-169 | canonical "inactive grants nothing" |
| 2 | Org rename / settings | **write** | **deny** | deny | deny | ∅ | ∅ | ∅ | `organizations_update_owner` → `actor_owner_org_ids()` | MV-169 | **divergence #1** |
| 3 | Org creation | ∅ | ∅ | ∅ | ∅ | ∅ | ∅ | ∅ | **no INSERT grant on `organizations`** | — | **NEW — see F-2** |
| 4 | Team list (memberships) | read | read | read | read | ∅ | own row only | ∅ | `organization_memberships_select_member` | MV-169 | canonical role table |
| 5 | Team role change / deactivate | write | write (not owner-role) | deny | deny | ∅ | ∅ | ∅ | `..._update_admin` + `actor_owner_org_ids()` for `role='owner'` | MV-169 | **divergence #5** (same owner carve-out) |
| 6 | Team **invite** (new staff) | — | — | — | — | — | — | — | **Stage 5** — not a Stage 3 surface | — | §5 non-goal |
| 7 | Student list / search / filter | all-org | all-org | **assigned only** | **∅** | ∅ | ∅ | ∅ | `cases_select_accessor` → admin-org ∪ assigned ∪ own | MV-170 | canonical "counsellor assigned-only" |
| 8 | Case creation | create | create | **deny** | deny | deny | ∅ | ∅ | `cases_insert_admin` → `actor_admin_org_ids()`; TS `case.create: deny` | MV-171 | canonical role table — **and F-1** |
| 9 | Case assignment | assign | assign | **deny** | deny | deny | ∅ | ∅ | `case_assignments_insert_admin` → `can_manage_case` = `is_org_admin` | MV-171 | canonical — **and F-1** |
| 10 | Case `operational_status` | write | write | write | deny | **deny** | ∅ | ∅ | `enforce_case_write_surface` → `can_staff_case` | MV-171 | **divergence #4** |
| 11 | Case `archived_at` | write | write | **deny** | deny | **deny** | ∅ | ∅ | `enforce_case_write_surface` → `is_org_admin` | MV-171 | **divergence #2** |
| 12 | Case `display_name` / `email` | write | write | write | deny | **write** | ∅ | ∅ | policy + column grant only — the trigger guards neither column, **by design** | — (founder) | canonical "updates permitted profile fields" — **and F-3** |
| 13 | Case route: read the case's data | all-org | all-org | assigned | ∅ | own | ∅ | ∅ | `*_select_case` → `actor_case_ids()` on all 9 tables | MV-172 | canonical, extended to Stage 2's tables |
| 14 | Case route: edit profile | write | write | write | ∅ | **write (fields ¹)** | ∅ | ∅ | `profiles_update_case` + col grant `(sections, completeness)` | MV-172 | canonical "updates permitted profile fields" |
| 15 | Case route: create profile row | write | write | write | ∅ | write | ∅ | ∅ | **grant does not exist yet** → MV-168 | MV-168 | §6.1 |
| 16 | Case route: plan items | write | write | write | ∅ | write | ∅ | ∅ | `plan_items_update_case`; INSERT **grant does not exist yet** | MV-168 | §6.1 |
| 17 | Case route: documents | read/del | read/del | read/del | ∅ | read/del | ∅ | ∅ | `documents_*_case`; upload stays service-role | **Stage 4** | §5 non-goal |
| 18 | Case-context indicator | show | show | show | n/a | show | n/a | n/a | render-time, from `getCaseContext` | MV-173 | NEW (presentation only) |
| 19 | Consultancy-internal notes | — | — | — | — | — | — | — | **no column exists** | — | **NEW — see F-4** |
| 20 | Org audit log | read | read | deny | deny | ∅ | ∅ | ∅ | `audit_events_select_admin` → `actor_admin_org_ids()` | **Stage 6** | canonical role table |
| 21 | Case route: shortlist / program state ² | write | write | write | ∅ | write | ∅ | ∅ | `ups_insert_case` / `ups_update_case` + col grants `[Q3, Q4]` | MV-168 + MV-172 | **NEW — see F-8** |
| 22 | Case route: document checklist tick ² | write | write | write | ∅ | write | ∅ | ∅ | `ds_insert_case` / `ds_update_case` + col grants `[Q3, Q4]` | MV-168 + MV-172 | **NEW — see F-8** |
| 23 | Case route: outcome capture ² | write | write | write | ∅ | write | ∅ | ∅ | `pp_insert_case` / `aa_insert_case` / `oe_insert_case` `[Q4]` | MV-172 | **NEW — see F-8** |

¹ **The field allowlist is still missing.** `lib/cases/permissions.ts` resolves `student.case.update`
to `linked` and its own comment says so: *"A Stage 3 mutation that accepts an arbitrary case patch
from a student is a defect even though this cell allows the claim."* `lib/cases/README.md` records
the same gap **and locates the remedy**: *"The allowlist belongs with that mutation"* (`:152-157`).
Cell 14 is safe today only because the **column grant** on `profiles` is `(sections, completeness)` —
the allowlist is enforced by Postgres, not by the app. That TypeScript gap is real, is **not**
canonical, and is MV-173's. Cell 12 is a different thing: there the omission is the canonical
decision itself, not an oversight (see **F-3**).

² **Cells 21–23 are Stage 2 surfaces the case route inherits, and their five routes take no case id.**
Grants and policies already exist on all five tables; what does not exist is a caller that can name a
case other than the actor's own — every one resolves `resolvePersonalCaseId(<user>.id, …)`. This is
the one place where MV-172 can ship green and write to the **wrong case**. Cell 17 is the `documents`
vault table and is **not** cell 22: `document_status` is a separate table with its own grant and
`ds_insert_case` policy. See **F-8**.

### The two rules Stage 1 got wrong most often, shown holding on every new surface

- **Inactive membership (`I`) is `∅` in every row above except cell 4's own membership row**, and
  that is not a Stage 3 decision — it falls out of `status = 'active'` appearing in all five
  `actor_*_ids()` helpers, in `actor_assigned_case_ids()`'s join, and in `can_staff_case` §2.1. A
  Stage 3 surface cannot leak to an inactive member without a slice actively bypassing those helpers.
- **Dual role (staff **and** the linked student of a case in the same org):** the actor gets the
  union of row `A`/`C+` and row `S` — additively. Revoking their membership drops them to row `S`
  and no further. Mechanically guaranteed by `actor_case_ids()` §2.1, not asserted here.

---

## 5. What Stage 3 does NOT change

Recorded so a reviewer can tell an omission from an oversight, and so "case creation" cannot drift
into Stage 4 and "team management" cannot drift into Stage 5.

- **Documents: requests, records, versions, reviews, case activity, `storage.objects` policies,
  case-aware Storage paths, signed-download authorization, scanning/quarantine — all Stage 4.**
  Stage 3 renders the *existing* document list inside a case route and changes no document model.
  Object paths stay **owner-keyed** through Stage 3 by the Stage 2 spec §8 decision.
- **Invitations and the student portal — Stage 5.** This includes **staff invitations**. Stage 3's
  "team management" is therefore *managing memberships that already exist* (role change, deactivate),
  not growing the team. See **F-5**.
- **Audit, export, archive, delete — Stage 6.** `audit_events` gains no writer in Stage 3; the
  `auditEvent` fields in the service-role registry stay `null`, which means "touches no case-scoped
  data or has no callable writer", never "auditing was skipped".
- **Every cell of the Stage 1 canonical access matrix** — unmoved. If a Stage 1 or Stage 2 suite
  needs an edit to stay green, a Stage 3 slice moved a cell and is wrong.
- **The nine student-owned tables' schema.** Stage 3 ships **no migration that adds or alters a
  column**. Its only SQL is grants and policies (§6.1). `owner` columns are not dropped — that is a
  Stage 6 cleanup item.
- **`cases_insert_admin` stays as MV-159 left it.** A personal case still cannot be created by an
  authenticated client; `ensurePersonalCase` still takes a service-role client. Stage 3 does not
  relitigate that refusal.
- **`leads`, `universities`, `programs`** — untouched.

---

## 6. The three inherited debts, resolved on paper

### 6.1 The deferred write grants

The Stage 2 spec §6 defers **ten** verbs, not four. All ten are re-measured live below, and all ten
get a disposition — a verb Stage 2 deferred and Stage 3 leaves unmentioned is how a deferral becomes
permanent by accident.

| # | Table | Verb | Live state `[Q3, Q4]` | **Stage 3 resolution** | Slice |
|---|---|---|---|---|---|
| 1 | `profiles` | INSERT | no grant, no policy | **GRANT** `INSERT (owner, case_id, sections, completeness)` + `profiles_insert_case` — **and convert the call site off `.upsert()` in the same slice**, or the grant never reaches it. See below. | **MV-168** |
| 2 | `assessments` | INSERT | no grant, no policy | **REFUSE — permanently.** See below. Amend §6. | — |
| 3 | `assessments` | UPDATE | no grant, no policy | **GRANT, narrowed to `UPDATE (is_primary)`** + `assessments_update_case`. Re-scoring stays server-side. | **MV-168** |
| 4 | `assessments` | DELETE | no grant, no policy | **REFUSE.** No domain need; row removal is account teardown (Stage 6). | — |
| 5 | `plan_items` | INSERT | no grant, no policy | **GRANT** `INSERT (owner, case_id, kind, impact, title, body, status, lift_estimate, time_estimate)` + `plan_items_insert_case` | **MV-168** |
| 6 | `plan_items` | DELETE | no grant, no policy | **REFUSE.** Plan items are *dismissed* (`status='dismissed'`), never deleted. The existing UPDATE grant covers the **student's** domain — **not** the generator's copy columns; see the row-6 correction below. | — |
| 7 | `documents` | INSERT | no grant; policy is `service_role`-only | **DEFER to Stage 4**, with reason. Amend §6. | Stage 4 |
| 8 | `documents` | UPDATE | no grant, no policy | **NEVER** — Stage 4 replaces the model. Confirmed. | — |
| 9 | `program_predictions` | UPDATE | no grant **and** `reject_prediction_update` trigger `[Q6]` | **NEVER** — append-only. Confirmed live. | — |
| 10 | `application_attempts` / `outcome_events` | UPDATE | no grant | **NEVER** — append-only. Confirmed live. | — |

**Why `assessments` INSERT is refused, not granted.** §6 proposes `INSERT (…, case_id)`. Measured,
the grantable column set includes `result` and `rule_version` `[Q3]`. Granting INSERT to
`authenticated` would let any signed-in actor write an arbitrary `result` for a case they can
already reach — that is, **mint their own verdict**. The scoring engine is server-side, rule-based
and versioned by architecture rule, and a banded verdict a client can forge is the exact trust
property this product sells. A column-scoped grant excluding `result`/`rule_version` does not rescue
it either: those columns are `NOT NULL`-shaped in every real insert, so the verb would be
ungrantable in a useful form. **`app/api/assess/route.ts` therefore remains a service-role exception
permanently, reclassified from `legacy-owner-scoped` to `sanctioned`.**

**Why `assessments` UPDATE is narrowed rather than granted whole.** The same argument bars the
re-score columns. But `is_primary` is a *user choice* (which assessment leads), not a scoring output,
and it is already governed by the partial unique `assessments_case_primary_idx`. Granting exactly
`UPDATE (is_primary)` moves the primary-selection toggle onto the authenticated client and leaves
`app/api/assess/refresh/route.ts`'s re-score on service-role, where it belongs.

**Why `documents` INSERT is deferred to Stage 4.** Its only caller is
`app/api/documents/upload/route.ts`, which must *also* write a Storage object; the bucket policy
that would let the authenticated client do that is Stage 4's, and Stage 2 §8 pinned object paths
owner-keyed through Stage 3. Granting the row INSERT alone therefore retires **no** service-role path
and widens the write surface for no caller. Deferring is the smaller change; the amendment to §6
records it so it is a decision, not a silence.

#### Grant 1 does not unblock its own call site — and the fix is TypeScript, not a wider grant

**The first profile write is an upsert, not an insert.** `lib/profiles/repo.ts:84` —
`.upsert(payload, { onConflict: "case_id", ignoreDuplicates: false })`, with `payload` carrying
`owner`, `case_id`, `sections`, `completeness` (`:76-80`). It is reached from
`patchProfileSectionForCase` (`:129-133`) whenever the case has no profile row yet — exactly the
"first-ever profile row" case §6.2 entry 9 names.

MV-155 already measured what that compiles to and wrote the measurement into the migration
(`supabase/migrations/20260802120000_stage2_case_id_and_personal_cases.sql:630-640`): an upsert
becomes `INSERT … ON CONFLICT DO UPDATE SET`, **PostgREST puts every payload column in that SET list,
including the conflict target**, and the privilege check happens at plan time — so **even the insert
branch raises `42501` on the FIRST call, with no row present and neither branch reachable.** Grant 1
is INSERT-only. Under it, the upsert fails before it ever inserts.

**The obvious patch is forbidden.** Granting `UPDATE (case_id)` would satisfy the SET list, and it is
precisely what the migration's rule at `:602-604` refuses: *"THE ASYMMETRY IS THE POINT AND IT IS NOT
A SLIP: `case_id` is OMITTED from every UPDATE list and INCLUDED in every INSERT list… a client that
can UPDATE case_id RE-POINTS an existing row into another case."* **No Stage 3 slice weakens that
rule.**

**Resolution — MV-168 converts `upsertProfileForCase` to read-then-insert**, treating a `23505` on
`profiles_case_idx` as "someone else created it, re-run the UPDATE". This is not a new pattern: §2.5
already names it as *the* Stage 3 writer pattern (*"read-then-insert with `23505` treated as a
resolve, exactly as `ensurePersonalCase` does"*).

**Trade-off, stated.** It costs one extra round trip on the first-ever profile write only, and a
genuinely concurrent first write resolves instead of failing. The alternatives are worse here: a
`SECURITY DEFINER` function adds a SQL surface Stage 3 does not otherwise need **and hides the write
from the column grants that are the enforcement point**; an insert-then-update pair costs the same
round trip and leaves a half-written row when the update fails.

**One trap the conversion must not walk into.** ~~`upsertProfileForCase` already treats `23505` as
the residue signal (`:89-92` → `adoptOwnerKeyedResidue`), and the legacy `profiles_owner_key` unique
on `owner` is still live. Both collisions raise the same SQLSTATE, so the conversion must distinguish
the `profiles_case_idx` collision (resolve: re-read and update) from the `profiles_owner_key` one
(adopt residue, then retry) rather than treating any `23505` as a resolve.~~

> **CORRECTED 2026-08-08 BY MV-168 — the premise was stale and the trap does not exist.**
> `profiles_owner_key` **is not live**. MV-160 §D dropped it — it is in that card's own
> `DROPPED_OWNER_UNIQUES` list — and made `profiles.case_id` NOT NULL in the same migration, so an
> owner-set / case-null profile row is not representable and `adoptOwnerKeyedResidue(db, "profiles",
> …)` can only ever return 0. `tests/integration/case-data-access.itest.ts` already pinned that
> return value. Read back from the live catalogue, the only uniques on `profiles` are
> `profiles_case_idx` and `profiles_pkey`.
>
> So `23505` on this table has **one** meaning — a concurrent first write on the same case — and one
> remedy: update the mutable columns onto the row that won. MV-168 implements exactly that and drops
> the now-unreachable adopt call from this path. `lib/cases/residue.ts` is unchanged and still serves
> its three other callers; `assessments` is the one adoptable table whose `case_id` is still nullable
> and where the residue shape therefore remains representable.
>
> **The instruction this replaces was written from `lib/profiles/repo.ts`'s own doc comment**, which
> had described the live schema accurately when it was written and had not been updated when MV-160
> changed it. A prose claim about the schema is evidence about the past; the catalogue is evidence
> about now.

> **AMENDED 2026-08-08 BY MV-168 — the conversion is INSERT-first, not read-first.**
> The resolution above says "read-then-insert". Implemented literally that costs an extra round trip
> on **exactly the path the grant exists to serve**: `patchProfileSectionForCase` (`:116-133`) already
> does its own UPDATE and only calls `upsertProfileForCase` when that matched **zero rows** — so the
> function is reached precisely when there is no row to read. MV-168 therefore INSERTs first and
> treats `23505` as the resolve, which is the same two-branch semantics with one fewer round trip on
> the common path and no behavioural difference on the collision path. The trade-off §6.1 recorded
> ("one extra round trip on the first-ever profile write") is not paid at all. The same shape is used
> on the two F-8 tables for uniformity.

**Scoped to MV-168, not MV-172**, because a grant whose only call site cannot use it is exactly the
paper resolution this document exists to prevent. MV-168's "no UI, no route" scope admits this one
repository-helper change, and its acceptance criteria must pin it with a test that **fails against
the `.upsert()` form**: *the authenticated client creates a first-ever `profiles` row for a case it
may reach.* The same conversion is needed on two more tables — see **F-8**.

#### Correction to row 6 — the existing UPDATE grant does not cover the whole `plan_items` domain

`plan_items` grants `authenticated` `UPDATE (status, completed_at, started_at)`
(`…20260802120000….sql:626`) — the student's columns. But `invalidatePlan`'s **copy refresh**
(`lib/plan/invalidate.ts:172-176`) UPDATEs `impact`, `title`, `body`, `lift_estimate`,
`time_estimate`, and the migration is explicit that those are out of scope on purpose: *"`kind`,
`title`, `impact` and the rest are MeroVisa's determination (spec §11.1's Platform layer)"* (`:623-624`).

**Stage 3 does not grant them and must not** — a client that can rewrite its own plan copy can
rewrite the advice, which is the same trust property §6.1 row 2 protects on `assessments.result`.
Row 6's refusal of `plan_items` DELETE stands; only its *reason* was overstated. The consequence is
that plan copy refresh stays a server-side write, and it is the second of the three legs that keep
`app/api/profile/section/route.ts` on service-role (§6.2 entry 9).

#### Retiring MV-160's `42501` pin — the same slice, or the suite lies

> **CORRECTED 2026-08-08 BY MV-168 — there were TWO copies of the pin, and this section found one.**
> Everything below is accurate about `stage2-tighten.itest.ts`. A **second** copy was live in
> `tests/integration/student-data-rls.itest.ts` §G — the block named *"the four deferred consultancy
> write paths stay 42501 (spec §6, §7.2)"* — which asserts the same four absences through an
> `it.each` from a different angle, and which this section's enumeration did not reach because it
> went looking for the string `42501` in the file the MV-160 card named.
>
> Both copies are discharged in MV-168's PR by the same four steps. In §G the `profiles` and
> `plan_items` rows are removed from the `it.each` table and the block's header rewritten; the
> `assessments` and `documents` rows stay and now carry their differing dispositions. **The lesson is
> the one §6.2 already taught in a different register:** an audit that enumerates instances of a
> thing is bounded by where it looked, and "the pin is one test" was a claim about a file rather than
> about the codebase.
>
> A third guard class had to move with them, and it is the useful kind — `student-data-rls.itest.ts`
> derives what must be probed from `information_schema` and `pg_policy` **at run time**, so the three
> new grants turned it red until probes were aimed at them. That is a completeness guard doing
> exactly its job, and it is why the new verbs have cross-boundary and owner-axis probes rather than
> only the happy-path ones.

The pin is **one test**, not eight: `tests/integration/stage2-tighten.itest.ts`, the test named
*"DEFERRED HALF — INSERT into profiles/assessments/plan_items/documents is 42501, and that is a
DECISION GATE"*, containing **four** `expect(...).toBe("42501")` assertions (lines 945, 956, 961,
971). The file's other two `42501` assertions (lines 775, 783) are cross-case policy tests and are
**not** part of this deferral — a slice that "cleans up the 42501 assertions" and touches those has
broken a different guarantee.

The test's own header already states the contract: *"WHEN STAGE 3 GRANTS THEM, THIS TEST GOES RED —
that is its purpose… Do not delete it; move it, with the grant, and update matrix spec §6."*

**MV-168 must therefore, in one PR:**

1. add the two INSERT grants + policies and the narrowed `assessments` UPDATE grant + policy;
2. **delete the `profiles` and `plan_items` assertions from the DEFERRED HALF test and re-add them,
   inverted, as positive assertions** in the Stage 3 suite (the counsellor INSERT now *succeeds*
   with `owner IS NULL`);
3. **leave the `assessments` and `documents` assertions in place and green**, and rewrite the test's
   header comment so it says *refused (assessments)* and *deferred to Stage 4 (documents)* rather
   than *deferred to Stage 3* — otherwise the comment becomes the lie the test was built to prevent;
4. amend Stage 2 spec §6 rows 1–7 and add a dated §12 entry.

Leaving a passing assertion that says "this grant does not exist" while granting it is not a risk
here — the test simply goes red. The failure mode this guards against is a *later* session seeing
red under time pressure and deleting the assertion. Steps 2–3 are what make that unnecessary.

### 6.2 The nine `legacy-owner-scoped` service-role paths

All nine confirmed present in `lib/supabase/service-role-exceptions.ts`. Each gets a named
disposition; "still legacy, no reason" is not acceptable (MV-154's standard).

| # | Path | Blocking reason, as the registry states it | **Disposition** |
|---|---|---|---|
| 1 | `app/(focused)/assessment/[id]/page.tsx` | renders an **unclaimed, case-less** assessment for a signed-out visitor; `anon` holds no grant on `assessments` `[Q2]` | **PERMANENT — reclassify to `sanctioned`.** Not a grant deferral at all: no Stage 3 grant to `authenticated` can help a visitor who is not authenticated. **Mislabelled today — see F-6.** |
| 2 | `app/api/account/delete/route.ts` | Auth-account teardown; deliberately `.eq("owner")`, must not touch a consultancy case holding the same person's data | **PERMANENT — reclassify to `sanctioned`** ("deletion jobs"). Its own justification says *"DELIBERATELY still owner-keyed"*, which contradicts the `legacy-owner-scoped` label's meaning ("grandfathered, not endorsed"). **F-6.** |
| 3 | `app/api/assess/refresh/route.ts` | `assessments` SELECT-only, no UPDATE | **STAYS (narrowed).** §6.1 refuses the re-score grant; the route keeps service-role for scoring. Its justification must be rewritten from "deferred flip" to "server-side scoring, permanent". | 
| 4 | `app/api/assess/route.ts` | `assessments` SELECT-only + `profiles` no INSERT + personal-case creation | **STAYS (narrowed) — MV-168 + MV-171.** The `profiles` bootstrap flips to the authenticated client; the assessment insert and the personal-case creation both stay service-role (§6.1; MV-159's refusal). Justification shrinks accordingly. |
| 5 | `app/api/documents/[id]/route.ts` | Storage object delete needs service-role under the current bucket policy | **WAITS FOR STAGE 4** — Storage policy, not a grant. |
| 6 | `app/api/documents/[id]/view/route.ts` | mints a signed URL for a private object | **WAITS FOR STAGE 4** — Storage policy + per-document metadata authorization. |
| 7 | `app/api/documents/upload/route.ts` | Storage upload **and** `documents` INSERT | **WAITS FOR STAGE 4** — both halves are Stage 4's (§6.1 row 7). |
| 8 | `app/api/plan/action/route.ts` | `plan_items` has UPDATE but **no INSERT**, and `invalidatePlan` inserts on the same client | **RETIRES in MV-168 + MV-172.** Grant 5 is exactly what this waits on. |
| 9 | `app/api/profile/section/route.ts` | `profiles` has UPDATE but **no INSERT**, and this path must create a first-ever profile row | **NARROWS — it does NOT retire.** The registry's stated reason is incomplete: three further legs on the same client are refused by §6.1 and stay service-role. See below. |

#### Why entry 8 retires and entry 9 does not — two rows that look alike

`app/api/plan/action/route.ts` calls exactly three helpers — `getPlanItemKind` (a read),
`setPlanItemStatus` (`status`, `completed_at`) and `setPlanItemStarted` (`started_at`) — every write
inside the granted `UPDATE (status, completed_at, started_at)`. It does **not** call `invalidatePlan`;
only a comment at `:45` names it. **Entry 8 genuinely retires.**

`app/api/profile/section/route.ts` does four things on one admin client, and Stage 3's grants cover
only the first two:

| Leg | Write | Covered by Stage 3? |
|---|---|---|
| `patchProfileSectionForCase` (`:47`) | `profiles` UPDATE `(sections, completeness)`, falling back to creating a first-ever row | **Yes** — existing grant + grant 1 (with the `.upsert()` conversion above) |
| `invalidatePlan` (`:53`) → auto-close + insert | `plan_items` UPDATE `(status, completed_at)`, INSERT | **Yes** — existing grant + grant 5 |
| `invalidatePlan` → **copy refresh** | `plan_items` UPDATE `(impact, title, body, lift_estimate, time_estimate)` | **No — refused.** Generator-owned columns (row-6 correction, §6.1) |
| `invalidatePlan` / `upsertProfileForCase` → `adoptOwnerKeyedResidue` | `UPDATE (case_id)` | **No — refused permanently.** `case_id` is omitted from every UPDATE list by design; `lib/cases/residue.ts:45-51` documents the path as service-role-only |
| `reScoreAssessment` (`:58`) | `assessments` UPDATE `(result)` | **No — refused permanently** by §6.1 row 3 ("Re-scoring stays server-side") |

**The failure would be silent, which is why this is a blocker and not a detail.**
`lib/assessments/re-score.ts:33` never destructures `error` from its `.update()`, and a PostgREST
`42501` **resolves rather than rejects** — so it never reaches the route's `console.error` at `:60`,
and the route still returns `{ ok: true }` with a 200. `grep -rn throwOnError lib/ app/` returns
**zero hits**, so nothing ambient compensates. Flip this route wholesale to the authenticated client
and every profile edit silently stops updating the student's verdict, **with a green suite**. The
copy-refresh and residue legs fail the same way — both only `console.error`.

**MV-172's deliverable on this route is therefore a split, not a flip.** The profile write moves to
the authenticated client; the three refused legs stay on an explicitly-scoped service-role call.
**MV-171's new case-scoped scoring route absorbs the `reScoreAssessment` leg only** — the copy-refresh
and residue-adopt legs are `plan_items` / `case_id` writes, not scoring, and no scoring route can
carry them. They are named here so no slice assumes the scoring route disposed of all three.

**The route keeps its registry entry either way.**
`tests/supabase/service-role-exceptions.test.ts:280` requires every module constructing the admin
client to be registered, and `:293` requires every registered entry to still construct one. **A
builder cannot keep the admin client and delete the entry**; attempting the retirement produces a red
suite at best and a silent trust regression at worst.

**Net effect of Stage 3 on the nine: 9 → 8 entries.** **One retires outright (8); three are narrowed
(3, 4, 9); two are reclassified to `sanctioned` (1, 2); three wait for Stage 4 (5, 6, 7).** Of the
eight survivors, 3 wait for Stage 4 and 5 are permanent.

**And the list will also GROW.** A counsellor creating a case for a student who has no account still
needs an assessment scored for that case, and §6.1 refuses to let the client write one. Stage 3 must
therefore add a **new** server route that runs the scoring engine on behalf of a case — a new
service-role call site, registered in the list with a justification, per the plan's rule that new
consultancy features must not add service-role paths *outside* the list. MV-154's framing of the
list as monotonically shrinking does not survive Stage 3.

**Net-net Stage 3 ends at 9 entries — the same count it started with.** Stage 3 retires exactly one
service-role path and adds one. That is the honest number, and stating it plainly is the point: a
stage that reads as "the enforcement boundary advanced" advanced it by *scope* (writes move onto the
authenticated client inside `profile/section`, and the case route reaches student data as the
authenticated user for the first time), not by *count*. A reader who scores Stage 3 on the size of
this list will conclude it achieved nothing, and will be measuring the wrong thing.

### 6.3 The consultancy-created row shape

MV-157 established the rule: rows with an owning Auth user dual-write `owner` **and** `case_id`;
consultancy-created rows carry `case_id` only. Stage 3 is where the second half first happens.

**Per table, a consultancy-created row is:** `owner IS NULL`, `case_id = <the case>`, on a case with
`organization_id IS NOT NULL` and `student_user_id IS NULL`.

Every invariant that must still hold, and why it does — all verified live, none requiring new SQL:

| Invariant | Holds for `owner IS NULL`? | Why `[Q7, Q8]` |
|---|---|---|
| Uniqueness | **Yes** | Every uniqueness index is keyed on `case_id`, never `owner` (§2.5). Nothing to collide. |
| `owner` nullability | **Yes** | `owner` is nullable on all nine tables (§2.6). |
| `case_id` presence | **Yes** | `NOT NULL` on eight; `assessments` guarded by `assessments_case_required_when_owned`, whose exemption requires `owner IS NULL AND claimed_at IS NULL` — an *unclaimed anonymous* row, which a consultancy row is not, so a consultancy assessment must carry `case_id`. Correct by construction. |
| Composite FK chain | **Yes** | Keyed `(id, case_id)`, not `(id, owner)` (§2.7). |
| Ownership-axis check | **N/A — already dropped** | MV-156's `<table>_ownership_axis_present` checks were dropped by MV-160 once `case_id` went `NOT NULL`. Confirmed: no such constraint exists on any of the nine `[Q8]`. A Stage 3 slice looking for it will not find it; that is correct, not missing. |
| `owner` write-once | **Yes, and it protects Stage 3** | `mv155_derive_case_id_from_owner` `[Q6]` refuses `owner` NULL→value unless the value is `private.case_student_id(new.case_id)`. So when a student later claims a consultancy case, adopting its rows means naming *that case's own student* — a counsellor cannot hand themselves a row. |
| `case_id` immutability | **Yes** | Same trigger: `case_id` value→other-value raises `42501` **even for `service_role`**. A row cannot be carried between cases on any path. |

**One trap.** `mv155_derive_case_id_from_owner` runs on `document_status` and `user_program_state`
only `[Q6]`, and its derivation branch fires when `case_id IS NULL AND owner IS NOT NULL`. For a
consultancy row `owner` is NULL, so the branch is skipped and `case_id` must be supplied explicitly.
A Stage 3 writer that relies on derivation will insert `NULL` into a `NOT NULL` column and get `23502`,
not a helpful message.

---

## 7. Findings — where the plan or the model contradicts reality

Raised, not resolved. Criterion: a cell that contradicts the Stage 1 canonical matrix is a **finding
for the founder**, not a decision this spec may take.

**Three are blockers: F-1, F-3 and F-8.** F-1 and F-3 are founder decisions this spec declines to
take; **F-8 is a carve gap this spec closes** (§4 cells 21–23, §9.1 E4/E7). The rest are recorded so
a slice does not rediscover them mid-build. **F-9 was added by MV-169's build**, per §1 rule 2 — a
slice that finds the document incomplete amends it in its own PR.

### F-1 `[DECIDED — 2026-08-10, reading (a)]` The Stage 3 exit gate names a counsellor doing two things the canonical model forbids

> **THE FOUNDER DECIDED THIS ON 2026-08-10: reading (a).** "Counsellor" in the plan's exit gate is
> loose prose for *consultancy staff*; case creation and assignment are an **owner/admin** surface.
> Nothing moves. `cases_insert_admin`, `case_assignments_insert_admin` and
> `CASE_PERMISSION_MATRIX.counsellor` are all unchanged, and MV-171 built against them as they are —
> the slice shipped **no migration and no matrix edit** (§5's "Stage 3 ships no migration that adds
> or alters a column" held with room to spare: MV-171's only SQL-adjacent change was none at all).
> `lib/cases/permissions.ts:168-169`'s comment — *"Widening this is a deliberate later decision, not
> a convenience"* — is now a **recorded decision** rather than an open question.
>
> **Widening to counsellors later is its own carded slice**, and this is what it would cost: a
> migration replacing both INSERT policies, a `CASE_PERMISSION_MATRIX` edit, and edits to the Stage 1
> suites that pin all three — `tests/integration/case-rls.itest.ts:818` (counsellor case creation
> refused) and `:1013` (counsellor self-assignment refused), plus `tests/cases/permissions.test.ts`.
> A slice that finds those tests red has moved a canonical cell and is wrong unless that is exactly
> what it was carded to do.
>
> **F-3 remains open.** This document had two founder decisions outstanding; it now has one.
>
> The original finding is preserved below, unedited, because the reasoning is what the decision was
> taken against.

The plan's exit gate (line 646): *"an authorized **counsellor** can **create**, find, **assign**, and
manage a case without a student account."*

Measured, **both** enforcement layers deny a counsellor two of those four verbs:

| Verb | SQL `[Q4]` | TypeScript (`lib/cases/permissions.ts`) |
|---|---|---|
| create | `cases_insert_admin` requires `actor_admin_org_ids()` | `counsellor: { "case.create": "deny" }` |
| assign | `case_assignments_insert_admin` requires `can_manage_case` = `is_org_admin` | `counsellor: { "case.assign": "deny" }` |
| find | assigned cases only | `"case.list": "assigned"` |
| manage | `can_staff_case` — **allowed** when assigned | `"case.update": "assigned"` |

The TS layer even carries the intent: *"Stage 1 default: case creation is an owner/admin action.
**Widening this is a deliberate later decision, not a convenience.**"* This is that decision arriving.

The two layers **agree with each other** — this is not a divergence to reconcile, it is the plan's
prose disagreeing with a settled, twice-implemented model.

**Two readings, and they carve differently:**

- **(a) "counsellor" means "consultancy staff".** The gate is already satisfiable by an owner/admin;
  nothing changes; MV-171 builds creation/assignment as an **admin** surface. *Cheapest, matches both
  layers, and matches the plan's own role table, which gives "case operations" to the admin and
  "assigned cases" to the counsellor.*
- **(b) "counsellor" means the role.** Then `counsellor.case.create` and `.case.assign` must widen —
  a **canonical matrix amendment**, touching `CASE_PERMISSION_MATRIX`, `cases_insert_admin`,
  `case_assignments_insert_admin`, and the Stage 1 suites that pin all three. That is a slice of its
  own and it moves a canonical cell, which rule 3 of §1 forbids this spec from doing.

**Recommendation: (a).** The plan's own "Users and responsibilities" table — the source the canonical
matrix was derived from — gives the counsellor *"accesses assigned cases by default"* and the admin
*"oversees assignments and case operations"*. Read against that table, the exit gate's "counsellor"
is loose prose for "consultancy staff", and (a) contradicts nothing. **The spec proceeds on (a)** and
§8's carve assumes it; if the founder chooses (b), MV-171 gains a predecessor slice and §4 cells 8–9
change.

**This is one of two decisions in this document that are not the spec's to take** — the other is
**F-3**. They differ in kind, and the difference is why F-1 carries a recommendation and F-3 does not:
here the plan's prose disagrees with two enforcement layers that agree with each other, so reading (a)
contradicts nothing and can be adopted provisionally. In F-3 every layer agrees and a *new* surface
is what makes the settled answer uncomfortable — so there is no reading that contradicts nothing, and
the spec offers none.

### F-2 `[NEW CELL]` Nobody can create an organization

`authenticated` holds **no INSERT grant on `organizations`** and there is no INSERT policy `[Q2, Q3, Q4]`.
Org creation is service-role-only, and no route does it today. The plan's bullet 1 says "build
organization selection **and team management**" and simply assumes an org exists.

For a pilot with one named consultancy this is fine — the org is provisioned once, out of band. It
is recorded here so a slice does not discover it mid-build and improvise a grant. **No Stage 3 slice
grants org creation**; provisioning stays a founder/ops action until a stage asks for self-serve
signup. Marked NEW because Stage 1's canonical matrix has no `org.create` verb at all.

### F-3 `[BLOCKER — CANONICAL AMENDMENT, FOR THE FOUNDER]` A new Stage 3 surface exposes a settled canonical cell

**The mechanism, measured.** `cases` grants `authenticated`
`UPDATE (archived_at, display_name, email, operational_status)` `[Q3]`, `cases_update_accessor`
admits the linked student `[Q4]`, and `enforce_case_write_surface` guards **only** `archived_at` and
`operational_status` `[Q6]`. So `display_name` and `email` are writable by the linked student.

**That omission is the canonical decision, not a gap — and it was taken twice.** The Stage 1 matrix's
own required change reads (`docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md:68-70`):
*"split the flat column grant so the student's write surface is **profile fields only**, never
`operational_status` / `archived_at`."* The migration that built the guard states it in the same
breath, under the heading *"The canonical access matrix (divergences 2 and 4) **settles** the split"*
(`supabase/migrations/20260730180000_case_aware_rls_policies.sql:459`): *"display_name, email —
profile fields. The student's surface, per the plan's 'updates permitted profile fields'; staff hold
it too, per 'manages the student profile'."* A live Stage 1 test pins it **positively**, not by
omission: `tests/integration/case-rls.itest.ts:833` — `it("lets the linked student edit profile
fields on their own case")` — asserting the student's `display_name` write returns no error and the
value applied.

Note the cell's provenance is *not* divergences 2 and 4 — those are the **denials** of
`operational_status` / `archived_at`, already spent on cells 10 and 11. Cell 12 traces to the same
canonical string cell 14 uses: *"updates permitted profile fields"*.

**What IS new is the read side, and it is genuinely new.** Stage 3 is the first stage in which a
surface *displays* these fields **to a third party**: MV-170's student list. A student could rename
their case to impersonate another student in a counsellor's list, or change the `email` a counsellor
corresponds with. No canonical document reasons about a staff-facing list rendering a
student-writable field, because until Stage 3 no such list existed. **The trust concern is real.**

*Stated honestly about its own evidence:* unlike every other claim in this document, this one is a
**forecast, not a `[Q]` measurement**. MV-170 has no card dossier yet and no case-list surface exists
— `display_name` appears in `app/` exactly once, in a comment at `app/api/account/delete/route.ts:20`.
The risk is a consequence of the carve, not of a captured row.

**Why this spec takes no decision.** Closing it at the write layer moves a canonical cell, which §1
rule 3 forbids this document from doing, and §5 states the test verbatim: *"If a Stage 1 or Stage 2
suite needs an edit to stay green, a Stage 3 slice moved a cell and is wrong."* Applying the trigger
fix turns `case-rls.itest.ts:833` red — that rule's own definition of a slice being wrong.

**The two readings:**

- **(a) The canonical cell stands; mitigate at the read layer.** MV-170's list renders
  staff-controlled identity, or marks student-edited fields as student-supplied so a counsellor
  cannot be deceived by one. Moves no cell, breaks no test, and leaves the student the field the
  plan gives them. Separately and independently, MV-173 still closes the **TypeScript** allowlist
  gap footnote ¹ describes — `lib/cases/README.md:152-157` already records where that belongs:
  *"The allowlist belongs with that mutation."*
- **(b) The canonical cell narrows.** `display_name`/`email` become staff-only via
  `enforce_case_write_surface`. This is a **canonical matrix amendment**, touching the Stage 1 matrix
  row, migration `20260730180000`'s stated split, and the Stage 1 pins. **Blast radius, measured so
  the founder is not guessing:** exactly two assertion-pairs in one file —
  `case-rls.itest.ts:835-837` and `:905-907`, both writing `display_name`. `cases.email` is written
  by **no test at all** (it appears only in the grant-list pin at `:556`), so an `email`-only variant
  breaks zero assertions. `tests/integration/tenant-isolation.itest.ts:1786-1809` is **not** affected
  — its student probe writes `operational_status`.

**No recommendation is offered, and no cell is moved.** This is deliberately unlike F-1, where the
plan's prose disagreed with two layers that agreed with each other and the cheap reading contradicted
nothing. Here the plan, the canonical matrix, the migration and the test **all agree**, and it is a
new Stage 3 surface that makes the settled answer uncomfortable. That is a founder call, not a slice's
and not this spec's.

**Removed from MV-173's build scope** (§8.1). The earlier draft of this finding assigned it to MV-173
and picked the trigger option; that handed a canonical amendment **down** to a slice while F-1 handed
its equivalent **up** to the founder — the same class of problem under opposite rules. MV-173 keeps
the case-context indicators and the non-canonical TypeScript allowlist; it does **not** touch the
`cases` column guard.

> **READING (a)'s READ-LAYER HALF IS BUILT, 2026-08-09 BY MV-170. The founder decision is UNCHANGED
> and still open.** The forecast above has become a live surface, so what exists is worth stating
> precisely before the call is taken.
>
> **"A student edited this" is not knowable and is not claimed.** There is no provenance column on
> `cases`, and adding one is a schema change §5 forbids. What *is* exactly knowable is whether a
> student **can** write these fields: `cases_update_accessor`'s student disjunct is
> `student_user_id = (select auth.uid())` (`…20260730180000….sql:432`), which no actor satisfies when
> that column is null. So MV-170's list marks each row from one column:
>
> | Case shape | Who may write `display_name` / `email` | Marker rendered |
> |---|---|---|
> | `student_user_id IS NOT NULL` | staff **and** the linked student | **Self-reported** |
> | `student_user_id IS NULL` | staff only | **No student account** |
>
> plus one sentence next to the list: *"Self-reported means the student has an account and can edit
> their own name and email address. Read those as the student's words, not as a verified identity."*
>
> **This moves no cell and edits no Stage 1 test** — the measurement §5's rule turns on. It is
> presentation over a column the list already reads.
>
> **What it does not do, and what the founder is still deciding.** A marker tells a counsellor to
> distrust a name; it does not stop the name being written. Reading (b) — narrowing
> `display_name`/`email` to staff via `enforce_case_write_surface` — remains the only option that
> closes the write, and its blast radius is still the two assertion-pairs measured above
> (`case-rls.itest.ts:835-837`, `:905-907`), with `cases.email` written by no test at all. **Taking
> (b) later does not require undoing anything MV-170 shipped:** under (b) every row would simply be
> staff-controlled, and the marker becomes redundant rather than wrong.

### F-4 `[SCOPE]` "Consultancy-internal notes" has a permission but no column

`CASE_PERMISSION_MATRIX` carries `case.notes.internal` for owner/admin/counsellor and `deny` for
student, and the canonical role table promises the student *"cannot see consultancy-only notes"*.
**No such column or table exists** — `cases` has no notes column and there is no notes table `[Q1, Q8]`.

The verb is currently unclaimable-by-anyone rather than enforced. Stage 3's bullets do not mention
notes, and Stage 4 owns "case activity". **Recorded as out of scope for Stage 3**, so no slice
invents a notes model to satisfy a permission constant. If a note surface is wanted, it is a
Stage 4 card.

### F-5 `[STALE BULLET]` "Team management" without invitations is thin, and the plan does not say so

Staff invitations are Stage 5 (plan line 660: *"implement team and student invitation acceptance"*).
So Stage 3's team management can change a role and deactivate a member, but **cannot add one** — the
only way a person becomes a member before Stage 5 is a service-role/ops insert. `invitations` grants
`authenticated` INSERT and a policy admits admins `[Q3, Q4]`, so *minting* an invitation row is
already possible in Stage 3; **accepting** one is not built. Bullet 1 reads as though team management
were a complete surface. It is not, and MV-169's scope line says so explicitly.

### F-6 `[REGISTRY DEFECT]` Two service-role entries are mislabelled

`ServiceRoleExceptionStatus`'s own doc-comment defines `legacy-owner-scoped` as *"Pre-tenancy
owner-scoped path… Stage 2 migrates these onto the authenticated client; until then they are
grandfathered, not endorsed."* Two entries carry that label while their justifications describe a
**permanent, deliberate** design:

- `app/(focused)/assessment/[id]/page.tsx` — serves an unauthenticated visitor, so no grant to
  `authenticated` can ever retire it;
- `app/api/account/delete/route.ts` — its text literally reads *"DELIBERATELY still owner-keyed"*.

Both are `sanctioned`, not legacy. Left as-is, the list permanently reports two entries as awaiting
a migration that will never come, and every future stage re-examines them. **Reclassified in MV-174.**

### F-7 `[CONFIRMED CORRECT — do not re-litigate]`

Recorded so later slices do not re-derive them:

- **All six Stage 1 divergences are resolved in the live database.** #1 owner-only org settings, #2
  admin-only archive, #3 counsellor invites the student, #5 no admin-minted owner invitation, #6
  dual-role + inactive membership — all verified `[Q4, Q5, Q6]`. **#2 and #4 are enforced by the
  `cases_write_surface_guard` trigger, not by the policy** (§2.4); a reader checking only policies
  will wrongly conclude they are open. That near-miss is the reason §2.4 exists.
- **The Stage 2 spec §6 claim that all ten verbs are blocked "by the absent grant, not by an RLS
  predicate" is accurate** for all ten `[Q3, Q4]`.
- **The card dossier's "four deferred write grants" is a simplification of §6's ten verbs.** Not
  wrong about the four INSERTs, but a slice sizing the work off "four" will miss `assessments`
  UPDATE/DELETE and `plan_items` DELETE. §6.1 above is the complete list.

### F-8 `[BLOCKER]` Five case-scoped write routes resolve the ACTOR's own case and accept no case id

**Why §6.2's lens could not see these.** That section's inventory is the service-role registry, and
all five of these already run on the **authenticated** client — so none appears in
`lib/supabase/service-role-exceptions.ts` (`app/api/shortlist/route.ts` was removed from it by
MV-157). They are invisible to a nine-path audit and to the ten-verb audit alike, because nothing is
missing: the grants and the policies are already there.

| Route | Writes | Resolves |
|---|---|---|
| `app/api/shortlist/route.ts:46` | `user_program_state` | `resolvePersonalCaseId(data.user.id, supabase)` |
| `app/api/documents/status/route.ts:33` | `document_status` | same |
| `app/api/outcomes/prediction/route.ts:28` | `program_predictions` | same |
| `app/api/outcomes/attempt/route.ts:31` | `application_attempts` | same |
| `app/api/outcomes/event/route.ts:32` | `outcome_events` | same |

Every one takes **no case id** and resolves the **actor's own personal case**. They serve
`app/(app)/matches/page.tsx`, `app/(app)/checklist/page.tsx` and
`app/(app)/checklist/[programId]/page.tsx` — precisely the experience §8.1 scopes MV-172 to render
under the case route — and the canonical counsellor is defined as *"manages the student profile,
assessment, matches, plan, and documents."* The migration that granted these tables already names
three of the five as the authenticated-client paths it exists to serve
(`…20260802120000….sql:608-612`).

**Two failure modes, and neither is loud:**

1. **Left as-is**, MV-172 renders matches and the checklist in the case route and every write control
   writes to the **counsellor's own personal case** — or fails when the counsellor has none. RLS
   cannot catch this: the counsellor legitimately may reach their own case. Grants and policies are
   in place (`…20260802120000….sql:670,674`; `ups_*_case` / `ds_*_case` / `pp_`/`aa_`/`oe_insert_case`
   `[Q3, Q4]`), so the write **succeeds** — against the wrong case.
> **CORRECTED 2026-08-08 BY MV-168 — half of failure mode 2's stated mechanism was already false.**
> The quoted doc comment says the derive trigger *"overwrites any supplied value"* of `case_id`, and
> `lib/matches/repo.ts` and `lib/documents/status-repo.ts` said the same. **MV-159 qualified the
> trigger** `if new.case_id is null and new.owner is not null` — read back from
> `pg_get_functiondef` — so a supplied `case_id` is respected and the derive branch is skipped
> entirely. That matters beyond tidiness: under the stale description, moving these writers onto
> `caseWriteColumns` would silently re-point an owner-bearing row on an **org** case to the owner's
> *personal* case. It does not. All three comments are corrected in MV-168's PR.
>
> The **grant** half of failure mode 2 stands exactly as written, and it is the load-bearing half:
> `case_id` can never enter an UPDATE grant, so the `.upsert()` form is unreachable regardless.
> MV-168 retires `caseUpsertColumns` altogether — with both call sites on read-then-insert there is
> no seam left for it to paper over, and leaving a helper that refuses every consultancy case is a
> trap for MV-171 and MV-172.

2. **Given a case id but otherwise unchanged**, the two UPSERT-seam routes refuse.
   `caseUpsertColumns` (`lib/cases/dual-write.ts:153-160`) returns `null` whenever the case has no
   `student_user_id`, and its own doc-comment says why (`:147-151`): *"With `owner IS NULL` the
   trigger does not fire, nothing derives `case_id`, and supplying it needs the `UPDATE(case_id)`
   grant Stage 2 withholds — **the residual seam spec §4 rule 2 records as a Stage 3 input.**"* So on
   a student-less case `setObtained` logs *"refused: case has no student_user_id"* and returns
   `false`, and `upsertProgramState` returns `false`. **Stage 2 handed this forward by name, and the
   first draft of this spec did not pick it up.**

**Failure mode 2 is BLOCKER-2's defect on two more tables**, and it takes the same resolution: move
both writers off `.upsert()` to read-then-insert (§2.5's stated Stage 3 writer pattern), because
`case_id` can never enter an UPDATE grant. §6.3's "one trap" states the *derivation* half of this and
stops there; the grant half is what actually blocks the write.

**Resolution and ownership.**

- **MV-168** converts `upsertProgramState` and `setObtained` off `.upsert()`, alongside the identical
  `profiles` conversion (§6.1), so all three land with one pattern and one test.
- **MV-172** changes the five route signatures to accept and authorize an **explicit case id**
  instead of resolving the actor's own. The three `outcomes` routes use a plain `INSERT` and need
  only this half.
- **§4 cells 21–23** carry the surfaces; **§9.1 E4 and E7** carry the proof.

**E4 is extended rather than left as it was**, because as originally written it asserted only a
`profiles.sections` update and a `plan_items` insert — so the stage gate could go green with a live
cross-case write sitting in the checklist. **E7 is added** to pin the negative directly.

### F-9 `[SURFACE LIMIT]` The team list can show no names — added by MV-169's build

`organization_memberships` carries `user_id` and nothing else identifying, and `auth.users` is not
readable by `authenticated` `[Q2, Q3]`. There is no other staff-identity source in the schema:
`cases.display_name` / `cases.email` describe the **student** of one case, not a staff member.

So cell 4's list can render a role, a status, a "you" marker and a truncated user id — and that is
the whole of it. An admin managing a five-person team sees five hex prefixes.

**Not fixable inside Stage 3.** Every remedy is a schema change (a `staff_profiles` table, or a
`display_name` column on the membership) and §5 says Stage 3 ships **no migration that adds or
alters a column**. Recorded here so MV-170 does not rediscover it and improvise one, and so the
founder can see the real shape of what F-5 already called thin: Stage 3 team management is *role
change and deactivation, performed against opaque identifiers*. The natural home for the fix is
**Stage 5**, which introduces invitations and therefore already has to carry a name and an email
address for a person who is not yet a user.

> **CHECKED AGAINST THE STUDENT LIST 2026-08-09 BY MV-170 — this limit does NOT carry over, and no
> column was improvised.** F-9 is a statement about `organization_memberships`, which carries
> `user_id` and nothing else identifying. `public.cases` is not in that position: it carries
> `display_name text not null`, `email text` and `operational_status text not null` as its **own**
> columns (`20260730120000_stage1_tenancy_core.sql:92-96`), `grant select … on public.cases to
> authenticated` is table-level (`…20260730180000….sql:684`), and `cases_select_accessor` decides
> **rows**, not columns. So cell 7's list renders real names, real email addresses and a real status
> with no schema change at all.
>
> The generalisation to avoid is "Stage 3 surfaces cannot show names". The true statement is
> narrower: **staff have no readable identity; students do, because their identity is a column on the
> case rather than a row in `auth.users`.** MV-170 renders no `student_user_id` — a raw Auth user id
> is no use to a counsellor and does not belong in markup — so the only identity on the surface is
> the case's own.

---

## 8. The slice carve

Next free id verified against `board.json` at carve time: **167 cards, max `MV-166`** — so Stage 3
allocates **MV-167 upward**.

### 8.1 Slice map

| Slice | Bullet | Scope in one line | Depends on | Explicitly NOT in scope |
|---|---|---|---|---|
| **MV-167** STAGE 3 UMBRELLA | — | Tracking only: holds the slice map, the DAG, the exit gate, F-1's open decision, and the legal-gate condition. Ships nothing. | — | Any code. Do not build from this card. |
| **MV-168** CONSULTANCY WRITE GRANTS | prereq | The only SQL in Stage 3: `INSERT` grant+policy on `profiles` and `plan_items`, `UPDATE (is_primary)` grant+policy on `assessments`, each mirroring the five-sibling `WITH CHECK` template (§2.3). **Plus the three `.upsert()` → read-then-insert conversions** the grants depend on — `upsertProfileForCase`, `upsertProgramState`, `setObtained` (§6.1, F-8). Retires 2 of the 4 DEFERRED HALF assertions and rewrites the other 2's comment (§6.1). Amends Stage 2 spec §6. | — | No UI. No route **signature** changes (that is MV-172). No `assessments`/`documents` INSERT (refused/deferred — §6.1). No schema change. |
| **MV-169** ORG CONTEXT + TEAM MANAGEMENT | 1 | Org selection for a multi-org actor (`getOrgContext`/`requireOrgPermission` wired to a real surface) + team list, role change, deactivate. Owner-only org settings (cell 2). | — | **No org creation (F-2). No invitations (F-5, Stage 5).** No case surfaces. |
| **MV-170** STUDENT LIST / SEARCH / FILTERS | 2a | The org-scoped case list: search, filter, `operational_status` display. Read-only. Assigned-only for counsellors, all-org for owner/admin (cell 7). | MV-169 | No creation, no assignment (MV-171). No writes at all. |
| **MV-171** CASE CREATION + ASSIGNMENT | 2b | Create a case with `student_user_id IS NULL`; assign/reassign the single primary counsellor slot; write `operational_status`. Carries **F-1's resolution** — built as an admin surface under reading (a). Adds the case-scoped scoring route (§6.2). | MV-168, MV-170 | No archive (Stage 6). No student invitation (Stage 5). Not a multi-counsellor model (§2.5). |
| **MV-172** THE CASE ROUTE | 3 | Render the existing MeroVisa experience under an explicit `case` route, for a case that is not the actor's own. Flips `app/api/plan/action` onto the authenticated client and **splits** `app/api/profile/section` — its profile write moves, its three refused legs stay service-role (§6.2 entries 8–9). **Plus F-8**: the five case-scoped write routes take an explicit case id instead of the actor's own. | MV-168, MV-171 | No documents model change (Stage 4). No indicators (MV-173). **Does not retire `profile/section`'s registry entry** (§6.2 entry 9). |
| **MV-173** CASE-CONTEXT INDICATORS + FIELD ALLOWLIST | 4 | Whose case am I in, and is it mine — persistent, unmissable. Plus the **TypeScript** field allowlist of footnote ¹: `lib/cases/permissions.ts` must stop admitting an arbitrary case patch from a student (`lib/cases/README.md:152-157` — *"The allowlist belongs with that mutation"*). | MV-172 | No new data. No notes (F-4). **Not F-3's column guard** — that is a canonical amendment awaiting the founder, not this slice's to take. |
| **MV-174** SERVICE-ROLE RETREAT + STAGE EXIT | exit | Reclassify entries 1–2, narrow 3–4 **and 9**, confirm 5–7 wait for Stage 4, register the new scoring route (§6.2) — ending at **nine** entries. Prove the exit gate (§9). **Carries the stage exit.** | all | No new surfaces. |

### 8.2 The DAG, with a stated reason per edge

```
MV-168 ─┬─────────────► MV-171 ──► MV-172 ──► MV-173 ──┬──► MV-174
        └──► (MV-172)                                   │
MV-169 ──► MV-170 ──────► MV-171                        │
MV-168 ─────────────────────────────────────────────────┘
```

| Edge | Kind | Why this order is forced |
|---|---|---|
| MV-168 → MV-171 | **data** | Creating a case for a student with no account is useless until something can be written into it. Every write MV-171 needs on `profiles` and `plan_items` is `42501` through the authenticated client until the grant exists (§2.3). |
| MV-168 → MV-172 | **data** | MV-172 moves `plan/action` off service-role entirely and `profile/section`'s profile write off it (§6.2 entries 8–9). Those moves *are* grants 1 and 5. MV-172's F-8 route changes additionally depend on MV-168's three `.upsert()` conversions: a case-id parameter is useless while `caseUpsertColumns` refuses every student-less case. Without MV-168, MV-172 ships the case route still on service-role — the opposite of the enforcement boundary. |
| MV-169 → MV-170 | **data** | The case list is scoped by the selected organization. With no org context there is no scope to list within, and for a single-org actor the "selection" is still the object the query keys on. |
| MV-170 → MV-171 | **code** | Creation and assignment are entered from the list and reuse its org-scoped case query and row component. Building them first means building that scoping twice and reconciling it later. *Stated as a code dependency, not a data one — it could be parallelised at the cost of rework.* |
| MV-171 → MV-172 | **data** | The case route must be exercised against a case with `student_user_id IS NULL`. MV-171 is what produces one. Before it, the route can only be tested against a personal case — which is the Stage 2 shape and proves nothing new. |
| MV-172 → MV-173 | **code** | An indicator indicates the route's context. There is nothing to indicate before the route exists. *(F-3 no longer contributes to this edge — its fix is a canonical amendment awaiting the founder, not MV-173 work.)* |
| MV-173 → MV-174 | **gate** | The exit gate asserts across every Stage 3 surface; it cannot be green before the last one lands. |
| MV-168 → MV-174 | **data** | The exit gate's write criteria (E4) run against the grants. |

**No release-train bracket is needed in Stage 3, and that is a decision, not an omission.** Stage 2
needed `[MV-157 + MV-158]` in one PR because merging half of it *created* a live window in which the
claim path wrote `owner` without `case_id`, and `master` auto-deploys. No Stage 3 pair has that
property: every Stage 3 surface is **new and unreachable** until its own route ships, so a
half-merged Stage 3 is a feature that does not exist yet, not a broken invariant.

**The one edge that deserved the check is MV-168.** It widens a grant on production before any
Stage 3 UI can use it, so for one or more deploys `authenticated` holds an INSERT nobody calls. That
is safe **only because** the policy carries the five-sibling `WITH CHECK` (§2.3): the actor must
already reach the case, and `owner` must be NULL or the case's own student. A student gains the
ability to insert their own `profiles`/`plan_items` rows directly via PostgREST — rows they can
already create through the app's routes, in a case they already own. **MV-168's acceptance criteria
must pin that explicitly**, because the naive grant (table-wide, no `owner` conjunct) would instead
let any actor write rows attributed to another user.

### 8.3 Test data vs. the legal gate

**No Stage 3 slice is blocked by the Stage 0 D-B legal gate.** D-B gates *onboarding real student
personal data entered by consultancy staff*. It does not gate building or proving the mechanism. The
plan says so itself (line 646): *"Real student personal data may enter only if the Stage 0 legal gate
has been passed; **otherwise Stage 3 runs on test data**."*

| Slice | Reachable on seeded test data? | Needs the gate? |
|---|---|---|
| MV-167 … MV-174 | **Yes — all eight** | **No** |
| Onboarding the named pilot consultancy with real students | — | **Yes — and that is Stage 7's pilot, not Stage 3.** |

So the carve is fully actionable while the agreement is with counsel. What the shut gate costs
Stage 3 is not build progress but **evidence quality** — see §9.2.

---

## 9. The stage exit gate

### 9.1 The plan's sentence, turned into observable criteria

Plan line 646: *"an authorized counsellor can create, find, assign, and manage a case without a
student account."* Under F-1 reading (a), "authorized counsellor" = consultancy staff holding the
verb. Each criterion is a named test at a named layer; **MV-174 owns all seven.**

| # | Criterion | Layer / test |
|---|---|---|
| **E1** | An org **admin** creates a case with `organization_id` set and `student_user_id IS NULL`, **through the authenticated client**. | real-DB `tests/integration/stage3-workspace.itest.ts` |
| **E2** | An **assigned** counsellor sees that case in the org-scoped list; an **active but unassigned** counsellor in the same org does not; an **inactive** member sees nothing. | same suite |
| **E3** | An admin assigns the counsellor; a second `primary_counsellor` assignment on the same case is refused (`23505`, `case_assignments_primary_idx`). | same suite |
| **E4** | The assigned counsellor writes `profiles.sections`, **inserts a `plan_items` row**, **ticks a `document_status` row and writes a `user_program_state` row** for that case through the authenticated client, with `owner IS NULL` on every row written. | same suite |
| **E5** | The case route renders for the assigned counsellor and 404s for the unassigned one. | route-level test |
| **E6** | No `service-role-exceptions.ts` entry is `legacy-owner-scoped` without a named later stage; §6.2's tracked set is **9** entries — eight survivors plus the new scoring route — with the dispositions of §6.2. | unit test over the registry metadata |
| **E7** | **No case-scoped write route resolves the actor's own case.** For each of F-8's five routes, a request made by the assigned counsellor in the student's case context writes a row carrying **that case's** id — asserted by reading the written row's `case_id` back, never by a 200. | route-level test + real-DB read-back |

### 9.2 How each criterion could pass vacuously

Stage 2's §A2 was nearly unfalsifiable because production held zero rows of the shape it tested, and
MV-165 recorded that honestly rather than claiming a pass **[inherited]**. The same failure is
available here, so each criterion states its own vacuity condition and its guard.

| # | Passes vacuously if… | Guard the test must carry |
|---|---|---|
| E1 | it runs as `service_role`, which bypasses every policy — the commonest way an RLS test proves nothing | assert the actor's JWT `role` is `authenticated`, and assert a parallel `anon` attempt returns `42501` |
| E2 | the org holds only one case, or the "unassigned" counsellor has **no membership at all** — then it is a tenancy test, which Stage 1 already passes, not an assignment test | fixture must hold **≥2 cases in the same org**, and the unassigned counsellor must hold an **`active`** membership in it |
| E3 | the second assignment is never attempted, leaving only the happy path | assert the `23505` explicitly; a green E3 without a refusal is not evidence |
| E4 | **the case under test has a `student_user_id`** — then `owner` may be non-null and the consultancy row shape is never exercised. *This is the direct analogue of §A2's failure.* | assert `cases.student_user_id IS NULL` **and** `owner IS NULL` on every row created, **and** assert the created-row count is `> 0` (an empty write set satisfies "all rows have `owner IS NULL`" trivially) |
| E4 (seam half) | **`setObtained` / `upsertProgramState` return `false` rather than throwing.** A test that awaits the call and asserts no exception passes while the write was refused — which is exactly what `caseUpsertColumns` does today on a student-less case (F-8 failure mode 2) | assert **the row exists**, read back by `(case_id, kind)` / `(case_id, program_id)`. Never assert "did not throw", and never trust the boolean alone |
| E5 | both actors 404 for an unrelated reason (missing route, build error) | the positive half must assert rendered case content, not merely a 200 |
| E6 | the registry is read as a list of strings and the assertion is `length === 9` | assert **per-entry disposition**, not the count; a count passes after any two-entry swap |
| E7 | **the counsellor under test has no personal case of their own** — then a mis-scoped write has nowhere to land, and a route that resolves the actor's own case is indistinguishable from one that honours the parameter | the counsellor fixture must itself hold **a personal case with at least one pre-existing row on the same table**, so a wrong-case write is observable as a row on the wrong case rather than as an error |

### 9.3 The gate's own limit, stated up front

**Every criterion above is proved on seeded test data.** With D-B shut, production holds no
consultancy organization and no student-less case, so none of E1–E7 says anything about production
behaviour — exactly the `document_status` / anonymous-population vacuity MV-165 flagged and left open
**[inherited]**.

**What a reader should conclude when Stage 3 goes green with the gate still shut:** the mechanism is
built and proven — a student-less case can be created, found, assigned, and written to under RLS as
the authenticated user. **Not** that it works for real students, real counsellors, or real data
volumes. That second claim is earned in Stage 7's controlled pilot and nowhere earlier. A Stage 3
Done evidence block that claims more than the first sentence is overclaiming, and the founder should
read it as such.

---

## 10. Query appendix — how each claim was derived

Run against `supabase_db_merovisa` (local Docker, repo migration head) on **2026-08-07** via
`docker exec supabase_db_merovisa psql -U postgres -d postgres`.

| Ref | Purpose | Query |
|---|---|---|
| **Q1** | migration parity | `select version from supabase_migrations.schema_migrations order by version desc;` compared against `ls supabase/migrations/` |
| **Q2** | table-level grants | `select table_name, grantee, string_agg(distinct privilege_type,',') from information_schema.role_table_grants where table_schema='public' and grantee in ('authenticated','anon','service_role') group by 1,2;` |
| **Q3** | **column-level grants** (the authoritative set) | `select table_name, grantee, privilege_type, string_agg(column_name,',' order by column_name) from information_schema.role_column_grants where table_schema='public' and grantee in ('authenticated','anon') group by 1,2,3;` |
| **Q4** | policies + expressions | `select c.relname, p.polname, p.polcmd, pg_get_expr(p.polqual,p.polrelid), pg_get_expr(p.polwithcheck,p.polrelid) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';` |
| **Q5** | `private` helper bodies | `select p.proname, p.prosecdef, pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private';` |
| **Q6** | triggers + guard bodies | `select c.relname, t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal;` |
| **Q7** | nullability + unique indexes | `select table_name, column_name, is_nullable from information_schema.columns where table_schema='public' and column_name in ('owner','case_id','student_user_id','organization_id');` and `select tablename, indexname, indexdef from pg_indexes where schemaname='public' and indexdef like '%UNIQUE%';` |
| **Q8** | constraints | `select c.relname, con.conname, con.contype, pg_get_constraintdef(con.oid) from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and con.contype in ('u','c','f','p');` |

**Spot-check instruction for a reviewer** (this card's test plan): pick any three claims and re-run
the cited query. A claim whose query is missing is a defect in this document.

---

## 11. Decision log

- **2026-08-07 — written by the MV-166 spec session.** Grounded in `[Q1]`–`[Q8]` against the local
  stack at repo migration head; production deliberately not read (§1). Ten deferred verbs resolved
  (§6.1) — three granted, four refused permanently, one deferred to Stage 4, two confirmed never.
  Carve: MV-167 umbrella + MV-168…MV-174, DAG with a reason per edge, no release train (§8.2).
- **2026-08-07 — revised after adversarial review of the first draft (same card, same PR).** Four
  corrections, each of which would have sent a slice to build the wrong thing:
  1. **§6.2 entry 9 narrows, it does not retire.** `app/api/profile/section/route.ts` carries three
     further legs — `assessments` UPDATE `(result)`, `plan_items` generator-column copy refresh, and
     `adoptOwnerKeyedResidue`'s `UPDATE (case_id)` — that §6.1 refuses. All three fail **silently**
     (`re-score.ts:33` discards its error; `throwOnError` appears nowhere in `lib/` or `app/`).
     §6.1 row 6's "the existing UPDATE grant covers the domain" corrected. **Arithmetic corrected:
     9 → 8, net-net 9, not 8.**
  2. **Grant 1 did not unblock its own call site.** The first profile write is `.upsert()`
     (`lib/profiles/repo.ts:84`), which needs `UPDATE (case_id)` — forbidden by design. Resolved by
     converting the call site to read-then-insert in MV-168, not by widening the grant.
  3. **F-8 added.** Five case-scoped write routes resolve the actor's own case and take no case id;
     §6.2's registry lens was structurally blind to them. Cells 21–23, E4 extended, **E7 added**.
  4. **F-3 reclassified.** The student's `display_name`/`email` write is a **canonical** decision
     (`stage1-canonical-access-matrix.md:68-70`; `20260730180000….sql:459`), pinned positively at
     `case-rls.itest.ts:833`. The first draft called it a NEW cell and picked the fix; that moved a
     canonical cell, which §1 rule 3 forbids. **Escalated to the founder in F-1's shape, removed from
     MV-173's scope. Two founder decisions now stand open, not one.**

  Net: **eight findings** (§7), of which **F-1 and F-3 are founder decisions this spec declines to
  take**; F-1 proceeds on reading (a) provisionally, F-3 offers no recommendation. **Nine
  service-role paths dispositioned (§6.2): one retires, three narrow, two reclassify, three wait for
  Stage 4, one new entry is added — net 9 → 9.**
- **Departures from Stage 2 spec §6, to be amended in MV-168's PR:** `assessments` INSERT **refused**
  (server-side scoring, §6.1) rather than granted; `assessments` UPDATE **narrowed** to `is_primary`;
  `documents` INSERT **deferred to Stage 4** rather than granted in Stage 3.
- **Picked up from Stage 2 and previously dropped:** `lib/cases/dual-write.ts:147-151` recorded the
  `owner IS NULL` UPSERT-seam refusal as *"a Stage 3 input"*. It is now carried by **F-8** and
  MV-168's conversions. A verb handed forward by name and not picked up is how a deferral becomes
  permanent by accident — the same failure §6.1 opens by warning about.
- **2026-08-08 — amended by MV-169's build (§1 rule 2).** Two additions, neither of which moves a
  cell:
  1. **F-9 added** — cell 4's team list can render no names, because no staff-identity source is
     readable by `authenticated`. Not fixable in Stage 3 (§5 forbids the migration); flagged to
     MV-170 and proposed for Stage 5.
  2. **A self-mutation refusal on cell 5, at the app layer only.** The database permits an owner to
     deactivate their own membership. With **F-2** (nobody can create an organization) and **F-5**
     (nobody can invite), that is a permanent lockout with no in-product repair — the tenant needs a
     service-role/ops intervention to get an administrator back. `decideMembershipChange` therefore
     refuses any change whose target is the actor's own row. This is **strictly narrower** than the
     canonical cell and moves nothing: the same shape as MV-173's TypeScript field allowlist, which
     §4 footnote ¹ already endorses as the right layer for a restriction Postgres does not express.
     Recorded here rather than left in the code so a later slice reading only the matrix does not
     "fix" it back open.
- **2026-08-09 — amended by MV-170's build (§1 rule 2).** Three additions, none of which moves a
  cell:
  1. **F-9 checked against cell 7 and closed for it.** The team list's name-blindness is a fact about
     `organization_memberships`, not about Stage 3. `cases` carries `display_name`/`email`/
     `operational_status` as its own table-level-`select`-granted columns, so the student list renders
     real identity with no schema change. The generalisation "Stage 3 surfaces cannot show names" is
     **false** and is the thing this entry exists to stop.
  2. **F-3 reading (a)'s read-layer half is built, and the founder call is untouched.** The marker is
     derived from nullness of `student_user_id` — "a student *can* write this" — rather than from a
     provenance column, because provenance is not representable without a migration §5 forbids.
     Reading (b) remains open, and adopting it later makes the marker redundant rather than wrong.
  3. **A search term never enters a PostgREST filter as structure.** MV-170 searches two columns,
     which PostgREST expresses only through the `.or()` string DSL, where a comma or a parenthesis
     typed into a search box changes the shape of the query. The status filter — a value from the
     check-constrained vocabulary, validated first — is applied by the database; the free-text term is
     applied in TypeScript. Recorded so MV-171 and MV-172 do not "optimise" the search into `.or()`.
- **2026-08-10 — F-1 DECIDED BY THE FOUNDER: reading (a), owner/admin only.** Recorded in §7 F-1
  above. One of the two open founder decisions closes; **F-3 remains open**. Nothing moved: both
  enforcement layers already implemented reading (a), so MV-171 built against them unchanged.
- **2026-08-10 — amended by MV-171's build (§1 rule 2).** Four additions, none of which moves a cell:
  1. **The write-surface trigger never fires on INSERT**, so cell 10's guard does not reach a newly
     created case. `cases_write_surface_guard` is `BEFORE UPDATE … FOR EACH ROW` (§2.4). MV-171
     therefore does **not** name `operational_status` on insert and lets the `'new'` default apply —
     naming it would put a client-supplied value in a column with no guard behind it. Recorded
     because §2.4 describes what the trigger refuses without stating when it runs, and a slice
     reading only that section would assume the column was protected on both verbs.
  2. **Reassignment is delete-then-insert, and the app checks the assignee's membership FIRST.**
     `case_assignments_insert_admin`'s `is_case_org_member` conjunct would refuse a non-member or an
     inactive member anyway — but only *after* the previous assignment had been deleted, leaving the
     case with nobody on it. The app-layer pre-check turns the predictable failure into a no-op. This
     is **strictly narrower** than the policy and moves nothing, the same shape as MV-169's
     self-mutation refusal. What remains is an infrastructure failure between the two writes, and the
     result type names that outcome (`leftUnassigned`) rather than reporting a generic failure that
     reads as "nothing happened".
  3. **The service-role registry GREW to 16 entries**, exactly as §6.2 forecast. The new one is
     `app/api/cases/[caseId]/assess/route.ts`, registered `sanctioned` — not `legacy-owner-scoped`,
     because it is not waiting on a grant a later stage will deliver. It authorizes with
     `checkCasePermission` on the **authenticated** client *before* `createSupabaseAdminClient` is
     called, and `tests/api/case-routes.test.ts` pins that ordering by asserting the admin client was
     never constructed on a denial. Its intake surface is MV-172's; shipping the capability ahead of
     its caller is the same shape as MV-168 shipping grants ahead of theirs.
  4. **An assignment picker cannot show names either — F-9 reaches cell 9.** MV-170 closed F-9 for
     the *student* list because `cases` carries `display_name` as its own column. `case_assignments`
     does not: it holds `user_id`, and the picker has to name **staff**, which is exactly the surface
     F-9 describes. MV-171's picker therefore labels members by role plus the same 8-character
     reference MV-169's team page shows — so an admin can match a picker entry to the person on the
     team page — and says out loud that names are unavailable. **The form value is the membership id,
     never the Auth user id.** F-9 stands for staff-identity surfaces and is closed only for cell 7.
