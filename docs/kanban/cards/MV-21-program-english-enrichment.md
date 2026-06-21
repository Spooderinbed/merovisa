# MV-21 — Surface verified program English requirements (RMIT type-field + Deakin)

**Column:** Backlog · **Priority:** P3 · **Owner:** founder+agent · **Gate:** founder DB approval (prod write)
**Created:** 2026-06-21
**Related:** [[MV-13]] (the DB bridge this extends — same prod-write gate), [[MV-20]] (the disposition
pass that scoped this out), [[MV-07]] (CRICOS render precedent on the program card).

## Why

[[MV-20]]'s per-finding recon found **9 Category-E `ready` findings that are genuinely homeable** —
verified program-level English (IELTS) requirements for programs **already in the live bridged
catalogue** — but they can't be surfaced without a prod-DB migration, so they were carded here rather
than flipped. Today those live program cards show *"English requirement not listed — confirm with
provider"* even though we hold the verified figure. Surfacing them is a direct trust upgrade (real
verified IELTS vs. an honest-absence placeholder).

## The 9 findings (all sourced, value verified in recon)

| id | program (live seed row) | fact to surface |
|----|--------------------------|-----------------|
| E.050 | `deakin-master-of-data-science` | IELTS 6.5 / 6.0 per band |
| E.044 | `rmit-bachelor-computer-science` | IELTS 6.5 / 6.0 |
| E.086 | `rmit-bachelor-nursing` | IELTS 7.0 / 7.0 |
| E.169 | `rmit-bachelor-nursing` | intake restriction / notes |
| E.094 | `rmit-bachelor-education-primary-early-childhood` | IELTS 7.5 |
| E.112 / E.113 | `rmit-bachelor-pharmacy-honours` | IELTS 7.0 / band ≥6.5 |
| E.119 / E.120 | `rmit-master-social-work` | IELTS 7.0 / band ≥7.0 |

## Why it's a slice, not a copy edit (the gate)

- **The RMIT TS module (`lib/data/source/au-rmit-programs.ts`) has NO English field at all** (verified
  in MV-20: `/ielts|english|overallMin/` → false). The 7 RMIT findings need an English field added to
  the RMIT program **type** (mirror the uni module's `overallMin`/`perBandMin`) + populated on 5 rows,
  before they can be cited.
- **`bridge-fact-parity` enforces seed == TS module**, and **`seed-migration-parity` enforces seed ==
  migration.** So a value-add flows: module → `lib/programs/seed.ts` → a **NEW migration** that
  `UPDATE`s `min_english`/`min_english_band` (+ intakes/notes for E.169) on the live rows. MV-13's
  migration is already applied to prod, so this is a fresh prod write → **founder-gated** (same gate
  as MV-13).
- **Possible goldens impact:** `min_english` may feed match eligibility/English-gap → setting real
  IELTS on 6 programs could move match results. CONFIRM at build: if it moves the engine path,
  regenerate `golden-assessments.json` deliberately + review the diff; if not, goldens byte-identical.
- The flip to `status:used` is then automatic: add each id to its row's `findingRefs`, run
  `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`, promote `value_status`
  unset→structured (reconcile validates the value against the module).

## Build order (TDD, post founder-approval)

1. RED: extend `bridge-fact-parity` to expect English on the 6 rows.
2. RMIT type gains `overallMin`/`perBandMin` (+ optional intakes/notes); populate the 5 RMIT rows +
   the Deakin uni entry; add `findingRefs` for the 9 ids.
3. `seed.ts` rows updated; new migration `UPDATE … WHERE id IN (...)` for the 6 programs.
4. Extend `seed-migration-parity` to parse the new migration.
5. Card render already shows `minEnglish`/band (MV-13) — confirm the populated values render and the
   "confirm with provider" fallback is correctly replaced.
6. Gate: typecheck/lint/test green; FLIP_STATUS + reconcile + ledger guards green; goldens
   byte-identical OR deliberately regenerated (per the eligibility check above).
7. Dev-branch `apply_migration` + `get_advisors` → **founder GO** → prod (the MV-13 D5 pattern).

## Acceptance criteria

- [ ] Founder approves the prod-UPDATE migration (and the RMIT type-field change).
- [ ] 9 findings flipped `used` via registered-module `findingRefs` (machine-derived); reconcile green.
- [ ] Live cards show the verified IELTS (+ intake notes for B-Nursing) instead of the placeholder.
- [ ] Goldens impact resolved (byte-identical or deliberately regenerated + reviewed).

## Resume notes (cold agent)

- Do NOT start without founder approval of the prod migration (Supabase prod writes are founder-gated).
- The 8 RMIT findings are the bulk of the work (type change + 5 rows); **E.050 (Deakin) is the cleanest
  single one** (uni module already has the field shape — only a value + ref + migration row) and could
  ship as a minimal first increment if the founder wants to validate the path before the RMIT type change.
