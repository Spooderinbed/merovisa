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

## DEFERRED 2026-07-03 (founder decision — resume after the design sprint)

**Status: parked (board `col: blocked`), NOT abandoned.** The founder chose to prioritise the
elevated-calm design overhaul (MV-82 → MV-83 → MV-84 …) and consciously defer this data re-verify
until that sprint concludes. This card is the single source of truth for picking it back up.

**Where it stands (partial work is real and on the branch):**
- Branch `mv-80-fy2026-27-reverify`, **PR [#36](https://github.com/Spooderinbed/merovisa/pull/36)** — OPEN, `CONFLICTING`/`DIRTY`.
- Commit `9847b9d` landed **12 of the 16 records** ("12/16 figures updated; subclass 500 → 2,500;
  NMW 26.44 in force; ART 3,727"). **4 records remain** — reconcile against the scope table above
  and the scout packet to confirm exactly which 4 (the ATO dates-only rows + any wage row not yet
  re-based are the likely remainder).
- The main working checkout is currently sitting on this branch with **uncommitted WIP**
  (`components/plan/plan-list.tsx`, `tests/components/plan/plan-list.test.tsx`) — that is the
  downstream copy-drift work (headline cost figures in plan copy). Do not discard it; it is part
  of this card's "check for downstream drift" acceptance criterion.

**Accepted consequence while deferred:** the 1-July freshness test (`tests/data/freshness.test.ts`)
stays **red**, which reddens CI master-wide (suite: 1 failed / 1588 passed). This is *by design* —
the failing test is the reminder and must not be silenced by deleting the deadline. Any PR opened
during the sprint (e.g. MV-83) inherits this one known failure with **zero file overlap**; reviewers
treat that single freshness failure as MV-80-owned, not a regression.

**Resume checklist (cold-start after the design sprint):**
1. `git checkout mv-80-fy2026-27-reverify` in the main checkout (the WIP is already there); or
   re-derive from PR #36.
2. Finish the remaining 4 records per the Acceptance criteria (open each live source during the
   edit — never blind-copy the scout doc).
3. Resolve the PR #36 merge conflict against current `master` (it has drifted since the branch
   was cut — includes the merged design work).
4. Land the plan-copy drift edits (the WIP files) so no stale headline figure survives.
5. Gate green (freshness test now passes) → PR → **founder-gated merge**. Landing this is what
   un-reds CI.

## RESUMED + COMPLETED 2026-07-04 (→ In Review)

Rebuilt the branch **clean on current `origin/master` (f6cada8)** instead of untangling PR #36's
conflict: the design sprint touched *only* the board files, zero divergence on any code/data/test/
findings file `9847b9d` changed — so I reset the branch to master and re-applied `9847b9d`'s 15
non-board files verbatim, then regenerated the board off current master. No rebase conflict.

**Reconciliation of the "4 remaining" estimate:** `9847b9d` was actually complete — it resolved all
16 in-scope records (values + `lastVerified: 2026-07-02` + `reverifyBy: 2027-07-01`), collapsed the
NMW `announced`/`current` pair into one 26.44 `current` record, and updated the downstream plan copy
(`lib/plan/generator.ts`, `lib/plan/sources.ts`) + 7 test files. The two rows still stamped
`2026-06-05` (`tfn-mail-turnaround`, `super-guarantee-rate`) carry **no `reverifyBy`** — stable
procedural facts, correctly outside the freshness scope, not part of the 16.

**Live re-verification (2026-07-04, per the "never blind-copy" criterion):** an independent agent
re-checked every figure against its authoritative source today. **13/15 re-confirmed live**; the
other 2 stand on stronger evidence than a fresh cross-check: subclass 491 = 6,140 was read off the
DHA GetPriceList **API directly** by the 2026-07-02 scout (today's agent could only reach JS-rendered
secondary sources), and hospitality Sat/Sun/PH (38.61/45.05/64.35) are **exact arithmetic** from the
confirmed introductory base 25.74 × 1.50/1.75/2.50. No figure contradicts what shipped; nothing
changed from the scout values.

**Gate:** `tests/data/freshness.test.ts` green; full suite **253 files / 1597 tests green**;
`tsc` clean; `eslint` clean (1 pre-existing unrelated `docs/kanban/build.mjs` warning). No stray old
figure survives in student-facing copy (grep: only the new records' own "was AUD 3,580 / prior 24.95"
changelog notes + a coincidental `03580F` CRICOS code remain).

- [x] Every changed value = live-source figure; units/streams match.
- [x] NMW pair collapsed to one in-force 26.44 `current` record; no stale "announced" row.
- [x] All 16 records `lastVerified: 2026-07-02`; annual ones `reverifyBy: 2027-07-01`; no deadline deleted.
- [x] 189=6,135 vs 491/186=6,140 preserved.
- [x] `tests/data/freshness.test.ts` green; full suite green; typecheck + lint clean.
- [x] Branch `mv-80-fy2026-27-reverify` → PR; **founder-gated merge** (leaves CI-un-redding to the founder).
