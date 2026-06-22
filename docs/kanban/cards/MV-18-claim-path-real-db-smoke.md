# MV-18 — Real-DB claim-path integration smoke (catch the swallowed-index class)

**Column:** In review · **Priority:** P2 · **Owner:** agent · **Gate:** human (founder)
**Created:** 2026-06-20 · **Entered review:** 2026-06-20
**Related:** [[MV-16]] — the bug this test would have caught (swallowed `assessments_primary_idx` violation). [[MV-14]] — the lead-insert this test also asserts. [[MV-17]] — the routing change that removes the duplicate-row path entirely.

## Why

The MV-16 bug — a second OAuth claim violated the partial-unique index
`assessments_primary_idx`, supabase-js returned `{ error }`, the code discarded it,
and the dashboard stayed pinned to the first assessment — **could not be caught by
our unit tests**, and still can't. `tests/assessments/claim.test.ts` mocks
supabase-js with a chainable thenable builder; a mock does not run Postgres, so it
**cannot enforce a partial-unique index**. The class of bug (a real DB constraint
rejecting a write that the mock happily "accepts") is structurally invisible to
every mocked test we have.

The founder's question that triggered this card — *"can't you smoke-test the
account flow with a dev account, don't we handle accounts the same way as Google?"*
— has a precise answer:

- **Accounts are auth-method-agnostic at the layer that broke.**
  `claimAndBootstrapProfile(adminDb, { assessmentId, userId, googleName?, email? })`
  ([lib/assessments/claim.ts](../../../lib/assessments/claim.ts)) runs on the
  service-role admin client and operates on a **`userId`** — it does not care
  whether that user was minted by Google OAuth, email/password, or the Supabase
  admin API. Only `exchangeCodeForSession(code)` in
  [app/auth/callback/route.ts](../../../app/auth/callback/route.ts) is genuinely
  Google-specific (it converts Google's auth code into a session).
- So the **valuable, agent-runnable, Google-free smoke** is an integration test
  that mints a throwaway user via `auth.admin.createUser` against a **real
  Postgres with the real migrations applied**, then drives `claimAndBootstrapProfile`
  directly. That exercises the real `assessments_primary_idx` — the thing the mock
  can't — with no Google consent screen and no founder OAuth round-trip.
- A real Google OAuth round-trip is **not something the agent can perform**
  (policy: no entering credentials / creating accounts / solving CAPTCHAs;
  technical: browsers are read-only tier here). That part stays a founder live-smoke
  — but it's the *only* part that has to.

## What to build (proposed — read `claim.ts` + the migration first)

A single Vitest **integration** test that runs against a local Supabase stack and
fails red without the fix, green with it:

1. **Target:** call `claimAndBootstrapProfile` twice for the **same** test user, on
   two different seeded `assessments` rows.
2. **Mint the user without Google:** service-role client →
   `auth.admin.createUser({ email, email_confirm: true })` → use the returned
   `user.id` as `userId`. (This is the "new dev account" the founder asked about,
   minted programmatically.)
3. **Seed two anonymous assessments:** insert two `assessments` rows. **Read
   `lib/assessments/claim.ts` + migration `20260603170655` to mirror the exact
   insert shape** (which columns are required, how `owner`/`is_primary`/`result`
   are set on an unclaimed row) — do not guess the columns; match what the claim
   path actually expects.
4. **Assertions (the acceptance criteria below):**
   - After the **second** claim: exactly **one** row has `is_primary = true` for
     that owner, and it is the **second** assessment (newest-wins). *(RED on the
     pre-MV-16 single-promote code: the second promote trips
     `assessments_primary_idx`, the error is swallowed, the first row stays
     primary.)*
   - A `leads` row exists for the claimed `(assessment_id, email)` (MV-14), and a
     **re-claim does not duplicate** it (idempotent upsert).
   - The profile bootstrap ran (a `profiles` row for the user).
5. **Teardown:** delete the seeded assessments + the auth user (cascades clean up
   profiles/leads), so the test is repeatable. **Local stack only — never prod.**
6. **Isolation so normal CI stays green when Docker is down:** gate the suite on an
   env var (e.g. `describe.skipIf(!process.env.SUPABASE_TEST_URL)`), point it at the
   local stack's URL + **service-role** key (from `supabase status`), and keep it
   **out of the default `npm test`** (separate include/script, e.g.
   `npm run test:integration`). The test must **skip**, never fail, when the stack
   isn't running.

Keep it minimal — one file, the three assertions above. No framework, no
abstraction layer; this is a smoke, not a harness.

## Infra decision — local Supabase (preferred), with the one-time setup the founder owns

Checked 2026-06-20:

- **Migrations:** ✅ all 14 present in `supabase/migrations/`, incl.
  `20260603170655_add_profiles_evolve_assessments.sql:59` which defines
  `assessments_primary_idx`. `supabase db reset` reproduces the real schema +
  index locally — the whole point.
- **Docker:** installed (**29.4.0**) but the **Linux engine daemon is not running**
  (Docker Desktop is closed). Must be started before `supabase start`.
- **Supabase CLI:** **not installed** (`npx` refused to auto-download
  `supabase@2.107.0`). One-time: `npm i -D supabase` (or the standalone binary).

**Two one-time setup steps (founder/operator):** (a) start Docker Desktop,
(b) `npm i -D supabase`, then `npx supabase start` + `npx supabase db reset` to
apply migrations. After that the agent can write the test TDD-style and watch it go
red→green against the live local index.

**Alternatives, ranked:** local stack (free, exact schema) ≫ paid Supabase dev
branch (`create_branch` incurs cost → founder decision) ≫ **prod test-writes
(prohibited without explicit founder approval — pollutes prod + is a prod write).**

## What shipped

- **`tests/integration/claim-path.itest.ts`** — env-gated Vitest integration smoke,
  node environment, hits a **real local Postgres** via the service-role client. Mints
  a throwaway non-Google user (`auth.admin.createUser({ email, email_confirm: true })`),
  seeds anonymous assessments with `createAnonymousAssessment` (the real repo writer,
  so the insert shape matches prod exactly), drives `claimAndBootstrapProfile`, and
  reads back through the real repo helpers. Teardown deletes seeded assessments +
  the auth user (cascade cleans profile/leads). Unique-per-run email so a failed
  teardown never collides.
- **`vitest.integration.config.ts`** — separate config: `environment: "node"`,
  `include: ["**/*.itest.ts"]`, 30s timeouts. New `npm run test:integration` script.
- **`vitest.config.ts`** — default `npm test` now excludes `**/*.itest.ts` (the
  module-level `tests/integration/*.test.ts` stay in `npm test`; only real-DB
  `.itest.ts` split out).
- **`supabase/config.toml`** — set `auto_expose_new_tables = true` (local-dev only).
  See "Finding" below: without it a fresh local `db reset` revokes the implicit
  service_role grants that prod's pre-flip tables still have, and every write 500s.
- **Toolchain (one-time, done):** `supabase` added as a devDependency; local stack
  brought up (`npx supabase start` + `db reset`, all 14 migrations applied).

`claim.ts` is **byte-identical to its committed state** (`git diff` empty) — the RED
proof reverted-then-restored it; this card adds tests only, no business-logic change.

## Acceptance criteria

- [x] Integration test mints a non-Google user via `auth.admin.createUser` and
      drives `claimAndBootstrapProfile` against a **real** Postgres with the real
      migrations applied (real `assessments_primary_idx`).
- [x] After a 2nd claim: exactly one `is_primary=true` row for the owner, and it is
      the newest assessment (newest-wins). **Confirmed RED on the pre-MV-16 code.**
- [x] A `leads` row lands on claim; a re-claim does not duplicate it (plus a direct
      double-`createLead` proving `leads_assessment_email_uniq` + ignoreDuplicates).
- [x] A `profiles` row is bootstrapped for the user.
- [x] The suite **skips cleanly** (3 skipped, exit 0) when env vars are absent; it is
      not part of the default `npm test`.
- [x] Teardown removes all test rows + the auth user. **No prod writes** (local
      stack only). Business logic untouched (test-only; `claim.ts` not modified).

## Test evidence (TDD, RED→GREEN against the real index)

Per the plan, the fix already shipped (MV-16), so the bug was **temporarily
reintroduced** to prove the test has teeth:

- **RED:** with `claim.ts` reverted to the pre-MV-16 single unconditional promote,
  `npm run test:integration` → newest-wins FAILED — the primary stayed pinned to the
  first claimed assessment (`expected [a2] / received [a1]`) because the 2nd promote
  tripped `assessments_primary_idx` and the swallowed error left a1 primary. The
  other 2 tests stayed green (they don't depend on the primary logic) → the test
  isolates exactly the MV-16 class. *This is the failure a supabase-js mock cannot
  produce.*
- **GREEN:** demote-then-promote restored → `test:integration` **3/3 passed**.
- **Skip-clean:** with env vars unset → **3 skipped**, exit 0.
- **Gate:** `npm test` **1270 passed** (`.itest.ts` correctly not collected) ·
  `npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing unrelated
  `build.mjs` warning).

To re-run: `npx supabase start`, then from `npx supabase status -o env` set
`SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY`, then `npm run test:integration`.

## Finding for the founder — service_role grant drift (read-only, worth a look)

The local stack exposed a real discrepancy. The current Supabase CLI default
(`auto_expose_new_tables`, flipped to `false` after 2026-05-30) means **freshly
created** public tables no longer get implicit `service_role` grants. Prod's tables
were created **before** the flip, so they keep those grants — which is why the admin
client writes fine in prod today. But it means prod relies on a now-deprecated
implicit grant rather than explicit `grant … to service_role` statements in the
migrations. Not an active outage, but a latent risk on a future platform upgrade /
table recreation. **Suggested follow-up (not done here, would be a prod schema
change → founder-gated):** add explicit `service_role` grants to the migrations so
the posture is intentional and reproducible. Flagged, not actioned.

## Open questions for the founder

1. **Toolchain:** `supabase` added as a devDependency + local Docker — **done**, no
   prod/cost impact. (Confirm you're OK keeping it in `devDependencies`.)
2. **CI:** wire `test:integration` into CI later (needs a Postgres/Supabase service
   in the pipeline), or keep it a **local pre-merge gate** for claim/auth changes?
3. **Scope:** this smoke covers the post-session claim logic; the Google
   `exchangeCodeForSession` leg stays a founder live-smoke (un-automatable here).
   Confirm that split is acceptable.
4. **Grant drift:** see the Finding above — want a follow-up card for explicit
   `service_role` grants in the migrations?

## Status

**In review** — built, RED→GREEN proven against a real local Postgres, full gate
green. Test-only (no business-logic or prod change). Awaiting founder gate on the
open questions above (esp. the devDependency + the grant-drift follow-up).
