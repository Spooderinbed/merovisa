# F16 — verdict provenance wiring (trust-maintenance slice ④·3d)

**Date:** 2026-06-12 · **Status:** user-approved with guardrails (this spec records them) · **Lane:** value-triage / trust-maintenance
**Packet row:** `odds.verdict.provenance` (F16, `docs/audits/2026-06-12-trust-copy-readthrough.md`)

## Defect

The verdict card renders "Based on rules verified {date} · immi.homeaffairs.gov.au" from
`lib/data/destination/australia.ts` (`AUSTRALIA.lastVerified` + `AUSTRALIA.source`). That date is the
destination *content* record's verification date — not a verification of the scoring rules the verdict
actually ran on. The single gov host also overclaims: the scoring config's inputs mix DHA figures,
test-threshold sources, an FX heuristic, and internal weights.

## Design (mechanical, no scoring change)

1. **`lib/data/scoring-config.ts` — one additive export.** `CONFIG_RULES_VERIFIED`: the **oldest**
   `lastVerified` across the dated `CONFIG_PROVENANCE` entries — i.e. "every externally-sourced rule
   input was verified on or after this date" (currently `2026-06-02`, the fx-rates heuristic; the gov
   figures sit at 06-05/06-07). Internal-heuristic entries carry no `lastVerified` (nothing external to
   verify) and are excluded from the floor. Min, not max: a max date would claim freshness most inputs
   don't have. No engine read-path touched; **no RULE_VERSION / CONFIG_VERSION bump** (no behavior change).
2. **`components/results/verdict-card.tsx`.** Line becomes **"Assessment rules verified {date}"** (the
   user's copy), date = `CONFIG_RULES_VERIFIED`. The `AUSTRALIA` import and the `· {sourceHost}` suffix
   go away — no single host can honestly cover the mixed inputs, and per-figure source links already
   render at the factor level (`SourceLine`, scorer-wiring slice 2). No version string rendered:
   `config-v3` / `v0.3.0` are internal jargon (user guardrail), and the engine already stamps both into
   the stored result for traceability.
3. **Tests (locks-first).**
   - `tests/data/config-rules-verified.test.ts`: the constant is a `YYYY-MM-DD` string, equals the
     min recomputed from `CONFIG_PROVENANCE` in-test, and is ≤ every dated entry.
   - `tests/components/results/verdict-card.test.tsx` (new): renders the card; pins
     "Assessment rules verified {CONFIG_RULES_VERIFIED}" (imported constant, not a literal); asserts
     the old "Based on rules verified" framing and the `immi.homeaffairs.gov.au` host are gone; and
     **reads the component source to assert it no longer imports `lib/data/destination/australia`** —
     the user-required proof that the line cannot come from the destination config. (The structural
     check matters because both dates are currently the same string, `2026-06-02`.)

## Gates (user guardrails restated)

`npm test` / typecheck / lint green; **goldens byte-identical**; no diff under `lib/scoring`,
`lib/data/policy`, `lib/data/destination`; no version bumps; WIP trio untouched; browser-verify the
rendered card line on a results page; packet F16 row + PROJECT_STATUS annotated; single-writer inline.

## Out of scope

Surfacing the version string anywhere user-facing; any change to `AUSTRALIA`'s own record (other
surfaces legitimately use it); per-rule provenance UI beyond the existing factor-level `SourceLine`s.
