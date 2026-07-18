# MV-41 — Conversion seam: kill the silent `id:null` dead-CTA

**Priority:** P0 · **Owner:** agent
**Branch:** `mv-41-dead-cta` · **Shipped:** 2026-06-26
**Spec:** `docs/audits/2026-06-25-design-division-polish-audit.md` #2 (re-flagged from the 2026-06-23 real-user audit)

## North-star fit

The app exists so a Nepali student never needs a local consultancy. Every place the
self-serve journey fails the student is a bounce point back to one. A student who
finishes the wizard, sees their verdict, and then meets a **greyed-out "Continue with
Google" button under a "Keep your assessment — expires in 3 days" headline** reads the
product as broken at the exact moment of trust — and bounces. This is a journey-completeness
fix, not a feature.

## Verify-first (done before building — per the MV-17 hallucination lesson)

The audit flagged the **server**: `/api/assess` "returns 200 with `id:null` on a persist
miss → silently disables save CTAs." Read of current `app/api/assess/route.ts` (lines
119–146): **that server residual is already closed** by MV-28/31/32 —

- Anonymous persist miss is **logged** (`console.error("[/api/assess] anonymous assessment persist failed")`) and the route **still returns the payload** so the results page renders. The `id:null` is intentional for the ephemeral (3-day) anon assessment.
- A signed-in persist failure correctly returns **500** (`persistFailed && user`).

So the only live residual is **client-side**: the two anonymous conversion components
mishandle `assessmentId === null`.

## The actual bug

`components/results/conversion-paths.tsx` (bottom card) and
`components/results/conversion-prompt.tsx` (compact verdict-area strip) both rendered:

```tsx
<Button onClick={() => void startClaimOAuth(assessmentId)} disabled={!assessmentId}>
  Continue with Google
</Button>
```

under **"Keep your assessment — Your assessment expires in 3 days …"** copy. When the anon
insert fails (`id:null`):

1. The button is **silently disabled** — a dead CTA with no explanation.
2. The **"expires in 3 days" promise is false** — nothing was saved, so there is nothing
   to expire; it'll be gone the moment the page is closed.
3. `startClaimOAuth(null)` is a no-op anyway (early-returns), so even an enabled button
   would do nothing.

## Fix (shipped)

On `assessmentId === null`, both components now drop the dead button **and** the false
expiry, and show honest copy + a real recovery:

- **ConversionPaths:** headline "We couldn't save this assessment", body explaining the
  results above are still accurate but were not saved, and a **"Run it again"** link to
  `/assess?new=1` (forces a fresh wizard run — the one truthful recovery).
- **ConversionPrompt:** compact "We couldn't save this assessment, so it won't be kept.
  Run it again to try saving it." + the same `/assess?new=1` link.
- Removed the now-dead `disabled={!assessmentId}` from the happy-path buttons (the null
  case never reaches them).

### Deliberate scope decision — no email-to-self / copy-link path

The original card summary proposed "add a no-account copy-link / email-to-self path." We
**did not** build that: MyVisa has **no email-delivery or anonymous-retrieval system**
(confirmed decision — see the Gmail-outcome-capture feasibility rejection and the existing
ConversionPaths comment "there is no email-delivery or anonymous-retrieval path, so we
don't imply one"). Offering "email me my results" would fabricate a feature that doesn't
exist — a trust-first violation. Re-running the assessment is the only honest recovery, so
that is the only recovery we offer.

## Acceptance criteria

- [x] No silently-disabled conversion CTA when `assessmentId` is null.
- [x] No "expires in 3 days" / "Keep your assessment" promise shown when nothing persisted.
- [x] An honest "couldn't save" message is shown instead.
- [x] A real, working recovery action (`/assess?new=1`) is offered.
- [x] Success path (real `assessmentId`) unchanged: keep-it copy + enabled Google button.
- [x] No fabricated retrieval/email path.

## Test evidence (TDD)

- `tests/components/conversion-paths.test.tsx` — replaced the obsolete "disables the Google
  button" test with two null-state tests (honest message + no dead button + no false
  expiry; recovery link → `/assess?new=1`).
- `tests/components/conversion-prompt.test.tsx` — same two null-state tests + an
  enabled-button assertion for the success path.
- `tests/components/results.test.tsx` — the core-path render now passes a real
  `assessmentId` (a persisted assessment is the scenario where the 3-day-expiry copy
  legitimately shows); id:null is covered by the component tests above.
- Red confirmed first (4 failing), then green.

## Gate

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors (1 pre-existing warning in `docs/kanban/build.mjs`, untouched).
- Full suite — **1397 passed (235 files)**, was 1396.
- Goldens — N/A (no scoring-engine path touched).
- Banded verdicts only / no raw % — unaffected.

## Founder review

- **Copy:** "We couldn't save this assessment" / "Run it again" wording.
- **Optional follow-up (not built):** whether to also offer account-creation in the
  id:null state (sign in, then re-run under the account). Left out for simplicity — re-run
  already recovers the goal, and account creation here lands on an empty dashboard.

## Files touched

- `components/results/conversion-paths.tsx`
- `components/results/conversion-prompt.tsx`
- `tests/components/conversion-paths.test.tsx`
- `tests/components/conversion-prompt.test.tsx`
- `tests/components/results.test.tsx`
- `docs/kanban/board.json` + regenerated `board.md` / `board.html`
