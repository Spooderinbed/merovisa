# Stage 1 — Canonical access matrix

**Written:** 2026-08-02 · **Owner:** integrator session · **Status:** authoritative for Stage 1

## Why this document exists

MV-151 (TypeScript permission layer, PR #109) and MV-152 (SQL RLS policies, PR #108) were built
**in parallel by separate sessions**, each encoding the same access model in a different language,
neither able to see the other. A three-lens review found they **diverge in six cells** — and in one
of them both PRs ship a test asserting the opposite of each other.

Neither layer was written from a single enumerated matrix; each derived one from the plan's prose.
That is the root cause. This file is the missing artifact: **one table, one truth**, that both layers
and MV-153's harness are checked against. Where a layer disagrees with this file, the layer is wrong.

**Source of truth for every cell below** is the revised plan's role definitions
([Users and responsibilities](../plans/2026-07-23-consultancy-student-case-workspace.md)), quoted
inline where a resolution turns on them.

## The roles, as the plan defines them

| Role | Plan's words (verbatim, abridged) |
|---|---|
| **Owner** | manages the organization and team · can access all organization cases · **can export, archive, and delete cases** · **controls organization-level settings** |
| **Admin** | manages team access · can access and manage all organization cases · oversees assignments and case operations |
| **Counsellor** | accesses assigned cases by default · manages the student profile, assessment, matches, plan, and documents · requests documents and records review decisions · **invites the student to collaborate** |
| **Student** | accesses only the case linked to their account · views permitted case information · **updates permitted profile fields** · uploads documents and responds to requests · cannot see consultancy-only notes, audit data, or other students |

Two structural rules from the plan's authorization section, which override any cell below:

1. **Inactive membership grants nothing.** A revoked member loses org access immediately.
2. **RLS is load-bearing.** Where the layers disagree, SQL being *more* permissive than TS is a
   security defect; TS being more restrictive than SQL is a correctness/UX defect. Both get fixed —
   but the first is the dangerous direction.

## The six divergences and their canonical resolution

| # | Cell | TS said | SQL said | **Canonical** | Basis |
|---|---|---|---|---|---|
| 1 | Admin renames/updates the organization (`org.settings`) | deny | **allow** | **Deny** | Plan reserves "organization-level settings" to the owner. SQL is more permissive → security direction. |
| 2 | Assigned counsellor / linked student sets `archived_at` (`case.archive`) | deny | **allow** | **Deny** (owner + admin only) | Plan lists archive under the owner; admin "manages all organization cases". Counsellor and student never archive. SQL more permissive → security direction. |
| 3 | Assigned counsellor invites the student (`case.invite_student`) | allow | **deny** | **Allow** | Plan states the counsellor "invites the student to collaborate" explicitly. TS is right; SQL must permit it for the counsellor's own assigned case. |
| 4 | Linked student writes `operational_status` / `archived_at` on a consultancy case | deny | **allow** | **Deny** | Plan limits the student to "permitted profile fields". The flat column grant leaks the counsellor write surface. SQL more permissive → security direction. |
| 5 | Admin mints a `role='owner'` invitation | n/a (no verb) | **allow** | **Deny** | SQL already reserves owner *memberships* to owners; leaving invitations unconstrained defeats that carve-out by the back door. Note the schema trap: `invitations.role` includes `'student'`, `organization_memberships.role` does not — they are different sets and must not be cross-checked. |
| 6 | Actor who is **both** org staff and the linked student | membership role wins; inactive ⇒ no access | student disjunct grants access regardless of membership status | **See the dual-role rule below** | Partly a new decision; the security half is settled by the plan. |

### The dual-role rule (new decision — flagged for founder override)

An actor may simultaneously hold an `organization_memberships` row in a case's org **and** be that
case's `cases.student_user_id`. The plan does not address this. The canonical rule is:

> **Membership (while `status = 'active'`) grants org-scoped rights. The student link grants
> student-scoped rights on that one case. The two are additive, and an `inactive` membership
> contributes nothing — but revoking a membership never removes a person's rights over their own
> student case.**

Rationale: it satisfies "inactive memberships have no access" for *organization* resources, while
preserving the student's rights to their own data — which they hold as a data subject, not as staff.
A fired counsellor loses the org; they do not lose their own case. Both layers must implement this;
today TS lets the membership role mask the student rights, and SQL lets the student disjunct launder
org access to a revoked member. **Both are wrong.**

## Required changes

### MV-152 — SQL (PR #108) — the majority of the work

- [ ] `organizations` UPDATE: exclude admins (owner-only) — divergence 1.
- [ ] `cases` UPDATE: `archived_at` writable by owner/admin only; split the flat column grant so the
      student's write surface is profile fields only, never `operational_status` / `archived_at` —
      divergences 2 and 4.
- [ ] `invitations` INSERT: allow an **assigned counsellor** to invite the student for their own case —
      divergence 3.
- [ ] `invitations` INSERT: constrain `role` — an admin may not mint `role='owner'` — divergence 5.
- [ ] Dual-role: the student disjunct must not confer org rights, and an inactive membership must
      contribute nothing — divergence 6.
- [ ] Minor (from review): tie `invitations.organization_id` to the case's org so a student invite
      cannot carry another tenant's org id; revoked member should not retain `case_assignments` reads;
      assert the migration role's `BYPASSRLS` rather than relying on it implicitly; fix the
      `case_assignments` INSERT happy-path fixture that can only ever hit a 23505.

### MV-151 — TypeScript (PR #109)

- [ ] The service-role fence guards the **module specifier**, not the key: an inline
      `createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)` in an unregistered file passes both
      the ESLint rule and the drift sweep, and a template-literal dynamic import evades both. Detect
      the key, not just the import.
- [ ] Registry prose for `app/api/dev/sign-in/route.ts` overstates its gates (there is no dev secret,
      and the URL check matches any `*.supabase.co` host including production). Correct it — a registry
      whose prose cannot be trusted has no value.
- [ ] Org-scoped verbs (`case.list`, `case.create`, `org.audit.read`, `org.manage`, `org.settings`)
      cannot be authorized through an entry point that requires a `caseId`. Add an org-scoped entry
      point, or drop the verbs from the matrix and record them as deferred — but do not ship claims
      no caller can check.
- [ ] Dual-role: implement the rule above (membership must not mask student rights) — divergence 6.

### MV-153 — harness (not yet started)

This file is the checklist. Every row of the divergence table and every cell implied by the role
definitions becomes a test case, asserted **twice** — once against the TS layer, once against the
database — so a future divergence fails CI instead of reaching a review.

## Decision log

- 2026-08-02 — Written by the integrator session after the MV-151/MV-152 cross-layer review found six
  divergences. Five resolved directly from the plan's role definitions; the dual-role rule is new and
  is flagged above for founder override.
