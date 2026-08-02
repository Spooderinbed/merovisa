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
- 2026-07-31 — **Expectations come from the canonical access matrix, never from either implementation.** Every cell in the harness is written against `docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md`. Deriving them by reading MV-151's grid or MV-152's policies would have re-encoded whichever layer was wrong and re-created the exact failure the card exists to prevent.
- 2026-07-31 — **The TypeScript layer is probed with the SERVICE-ROLE client injected as `getCaseContext`'s `db` argument; the database layer is probed only through `clientForUser`.** This is what makes the two assertions independent. `getCaseContext` uses the authenticated client in production, so probing TS through the actor's RLS client would let RLS silently answer for it — a TS matrix bug would hide behind a correct policy and the harness would report agreement. Injecting the unfiltered client asks the question that matters: *if RLS were bypassed, does TypeScript still deny?* It is the only service-role client in an assertion path, and `harness self-check` asserts the `role` claim on all 17 actor JWTs before any cell runs, closing the card's highest-rated risk (the service-role trap).
- 2026-07-31 — **The matrix is declarative data, not hand-written tests.** `caseRow(actor, target, allowedVerbs, why)` names the verbs the canonical model ALLOWS and every other verb is asserted denied, so a verb added to `CASE_VERBS` defaults to "denied for everyone" until someone states otherwise — the safe direction for a table that is also a security boundary.
- 2026-07-31 — ~~**Vacuity proven by inversion.** A 292-cell run with every expectation flipped failed 292 of 292 — no cell passes for a reason unrelated to its probe.~~ **RETRACTED 2026-08-02.** The inference does not follow: each cell is a single equality, so a cell that passes with `expected` must fail with `!expected` — the 292/292 result was mathematically guaranteed and carries no information about *why* a cell passes. BLOCKER 2 below is a live counterexample: those cells failed under inversion and still denied for the wrong reason. What the inversion run DOES support, and all it supports, is the narrower claim: **every cell body executes, the expectation is genuinely compared, and no cell was skipped or short-circuited.** The causal claim is now carried by mutation testing instead — see the 2026-08-02 entry.
- 2026-07-31 — Every read denial is paired with a service-role existence proof that THROWS on a missing row, so "sees nothing" can never pass on an empty fixture.
- 2026-07-31 — **Extended, not duplicated: MV-152's `case-rls.itest.ts` keeps the policy smoke** (catalog shape, grants, anti-recursion, `BYPASSRLS` ownership, InitPlan/index planning). MV-153 owns the matrix — every role × verb × case shape in both layers, the cross-tenant catalogue, and the dual-role sub-matrix. Both run in the same `npm run test:integration`.
- 2026-07-31 — **Added one fixture shape the card did not enumerate:** `crossTenantDual`, an org **A** admin who is the linked student of an org **B** case. It is the sharpest test of the dual-role rule — a staff role must not follow a person into the tenant where they are the data subject, and being that data subject must not open that tenant. Both layers hold.
- 2026-07-31 — **`continue-on-error: true` on the `integration` job left as-is — founder call, per this card's own risk note.** The card requires the CI wiring (anon-key export + the `0 skipped` guard) but records the advisory→gating flip as a founder decision to be recorded on MV-149. Flagged in the PR body rather than taken unilaterally.
- 2026-08-02 — **Closed by PR #111 and the repository ruleset, outside this card.** `continue-on-error` is gone and the active "master protection" ruleset (no bypass) requires `integration` and `validate`, strict/up-to-date. The integration lane is now gating, so Stage 1's exit is evidenced by CI as well as by the local run below. Nothing in this branch changes that policy; the CI work here is limited to fixing two guards that were broken regardless of it.
- 2026-07-31 — **Two layer asymmetries found and PINNED rather than papered over** (see Done evidence §Findings). Both are TypeScript-narrower-than-SQL, which the canonical matrix calls the safe direction, and both now have a test that fails if either layer changes.
- 2026-07-31 — Per the integrator's instruction this session edited only the Decision log and Done evidence of this dossier, and touched no board file; the acceptance checkboxes above are left for the integrator to tick against the evidence below.

### Round 2 — a two-lens adversarial review found 2 blockers and 4 majors. All six are closed.

- 2026-08-02 — **BLOCKER 1: "across all six tenant tables" was met for READS only.** Round 1's single cross-org write test covered seven verbs and omitted five that `authenticated` actually holds per the migration's §9 grants: `organizations` DELETE, `organization_memberships` UPDATE and DELETE, `case_assignments` DELETE, and `invitations` INSERT and UPDATE(revoked_at). `organizations` DELETE is the severe one — it cascades every case, membership, assignment and invitation of a tenant. Replaced by a full catalogue: every granted write verb, on every table, in BOTH directions (org A → org B and org B → org A, as owner and as admin), each paired with a service-role existence proof and a byte-identical before/after comparison of the victim's rows. **The catalogue's coverage is itself asserted:** `GRANTED_WRITE_VERBS` in the fixture transcribes §9, the catalogue records each verb it attempts, and a closing test asserts the recorded set EQUALS the granted set — so a new grant without a new assertion fails a test.
- 2026-08-02 — **`organizations` DELETE needed a probe no cross-tenant test can be.** A cross-org attacker is a member of nothing in the victim tenant, so the delete is refused by the org-id comparison whichever actor set the policy names; widening `organizations_delete_owner` from `actor_owner_org_ids()` to `actor_admin_org_ids()` stays invisible. Added probes that are members of the tenant they attack — a counsellor and an admin, both refused, plus a REVOKED owner refused — against **disposable organizations**, because a delete that unexpectedly succeeds would cascade org A and bury the finding under ~400 unrelated failures. The owner's delete is asserted to SUCCEED as the positive control: without it, every denial also passes when DELETE is unreachable for everybody.
- 2026-08-02 — **BLOCKER 2: `cloneCase` stripped the relationship the cell was named for.** The clone dropped `student_user_id` (and `assign` additionally dropped the roster), so cells like `DENY studentA case.delete orgAssignedA` were actually asserting that a *stranger* cannot delete a case they have no link to. The round-1 justification — "no policy under test reads it for these verbs" — was true of *today's* policies, which is exactly the defect: the probe was calibrated to the implementation it exists to falsify. The clone now copies `organization_id`, `student_user_id` and the assignment roster; every other column a policy could read (`archived_at`, `operational_status`, `created_by`, `email`) is already identical between a seeded case and a clone, so the clone is now indistinguishable from its source under any predicate, current or widened.
- 2026-08-02 — **`case.assign` is probed as BOTH halves of the roster verb, because neither half alone is falsifiable.** `assignment_role` has one legal value and `case_assignments_primary_idx` is partial-unique on `case_id`, so a clone that keeps the roster has no free slot for an INSERT probe — which is why the insert target must drop it, and why an actor whose only relationship is their own assignment row has no relationship to that target. The fix is not to force the impossible but to add the other half: a DELETE probe against a roster-preserving clone, where that actor *does* hold the named relationship. Both halves are gated by `can_manage_case` alone, so they must agree; when they disagree the probe raises a FINDING rather than folding it into a boolean.
- 2026-08-02 — **MAJOR 3: both CI "the exit gate ran" guards were inert, reproduced not inferred.** Against a real vitest 4.1.8 run: `! grep -Eq 'Tests[[:space:]]+[1-9][0-9]* skipped'` never matched, because vitest emits one combined counter line (`Tests  7 passed | 517 skipped (524)`) in which the digits after `Tests` are the PASS count; and `grep -q '…tenant-isolation.itest.ts'` matched the 425 `↓` lines a fully-skipped suite prints. All four round-1 guards passed on a run where the entire Stage 1 exit gate skipped. Replaced with checks that **fail closed**: the counter assertions are positive (`Tests  N passed (N)` and nothing else, at test and file granularity), so a renamed counter or an added column goes red rather than silently matching nothing; and execution is asserted on `✓`, which is printed only for a test that ran. Evidence in Done evidence §CI guards.
- 2026-08-02 — **MAJOR 4: the SQL layer has two revocation gates and only one was reachable.** `actor_org_ids` / `actor_admin_org_ids` / `actor_owner_org_ids` / `actor_assigned_case_ids` each filter `status = 'active'` themselves — well covered. But `private.org_role` → `private.is_org_admin` is the ONLY status filter behind `can_manage_case`, `can_staff_case`'s admin disjunct, and the `archived_at` branch of `enforce_case_write_surface`. Every revoked actor in every suite was a counsellor, and `is_org_admin` is false for a counsellor whatever their status, so *no test could reach that gate*. Added `inactiveOwnerA` and `inactiveAdminA`, each also the linked student of their own case — the student link is what carries them past `cases_update_accessor`'s USING clause so the write actually reaches the trigger, with a `display_name` edit as the control proving the row is reachable and the two 42501s are the trigger refusing rather than the policy missing the row. An active-admin positive control asserts the same six paths are open.
- 2026-08-02 — **MAJOR 5** — the tautological inversion claim is retracted in place above and replaced with mutation evidence.
- 2026-08-02 — **The self-check now validates the CLIENT, not only the token.** A `role: authenticated` claim is a property of the token and says nothing about the client carrying it. Every JWT-bearing client is minted by one registering factory and recorded in `fixture.issuedClients`; the self-check asserts each one is filtered by RLS (a BYPASSRLS client would return every seeded case, and no actor may). The tampered-JWT client the forgery test used to build for itself now goes through the same factory, and a structural test counts `createClient` call sites — 1 in the fixture, 0 in the suite — so a future unrecorded client fails a test.
- 2026-08-02 — **The plan's cross-org cache-isolation test (plan line 391) is now RECORDED as deferred rather than silently absent.** Stage 1 ships no route that reads these tables, so there is no shared cache entry for two tenants to collide on; it moves with the first case route in Stage 3. Listed in `DEFERRED_BY_DESIGN`, which the suite asserts the length of.
- 2026-08-02 — **`studentB` and `counsellorAssignedB` were seeded and asserted nowhere.** Both now carry matrix rows, including org B's positive mirror (its assigned counsellor works its case, its student drives theirs, its owner runs the tenant) — which is what makes every "org A cannot reach org B" cell non-vacuous: without it those denials are equally consistent with org B being unreachable by anybody.

## Done evidence

**Branch** `mv-153-cross-tenant-harness`, merged up to `origin/master` @ `569f257` (PR #111, the gating flip, is in the branch).

### Files
- `tests/integration/tenant-isolation.itest.ts` — the matrix (425 tests).
- `tests/integration/fixtures/tenancy.ts` — two-org fixture factory, the recording RLS-client factory, localhost hard-guard, disposable-org seeder, `GRANTED_WRITE_VERBS`, and the probe machinery (one probe per verb, each returning a boolean plus the evidence behind it).
- `.github/workflows/ci.yml` — `SUPABASE_TEST_ANON_KEY` exported and asserted; the two inert log guards replaced with fail-closed ones.

### Gate — all green, 2026-08-02 (round 2)
| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **2470 passed** / 323 files |
| **`npm run test:integration`** | **524 passed / 5 files / 0 skipped** (local stack, all migrations incl. `20260730120000` + `20260730180000` applied) |
| of which this suite | **425 passed** |
| CI log guards, replayed locally | all six green on the real run; five of six RED on a deliberately-skipping one — see below |

### CI guards — the proof they now fire
A run with `SUPABASE_TEST_ANON_KEY` unset skips both tenancy suites and exits 0:

```
 Test Files  2 passed | 3 skipped (5)
      Tests  7 passed | 517 skipped (524)
```

Against that log, **all four round-1 guards passed** — CI would have been green having tested nothing about tenant isolation. The `↓` lines a skipped suite prints carry the full file path, so the collection grep matched 425 times while `✓ …tenant-isolation.itest.ts` matched 0.

| Guard | real run | skipping run |
|---|---|---|
| `Tests  N passed` present | green | green (7 passed) |
| `Tests  N passed (N)` — passes and nothing else | green | **RED** |
| `Test Files  N passed (N)` — passes and nothing else | green | **RED** |
| `✓ tests/integration/tenant-isolation.itest.ts` | green | **RED** |
| `✓ tests/integration/case-rls.itest.ts` | green | **RED** |
| `✓ …tenant-isolation…` count ≥ 400 | green (425) | **RED** (0) |

### Mutation evidence — the assertions bite, and round 1's did not
Four mutations applied to the local database, suite run, mutation reverted. The same four run against the round-1 suite for the counterfactual.

| Mutation | round 1 | round 2 |
|---|---|---|
| `private.org_role`: drop `and m.status = 'active'` | 341/341 **pass** | **12 fail** (both revoked-privileged rows + the org_role block) |
| `organizations_delete_owner`: `actor_owner_org_ids` → `actor_admin_org_ids` | 341/341 **pass** | **1 fail** (`a admin deleted their own organization`) |
| `cases_delete_admin`: add `or student_user_id = auth.uid()` | 341/341 **pass** | **8 fail** (every `case.delete` cell whose actor's only link is the student one) |
| `private.can_manage_case`: add assigned counsellors | 341/341 **pass** | **5 fail**, via the roster-split FINDING the `assign` probe raises |

Baseline and post-revert runs are 425/425 green, so no mutation leaked.

### Coverage — what is asserted, and in which layer
| Block | Cells | TS layer | DB layer |
|---|---|---|---|
| Case matrix (`case.read/update/archive/delete/assign/invite_student` × 47 actor×case rows) | 282 | ✔ | ✔ |
| Organization matrix (`case.create/org.audit.read/org.manage/org.settings` × 20 actor×org rows) | 80 | ✔ | ✔ |
| `case.list` — TS **scope** compared against the exact row set the DB returns | 17 | ✔ (scope, not boolean) | ✔ |
| `case.notes.internal` / `case.export` — no Stage 1 DB surface | 14 + 1 deferral record | ✔ | n/a (documented) |
| Cross-org READ denial, all six tenancy tables | 3 | — | ✔ |
| **Cross-org WRITE denial — every granted verb, six tables, both directions, + the grant-coverage assertion** | 6 | — | ✔ |
| Student cross-case denial (sibling case, audit trail, other members' rows) | 2 | ✔ | ✔ |
| Write-surface intersection (column half: student / counsellor / dual-role / cross-tenant dual) | 5 | — | ✔ |
| **`private.org_role` as the second revocation gate (revoked owner, revoked admin, active-admin control)** | 3 | ✔ | ✔ |
| Known layer asymmetries, pinned | 2 | ✔ | ✔ |
| Role forgery (metadata claims present in the JWT; metadata forgery; tampered `sub`) | 3 | ✔ | ✔ |
| Revocation immediacy + self-reactivation refused | 2 | ✔ | ✔ |
| Harness self-check (19 actor JWTs; every issued CLIENT is RLS-filtered; `createClient` call sites pinned; every case shape seeded; anon holds nothing) | 5 | — | ✔ |

Cross-tenant write verbs asserted, in both directions: `organizations` UPDATE(name, slug) + DELETE · `organization_memberships` INSERT + UPDATE(role, status) + DELETE · `cases` INSERT + UPDATE (incl. the tenant-move) + DELETE · `case_assignments` INSERT + DELETE · `invitations` INSERT (team and student shapes) + UPDATE(revoked_at) · `audit_events` INSERT + UPDATE + DELETE (no grant at all). The set is compared for equality against `GRANTED_WRITE_VERBS`, so it cannot drift from the migration's §9 grants in either direction.

Divergence-table coverage: **1** `org.settings` admin-deny · **2** `archived_at` owner/admin-only · **3** assigned counsellor invites their student · **4** student write surface is profile fields only · **5** admin may not mint a `role='owner'` invitation (held by MV-152's suite, which this one does not duplicate) · **6** dual-role, in four shapes — active staff + linked student, revoked member + linked student, revoked member + surviving assignment, and cross-tenant staff/student.

### Not tested, and why
- **`case.notes.internal`, `case.export`** — no Stage 1 database surface exists (no notes table, no export path). Asserted in TypeScript only and listed in `TS_ONLY_CELLS` so the gap is a stated fact rather than an omission; when either lands, its rows move into `CASE_CELLS`.
- **Storage guessed-path denial · invitation expiry/replay/revocation acceptance · single acceptance under concurrency · repeated-invalid-token rate limiting · case export/download cross-org denial · service-role wrapper denial** — deferred by this card to Stages 4/5/6. Enumerated in `DEFERRED_BY_DESIGN` in the suite so a cold agent does not read silence as coverage.
- **Cross-org cache isolation on a shared route** (plan line 391) — Stage 1 ships no route that reads these tables, so there is no shared cache entry for two tenants to collide on. Moves with the first case route (Stage 3). Now enumerated in `DEFERRED_BY_DESIGN`; round 1 neither tested nor recorded it.
- **Forged top-level GoTrue `role` (e.g. a user minted with `role: 'service_role'`)** — not attacker-reachable: creating such a user already requires the service key. Metadata forgery and signature tampering, which a client *can* mount, are both covered.

### Residual falsifiability limits, stated rather than papered over
- **`case.delete` and `case.assign` probe a CLONE, not the fixture row.** A delete that unexpectedly succeeded against the real row would take the fixture down and bury the finding under hundreds of unrelated failures. The clone is now identical to its source on every column any policy reads — `organization_id`, `student_user_id`, the assignment roster, and (unset on both) `archived_at`, `operational_status`, `created_by`, `email` — so it is policy-indistinguishable, which mutation M3 confirms behaviourally.
- **The `case.assign` INSERT probe cannot carry the actor's own assignment row.** `assignment_role` has exactly one legal value and `case_assignments_primary_idx` is partial-unique per case, so a target holding the roster has no slot to insert into. This is a schema constraint, not a choice. It is compensated by the DELETE half, whose target *does* hold the roster; mutation M4 shows the pair catches a `can_manage_case` widening that the insert alone could not.
- **`org.settings`, `org.manage` and `case.create` are probed against the real organizations,** not clones, because each restores what it touches and none is destructive.

### Findings — two layer asymmetries, both TypeScript-narrower (the safe direction)
1. **`case.update` is a whole-case verb in TypeScript and a per-column decision in the database.** The TS matrix has no field-level dimension, so it allows a linked student `case.update` and leaves "permitted fields only" to the caller (`lib/cases/README.md` §"Known gap: student permitted fields"). The database refuses `operational_status` and `archived_at` outright (42501, via `enforce_case_write_surface`). **Consequence a Stage 3 mutation route must respect: `requireCasePermission(actor, caseId, "case.update")` is not sufficient authorization to apply an arbitrary case patch on a student's behalf — today RLS is the only thing stopping it.** Pinned by `known layer asymmetries, pinned › TypeScript authorizes case.update as a whole verb…`.
2. **`case.list` denies a student in TypeScript while the database still returns their own case rows.** `case.list` is an ORG-scoped question and a student holds no membership, so TS answers no; the database has no separate list verb, so a student's `select * from cases` returns exactly the rows they already hold `case.read` on. No row crosses a boundary in either layer. Pinned by the sibling test.

No security-direction divergence (SQL more permissive than TS) was found in any of the 362 dual-asserted cells, in round 1 or round 2.

**No real policy bug was found by any round-2 fix.** Every new assertion — the five previously-unasserted cross-tenant write verbs, tenant destruction by a non-owner member, the relationship-carrying delete/assign clones, and both `org_role`-gated revocation paths — passed against the unmutated database on the first run. The four mutations above confirm the assertions are live rather than vacuous; the policies themselves were already correct on all of them.
