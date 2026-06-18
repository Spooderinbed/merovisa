# MV-10 — Cost-estimate tab (BLOCKED)

**Priority:** P2   **Owner:** agent
**Status:** ⛔ Blocked — needs OSHC (overseas student health cover) data sourced first.
**Goal:** Replace the honest "coming soon" cost-estimate tab on /matches with a real,
sourced live cost estimate.

## Context links
- Round-1 audit Q12 (cost tab stub): `docs/audits/2026-06-18-full-app-evaluation.md`
- Forward plan §5 Phase 1 (scope cost-estimate; source OSHC first): `.claude/plans/tender-bouncing-locket.md`
- Current stub: `components/matches/*` cost tab; test `tests/app/matches-page.test.tsx` asserts the coming-soon copy.

## Acceptance criteria
- [ ] OSHC cost data sourced, Zod-validated, provenance-stamped into the TS fact layer.
- [ ] Cost estimate composes sourced figures (tuition + OSHC + living + visa/fees) with each figure one click from its source.
- [ ] The "coming soon" copy + its test are replaced with the real surface.

## Test plan
- Fact-layer validation test for the OSHC source.
- Component test: cost tab renders sourced figures with provenance links (no "coming soon").

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- **BLOCKED:** OSHC data sourcing (the unblock). Until sourced, the tab stays an honest coming-soon — do not fabricate figures.

## Risk notes
- Cost guidance is affordability-critical and trust-sensitive — every figure must be sourced + current (ties to MV-04 freshness). No estimates without provenance.

## Agent resume notes (cold start)
- Do not start until OSHC is sourced. When unblocked, source → validate → commit artifact → build the tab over it (generated-data pipeline pattern).

## Decision log
- 2026-06-18 — Created. Codex: keep "coming soon" until OSHC sourced; do not build yet.

## Done evidence
_pending_
