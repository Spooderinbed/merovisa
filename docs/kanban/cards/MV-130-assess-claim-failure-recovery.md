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
