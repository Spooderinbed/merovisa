# MV-13 — Bridge the TS fact layer into the DB program catalogue

**Status:** Backlog. **Owner:** founder+agent · **Priority:** P2.
**Gate to start:** founder approval of a `programs` seed-migration change (prod DB write).

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
