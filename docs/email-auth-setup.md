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

**Both templates are code-only, with no sign-in link, deliberately.** GoTrue derives
a magic link's `token_hash` as an unsalted `sha224(email + otp)`
([`crypto.GenerateTokenHash`](https://github.com/supabase/auth/blob/master/internal/crypto/crypto.go)),
so for a known address it has exactly the same 1,000,000 preimages as the 6-digit
code — a link is not the high-entropy credential it looks like. Worse, a link is
redeemed by an unauthenticated `GET` carrying no address, so there is nothing to
count guesses against, making it an unmetered way around the per-address cap below.
The typed code is the only email path, and every guess at it is counted. **Do not
paste a `{{ .ConfirmationURL }}` or `token_hash` link back into these templates
without a guess counter that covers it.**

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

Ahead of Supabase, the app applies:

| Surface | Limit |
| --- | --- |
| `/api/auth/email/start` | 5 sends per IP per minute · 5 per address per hour |
| `/api/auth/email/verify` | 10 attempts per IP per minute |
| A single emailed code | **5 wrong guesses, then the code is retired** |

That last one is the load-bearing defence, and it is per **address**. Every other
limit here — including Supabase's own `token_verifications` (30 per 5 minutes) — is
per **IP**, which a rotating IP pool defeats: ~1,400 addresses would otherwise buy
roughly 500,000 guesses inside a code's one-hour life, against a 1,000,000 keyspace,
on the only credential an email-auth account has. Capping guesses per code brings
that to 5 per code and, since codes are capped at 5 per address per hour, 25 per
hour total.

Retiring a code is **not** an account lockout: the count is scoped to one code and
wiped whenever a new one is sent, so an attacker burning codes can never park a
student outside their own account — "send a new code" stays open. The trade-off it
does introduce is nuisance, not lockout: someone who knows an address can burn each
code as it is issued, forcing repeated resends. That needs a sustained, targeted
attack, and the student always has a route back in.

**These limits require Upstash.** `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
must be set in Vercel or every one of them silently no-ops — they fail open by design,
because refusing all sign-ins while Redis is unreachable would be a worse outage than
the exposure. Without Upstash, only Supabase's per-IP caps remain, and the
rotating-IP attack above is live. Treat Upstash as required for production email auth.

### The app cannot close this alone — two settings worth changing

`NEXT_PUBLIC_SUPABASE_ANON_KEY` ships in the browser bundle, as it must, and GoTrue's
own `POST /auth/v1/verify` accepts it. An attacker can therefore skip this app
entirely and guess codes straight at Supabase, where the per-address counter above
does not exist and only the per-IP `token_verifications` limit applies — the very
limit a rotating IP pool defeats. **The app-layer cap raises the cost of the easy
attack; it cannot bound the direct one.** Two `supabase/config.toml` settings (and
their dashboard equivalents) are what actually shrink that exposure, and both are
founder calls because they change the sign-in experience:

| Setting | Now | Effect of changing it |
| --- | --- | --- |
| `otp_length` | 6 | 8 digits multiplies the keyspace by 100 — a longer code to type |
| `otp_expiry` | 3600 | 600s cuts the guessing window 6× — more "code expired, send another" |

Enabling `[auth.captcha]` (hCaptcha/Turnstile) is the third lever, and the only one
that also protects GoTrue's endpoints directly, at the cost of a challenge in the
sign-in flow.

## Checking it end to end

1. Sign in with an address that has never been used → **Confirm signup** template.
2. Sign in again with the same address → **Magic Link** template.
3. Run an anonymous assessment, choose "No Google account? Use your email" from the
   results page, and confirm the assessment is still attached to the account
   afterwards — the email path must claim exactly what the Google path claims.
4. Sign in by email using the address of an existing **Google** account: Supabase links
   them by verified email, so it returns the same account rather than a second one.
   This is also the recovery path — there is no password to reset.
