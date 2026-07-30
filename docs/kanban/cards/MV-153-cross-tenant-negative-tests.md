# MV-153 — Cross-tenant negative-test harness + positive authorization matrix (Stage 1 exit gate)

**Priority:** P1   **Owner:** agent
**Goal:** Prove, against a real Postgres with the real migrations and policies applied, that the Stage 1 tenancy authorization matrix denies every cross-tenant access AND grants every legitimate one — so the founder has database-level evidence, not assurances, that MeroVisa can hold two consultancies' student data in one project without leakage. This card IS the Stage 1 exit gate.

## Context links
- Revised consultancy plan — the source of every test in this card:
  - "Required negative security tests" (`docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`, lines 394–405) — the full negative catalogue; this card implements the Stage-1 subset (see Acceptance criteria) and defers Storage/invitation-flow/rate-limit items to their stages.
  - "Enforcement boundary" (lines 336–345) — RLS evaluated *as the authenticated user* is the load-bearing layer; this is precisely why the harness must query as the user, not as service-role.
  - "Authorization rules" (lines 348–356) — org owner/admin full-org, counsellor assigned-only, student linked-only, inactive membership = no access, knowing a case ID grants nothing, service-role requires a completed case-auth check first.
  - "Stage 1 — Tenancy foundation" + its exit gate (lines 620–627): "the authorization matrix passes positive and negative database tests."
  - "Roles must never be trusted from browser state or authentication metadata alone" (line 101) — the role-forgery test.
- Harness idioms to extend: `tests/integration/anon-purge.itest.ts` (the `*.itest.ts` pattern, `describe.skipIf(!url||!serviceKey)`, the **localhost hard-guard** that throws at import against a non-local URL, unique-per-run fixture suffixes, "assert on THIS row, never a global count", `afterAll` teardown incl. `auth.admin.deleteUser`) and `tests/integration/claim-path.itest.ts` (minting throwaway users via `auth.admin.createUser`).
- Config + CI: `vitest.integration.config.ts` (includes `**/*.itest.ts`, excludes `**/.claude/**`, 30s timeouts) and `.github/workflows/ci.yml` (the `integration` job — Node 22, `npx supabase start`, exports `SUPABASE_TEST_URL`/`SUPABASE_TEST_SERVICE_ROLE_KEY`, and the load-bearing `>0 passed / 0 skipped` log guard; currently `continue-on-error: true` — advisory).
- RLS grant pattern the policies under test follow: `supabase/migrations/20260605130000_fix_documents_rls.sql` (`revoke all from anon, authenticated` → `grant … to authenticated`, `force row level security`).
- Sibling cards: MV-150 (tables + deny-all RLS + regenerated types), MV-151 (server-only case-permission layer + service-role exception list), MV-152 (real case-aware RLS policies). MV-149 is the Stage 1 umbrella that records this card as the stage exit gate.
- Decision record: `docs/legal/2026-07-29-stage0-decision-record.md` D-B — Stage 1 "touches no real student data and can proceed against seed data," which is exactly what this harness does.

## Acceptance criteria
A cold agent can `npx supabase start`, set the env vars, run `npm run test:integration`, and observe the following — every tenant query issued through an **authenticated** client (anon key + that user's JWT), never through the service-role admin (which bypasses RLS).

**Harness capability**
- [ ] A two-org fixture factory seeds, in one local database: 2 organizations (A, B), each with an owner, an admin, ≥2 counsellors, and ≥1 student; ≥2 cases per org; `case_assignments` linking *some* counsellors to *some* cases (so "assigned" vs "unassigned-but-same-org" both exist); ≥1 case per org with a linked `student_user_id`. Seeding is unique-per-run (`Date.now()` suffix idiom) and fully torn down in `afterAll` (seeded rows deleted, every minted auth user removed via `auth.admin.deleteUser`).
- [ ] A `clientForUser(userId)` helper returns an RLS-scoped supabase-js client that carries the user's real session (anon/publishable key + authenticated JWT) — the capability neither existing itest has. The service-role admin is used ONLY for seeding, teardown, and exercising MV-151's service-role exception wrappers.
- [ ] The localhost hard-guard from `anon-purge.itest.ts` is reproduced: the suite throws at import if `SUPABASE_TEST_URL` is set to any non-local host, because the fixtures create and delete many rows and auth users.

**Positive matrix — proves policies GRANT correctly (an all-deny bug must not pass silently)**
- [ ] Org A **owner** can list, read, update, and delete every case in org A.
- [ ] Org A **admin** can list, read, update, and delete every case in org A.
- [ ] A **counsellor** can read and update the case they are **assigned** to.
- [ ] A **student** can read their **linked** case (the case whose `student_user_id` is their auth id).

**Negative catalogue (Stage 1 subset) — proves policies DENY**
- [ ] **Cross-org denial:** org A's owner AND admin (fully privileged *inside* A) cannot **list**, **read** (by a known case id), **update/change**, or **delete** any org B case — verified across all six tenant tables (`organizations`, `organization_memberships`, `cases`, `case_assignments`, `invitations`, `audit_events`), so knowing an id or table grants nothing.
- [ ] **Unassigned-counsellor denial:** a counsellor in org A who is **not** assigned to a given org-A case cannot read, list, or change it (the assigned-only rule; contrast with the positive assigned-counsellor case above).
- [ ] **Student cross-case denial:** a student linked to case X cannot read, list, or change case Y (another student's case), and cannot read `audit_events` or other members' `organization_memberships`.
- [ ] **Revoked-member immediate loss:** flipping a member's `organization_memberships.status` to inactive causes their very next query to lose all org access — no reliance on re-login or cache expiry; the re-query in the same test run returns nothing.
- [ ] **Role forgery rejected:** a client whose `user_metadata`/`app_metadata` (or a forged header) claims owner/admin of org B gains nothing — authorization is read from the DB membership tables, never from JWT metadata or browser state.

**CI wiring**
- [ ] `.github/workflows/ci.yml`'s `integration` job exports the anon/publishable key (`SUPABASE_TEST_ANON_KEY`, from `supabase status -o env`) in addition to the existing URL + service-role key, so `clientForUser` has a key to sign in with.
- [ ] The existing `>0 passed / 0 skipped` log guard covers the new suite — a missing env var must fail CI, never green a run that skipped every tenancy assertion.

**Deferred — respect the stage seams (do NOT build here)**
- [ ] (Documented, not implemented) Storage guessed-path download denial → Stage 4; invitation expired/replayed/revoked/email-mismatch acceptance and single-acceptance-under-concurrency → Stage 5; repeated-invalid-token rate-limit/alert → Stage 5; case export/download cross-org denial → Stage 4/6. This card lists them as deferred so a cold agent does not absorb them.
- [ ] (Documented, not implemented) service-role case-authorization check on a privileged wrapper → deferred to the stage that ships the first service-role case wrapper (Stage 5 invitation acceptance / Stage 4 storage admin), because MV-151 ships only the enumerated exception list + lint in Stage 1, with no runtime service-role case wrapper to invoke.

## Test plan
- **New real-DB suite** `tests/integration/tenant-isolation.itest.ts` (+ a fixture helper, e.g. `tests/integration/fixtures/tenancy.ts`), collected by `vitest.integration.config.ts` and run by `npm run test:integration` only — excluded from the default `npm test`, `skipIf` when env vars are absent.
- Structure each negative test as: seed via service-role admin → issue the offending query via `clientForUser(attacker)` → assert empty result set (RLS filters silently, not an error) for reads/lists, and 0 affected rows / RLS error for writes and deletes. Scope every assertion to seeded ids, never a global count (mirrors the anon-purge "assert on THIS row" note), so concurrent local data can't move the result.
- Positive and negative live in the **same run**: the positive matrix guards against a broken-policy "everything denies" state that would pass every negative test while breaking the product.
- The role-forgery test mints a user whose metadata claims org-B ownership (via `auth.admin.createUser` with `app_metadata`/`user_metadata`) and re-runs the cross-org reads — expecting the same denials as the plain attacker.
- The revoked-member test asserts access before revocation, flips `status`, then asserts loss on the next query within one test body.

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test` · **`npm run test:integration`** (mandatory — this card's entire value is real-DB behavior; it is not "done" on `npm test` alone). Locally, first `npx supabase start` and export `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, and `SUPABASE_TEST_ANON_KEY` from `npx supabase status -o env`. In CI, the `integration` job must run the suite with `0 skipped`.

## Dependencies / blocked-by
- **MV-150** — the six tables must exist (with the invitation `token_hash` single-acceptance shape and append-only `audit_events`) or there is nothing to isolate.
- **MV-151** — `requireCasePermission` and the service-role exception registry + ESLint guard must exist. MV-151 ships no runtime service-role case wrapper in Stage 1, so the service-role-path denial test is deferred (see Deferred).
- **MV-152** — the **hard blocker**: this suite runs against MV-152's real case-aware policies. Against MV-150's deny-all defaults every query denies, so the *positive* matrix cannot pass and the harness proves nothing. Do not start the assertions until MV-152 is merged.
- A local Supabase stack (Docker) — same prerequisite as the existing itests. No real student data (per decision record D-B, Stage 1 runs on seed data).

## Risk notes
- **The service-role trap (highest risk):** the two existing itests only ever use the service-role admin client, which **bypasses RLS entirely**. If the tenancy queries are issued through that client, every "deny" test fails to deny — or, written carelessly, passes trivially — producing a green suite that proves nothing. Every tenant assertion MUST go through `clientForUser` (authenticated JWT). The admin is confined to seeding, teardown, and MV-151 wrapper calls. This is the single defect most likely to give false confidence, which is the exact failure the negative catalogue exists to prevent.
- **Positive-only or negative-only is insufficient:** a broken policy that denies everyone passes 100% of negative tests. The positive matrix in the same run is what catches that; neither half alone is the gate.
- **The `0 skipped` CI guard is load-bearing:** without env vars the suite `skipIf`s and CI would be green having tested nothing. The new anon-key export must be asserted alongside the existing two, or a silent export failure re-opens that hole.
- **Advisory ≠ gating:** the `integration` job is currently `continue-on-error: true`, so a red integration lane does not block merge. Stage 1's exit gate is "positive and negative tests pass" — this suite must be a **gating** signal for the stage. Whether to flip `continue-on-error`/branch-protection is a founder call (record it in the umbrella MV-149), but Stage 1 cannot be declared exited on an advisory-only, possibly-skipping check.
- **Isolation across concurrent runs:** agent worktrees under `.claude/**` are already excluded from collection, but 2-org fixtures with many users invite cross-run collisions. Unique-per-run suffixes and id-scoped assertions are mandatory, not optional.
- **Revoked-member semantics:** the test must prove *immediate* loss on the next query. If MV-152's helper or a stale JWT carries membership, this catches it — do not weaken the test to a re-login.

## Agent resume notes (for a cold start)
1. Confirm the dependencies are merged: MV-150 (tables + deny-all), MV-151 (server layer + service-role exception list), and especially **MV-152 (real policies)**. If MV-152 is not in, stop — the positive matrix cannot pass against deny-all.
2. Start the stack and export env (PowerShell):
   - `npx supabase start`
   - `npx supabase status -o env` → set `$env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"`, `$env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<service_role>"`, and **`$env:SUPABASE_TEST_ANON_KEY = "<anon/publishable>"`** (the new one; existing itests don't need it).
3. Read `tests/integration/anon-purge.itest.ts` end to end — copy its file header, the `skipIf` gate, and the **localhost hard-guard** verbatim into the new suite.
4. Create `tests/integration/fixtures/tenancy.ts`: the two-org factory + a `clientForUser(userId)` helper. For `clientForUser`, mint each user with a password via `auth.admin.createUser`, then `createClient(url, anonKey).auth.signInWithPassword(...)` to obtain an RLS-scoped client (or `generateLink` + `setSession`). Return the authenticated client.
5. Create `tests/integration/tenant-isolation.itest.ts`. Write the **positive matrix first** (it should pass immediately against MV-152), then the negative catalogue.
6. Run `npm run test:integration`. Iterate until every checkbox is green.
7. Edit `.github/workflows/ci.yml` `integration` job: add `SUPABASE_TEST_ANON_KEY` to the "Export Supabase test env" step (map from `ANON_KEY`/`SUPABASE_ANON_KEY`/`PUBLISHABLE_KEY` with the same fallback discipline the URL/key mapping already uses) and assert it in "Run integration smoke".
8. Run the full gate: `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:integration`. Record results as Done evidence.

## Decision log
- 2026-07-30 — Card carved from Stage 1 of the revised consultancy plan (integrator session).

## Done evidence
(pending)
