# MV-06 — Integrate ledger slice E/I

**Status:** In progress (kickoff/scoping). **Owner:** agent · **Priority:** P2.
**Gate:** none to start scoping; a founder steer is needed on *which* findings to surface
before integration (see Open steer below).

## What this card is

The research ledger holds ~1,118 findings (516 used / 594 pending / 8 rejected). ~195 are
**"ready"** (integration-only — already sourced + reconciled, no new sourcing needed). This
card integrates the high-value **Category E** (program/policy: IELTS/duration, fee/threshold —
feeds scoring *and* program-card copy) and **Category I** (Genuine Student) ready findings into
the live app, so verdict/cost/recommendation copy reflects current sourced facts.

Tooling: `node docs/research-briefs/_tools/reconcile.js` + the FLIP_STATUS/goldens ritual (per
the ledger-slice lane). Integration that feeds the engine path bumps RULE_VERSION + regenerates
`golden-assessments.json` deliberately; copy-only integration leaves goldens byte-identical.

## ⚠️ Premise correction (from MV-09 recon, 2026-06-19)

The forward plan (§2) flagged Category E as the "non-negotiable exception" because of two live
figures — visa fee `710→1,600` and financial capacity `24,505→29,710`. **MV-09 recon already
disproved the urgency:** the app's visa fee is already **AUD 2,000** (`lib/data/policy/au-visa-fees.ts:20`)
and capacity already **AUD 29,710** (`lib/data/policy/au-cost-of-living.ts:26`), both
`lastVerified 2026-06-07`. So the *correctness* part of slice E is **already done** — this card
is now the **copy-heavy, non-urgent** remainder: surfacing the rest of the ready E/I findings.

## Open steer (founder)

Now that the headline E figures are confirmed current, the real question is **which of the ~195
ready findings carry enough user value to integrate vs. stay deferred** (trust-first ≠ integrate
every note). First scoping step (post-compact): run reconcile.js, list the E/I "ready" findings,
and bring the founder a tight "surface these N, defer the rest (with reason)" packet — not a
blind integration of all 195.

## Scoping result (2026-06-19) — surface-vs-defer packet, awaiting founder steer

Ran the ledger (sandbox parse of `findings/E.jsonl` + `findings/I.jsonl`). Ready set:
**Category E = 45 ready** (of 176; 80 used, 25 use-later, 23 needs-human-call).
**Category I = 4 ready** (of 80; 32 used, 27 use-later, 10 needs-human-call, 6 stale).

**Pivotal structural finding — most E "ready" has no live home:**
- Every E ready finding's `target` is `lib/data/programs seed (+ course-career)` = the **TS fact
  layer** (`lib/data/source/au-rmit-programs.ts`, `au-university-programs.ts`). That layer is
  **dormant**: imported only by `lib/data/schema/registry.ts` (provenance/validation registry) —
  **no `components/`, `app/`, or `lib/matches` path renders it** (grep-confirmed). Same dormancy
  trap MV-07 fixed for CRICOS — but here there isn't even a latent consumer to switch on.
- The **live program cards** (`components/matches/program-card.tsx`) render the **DB catalogue**
  (64 rows, seed migration `20260604120000`): 15 unis × ~4 **generic** programs ("Bachelor of IT",
  "Master of Data Science", "Master of Nursing"…), **all `derived`/estimated quality (verified=0)**,
  `notes` mostly null. The card *does* render `minEnglish`/`minEnglishBand` + a "Good to know"
  `notes` block — but those are already (estimated) populated and keyed to generic rows.
- The 45 E findings name **specific** programs/unis the DB catalogue doesn't carry — RMIT
  Pharmacy/Dip-Nursing/B-Nursing/BSW/MSW/B-Ed, UTS Master of Pharmacy, Deakin Master of Data
  Science, and **ECU + Torrens (not among the 15 seeded unis)**. So they can't even attach to a
  live card's notes without first adding those programs.

**Recommendation (the steer):**
- **SURFACE NOW — the 4 Category I findings** (target `app/(app)/journey/refusal-recovery (+ plan
  rules)`, a **shipped** surface; why-ready notes say each maps to copy/checklist that already
  exists): **I.010** PIC 4020 / clause 500.217 (legal hook behind shipped fake-doc copy I.027/028),
  **I.025** English-evidence requirement (maps to shipped checklist + profile English step),
  **I.026** OSHC timing — cover ≥1 week before course (maps to shipped checklist), **I.058** MI ≠
  permission to stay (fits the MI block). All `process|unset` (prose-only) → integration = attach
  as `used` provenance/citations on existing copy (verify there's a SourceLine-style hook to attach
  to; copy-only, goldens untouched).
- **DEFER — all 45 Category E findings** — no live home (dormant fact layer + programs/unis not in
  the live catalogue). Their real unlock is a **prerequisite "bridge" slice**: replace/augment the
  generic `derived` DB catalogue with the primary-sourced TS fact layer (real RMIT/UTS/Deakin
  programs + verified IELTS/duration/notes + CRICOS). That is the genuinely high-value move (today
  *every* live card shows estimated data, zero verified) — but it's a bigger slice: seed-migration
  change → **founder DB approval**, matches-engine + goldens impact. Recommend it as its own card,
  not folded into MV-06.

Net: MV-06 shrinks to "surface the 4 I findings"; the E value is real but gated behind a DB-bridge
slice that needs founder approval.

## Build progress (2026-06-19) — founder steered "do what's recommended"

Surfaced as copy-only gov citations via the `provenance.findingRefs[]` → FLIP_STATUS path
(status is machine-derived, not hand-edited). All four are `process|prose-only` → **no engine
path; `golden-assessments.json` byte-identical**. Each integration: add the finding to the right
registered module's `findingRefs`, run `FLIP_STATUS=1` (sets `status:used` + `used_by`, clears
triage), promote `value_status` unset→prose-only (the reconcile `USED_UNSET` rule requires it),
gate green. TDD failing-test-first per finding.

- **I.010 ✅** (clause 500.217 → PIC 4020) — rides in `findingRefs` + note on the existing
  `ground-document-integrity` row (plain copy unchanged; mirrors the GS row's I.008 pattern).
  Commit `84d518c`.
- **I.058 ✅** (MI request ≠ permission to stay; must still arrange to leave) — new `recovery-path`
  row in `nepal-refusal-recovery.ts` linked to the after-you-request DHA page. **New founder-
  reviewable copy** (faithful gov myth-buster restatement). Commit `84d518c`.
- **I.026 ✅** (OSHC ≥1 week before course, full stay) — pure-citation onto the existing `oshc`
  row in `au-student-visa-requirements.ts` (copy already exact; cross-category corroboration of
  A.006–A.010). Commit `e0cf362`.
- **I.025 ✅** (English: approved test **OR** exemption) — was NOT a pure citation: the checklist's
  English item is generated **inline** in `lib/checklist/generator.ts` (unregistered, so a ref there
  won't flip to `used`) and no existing copy stated the "approved test OR exemption" fact. Solution:
  a **new registered `english` record** in `au-student-visa-requirements.ts` carries the fact +
  `findingRefs ["I.025"]` (this is what flips it to `used`); the inline English item now appends that
  record's summary via `VISA_REQ["english"].summary` (single-source-of-truth, **no duplicate IELTS
  row**), and the fallback admission line dropped its redundant "…and the visa" clause to avoid a
  stutter. Added `"english"` to the `AuStudentVisaRequirement` id union (types + Zod schema). Copy
  **triangulated via Codex** and **founder-approved** as the general phrasing — "Required for the
  visa. Provide evidence of an approved English test score, or evidence that you qualify for an
  exemption." — deliberately **no exempt-country example** (the UK/US/CA/NZ/IE-citizen route is
  irrelevant to ~all Nepal→Australia applicants; the DHA source link carries exemption detail).
  Commit `6219bac`.

Gate after each: typecheck/lint clean, full suite green (1140 → 1145 tests, +5 TDD across the slice),
goldens byte-identical, reconcile + findings-integrity + flip-status guard green.

**Card status: all 4 I findings surfaced → moved to In Review (human gate) 2026-06-19.**

**Deferred Category E** spun into its own card **MV-13** (bridge the TS fact layer into the DB
catalogue; founder DB approval gated).

## Acceptance criteria (to be firmed during scoping)

- [ ] Reconcile.js run; E/I "ready" findings enumerated with value tier + which live surface
      each would feed (verdict input vs. program-card copy vs. cost copy).
- [ ] Founder steer recorded on the surface-vs-defer split.
- [ ] Integrated findings wired with `source`/`lastVerified`; engine-path changes bump
      RULE_VERSION + regenerate goldens deliberately; copy-only changes keep goldens identical.
- [ ] Gate green (typecheck/lint/test); FLIP_STATUS green.
- [ ] Deferred findings recorded with a reason (not silently dropped).

## Resume notes (for a cold agent after compaction)

- MV-08 (the prior card) is **done + committed** to master (`0bdc5ab`, Codex review folded) and
  sits at the founder gate — do not reopen it.
- This card was moved to In Progress on 2026-06-19; the **heavy ledger exploration had not yet
  started** at kickoff. Start by running the reconcile tool and reading the E/I ready findings;
  do NOT integrate before the founder steers the surface-vs-defer split.
- Engines are already unified (MV-01 done), so the "do after engines unified" precondition is met.
