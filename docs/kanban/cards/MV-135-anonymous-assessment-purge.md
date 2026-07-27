# MV-135 — Anonymous assessments have no purge/deletion path (audit O-2)

**Priority:** P1 · **Owner:** agent + founder · **Merge:** _founder-gated_ (data-retention policy)
**Source:** 2026-07-10 audit finding **O-2**; the audit explicitly said "card O-1/O-2 as
blockers." O-1 rides MV-08; **O-2 had no card** until now (confirmed 2026-07-17). A data
liability, not a UX nicety.

## Why

The 3-day "expiry" is an *access* expiry, not deletion — the anonymous assessment data
persists. There is no purge job and an anonymous user has no way to delete their data.
That is a standing privacy/retention liability, and it undercuts the trust the product
sells. It pairs with MV-05 (legal/disclaimer) but is a distinct mechanism: MV-05 is the
account-deletion path + retention *policy text*; this is the actual anonymous-data purge.

## The gap

- No cron/scheduled purge of expired anonymous assessments.
- No self-serve deletion for an anonymous user.
- Retention is therefore unbounded and undisclosed for the anonymous path.

## Fix direction (needs a founder retention decision first)

1. **Founder decides the retention window** for anonymous data (how long after the 3-day
   access expiry, if not immediately).
2. Implement a purge job honouring that window (Supabase scheduled function / external cron
   — note business logic stays in the app per CLAUDE.md; the cron just triggers it).
3. Give the anonymous user a delete affordance, or clearly disclose the retention + purge in
   the privacy copy (ties to MV-05).

## Acceptance criteria

- [x] Expired anonymous assessments are purged on a defined, disclosed schedule.
- [~] The retention window is a founder-approved, written policy (link it) —
      `docs/data-retention-policy.md` written; **the window itself awaits founder sign-off**
      in the PR (the card said don't guess it, so it is proposed, not assumed).
- [x] Privacy copy tells the truth about retention + deletion — `/trust` corrected.
- [x] Gate green; cover the purge logic with a test.

## What shipped

**Window: 3 days — the expiry date the student is already shown IS the deletion date.**
Derived in code from `ASSESSMENT_TTL_DAYS`, so the promise and the purge cannot drift.
Rationale, rejected alternatives, and the leads decision: `docs/data-retention-policy.md`.

- **`lib/assessments/purge.ts`** — the policy + predicate. Scans, re-checks in app code,
  then deletes by verified id with every guard re-applied. Bounded per run, reports
  `truncated` so a cap is never silent. Supports `dryRun`.
- **`app/api/cron/purge-anonymous/route.ts`** — trigger only (business logic stays in the
  app, per CLAUDE.md). `CRON_SECRET` bearer, timing-safe, **fails closed** to a bare 404;
  logs when the secret is missing, because a silent fail-closed gate = retention silently
  stopping. Partial failure returns 500 rather than a green cron over a purge that didn't run.
- **`vercel.json`** (new file) — daily 21:15 UTC = 03:00 Nepal.
- **`supabase/migrations/20260725120000_...sql`** — partial index on anonymous rows only.
  **NOT applied to production by this agent.**
- **`app/(marketing)/trust/page.tsx`** — the live page promised a 12-month post-deletion
  retention that existed nowhere (account deletion is immediate) and named a settings page
  that doesn't exist. Corrected + the anonymous sentence added. **Founder-review copy.**

## The landmine (read before touching the predicate)

A claim updates only `{ owner, claimed_at }` — it **never** extends `expires_at`. So every
converted user's assessment permanently carries a past expiry, indistinguishable on time
alone from an abandoned one. **A purge keyed on expiry alone would delete exactly the rows
of the students who signed up.** `owner is null` is load-bearing; two tests pin it
(mutation-verified: removing the guard fails them). The clean root fix — set
`expires_at = FAR_FUTURE` on claim, plus a backfill — is deliberately out of scope here.

## Deliberately OUT of scope

- Self-serve "delete this now" for the anonymous visitor (the card offered *or* disclosure;
  disclosure shipped). Still no anonymous delete affordance.
- Expiry-aware `not-found.tsx` — a student returning on day 4 gets a bare framework 404.
- `expires_at = FAR_FUTURE` on claim + backfill (touches the claim path).
- Data residency: `/trust` says "Australian and EU regions"; the live Supabase project is
  `ap-southeast-1` (Singapore). A founder call, and one of MV-05's four blocked facts.

## Test plan / evidence

- **TDD, red→green.** `tests/assessments/purge.test.ts` (12) + `tests/api/cron/purge-anonymous.test.ts` (9).
  Mutating away the `owner is null` re-check failed exactly the two landmine tests, then passed again.
- **Real-DB smoke:** `tests/integration/anon-purge.itest.ts` — proves the `leads` ON DELETE
  CASCADE actually fires (invisible at the call site), a claimed row with a 400-day-past
  expiry survives, and **a purged assessment cannot be resurrected** (claim returns false,
  no profile bootstrapped). Runs under `npm run test:integration`, not `npm test`.
- **Gate green:** `typecheck` 0 · `lint` 0 · **2056 tests / 307 files** (was 2035 at MV-145; +21).

## Resume notes

- Branch `mv-135-anon-purge` off `origin/master` (`d49aac9`), worktree `../merovisa-mv135`.
- **Two founder gates before this is live:** (1) sign off the 3-day window + the `/trust`
  copy; (2) set `CRON_SECRET` in Vercel and apply the migration. Until `CRON_SECRET` is set
  the route 404s and **nothing is deleted** — safe, but retention is not yet running.
- **First production run should use `?dryRun=1`**, read the counts, then arm the schedule.
- Live DB at time of writing: 40 unclaimed anonymous rows, all already past expiry, oldest
  from 2026-06-03 — so the first armed run deletes ~40 rows, irreversibly.
- Related: MV-05 (legal/data boundary, 4 founder facts incl. region + retention), MV-08.
