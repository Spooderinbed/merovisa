# MV-39 — Outcome self-report control (advance the funnel past Applied)

**Status:** IN REVIEW — SHIPPED 2026-06-25 on branch `mv-39-outcome-self-report` (PR-flow; first slice under the branch+PR operating model). Founder closes to Done after merge.

Relates to: [[MV-33]] (Part B, carved out 2026-06-25), [[MV-34]] (the Applied-freeze disclosure on the capture trigger), [[MV-08]] (the backend this drives + the out-of-scope verification ladder). Evidence: product-review audit `wf_5fb5dfa7-009`.

## Problem

The "Your applications" outcome funnel could only ever show **Applied**. The whole backend was already built + tested — `/api/outcomes/event` route, the legal-transition state machine (`lib/outcomes/state-machine.ts`), the repo, and the read-side fold (`lib/outcomes/funnel.ts` `deriveFunnelStage`) — but the route had **zero client callers**. The only event the live app writes is the root `applied` (`lib/outcomes/on-apply.ts`), so every row was frozen at the first stage. MV-33 Part A reconciled the subtitle to stop over-promising; Part B (this card) wires the missing UI affordance so stages actually advance.

## What shipped

A per-row **self-report control** on the funnel: one button per legal next milestone, in student voice. A click appends a `self_reported` event and the row advances.

1. **`lib/outcomes/state-machine.ts`** — new pure `selfReportNextEvents(prior: EventType[]): EventType[]`. Filters a journey-ordered candidate set (`offer_received → application_rejected → offer_accepted → coe_issued → visa_lodged → visa_granted → visa_refused → enrolled`) by `canRecordEvent`, so the control only ever offers steps the API will accept — **a shown button can never 409**. The silent root `applied` and the quiet `withdrawn` / `conditional_offer` branches are deliberately excluded from the button set. Empty at a terminal outcome and before `applied`.
2. **`lib/outcomes/funnel.ts`** — `OutcomeFunnelRow` gains `nextEvents: EventType[]`, computed in `buildOutcomeFunnel` from the attempt's events. No new data fetch — the dashboard already passes `buildOutcomeFunnel(...)` straight into `<OutcomeFunnel>`, so this flows through for free. The state machine stays server-side (architecture rule); the client receives only the resolved legal next steps.
3. **`components/outcomes/outcome-self-report.tsx`** (new, `"use client"`) — renders a button per `nextEvents` entry via a founder-reviewable `EVENT_LABEL` map (student voice: "I got an offer", "I wasn't successful", "I accepted my offer", "I got my CoE", "I lodged my visa", "My visa was granted", "My visa was refused", "I enrolled"). POSTs `{ attemptId, eventType, occurredAt }` to `/api/outcomes/event`; `router.refresh()` on success (server re-derives the row → new stage + new `nextEvents`); inline reach-coloured error on failure; renders `null` when there is no legal next step (second guard after the server filter — also drops any label-less event handed to it). Calm/flat styling per the design language (thin-border pills, no shadow).
4. **`components/outcomes/outcome-funnel.tsx`** — `OutcomeRow` renders `<OutcomeSelfReport attemptId nextEvents />` below the verdict line (server component rendering a client child).

**Banded verdicts only, no raw %.** No scorer path touched.

## Test plan / evidence (TDD RED→GREEN, +16)

- `tests/outcomes/state-machine.test.ts` (+8): `selfReportNextEvents` per stage — the offer/rejection fork at Applied; one-legal-step walk up the admission→visa chain; both visa decisions once lodged; enrolment after a grant; **empty at every terminal**; never emits `applied`/`withdrawn`; empty before the application is recorded (defensive).
- `tests/outcomes/funnel.test.ts` (+1): `buildOutcomeFunnel` attaches the correct `nextEvents` per row (applied-only → `[offer_received, application_rejected]`; through-offer → `[offer_accepted]`).
- `tests/components/outcomes/outcome-self-report.test.tsx` (+5, new): button-per-milestone with human labels; **nothing rendered when no legal step**; POSTs to `/api/outcomes/event` with the right body + `router.refresh()` on 201; **no refresh + visible error** on a failed POST (409); label-less events render no button.
- `tests/components/outcomes/outcome-funnel.test.tsx` (+2): the control's buttons appear on a row with legal next steps; **no control at a terminal stage**. (Factory gains `nextEvents`; file mocks `next/navigation` for the new client child.)

**Gate green:** `npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing warning in `docs/kanban/build.mjs`, unrelated) · full suite **1361 passed** (231 files), 0 failures · goldens **N/A** (no scorer path).

Note: the full suite ran with the founder's uncommitted `design/phase-a-polish` WIP also in the tree (it too was green); the **pushed branch contains only master + this slice** (8 files), so the Vercel preview builds clean and a fresh checkout is unaffected.

## Out of scope (do NOT add here)

- The **verification ladder** — `classifyEvidence` + forward-to-address/DKIM + admin/VEVO promotion to `document_verified`/`official_verified`. Legal-gated, separate MV-08 slice. Every self-report stays `self_reported` (stamped server-side).
- **Reason codes** on rejection/refusal (the schema allows omitting them) — a richer "why" picker is a later slice.
- A **correction / undo** affordance (events are append-only; corrections supersede via `supersedes_event_id`).

## Founder-owned residuals (not blockers)

- **Merge the PR to master** (the single founder-gated step under the new flow) → then close this card to **Done**.
- **Copy sign-off** on the eight `EVENT_LABEL` strings (student-voice; tweak anytime in `outcome-self-report.tsx`).
- **Placement** — currently on the dashboard funnel row; optionally mirror onto the program card later (the MV-22 parity pattern).
- **`conditional_offer` / `withdrawn`** as explicit buttons if wanted (intentionally omitted for a tight MVP).

## How a cold agent resumes

Backend is fully built+tested; this slice is UI-only. The legal next steps are derived once, server-side, in `selfReportNextEvents` and attached to each funnel row — the client just renders + POSTs. If extending: add the new milestone to `SELF_REPORTABLE` (state-machine), give it an `EVENT_LABEL` (component), and the funnel surfaces it automatically.
