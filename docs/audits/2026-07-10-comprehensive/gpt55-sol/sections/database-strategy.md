# Database & Data Strategy

**Auditor section — 2026-07-10 comprehensive audit**
Scope: 16 SQL migrations (`supabase/migrations/`), the `lib/data/**` schema/source/policy split, the seeded `programs`/`universities` catalogue, and how both feed the runtime scorer and UI.

## Verdict up front

The split is defensible for a solo, AI-maintained, single-corridor v1 — and in one respect it is *better* than the conventional "put everything in Postgres" instinct. But it has two structural cracks that get expensive the moment a second corridor or a non-engineer editor appears, plus one live financial input that is drifting unsourced right now. None of these are journey-breaking today; several are trust-eroding and one (FX) can silently flip a verdict.

I also correct a stale ground-truth claim: **the MV-08 outcome "moat" tables are not inert.** Capture is wired end-to-end (see P2-D below).

## What the split buys today (state it honestly, once)

Corridor knowledge lives as ~43 `source/*.ts` + 13 `policy/*.ts` modules. Registered sourced records generally carry finding references/source/freshness metadata and are checked by Zod/schema/reconcile tests. That is a meaningful audit trail — git history + finding ID + machine checks — though four consumed modules and internal heuristics escape the strongest guarantees. Keeping reviewed knowledge in version control is sound for v1. Supabase holds mutable user state plus the shared catalogue. Cross-user fundamentals are comparatively strong: RLS is forced, FKs are indexed, and service routes generally derive owner server-side. However, RLS does not enforce semantic truth of owner-inserted outcome rows, and several multi-step writes lack transactional integrity.

Now the cracks.

## Findings

### P2 — The TS/SQL catalogue duplication is guarded, but freshness and operational publishing are not

The catalogue is the *one* exception to "knowledge lives in TS." It lives in **two** places that must be kept in sync by hand:

- The runtime source of truth is the Postgres `programs` table — `lib/programs/repo.ts:8` reads `db.from("programs").select("*")`; the scorer and matcher only ever see DB rows.
- The reviewed, provenance-carrying source is the TS fact layer (`lib/data/source/au-university-programs.ts`, `au-rmit-programs.ts`), which is what the reconcile harness validates.

The bridge between them is a migration that hand-copies TS facts into literal SQL `INSERT`/upsert statements. This would normally be a serious drift risk, but the repository already has two meaningful guards: `tests/programs/seed-migration-parity.test.ts` parses the base seed and compares it with `SEED_PROGRAMS`, while `tests/programs/bridge-fact-parity.test.ts` checks bridged/enriched fields against the fact modules. The earlier claim that a migration typo would necessarily ship with a green suite was incorrect.

Residual risk remains: the tests do not turn `last_verified` into a re-verification schedule, do not prove production applied every migration, and the catalogue still requires a developer/PR for every update. **Fix:** extend parity whenever a new decision-driving field is added, add production migration drift checks, and give every course/offering fact a `reverify_by`/effective window. Longer term generate migrations or a published data bundle from one reviewed source rather than maintaining literals twice.

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

So predictions, attempts, and self-reported events **do** get written. A deeper audit found a more serious caveat: authenticated owners can insert these exposed tables directly through Supabase's Data API, bypassing route-only derivation and state-machine checks. RLS proves owner, not semantic truth. Revoke direct INSERT and enforce consistency/transitions inside one transactional function before retaining this as evidence. After that, the missing half remains verification/calibration: user inserts are forced self-reported/unverified and there is no admin promotion path. Canonical status: **capture live, integrity + verification + calibration blocked.**

### P1 — There is no journey/case entity; nearly all user state is owner-global

Profiles, plan items, documents, and program state are scoped primarily to `owner`; assessments carry a destination snapshot, but there is no stable container for “my 2027 Nepal→Australia master's journey” versus a later Canada journey, a deferred intake, or a second application strategy. One user who changes destination/intake/profile overwrites or invalidates state that future multi-journey support would need to keep separate. Before corridor #2, add a `journeys` (or `cases`) table with `owner`, origin, destination, target level/field/intake, base currency/language, lifecycle status, and rule/data-version snapshot. Scope plan items, applications, recommendation runs, documents/requirements, and outcome attempts to `journey_id` where appropriate.

### P1 — `universities` + `programs` is too flat for authoritative course decisions

The catalogue can rank a small MVP list, but it cannot faithfully model multiple campuses, CRICOS **course** codes, delivery modes, course versions, entry-rule variants by source qualification, prerequisites, accreditation, intake openings, application deadlines, deposits, fee schedules, or historical validity. `intakes text[]` and scalar tuition/minimum fields will become lossy as soon as the product promises exact application readiness. Evolve toward `providers → campuses → courses → course_offerings`; attach effective-dated `course_requirements`, `course_fees`, `intakes/deadlines`, and `sources/source_snapshots`. Keep a denormalized published read model for fast matching rather than joining the whole graph on every request.

### P1 — documents model presence, not evidence or packaging

The unique owner+kind shape permits one passport, one bank statement, one transcript, and one `other`. A real case needs multiple sponsors/accounts/statements/pages, translations and originals, issue/expiry dates, versions, review state, rejection reasons, requirement links, and application packages. Separate logical `documents` from immutable `document_versions`/storage objects, and map versions to `journey_requirements` and `application_requirements`. Preserve the current private bucket/RLS pattern.

### P2 — policy/fact publishing needs first-class version and review records at scale

Git history is excellent for the current technical editor, but multi-country operations need structured status: draft/reviewed/published/superseded, effective-from/to, source snapshot hash, reviewer/approver, confidence, volatility, and impacted rule/output IDs. These may initially be generated from TypeScript/JSON into a signed published bundle; they do not require moving the scoring engine into SQL. The key is that recommendations must store the rule version **and** the published data-bundle version that produced them.

### P3 — The document-kind enum is triplicated by hand

The 20-value kind list is duplicated verbatim in `documents` (CHECK), `document_status` (CHECK, migration `20260626000000`), and `lib/documents/types.ts:DOCUMENT_KINDS` (the Zod source of truth). The migration comment itself flags the drift risk ("keep them in lockstep"). Adding a kind = three edits, two of them SQL, with nothing enforcing agreement. Low severity (adding a document kind is rare) but a `tests/data/document-kinds.test.ts` asserting the TS array equals the DB CHECK lists would remove the footgun for free.

### P3 — No non-engineer editing path exists

Every sourced datum — and every catalogue row, since `programs` is only writable via migration — requires a TypeScript/SQL edit, a PR, and a green typecheck. For a v1 the design spec calls "human-verified, manually maintained," the **founder is the only possible editor, and only through git.** This is fine at 1,118 findings and one corridor. It becomes the bottleneck the moment a non-technical researcher is meant to update a fee, or when quarterly DHA fee changes (the 2026-07-02 scout caught 12 at once) must be turned around fast. Not a fix-now item — but the founder should know the "manually maintained" dataset has a **single technical editor** and no CMS, and plan corridor/dataset growth around that constraint rather than assuming a researcher can be handed the data.

## Freshness automation: a build-time test is not a monitor

`reverifyBy` dates are enforced only by `tests/data/freshness.test.ts`, which runs in CI. It goes red **only when someone pushes a commit.** A DHA fee that changes on 2027-07-01 (15 facts cluster on that single date) ships stale from that morning until the next unrelated commit triggers CI — there is no cron, no scheduled re-verify, no alert. For a product whose differentiator is freshness, "the test will fail next time we happen to push" is weak. A scheduled GitHub Action running `npm test -- freshness` daily would convert the passive guard into an actual monitor for near-zero cost.

## Proposed schema-evolution path (migration order)

| # | Change | Why / severity |
|---|--------|----------------|
| 1 | Add `profiles.sections_version` and reject/upgrade unknown shapes at the adapter | Stop plausible wrong verdicts from silent JSON defaults |
| 2 | Fix/qualify FX provenance and add volatility/re-verification metadata | A volatile capacity-gate input needs a watchdog |
| 3 | Add registry-completeness + document-kind parity tests; keep extending existing catalogue parity tests | Pull current escape hatches under machine checks |
| 4 | Add a required scheduled freshness workflow and production migration-drift check | Turn push-time tests into operations |
| 5 | Add `journeys`; scope new application/plan/recommendation records to it, then backfill existing owner-global rows | Required before multiple corridors/intakes overwrite each other |
| 6 | Introduce logical documents + immutable versions + requirement/application joins | Support multiple statements/sponsors/translations and safe replacement |
| 7 | Add effective-dated provider/campus/course/offering/requirement/fee/intake tables, plus a denormalized match read model | Required before claiming exact course/application readiness |
| 8 | Add published data-bundle/source-snapshot/review metadata and store bundle version on every recommendation | Auditable policy change, rollback, and user-impact notification |
| 9 | *(when corridor #2 is approved)* introduce corridor keys/namespaces and replace Nepal/Australia hardcodes | Make expansion a content+rules project instead of a fork |

## What should NOT move yet

- **Do not replace the git + `findingRefs` + reconcile chain with ad-hoc editable DB rows.** At scale, generate a reviewed published bundle and operational metadata; retain immutable source snapshots and git/audit history.
- **Do not build the outcome-verification/admin-promotion path** until the legal gates (PIA / minor-consent / VEVO ToS, per MV-08) clear — the capture side is correctly ahead of traffic; adding verification now buys nothing and adds compliance surface.
- **Do not add a scholarships DB table** (MV-55) — the TS `au-scholarships`/`australia-awards` modules back a read-only panel; there is no per-user scholarship state to persist yet.
- **Do not build a CMS.** At one corridor and one editor, git is adequate; a CMS is premature until either the source-country axis or a second human editor arrives.
