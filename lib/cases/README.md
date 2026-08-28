# `lib/cases/` — the case-permission server boundary

Server-only. Answers one question, from the database, fail-closed:
**may this actor do this to this case?**

Shipped by MV-151. **The authoritative access model is
`docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md`** — one
table, one truth, which this layer and MV-152's RLS policies are both checked
against. Where either layer disagrees with that file, the layer is wrong. It in
turn derives from
`docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`
§"Authorization and tenant isolation"; the enum values and column names come from
`supabase/migrations/20260730120000_stage1_tenancy_core.sql` (MV-150).

---

## The enforcement boundary — read this before using anything here

**Row Level Security, evaluated as the authenticated user, is the load-bearing
tenant-isolation layer. This module is defense in depth on top of it. A bug in
this module must not, by itself, be sufficient to cross a tenant boundary.**
(Plan lines 336–338.)

Three consequences, none of them optional:

1. **This layer uses the authenticated client**, `createSupabaseServerClient()`.
   It never imports `createSupabaseAdminClient` and never names the service-role
   key, and a test in `tests/supabase/service-role-exceptions.test.ts` pins both.
   Routing a case read through the service-role client "because the lib already
   checked" inverts the doctrine back to the pre-tenancy default: it turns the
   second lock into a bypass, because service-role skips RLS entirely. The fence
   detects the **key**, not just the import path — an inline
   `createClient(url, <the service-role key>)` is a service-role client no matter
   which module built it.
2. **The SQL half is not optional.** MV-152 encodes the same model as RLS
   policies; MV-153 proves both against a real database. The tests in
   `tests/cases/` run against an in-memory fake — they prove this layer's
   *semantics*, and they are categorically incapable of proving that the database
   denies a cross-tenant read. Do not cite them as if they were.
3. **Routing middleware is NOT the authorization boundary** (plan line 366).
   Middleware may redirect an unauthenticated visitor; it decides nothing about
   who may see which case.

## The rule every server path follows

> Every Server Component, Route Handler, Server Action, and mutation that reads
> or writes case-scoped data calls `requireCasePermission` (or gates on
> `getCaseContext`) **before** it touches the data.

Stage 1 ships no case-touching routes, so this is a **binding convention plus the
review-gate checklist below**, not a runtime assertion — there is nothing to
assert against until Stage 3. When those routes arrive, the checklist is what a
reviewer runs.

### Stage 3 review-gate checklist

For any PR that adds or changes a path touching `cases`, `organizations`,
`organization_memberships`, `case_assignments`, `invitations`, or `audit_events`:

- [ ] The entry point calls `requireCasePermission(actorUserId, caseId, permission)`
      — or `requireOrgPermission(actorUserId, organizationId, permission)` for an
      org-scoped claim, or the `check*` form where a denial is an expected branch —
      **before** the first read or write, not after.
- [ ] Where the allowed scope is `assigned`, the query actually applies that
      filter. An allow with scope `assigned` is not an allow over the whole org.
- [ ] `actorUserId` comes from `supabase.auth.getUser()` on the server, never from
      a request body, query param, header, or client-supplied prop.
- [ ] The data access itself uses the authenticated client. If it uses
      service-role, the module is registered in
      `lib/supabase/service-role-exceptions.ts` with a justification, the
      authorization check that precedes it, and the audit event it emits.
- [ ] MV-152 has a matching policy. This layer allowing something the database
      denies is a broken feature; the database allowing something this layer
      denies is a **security hole**.
- [ ] The route renders dynamically. Personalized case data must not enter a
      shared cache; any deliberate cache key includes **both** the actor and the
      case (plan lines 386–391). A key omitting either is a defect.
- [ ] A negative test exists in MV-153's harness for the new surface — at minimum
      cross-org denial and, where relevant, unassigned-counsellor denial.

## API

```ts
import { requireCasePermission, checkCasePermission, CaseAuthorizationError } from "@/lib/cases/require-permission";
import { requireOrgPermission, checkOrgPermission, OrgAuthorizationError } from "@/lib/cases/require-org-permission";
import { getCaseContext } from "@/lib/cases/context";
import { getOrgContext } from "@/lib/cases/org-context";
import { decideCasePermission, CASE_PERMISSION_MATRIX } from "@/lib/cases/permissions";
```

**Two entry points, because there are two questions.** A claim about one case
takes a `caseId`; a claim about an organization has no case to name — "may this
actor create a case?" cannot be answered by a function that denies with
`unknown-case`. Which claim goes where is fixed by `CASE_SCOPED_PERMISSIONS` and
`ORG_SCOPED_PERMISSIONS`; the two sets partition all 13, enforced by type at both
entry points and re-checked at runtime in `decideOrgPermission`.

| Export | Shape |
|---|---|
| `requireCasePermission(actorUserId, caseId, permission, db?)` | `Promise<CaseContext>` — throws `CaseAuthorizationError` on denial |
| `checkCasePermission(actorUserId, caseId, permission, db?)` | `Promise<{ decision, context }>` — never throws on denial |
| `requireOrgPermission(actorUserId, organizationId, permission, db?)` | `Promise<OrgContext>` — throws `OrgAuthorizationError` on denial |
| `checkOrgPermission(actorUserId, organizationId, permission, db?)` | `Promise<{ decision, context }>` — never throws on denial |
| `getCaseContext(actorUserId, caseId, db?)` | `Promise<CaseContext>` — DB-resolved facts + `grantedRoles` + `accessScope` |
| `getOrgContext(actorUserId, organizationId, db?)` | `Promise<OrgContext>` — DB-resolved membership + `isActiveMember` |
| `decideCasePermission(permission, facts)` | pure, synchronous `CasePermissionDecision` |
| `decideOrgPermission(permission, facts)` | pure, synchronous `CasePermissionDecision` |
| `deriveCaseGrants(facts)` | pure — every relationship the actor holds on a case |
| `deriveAccessScope(facts)` | pure — `{ scope, reason, grants }`; `scope` is the broadest grant |
| `deriveOrgStanding(facts)` | pure — does this membership still confer org rights? |

`CaseAuthorizationError` and `OrgAuthorizationError` share a base,
`AuthorizationError`, so one `instanceof` maps both to a 403.

`db` is the request-scoped **authenticated** client; it defaults to
`createSupabaseServerClient()` and exists so tests can inject an in-memory fake.
There is deliberately **no `role` parameter** — a caller cannot assert who it is.

**Read the scope on an allow.** `case.list` allows a counsellor with
`requiredScope: "assigned"`, which means "may list, filtered to their own
`case_assignments`" — never "may see every case in the organization". A caller
that ignores the returned scope has not finished authorizing.

`getOrgContext` issues **one** query and runs no `organizations` existence probe,
so an unknown organization and "you are not a member" both answer
`no-relationship`. That is the honest answer as well as the safe one: under RLS a
non-member cannot read the `organizations` row either, and a probe would hand an
outsider an org-enumeration oracle.

### The grid

Scopes: **all-org** = every case in the actor's org · **assigned** = only cases
with a `case_assignments` row for the actor · **linked** = only the case whose
`student_user_id` is the actor · **—** = never.

| Permission | Asked about | owner | admin | counsellor | student |
|---|---|---|---|---|---|
| `case.list` | **org** | all-org | all-org | assigned | — |
| `case.read` | case | all-org | all-org | assigned | linked |
| `case.update` | case | all-org | all-org | assigned | linked¹ |
| `case.create` | **org** | all-org | all-org | — | — |
| `case.assign` | case | all-org | all-org | — | — |
| `case.invite_student` | case | all-org | all-org | assigned | — |
| `case.export` | case | all-org | all-org | — | — |
| `case.archive` | case | all-org | all-org | — | — |
| `case.delete` | case | all-org | all-org | — | — |
| `case.notes.internal` | case | all-org | all-org | assigned | — |
| `org.audit.read` | **org** | all-org | all-org | — | — |
| `org.manage` | **org** | all-org | all-org | — | — |
| `org.settings` | **org** | all-org | — | — | — |

¹ **Known gap — student permitted fields.** The card specifies "linked (permitted
fields only)". This layer authorizes the *claim*, not the *field set*: it has no
field allowlist and does not inspect the payload. A Stage 3 mutation that accepts
an arbitrary case patch from a student is a defect even though `case.update`
resolves to allow. The allowlist belongs with that mutation, and the checklist
above is where it gets caught. Recorded rather than silently implied.

A personal case (no `organization_id`) satisfies no `all-org` claim at all.

## The dual-role rule

An actor may hold an `organization_memberships` row in a case's organization
**and** be that case's `cases.student_user_id`. From the canonical matrix:

> **Membership (while `status = 'active'`) grants org-scoped rights. The student
> link grants student-scoped rights on that one case. The two are additive, and
> an `inactive` membership contributes nothing — but revoking a membership never
> removes a person's rights over their own student case.**

So `getCaseContext` resolves `membershipRole` and `isLinkedStudent` as **separate
facts**, and `deriveCaseGrants` returns a *list* of grants — a dual-role actor
holds two. A claim is allowed if **either** grant satisfies its cell; neither
grant lends the other its scope. A fired counsellor loses the organization but
keeps their own case, which they hold as a data subject, not as staff.

This replaced a single `role` field whose resolution order — membership first,
student only when no membership row existed — let the membership **mask** the
student's rights. If you are tempted to collapse the two back into one field, that
is the bug. `CaseContext.grantedRoles` is the authorization fact;
`membershipRole` is only what the membership row said.

MV-152 implements the same rule in SQL, and MV-153 asserts every cell against
both layers so a future divergence fails CI instead of reaching a review.

## Invariants worth not breaking

- **Role is DB-sourced.** Only `organization_memberships`, `case_assignments`, and
  `cases.student_user_id` decide it. Never a JWT claim, `app_metadata`,
  `user_metadata`, a header, or an argument (plan line 101). `getCaseContext`
  touches no session object; a test pins that the auth surface is never called.
- **Inactive membership = nothing, for ORGANIZATION rights.** Total and immediate
  for everything the membership carried. It does **not** reach a person's own
  student case — see the dual-role rule above.
- **Every failure denies.** Unknown case, unknown role, unknown permission,
  unknown status, PostgREST error, thrown client, blank identifier — all resolve
  to a no-access context. Nothing throws through; nothing falls through to allow.
  A caught error treated as "no restriction found" is the classic authz defect and
  there is no such path here.
- **No cross-request caching.** If per-request memoization is ever added, the key
  must include both `actorUserId` and `caseId`.

## Files

| File | Role |
|---|---|
| `permissions.ts` | the pure matrix, grant derivation, both decision functions, the enums mirrored from the migration |
| `context.ts` | `getCaseContext` — resolves an actor's relationship to one case |
| `org-context.ts` | `getOrgContext` — resolves an actor's standing in one organization |
| `require-permission.ts` | `requireCasePermission` / `checkCasePermission` / `AuthorizationError` / `CaseAuthorizationError` |
| `require-org-permission.ts` | `requireOrgPermission` / `checkOrgPermission` / `OrgAuthorizationError` |
| `personal-case.ts` | `resolvePersonalCaseId` / `ensurePersonalCase` — the actor's case where `organization_id IS NULL` |
| `linked-consultancy-cases.ts` | `listLinkedConsultancyCases` — the actor's cases where `organization_id IS NOT NULL` (MV-195) |
| `student-case-route.ts` | `openStudentCaseRoute` — the gate on `/consultancy/[caseId]`, the student's door (MV-195) |

### The two case resolvers are a matched pair, and neither may answer for the other

`resolvePersonalCaseId` carries `organization_id IS NULL` **in the predicate** and
`listLinkedConsultancyCases` carries `IS NOT NULL`. The founder decision of
2026-08-24 is that a student may hold both and **no data crosses between them**, so
widening either one is not a convenience — it is the defect. Letting the personal
resolver return both cases would silently re-point the whole `(student)` route
family (`/dashboard`, `/profile`, `/matches`, `/plan`, `/documents`, `/checklist`) at
a workspace the consultancy owns, because MV-157 §A makes it the only place a
personal route turns an actor into a case id. `tests/cases/linked-consultancy-cases.test.ts`
pins both directions.

Neither resolves permission. `openStudentCaseRoute` is where the student surface
authorizes, through `case.read` at `linked` — never through org membership, which is
a set `student` is deliberately excluded from.

Tests: `tests/cases/` (semantics, against `tests/helpers/fake-case-db.ts`) and
`tests/supabase/service-role-exceptions.test.ts` (the fence).
