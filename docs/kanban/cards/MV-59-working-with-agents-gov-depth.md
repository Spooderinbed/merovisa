# MV-59 — Working-with-agents panel: three gov depth rows (G.078 / G.082 / G.095)

**Priority:** P2   **Owner:** agent
**Goal:** Close three pending gov-primary depth-gaps in the existing ungated "Working with an agent (Australia)" trust panel so the register-check, formal-representation, and commission-ban sections each carry the fact that sharpens the student's defence — without inventing anything.

## Context links
- Triage: working-with-agents / consultancy / education-agent ledger cluster (`docs/research-briefs/findings/G.jsonl`, 108 findings → `app/(app)/journey/working-with-agents` target). Gov framework G.074–G.096 already sliced (16 rows). This card lands the 3 pending `use-later` gov depth-companions.
- Existing slice: `lib/data/source/au-working-with-agents.ts` (data), `lib/data/schema/au-working-with-agents.schema.ts` (schema), `components/results/working-with-agents.tsx` (panel, rendered ungated at `components/results/results.tsx:110`), `tests/components/working-with-agents.test.tsx`.
- Registry: `lib/data/schema/registry.ts:750` (`recordLabel: "au-working-with-agents"`).
- FLIP_STATUS ritual: `tests/data/flip-status.run.test.ts` (CI guard + `FLIP_STATUS=1` writer).
- Codex consult (slice framing, 2026-06-26): recommended shipping the 3 data rows as one card; queue the actionable register CTA separately (→ MV-60). Copy cautions honored: G.095 framed as a *modelled estimate*; G.082 keeps the statutory term "authorised recipient".

## The three findings (faithful restatements — never fabricate)
- **G.078** (`verify-register`): the OMARA public register can also be searched by **business location** (not just MARN). → a student who lacks their agent's MARN can still find them.
- **G.082** (`formal-representation`): an **authorised recipient** must not provide immigration assistance unless they are also a registered migration agent, legal practitioner or exempt person. → receiving your mail ≠ being allowed to advise you.
- **G.095** (`commission-ban`): the 2026 govt impact analysis **estimates** students who still use an agent for an onshore transfer may pay ~AUD 255 per enrolment. → pairs with the existing AUD 510 avg-commission row (G.094).

## Acceptance criteria
- [ ] Three new rows added to `AU_WORKING_WITH_AGENTS`, each in an existing section (`verify-register`, `formal-representation`, `commission-ban`), each with `provenance.findingRefs` = its single backing finding and a gov `source`.
- [ ] Each new summary is a faithful restatement of its finding; G.095 reads as an estimate ("estimates … may pay around"), G.082 keeps the term "authorised recipient".
- [ ] Panel renders the three new lines under the correct section headings (no new sections, no schema change).
- [ ] G.078/G.082/G.095 flipped `pending → used` in `G.jsonl` with `used_by` set and `triage`/`triage_reason` cleared (via the FLIP_STATUS writer, not by hand).
- [ ] Registry comment count updated 16 → 19 prose rows / findings.
- [ ] No scoring touched; no RULE_VERSION/goldens implications (fact-only panel).

## Test plan
- Extend `tests/components/working-with-agents.test.tsx`: add a copy-lock test asserting the three new summaries render verbatim; update the existing "OMARA register" link assertion to `getAllByRole(...)[0]` (a second OMARA-register link now exists).
- `tests/data/flip-status.run.test.ts` (normal mode) must be green: committed `used` set matches code refs (no promoted/demoted/refused/rewired) after the flip.
- `tests/data/reconcile*.test.ts` / `findings-integrity` remain green (real finding ids, prose-only, no invented typed values).

## Integration gate
- `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts` (flip the ledger), then
- `npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- None. Pure data-layer + ledger-status add; gov-primary, agent-ownable.

## Risk notes
- Trust/copy: founder copy-reviews closely. Restatements stay faithful; G.095 must not read as a fixed fee. No legal advice (panel disclaimer already present).
- Ledger integrity: must use the FLIP_STATUS writer so `used_by`/triage are mechanically correct — never hand-edit JSONL status.

## Agent resume notes (for a cold start)
1. Branch `mv-59-working-with-agents-gov-depth` off master.
2. Add 3 failing copy-lock tests → add 3 rows to `au-working-with-agents.ts` → green.
3. Bump registry comment 16→19. Run the FLIP_STATUS writer, then the full gate.
4. Record evidence below, move to In Review, `npm run board`, push, open PR.

## Decision log
- 2026-06-26 — Codex + analysis agreed (D): data rows now (this card), register CTA later (MV-60). Card opened.
- 2026-06-26 — Built TDD on branch `mv-59-working-with-agents-gov-depth`. Caught two ritual steps the FLIP writer does NOT do automatically: (1) `value_status` must be authored `unset→prose-only` for newly-`used` prose findings (reconcile `USED_UNSET` gate), set on G.078/082/095 to match the 16 siblings (incl. the AUD-510 row, which renders narrative → AUD-255/G.095 treated identically); (2) stale generated `.next/dev/types/*` (interrupted dev server) failed tsc — cleared `.next` (gitignored build output) so tsc checks real source only.

## Done evidence
- **Code:** +3 rows in `lib/data/source/au-working-with-agents.ts` (verify-business-location/G.078 · recipient-not-adviser/G.082 · student-paid-estimate/G.095); registry comment 16→19; +1 copy-lock test + `getByRole`→`getAllByRole[0]` for the now-duplicate "OMARA register" link in `tests/components/working-with-agents.test.tsx`.
- **Ledger:** G.078/082/095 flipped `pending→used` via `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts` (used_by set, triage cleared); `value_status` set `prose-only` on the same 3. flip-status guard reported exactly `promoted:[G.078,G.082,G.095]`, no demote/refuse/rewire.
- **Gate (all green):** `npm run typecheck` clean (after clearing stale gitignored `.next/dev/types`); `npm run lint` 0 errors (1 pre-existing warning in `build.mjs`, untouched); `npx vitest run` → **235 files / 1396 tests passed, 0 failed**.
- **Scope:** fact-only panel, no scorer reads it → no RULE_VERSION/goldens implications. Branch `mv-59-working-with-agents-gov-depth`.
- **Founder:** review copy of the 3 new lines → `gh pr merge` to Done.
