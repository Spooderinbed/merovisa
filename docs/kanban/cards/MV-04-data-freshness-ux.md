# MV-04 — Data-freshness UX + stale-fact CI

**Priority:** P2   **Owner:** agent
**Goal:** When a scoring-critical fact is past its `reverifyBy`, the app degrades the
claim visibly (warn / lower confidence / suppress) instead of presenting a stale
"strong" verdict as current — and CI fails when such a fact goes stale.

## Context links
- Round-1 audit / Codex §3.3 (data-freshness UX): `docs/audits/2026-06-18-full-app-evaluation.md`
- Forward plan §3.3 + §4 (degrade visibly when stale): `.claude/plans/tender-bouncing-locket.md`
- Fact layer with `source`/`lastVerified`/`reverifyBy`: `lib/data/source/*`, `lib/data/policy/*`

## Acceptance criteria
- [ ] A scoring/cost-critical fact past `reverifyBy` produces a visible degraded state near the affected panel (not a silent stale claim).
- [ ] A CI/test check fails when a scoring-critical fact is stale, so it can't ship unnoticed.
- [ ] Degradation rule is documented (warn vs lower-confidence vs suppress, per fact class).

## Test plan
- Unit test: a fact with a past `reverifyBy` → the freshness helper flags it stale.
- Component test: stale fact → the panel renders the degraded affordance.
- A CI-style test that scans the fact layer and fails on a stale scoring-critical fact.

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- None (metadata already exists on the facts).

## Risk notes
- Don't make this so aggressive it nukes the UI on a one-day-stale reference fact — degrade *scoring/cost-critical* facts; reference facts can warn quietly.

## Agent resume notes (cold start)
1. Find the freshness metadata shape (`reverifyBy`/`lastVerified`) and any existing helper in `lib/data/*`.
2. Decide the fact-class → degradation mapping with the founder's "trust-first" lens. Build the helper + a test first.

## Decision log
- 2026-06-18 — Created from round-1 audit §3.3.

## Done evidence
_pending_
