# MV-80 — FY2026-27 data re-verify: 16 overdue reverifyBy records

**Source:** the designed 1-July freshness timer (`tests/data/freshness.test.ts`) fired on the
2026-07-01 AU financial-year boundary — the failing test IS the reminder (per its docstring:
fix by re-verifying the source and moving `reverifyBy`/`lastVerified` forward, never by
deleting the deadline).
**Evidence packet:** `docs/audits/2026-07-02-fy2026-27-reverify-scout.md` — a 4-agent
read-only scout verified every record against its authoritative live source on 2026-07-02,
with per-record source URLs. **12/16 changed.**

## Scope (the 16 records)

| Module | Records | Result |
|---|---|---|
| `lib/data/policy/au-visa-fees.ts` | `AU_SUBCLASS_500_APPLICATION_CHARGE_AUD` | CHANGED 2,000 → 2,500 |
| `lib/data/policy/au-visa-charges-skilled.ts` | `AU_SKILLED_VISA_CHARGES[0-3]` | ALL CHANGED (189→6,135; 491/186→6,140; 191→630) |
| `lib/data/policy/au-tax-figures.ts` | `AU_TAX_FIGURES[1-4]` | unchanged (confirm + move dates) |
| `lib/data/source/au-student-worker-wages.ts` | `AU_STUDENT_WORKER_WAGES[1-6]` | ALL CHANGED (NMW 26.44 in force; hospitality re-based on 25.74) |
| `lib/data/source/nepal-refusal-recovery.ts` | `NEPAL_REFUSAL_RECOVERY[11]` | CHANGED (ART fee 3,580 → 3,727) |

## Acceptance criteria

- [ ] Every changed value updated to the live-source figure, **source page opened during the
  edit** (never blind-copied from the scout doc); units/streams match the record's semantics.
- [ ] Wages [1] "current 24.95" vs [2] "announced 26.44": 26.44 is now IN FORCE — collapse or
  re-status the pair; no stale "announced" row survives.
- [ ] All 16 records get `lastVerified: "2026-07-02"`; annual-volatility records get
  `reverifyBy: "2027-07-01"`. No deadline deleted.
- [ ] 189 = 6,135 vs 491/186 = 6,140 preserved (genuinely different, not a typo).
- [ ] `tests/data/freshness.test.ts` green; full suite green (goldens/copy may reference old
  figures — check for downstream drift); typecheck + lint clean.
- [ ] Branch `mv-80-fy2026-27-reverify` → PR; founder-gated merge (master = production).

## Notes

- Note that the DHA rises (~25%) are large and student-visible — the subclass 500 charge is a
  headline cost number; treat copy that cites it as in-scope for drift.
- ATO figures confirmed unchanged — the work there is dates-only, still per-record verified.
