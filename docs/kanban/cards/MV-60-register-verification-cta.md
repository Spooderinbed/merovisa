# MV-60 — Working-with-agents: actionable "verify your agent" register CTA

**Priority:** P3   **Owner:** agent (build) · founder (copy sign-off)
**Goal:** Turn the panel's "Check the register first" section from a flat list of facts into a prominent, gov-quoted **actionable affordance** so a student is nudged to verify their agent on the OMARA public register *before they pay* — raising trust value without MyVisa appearing to "endorse" anything beyond quoting the government.

## Context links
- Existing panel: `components/results/working-with-agents.tsx` (section `verify-register`), data `lib/data/source/au-working-with-agents.ts`.
- Backed entirely by already-sliced gov findings: G.077 (search register by MARN), G.078 (search by business location — landed in MV-59), G.084 (DHA: if you pay, use a registered agent listed with OMARA).
- Codex consult (2026-06-26): a directive CTA is *marginally* higher trust value than a flat link AND safe **only if** framed as quoting the government (e.g. "The government register lets you search by MARN or business location — check it before you pay"), styled as a gov-sourced callout, NOT a MyVisa-branded product button. Otherwise it risks reading as endorsement / over-engineering a presentational panel.

## Acceptance criteria (DRAFT — needs founder copy sign-off before build)
- [ ] The `verify-register` section leads with a single, visually-distinct gov-quoted callout linking to `portal.mara.gov.au`, naming both search facets (MARN, business location) and the "check before you pay" posture.
- [ ] Framed as quoting OMARA/DHA (source-anchored), not as a MyVisa endorsement or branded button; matches calm-authority tokens (thin border, no shadow/gradient).
- [ ] No new findings required; reuses G.077/G.078/G.084. No scoring, no gating change.
- [ ] Copy approved verbatim by founder before merge (copy-precision gate).

## Test plan
- Component test: the callout renders, links to `portal.mara.gov.au`, names both search facets; existing copy-lock + first-open tests stay green.

## Integration gate
- `npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- **Blocked-by:** founder copy sign-off (the exact callout wording). Build is trivial once copy is fixed. MV-59 lands G.078 first.

## Risk notes
- Endorsement risk: must read as quoting the government register, not recommending agents. Copy is the whole risk surface — hence the founder gate.

## Agent resume notes (for a cold start)
- Do not build until the founder fixes the callout copy. Then: TDD the callout into the `verify-register` section of `working-with-agents.tsx`, gov-quoted + source-anchored, reusing G.077/G.078/G.084.

## Decision log
- 2026-06-26 — Split from MV-59 per Codex (D): data rows shipped separately; this CTA queued for founder copy-review.

## Done evidence
- (queued — not started)
