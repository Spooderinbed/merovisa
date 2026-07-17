# Database & Data Strategy

**Auditor section — 2026-07-10 comprehensive audit**
Scope: 16 SQL migrations (`supabase/migrations/`), the `lib/data/**` schema/source/policy split, the seeded `programs`/`universities` catalogue, and how both feed the runtime scorer and UI.

## Verdict up front

The split is defensible for a solo, AI-maintained, single-corridor v1 — and in one respect it is *better* than the conventional "put everything in Postgres" instinct. But it has two structural cracks that get expensive the moment a second corridor or a non-engineer editor appears, plus one live financial input that is drifting unsourced right now. None of these are journey-breaking today; several are trust-eroding and one (FX) can silently flip a verdict.

I also correct a stale ground-truth claim: **the MV-08 outcome "moat" tables are not inert.** Capture is wired end-to-end (see P2-D below).

## What the split buys today (state it honestly, once)

Corridor knowledge lives as ~43 `source/*.ts` + 13 `policy/*.ts` modules, each datum a `Sourced<T>` carrying `findingRefs` → `docs/research-briefs/findings/*.jsonl`, a `source` URL, and `lastVerified`. This is validated three ways: Zod schemas at load (`schema/common.ts:ProvenanceSchema` requires `findingRefs.min(1)`), `tests/data/schema.test.ts`, and the reconcile walker `tests/data/reconcile-modules.test.ts` that asserts every finding ref exists, is `used`, and value-matches. That is a **real per-datum audit trail** — `git blame` + finding id + a machine-checked reconcile — that a Supabase-table-with-a-`source`-column would not give you. For a "trust-first" product whose whole pitch is "every figure is sourced and dated," keeping the knowledge in version control is the correct call. I am not recommending moving it into the DB. Supabase correctly holds only what is genuinely per-user + mutable (assessments, profiles, plan items, documents, program state, outcomes) plus the one shared catalogue (universities/programs). The user-data schema itself is clean: RLS forced on every table, FKs indexed (advisor-clean per `20260618120000_harden_advisors.sql`), owner always server-derived, immutability enforced by trigger where it matters (`program_predictions_no_update`). That part is well done and I found no RLS hole.

Now the cracks.

## Findings

### P1 — The program catalogue is hand-transcribed from TS into SQL; provenance is duplicated and unchecked in the DB copy

The catalogue is the *one* exception to "knowledge lives in TS." It lives in **two** places that must be kept in sync by hand:

- The runtime source of truth is the Postgres `programs` table — `lib/programs/repo.ts:8` reads `db.from("programs").select("*")`; the scorer and matcher only ever see DB rows.
- The reviewed, provenance-carrying source is the TS fact layer (`lib/data/source/au-university-programs.ts`, `au-rmit-programs.ts`), which is what the reconcile harness validates.

The bridge between them is a migration that **hand-copies TS facts into literal SQL `INSERT` statements** — `20260619000000_bridge_fact_layer_programs.sql` re-types tuition, IELTS mins, and `finding_refs text[]` as string literals, then `20260702000000_enrich_program_english_requirements.sql` does it again for 6 rows. The `finding_refs` array now exists in two forms: the TS `provenance.findingRefs` (Zod-validated, reconciled) and the DB `programs.finding_refs` column (a plain `text[]`, **validated by nothing**). Nothing asserts the two agree. A migration typo — `min_english 6.5` in TS but `7.0` fat-fingered into the SQL literal — ships to production, drives real `englishGap` match verdicts, and passes every test in the suite, because the tests validate the TS copy and the scorer reads the SQL copy. This is exactly the class of "green suite, wrong number" bug the reconcile harness was built to prevent, and the catalogue is the one dataset that escapes it.

**Fix now (cheap):** add a `tests/data/programs-catalogue.test.ts` that parses the two bridge migrations' `INSERT` rows and asserts each `(id, min_english, min_english_band, finding_refs, tuition_min)` tuple matches the corresponding TS fact record. It closes the drift window without changing the runtime architecture. Longer term, generate the seed SQL from the TS layer instead of hand-writing it.

### P1 — Source-country is hardcoded; only *destination* is a real dimension. N-corridor scale means duplicating the entire data layer per corridor

The DB models the **destination** dimension honestly: `universities.country`, `assessments.destination_id`, `programs` inherit country via `university_id`. But the **source** country does not exist as a dimension anywhere that matters:

- `lib/scoring/from-sections.ts` hardcodes `homeCountry: "nepal"`.
- `homeCountry` is unused in scoring entirely.
- Every data module is a flat, corridor-named file: `nepal-*.ts` (banks, source-of-funds, NOC, passport, police, refusal-recovery) and `au-*.ts`. There is no `corridors/[np-au]/` structure, no country key inside the records.

Adding Nepal → Canada, or India → Australia, is therefore not "add rows" — it is **fork ~50 TS modules, author a parallel `registry.ts` block, write matching Zod schemas, and re-seed a programs table**, then thread a corridor selector through `from-sections.ts`, `scoring-config.ts`, and every panel that imports a specific `nepal-*`/`au-*` module by name (I count the 4 lookup helpers in P2-C plus `lib/plan/sources.ts`, `lib/matches/evidence.ts`). CLAUDE.md claims "architecture supports expansion without code changes" — **that claim is false for the source-country axis.** It is true only for adding *destinations* the scorer already has thresholds for. The founder should stop repeating the "no code changes" line internally; it will drive a bad estimate the day corridor #2 is greenlit.

This does not need fixing now (MVP is single-corridor by decision), but the founder should cost corridor #2 as a **multi-week data-layer refactor**, not a content task, and the next time a data module is authored it is worth asking "would a `corridor` field on this record have been free?" — retrofitting one is cheap; retrofitting fifty is not.

### P2-A — FX_RATES are hand-entered, unsourced, 5+ weeks stale, and gate the DHA financial verdict

`lib/data/policy/fx-rates.ts` hardcodes NPR 135 / AUD 1.5 per USD with `findingRefs: []`, `source: "internal-heuristic"`, `lastVerified: "2026-06-02"`, and **no `reverifyBy`**. `toAud()` feeds `lib/scoring/financial.ts`, which is what the Australia DHA capacity gate compares against `AU_DHA_LIVING_CAPACITY_AUD` (29,710) + tuition. A student enters their budget in NPR; the NPR→AUD rate decides whether they clear the capacity floor (no cap), land in the 0.75× band (value capped at 49, blocks "strong"), or fall below (capped at 29, forced "reach"). The single most consequential number in the financial dimension is a hand-typed approximation that is **already 38+ days old** and, because it carries no `reverifyBy`, the freshness guard will *never* go red on it. Every other volatile fact in the system is forced to declare `reverifyBy` (schema refine `missingReverifyBy`); FX exempts itself by leaving `volatility` unset. That is the loophole. A real NPR depreciation of a few percent silently moves the capacity boundary for the exact population the product serves.

**Fix now:** give `FX_RATES` a `volatility: "volatile"` + a 30-day `reverifyBy`, so the existing guard forces a re-check, and add a short comment that it gates the capacity verdict. This is a one-line honesty fix with outsized trust value.

### P2-B — `profiles.sections` is a schemaless JSON blob with no version field, and it has already drifted once

`profiles.sections jsonb` (migration 2) stores the 13-section editor with **no schema version column**. Migration `20260605120000_normalize_profile_enums.sql` already had to retrofit legacy enum values (`self`→`self-funded`, `parents`→`parents-family`, `high-school`→`higher-secondary`) with a hand-written `jsonb_set` guessing at old shapes. That migration is proof the shape drifts silently and that fixing it after the fact is archaeology. There is no `sections_version` to branch on; the next `StudentProfile` shape change repeats the same guess-the-old-shape migration. `sectionsToStudentProfile` also silently defaults (`grade` → 0, `gradeSystem` → `"percentage-nepal"`), so a malformed/old blob produces a *plausible wrong verdict* rather than an error.

**Fix now (cheap):** add a `sections_version int not null default 1` column and stamp it on write; branch normalization on it instead of sniffing enum values. Assessments already do this correctly via `rule_version` — profiles should mirror it.

### P2-C — Four consumed data modules escape the reconcile/provenance walker

`au-cricos-directory`, `au-nepal-evidence-levels`, `au-oshc-premiums`, `au-enrolment-lodgement` are **not** in the `DATA_MODULES` registry (`grep -c` over `registry.ts` = 0), yet they are read at runtime by `lib/data/cricos-lookup.ts`, `lib/data/nepal-evidence-lookup.ts`, `lib/data/cost-estimate.ts`, `lib/matches/evidence.ts`, and `lib/plan/sources.ts`. Because the reconcile walker (`tests/data/reconcile-modules.test.ts`) and `schema.test.ts` iterate `DATA_MODULES`, these four modules' `findingRefs` are **never checked to exist, be `used`, or value-match** — the exact guarantee that underpins the "every figure is sourced" promise. `au-nepal-evidence-levels` feeds the DHA passport-evidence level shown on matches; `au-oshc-premiums`/`au-enrolment-lodgement` feed the cost-to-apply panel. These are user-facing sourced figures with an unverified provenance chain.

**Fix now:** register the four modules in `DATA_MODULES` (each already has a sibling `.schema.ts`), or add an explicit allow-list test that fails when a `lib/data/source/*.ts` module is imported by app code but absent from the registry. The latter prevents the class recurring.

### P2-D — Correction to ground truth: the outcome "moat" is wired, not inert (but only self-reported capture)

Multiple ground-truth notes call the MV-08 tables "INERT — no request path writes them." **That is stale.** The capture loop is live:

- `app/api/shortlist/route.ts:44` calls `captureApplication()` when a program is marked `applied` → `lib/outcomes/on-apply.ts` → `insertAttempt` + `lib/outcomes/freeze.ts:insertPrediction` (freezes the prediction-of-record).
- `components/outcomes/outcome-funnel.tsx:101` renders `OutcomeSelfReport`, which POSTs `/api/outcomes/event` (`outcome-self-report.tsx:67`) → `insertEvent`.

So predictions, attempts, and self-reported events **do** get written for any signed-in user who shortlists→applies→self-reports. What is genuinely missing is the **verification/calibration half**: the `outcome_events` INSERT policy hard-forces `source='self_reported'` and `verified_by is null` (migration `20260620000000` `oe_insert_own`), and there is **no admin promotion path** to `document_verified`/`official_verified` in the codebase. The moat therefore captures unverified funnel data it cannot yet trust for calibration — which is the honest state, but the roadmap should describe it as "capture live, verification blocked," not "inert."

### P3 — The document-kind enum is triplicated by hand

The 20-value kind list is duplicated verbatim in `documents` (CHECK), `document_status` (CHECK, migration `20260626000000`), and `lib/documents/types.ts:DOCUMENT_KINDS` (the Zod source of truth). The migration comment itself flags the drift risk ("keep them in lockstep"). Adding a kind = three edits, two of them SQL, with nothing enforcing agreement. Low severity (adding a document kind is rare) but a `tests/data/document-kinds.test.ts` asserting the TS array equals the DB CHECK lists would remove the footgun for free.

### P3 — No non-engineer editing path exists

Every sourced datum — and every catalogue row, since `programs` is only writable via migration — requires a TypeScript/SQL edit, a PR, and a green typecheck. For a v1 the design spec calls "human-verified, manually maintained," the **founder is the only possible editor, and only through git.** This is fine at 1,118 findings and one corridor. It becomes the bottleneck the moment a non-technical researcher is meant to update a fee, or when quarterly DHA fee changes (the 2026-07-02 scout caught 12 at once) must be turned around fast. Not a fix-now item — but the founder should know the "manually maintained" dataset has a **single technical editor** and no CMS, and plan corridor/dataset growth around that constraint rather than assuming a researcher can be handed the data.

## Freshness automation: a build-time test is not a monitor

`reverifyBy` dates are enforced only by `tests/data/freshness.test.ts`, which runs in CI. It goes red **only when someone pushes a commit.** A DHA fee that changes on 2027-07-01 (15 facts cluster on that single date) ships stale from that morning until the next unrelated commit triggers CI — there is no cron, no scheduled re-verify, no alert. For a product whose differentiator is freshness, "the test will fail next time we happen to push" is weak. A scheduled GitHub Action running `npm test -- freshness` daily would convert the passive guard into an actual monitor for near-zero cost.

## Proposed schema-evolution path (migration order)

| # | Change | Why / severity |
|---|--------|----------------|
| 1 | `alter table profiles add column sections_version int not null default 1` | P2-B — stop guessing old blob shapes |
| 2 | Test-only: `programs-catalogue.test.ts` diffs bridge-migration SQL rows vs TS fact layer | P1 — close the catalogue drift window |
| 3 | Test-only: registry-completeness test (source module imported by app ⇒ must be in `DATA_MODULES`) | P2-C — pull the 4 orphans under the walker |
| 4 | Code-only: `FX_RATES` gains `volatility:"volatile"` + 30-day `reverifyBy` | P2-A — force re-check of the capacity-gate input |
| 5 | Test-only: `document-kinds.test.ts` asserts TS array == both DB CHECK lists | P3 — enum triplication |
| 6 | CI: scheduled daily freshness run | freshness monitor, not a push-gated test |
| 7 | *(only when corridor #2 is real)* introduce `corridor` field on data records + `corridors/` structure + corridor selector in `from-sections.ts` | P1 — the multi-week refactor, deferred deliberately |

## What should NOT move yet

- **Do not move corridor knowledge into Postgres.** The git + `findingRefs` + reconcile + Zod chain is a genuine trust asset; a DB `source` column is strictly weaker. Keep it in TS.
- **Do not build the outcome-verification/admin-promotion path** until the legal gates (PIA / minor-consent / VEVO ToS, per MV-08) clear — the capture side is correctly ahead of traffic; adding verification now buys nothing and adds compliance surface.
- **Do not add a scholarships DB table** (MV-55) — the TS `au-scholarships`/`australia-awards` modules back a read-only panel; there is no per-user scholarship state to persist yet.
- **Do not build a CMS.** At one corridor and one editor, git is adequate; a CMS is premature until either the source-country axis or a second human editor arrives.
