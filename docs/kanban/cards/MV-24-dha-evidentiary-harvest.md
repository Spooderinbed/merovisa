# MV-24 — DHA evidentiary-tool harvest (CRICOS directory + Nepal evidence map)

**Column:** In review · **Priority:** P3 · **Owner:** agent · **Size:** L
**Gate:** none for the TS-data + GS-surface render (agent-ownable). DB-catalogue surfacing is founder-DB-gated (out of scope here, like [[MV-13]]/[[MV-21]]).
**Created:** 2026-06-22
**Related:** 2026-06-18 audit Q13b (docs/audits/2026-06-18-full-app-evaluation.md:161); reconciliation `wf_4b1a3438-b21`; [[MV-07]] (CRICOS-code-on-card, the sibling surface).

## Why

The Genuine Student panel today links to the DHA Web Evidentiary Tool with a static "here's a
tool, check yourself" line, and our CRICOS provider list is a ~62-row hand-maintained file with
University of Melbourne + ANU explicitly missing (`cricos-lookup.ts` resolves both to null). The
DHA tool is the public front-end to the country×provider evidence framework — the concrete answer
to "what's my real evidence level before a consultancy". Harvesting it gives (a) a complete sourced
CRICOS directory and (b) a per-provider Nepal evidence-level map.

## PROVEN API contract (probed live 2026-06-22 — naked POST, no cookie/CSRF/digest)

Host `https://immi.homeaffairs.gov.au`. Tool JS: `/AssetLibrary/dist/js/app.wet.js`. Both endpoints
return `{ d: { success, data: [...] } }` and accept an anonymous `POST` with
`Content-Type: application/json`. **No auth, no form digest, no cookie required** (probed).

1. **Term store** — `POST /_layouts/15/api/Termstore.aspx/GetTermsByProperty`
   - Countries: body `{groupName:"IMMI", termSetName:"CountriesOfPassport", propertyName:"Code"}`
     → `d.data[]` of `{ID, Key:<country name>, Value:<ISO3 code>}`. **237 countries.** Nepal = `NPL`.
   - Providers: body `{groupName:"IMMI", termSetName:"CRICOS", propertyName:"Code"}`
     → `d.data[]` of `{ID, Key:<provider name>, Value:<CRICOS code>}`. **1,669 providers.**
     This **is** the CRICOS directory (deliverable a). University of Melbourne → `00116K`;
     ANU → `00120C` (both currently null in our lookup). Data caveat: 1,668 codes match
     `^\d{5}[A-Z]$`; **1 is malformed** — "Babel International College" → `3522E` (missing the
     leading zero; true code almost certainly `03522E`). Must be handled, not silently dropped.

2. **Evidence level** — `POST /_layouts/15/api/ESB.aspx/GetStudentDocumentChecklistType`
   - body `{countryPassport:"NPL", provider:<cricosCode>, cricosCode:<cricosCode>, studentEvidenceStudyTypeCode:"01"}`
     (the tool sets `provider` and `cricosCode` to the same CRICOS value).
   - → `d.data[0].studentResult` ∈ {`Regular`, `Streamlined`, `Undetermined`} on `d.success`,
     else an error sentence. Nepal × Melbourne × "01" → **`Streamlined`** (probed).
   - `studentEvidenceStudyTypeCode` (radio `rdStudentType`, default **"01"**):
     01 = all other students (the mainstream default we harvest), 02 = secondary exchange,
     03 = further visa for PhD thesis marking, 04 = (blank label), 05 = Defence-sponsored.
     We harvest study-type **01** only (mainstream degree-seekers); other types = future extension.

## Licensing

DHA content is **CC BY 3.0 AU** — re-publishable with attribution. Attribute DHA in each dataset's
source header. robots.txt does not disallow these paths. Treat the harvest as a **periodic batch
job with a manual-export fallback**, never a live runtime dependency (internal SharePoint endpoints
could add a gate at any time).

## Scope — what ships here (agent-ownable)

1. A reusable, polite harvest script (`scripts/harvest-dha-evidentiary.mjs` or similar) →
   raw harvested JSON. Rate-limited + retry/backoff; idempotent; re-runnable.
2. **`lib/data/source/au-cricos-directory.ts`** — the complete 1,669-row CRICOS directory.
   DISPLAY-data provenance pattern (per-record `source` + `lastVerified`, own Zod schema,
   **outside** the findings ledger — like `au-oshc-premiums.ts`), NOT the per-finding `findingRefs`
   model of the hand `au-cricos-codes.ts`. The hand list stays (its D.* finding ties are intact);
   the directory is the authority-sourced superset.
3. **`lib/data/source/au-nepal-evidence-levels.ts`** — per-provider (cricosCode) → Regular/
   Streamlined/Undetermined for Nepal passport, study-type 01. Same DISPLAY pattern.
4. Zod schemas for both + a freshness/shape test. Wire **Melbourne + ANU** into `cricos-lookup.ts`
   (the named null gaps now resolve, sourced from the directory).
5. Surface the Nepal evidence level (decision pending placement recon — GS panel vs. the
   per-provider program/match card where the provider is already named; the card is the natural
   home alongside MV-07's CRICOS code). Presentational → goldens byte-identical.

**OUT OF SCOPE (founder-gated):** writing any of this into the Supabase programs catalogue.

## Variation check (gate before shipping the evidence map)

Before shipping (b), confirm the Nepal evidence level actually **varies by provider** (sample N
providers). If every provider returns the same level, a per-provider map is theatre — report that
honestly and reduce (b) to a single sourced "Nepal = <level>" fact instead.

## Build order (TDD)

1. Harvest (script) → raw JSON committed to a scratch/data path (bytes stay out of context via
   ctx_execute; only summaries surface).
2. RED→GREEN per shipped unit: Zod schema rejects a bad row first; directory/evidence dataset
   passes its schema; `cricos-lookup` resolves Melbourne + ANU (was null); the evidence surface
   renders present-when-known / absent-when-unknown.
3. Confirm: goldens byte-identical (presentational); existing CRICOS hand-list + reconcile untouched.

## Acceptance criteria

- [x] Complete 1,669-row CRICOS directory dataset, schema-valid (malformed `3522E` → `03522E`,
      sourced + dated, DHA CC BY 3.0 AU attribution).
- [x] Per-provider Nepal evidence-level map (study-type 01), 1,626 codes, schema-valid; variation
      confirmed (1,572 Regular / 54 Streamlined).
- [x] `cricos-lookup` resolves University of Melbourne (00116K) + ANU (00120C) — were null.
- [x] Nepal evidence level surfaced on the ProgramCard (present-when-known/absent-when-unknown), tested.
- [x] Gate green: typecheck + lint + full test. Goldens byte-identical. Hand `au-cricos-codes.ts`
      + its reconcile ties untouched.

## What shipped

- **`lib/data/source/au-cricos-directory.ts`** — complete 1,669-entry CRICOS directory (DISPLAY
  pattern; module-level source + harvest date; Babel `3522E`→`03522E` normalised, verified at
  bic.wa.edu.au).
- **`lib/data/source/au-nepal-evidence-levels.ts`** — `Record<cricosCode, "Regular"|"Streamlined"|
  "Undetermined">` for all 1,626 unique codes (Nepal passport, study-type 01) + source/date/study-type
  consts; `NepalEvidenceLevel` type.
- **`lib/data/schema/{au-cricos-directory,au-nepal-evidence-levels}.schema.ts`** — Zod guards (CRICOS
  shape, level enum, size floor).
- **`lib/data/nepal-evidence-lookup.ts`** — `nepalEvidenceLevel(code) → level | null`.
- **`lib/data/cricos-lookup.ts`** — now returns `CricosResolution`; Melbourne + ANU resolve from the
  directory (curated 13 unchanged). **`lib/data/types.ts`** — `AuCricosDirectoryEntry`.
- **`components/matches/program-card.tsx`** — a "{level} evidence · Nepal ↗" line beside the CRICOS
  code (links to the WET tool), shown only when the provider's level is known.
- **`scripts/harvest-dha-evidentiary.mjs`** — the re-runnable, polite (conc 2 + 403 backoff),
  resumable batch harvester / dataset generator. `.harvest-cache/` git-ignored.

## Test evidence (TDD, RED→GREEN)

- RED: 2 import-resolution failures (schema + lookup absent), the Melbourne/ANU flip (returned null),
  the ProgramCard evidence line (absent) — 4 affected files, 2 failing + 17 passing.
- GREEN: 28/28 across the 4 files. Full gate: typecheck clean · lint 0 errors (1 pre-existing
  `build.mjs` warning) · full suite **1290 passed** (was 1279) · goldens byte-identical.
- **Independent re-verification** (live re-probe of the committed data): live directory still 1,669;
  every live code has a committed evidence entry (0 missing); 21 re-probed codes (15 catalogue + 6
  random Regular) → **0 mismatches**; catalogue all Streamlined; Babel normalised correctly.

## Status

**In review** — agent-ownable half SHIPPED TDD, gate green, data live-verified. Founder-owned residuals
(not blockers): (1) accept → Done; (2) DB-catalogue surfacing of the directory/evidence (founder-DB-gated,
like [[MV-13]]/[[MV-21]]); (3) optional anon-results parity — surface the evidence level on the anon
MatchCard / GS panel too (its own parity slice, mirroring [[MV-22]]); (4) periodic re-harvest cadence
(the script is the mechanism); (5) other study-types (02/03/05) beyond mainstream "01".

## Resume notes (cold agent)

- Feasibility is PROVEN (see API contract above) — the endpoints answer anonymous POSTs. Re-probe
  with one countries call before a re-harvest in case DHA added a gate.
- Harvest runs in the context-mode sandbox (`ctx_execute`, full network) — a Workflow subagent may
  not have network; keep the harvest here.
- Two NEW datasets (DISPLAY pattern, like au-oshc-premiums) — do NOT fold into the finding-traced
  hand list or break its D.* reconcile ties.
- Never stage the WIP trio; explicit `git add` paths only. Commit straight to master. Only the
  founder closes to Done.
