# Scalability plan — beyond Nepal → Australia

**Auditor:** Platform architect · **Date:** 2026-07-10 · **Corridor under review:** expansion from the single live corridor (Nepal → Australia) to Canada, UK, USA, Germany, NZ/Ireland, and additional source countries.

## Verdict up front

The founder's mental model — "source country and destination country are separate dimensions, so we expand without code changes" (CLAUDE.md, Key Decisions) — is **half-true and dangerous where it's false.** The *data shapes* are cleanly separated (`SourceCountryData` in `lib/data/source/nepal.ts`, `DestinationCountryData` in `lib/data/destination/australia.ts`). The *scoring pipeline that turns those shapes into a verdict is hardcoded to Nepal → Australia* in at least four places, and — worse — the codebase already ships **fabricated placeholder data for five destinations it does not support**, which is a live trust landmine, not a scaling head-start. There is **zero i18n infrastructure**. Grade normalization silently mis-scores half the world's grading systems.

The good news: the team has shown genuine restraint in the *right* place (the corridor-theming registry is honestly scoped to one member), and the cheapest possible corridor #2 (India → Australia) is genuinely cheap under the current architecture because it reuses the entire expensive destination side. The recommendation below leans on that.

---

## 1. How deep does the source × destination separation actually go?

| Layer | Separated by country? | Evidence | Verdict |
|---|---|---|---|
| Data *types* | Yes | `SourceCountryData` / `DestinationCountryData` in `lib/data/types.ts`; `nepal.ts` + `australia.ts` are drop-in instances | Genuinely reusable |
| Content modules | By file-prefix convention | 40+ `au-*.ts` + `nepal-*.ts` under `lib/data/source/` | Organizationally scalable, but see §5 |
| Program/university catalogue | Yes (schema) | `universities.country` column, `programs.university_id` FK; DB holds AU-only rows | Schema ready; data is not |
| **Scoring input mapping** | **No — hardcoded** | `lib/scoring/from-sections.ts:42` pins `homeCountry: "nepal"`; `:43` defaults `destination: "australia"`; `:45` defaults `gradeSystem: "percentage-nepal"` | **Blocker** |
| **Financial visa gate** | **No — Australia-only** | `lib/scoring/financial.ts:73` `if (profile.destination === "australia")` — the entire DHA capacity gate, all figures in AUD | **Blocker** |
| Evidence levels | Source×dest *joint* | `nepalEvidenceLevel(cricosCode)` in `lib/data/nepal-evidence-lookup.ts` reads `au-nepal-evidence-levels.ts` | Correctly modeled as a *matrix cell*, not a dimension |
| Corridor theming | Yes, honestly minimal | `lib/theme/corridor.ts`: `CorridorId = "np-au"` (one member); `corridorForHomeCountry()` returns `null` for anything but Nepal | Exemplary restraint |

**The key finding: DHA evidence levels are keyed on the (Nepal, Australia) *pair*, not on either country alone** (`au-nepal-evidence-levels.ts`, consumed via `nepalEvidenceLevel(cricosCode)`). This is the correct model — visa risk is a property of the corridor, not additively of two countries — but it also means the "two independent dimensions" framing understates the real combinatorial surface. A source × destination matrix of *N × M* corridors has *N × M* evidence tables, capacity gates, and refusal-recovery packs, not *N + M*. The architecture does not yet have a first-class "corridor" object that owns the scoring rule pack; `theme/corridor.ts` is presentation-only.

---

## 2. The placeholder-data trap (P1, trust)

`DESTINATIONS` (`lib/scoring/types.ts:43`) lists seven values; `SUPPORTED_DESTINATIONS` lists exactly one (`"australia"`). Good — the wizard, `/api/assess` (`route.ts:44`), and Results all gate on `isDestinationSupported()`, so an unsupported pick short-circuits to `UnsupportedDestinationNotice`. That gate is real and works.

**But the policy tables are already fully populated for all six destinations with invented numbers:**

- `ENGLISH_VISA_FLOOR_BY_DEST` (`english-thresholds.ts:37`) sets canada/uk/germany/usa/ireland all to `6.0` with the comment *"the other corridors mirror the same floor until they ship."* That is a **fabricated figure asserted as sourced-adjacent data** in a product whose entire pitch is "every figure sourced/dated." Canada (IELTS 6.0 CLB-mapped), the UK (UKVI SELT B2), and Germany (often German-language, TestDaF) do not share Australia's 6.0-per-band floor.
- `TYPICAL_YEARLY_USD` (`au-cost-of-living.ts:92`) has made-up cost bands for all six, `findingRefs: []`, tagged `internal-heuristic`.
- `ENGLISH_THRESHOLD_BY_DEST` — six invented thresholds.

Today these are inert because `SUPPORTED_DESTINATIONS` gates the scorer and `composeScoresForAllDestinations` (`multi-destination.ts:9`) **has no live caller** (verified: grep finds only the definition). The danger is the *one-line change*: the day someone adds `"canada"` to `SUPPORTED_DESTINATIONS` to "test the plumbing," the engine will emit confident banded verdicts off unsourced English floors and fabricated cost bands, **with no destination-appropriate capacity gate at all** (§3). This is precisely the "% coverage looks done" illusion the founder retired as a vanity metric — the tables *look* multi-corridor; the verdict behind them would be a fabrication.

**Recommendation:** delete the five placeholder rows, or make the lookup `throw` for any non-supported destination, so the type system and runtime both refuse to score a corridor whose rules haven't been sourced. Placeholder data that silently defaults is strictly worse than a missing key that crashes.

---

## 3. The scoring engine is single-corridor, structurally (P0 for any real 2nd *destination*)

The financial dimension — 25% of the weighted verdict — is where "no code changes" breaks hardest. `scoreFinancial` (`financial.ts:73`) runs the DHA Subclass 500 financial-capacity gate **only** `if (profile.destination === "australia")`. Every figure is AUD and Australia-specific: `AU_DHA_LIVING_CAPACITY_AUD` (29,710), `AU_REPRESENTATIVE_TUITION_AUD` (44,500), `AU_DHA_PARTNER/CHILD_CAPACITY_AUD`.

There is **no equivalent gate for any other destination.** A Canadian assessment would skip the capacity gate entirely and score financial purely off the `TYPICAL_YEARLY_USD` heuristic — missing Canada's GIC requirement, the PAL/provincial-allocation cap (2024 IRCC change already noted in the *marketing* copy at `destinations.ts:63` but nowhere in scoring), and the study-permit proof-of-funds floor. The verdict would be structurally blind to the single biggest current risk factor for a Nepal→Canada student. Each destination's visa system is different enough (Canada GIC + PAL, UK maintenance funds + CAS, Germany Sperrkonto/blocked account ~€11,904, USA I-20 + SEVIS + F-1 interview) that the capacity gate is **bespoke logic per destination, not parameterized data.** This is correctly *not* abstracted yet (see §6) — but it means a new *destination* corridor is a scoring-engine change, not a data drop.

Two verdict systems already diverge (dimension engine vs per-program match verdict in `compute.ts`); adding destinations multiplies the surfaces where these can disagree.

---

## 4. i18n readiness: none (P1 for any non-English-first market)

Grep for `i18n|intl|next-intl|react-intl|lingui|formatjs` in `package.json`: **zero matches.** All ~140 `.tsx` files carry hardcoded English string literals. There is no message catalog, no `t()` wrapper, no locale routing. `next.config.ts` has no `i18n` block (App Router uses `[locale]` segments — none exist).

For expansion this matters unevenly:
- Canada/UK/USA/Ireland (English-medium destinations, and Nepal's education market operates in English) — i18n is **not** a blocker; defer it.
- Nepali-language UI, or a Hindi/Bengali/Urdu source-market UI — a full retrofit across 140 components. This is the single most expensive latent scaling cost and the one most likely to be underestimated because English "just works" today.

**The cheap discipline now, without building the framework (which would be premature — §6):** stop embedding user-facing strings in a way that can't be mechanically extracted later. The current inline-JSX-literal pattern is *hostile* to future extraction. A lint rule flagging bare string literals in JSX text nodes would keep the extraction cost linear instead of forcing a 140-file manual sweep on the day corridor Nepali-UI arrives.

---

## 5. Currency & grade handling

**Currency is partially general and adequate for now.** `FX_RATES` (`fx-rates.ts`) already carries NPR/AUD/INR/BDT/PKR/NGN; `toUsd`/`toAud` helpers exist; unmapped currencies pass through. `CURRENCIES` enum has 7 members. This is fine for source-country expansion. Caveats: rates are hand-entered `internal-heuristic`, `lastVerified: 2026-06-02`, **no `reverifyBy`** — a live financial input feeding a visa gate that can drift silently (flagged in data-layer ground truth too). And the financial gate's output *labels* are hardcoded AUD strings (`financial.ts` `capacityLabel`), so even the reused-AUD case bakes in AUD presentation.

**Grade normalization is a real landmine (P2).** `normalizeGradeToPercentage` (`grade-normalize.ts`) handles `percentage-nepal/india/percentage` (passthrough) and `cgpa-4/10/5` via a flat linear `(grade/scaleMax)*100`. It does **not** handle:
- **German grades (1.0–5.0, inverted — 1.0 is best).** A German 1.3 (excellent) fed through any of the existing maps reads as a near-fail. Any Germany corridor needs bespoke inverted logic.
- **UK honours classifications** (First / 2:1 / 2:2) — not numeric at all.
- **US 4.0 GPA** collides with `cgpa-4` but the conversion conventions differ (US often already reported as percentage/letter).
- **WAM vs CGPA** — the in-code comment already admits the linear map is a "first-pass approximation"; a 3.0/4.0 → 75% mapping doesn't match most institutional WAM tables.

The `GRADE_SYSTEMS` enum *listing* `percentage-india`/`cgpa-10` is a good source-country tell (India-ready shapes), but listing a scale is not scoring it correctly.

---

## 6. What NOT to abstract yet — premature-generalization traps

The team's instinct to keep `theme/corridor.ts` at a single honest member is the model to follow. Specific traps to **avoid**:

1. **Do not build a generic "any-grade-system → percentage" engine.** The German inverted scale and UK classifications are different enough that a universal mapper would be wrong-by-design. Add each system's bespoke converter when its corridor ships.
2. **Do not abstract the DHA capacity gate into a generic `DestinationCapacityGate` interface** before the second destination's real rules exist. GIC, blocked accounts, and maintenance funds have different shapes (lump sum vs monthly vs per-dependent); an interface designed against Australia alone would leak AU assumptions. Write Canada's gate concretely first, *then* extract the commonality.
3. **Do not build the i18n framework before a non-English corridor needs it** — just keep strings extractable (§4).
4. **Do not populate placeholder policy tables "to be ready."** This trap already fired (§2). Ready-looking fabricated data is negative value in a trust product.
5. **Do not introduce a `Corridor` God-object** spanning theme + scoring + content prematurely. The current split (theme registry vs scoring config vs data modules) is fine until the second corridor reveals the real seams.

---

## 7. Recommendation: make corridor #2 **India → Australia**, not a new destination

Counterintuitive but architecturally decisive: **keep Australia, change the source country.** Rationale:

- The expensive half of a corridor is the **destination** side: the bespoke capacity gate (§3), the ~30 `au-*` content modules (CRICOS, Genuine Student, OSHC, health, biometrics, visa facts, provider minimums), and the program/university catalogue. India → Australia **reuses 100% of that**, including the AUD capacity gate unchanged.
- The source-side deltas are cheap and mostly *already stubbed*: `FX_RATES.INR` exists; `GRADE_SYSTEMS` already lists `percentage-india` and `cgpa-10`; the wizard already collects the shape. What's genuinely new: an India `SourceCountryData` (test centres, banks), India-specific income/funds documentation modules, and — the one real research task — an **India × Australia evidence-level table** (`au-india-evidence-levels.ts` mirroring the Nepal one; DHA assigns evidence levels per passport country).
- India is the **largest single source market into Australian higher ed** — the biggest possible TAM unlock per unit of engineering.
- It also *forces the de-hardcoding* of `from-sections.ts:42` (the `homeCountry: "nepal"` pin) and per-source grade normalization — work that any future expansion needs anyway, done against the cheapest possible second corridor.

A new *destination* is materially larger: destination-specific visa/finance/English rules, programme catalogue, cost/scholarship content, application workflow, sources/freshness operations, and the source-side de-hardcoding. Do it after a second source country proves the corridor seam. Canada may have demand, but the repo contains no market evidence that makes it the “obvious” next choice; validate that commercially.

### Marginal cost of corridor #2 (India → Australia) under current architecture

| Work item | Effort | Note |
|---|---|---|
| Add journey/corridor identity; un-pin home country/grade system | M | Prevent one user's journeys overwriting each other |
| India source-country research: credentials, funds, banks/process, test logistics, fraud/translation risks | L research | Do not mechanically mirror Nepal rules |
| Model India×provider evidence requirements from authoritative tools/snapshots | M–L | Provider/country combinations and effective dates matter |
| Per-source credential normalization with reviewed mappings | M | A linear CGPA conversion is not sufficient evidence |
| `CorridorId` gains `"in-au"`; copy/content/localisation routing | M | Theming is the easy part; content ownership is the work |
| Extend `SUPPORTED_DESTINATIONS`? No — India is a *source* change; destination stays AU | — | No scoring-gate change needed |
| Goldens, RLS/journey migrations, content/freshness operations, user research | M–L | Required to claim a supported corridor |

**Planning hypothesis, not a commitment:** a second source country reusing Australia should be materially cheaper than a second destination, but the current journey/schema/data-operation debt makes a “2–4 week” promise unjustified. Run a one-week discovery spike that produces a source inventory, credential mapping, sample provider/evidence combinations, schema diff, and research estimate. Architecturally, a **source-first expansion sequence** is still the lower-risk way to prove corridor abstractions before opening a second destination; market selection must come from demand and unit-economics evidence.

---

## Findings summary

- **P0** — `scoreFinancial` runs the visa capacity gate only for Australia (`financial.ts:73`); no other destination has any capacity gate, so a 2nd *destination* would emit verdicts blind to its actual visa-funds requirement. Not a data drop — an engine change.
- **P1** — Fabricated placeholder policy data for 5 unsupported destinations (`english-thresholds.ts:37-53`, `au-cost-of-living.ts:92`) with empty `findingRefs`; one line in `SUPPORTED_DESTINATIONS` turns them live. Delete or throw.
- **P1** — No i18n infrastructure anywhere (0 matches in `package.json`); hardcoded English across ~140 `.tsx`. Fine for English destinations, a 140-file retrofit for any localized UI.
- **P1** — Scoring input mapping hardcodes Nepal + Australia (`from-sections.ts:42-45`); the "separate dimensions" claim does not hold at the pipeline layer.
- **P2** — Grade normalization mis-handles German (inverted 1–5), UK classifications, WAM (`grade-normalize.ts`); linear CGPA map self-described as first-pass.
- **P3** — FX rates hand-entered, no `reverifyBy`, feeding a live financial gate (`fx-rates.ts`); AUD labels hardcoded in gate output.
- **Positive (keep doing this)** — `theme/corridor.ts` single-member restraint; evidence levels correctly modeled as a source×dest matrix cell; program schema is country-ready.
