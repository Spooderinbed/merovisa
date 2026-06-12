# F16 — verdict provenance wiring (trust-maintenance slice ④·3d)

**Date:** 2026-06-12 · **Status:** user-approved with guardrails (this spec records them) · **Lane:** value-triage / trust-maintenance
**Packet row:** `odds.verdict.provenance` (F16, `docs/audits/2026-06-12-trust-copy-readthrough.md`)

## Defect

The verdict card renders "Based on rules verified {date} · immi.homeaffairs.gov.au" from
`lib/data/destination/australia.ts` (`AUSTRALIA.lastVerified` + `AUSTRALIA.source`). That date is the
destination *content* record's verification date — not a verification of the scoring rules the verdict
actually ran on. The single gov host also overclaims: the scoring config's inputs mix DHA figures,
test-threshold sources, an FX heuristic, and internal weights.

## Design v2 — payload-carried (mechanical, no scoring change)

**Mid-design discovery:** `components/results/results.tsx` is `"use client"` and renders `VerdictCard`,
so the card sits inside a client bundle — importing `lib/data/scoring-config` from it would ship the
scoring rules (weights, cutoffs, gates execute at module load; not tree-shakeable) into client JS,
violating the architecture rule "never expose scoring rules in client JS". The constant therefore
computes server-side and travels as data on the existing server→client seam: the assessment payload.

1. **`lib/data/scoring-config.ts` — one additive export.** `CONFIG_RULES_VERIFIED`: the **oldest**
   `lastVerified` across the dated `CONFIG_PROVENANCE` entries — i.e. "every externally-sourced rule
   input was verified on or after this date" (currently `2026-06-02`, the fx-rates heuristic; the gov
   figures sit at 06-05/06-07). Internal-heuristic entries carry no `lastVerified` (nothing external to
   verify) and are excluded from the floor. Min, not max: a max date would claim freshness most inputs
   don't have. No engine read-path touched; **no RULE_VERSION / CONFIG_VERSION bump** (no behavior change).
2. **Payload carries the date.** `AssessmentPayload` gains optional `rulesVerified?: string`;
   `assembleAssessment` (server-only — it already imports the engine) stamps `CONFIG_RULES_VERIFIED`.
   Semantically better than a live import even ignoring bundling: the date travels with the verdict it
   describes, so a future config re-verification can't silently re-stamp an old stored snapshot. The
   **engine result is untouched** (it's what the goldens snapshot; it already carries
   ruleVersion/configVersion for traceability).
3. **`components/results/verdict-card.tsx`.** Gains optional prop `rulesVerified?: string`; renders
   **"Assessment rules verified {date}"** (the user's copy) only when present. The `AUSTRALIA` import
   and the `· {sourceHost}` suffix go away — no single host can honestly cover the mixed inputs, and
   per-figure source links already render at the factor level (`SourceLine`, scorer-wiring slice 2).
   No version string rendered: `config-v3` / `v0.3.0` are internal jargon (user guardrail). Removing
   the `AUSTRALIA` import also drops that content record from the client bundle — a small net win.
   **Legacy stored payloads** (no field) render no provenance line: absent beats wrong, and the old
   line's date was unrelated to the rules anyway; fresh assessments (anonymous TTL is 3 days) and
   signed-in re-scores pick the field up immediately. Both call sites pass it through
   (`results.tsx` and the dashboard `snapshot-card.tsx`, each already holding the payload).
4. **Tests (locks-first).**
   - `tests/data/config-rules-verified.test.ts` (new): the constant is a `YYYY-MM-DD` string, equals
     the min recomputed from `CONFIG_PROVENANCE` in-test, and is ≤ every dated entry.
   - `tests/results/assemble.test.ts` (extend): `payload.rulesVerified` equals the imported
     `CONFIG_RULES_VERIFIED` — the wiring lock proving the date originates in the scoring config.
   - `tests/components/results/verdict-card.test.tsx` (new): with the prop, pins
     "Assessment rules verified {date}"; without it, the line is absent; the old "Based on rules
     verified" framing and the `immi.homeaffairs.gov.au` host are gone; and **reads the component
     source to assert it no longer references `destination/australia`** — the user-required proof the
     line cannot come from the destination config. (The structural check matters because both dates
     are currently the same string, `2026-06-02`.) The proof chain is config → assemble lock →
     payload prop → render lock, with no scoring value in the client graph.

## Gates (user guardrails restated)

`npm test` / typecheck / lint green; **goldens byte-identical**; no diff under `lib/scoring`,
`lib/data/policy`, `lib/data/destination`; no version bumps; WIP trio untouched; browser-verify the
rendered card line on a results page; packet F16 row + PROJECT_STATUS annotated; single-writer inline.

## Out of scope

Surfacing the version string anywhere user-facing; any change to `AUSTRALIA`'s own record (other
surfaces legitimately use it); per-rule provenance UI beyond the existing factor-level `SourceLine`s.
