# MV-10 — Cost-estimate tab (IN PROGRESS)

**Priority:** P2   **Owner:** agent
**Status:** In progress (2026-06-20, founder de-gated). OSHC + living-cost SOURCED via a
research fan-out; building the cost-estimate selector + panel over a new sourced fact module.
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

## Sourcing evidence (2026-06-20 — research fan-out, 10-agent Workflow)

OSHC single cover (one person, subclass 500), 5 gov-approved providers searched. **3 publish a
citable rate; 2 are quote-tool-only** (we record those as `quoteOnly`, never fabricate a number):

| Provider | Single/yr (AUD) | Single/mo | Basis / source | Note |
|---|---|---|---|---|
| **nib** | **679.57** | 56.63 | nib OSHC Core rate card PDF, "correct as of 3 Jul 2025" (nib.com.au) | Cleanest — official domain, published 12-mo rate card |
| **Bupa** | **760** | 64 | Bupa OSHC price list, eff. 30 Jun 2025 | Rate card is partner-hosted (ilsc.com); bupa.com.au is a JS quote tool. ~12 mo old; re-verify |
| **Medibank** | ~949 (from $79.10/mo ×12) | 79.10 | medibank.com.au OSHC page, "from $79.10/mo incl GST" | "from" headline, not a clean 12-mo total; annualized |
| ahm | — | — | ahmoshc.com.au quote tool only (no static rate card) | quoteOnly |
| Allianz Care | — | — | allianzcare.com.au (403 + quote tool only) | quoteOnly |

**Living cost:** DHA financial-capacity for the primary student = **AUD 29,710 / 12 mo** (savings
option), effective 2024-05-10, **confirmed still current 2026-06-20** (immi.homeaffairs.gov.au).
This already matches `lib/data/policy/au-cost-of-living.ts` `AU_DHA_LIVING_CAPACITY_AUD`
(lastVerified 2026-06-07) — reuse it. Realistic all-in living range $24,000–$50,400/yr
(studyaustralia.gov.au) — context only, not the regulatory figure.

**Honesty decision:** present OSHC as a **range** (cost-to-apply precedent already ranges provider
fees 0–150), anchored on the published rate cards (nib 680 → ~Medibank 949), each figure one click
from its source, with a note that exact premiums depend on cover dates and that ahm/Allianz quote
individually. No blended FX; AUD/year, first-year framing.

## Build plan (locked 2026-06-20) — cost-to-apply display pattern (NOT the findings ledger)

The OSHC data is sourced *display* cost data, so it follows the `lib/data/cost-to-apply.ts`
precedent (per-record `source` + `lastVerified`, dedicated Zod schema + test, **outside**
`DATA_MODULES` — no findingRefs, since no ledger findings exist and `registry-integrity` does not
require registration). Files (TDD, failing test first per unit):

1. `lib/data/types.ts` — add `AuOshcPremium` interface (`id, provider, singleCoverAudPerYear: number|null, singleCoverAudPerMonth?: number|null, coverType:"single", quoteOnly: boolean, basis, source, lastVerified`). No `provenance`.
2. `lib/data/source/au-oshc-premiums.ts` — 5 records (nib/Bupa/Medibank with figures; ahm/Allianz `quoteOnly:true`, amounts null).
3. `lib/data/schema/au-oshc-premiums.schema.ts` — Zod: HttpUrl, IsoDate, positive-or-null amount, unique ids, `quoteOnly ⇒ null amount` consistency.
4. `lib/data/cost-estimate.ts` — `selectCostEstimate()` composes the annual first-year estimate: tuition (`AU_REPRESENTATIVE_TUITION_AUD`), DHA living (`AU_DHA_LIVING_CAPACITY_AUD`), OSHC range (from the module), visa charge (`AU_SUBCLASS_500_APPLICATION_CHARGE_AUD`). Returns lines with source+lastVerified; mirror `CostToApplyBreakdown`.
5. `components/matches/cost-estimate-panel.tsx` — render it (mirror `CostToApply` + `SourceAnchor`).
6. `app/(app)/matches/page.tsx` — replace `costPanel` "Coming soon" with `<CostEstimatePanel />`.
7. Tests: `tests/data/au-oshc-premiums.schema.test.ts`, `tests/data/cost-estimate.test.ts`, `tests/components/matches/cost-estimate-panel.test.tsx`, and FLIP the `tests/app/matches-page.test.tsx` assertion ("coming soon" → real OSHC figure visible).

Re-verify OSHC by the next reverify window (rate cards dated mid-2025; volatility annual).

## Decision log
- 2026-06-18 — Created. Codex: keep "coming soon" until OSHC sourced; do not build yet.
- 2026-06-20 — Founder de-gated. OSHC + living sourced (research fan-out). Build plan locked above.

## Done evidence
_pending build_
