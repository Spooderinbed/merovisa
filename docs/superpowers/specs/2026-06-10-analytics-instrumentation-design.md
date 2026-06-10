# Analytics instrumentation — design spec

**Date:** 2026-06-10
**Status:** APPROVED by user 2026-06-10, implemented same day (Phase 2b parallel slice per `docs/audits/2026-06-10-data-governance-and-triage.md`). As-built deviations in "Implementation notes" below.
**Why now:** the triage lane chooses the next product slice from evidence; today there is zero usage signal. PostHog is named in the stack (`.env.example` already carries `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`) but no code exists.

## Problem

We don't know what users actually read or use: whether the refusal-risk panel gets read, whether
source links (the trust mechanism) get clicked, whether plan items get acted on, where the wizard
loses people. Every product-lane decision is currently taste, not evidence.

## Decisions

1. **Provider:** `posthog-js`, initialized in one client component (`components/analytics/analytics-provider.tsx`)
   mounted from the root layout. **No-op when `NEXT_PUBLIC_POSTHOG_KEY` is absent** (dev/test/CI emit
   nothing); host from `NEXT_PUBLIC_POSTHOG_HOST`.
2. **Explicit catalog only — autocapture off, session recording off.** Autocapture hoovers DOM text
   and would violate "no sensitive data in client-side logs" by construction. `capture_pageview: true`
   (standard pageviews are fine — routes carry no sensitive params, an existing architecture rule).
3. **One typed catalog** `lib/analytics/events.ts`: a discriminated union of event payloads + a thin
   `track(event)` wrapper (the only call surface). Payload fields are ids, kinds, enums, booleans,
   counts — **never names, free text, scores, emails, or URLs with params**.
4. **Identity:** on signed-in mount, `posthog.identify(<supabase user id>)` — the UUID only, no
   email/name properties. Anonymous wizard traffic stays anonymous; PostHog's native aliasing ties
   the pre-signup events to the account at identify time.
5. **v1 events (10):**
   | Event | Trigger | Props |
   |---|---|---|
   | `wizard_step_viewed` | step mount | `step` (id) |
   | `wizard_completed` | submit before redirect | `destination` |
   | `assessment_viewed` | results mount | `mode` ("anonymous"\|"owned"), `band` (verdict band) |
   | `source_link_clicked` | any SourceLine anchor | `surface` ("refusal-recovery"\|"policy-banner"\|"checklist"\|"plan"\|"matches"\|…), `domain` |
   | `gate_cta_clicked` | anonymous results gate CTA | — |
   | `dashboard_cta_clicked` | prompt-card CTA | `state` ("next"\|"waiting"\|"caught-up"), `kind?` |
   | `plan_action` | card mutation success | `kind`, `action` ("done"\|"dismissed"\|"started"\|"reopened") |
   | `checklist_item_toggled` | toggle success | `key`, `checked` |
   | `checklist_plan_link_clicked` | "Track in your plan →" | `key` |
   | `signed_in` | first authed mount per session | — |
6. **The trust question this must answer** (ties to the read-through/triage lane): do users open the
   refusal panel's sources, and does the dashboard next-step get acted on? `source_link_clicked.surface`
   and `plan_action` are the two events the lane reads first.
7. **No server-side events in v1.** No consent banner for v1 (no EU targeting; revisit before any EU
   launch); `respect_dnt: true`.

## Out of scope

PostHog dashboards/funnels (UI-side), server events, A/B flags, session replay, marketing attribution.

## Implementation notes (as built, 2026-06-10)

- **v1 ships 9 of the 10 events.** `checklist_item_toggled` is deferred: no toggle exists in the
  product — checklist document status derives from the vault, and step completion mirrors the plan
  (plan-links; "the plan stays the only place that completes these"). A catalog entry that can never
  fire would be decoration; the event ships when a real toggle ships.
- `source_link_clicked.surface` is a closed enum of the five surfaces that actually render outbound
  source anchors: `factor-bars` | `refusal-recovery` | `cost-to-apply` | `checklist` | `matches`.
  PolicyBanner renders facts without links, and plan cards carry no source line, so the spec's
  illustrative "policy-banner"/"plan" surfaces don't exist yet.
- `dashboard_cta_clicked.state` includes the fourth real prompt state, `profile-incomplete`.
- `gate_cta_clicked` fires at both anonymous-results gates: the blurred teasers and the locked
  university-matches unlock button.
- `capture_pageview: "history_change"` (not bare `true`) so App Router client-side navigations
  count as pageviews.
- Call surfaces: one client leaf `components/analytics/source-anchor.tsx` carries all outbound
  source links (panels stay server components); `identify` + `signed_in` mount from the `(app)`
  shell via `components/analytics/identify-user.tsx`, once per page session, UUID only.

## Acceptance criteria (tests)

1. `track()` is a silent no-op when the key is absent (no posthog import side effects in tests).
2. The catalog type rejects unknown event names/props at compile time (typecheck is the test).
3. Mocked-posthog assertions on three representative surfaces: SourceLine click (`surface`+`domain`),
   plan card action (`kind`+`action`), dashboard CTA (`state`).
4. No payload field carries free text — catalog review pinned by a unit test walking the union's
   prop types (string literals/enums only, except `domain`/`key`/`kind`/`step` ids).
5. Provider mounts without the key → zero network calls (asserted via fetch spy in a jsdom test).
