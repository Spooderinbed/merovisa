# MV-13 — Bridge the TS fact layer into the DB program catalogue

**Status:** In progress (kickoff — migration shape triangulated 2026-06-19). **Owner:** founder+agent · **Priority:** P2.
**Gate to start:** founder approved the card 2026-06-19 ("approve the MV-13 DB seed-migration"). Two
forks (D3/D4 below) still need a founder pick; the actual migration SQL gets one explicit GO before
`apply_migration` touches prod.

## Why this exists (spun out of MV-06)

MV-06 scoping found the real reason the **45 ready Category-E findings** carry zero current
user value: they target the **TS fact layer** (`lib/data/source/au-rmit-programs.ts`,
`au-university-programs.ts`), which is **dormant** — imported only by the validation registry
(`lib/data/schema/registry.ts`); **no `components/`, `app/`, or `lib/matches` path renders it**
(same dormancy trap MV-07 fixed for CRICOS, but here there isn't even a latent consumer). The
**live program cards** render the **DB catalogue** (64 rows, seed migration `20260604120000`):
~15 unis × ~4 **generic** programs, **all `derived`/estimated (verified=0)**, `notes` mostly null.
The E findings name **specific** programs/unis the catalogue doesn't carry (RMIT Pharmacy/Nursing/
SocialWork/Ed, UTS Master of Pharmacy, Deakin Master of Data Science, **ECU + Torrens — not among
the 15 seeded unis**). So they can't even attach to a live card without first adding those programs.

## What this card is

Replace/augment the generic `derived` DB program catalogue with the **primary-sourced TS fact
layer**: real RMIT/UTS/Deakin (etc.) programs with verified IELTS/duration/tuition/notes + CRICOS,
so live program cards show **verified** data instead of estimates. This is the genuinely high-value
move (today *every* live card shows estimated data, zero verified) and the home that makes the 45
Category-E findings user-visible.

## Why it's bigger than a copy slice (the gate)

- **Prod DB change** — a `programs` (and possibly `universities`) seed-migration rewrite → needs
  **explicit founder approval** (Supabase prod writes are founder-gated).
- **Matches-engine impact** — `lib/matches/compute` ranks over the catalogue; changing rows shifts
  match results and may move the engine path → **regenerate `golden-assessments.json` deliberately**
  and review the diff (this is NOT copy-only).
- **Parity guard** — `tests/programs/seed-migration-parity.test.ts` locks DB↔seed parity; the bridge
  must keep it (or evolve it) green.
- **New unis** — seeding ECU + Torrens (and any others the E findings name) means new `universities`
  rows + CRICOS lookups.

## Likely shape (to be designed)

Generated-data pipeline per the forward plan §4: TS fact layer is the reviewed source of truth →
load the **queryable subset** (programs + verified attributes) into Postgres via migration; the DB
never becomes hand-edited truth. Decide: full replacement vs. augment-generic-with-verified; how
`quality: derived|verified` is surfaced on cards; how unsourced generic rows coexist with verified.

## Deferred findings parked here

45 ready Category-E findings (program IELTS/duration, fee/threshold, program-specific notes).
Enumerated in `docs/research-briefs/findings/E.jsonl` (`status: pending`, `triage: ready`). They
stay pending until this bridge gives them a live home; integrating them then is the value payoff.

## Kickoff triangulation (2026-06-19) — migration shape (Explore map + Codex)

Two independent passes — an Explore factual map of the repo and a Codex (GPT-5) design pass — and
they converge. Captured here so a cold agent can resume.

**DB `programs` schema today** (`supabase/migrations/20260604002139_add_programs_universities_state.sql`):
PK `id` text; `university_id` text NOT NULL FK→universities CASCADE; `name`; `level` text CHECK ∈
(`bachelors`,`masters`,`doctorate`); `field`; `tuition_min/max` numeric; `tuition_currency`;
`min_grade` int; `min_english` numeric(3,1); `min_english_band` numeric(3,1); `intakes` text[];
**`source`, `last_verified`, `data_quality` (CHECK ∈ primary|derived|secondary, default derived),
`notes` already exist**. Indexes on university_id/field/level. **No `cricos_code`, no duration, no
finding_refs.** Render path: `lib/programs/repo.ts` selects these → `components/matches/program-card.tsx`
renders tuition/minGrade/minEnglish(+band, hard-labelled "IELTS")/intakes/notes/`data_quality`→
Verified|Estimated/`last_verified`/`source`. CRICOS is a *university-level* lookup (MV-07), not per-program.

**⚠️ Premise to verify at build start (read `lib/programs/seed.ts`):** Explore found the 64-row seed
already has **~20 `primary`-quality rows** (RMIT/UTS/Deakin/Curtin/WSU/ANU), ~44 `derived`. So "every
live card shows estimated data, verified=0" is **partly overstated** — but `seed.ts` is **hand-authored
(not generated from the TS fact layer)** and even the primary rows carry **no provenance/finding_refs**.
MV-13's real value is therefore: (1) **provenance link** (finding_refs → the home for the 45 Category-E
findings + reconciliation), (2) **coverage** (programs/unis the seed lacks), (3) make the seed a
**generated artifact** from the TS fact layer (single source of truth), (4) CRICOS/duration columns.

**Bridgeable TS set:** `au-rmit-programs.ts` (21 RMIT programs; level enum `bachelor|master|diploma|
graduate-diploma`; `durationYears`; **no IELTS**; free-form `fieldOfStudy`; `entryMinAveragePct`) +
`au-university-programs.ts` (~15 across UTS/Melbourne/Monash/Deakin/Torrens; HAS `cricosCode`,
`test`="IELTS", `overallMin`, `perBandMin`, `accreditingBody`, optional `durationYears`) ≈ **~36 programs
fit the `programs` table**. `au-pathway-programs.ts` (~13 college foundation/diploma programs;
`durationMonths`/`leadsTo`; college-level) **does NOT fit** → separate table, **DEFER**. Torrens has no
`universities` FK target yet; ECU is only in `au-cricos-codes.ts` (not a programs module) → not a bridge
concern this slice.

**Recommended shape (converged Explore+Codex):**
1. **AUGMENT, not replace** — `INSERT … ON CONFLICT (id) DO UPDATE`; verified TS rows win, generic rows
   stay where no verified equivalent exists. **Never truncate** — `user_program_state.program_id` FK
   CASCADE would wipe user data. Upsert `universities` first (incl. Torrens so the FK exists), then `programs`.
2. **Add columns:** `cricos_code text`, `duration_years numeric` (and/or `duration_months int`),
   `finding_refs text[]` (the provenance link), `generated boolean DEFAULT false` (clean rollback:
   `DELETE WHERE generated=true` leaves hand-seed untouched). Reuse existing source/last_verified/data_quality/notes.
3. **Parity test → generator test:** normalize the TS fact modules → canonical seed rows → generate the
   seed SQL → assert it equals the committed migration (restructure `tests/programs/seed-migration-parity.test.ts`
   + `lib/programs/seed.ts`). Seed becomes a derived artifact, can't drift.
4. **Blast radius:** `golden-assessments.json` is produced by `runAssessment` (scoring **rules/config**),
   **not** the program catalogue → expect **byte-identical** (CONFIRM at build). What WILL change: match-page
   fixtures / any snapshot test referencing program IDs/counts → regenerate deliberately. RLS: `select *`
   covers new columns, **no policy change**.

**Top landmine (Codex):** **level-enum mismatch.** TS uses `bachelor|master|diploma|graduate-diploma`;
DB CHECK only allows `bachelors|masters|doctorate`. RMIT diploma/graduate-diploma programs have **no valid
DB level** — a wrong/empty value silently drops rows from matches. → **D4 below.**

**Open founder decisions (D1–D2 recommended; D3–D5 need a pick):**
- **D1 (recommend AUGMENT):** augment/upsert vs wholesale replace. → AUGMENT.
- **D2 (recommend):** scope = bridge the ~36 RMIT + university programs now; defer pathways to a later table.
- **D3 (pick):** add `cricos_code`+duration+`finding_refs`+`generated` columns now (recommend — unlocks
  per-program CRICOS, duration, and the provenance link) **vs** minimal data-only upsert into existing columns.
- **D4 (pick — blocks RMIT coverage):** extend the DB `level` CHECK to add `diploma`/`graduate-diploma`
  (carry RMIT diplomas) **vs** exclude diploma-level TS programs from the bridge this slice.
- **D5:** the generated migration SQL gets one explicit founder GO before `apply_migration` (prod write).

**Build plan (TDD, post-decision):** (1) failing generator/parity test; (2) schema migration (columns +
enum per D4); (3) regenerate seed from TS; (4) repo/card render for new columns; (5) apply to a Supabase
**dev branch** + `get_advisors`; (6) show SQL → founder GO → apply to prod; (7) gate green + goldens
confirmed byte-identical + match fixtures regenerated deliberately + Category-E findings flipped `used`.

## Acceptance criteria (to be firmed at design)

- [ ] Founder approves the seed-migration approach + prod DB write.
- [ ] Design doc: replacement-vs-augment, verified/derived surfacing, new-uni seeding, pipeline.
- [ ] TS fact-layer programs loaded into the DB catalogue via migration; parity guard green/evolved.
- [ ] Ready Category-E findings integrated onto the now-live programs (`source`/`lastVerified`),
      flipped used; reconcile + flip-status green.
- [ ] Matches/goldens impact reviewed; `golden-assessments.json` regenerated deliberately if the
      engine path moves; gate green (typecheck/lint/test).

## Resume notes

- This is the **Category-E half of MV-06**, deferred by founder steer on 2026-06-19. MV-06 surfaced
  the 4 Category-I findings (copy-only) and is otherwise done bar I.025 (a small checklist-copy
  decision); see `cards/MV-06-integrate-ledger-slice.md`.
- Do NOT start without founder approval of the DB migration.
