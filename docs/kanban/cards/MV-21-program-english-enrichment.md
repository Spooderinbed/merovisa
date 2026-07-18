# MV-21 — Surface verified program English requirements (RMIT type-field + Deakin)

**Priority:** P3 · **Owner:** founder+agent · **Gate:** founder DB approval (prod write)
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

- [ ] Founder approves the prod-UPDATE migration (and the RMIT type-field change). **PRE-BUILT on branch
      `mv-21-program-english-enrichment` / PR — awaiting founder review + `apply_migration` to prod. Not
      applied to any live Supabase project by this agent (out of scope per task constraints).**
- [x] 9 findings flipped `used` via registered-module `findingRefs` (machine-derived); reconcile green.
      `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts` promoted E.044/E.050/E.086/E.094/
      E.112/E.113/E.119/E.120/E.169 pending→used with correct `used_by`; value/value_type/value_status
      populated per the reconcile value-fidelity check (8 numeric IELTS findings → `structured`; E.169
      red-flag/intake-note → `prose-only`, matching the existing E.013 precedent). reconcile-modules.test.ts
      + reconcile.test.ts + flip-status.run.test.ts all green.
- [x] Live cards show the verified IELTS (+ intake notes for B-Nursing) instead of the placeholder — true
      in `lib/programs/seed.ts` (the TS parity source) and the pre-built migration; **not yet true on the
      live site**, since the migration hasn't been applied to prod (founder-gated).
- [x] Goldens impact resolved: byte-identical. `tests/scoring/__fixtures__/golden-assessments.json`
      unchanged (71/71 scoring + matches + checklist tests green) — the scoring goldens fixture doesn't
      exercise the `/matches` per-program `minEnglish` eligibility path these 6 rows feed, so no diff
      surfaced. No regeneration needed or performed.

## Resume notes (cold agent)

- Do NOT start without founder approval of the prod migration (Supabase prod writes are founder-gated).
- **2026-07-02: fully pre-built and PR'd.** All agent-buildable work is done: RMIT type/schema field add,
  5 RMIT rows + the Deakin row populated with sourced IELTS (all traced to E.044/E.050/E.086/E.094/E.112/
  E.113/E.119/E.120/E.169), `seed.ts` updated, a new idempotent upsert migration
  (`supabase/migrations/20260702000000_enrich_program_english_requirements.sql`) that only touches
  `min_english`/`min_english_band`/`notes`/`finding_refs` on the 6 already-bridged ids (no new columns, no
  new rows), `bridge-fact-parity` + `seed-migration-parity` extended to cover it, 9 findings flipped to
  `used`. Full gate green (typecheck/lint/test — see Done evidence). **What remains founder-gated:**
  reviewing the PR, then applying the migration to the live Supabase project (`apply_migration` +
  `get_advisors`) — this agent did not touch any prod/live Supabase project per its task constraints.
- Deviation from the dossier's literal plan: the dossier suggested a plain `UPDATE … WHERE id IN (...)`
  migration; built instead as an `insert … on conflict (id) do update set` targeting only the 4 changed
  columns, mirroring the MV-13 bridge migration's own idempotent upsert idiom (which
  `tests/programs/parse-seed-migration.ts` already knows how to parse — avoids writing a second, bespoke
  UPDATE-statement SQL parser for one migration). `seed-migration-parity.test.ts`'s `finalSqlPrograms()`
  now overlays 3 migrations (seed → bridge → English), each upsert winning on id.

## Done evidence (2026-07-02, agent pre-build)

- **Branch:** `mv-21-program-english-enrichment` off `master` (`42d95a2`). PR opened against `master`.
- **Files changed:** `lib/data/types.ts` (AuRmitProgram gains optional `test`/`overallMin`/`perBandMin`),
  `lib/data/schema/au-rmit-programs.schema.ts` (matching Zod fields), `lib/data/source/au-rmit-programs.ts`
  (5 rows populated + findingRefs), `lib/data/source/au-university-programs.ts` (Deakin row + E.050 ref),
  `lib/programs/seed.ts` (6 rows' minEnglish/minEnglishBand/notes/findingRefs), new migration
  `supabase/migrations/20260702000000_enrich_program_english_requirements.sql`,
  `tests/programs/bridge-fact-parity.test.ts` + `tests/programs/seed-migration-parity.test.ts` (extended),
  `docs/research-briefs/findings/E.jsonl` (9 findings pending→used via `FLIP_STATUS=1`, value/value_type/
  value_status populated for reconcile fidelity).
- **TDD:** RED confirmed via `npm run typecheck` (`TS2339: overallMin does not exist on AuRmitProgram`)
  before the type change; RED confirmed via `bridge-fact-parity.test.ts` assertion failure before `seed.ts`
  update; RED confirmed via `reconcile-modules.test.ts`/`flip-status.run.test.ts` before running
  `FLIP_STATUS=1`. Each fixed to green before moving on.
- **Gate:**
  - `npm run typecheck` — clean, 0 errors.
  - `npm run lint` — 0 errors, 1 pre-existing unrelated warning in `docs/kanban/build.mjs` (untouched by
    this change, confirmed via `git diff origin/master -- docs/kanban/build.mjs` = empty).
  - `npm test` — **1588 passing, 1 pre-existing failure** (`tests/data/freshness.test.ts`, 16 unrelated
    AU fee/tax/wage records dated 2026-07-01, fixed by open PR #36 — not touched by this card).
  - Targeted re-checks: `bridge-fact-parity.test.ts` (5/5), `seed-migration-parity.test.ts` (3/3),
    `reconcile-modules.test.ts` + `reconcile.test.ts` + `flip-status.run.test.ts` (13/13),
    `tests/scoring/characterization.test.ts` + `tests/matches/*` (71/71, goldens byte-identical),
    `tests/checklist/*` + `tests/programs/*` (114/114).
- **Sanity-verified rendered values** (ad-hoc test, removed after use): all 6 rows carry the dossier's
  table values exactly — rmit-bachelor-computer-science 6.5/6.0, rmit-bachelor-nursing 7.0/7.0 + combined
  AHPRA + July-intake-restriction note, rmit-bachelor-pharmacy-honours 7.0/6.5,
  rmit-bachelor-education-primary-early-childhood 7.5 (no per-band given by the source),
  rmit-master-social-work 7.0/7.0, deakin-master-of-data-science 6.5/6.0.
- **Founder-gated (not done by this agent):** applying the migration to the live Supabase project
  (`apply_migration` + `get_advisors` + founder GO, the MV-13 D5 pattern) and merging the PR. No prod/live
  Supabase project was touched.
