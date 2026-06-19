# MV-13 — Bridge the TS fact layer into the DB program catalogue

**Status:** In progress — **DB bridge APPLIED TO PROD 2026-06-19** (founder GO given). **Owner:** founder+agent · **Priority:** P2.

**Done so far:** local slice committed `da28e36` (gate green: typecheck/lint, 1150 tests, goldens
byte-identical). Migration `20260619000000_bridge_fact_layer_programs.sql` **applied to prod**
(project `obfvrxixtautamflzxzq`) via `apply_migration` → `{success:true}`; `get_advisors`
(security+performance) returned **only pre-existing, unrelated** items (leads RLS-no-policy INFO,
leaked-password WARN, unused-index INFOs) — **zero new issues**. The new columns are covered by the
existing `programs_read` RLS policy (no policy change). Live catalogue now 83 programs (64 base, 3
enriched, +19 bridged with provenance).

**REMAINING (the only open step):** flip the bridged Category-E findings → `used` (the E.0xx refs
cited by the 22 bridged rows) via the FLIP_STATUS ritual + reconcile + promote `value_status`
unset→prose-only, gate green. Then move MV-13 → In Review. NOTE: the findings are cited by the
already-registered fact modules (au-rmit-programs / au-university-programs), so the flip is driven by
those modules + flip-status.js, not the DB — confirm the exact mechanic against
`docs/research-briefs/_tools/flip-status.js` + `reconcile.js` at resume.

**Gate history:** founder approved the card 2026-06-19; delegated D1/D2 ("do what's best / consult
codex") → MERGE + DEFER BOTH (Codex-agreed); D5 prod-write GO given 2026-06-19.

## DECISION (2026-06-19) — founder delegated → Codex (GPT-5) triangulated → MERGE + DEFER BOTH

Reading both fact-layer files end-to-end changed the picture vs kickoff; founder delegated the call,
Codex agreed with my leaning. **Final scope:**

**Data ground truth:** RMIT module = 21 programs (19 bachelor/master + 1 Diploma of Nursing + 1
Graduate Diploma); the RMIT type has **NO English/IELTS field at all** (only tuition/duration/grade
on some). University module = **only 8** (UTS Master of Pharmacy [rich: tuition + IELTS 7.0/7.0 +
accrediting body], Melbourne Master of Education [tuition only], Deakin Master of Data Science
[tuition only], + **5 Torrens** [CRICOS + name + field ONLY — no tuition/grade/English]). Fact ids
don't collide with seed ids but several **semantically duplicate** existing generic RMIT rows
(name-identical "Master of Data Science"; also Master of IT, Bachelor of IT). Fact tuition is
per-year → tuition_min=tuition_max. `programs.field` is `text` with **no CHECK** → free strings OK.

**D1 = MERGE.** Enrich the 3 true-twin generic RMIT rows in place (keep their English minimums,
`generated` stays false): `rmit-bit` ← bachelor-information-technology (findingRefs E.057/058/059,
duration 3y, grade 65); `rmit-mit` ← master-information-technology (E.051/054, 2y); `rmit-mds` ←
master-data-science (E.046/047, 2y). **INSERT** the 16 genuinely-distinct new RMIT bachelor/master
rows (6 specific engineering be/me civil·electrical·mechanical; bachelor-computer-science; cyber
security; business; professional accounting; MBA; project management; bachelor-nursing; pharmacy
hons; bachelor-education; social work) + the 3 university rows (UTS Pharmacy E.101–108; Melbourne
Education E.100; Deakin Data Science E.049). `generated=true` on the 16+3=19 inserts. Catalogue
64→83. No row deletes (preserves user_program_state). `rmit-meng`/`rmit-mnurs` stay generic (no
clean fact twin). Twin-matching kept conservative per Codex ("if uncertain, don't merge").

**D2 = DEFER BOTH.** The 2 RMIT diplomas never surface (engine targets bachelors/masters only). The
5 Torrens rows have no tuition/grade/English → would render near-empty AND rank as easiest/cheapest
(null→0 in compute.ts) = trust regression; also Torrens isn't a universities row. → **No level-enum
CHECK change, no Torrens seeding this slice.** Their E findings stay pending (documented, not dropped).

**D3 (trimmed) = add `duration_years numeric` + `finding_refs text[]` + `generated boolean default
false`.** **DEFER `cricos_code`** — zero bridged rows would populate it this slice (Torrens deferred,
RMIT has none, UTS's CRICOS is provider-level via MV-07), so adding it now is speculative (YAGNI);
ships with the Torrens follow-up that needs it.

**Field normalization:** map fieldOfStudy → catalogue enum where it maps (engineering / computer-science
[incl cyber] / business / accounting / nursing); accurate kebab otherwise (pharmacy, social-work,
education, project-management, public-health) — soft-rank only, harmless when unmatched.

**Card (Codex condition):** bridged rows with null `min_english` must read "English requirement not
listed — confirm with provider" (honest absence), NOT silently omit the IELTS line (which could read
as "no English needed"). Copy founder-reviewable at the gate.

**Approach (simplicity-first, idiomatic):** hand-author the 19 new + 3 enriched rows in `seed.ts` +
migration #3, guarded by a NEW **fact-layer-parity test** that asserts each bridged seed row matches
its `au-rmit-programs.ts` / `au-university-programs.ts` source (the anti-drift guarantee — same role a
generator would play, but mirrors the existing `seed-migration-parity` pattern; no new generator
module). Keep the existing seed↔migration parity green (extend it for the new columns/rows + migration #3).

**Build order (TDD):** (1) RED fact-layer-parity test; (2) `seed.ts` rows + Program type gains
durationYears/findingRefs/generated; (3) migration #3 (ALTER add 3 cols; UPDATE-enrich 3; INSERT 19
generated=true); (4) extend seed-migration-parity to parse #3 + new cols; (5) repo `mapProgram` +
Program type + program-card render (duration + null-english treatment); (6) gate green — goldens
expected **byte-identical** (scoring-derived, not catalogue), seed.test count holds (83 ≥ 50);
(7) dev-branch apply + `get_advisors`; (8) **D5: show SQL → founder GO → prod**; (9) flip the bridged
E findings `used` (FLIP_STATUS + reconcile + promote value_status). **Rollback:** `DELETE FROM
programs WHERE generated=true` (the 3 enrichments are additive/harmless).

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
