# MV-130 — OAuth claim failure has no recovery on /assess (audit C-9)

**Priority:** P1 · **Owner:** agent · **Merge:** _founder-gated_
**Source:** 2026-07-10 audit finding **C-9**, confirmed uncarded 2026-07-17. Distinct from
MV-28 (which recovers anonymous *results*); this is the sign-in→claim seam.

## Why (student outcome)

A high-intent student who signs in to claim their assessment, and whose claim fails, drops
silently. `app/(focused)/assess/page.tsx` reads only the `?new` param and has no handling
for a claim/OAuth `?error=`. The failure is swallowed, the student sees no path forward,
and the most motivated user in the funnel is lost at the exact conversion moment.

## The bug

- `app/(focused)/assess/page.tsx` branches on `?new` but not on an error/claim-failure
  param. An OAuth or claim error returns the user here with no acknowledgement.
- Verify the claim route: what does it do on failure? (grep the OAuth callback + the claim
  action.) The audit's charge is that the failure is neither surfaced nor retryable.

## Fix direction

Surface a claim/OAuth failure on `/assess` with an honest message and a retry path (re-run
sign-in, or recover the anonymous assessment in place à la MV-65/MV-28). Do NOT invent a
new error channel if one already exists — thread the real failure through.

## Acceptance criteria

- [ ] A failed claim/OAuth return to `/assess` shows an honest, actionable state (not a
      blank or a silent `?new`-only render).
- [ ] A retry path exists and works.
- [ ] The happy path (`?new`, successful claim) is unchanged.
- [ ] Gate green; cover the failure branch with a test (mock the error param) + a live pass.

## Resume notes

- Path verified 2026-07-17: `app/(focused)/assess/page.tsx` exists;
  `app/(focused)/assessment/[id]/page.tsx` is the post-claim surface.
- MV-28 (anon results recovery) and MV-65 (persist-miss recover-in-place) are the nearest
  prior art — reuse their recovery pattern rather than a fresh one.

## Decision log

- **2026-07-28 — Hook point is the unified seam, not the page.** The real failure was already
  threaded to `/assess?error=…` by `resolveSignInDestination` (lib/auth/finish-sign-in); the
  page just ignored `?error`. Fixed there so Google OAuth, the email 6-digit code, and the
  email link (all converge on that seam post-PR#98) recover identically — no per-provider fork.
- **2026-07-28 — One catch-all `expired` was dishonest; split the legs.** `claimAndBootstrapProfile`
  returned a bare boolean, so purged, claimed-elsewhere, expired, and transient-DB-failure all
  rendered as "expired". Added a `reason` (`already-mine | claimed | expired | error`): the claim
  layer reads the row back (`getAssessmentClaimState`, admin/RLS-bypass so it can see another
  owner) to classify a miss. `claimAssessment` now throws a typed `AssessmentClaimError` on a DB
  error instead of collapsing it to "no row matched" — the MV-133 honest-failure idiom, so a
  transient outage is retryable, not a false "your work is gone".
- **2026-07-28 — A re-claim of your own row is a success, not a failure.** `already-mine` now lands
  the student on `/assessment/{id}` instead of `?error=expired` (fixes a latent false-failure for
  double sign-in within the 24h token TTL). No re-bootstrap / no duplicate lead.
- **2026-07-28 — Preserve anonymous work; recover in place à la MV-28/65.** The anonymous results
  live in `sessionStorage` and survive the OAuth round-trip (same tab). Extracted the storage key +
  id-reader to `lib/results/persisted-results` (shared with assess-flow, no drift). Recovery is
  tailored: anonymous (`auth`) → "Back to your results" to re-run sign-in; signed-in with the row
  still saved (`invalid-claim`/`claim-failed`) → finish the claim in place via a new
  `POST /api/assess/claim` that reuses the SAME `claimAndBootstrapProfile` (no second claim
  mechanism, no new error channel); terminal (`expired`/`claimed`) → explain honestly + fresh start,
  and clear the zombie sessionStorage entry for a deleted row.
- **2026-07-28 — Shared error-code contract.** `lib/auth/claim-error` is the single source for the
  `?error=` codes (producer = seam, consumer = page/UI); an unrecognised code renders the normal
  flow, so a typo can't silently re-open the dead end.

## Done evidence

- **Branch:** `mv-130-claim-recovery` (off `origin/master` @ f71c7f8).
- **Implementation commit:** `2ffe9bd` — feat(assess): honest recovery for failed assessment claims.
- **Failure legs handled** (each → honest state + a path forward, never a silent `?new` render):
  - OAuth/email code-exchange error → `?error=auth` (anonymous; results preserved, sign in again).
  - Invalid/tampered/expired claim token → `?error=invalid-claim` (signed-in; finish claim in place).
  - Transient DB failure mid-claim → `?error=claim-failed` (retryable; finish claim in place).
  - Assessment claimed by another account → `?error=claimed` (sign in with that account / start new).
  - Purged/missing/expired assessment → `?error=expired` ("expired and was deleted"; start new).
  - Re-claim of the user's own assessment → lands on `/assessment/{id}` (success, not an error).
- **Gate (all green, 2026-07-28):**
  - `npm run typecheck` — clean (tsc --noEmit).
  - `npm run lint` — clean (eslint).
  - `npm test` — 316 files, 2198 tests passing.
- **New/extended tests (every leg):** `tests/assessments/repo-claim.test.ts` (typed write error +
  `getAssessmentClaimState`), `tests/assessments/claim.test.ts` (reason classification incl. transient),
  `tests/auth/finish-sign-in.test.ts` (reason→destination mapping), `tests/api/assess-claim.test.ts`
  (recover-in-place endpoint), `tests/app/assess-fork.test.tsx` (page renders recovery per code),
  `tests/components/assess/claim-failure.test.tsx` (honest UI + retry per reason).
