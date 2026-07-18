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

- [ ] Every FX rate carries `source` + `lastVerified` + `reverifyBy`.
- [ ] A stale FX rate fails the freshness guard (red test proves it).
- [ ] No verdict silently rides an unsourced number.
- [ ] Gate green: typecheck + lint + test.

## Resume notes

- Paths verified 2026-07-17: `lib/data/policy/fx-rates.ts`, consumers `lib/scoring/financial.ts`,
  `lib/matches/from-sections.ts`.
- Prior art: MV-04/26/80 freshness guards; MV-09 FX consolidation (which deferred exactly this).
- Ties to MV-120 (the budget-vs-cost verdict this number feeds).
