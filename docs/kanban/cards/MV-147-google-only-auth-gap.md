# MV-147 — Non-Google sign-in: email auth so students without a Google account can save/recover (audit F-6)

**Priority:** P0 · **Owner:** agent (auth-method choice wants a founder nod)
**Findings source:** 2026-07-10 comprehensive audit, convergent finding **F-6**
(`docs/audits/2026-07-10-comprehensive/REPORT.md`) — flagged there as *"Not on the board."*
Carded 2026-07-20 during a board-coverage reconciliation.

## The gap

Sign-in is **Google-only** — `components/auth/auth-card.tsx:38-63` renders "Email sign-in isn't
ready yet." Every trust-critical conversion hangs off it:

- **Saving** an assessment before the 3-day expiry
- **Converting** anonymous → account
- **Every `(app)` route** (dashboard, profile, matches, plan, documents, guide)
- **The only anonymous-recovery path** (claiming a result after sign-in)

A prospective student in Nepal without a Google account — or unwilling to hand Google their study
plans — hits a wall at the exact conversion moment. For a product whose north star is *replacing the
consultancy*, forcing one specific US identity provider is a straight bounce.

## Why P0

Not data-corruption, but it caps conversion for an entire segment and removes the sole recovery route
for anonymous users — the highest-intent moment in the funnel. Both audits found it independently and
rated it **P0**.

## Fix direction (not yet built)

Add a non-Google email path via **Supabase Auth**. Magic link / email OTP is the lowest-friction,
password-free option and matches the existing OAuth-callback claim flow. Wire it into the **same**
`/auth/callback` → claim/bootstrap path Google uses so saving, converting, and anonymous-recovery all
behave identically — do **not** fork the claim path (mirror the MV-145 lesson: one mapping, one source
of truth).

- Supabase Auth sends its **own** OTP/magic-link emails, so this does **not** hard-depend on the
  app-level transactional-email infrastructure that audit **F-7** flags as absent — only production
  deliverability (custom SMTP / verified sender) is a founder/ops step before launch.
- Preserve the anonymous-recovery contract: an email-auth user must land back on their claimed
  assessment exactly as the Google path does.

## Founder decision

- **Auth method:** magic link vs email OTP vs email+password. Recommend **magic link / OTP** — no
  password to store or reset, least friction. One founder nod.
- New auth entry must not bypass the F-2 privacy/consent + age/guardian gate (MV-05) — coordinate.

## Acceptance criteria (for the eventual build slice)

- [ ] A user with no Google account can create an account and sign in via email.
- [ ] Email sign-in claims an anonymous assessment identically to Google (same landing, same claimed row).
- [ ] Every `(app)` route and the save/convert CTAs work for an email-auth session.
- [ ] The "Email sign-in isn't ready yet" dead affordance is gone.
- [ ] RLS/session parity with the Google path (no privilege drift).

## Out of scope

- App-level transactional email (reminders, deliver-a-copy) — audit **F-7** (journey umbrella).
- The privacy/terms/consent gate — audit **F-2** / MV-05.

## Resume notes (for a cold agent)

- Entry points: `components/auth/auth-card.tsx:38-63` (disabled email branch),
  `app/auth/callback/route.ts` (claim flow), `lib/assessments/claim.ts`.
- Email and Google must **converge** on the claim/bootstrap path, not fork it.
- Coupled to F-7 only for production email deliverability, not for the auth mechanism itself.
