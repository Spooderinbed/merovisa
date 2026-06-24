# MV-37 — Rework "My plan" into a guided sequential timeline

**Column:** Backlog · **Priority:** P2 · **Owner:** founder+agent · **Gate:** founder design sign-off (DESIGN-FIRST)
**Created:** 2026-06-24
**Related:** SUPERSEDES the framing of [[MV-23]] (which shipped "this is your action queue — *not* a strict
timeline" copy); couples with [[MV-27]] (mirrored rows) and [[MV-38]] (the dashboard "next step" inherits plan
order). Evidence: product-review audit `wf_5fb5dfa7-009` (2026-06-24).

## Founder decision (2026-06-24)

> "We need this to be a timeline for students on what to do next — as we are guiding them."

This is a deliberate product reversal. MV-23 part 1 framed the plan as an **impact-ranked action queue** and
explicitly told students it is *not* an ordered timeline. The founder now wants the opposite: a **guided,
sequential "what to do next, in order"** journey. MV-37 is the vehicle; MV-23 stays Done (its framing is
superseded, not reopened).

## Current state (what exists today)

- `components/plan/plan-list.tsx` renders two groups: **"Your next steps"** (impact-ranked: High/Medium/Low),
  and **"Visa preparation"** (the ONLY genuinely sequential section — sorted by `visaPrepOrder` over a
  hand-curated order in `lib/plan/phases.ts`).
- Within an impact band, items are sorted **newest-created-first** (`lib/plan/select.ts:17-20`) — an
  implementation artifact for dashboard/plan agreement, NOT a student-meaningful order.
- Copy currently says "action queue" (the framing to replace).

## Design questions to settle BEFORE building (founder + brainstorm)

1. **What defines "next"?** Most likely a **phase/journey model**, extending the `phases.ts` ordering principle
   from visa-prep to the whole plan. Candidate phases: Build profile / grades → Shortlist programs → Sit
   English test → Gather academic + financial documents → Proof of funds → Apply to programs → Receive CoE →
   Lodge visa → Visa decision.
2. **Strict linear vs phase-grouped-with-priority-inside?** A pure 1→N list is simplest to follow but brittle
   when steps are parallelizable; phase-grouped keeps guidance while allowing within-phase ordering.
3. **Items with no natural sequence position** (profile gaps, optional uplifts) — where do they sit?
4. **How does completion advance the timeline?** (current/next-step emphasis, progress affordance.)
5. **Copy:** replace "action queue" with timeline framing; keep the checklist = per-program reference framing.

## Acceptance criteria (post design sign-off)

- [ ] The plan presents as an **ordered, guided journey** (sequenced/numbered or phase-stepped), not an
      impact-ranked list; copy says so.
- [ ] Ordering is student-meaningful (not newest-created-first); `lib/plan/select.ts` ordering reworked.
- [ ] "action queue" framing (MV-23) replaced; checklist cross-reference preserved.
- [ ] Goldens impact assessed: plan ordering likely does NOT touch the scorer — confirm byte-identical or
      regenerate deliberately.
- [ ] TDD RED→GREEN; full suite green.

## Resume notes (cold agent)

- DESIGN-FIRST: do not build before the founder signs off on the phase model (Q1–Q4). Run the brainstorming
  skill first.
- A journey model likely also resolves [[MV-27]] (mirrored visa-prep rows) and reframes [[MV-38]] (proof-of-funds
  as "the next step") — coordinate the three.
- Touch points: `components/plan/plan-list.tsx`, `lib/plan/select.ts` (ordering), `lib/plan/phases.ts` (extend
  to all phases), `lib/plan/generator.ts` (kinds → phases mapping). `lib/checklist/generator.ts` stays the
  per-program reference.
