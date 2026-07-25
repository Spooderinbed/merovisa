# MV-132 — FX rates are unsourced and unguarded, and they gate the DHA verdict (audit F-20)

**Priority:** P1 · **Owner:** agent · **Merge:** _founder-gated_
**Source:** 2026-07-10 audit finding **F-20**, confirmed uncarded 2026-07-17. MV-09
consolidated FX into one module but **explicitly deferred** source + `reverifyBy` +
volatility handling — this card is that deferral.

## Why (student outcome)

Every budget check converts the student's funds to AUD through `FX_RATES`. That number
directly decides whether the financial factor clears (see MV-120: budget vs tuition +
living costs). If the rate is stale or wrong, an honest student is told Reach when they
are fine, or vice versa — a silent, sourceless error at the heart of the verdict.

Architecture rule (CLAUDE.md): **every data point has `source` and `lastVerified`.**
FX currently violates it.

## The bug

`lib/data/policy/fx-rates.ts` holds hardcoded rates with no `source`, no `lastVerified` /
`reverifyBy`, and no freshness guard — unlike the DHA datasets that MV-04/26/80 guard.
Consumed by `lib/scoring/financial.ts` and `lib/matches/from-sections.ts`, so it silently
gates the verdict.

## Fix direction

1. Give each rate a `source` + `lastVerified` + `reverifyBy`, same shape as the guarded
   DHA data.
2. Extend the freshness guard to cover FX so a stale rate fails loudly (a test that goes
   red when `reverifyBy` passes), consistent with the MV-80 pattern.
3. Consider a tolerance/volatility note — NPR↔AUD moves enough that a months-old rate can
   flip a borderline verdict. At minimum, disclose the rate's as-of date where it drives
   the number.

## Acceptance criteria

- [x] Every FX rate carries `source` + `lastVerified` + `reverifyBy`.
- [x] A stale FX rate fails the freshness guard (red test proves it).
- [x] No verdict silently rides an unsourced number.
- [x] Gate green: typecheck + lint + test.

## What was found (2026-07-25) — bigger than a metadata gap

The rates were not merely unsourced, they were **materially wrong, in the falsely
reassuring direction**:

| leg | table said | published | error |
| --- | --- | --- | --- |
| NPR per USD | 135 | 154.52 (NRB, 2026-07-24) | −14.5% |
| NPR per A$1 (implied) | 90 | 108.14 (NRB, 2026-07-24) | **−20.2%** |
| INR per USD | 83 | 94.66 (US Treasury, 2026-06-30) | −14% |

So every Nepali budget was converted **~20% high**: NPR 4,500,000 was reported as
A$50,000 when the NRB rate makes it A$41,613, against a DHA capacity floor of
A$74,210. Students were being told their funds went further than they do — the
direction that loses a visa. Corroborated three ways: live NRB API, the US Treasury
schedule, and the repo's own ledger (D.003/D.004 recorded NRB at ~109.5 NPR/AUD on
2026-06-05, `rejected:dynamic-data`).

## What shipped

1. **Sourced rates** — `lib/data/policy/fx-rates.ts`: NRB for the Nepal corridor
   (NPR + AUD read from one snapshot, so their composition reproduces NRB's published
   NPR/AUD exactly), US Treasury Reporting Rates of Exchange for INR/BDT/PKR/NGN
   (NRB publishes none of those, and they are reachable via the profile money editor).
   Each rate carries `source` + `lastVerified` + `effectiveDate` + `reverifyBy` +
   `volatility`. USD stays the table's unit — the one exempt entry, asserted as identity.
2. **A third honest provenance class** — `ConfigProvenanceSchema` previously allowed only
   finding-traced or `internal-heuristic`. A market rate can be neither (the ledger
   *rejects* FX as dynamic data), so it now admits an authority URL **only when both
   `lastVerified` and `reverifyBy` are present**: citing an authority obliges you to
   re-read it, which is what stops a dated citation ageing into a false one.
3. **The wiring hole that made the guard cosmetic** — `CONFIG_PROVENANCE.FX_RATES` took
   `fxEntries[0]`, i.e. the USD identity, which carries no `reverifyBy`. Every real rate's
   deadline was therefore invisible to `staleScoringFacts()`, so a months-old NPR rate
   could gate the DHA verdict without ever tripping the MV-04 runtime degrade. Now picks
   the most-urgent rate, so FX staleness reaches `rulesStale` → the verdict card.
4. **`reverifyBy` as a cadence, not an expiry** — an FX rate has no known change date, so
   the deadline is a quarterly re-read bounded by the drift a banded verdict absorbs
   (`FX_REVERIFY_CADENCE_DAYS = 92`; observed NPR/AUD drift was ~1.3% over seven weeks).
   Same doctrine as the harvested DHA datasets in `tests/data/freshness.test.ts`.
5. **Disclosure where the rate drives the number** — the wizard budget caption now reads
   `Indicative rate: NPR 108 ≈ A$1 — Nepal Rastra Bank, 2026-07-24`.
6. `CONFIG_VERSION` → `config-v4` (sourced values changed, per the module's own rule).

## Evidence

- **New guard** `tests/data/fx-freshness.test.ts` (11 tests): sourcing, red-on-deadline,
  cadence bounds, value fidelity (`toAud(108.14, "NPR") ≈ 1` — catches editing one
  corridor leg without re-deriving the other), and the **regression test for the wiring
  hole**: at one day past the FX deadline, `staleScoringFacts()` returns exactly
  `["FX_RATES"]` and `scoringRulesStale()` is true, proving FX alone degrades the verdict.
- **Red-first proof:** the new suite failed 9/11 against the pre-change code, including
  `RangeError: Invalid time value` from the undefined `CONFIG_PROVENANCE.FX_RATES.reverifyBy`
  — the hole itself.
- **Characterization golden diff is `configVersion` only** (18 lines, no verdict/weighted
  change). Each NPR fixture's budget was restated to preserve the USD/AUD intent its own
  comment declares (e.g. the weighted-50 boundary fixture is still exactly 20,000 USD, so
  it still pins the boundary it exists for). Same real-world money → same verdict; only the
  NPR count changed.
- **Fixtures whose documented intent the correction broke** (restated, each with a note):
  `aarav` 5.4M→6.2M NPR (≈40k USD), `engine` strong 7M→8.5M, `freeze` 6.5M→7.8M
  (~72k AUD), `possible-mid` 7M→8.1M.
- `tests/scoring/financial.test.ts` cliff fixtures now **derive** the capacity floor's USD
  expression from the config instead of hardcoding it, so the next quarterly re-verification
  moves them instead of turning four tests red with hand-recomputed numbers.
- **Gate:** `tsc --noEmit` clean · `eslint` clean · **2048/2048 tests** (306 files).

## Follow-ups (not in scope here)

- **Unmapped-currency passthrough is still dishonest**: `toAud(1000, "EUR")` returns 1000,
  i.e. foreign money read as AUD. Pinned by the `unknown-currency-passthrough`
  characterization golden, so changing it is its own slice (abstain, à la MV-143's
  `hasSufficientInputs`, is probably the honest answer).
- The public freshness table (`lib/marketing/freshness-rows.ts`) has no FX row, and its
  hand-written `nextCheck: "Jul 2026"` stamps are themselves past due.
- No live browser pass: the only UI change is copy inside an existing caption span, and
  this session's preview harness is pinned to a different worktree. The caption is now
  ~57 chars, so it may wrap to two lines at mobile width — worth an eyeball.

## Resume notes

- Paths verified 2026-07-17: `lib/data/policy/fx-rates.ts`, consumers `lib/scoring/financial.ts`,
  `lib/matches/from-sections.ts`.
- Prior art: MV-04/26/80 freshness guards; MV-09 FX consolidation (which deferred exactly this).
- Ties to MV-120 (the budget-vs-cost verdict this number feeds).
- **Re-verifying FX** (due 2026-10-25): re-read NRB (`https://www.nrb.org.np/api/forex/v1/rates?page=1&per_page=100&from=<date>&to=<date>`,
  mid = (buy+sell)/2) and the Treasury dataset; update the rates, `VERIFIED`,
  `REVERIFY_BY`, `FX_NRB_NPR_PER_AUD`, `FX_NRB_AS_OF`; then regenerate the golden
  (`WRITE_GOLDENS=1 npx vitest run tests/scoring/characterization.test.ts`) and bump
  `CONFIG_VERSION`. The derived cliff helpers mean no other test needs hand-editing.
