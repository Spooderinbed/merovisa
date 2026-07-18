# MV-73 — Progression visual #15: outcome-funnel journey rail

**Priority:** P1 · **Owner:** agent · **Branch:** `mv-73-outcome-funnel-rail` (off master)

Third sub-slice carved out of the over-scoped **MV-45** umbrella (after MV-71 + MV-72).
Design-division audit **#15**. Design **Codex-locked (gpt-5.5, Option A)** before build.

## Why (student outcome)

The signed-in dashboard's "Your applications" rows showed a single stage **badge**
("Offer received", "Visa lodged") but no **journey** — a student couldn't see at a glance
*where they are* on the path from application to visa, or *what's left*. A calm rail makes
the whole arc legible without a consultancy call: one less self-serve dead-end.

## Scope

A flat four-step **journey rail** per application row, on the canonical happy path
**Applied → Offer → Visa lodged → Granted**:

- **Slot:** its own line *under* the `[program · stage badge]` line and *above* the
  `[verdict · intake · updated]` meta. The existing stage **badge stays**; the MV-39
  self-report buttons stay **last**.
- **Step states:** reached = filled teal dot (`bg-strong`); current (furthest reached) =
  filled + a thin ring; upcoming = hollow faint dot (`border-line`).

### Honest terminal states (Codex Option A — the trust-critical part)

The rail **STOPS** at an exit marker and **never lights an unreached `Granted`**:

- **Rejection** → fill Applied, **red hollow** exit dot at the Offer position labelled
  **"Rejected"**, later steps faint.
- **Visa refused** → fill Applied/Offer/Visa lodged, **red hollow** exit dot at the Granted
  position labelled **"Refused"** (the word *Granted* never appears).
- **Withdrawal** = the student's *own* choice, **not** a failure → **neutral grey** hollow
  exit dot (never red), placed one step past the furthest milestone reached, labelled
  **"Withdrawn"**.
- **No inferred steps** — a step fills only when the event stream confirms it.

### Trust + data honesty

Data is the **real DB event stream** (`outcome_events`, RLS-scoped, per-attempt) — **zero
fabrication**. The rail derives only from which milestones the events confirm.

### Plumbing (the build-time catch)

`OutcomeFunnelRow` previously carried only the single derived `stage`, which **loses a
withdrawal's pre-exit position** (a "withdrawn" stage can't say *what* they withdrew from).
Fixed by carrying `events: EventType[]` onto the row (`buildOutcomeFunnel` now attaches each
attempt's reached event types), so the rail knows the furthest milestone reached before an
exit.

### Single source of truth (no drift)

Rail geometry + step states live in a **pure** `buildOutcomeRail(events)` in
`lib/outcomes/funnel.ts` (the MV-72 `buildIntakeTimeline` pattern), deterministically
unit-tested; the component (`OutcomeRailView`) stays presentational.

### Accessibility

Shape **+ label** carry every state (never colour alone): the dots are `aria-hidden`, and
each rail exposes **one honest `aria-label`** via `role="group"`
(e.g. *"Application progress: Applied done, Offer done, Visa lodged done, Refused, Granted
not reached."*) — never implying a Granted that wasn't reached. Terminal copy uses the
specific word (Rejected / Refused / Withdrawn), never a vague "Unsuccessful".

## Files

- `lib/outcomes/funnel.ts` — `events` on `OutcomeFunnelRow` (+ populated in
  `buildOutcomeFunnel`); new `RailStep*`/`OutcomeRail` types + pure `buildOutcomeRail()`
- `components/outcomes/outcome-funnel.tsx` — new `OutcomeRailView` slotted into `OutcomeRow`
- `tests/outcomes/funnel.test.ts` — +12 (`events` plumbing + 11 `buildOutcomeRail` cases)
- `tests/components/outcomes/outcome-funnel.test.tsx` — +4 (rail present / refused replaces
  Granted / honest aria-label / withdrawal is neutral-not-red)

## Acceptance criteria

- [x] A four-step Applied → Offer → Visa lodged → Granted rail renders per application row,
  positioned by the confirmed event stream (`funnel.test.ts`, `outcome-funnel.test.tsx`).
- [x] A granted visa / enrolment fills all four; in-progress marks the furthest as current.
- [x] Rejection/refusal exit **red-hollow** and never light a later step; refusal's label is
  **"Refused"**, not "Granted".
- [x] Withdrawal exits **neutral grey, never red** (`.border-reach`/`.text-reach` absent).
- [x] No inferred steps — fill only what the events confirm.
- [x] One honest per-rail `aria-label`; state carried by shape + label, not colour alone.
- [x] Real DB data only — no fabrication. Goldens byte-identical (no scoring touched).

## Test plan / gate — PASSED

`npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing `build.mjs` warning) ·
full vitest **246 files / 1500 pass** (+16 new, was 1484 on master). Branch off master.

## Resume notes (cold-start)

Visual spacing (`h-2.5` dots, `top-[5px]` baseline, `left/right-[12.5%]` insets, label
sizes) is a judgment call made **blind** — the dashboard is Supabase-auth-gated, so the rail
can't be browser-verified here; structure + terminal-honesty + a11y are what the tests pin.
Easy to nudge if the founder wants it tighter. MV-45 umbrella remainder: the **global
"where am I" journey rail** (MV-68 cross-page rail) still needs its own brainstorm. Board
state lives on this branch until merge; flip `MV-73 → done` + `npm run board` on master
after the founder merges the PR.
