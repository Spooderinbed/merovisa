# MV-169 — Stage 3 slice 2: org context, org selection, and team management

**Priority:** P1   **Owner:** agent
**Goal:** Give a consultancy actor the first surface that is theirs — pick which organization they are working in, see who is on the team, and change a member's role or deactivate them — with every read and write authorized through the AUTHENTICATED client, so RLS is the load-bearing lock and `requireOrgPermission` is the second one.

**Authoritative spec:** `docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md` (§3, §4 cells 1/2/4/5, §5, §8.1, §8.2). **Where this card disagrees with the spec, the spec wins. If the implementation contradicts the spec, amend the spec IN THIS PR** (spec §1 rule 2).

## Context links

- Spec §4 access matrix — **cells 1, 2, 4, 5** are this slice; cell 3 (org creation) and cell 6 (invite) are explicitly nobody's.
- Spec **F-2** — `authenticated` holds no INSERT grant on `organizations` and there is no INSERT policy. Org provisioning stays a founder/ops action. **No slice grants it, including this one.**
- Spec **F-5** — staff invitations are Stage 5. Team management here can change a role and deactivate; it **cannot add a member**.
- `supabase/migrations/20260730180000_case_aware_rls_policies.sql` — `organizations_select_member` (:325), `organizations_update_owner` (:336), `organization_memberships_select_member` (:351), `organization_memberships_update_admin` (:373); grants at :682–:696.
- `lib/cases/org-context.ts`, `lib/cases/require-org-permission.ts`, `lib/cases/permissions.ts` — the authorization layer this slice is the first caller of.
- `lib/cases/README.md` — the enforcement boundary. Authenticated client only; never `createSupabaseAdminClient`.

## Why this slice needs no SQL

Every grant and policy cells 1/2/4/5 depend on **already shipped in MV-152's migration** and is live in production:

| Cell | Verb | Grant (column-scoped) | Policy |
|---|---|---|---|
| 1 | `organizations` SELECT | table-level `select` | `organizations_select_member` → `actor_org_ids()` |
| 2 | `organizations` UPDATE | `update (name, slug)` | `organizations_update_owner` → `actor_owner_org_ids()` |
| 4 | `organization_memberships` SELECT | table-level `select` | `organization_memberships_select_member` |
| 5 | `organization_memberships` UPDATE | `update (role, status)` | `organization_memberships_update_admin` |

**This card ships no migration.** A reviewer who finds one in the diff should reject it.

## Scope

### A. Read surfaces
- `lib/org/repo.ts` `listActorOrganizations` — the orgs the actor is an **active** member of, with the actor's own role in each. Cell 1.
- `lib/org/repo.ts` `listOrgMembers` — the memberships of one org. Cell 4.
- `app/(app)/workspace/page.tsx` — org selection. One org → still a selection surface (MV-170 keys its list on it); zero orgs → an honest empty state, not a crash; many → a list.
- `app/(app)/workspace/[organizationId]/team/page.tsx` — the team list, gated on `org.manage`.
- `app/(app)/workspace/[organizationId]/settings/page.tsx` — gated on `org.settings` (owner-only).

### B. Write surfaces
- `PATCH /api/org/[organizationId]` — rename (`name`, `slug`). Gate: `requireOrgPermission(..., "org.settings")`. Cell 2.
- `PATCH /api/org/[organizationId]/members/[membershipId]` — role change / deactivate. Gate: `requireOrgPermission(..., "org.manage")` **plus the owner carve-out**. Cell 5.

### C. The owner carve-out, mirrored in BOTH directions
`organization_memberships_update_admin` carries the same conjunct in `USING` **and** `WITH CHECK`:

```
organization_id = any (actor_admin_org_ids())
and (role <> 'owner' or organization_id = any (actor_owner_org_ids()))
```

So an admin may not touch an **owner's** row (USING, the row as it stands) and may not **promote anyone to owner** (WITH CHECK, the row as it would become). `decideMembershipChange` mirrors both. `org.settings` is the TypeScript spelling of "is owner" — the matrix already reserves it to `owner` alone, and its own comment says *"Renaming the organization and transferring ownership stay with the owner."*

## Acceptance criteria

- [ ] An actor with two active memberships sees both organizations; an actor with none sees an honest empty state.
- [ ] An **inactive** membership contributes no organization to the selection list (cell 1, `I = ∅`) — asserted against a fixture where the row exists and is `inactive`, not against its absence.
- [ ] The team page renders for owner and admin, and **denies a counsellor** (`org.manage` is `deny` for counsellor).
- [ ] The settings page renders for the owner and **denies an admin** (divergence #1).
- [ ] `PATCH members/[id]` with `role: "owner"` from an **admin** is refused; the same request from the **owner** is allowed.
- [ ] `PATCH members/[id]` targeting a row whose **current** role is `owner`, from an admin, is refused.
- [ ] `PATCH members/[id]` refuses a body outside `{role, status}` — the payload cannot reach `organization_id` or `user_id` (which are not in the column grant either).
- [ ] An actor cannot change **their own** role or status through this surface (see Decision log — self-lockout).
- [ ] A write that the database refuses is reported as a **failure**, never as success: the repo reads the row back after the update and treats a zero-row result as a denial.
- [ ] Nothing in `lib/org/` or the new routes imports `createSupabaseAdminClient` — `tests/supabase/service-role-exceptions.test.ts` stays green with no new entry.

## Test plan

- `tests/org/membership-change.test.ts` — the pure carve-out rule: both directions of the owner conjunct, the self guard, an empty patch, an unknown role.
- `tests/org/repo.test.ts` — against `fakeCaseDb`: active-only filtering for cell 1; a PostgREST error resolving to a failure and not a silent success; a zero-row update reported as a denial; the update payload restricted to `role`/`status`.
- `tests/api/org-settings-route.test.ts`, `tests/api/org-members-route.test.ts` — 401 unauthenticated, 422 invalid body, 403 on each denial above, 200 on the allowed path.
- `tests/app/workspace-pages.test.tsx` — the three pages render their allowed and denied states.

**Not proven here, and the card says so:** these are jsdom/in-memory tests. They prove this layer's semantics. They are *categorically incapable* of proving the database denies a cross-tenant read (`lib/cases/README.md` §2). The RLS half of cells 1/2/4/5 is already pinned by the Stage 1 suites in `tests/integration/case-rls.itest.ts`, which this slice does not change.

## Integration gate

```
npm run typecheck && npm run lint && npm test
```

## Dependencies / blocked-by

- **None.** Spec §8.2 gives MV-169 no inbound edge; it is one of the two slices that can start immediately. MV-170 depends on *it*.
- Not blocked by the Stage 0 D-B legal gate (spec §8.3): D-B gates onboarding real student data, not construction.

## Risk notes

- **Self-lockout is unrepairable in-product.** With F-2 (nobody can create an org) and F-5 (nobody can invite), an owner who deactivates their own membership makes the organization permanently unreachable — repair needs service-role/ops. The database permits it; this surface does not offer it. See Decision log.
- **The team list has no names.** `organization_memberships` carries only `user_id`, and `auth.users` is not readable by `authenticated`. Recorded as **F-9** in the spec.
- **A denied UPDATE is not an error.** Postgres reports an RLS-blocked UPDATE as *zero rows affected*, not `42501`. A call site that only checks `error` reads a denial as a success. The repo reads back instead.

## Agent resume notes (for a cold start)

Branch `mv-169-org-context-team-management` off `origin/master`. No `node_modules` exists in any worktree — install into a non-OneDrive dir (`C:\ci\mv169`) and junction it in; see `[[sibling-worktree-dev-server]]`. Run the gate, then move the card to `inreview` in `board.json` and regenerate with `node docs/kanban/build.mjs`.

## Decision log

- **2026-08-08 — `lib/org/`, not `lib/cases/`.** `lib/cases/` is the *authorization boundary* ("may this actor do this to this case?"), and its README governs it as such. Org listing and team mutation are data access, so they follow the `lib/<domain>/repo.ts` convention (`lib/matches/repo.ts`, `lib/profiles/repo.ts`) and *import* the boundary rather than living inside it.
- **2026-08-08 — self-mutation refused at the app layer, and this is an addition to the spec, not a contradiction.** The SQL permits an owner to deactivate themselves. Given F-2 and F-5 that is a permanent, in-product-unrepairable lockout. The refusal is strictly *narrower* than the canonical cell and moves nothing — the same shape as MV-173's TypeScript field allowlist, which the spec endorses. Recorded in the spec's §11 decision log in this PR.
- **2026-08-08 — F-9 recorded: the team list can show no names.** Not fixable in this slice without a new readable staff-identity source, which would be a schema change Stage 3 forbids (§5). The list renders role, status, a "you" marker and a truncated user id.
- **2026-08-08 — no chrome link.** A consultancy-workspace entry in the *student* AppBar would show a link to every signed-in student and cost a membership query on every page. The workspace navigates itself; discoverability belongs with MV-170's list, when there is something to navigate to.

## Done evidence

**Branch** `mv-169-org-context-team-management` off `origin/master` @ `dc0ec1e`.

### Integration gate — 2026-08-08

| Command | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **exit 0** |
| `npm test` | **exit 1** — 3 failures, all `Test timed out in 5000ms` |
| `npx vitest run --testTimeout=30000` | **exit 0 — 338/338 files, 2733/2733 tests** |
| `npx next build --webpack` | **exit 0** — all 5 new routes registered `ƒ` |

**On the three timeouts, honestly.** They are `tests/architecture/no-actor-equals-student.test.ts`
(×2) and `tests/styles/motion-tokens-ratchet.test.ts` (×1) — file-scanning suites that walk the
source tree. All three pass **in isolation in ~1.2s** each, and
`tests/styles/motion-tokens-ratchet.test.ts` **failed the same way on a clean checkout of
`origin/master` before this branch existed** (baseline run: 2 files / 3 tests failed, 2674 passed).
This is I/O contention on a OneDrive-backed working tree under vitest's parallel workers, not a
regression, and it does not reproduce on CI (Linux). Nothing in the suite was skipped, silenced or
retried to reach the number above; the only change is the per-test timeout on the command line.

Baseline for comparison: **2677 tests** on `origin/master`. This branch: **2733**. **+56 tests.**

### What the gate caught that the test suite could not

`npx next build` failed on the first attempt: `components/workspace/team-member-row.tsx` imported
`MEMBERSHIP_ROLES` from `lib/cases/permissions.ts`, a **`server-only`** module. That import would
have compiled the entire role→permission matrix into the browser bundle — the thing
`permissions.ts`'s own doc-comment forbids (*"permission rules are server business logic and must
never be readable in client JS"*), and CLAUDE.md's Architecture Rules with it.

**The whole jsdom suite stayed green through it**, because every suite that touches these modules
does `vi.mock("server-only", () => ({}))` — so in tests the marker is not there at all.

Fixed by computing the option list on the server and passing it as a prop, **not** by removing the
`server-only` marker. Then pinned: `tests/architecture/client-server-boundary.test.ts` walks
first-party imports transitively from every `"use client"` entry point and fails on any chain that
reaches a `server-only` module. **Mutation-tested** — re-adding the exact import turns it red
(`expected [ Array(1) ] to deeply equal []`), and removing it turns it green again, so the assertion
is not vacuous. It also carries a non-vacuity assertion of its own (>10 client modules and >5
server-only modules found), because a broken glob or the CRLF trap would otherwise make it pass over
an empty list.

### Files

- `lib/org/membership-change.ts` — the pure cell-5 rule (both horns + the lockout guard)
- `lib/org/repo.ts` — cells 1/2/4/5 data access, authenticated client only, read-back on every write
- `app/api/org/[organizationId]/route.ts` — cell 2 (owner-only rename)
- `app/api/org/[organizationId]/members/[membershipId]/route.ts` — cell 5
- `app/(app)/workspace/page.tsx`, `.../[organizationId]/team/page.tsx`, `.../settings/page.tsx`
- `components/workspace/team-member-row.tsx`, `components/workspace/org-settings-form.tsx`
- `tests/org/membership-change.test.ts` (9), `tests/org/repo.test.ts` (20),
  `tests/api/org-routes.test.ts` (15), `tests/app/workspace-pages.test.tsx` (10),
  `tests/architecture/client-server-boundary.test.ts` (2)
- `tests/helpers/fake-case-db.ts` — extended with `update` + `updateError`, modelling an
  RLS-refused UPDATE as **zero rows affected rather than an error**, which is the shape that makes a
  denial readable as a success
- **No migration.** Every grant and policy cells 1/2/4/5 need shipped with MV-152.

### Spec amendments made in this PR (§1 rule 2)

- **F-9 added** — the team list can render no names; no staff-identity source is readable by
  `authenticated`, and the fix is a schema change §5 forbids. Flagged to MV-170, proposed for Stage 5.
- **§11 decision-log entry** — the self-mutation refusal, recorded as strictly narrower than the
  canonical cell so a later slice reading only the matrix does not "fix" it back open.

## Adversarial review remediation — 2026-08-08

An adversarial review of the open PR raised 18 findings. **13 were refuted.** The access-control
core — cross-tenant isolation, the privilege-escalation carve-out, the self-lockout guard — survived
review entirely and was **not touched**. The five confirmed defects were all in the safety net and
the error-reporting layer, i.e. in what the code *proves* and what it *says*, never in what it
allows.

| # | Sev | Defect | Fix |
|---|---|---|---|
| 1 | MED | The client/server-boundary guard was blind to wrapped imports | `importsOf` is whole-file, not per-line |
| 2 | MED | A 401 or a 500 was reported to the user as an authorization refusal | `components/workspace/save-error.ts` + per-surface branches |
| 3 | LOW | Every 422 was blamed on the web-address field | The form reads the route's `issues.fieldErrors` |
| 4 | LOW | The `.strict()` test did not pin `.strict()` | A case carrying a granted key *alongside* an ungranted one |
| 5 | LOW | The sort assertion was vacuous | The `organizations` fixture is seeded out of order |

### 1 — the boundary guard could not see the regression it was written for

`importsOf` matched per line with a regex requiring the keyword and `from "…"` on the **same** line.
A Prettier-wrapped import matches neither half: `import {` carries no `from`, and `} from "…";` does
not begin with `import`. Wrapping is the dominant style here, so this was not a corner case —
`lib/cases/context.ts` wraps its `./permissions` import, and **every transitive chain through that
edge was invisible**, including chains into the very `server-only` matrix the suite exists to guard.
The vacuity assertion could not have caught it: it counts client and server-only modules, both found
by single-line DIRECTIVE regexes that a wrapped import does not disturb.

Measured on this tree: the per-line scan saw **1266** first-party edges where there are **1299**.
The four `lib/cases/* → ./permissions` edges were among the 33 missed.

The replacement joins the (already `/\r?\n/`-split) lines, strips block comments that open a line,
and matches statements across newlines. Two constraints in the pattern are load-bearing and were
arrived at by measurement, not by taste — a first attempt over-matched badly:

- the between-part forbids `(`, `)` and `=`, without which `export function foo() {` matches
  `export`, runs across the newlines into the body, and reports the first string literal it finds
  there as an import (observed: `components/layout/logo.tsx :: "/"`);
- `from` must be followed by nothing but whitespace before the quote, which is what keeps
  `r.from === "x"` out.

Validated repo-wide before landing: **1606 captures across `app`/`components`/`lib`, every one a
real module specifier; zero edges lost that the old scan saw; zero pre-existing violations**, so the
guard got sharper without moving the goalposts under existing code. The keyword is followed by `\b`
rather than by required whitespace, so the space-free `import{a}from"./x"` is seen too — both
variants capture the same 1606 here, but a scan that silently skips a spelling is precisely the
defect being fixed.

**Mutation-tested.** Injecting the wrapped form of the exact regression the doc-comment names into
`components/workspace/team-member-row.tsx`:

```
import {
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUSES,
} from "@/lib/cases/permissions";
```

turns the suite **red**, naming the chain
`components\workspace\team-member-row.tsx → lib\cases\permissions.ts`. The old per-line scan was
confirmed blind to the same injection in the same run — it saw only `@/components/ui/button`.
Injection removed, suite green, `git status` clean.

### 2 / 3 — an expired session is not a refusal, and a bad name is not a bad slug

The catch-all `else if (!res.ok)` mapped every remaining status to *"That change was not allowed."*
But the routes return **401** for an expired session and **500** for a genuine write failure —
`lib/org/repo.ts` maps every PostgREST code other than 42501/23505 to `write-failed` (check
constraints, timeouts, connection failures), and its two thrown-client catches land there too.
`team-member-row.tsx` had **no status branches at all**, so 401, 403, 404 and both 500s rendered
identically. An owner whose session had lapsed was told they lacked permission; a transient outage
was indistinguishable from a real denial. Neither reader could tell whether to retry or to escalate.

This is the write-side spelling of a rule the read side already states — `app/(app)/workspace/page.tsx`
keeps "the lookup failed" and "you belong to nothing" from rendering the same, and
`checkOrgPermission` deliberately keeps "lookup failed" distinct from "this role may not do this".
403 keeps its original sentence, because for a 403 it was always true; the defect was applying it to
everything else.

For the 422s, the form mapped the **status** to one fixed sentence about the web address, while the
route 422s an empty-after-trim name, a name over 120 chars, a bad slug, **or** an unknown key.
Clearing the Organization name pointed the owner at a field that was untouched and correct. The form
now reads `issues.fieldErrors` and attributes the message to the field the route actually rejected.

**The `issues` shape is pinned at the route, not only in a component fixture** — a fixture agrees
with itself, and a Zod upgrade that reshaped `flatten()` would leave the form quietly
mis-attributing again. `tests/api/org-routes.test.ts` now asserts that `PATCH {name:"", slug:"anadi"}`
returns `fieldErrors` keyed exactly `["name"]`.

New coverage: `tests/components/workspace/org-settings-form.test.tsx` (9) and
`tests/components/workspace/team-member-row.test.tsx` (5). **Not vacuous** — restoring the two old
catch-alls fails **8 of the 14**; the 6 that survive are the cases the old code already got right
(a genuine 403, a 409, a slug-only 422, the happy paths).

### 4 — the `.strict()` test never reached `.strict()`

Every ungranted-column body in the loop (`{status:"suspended"}`, `{id:"another-org"}`) carried
**only** the unknown key, so the trailing `.refine()` — "provide a name or a slug" — refused it
first. Added `{ name: "Anadi Global", status: "suspended" }`, which satisfies the refine so
`.strict()` is the only thing that can reject it.

**Mutation-tested.** With `.strict()` deleted from `app/api/org/[organizationId]/route.ts`, the new
case returns **200** with the ungranted column silently stripped and the client told it saved
(`expected 200 to be 422`) — while the five pre-existing bodies all stayed green, which is the
measurement that proves they never exercised `.strict()`. Restored, green.

### 5 — the sort assertion was satisfied by the fixture

The `organizations` fixture was already alphabetical (`Anadi`, `Bagmati`); only the *memberships*
array was shuffled, and memberships never determine output order — the `organizations` rows do.
Fixture reseeded Bagmati-before-Anadi.

**Mutation-tested.** With `.sort(…)` deleted from `lib/org/repo.ts:120`, the test fails with Bagmati
returned first. Restored, green.

### Gate — 2026-08-08 (post-remediation)

| Command | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **exit 0** |
| `npm test` | **exit 0 — 340/340 files, 2748/2748 tests, 47.8s** |

The three `Test timed out in 5000ms` failures recorded in the gate above **did not recur**: this run
was the plain `npm test` at the default 5s timeout, with no `--testTimeout` override, which supports
the earlier reading that they were I/O contention on the OneDrive-backed tree rather than a defect.

**+15 tests** on this branch (2733 → 2748). `git status --porcelain` clean at commit; no
mutation-test edit survived into it.

### Files changed by the remediation

- `tests/architecture/client-server-boundary.test.ts` — whole-file `importsOf` (#1)
- `components/workspace/save-error.ts` — **new**, HTTP status → what the person should do (#2)
- `components/workspace/org-settings-form.tsx` — status branches + field attribution (#2, #3)
- `components/workspace/team-member-row.tsx` — status branches, incl. its own 404 (#2)
- `tests/components/workspace/org-settings-form.test.tsx` — **new** (9)
- `tests/components/workspace/team-member-row.test.tsx` — **new** (5)
- `tests/api/org-routes.test.ts` — the `.strict()` case (#4) + the `fieldErrors` shape contract (#3)
- `tests/org/repo.test.ts` — fixture seeded out of order (#5)

**Untouched, by instruction and on the merits:** `lib/org/membership-change.ts`,
`lib/cases/require-org-permission.ts`, and the gates in both routes.
