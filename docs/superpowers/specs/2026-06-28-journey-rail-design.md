# Dashboard "Your journey" panel (MV-45 #3 / MV-77)

**Date:** 2026-06-28
**Slice:** MV-77 — the global "where am I" cross-stage journey rail, carved from the MV-45 progression-visuals umbrella (the last big sub-piece; #15 funnel rail = MV-73, #16 intake timeline = MV-72, both shipped).
**North star:** the app replaces the consultancy. A consultancy's core value to a confused student is *"here's the sequence, you're here, next is this."* This panel gives that orientation, honestly, from real signals only.

## Decision log

- **Footprint** (founder pick): a **dashboard panel**, not persistent chrome. We already have two wayfinding elements (top `AppBar`, bottom `MobileTabBar`), both highlighting the active *page*. A third persistent element would fight calm-authority. The dashboard is the Home hub and already loads the state, so the panel lives there.
- **Arc** (founder pick): **6 stages** — Assessed → Profile → Matches → Plan → Documents → Apply. Leading "Assessed" gives a "how far you've come" frame; "Apply" is a single terminal stage here — the granular per-program Applied→Offer→Granted detail stays in the MV-73 funnel rail (no duplication).
- **Codex review** (gpt-5.5, xhigh): SOUND-WITH-TWEAKS. All three adopted:
  1. Matches "done" could imply the *system* validated matches → keep nav label "Matches", make the reached-word **"shortlisted"** (a user action, never "done").
  2. "Assessed = done" must mean a *completed/scored* assessment, not a bare row → gate on the scored `result` payload.
  3. Plan "all items closed" case → engagement must cover started **or** completed items, not only open-started (else a finished plan falsely reads "not started").

## Honest state derivation

Each stage's status comes ONLY from a real signal. We mark `done` only on a true completion signal; Plan/Documents never claim global `done` (full readiness is program-scoped — claiming it here would over-claim).

| Stage | Signal (source) | `done` | `in-progress` | reached-word |
|---|---|---|---|---|
| Assessed | parsed scored `result` of the primary assessment | result present | — | "assessed" |
| Profile | `completeness` (0–100) | `== 100` | `1–99` | "complete" / "in progress" |
| Matches | shortlist rows (`user_program_state`) | `≥1` shortlisted | — | **"shortlisted"** |
| Plan | all plan items (`startedAt` set **or** `status==="done"`) | never | any started/completed | "in progress" |
| Documents | `documents.length` | never | `≥1` uploaded | "in progress" |
| Apply | outcome attempts + events | a `granted` outcome exists | `≥1` attempt | "granted" / "in progress" |

A stage with no signal is `todo` → word "next" if it is the current frontier, else "upcoming".

## "You are here" (frontier)

Exactly one node carries the current/you-are-here flag: the **furthest stage reached** (status ≠ todo), advanced to the next stage when that frontier is fully `done` (so a fresh signed-in user, only Assessed done, reads current = Profile = "next"). Stages skipped *behind* the frontier stay visibly `upcoming` — honest gaps (e.g. uploaded a doc but never shortlisted → Matches still "next/upcoming" behind the frontier). Never fabricate linear progress.

## Architecture (mirrors `buildReadiness` + `ReadinessMap`)

- **Pure** `buildJourney(signals: JourneySignals): Journey` in `lib/journey/journey.ts` → 6 `JourneyStage` nodes `{ key, label, href, status, current, word }` + an sr-only `ariaLabel` summary. No rendering, fully unit-tested.
- **Presentational** `components/dashboard/journey-rail.tsx` — flat dots + thin connectors + mono word-labels, reusing the MV-73 rail's visual language; **no reach-red** (wayfinding, not a verdict); each node is a `Link` to its surface (Assessed→/dashboard, Profile→/profile, Matches→/matches, Plan→/plan, Documents→/documents, Apply→/matches).
- **Wire-up** in `app/(app)/dashboard/page.tsx`: swap `listOpenPlanForUser` → `listAllPlanForUser` (filter `todo` in JS for the existing prompt — zero net extra query); add `listShortlistForUser` to the `Promise.all` (**+1 query**); derive `JourneySignals` from already-loaded data; render the panel under the Greeting, above the Snapshot/Prompt grid.
- Hrefs/placement/Profile-strictness are the founder-adjustable knobs; defaults above.

## Accessibility & motion

- sr-only summary line names each stage's word-state before the visual ("Your journey — Assessed: assessed; Profile: in progress; Matches: next; …").
- Per-node `aria-label` carries the word (colour/shape never the sole signal).
- Static panel; `prefers-reduced-motion` honored by the global block (no node animation introduced).

## Testing (TDD)

- `lib/journey/journey.ts`: per-stage status mapping (each done/in-progress/todo boundary), the frontier rule (fresh user → Profile current; mid-journey; all-done), the skipped-gap case (Documents reached, Matches todo behind frontier), Codex tweak #3 (all plan items done → Plan in-progress), the sr-only summary string.
- `components/dashboard/journey-rail.tsx`: renders 6 nodes, the current node marked, words present, links correct, a11y summary present.
- Goldens untouched (new surface).
