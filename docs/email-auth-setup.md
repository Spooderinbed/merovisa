# Email sign-in — Supabase setup (MV-147)

Email sign-in ships as code and needs **no database migration**. It does need four
things set on the hosted Supabase project before it works in production. Until they
are set, Google sign-in keeps working exactly as before and the email path fails
visibly (an honest "we couldn't send your code" rather than a silent dead end).

The local stack is already configured — `supabase/config.toml` and
`supabase/templates/` in this repo carry the same settings for `supabase start`.

## 1. Enable the email provider

**Authentication → Providers → Email**

- **Enable email provider:** on
- **Confirm email:** **on**

"Confirm email" must be on. With auto-confirm, GoTrue can settle a first-time email
signup without mailing anything, and the student waits on the code screen for a code
that was never sent.

Nothing else in that panel matters — there are no passwords in this flow.

## 2. Paste both email templates

**Authentication → Emails → Templates**

Copy the file contents into the matching template, subject `Your MeroVisa sign-in code`:

| Template | File |
| --- | --- |
| Magic Link | `supabase/templates/magic-link.html` |
| Confirm signup | `supabase/templates/confirm-signup.html` |

Both are needed: Supabase uses **Confirm signup** for an address it has never seen
and **Magic Link** for one it already knows — the same moment from the student's
side, two templates on Supabase's.

The stock templates send only a link to GoTrue's own `/verify` endpoint, which hands
the session back in a URL fragment that a server-side callback cannot read. Ours
carry the 6-digit code plus a link addressed to `/auth/callback` with a `token_hash`
the callback verifies. The typed code works either way; **the link only works with
these templates in place.**

## 3. Allow the callback URL

**Authentication → URL Configuration → Redirect URLs**

Add `https://<production-domain>/auth/callback` (and any preview domain in use).
Supabase refuses to redirect anywhere not on this list, which would break the emailed
link. Confirm `NEXT_PUBLIC_SITE_URL` is set in Vercel to the same origin — it is what
the app builds the emailed link from.

## 4. Custom SMTP before launch

**Project Settings → Authentication → SMTP Settings**

Supabase's built-in sender is rate-limited to a few emails per hour and is only meant
for development — on the default sender, real students will silently stop receiving
codes. Point it at a verified sending domain (SES, Resend, Postmark, SendGrid) before
any real traffic, and raise **Authentication → Rate Limits → Emails per hour** to
match. This is the one item that is genuinely blocking for launch rather than for
testing; it is the same dependency the 2026-07-10 audit tracks as **F-7**.

## What the app already limits

The app rate-limits ahead of Supabase, so a misconfigured or absent Upstash does not
open the door: 5 send requests per IP per minute and 5 per address per hour
(`/api/auth/email/start`), and 10 verification attempts per IP per minute
(`/api/auth/email/verify`). Supabase's own per-address frequency cap sits behind that.

## Checking it end to end

1. Sign in with an address that has never been used → **Confirm signup** template.
2. Sign in again with the same address → **Magic Link** template.
3. Run an anonymous assessment, choose "No Google account? Use your email" from the
   results page, and confirm the assessment is still attached to the account
   afterwards — the email path must claim exactly what the Google path claims.
4. Sign in by email using the address of an existing **Google** account: Supabase links
   them by verified email, so it returns the same account rather than a second one.
   This is also the recovery path — there is no password to reset.
