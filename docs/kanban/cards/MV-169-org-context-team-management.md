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

_(filled in before In Review)_
