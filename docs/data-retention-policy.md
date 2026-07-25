# Data retention policy — MyVisa

Date: 2026-07-25
Status: **Anonymous-path window AWAITING FOUNDER SIGN-OFF** (proposed in MV-135, card
MV-135 / audit finding O-2). The account-holder half restates founder decision D2 and is
unchanged. Nothing here is user-facing copy — see `docs/legal/` for that.

This policy exists because the 3-day "expiry" was never a deletion. Past `expires_at` both
`getRecoverableAssessment` and `claimAssessment` refuse the row, so the assessment looked
gone to the student — while the row itself, a full profile snapshot carrying family
finances, education history and (since MV-139) prior visa refusals, stayed in the table
forever, for a person who never created an account and had no way to delete it. The danger
is not that we keep too little; it is that "expires" quietly meant "becomes invisible."

## The rule

**An unclaimed anonymous assessment is destroyed when it expires — the expiry date the
student is already shown IS the deletion date.**

- The window is 3 days from creation, derived in code from `ASSESSMENT_TTL_DAYS` so the
  promise and the purge cannot drift apart if that TTL ever changes.
- The student is already told one number, verbatim, on the results page: "Your assessment
  expires in 3 days (by Jul 12)." Setting deletion anywhere else would force the product
  to teach a second number, and a retention rule that needs two numbers has stopped being
  a promise and become small print.
- The daily job means real deletion lands 0–24h after expiry. That lag must stay in the
  **safe** direction: the displayed expiry is a Kathmandu calendar date with no time, so
  "by Jul 12" has to mean "on or before." Never move the purge to a pre-emptive or
  more-aggressive schedule that could delete a row while its displayed date is still today.
- Disclose it as "expires in three days and is deleted within a day of expiring," never as
  an exact hour.

## Why not longer

**Every day past expiry is retention for a purpose the product does not have.**

The end of purpose is not a judgement call here — it is enforced twice in code, and the
HMAC claim token's 24h TTL is shorter than the assessment's 3 days, so nothing in flight
can ever need an expired row. A longer window is therefore not "recovery grace": it is
holding a student's finances and refusal history for no reason anyone can name, which is
what APP 11.2 forbids. It is also the line a competing consultancy writes for free — "they
tell you it expires in three days; read the small print."

A forensic window was considered and rejected **for now**. It would only pay for itself if
a student could report that their results vanished and someone could act on it; today
there is no support inbox, no expiry-aware error page, and both read paths refuse the row
even before it is deleted, so nothing is recoverable anyway. Revisit this the moment a
real support channel exists — retention is not a substitute for database backups.

## What is out of scope

**This policy governs unclaimed anonymous assessments only. It does not reopen the
retention question for people who created an account.**

Account-holder data continues under founder decision D2
(`docs/legal/2026-06-20-mv-05-legal-copy-packet.md`): retain while the account exists,
delete when the user deletes it, no automatic time-based deletion. D2 was written entirely
around "as long as your account is active," which never described someone who never made
an account — that gap is what this document fills, and nothing more.

## The captured email lives and dies with its assessment

**When an assessment is purged, any `leads` row attached to it goes with it. Do not
intervene.**

- The schema already does the right thing: `leads.assessment_id` is `ON DELETE CASCADE`,
  so preserving the address would mean affirmatively writing code to defeat a foreign key.
- An email captured beside an anonymous assessment was given so we could send that
  assessment back. Once the assessment is destroyed the purpose is gone, and an orphan
  address is one an anonymous person has no authenticated way to ask us to erase.
- Deciding this now costs nothing: `POST /api/leads` has no runtime caller, and the only
  live writer (`lib/assessments/claim.ts`) fires on rows that have just become owned and
  are therefore never purged. It will never be this cheap to commit to.
- **Standing rule for when magic-link email ships:** the address must not be copied to a
  contacts or marketing table ahead of the purge, and must not be "de-identified and kept"
  — a copy taken before deletion makes the sentence we show the student untrue. If it
  needs to outlive one assessment, it gets its own window, its own consent, and its own
  delete path; it never silently inherits this one.

## How it runs

**The cron is only a trigger. The policy and the delete predicate live in the Next.js
codebase**, per the architecture rule that business logic never moves into a database
function or trigger.

- `vercel.json` schedules a daily GET of `/api/cron/purge-anonymous` at 21:15 UTC
  (03:00 Nepal time — the corridor audience's quietest hour).
- The route authorises a `CRON_SECRET` bearer token with a timing-safe compare and
  **fails closed**: an absent or wrong secret returns a bare 404 and deletes nothing.
  Deliberately unlike `lib/rate-limit/upstash.ts`, whose fail-open shape is right for a
  limiter and catastrophic for a delete trigger. A missing secret is logged, because the
  failure mode of a fail-closed gate is a purge that silently stops running.
- `?dryRun=1` reports what would be deleted and deletes nothing. **Use it for the first
  production run**, read the counts once, then arm the schedule.
- Each run is bounded (500 rows) and reports `truncated` when it fills the batch, so a
  backlog is never capped silently.
- The run logs `{ scanned, purged, skipped, truncated }`. Those counts are the only record
  that outlives the rows — the funnel denominator must come from them and from PostHog,
  never from retained personal data.

## The guard that must never be removed

**`owner is null` is load-bearing. A purge keyed on expiry alone would delete the data of
exactly the students who signed up.**

A successful claim updates only `{ owner, claimed_at }` — it never extends `expires_at`.
So every converted user's assessment permanently carries a past expiry, indistinguishable
on time alone from an abandoned one. The purge therefore requires all three of:

- `owner is null` — keeps every converted user's data;
- `expires_at < now` — never destroys anything the visitor could still open;
- `created_at < cutoff` — `created_at` is set by the database default, so a corrupted or
  clock-skewed `expires_at` cannot bring a deletion forward.

Each is applied twice, on the scan and again on the delete, with an app-layer re-check in
between: two independent filters must both regress before an owned row can be destroyed.
`tests/assessments/purge.test.ts` and `tests/integration/anon-purge.itest.ts` pin this.

The clean root fix is to set `expires_at = FAR_FUTURE` on claim so the two guards can never
disagree — plus a backfill for rows already claimed under the current behaviour. That is
deliberately **not** in MV-135: it changes the claim path, the most sensitive flow in the
app, and belongs in its own slice.

## What this policy does not claim

**Say plainly what we cannot do, rather than implying protection we do not have.**

- **No minor-specific handling.** There is no date-of-birth or guardian-consent field in
  the schema, so we cannot identify which anonymous rows belong to a minor. That is an
  argument for one uniform short window, not for a tiered promise we cannot keep.
- **No self-serve delete-now.** An anonymous visitor still cannot delete their assessment
  on demand; they can only wait out the three days. Every delete control in the app is
  behind sign-in. A "delete this now" affordance on the results page is the stronger
  posture and is not built.
- **Retention is not recoverability.** Even before deletion, both read paths refuse an
  expired row, so "it still exists" never means support can restore it without a manual
  admin write. Do not tell a student otherwise.

## Adjacent, not settled here

- `app/(marketing)/trust/page.tsx` promised a 12-month post-deletion retention that was
  implemented nowhere, while `app/api/account/delete/route.ts` deletes immediately. MV-135
  corrects that paragraph; the wider `/privacy` + `/terms` work stays with MV-05 / F-2.
- The `2026-06-04` onboarding spec still asserts a 2-year retention. It is a superseded
  planning document, not policy; this file governs.
- **Data residency is an open MV-05 founder fact, not settled here.** The trust page says
  student data is hosted "in Australian and EU regions"; the live Supabase project is in
  `ap-southeast-1` (Singapore). Correcting that needs a founder decision — move the
  project or change the claim — and is out of MV-135's scope.

## Default

When a retention question has no answer yet, the safe default is the shorter window and
the plainer sentence. If we cannot say what a piece of personal data is still for, we do
not keep it.
