# MV-18 — Real-DB claim-path integration smoke (catch the swallowed-index class)

**Column:** Backlog · **Priority:** P2 · **Owner:** agent · **Gate:** human (founder — approve the one-time local toolchain; no prod write)
**Created:** 2026-06-20
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

- **Migrations:** ✅ all 15 present in `supabase/migrations/`, incl.
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

## Acceptance criteria

- [ ] Integration test mints a non-Google user via `auth.admin.createUser` and
      drives `claimAndBootstrapProfile` against a **real** Postgres with the real
      migrations applied (real `assessments_primary_idx`).
- [ ] After a 2nd claim: exactly one `is_primary=true` row for the owner, and it is
      the newest assessment (newest-wins). **Confirmed RED on the pre-MV-16 code.**
- [ ] A `leads` row lands on claim; a re-claim does not duplicate it.
- [ ] A `profiles` row is bootstrapped for the user.
- [ ] The suite **skips cleanly** (never fails) when the local stack isn't running;
      it is not part of the default `npm test`.
- [ ] Teardown removes all test rows + the auth user. **No prod writes.** Business
      logic untouched (test-only; `claim.ts` not modified).

## Test plan (TDD)

To prove the test actually catches the bug, the building agent should **temporarily
revert `claim.ts` to the single unconditional promote**, watch the newest-wins
assertion go **RED** against the real index, then restore the demote-then-promote
fix and watch it go **GREEN**. (This is the integration analogue of the RED step the
mocked unit test could only fake.) Then `npm run test:integration` green +
`npm run typecheck` clean.

## Open questions for the founder

1. **Toolchain:** OK to add `supabase` as a devDependency and rely on Docker Desktop
   for this test locally? (No prod/cost impact.)
2. **CI:** wire `test:integration` into CI later (needs a Postgres/Supabase service
   in the pipeline), or keep it a **local pre-merge gate** for claim/auth changes?
3. **Scope:** this smoke covers the post-session claim logic. The Google
   `exchangeCodeForSession` leg stays a founder live-smoke (un-automatable here) —
   confirm that split is acceptable.

## Status

Backlog — **blocked on the one-time local toolchain** (start Docker + `npm i -D
supabase`). Design is fully formed above; a cold agent can build it after setup.
Filed per the founder's "smoke-test with a dev account" question; not started.
