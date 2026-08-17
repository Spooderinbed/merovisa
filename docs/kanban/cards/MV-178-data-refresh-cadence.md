# MV-178 — Data-refresh cadence (founder-deferred)

**Priority:** P2 · **Owner:** founder+agent · **Created:** 2026-08-17

## Why

Founder call 2026-08-17: "we will handle… the keep-updating-our-data thing later, keep it as backlog." This card exists so the deferral is durable state, not lost conversation. Do NOT chase this ahead of the workspace UI lane.

## What it is when picked up

The research report (`docs/research/2026-08-11-program-data-wedge.md` §5) priced the honest options: the **visa/policy layer** (DHA figures, Ministerial Directions, evidence levels) runs ~80–120 h/yr and is the defensible moat; deepening the program catalogue runs ~240 h/yr and is a cost trap without application-commission revenue. Known baseline: the matchable catalogue was last verified 2026-06-04/07 (53% `derived`), fact-layer refresh 2026-07-02, one 19-month outlier (`nepal-banks.ts`).

## Acceptance criteria (when activated)

1. A decided refresh cadence per data layer (visa/policy vs catalogue), recorded here.
2. The 1-July-style freshness timer generalized to that cadence (MV-80 built the mechanism).
3. First refresh cycle executed with `lastVerified` bumps only on genuinely re-verified rows — never a blanket stamp.
