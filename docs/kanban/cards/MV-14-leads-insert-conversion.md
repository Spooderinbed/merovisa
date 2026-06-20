# MV-14 — Wire lead-insert into the OAuth claim (`leads = 0` fix)

**Column:** In review · **Priority:** P1 · **Owner:** agent · **Gate:** human (founder live-smoke)
**Created:** 2026-06-20 · **Entered review:** 2026-06-20

## Why

Live DB had **46 assessments, 5 claimed profiles, but 0 leads**. The §1 DB audit
flagged this as a funnel signal, and the Phase-0 plan asked us to "instrument the
funnel … to learn where `leads = 0` breaks."

Investigation (read-only, this session) found the break by code, not by telemetry:

- Conversion is **OAuth-only**. Every anonymous-results CTA
  (`ConversionPrompt`, `ConversionPaths`, `UniversityMatches` unlock) calls
  `startClaimOAuth` → `/api/results/sign-claim` → Google OAuth →
  `/auth/callback?claim=…` → `claimAndBootstrapProfile` (claims assessment +
  bootstraps profile). `ConversionPaths` even states there is **no** email-capture
  path.
- `createLead` (the only writer to `leads`) is called **only** by `POST /api/leads`,
  and `POST /api/leads` is called **only by tests** — no runtime caller anywhere.
- So the `leads` table could never receive a row in production. `leads = 0` was a
  **wiring gap**, not a conversion or tracking failure. The real conversions show
  up as `profiles` (5) + claimed `assessments`; the lead-insert step was orphaned.

The CTA wiring half of the Phase-0 conversion item (MV-D0 / task #8) was already
shipped earlier; this card is the remaining funnel-bottom wiring.

## What shipped

Record a lead at the moment of successful claim — the funnel-bottom signal that an
anonymous assessment became an account.

- `lib/assessments/claim.ts` — `ClaimAndBootstrapInput` gains `email?`. After a
  successful claim (and the existing profile bootstrap + `is_primary` update),
  `claimAndBootstrapProfile` calls the existing idempotent `createLead(adminDb,
  { email, assessmentId })`. **Best-effort:** wrapped in try/catch with a structured
  `console.error` on failure — the user is already converted, so a lead-write
  failure must never block their login/redirect. Skipped when no email is present.
- `app/auth/callback/route.ts` — passes the authed Google `email`
  (`data.user?.email`) through to `claimAndBootstrapProfile` alongside `googleName`.

Reuses the existing validated write path: `createLead` upserts on
`(assessment_id, email)` with `ignoreDuplicates`, so a re-claim/retry never
duplicates. **No DB schema change.** No new PII category — `leads.email` is a
purpose-built column, the row is service-role-only (RLS, no policy), and the email
is the one the user just authenticated with (already in `auth.users`); it never
touches a URL, query param, or client log.

### Deliberately NOT done
- **No `oauth_started` client analytics event** (was in the directive's funnel
  list). `signInWithOAuth` redirects to Google immediately, so a `track()` right
  before it routinely loses the event to the navigation flush; `gate_cta_clicked`
  already fires on that same click. Funnel is observable end-to-end via the
  existing client events (`wizard_completed` → `assessment_viewed` →
  `gate_cta_clicked`) + the now-non-zero `leads`/`profiles`/claimed-`assessments`
  row counts + the server error log on lead-insert failure. (Founder may overrule.)
- **`POST /api/leads` left in place** — it was already orphaned before this change
  (not an orphan we created), and could back a future email-gate. Flagged, not deleted.

## Acceptance criteria

- [x] A successful OAuth claim records exactly one `leads` row (`email` + `assessmentId`).
- [x] No lead recorded when the claim fails (expired / wrong owner).
- [x] No lead recorded when the authed user has no email.
- [x] A lead-insert failure never changes `claimed:true` or blocks the redirect (best-effort + logged).
- [x] Idempotent: a re-claim does not duplicate (existing upsert guard).
- [x] No DB schema change; no scoring/golden change; F16 untouched.

## Test evidence (TDD, failing-test-first)

- RED → GREEN, `tests/assessments/claim.test.ts` (+4): records a lead on success;
  not on claim-fail; not without email; best-effort on insert failure.
- RED → GREEN, `tests/api/auth-callback.test.ts`: callback passes `email` through.
- Gate green: **typecheck clean · lint 0 errors** (1 pre-existing unrelated
  `build.mjs` warning) · **full suite 1253/1253** (+4).

## Founder-owed (gate to Done)

- **Live smoke** (cannot be proven headlessly — needs a real Google OAuth round-trip
  + Supabase): complete an anonymous assessment → unlock/Continue with Google →
  confirm a `leads` row lands with your email + the assessment id, and the redirect
  still goes to `/assessment/<id>`.
- Confirm the design call: recording the authed email into `leads` at conversion is
  the intended funnel-bottom record (vs. treating `profiles` as the sole conversion
  record and retiring `leads`). Easy to revert if not.
