# Content & Data Pipeline — audit section (2026-07-10)

**Auditor lens:** data-operations architecture. Question asked: does the machinery that keeps every datum accurate over time actually hold as the corridor count grows, and what is the cheapest automation that defers the break? I graded against student outcome — a stale tuition figure or a passed scholarship deadline is a self-serve dead-end that bounces the student to a consultancy, which is exactly what the app exists to replace.

## What actually exists (credit where due)

The provenance discipline is real and machine-enforced, not aspirational:

- Every sourced datum carries a `Provenance` (`lib/data/types.ts:9`): `findingRefs[]`, `source`, `lastVerified`, `effectiveDate`, `volatility`, `reverifyBy`.
- The reconciliation harness (`docs/research-briefs/_tools/reconcile.js`) enforces four invariants — coverage, validity, value-fidelity, conflict-gate — and it **runs in CI**: `tests/data/reconcile-modules.test.ts` walks the full `docs/research-briefs/findings/*.jsonl` ledger against `DATA_MODULES` through `reconcileCore`, so a value that drifts from its cited finding fails `npm test` (the `validate` job in `.github/workflows/ci.yml`). This is genuinely good governance — a fabricated number cannot ship.
- Freshness has two guards: a build-time blanket over registered modules (`tests/data/freshness.test.ts`) and a runtime degrade that rides the assessment payload (`lib/data/scoring-freshness.ts` → `scoringRulesStale`), so a verdict computed from an aged-out rule visibly lowers confidence between deploys.
- One real automation exists: `scripts/harvest-dha-evidentiary.mjs` politely harvests the DHA CRICOS directory + Nepal evidence levels from DHA's internal SharePoint JSON endpoints (resumable, backoff, CC-BY attribution).

That is a stronger starting point than most MVPs. The problems are in **coverage of the guard**, **the manual verification model behind it**, and **date-bearing facts the guard was never designed to catch**.

## Findings

### P1 — The freshness guard is opt-in and misses the entire annual-drift surface

The blanket freshness test (`tests/data/freshness.test.ts:26-46`) and the runtime degrade (`lib/data/scoring-freshness.ts:50`) fire **only on records that carry a `reverifyBy`**. I counted the dated-record surface against the guarded surface:

| Metric | Count | Source |
|---|---|---|
| `lastVerified` occurrences across `lib/data` | **498** | `grep -rho lastVerified lib/data` |
| Records carrying a `reverifyBy` | **23** (3× 2026-12-31, 5× 2027-06-07, 15× 2027-07-01) | `grep -rho reverifyBy` |
| Drift-prone modules with **zero** `reverifyBy` | tuition, scholarships, OSHC, provider fees, banks, test-centre fees | below |

So **fewer than 5% of dated facts are watched.** The design intent (comments in `types.ts:20`) is that only volatile facts opt in and stable facts need none — but the modules that were left un-watched are precisely the ones that drift annually:

```
au-rmit-programs.ts          reverifyBy count = 0   (2026 "indicative annual international fee")
au-university-programs.ts    reverifyBy count = 0   (first-year / total tuition AUD)
au-oshc-premiums.ts          reverifyBy count = 0   (12-month single-cover premium)
au-provider-application-fees reverifyBy count = 0
au-scholarships.ts           reverifyBy count = 0
nepal-english-test-centres   reverifyBy count = 0
australia-awards-scholarship reverifyBy count = 0   (application window dates!)
```

Tuition is the single most student-visible number in `/matches` and the cost-to-apply panel, it changes every academic year, and **nothing will ever go red when it ages.** The guard the founder believes is protecting the dataset is not watching the field a student is most likely to catch wrong.

### P1 — A scholarship application window has already expired and is still shipping as current

`lib/data/source/australia-awards-scholarship.ts:22-25`:

```
applicationOpens:  "2026-02-01"
applicationCloses: "2026-04-30"   ← passed 71 days ago (today 2026-07-10)
lastVerified:      "2026-06-07"
(no reverifyBy)
```

The Australia Awards fully-funded scholarship — the highest-value single item in the scholarships view — advertises a deadline that **closed over two months ago**, with no freshness mechanism to flag it. `reverifyBy` was designed for "the fact may change on date X," not for "this embedded date has now passed," so date-bearing facts (scholarship windows, intake deadlines, `effectiveDate` cutoffs) escape the guard entirely. A student who acts on this either despairs at a missed deadline or mis-plans around a dead window. That is a direct trust wound on a trust-first product.

### P1 — FX_RATES gates the financial verdict but is invisible to every guard

`lib/data/policy/fx-rates.ts` feeds `toAud()`, which the financial scoring dimension uses to test a student's budget against the DHA capacity floor. The rates are hand-entered approximations (`NPR 135`, `AUD 1.5` per USD) with `lastVerified: "2026-06-02"`. The file comment claims: *"tagged `internal-heuristic` with a short-lived `lastVerified` so the staleness report flags them for re-check."* **No such report exists.** The `fx()` helper (`fx-rates.ts:14-17`) sets no `volatility` and no `reverifyBy`, so:

- `tests/data/freshness.test.ts` skips it (reads `reverifyBy` only).
- `scoringRulesStale()` skips it (`scoring-freshness.ts:50` reads `reverifyBy` only).
- The schema rule `missingReverifyBy` (`schema/common.ts:23`) only requires `reverifyBy` when `volatility` is set and non-stable — FX sets neither, so it passes validation.

A live, verdict-gating financial input drifts silently with a comment that lies about it being watched. NPR/USD and AUD/USD both move several percent a quarter; a stale rate shifts who clears the capacity gate — and the gate is the difference between a "possible" and a "reach" verdict (`au-cost-of-living.ts:139-150`). This is the clearest instance of the "% coverage is a vanity metric" trap: the datum has provenance, so it *looks* governed, but the governance does nothing.

### P2 — The seeded DB catalogue (79 rows) is dated but no freshness mechanism walks it

`supabase/migrations/20260604120000_seed_universities_and_programs.sql` stamps `last_verified 2026-06-04` on **79 rows** (15 universities + 64 programs, tuition included). Both freshness guards import `DATA_MODULES` (the TS registry); `tests/data/freshness.test.ts` has **zero** references to `supabase`, `.sql`, or the DB. There is no `reverify` column on the `programs`/`universities` tables and no job reads `last_verified`. The catalogue that drives every match verdict's tuition gap is entirely outside the freshness system. Tuition in the DB will age with no reminder and no red build.

### P2 — nepal-banks loan pricing is 18 months stale and unwatched

All 20 records in `lib/data/source/nepal-banks.ts` carry `lastVerified: "2025-01-15"` (the oldest cluster in the repo) and no `reverifyBy`. These are education-loan products with `pricing` (spreads, rates) — exactly the kind of figure a student building proof-of-funds relies on. Bank spreads move with NRB base-rate revisions; 18 months is several revision cycles. Nothing flags it.

### P2 — A single-day re-verify avalanche, verified by one human

Of the 23 guarded records, **15 all fire on 2027-07-01** (the DHA financial-year boundary). When that date arrives the build goes red on 15 records at once — each requiring a human to open the relevant DHA/ATO/Fair Work page, confirm the new figure, and move both `lastVerified` and `reverifyBy` forward. This already happened at smaller scale: the 2026-07-01 boundary forced re-verification of **16 AU records** (MV-80, PRs #34/#36; scout `docs/audits/2026-07-02-fy2026-27-reverify-scout.md`) — 12 of them changed (subclass-500 charge 2000→2500, wages +6%, ART fee 3580→3727). That was one corridor. The model is: one founder, one red build, one weekend of manual gov-page reading. It worked once. It does not have a dashboard telling the founder *what is coming* — the red build is the only signal, and it arrives after the fact is already stale in production.

### P2 — The one automation is manual and unscheduled

`scripts/harvest-dha-evidentiary.mjs` is the only diff-watcher-shaped asset, and it is invoked by hand (`node scripts/harvest-dha-evidentiary.mjs`). It is **not** on a cron, not in `.github/workflows/` (only `ci.yml` exists), not in any scheduled-task config. Its re-harvest cadence is enforced only by `tests/data/freshness.test.ts:110` going red on a module-level `AU_CRICOS_DIRECTORY_REVERIFY_BY` stamp. So even the automation that exists depends on a human noticing a red test and remembering to run a script. There is no alerting, no scheduled PR, no diff surfaced to a reviewer.

### P3 — No admin/moderation surface; every datum edit is a code change

There is no `app/api/admin`, no moderation route, no data-entry UI. Every fact update is a hand-edit to a TS module + PR + CI. This is correct and cheap at one corridor with one editor — code review *is* the moderation gate, and the reconcile harness is the validator. It is flagged only because it is the hard ceiling on the scaling story below.

### P3 — AU_REPRESENTATIVE_TUITION_AUD requires hand-recompute with no guard

`au-cost-of-living.ts:118` is the median `tuitionMin` across the 64 seed programs (44,500), and it directly sets the DHA capacity floor. The comment says "recompute and bump `CONFIG_VERSION` if the program dataset's tuition distribution shifts materially" — but **no test asserts the constant still equals the seed median.** Add or reprice programs and this silently diverges from its own definition, moving the capacity gate for everyone, with `CONFIG_VERSION` unchanged.

## Where the manual-verification model breaks as corridors multiply

Today's surface is **one cell** of a source-country × destination-country matrix: Nepal → Australia. ~498 dated facts, ~1,118 findings, one human verifier. The break is not linear — it is the product of two axes:

| Axis | What multiplies per new entry |
|---|---|
| **+1 destination** (e.g. Canada, UK) | Its own visa-fee calendar, cost-of-living capacity figures, provider catalogue + tuition, scholarships, OSHC-equivalent, English floors — a near-full copy of the AU fact surface, each on its *own* re-verify cliff |
| **+1 source country** (e.g. India, Bangladesh) | FX rate, bank/loan products, NOC/source-of-funds process, local test-centre fees, evidence levels |

`SUPPORTED_DESTINATIONS` already lists intent for 6 destinations; `TYPICAL_YEARLY_USD` and `FX_RATES` already carry stub rows for 6 destinations and 7 currencies. At even 3 destinations × 3 source countries the fact surface is ~5-10× today's, and the re-verify cliffs stop being one 1-July avalanche and become a **year-round stream of overlapping deadlines from different governments' financial-year boundaries** (AU 1 July, Canada varies, UK April). The founder-manual model breaks at exactly the point the product's expansion thesis kicks in, because:

1. There is no queue view — the founder cannot see what re-verifies next month, only what already went red.
2. <5% of facts are guarded, so most drift is invisible regardless of corridor count.
3. Verification is one person reading gov pages; that does not shard across corridors.

**The break is quantifiable: today 15 facts on one day is survivable; at 3 corridors it is ~45 facts across ~6 boundary dates with no dashboard, and the person-hours are unchanged.**

## Cheapest automation that defers the break (extend, don't greenfield)

In priority order, each building on machinery that already exists:

1. **Close the guard gap (near-zero cost, do first).** Add `reverifyBy` to the drift-prone modules (tuition, scholarships, OSHC, provider fees, banks) and add a `datePassed` assertion to `freshness.test.ts` so any embedded `applicationCloses`/deadline earlier than today fails the build. This alone catches the expired Australia Awards window and the unwatched tuition surface. It is a data edit + ~20 lines of test — the walker (`collectReverify`) already exists.
2. **A "freshness due" report.** A `npm run freshness:due` script reusing `collectReverify` that lists every `reverifyBy` sorted ascending **and** every `lastVerified` older than N months with no `reverifyBy`. This converts the after-the-fact red build into a *forward queue* — the missing dashboard. Trivial; pure over data already in memory.
3. **Schedule the harvest that already works.** Put `scripts/harvest-dha-evidentiary.mjs` on a monthly GitHub Action that runs it and opens a PR with the diff for human sign-off. This is the diff-watcher the brief asks for — it exists, it just isn't scheduled. Human still gates the merge (moderation preserved), but the *detection* is automated.
4. **Extend the harvest pattern to provider tuition (the annual killer).** A fetch-extract-diff job per provider fee/tuition page → PR. LLM-assisted extraction is the right tool here (tuition tables are semi-structured HTML), with the reconcile harness + human PR review as the sign-off gate. This is the one investment that defers the tuition-staleness break across corridors, because it turns "one human reads N provider pages per corridor" into "N bots propose diffs, one human approves."

Items 1-2 are hours of work and remove the two P1 trust wounds immediately. Item 3 is the cheapest real automation. Item 4 is the only thing that makes multi-corridor expansion survivable, and it is a straight extension of the harvester already in the repo.
