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
| 12 | Case `display_name` / `email` | write | write | write | deny | **write** | ∅ | ∅ | policy only — **no field guard** | MV-173 | **NEW — see F-3** |
| 13 | Case route: read the case's data | all-org | all-org | assigned | ∅ | own | ∅ | ∅ | `*_select_case` → `actor_case_ids()` on all 9 tables | MV-172 | canonical, extended to Stage 2's tables |
| 14 | Case route: edit profile | write | write | write | ∅ | **write (fields ¹)** | ∅ | ∅ | `profiles_update_case` + col grant `(sections, completeness)` | MV-172 | canonical "updates permitted profile fields" |
| 15 | Case route: create profile row | write | write | write | ∅ | write | ∅ | ∅ | **grant does not exist yet** → MV-168 | MV-168 | §6.1 |
| 16 | Case route: plan items | write | write | write | ∅ | write | ∅ | ∅ | `plan_items_update_case`; INSERT **grant does not exist yet** | MV-168 | §6.1 |
| 17 | Case route: documents | read/del | read/del | read/del | ∅ | read/del | ∅ | ∅ | `documents_*_case`; upload stays service-role | **Stage 4** | §5 non-goal |
| 18 | Case-context indicator | show | show | show | n/a | show | n/a | n/a | render-time, from `getCaseContext` | MV-173 | NEW (presentation only) |
| 19 | Consultancy-internal notes | — | — | — | — | — | — | — | **no column exists** | — | **NEW — see F-4** |
| 20 | Org audit log | read | read | deny | deny | ∅ | ∅ | ∅ | `audit_events_select_admin` → `actor_admin_org_ids()` | **Stage 6** | canonical role table |

¹ **The field allowlist is still missing.** `lib/cases/permissions.ts` resolves `student.case.update`
to `linked` and its own comment says so: *"A Stage 3 mutation that accepts an arbitrary case patch
from a student is a defect even though this cell allows the claim."* `lib/cases/README.md` records
the same gap. Cell 14 is safe today only because the **column grant** on `profiles` is
`(sections, completeness)` — the allowlist is enforced by Postgres, not by the app. Cell 12 is where
that runs out (see **F-3**).

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
| 1 | `profiles` | INSERT | no grant, no policy | **GRANT** `INSERT (owner, case_id, sections, completeness)` + `profiles_insert_case` | **MV-168** |
| 2 | `assessments` | INSERT | no grant, no policy | **REFUSE — permanently.** See below. Amend §6. | — |
| 3 | `assessments` | UPDATE | no grant, no policy | **GRANT, narrowed to `UPDATE (is_primary)`** + `assessments_update_case`. Re-scoring stays server-side. | **MV-168** |
| 4 | `assessments` | DELETE | no grant, no policy | **REFUSE.** No domain need; row removal is account teardown (Stage 6). | — |
| 5 | `plan_items` | INSERT | no grant, no policy | **GRANT** `INSERT (owner, case_id, kind, impact, title, body, status, lift_estimate, time_estimate)` + `plan_items_insert_case` | **MV-168** |
| 6 | `plan_items` | DELETE | no grant, no policy | **REFUSE.** Plan items are *dismissed* (`status='dismissed'`), never deleted; the existing UPDATE grant covers the domain. | — |
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

#### Retiring MV-160's `42501` pin — the same slice, or the suite lies

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
| 9 | `app/api/profile/section/route.ts` | `profiles` has UPDATE but **no INSERT**, and this path must create a first-ever profile row | **RETIRES in MV-168 + MV-172.** Grant 1 is exactly what this waits on. |

**Net effect of Stage 3 on the list: 9 → 7 entries**, of which 3 wait for Stage 4 and 4 are
permanent. **Two are retired outright (8, 9); two are narrowed (3, 4); two are reclassified (1, 2).**

**And the list will also GROW.** A counsellor creating a case for a student who has no account still
needs an assessment scored for that case, and §6.1 refuses to let the client write one. Stage 3 must
therefore add a **new** server route that runs the scoring engine on behalf of a case — a new
service-role call site, registered in the list with a justification, per the plan's rule that new
consultancy features must not add service-role paths *outside* the list. MV-154's framing of the
list as monotonically shrinking does not survive Stage 3. **Net-net Stage 3 ends at 8 entries.**

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

### F-1 `[BLOCKER]` The Stage 3 exit gate names a counsellor doing two things the canonical model forbids

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
change. **This is the one decision in this document that is not the spec's to take.**

### F-2 `[NEW CELL]` Nobody can create an organization

`authenticated` holds **no INSERT grant on `organizations`** and there is no INSERT policy `[Q2, Q3, Q4]`.
Org creation is service-role-only, and no route does it today. The plan's bullet 1 says "build
organization selection **and team management**" and simply assumes an org exists.

For a pilot with one named consultancy this is fine — the org is provisioned once, out of band. It
is recorded here so a slice does not discover it mid-build and improvise a grant. **No Stage 3 slice
grants org creation**; provisioning stays a founder/ops action until a stage asks for self-serve
signup. Marked NEW because Stage 1's canonical matrix has no `org.create` verb at all.

### F-3 `[NEW CELL — trust risk]` A linked student can rewrite their case's `display_name` and `email`

`cases` grants `authenticated` `UPDATE (archived_at, display_name, email, operational_status)` `[Q3]`,
`cases_update_accessor` admits the linked student `[Q4]`, and `enforce_case_write_surface` guards
**only** `archived_at` and `operational_status` `[Q6]`. So `display_name` and `email` are writable by
the student.

Those two columns are exactly what MV-170's student list renders. A student could rename their case
to impersonate another student in a counsellor's list, or change the `email` a counsellor
corresponds with. This is the concrete instance of the field-allowlist gap that
`lib/cases/permissions.ts` and `lib/cases/README.md` both record in the abstract, and it is the first
stage where a surface *displays* those fields to a third party.

**Assigned to MV-173**, which owns the allowlist. Two candidate fixes (the slice picks one and
amends this spec): extend `enforce_case_write_surface` to require `can_staff_case` for both columns,
or hold the allowlist in the mutation's Zod schema. **The trigger is the stronger option** — it is
where the sibling rules already live, and it cannot be bypassed by a second caller.

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

---

## 8. The slice carve

Next free id verified against `board.json` at carve time: **167 cards, max `MV-166`** — so Stage 3
allocates **MV-167 upward**.

### 8.1 Slice map

| Slice | Bullet | Scope in one line | Depends on | Explicitly NOT in scope |
|---|---|---|---|---|
| **MV-167** STAGE 3 UMBRELLA | — | Tracking only: holds the slice map, the DAG, the exit gate, F-1's open decision, and the legal-gate condition. Ships nothing. | — | Any code. Do not build from this card. |
| **MV-168** CONSULTANCY WRITE GRANTS | prereq | The only SQL in Stage 3: `INSERT` grant+policy on `profiles` and `plan_items`, `UPDATE (is_primary)` grant+policy on `assessments`, each mirroring the five-sibling `WITH CHECK` template (§2.3). Retires 2 of the 4 DEFERRED HALF assertions and rewrites the other 2's comment (§6.1). Amends Stage 2 spec §6. | — | No UI. No route. No `assessments`/`documents` INSERT (refused/deferred — §6.1). No schema change. |
| **MV-169** ORG CONTEXT + TEAM MANAGEMENT | 1 | Org selection for a multi-org actor (`getOrgContext`/`requireOrgPermission` wired to a real surface) + team list, role change, deactivate. Owner-only org settings (cell 2). | — | **No org creation (F-2). No invitations (F-5, Stage 5).** No case surfaces. |
| **MV-170** STUDENT LIST / SEARCH / FILTERS | 2a | The org-scoped case list: search, filter, `operational_status` display. Read-only. Assigned-only for counsellors, all-org for owner/admin (cell 7). | MV-169 | No creation, no assignment (MV-171). No writes at all. |
| **MV-171** CASE CREATION + ASSIGNMENT | 2b | Create a case with `student_user_id IS NULL`; assign/reassign the single primary counsellor slot; write `operational_status`. Carries **F-1's resolution** — built as an admin surface under reading (a). Adds the case-scoped scoring route (§6.2). | MV-168, MV-170 | No archive (Stage 6). No student invitation (Stage 5). Not a multi-counsellor model (§2.5). |
| **MV-172** THE CASE ROUTE | 3 | Render the existing MeroVisa experience under an explicit `case` route, for a case that is not the actor's own. Flips `app/api/profile/section` and `app/api/plan/action` onto the authenticated client (§6.2 rows 8–9). | MV-168, MV-171 | No documents model change (Stage 4). No indicators (MV-173). |
| **MV-173** CASE-CONTEXT INDICATORS + FIELD ALLOWLIST | 4 | Whose case am I in, and is it mine — persistent, unmissable. **Plus F-3**: close the `display_name`/`email` write gap the list surface exposes. | MV-172 | No new data. No notes (F-4). |
| **MV-174** SERVICE-ROLE RETREAT + STAGE EXIT | exit | Reclassify entries 1–2, narrow 3–4, confirm 5–7 wait for Stage 4, register the new scoring route (§6.2). Prove the exit gate (§9). **Carries the stage exit.** | all | No new surfaces. |

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
| MV-168 → MV-172 | **data** | MV-172's whole deliverable is flipping `profile/section` and `plan/action` off service-role. Those flips *are* grants 1 and 5. Without MV-168, MV-172 ships the case route still on service-role — the opposite of the enforcement boundary. |
| MV-169 → MV-170 | **data** | The case list is scoped by the selected organization. With no org context there is no scope to list within, and for a single-org actor the "selection" is still the object the query keys on. |
| MV-170 → MV-171 | **code** | Creation and assignment are entered from the list and reuse its org-scoped case query and row component. Building them first means building that scoping twice and reconciling it later. *Stated as a code dependency, not a data one — it could be parallelised at the cost of rework.* |
| MV-171 → MV-172 | **data** | The case route must be exercised against a case with `student_user_id IS NULL`. MV-171 is what produces one. Before it, the route can only be tested against a personal case — which is the Stage 2 shape and proves nothing new. |
| MV-172 → MV-173 | **code** | An indicator indicates the route's context. There is nothing to indicate before the route exists. F-3's fix also belongs after the surface that exposes the field. |
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
verb. Each criterion is a named test at a named layer; **MV-174 owns all six.**

| # | Criterion | Layer / test |
|---|---|---|
| **E1** | An org **admin** creates a case with `organization_id` set and `student_user_id IS NULL`, **through the authenticated client**. | real-DB `tests/integration/stage3-workspace.itest.ts` |
| **E2** | An **assigned** counsellor sees that case in the org-scoped list; an **active but unassigned** counsellor in the same org does not; an **inactive** member sees nothing. | same suite |
| **E3** | An admin assigns the counsellor; a second `primary_counsellor` assignment on the same case is refused (`23505`, `case_assignments_primary_idx`). | same suite |
| **E4** | The assigned counsellor writes `profiles.sections` **and inserts a `plan_items` row** for that case through the authenticated client, with `owner IS NULL` on every row written. | same suite |
| **E5** | The case route renders for the assigned counsellor and 404s for the unassigned one. | route-level test |
| **E6** | No `service-role-exceptions.ts` entry is `legacy-owner-scoped` without a named later stage; the list is 8 entries with the dispositions of §6.2. | unit test over the registry metadata |

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
| E5 | both actors 404 for an unrelated reason (missing route, build error) | the positive half must assert rendered case content, not merely a 200 |
| E6 | the registry is read as a list of strings and the assertion is `length === 8` | assert **per-entry disposition**, not the count; a count passes after any two-entry swap |

### 9.3 The gate's own limit, stated up front

**Every criterion above is proved on seeded test data.** With D-B shut, production holds no
consultancy organization and no student-less case, so none of E1–E6 says anything about production
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
  stack at repo migration head; production deliberately not read (§1). Seven findings raised (§7),
  of which **F-1 is a founder decision this spec explicitly declines to take** and proceeds on
  reading (a) provisionally. Ten deferred verbs resolved (§6.1) — three granted, four refused
  permanently, one deferred to Stage 4, two confirmed never. Nine service-role paths dispositioned
  (§6.2): two retire, two narrow, two reclassify, three wait for Stage 4, **one new entry is added**.
  Carve: MV-167 umbrella + MV-168…MV-174, DAG with a reason per edge, no release train (§8.2).
- **Departures from Stage 2 spec §6, to be amended in MV-168's PR:** `assessments` INSERT **refused**
  (server-side scoring, §6.1) rather than granted; `assessments` UPDATE **narrowed** to `is_primary`;
  `documents` INSERT **deferred to Stage 4** rather than granted in Stage 3.
