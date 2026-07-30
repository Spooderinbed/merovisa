# `lib/cases/` — the case-permission server boundary

Server-only. Answers one question, from the database, fail-closed:
**may this actor do this to this case?**

Shipped by MV-151. The access model comes from
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
   It never imports `createSupabaseAdminClient`, and a test in
   `tests/supabase/service-role-exceptions.test.ts` pins that. Routing a case read
   through the service-role client "because the lib already checked" inverts the
   doctrine back to the pre-tenancy default: it turns the second lock into a
   bypass, because service-role skips RLS entirely.
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
      — or `checkCasePermission` where a denial is an expected branch — **before**
      the first read or write, not after.
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
import { getCaseContext } from "@/lib/cases/context";
import { decideCasePermission, CASE_PERMISSION_MATRIX } from "@/lib/cases/permissions";
```

| Export | Shape |
|---|---|
| `requireCasePermission(actorUserId, caseId, permission, db?)` | `Promise<CaseContext>` — throws `CaseAuthorizationError` on denial |
| `checkCasePermission(actorUserId, caseId, permission, db?)` | `Promise<{ decision, context }>` — never throws on denial |
| `getCaseContext(actorUserId, caseId, db?)` | `Promise<CaseContext>` — the DB-resolved facts + `accessScope` |
| `decideCasePermission(permission, facts)` | pure, synchronous `CasePermissionDecision` |
| `deriveAccessScope(facts)` | pure — the single scope an actor holds on a case |

`db` is the request-scoped **authenticated** client; it defaults to
`createSupabaseServerClient()` and exists so tests can inject an in-memory fake.
There is deliberately **no `role` parameter** — a caller cannot assert who it is.

### The grid

Scopes: **all-org** = every case in the actor's org · **assigned** = only cases
with a `case_assignments` row for the actor · **linked** = only the case whose
`student_user_id` is the actor · **—** = never.

| Permission | owner | admin | counsellor | student |
|---|---|---|---|---|
| `case.list` | all-org | all-org | assigned | — |
| `case.read` | all-org | all-org | assigned | linked |
| `case.update` | all-org | all-org | assigned | linked¹ |
| `case.create` | all-org | all-org | — | — |
| `case.assign` | all-org | all-org | — | — |
| `case.invite_student` | all-org | all-org | assigned | — |
| `case.export` | all-org | all-org | — | — |
| `case.archive` | all-org | all-org | — | — |
| `case.delete` | all-org | all-org | — | — |
| `case.notes.internal` | all-org | all-org | assigned | — |
| `org.audit.read` | all-org | all-org | — | — |
| `org.manage` | all-org | all-org | — | — |
| `org.settings` | all-org | — | — | — |

¹ **Known gap — student permitted fields.** The card specifies "linked (permitted
fields only)". This layer authorizes the *claim*, not the *field set*: it has no
field allowlist and does not inspect the payload. A Stage 3 mutation that accepts
an arbitrary case patch from a student is a defect even though `case.update`
resolves to allow. The allowlist belongs with that mutation, and the checklist
above is where it gets caught. Recorded rather than silently implied.

The `org.*` claims are organization-level; they resolve through the same entry
point because the case names the organization in question. A personal case (no
`organization_id`) satisfies no `all-org` claim at all.

## Invariants worth not breaking

- **Role is DB-sourced.** Only `organization_memberships`, `case_assignments`, and
  `cases.student_user_id` decide it. Never a JWT claim, `app_metadata`,
  `user_metadata`, a header, or an argument (plan line 101). `getCaseContext`
  touches no session object; a test pins that the auth surface is never called.
- **Inactive membership = nothing.** Total, checked before any scope is granted,
  and it outranks student linkage. Revocation is immediate and needs no per-claim
  reasoning.
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
| `permissions.ts` | the pure matrix, the scope derivation, the enums mirrored from the migration |
| `context.ts` | `getCaseContext` — the only module here that talks to the database |
| `require-permission.ts` | `requireCasePermission` / `checkCasePermission` / `CaseAuthorizationError` |

Tests: `tests/cases/` (semantics, against `tests/helpers/fake-case-db.ts`) and
`tests/supabase/service-role-exceptions.test.ts` (the fence).
