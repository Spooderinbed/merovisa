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
- [x] A scoring/cost-critical fact past `reverifyBy` produces a visible degraded state near the affected panel (not a silent stale claim). — **DONE** (VerdictCard renders an amber warn block when `rulesStale`, replacing the calm "verified {date}" line; flag rides the payload from `assembleAssessment` (anon/results) and is recomputed live on the dashboard snapshot).
- [x] A CI/test check fails when a scoring-critical fact is stale, so it can't ship unnoticed. — **DONE** (`tests/data/scoring-freshness.test.ts` walks `CONFIG_PROVENANCE` — the exact verdict-scoring inputs — and goes red the day any is past its `reverifyBy`; closes the gap that the blanket `freshness.test.ts` doesn't register the pure scoring-policy modules).
- [x] Degradation rule is documented (warn vs lower-confidence vs suppress, per fact class). — **DONE** (the rule lives in the `lib/data/scoring-freshness.ts` doc-comment + the decision log below).

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
- 2026-06-19 — Built. Key scoping decision: "scoring-critical facts" = the `CONFIG_PROVENANCE` entries (the exact inputs the engine reads), NOT all `DATA_MODULES`. A reconnaissance pass found the blanket `tests/data/freshness.test.ts` walks the registry but the pure scoring-policy modules (field-competitiveness, fx-rates, english-thresholds, verdict-thresholds, funding-reliability) are **not** registered there — so nothing guarded the verdict inputs as a class. The new check closes that hole. **Degradation rule (per fact class):** verdict-scoring inputs → *warn + lower confidence* on the verdict card (treat-as-indicative), never silent, never full-suppress (suppressing the whole verdict over one stale input is too aggressive per the risk note); reference/cost-only facts → stay on the blanket build-time guard, no UI change. **Two-layer rationale:** the CI guard blocks *shipping* a stale fact; the runtime degrade protects the *deployed* app as its clock crosses a `reverifyBy` between deploys (CI can't catch that). Dashboard recomputes staleness live (server component) because a stored verdict can age after it was scored; the anon/results path uses the payload-carried flag (client component — can't import the scoring config without leaking rules into client JS, per F16).

## Done evidence

**DONE locally 2026-06-19 (NOT pushed; awaiting founder GO). Gate green: typecheck clean, lint 0 errors, 1114/1114 tests (was 1106, +8).** Dormant-by-design today: no scoring-critical fact is stale until `AU_DHA_LIVING_CAPACITY_AUD`'s `reverifyBy` (2027-06-07), so the live UI is unchanged — the degrade is locked by component tests and the CI guard is armed.

New (each TDD'd: failing test → fix):
1. **`lib/data/scoring-freshness.ts`** (new) — `staleFactsAmong(map, now)` (pure predicate), `staleScoringFacts(now)` (over `CONFIG_PROVENANCE`), `scoringRulesStale(now)`. ISO-lexical compare, due on the written date. Server-side only. Test: `tests/data/scoring-freshness.test.ts` (fixture mechanics + real-config guard: empty today, flags the DHA inputs at a far-future clock).
2. **`lib/results/types.ts` + `lib/results/assemble.ts`** — `AssessmentPayload.rulesStale?: boolean`, stamped `scoringRulesStale(now)` (respects the assessment clock). Test: `tests/results/assemble.test.ts` (false at 2026-06-03, true at 2099-01-01).
3. **`components/results/verdict-card.tsx`** — new `rulesStale?` prop; when true, an amber `bg-possible-tint` warn block ("Some scoring rules are overdue for re-verification (last verified {date}) — treat this verdict as indicative, not current.") replaces the calm verified line. Test: `tests/components/results/verdict-card.test.tsx` (stale → warn + no calm line; fresh → calm line + no warn; legacy/no-field unchanged).
4. **Wiring:** `components/results/results.tsx` passes `payload.rulesStale`; `components/dashboard/snapshot-card.tsx` (server component) recomputes `scoringRulesStale()` live.

No scorer or data **value** changed → `golden-assessments.json` byte-identical, no RULE_VERSION/CONFIG_VERSION bump.

**Browser note:** the degrade state is not observable in a live preview today (dormant until 2027-06-07); it is fully locked by the VerdictCard render tests. Forcing it on would require editing real fact data.
