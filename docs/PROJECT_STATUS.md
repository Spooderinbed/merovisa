# MyVisa — project status & phase log

**Snapshot:** 2026-06-08, scorer-wiring slices 1–3 + Phase A cost-to-apply + Phase B (B1 visa-English floor + B2 dependents capacity, incl. signed-in family.situation mapping + family child-count field) + /matches seed-parity guard + lint-gate restoration + /matches provenance surfacing merged · **status reconciled 2026-06-08** (Phase 5 documents vault confirmed shipped & live — 9 migrations, MCP-verified; per-program checklist now shipped too, 2026-06-08) · **signed-in flows manually smoked green + prod build verified 2026-06-08**
**Tests:** 749 passing across 162 test files
**Typecheck:** clean
**Build:** clean — prod build re-verified 2026-06-08 (routes incl. `/checklist`, `/checklist/[programId]`, `/api/plan/action`, `/api/shortlist`, `/api/profile/section`, `/api/assess`, `/api/leads`)
**Code surface:** 26 files in `app/`, 55 in `lib/`, 81 in `components/`, 132 in `tests/`, 9 SQL migrations applied
**Branch state:** pushed to `origin/master` (the prior local-only preference was lifted on 2026-06-07 at user request)

---

## Quick read: what works, what doesn't

### ✅ Verified via tests + build (not manually smoked)

| Surface | What it does |
|---|---|
| Marketing chrome (`/`, `/destinations`, `/destinations/[id]`, `/how`, `/trust`) | Full Claude Design layout, 6 destinations with sourced data, AppBar swaps between marketing/marketing-signed-in variants by session |
| Anonymous wizard (`/assess`) | 9-step wizard → results page with verdict + factor bars + university matches + ConversionPaths |
| OAuth sign-in (`/auth`) | Google sign-in, callback exchanges code, claims any pending assessment, bootstraps profile from snapshot + Google name, redirects to `/dashboard` |
| Signed-in chrome | AppBar app variant with full nav (Home/Matches/My plan/Profile/Guide/Destinations) + UserPill avatar with dropdown menu (Dashboard/Profile/Sign out) |
| `/assess` for signed-in users | Server-side interstitial: "you have an active assessment from X" → Refresh or Open dashboard. `?new=1` bypass for new destination |
| `/dashboard` | Greeting, snapshot card (verdict + factor bars), prompt card (IELTS/profile-incomplete/all-caught-up), journey timeline (5 steps), stats row (Universities from shortlist count, Profile %, Checklist/Scholarships dashes), recent updates empty state |
| `/profile` | Header with name + email, completeness ring, 13 section accordions each with inline editor: name/age/intake, destination, academic, intended-study, english, gap, work, finance, immigration, family, career, scholarships, deal-breakers |
| `/matches` | Tabs (Universities/Scholarships/Cost estimate), policy banner (Nepal AL3 + AUD 29,710), Strong/Possible/Reach groups, ProgramCard with verdict pill + tuition + IELTS/grade min + intakes + reasons + Source link + Document-checklist link + Shortlist toggle |
| `/plan` | Impact-ranked (High/Medium/Low) action items with Done/Dismiss/Undo, closed items collapse, regenerates on profile change |
| `/documents` | **Phase 5 — shipped & live.** Auth-gated documents vault: upload / list / view / delete photos of visa-ready documents, organised by a typed taxonomy (`DOCUMENT_META` → Identity/Academic/Financial/Visa groups). Reached from the work/english/finance profile editors. Service-role-only RLS. |
| `/checklist` | **Phase 5 — shipped 2026-06-08.** Landing lists shortlisted programs → each program's `/checklist/[programId]` view. Rule-derived generator maps a program's requirements → vault documents, split by stage (what you need **now** / **after your offer**), have/missing from uploads, financial items keyed to funding source, DHA-sourced funds note. Reached from each ProgramCard + the dashboard Documents stat. |
| Stub (`/guide`) | "Coming soon — landing in Phase 6" with back-to-dashboard CTA. |
| `/api/profile/section` | Zod-validated PATCH for any of 13 sections, auth-gated, invalidates plan after save (try/catch protected) |
| `/api/assess` | Anonymous path persists with 3-day TTL; signed-in path persists as owner, sets `is_primary` if none, bootstraps profile if missing, invalidates plan |
| `/api/shortlist`, `/api/plan/action` | Auth-gated POST endpoints with admin client writes via service role |
| Auth-gated `(app)` layout | Server-side `redirect("/auth?next=/dashboard")` on no session. `?next=` whitelisted via `lib/auth/safe-next.ts` (rejects `//attacker.com`) |

### ⚠️ Known issues, untested paths, or follow-ups

| Issue | Where | Severity |
|---|---|---|
| ~~No manual smoke since Phase 0.~~ **Smoked green 2026-06-08** via a throwaway dev-session seam (since removed): dashboard, profile save (PATCH round-trip), matches + shortlist persistence, plan, documents upload/view/delete, and `/checklist/[programId]` all verified end-to-end against a real session + RLS + Storage; zero console/server errors; prod build passes. | All `(app)/*` routes | ✅ Resolved |
| ~~Plan items linger after their triggering condition is satisfied — `invalidatePlan` was insert-only.~~ **Fixed 2026-06-08:** every regenerate now auto-closes (→ `done`, with `completed_at`) any open todo whose `kind` the generator no longer emits, so satisfied items leave the open plan but stay in history. `done`/`dismissed` are never touched. | `lib/plan/invalidate.ts` | ✅ Resolved |
| `destination_id` rendered raw (e.g. "australia" not "Australia") | `components/dashboard/snapshot-card.tsx`, `components/assess/assess-interstitial.tsx` | Minor UX |
| Day-of-week greeting uses server time, not user TZ | `app/(app)/dashboard/page.tsx` `partOfDay()` | Minor UX |
| `private.set_updated_at` trigger function has mutable `search_path` | Supabase advisor WARN, present since Phase 1.5 migration | Low; harden in a follow-up migration |
| `patchProfileSection` race condition | Two parallel PATCHes to same user lose one update (read-modify-write with no row-version) | Low for single-tab use; fix before enabling autosave |
| `userEnglishBand = userEnglishOverall` proxy in match compute | Per-band scoring not accurate until IELTS report upload (Phase 5) | Designed limitation |
| FX rates hard-coded for budget→AUD conversion | `app/(app)/matches/page.tsx` `budgetToAud()` | Replace with FX API later |
| Tuition rendered as "AUD 50,000–55,000 / yr" without explanation that 12-month figure varies by subject load | `components/matches/program-card.tsx` | Note, not bug |
| `lib/matching/universities.ts` still in code (deprecation header only) | Used by anonymous wizard's results payload; will retire when anonymous flow reads from DB | Designed |
| Dashboard `RecentUpdates` always empty | No "what's new" feed exists yet | Empty state covered |
| Nursing programs need AHPRA registration warning | `notes` field in seed says so, but UI doesn't elevate it | Minor; could surface in ProgramCard |

### 🔬 Verified via Supabase MCP (not just code)

- 9 migrations applied to live project `obfvrxixtautamflzxzq` (re-verified via MCP 2026-06-08): the original 5 (`init_assessments_and_leads`, `add_profiles_evolve_assessments`, `add_programs_universities_state`, `seed_universities_and_programs`, `add_plan_items`) **plus 4 since:** `add_documents`, `simplify_documents_drop_ocr_columns`, `normalize_profile_enums`, `fix_documents_rls_service_role_only`
- 15 universities + 64 programs seeded into live DB
- Security advisors: no new ERROR-level. Pre-existing WARN: `auth_leaked_password_protection` (project-level), `function_search_path_mutable` on `private.set_updated_at`. Pre-existing INFO: `rls_enabled_no_policy` on `public.leads`

### ✅ Phase 5 (documents) — shipped & live, smoked green 2026-06-08

- **Shipped:** `documents` table + an upload/view/delete flow (the original `checklist_items` + OCR design was simplified away — see `simplify_documents_drop_ocr_columns`), the `/documents` vault page, three `/api/documents/*` routes, `lib/documents/{repo,types}.ts`, service-role-only RLS (`fix_documents_rls_service_role_only`). The typed taxonomy (`DOCUMENT_META`) already groups document kinds into Identity/Academic/Financial/Visa. (Confirmed: real Supabase Storage — signed URLs, magic-byte validation, 5 MB image cap, rate-limited; an upload auto-flips the profile flag + re-scores + invalidates the plan.)
- **Per-program checklist — shipped 2026-06-08.** Spec `docs/superpowers/specs/2026-06-08-per-program-checklist-design.md`, plan `docs/superpowers/plans/2026-06-08-per-program-checklist.md`. A pure rule-derived generator (`lib/checklist/generator.ts` — no migration, no scoring touched) turns a program + profile + uploaded kinds into stage-grouped (`now` / `after-offer`) checklist items; financial items derive from the profile funding source; scholarship/AHPRA are informational (`kind: null`) items; the DHA funds note carries a `SourceLine`. `/checklist/[programId]` page + `/checklist` landing + a ProgramCard link. Upload-from-checklist is a deep-link to the vault (clarity over upload UX, per the user's guard). 29 new tests; goldens byte-identical. **Smoked green 2026-06-08** (dev-session seam): `/checklist/[programId]` renders every rule correctly (bachelors→+2/SLC, parents-family→bank+sponsor, DHA sourced note + AL3 seasoning, gap→employment, visa in "After your offer"), and an uploaded passport flips its item to "Have". The prod build lists the route — the first-hit 404 seen in dev was a Next on-demand-compile artifact, absent in production.

### 🚫 Not built yet

- Phase 6: `guide_threads` + `guide_messages` tables, `private.owns_thread()` security-definer helper, `/guide` page with SSE-streamed chat, Anthropic SDK integration with prompt caching. **Blocks at runtime without `ANTHROPIC_API_KEY` set in `.env.local`.**

---

## Data integration & scorer-wiring (2026-06-04 → 2026-06-07)

Two layers feed verdicts: (a) the **production scoring path** — `lib/scoring/*` reads sourced config via `lib/data/scoring-config.ts` (from `lib/data/policy/*`); the per-program `/matches` path reads `lib/programs/seed.ts` (15 unis, 64 programs) via Supabase; and (b) the **reconciled fact layer** `lib/data/source/*` — ~342 atomic findings turned into typed, sourced, machine-checked modules (registry-driven, guarded by `docs/research-briefs/_tools/reconcile.js`). Most of (b) is reference-only; wiring a fact into (a) is verdict-changing.

- **Scorer-wiring slice 1 — DHA financial-capacity gate (merged 2026-06-07).** Spec: `docs/superpowers/specs/2026-06-07-dha-financial-capacity-gate-design.md`. The financial dimension now gates a Nepal→Australia budget against the government DHA capacity floor (living 29,710 + representative tuition 44,500 ≈ AUD 74,210 ≈ USD 49,473) instead of only the internal-heuristic cost band: below the floor caps financial at 49 (blocks "strong"); below 0.75× forces "reach". AU-only; non-AU unchanged. `RULE_VERSION v0.1.0→v0.2.0`, `CONFIG_VERSION config-v1→config-v2`; characterization golden regenerated (boundary-straddle fixtures relocated to `canada` to isolate verdict.ts cutoffs from the gate). **Known design note:** the cap makes AU financial values 30–48 unreachable (a deliberate dead-zone). **Deferred fast-follows:** travel/airfare in the floor; field-of-study-indexed tuition; dependents (needs a profile-schema field).
- **Slice 2 — provenance under verdicts (merged 2026-06-07).** Optional `source` on the `DimensionScore` factor type; the financial capacity factor carries the DHA gov source (`immi.homeaffairs.gov.au` · verified date), rendered by a new `SourceLine` under sourced factors. Heuristic-backed factors show nothing. Additive/explainability only — no verdict, score, or version change; golden regenerated for the new optional field. Browser-verified end-to-end.
- **Slice 3 — corridor context on the results page (merged 2026-06-07).** The anonymous results page now renders the existing `PolicyBanner` (AL3, DHA floor, the DHA grant-rate range) after the factor breakdown, matching `/matches`. Pure additive UI; no scorer/golden change.
- **Phase A — cost-to-apply context (merged 2026-06-07, `c981a40`).** `selectCostToApply()` (`lib/data/cost-to-apply.ts`) assembles out-of-pocket application costs from the sourced fact modules — DHA Subclass 500 charge (AUD 2,000), the common Nepal-side path (IELTS, VFS biometrics, panel medical, passport, TU equivalence), provider application fees (AUD 0–150) — grouped by the currency each is paid in, with a Nepal core subtotal (NPR 57,765). New `CostToApply` panel (mirrors `PolicyBanner`) renders on the anonymous results page and the matches header; every figure links to its own source; framed as application-only and never blended across currencies (FX intentionally out of scope). First consumption of the `lib/data/source/*` fact layer in UI. No scorer touched; golden byte-identical. **Live screenshot pending:** port 3000 was held by a separate `next dev`, and two instances contend over `.next`, so the managed preview couldn't co-run; verified via the full suite incl. the real `Results` and `MatchesPage` composition tests.
- **Roadmap corrections (2026-06-07):** (a) **visa-grant-rate into the scorer — won't do.** `visa-outcomes.ts` deliberately documents "no scorer reads it… shown as a range, never a single number"; it's already surfaced honestly (banner + slice 3). Force-wiring it would break that intentional cohort-not-odds decision. (b) **field-of-study-indexed tuition — not worth it now.** Only 6/12 fields have program data and the 6 missing are the cheap fields that'd fall back to the *higher* median, so it wouldn't fix the over-gating it targets; the single 44,500 median stands.
- **Phase B — recalibration epoch (`v0.3.0` / `config-v3`).** Spec: `docs/superpowers/specs/2026-06-07-phase-b-recalibration-epoch-design.md`. Approved to ship B1 first, then B2 as a fast-follow on the same version line.
  - **B1 — visa English floor (merged 2026-06-07, `6ff6440`).** New gov-sourced `ENGLISH_VISA_FLOOR_BY_DEST` (australia 6.0, finding J1.003) distinct from the 6.5 course threshold; `visa.ts` applies a 3-band rule — reward ≥6.5, **no penalty in [6.0, 6.5)** (the visa floor is met), full threshold-anchored penalty <6.0. Factor relabelled (neutral "meets the DHA visa floor" / risk "below the floor") with the DHA source attached. `RULE_VERSION v0.2.0→v0.3.0`, `CONFIG_VERSION config-v2→config-v3`; golden regenerated — only `long-gap-below-english` moved (visa 48→53, factor relabel, weighted 49→50, **verdict still reach**); every other fixture unchanged but for the version stamp. Adversarial floor mutation trips 4 guards.
  - **B2 — dependents → DHA capacity (merged 2026-06-07, `9030201`).** `StudentProfile` gains optional `dependents {partner, children}`, collected via a compact optional control on the budget step (Just me / Partner / Partner + children, default none, AU-only — no new step, to protect the funnel) and Zod-validated (children int 0–10). The financial gate raises the capacity floor by the gov-sourced partner (+AUD 10,394, B.003) / child (+AUD 4,449, B.004) figures before the existing caps; the cleared-factor breakdown credits the family floor so the itemised AUD never contradicts the raised total. Same `v0.3.0` / `config-v3` line (re-exports only, no new bump). Golden: a new `dependents-alone-clears` / `dependents-partner-capped` pair isolates the effect — identical but for a partner, which drops an otherwise-strong AU verdict to possible (financial 85→49); no pre-existing fixture carries dependents so none moved. Adversarial zeroing of the partner figure trips 6 guards across 3 files. Browser-verified: the control renders/works on the live budget step, doesn't gate completion, zero console errors. **School costs (13,502) deferred** (need child ages). **Signed-in mapping follow-up (merged 2026-06-07, `30b3fd5`):** `sectionsToStudentProfile` now routes the existing `family.situation` enum into `dependents` — `spouse`→partner, `spouse-and-kids`→partner + 1 child (the enum carries no count, so a conservative one-child floor), `alone`/`other`→none — so a signed-in re-score honours the capacity floor. Pure input mapping: no scoring rule or sourced value changed (no version bump), and the characterization goldens build profiles directly so none moved. **Child-count field (merged 2026-06-07, `dbc6020`):** the signed-in family section now carries an optional `children` count (JSONB, no migration; Zod 0–10), edited via a native number input revealed only for spouse-and-kids (the editor's house style, not the wizard stepper). The mapping reads the real count, flooring spouse-and-kids at one — legacy rows with no count and a contradictory zero fall back to the prior behaviour, so existing scores are unchanged until a user sets a count. Same no-bump rationale (input assembly upstream of the engine); goldens byte-identical; the count-read drift mutation trips the from-sections guard.
- **FX-rates deferred (won't do this epoch):** `toUsd` runs *every* budget through `FX_RATES`, so re-sourcing the volatile NPR/AUD rates is wide-blast, low-value churn; the current ~135 NPR / ~1.5 AUD are roughly right — document the heuristic instead.
- **/matches consolidation — Problem A shipped (drift guard, 2026-06-07, `2d7a6da`).** Investigation corrected the plan's premise: the runtime `/matches` data is the Supabase `programs`/`universities` tables, populated by `20260604120000_seed_universities_and_programs.sql`; `lib/programs/seed.ts` is a parallel hand-authored TS twin of the same 15 unis + 64 programs, consumed only by `seed.test.ts`, with nothing keeping the two in sync. New parity test (`tests/programs/seed-migration-parity.test.ts` + a tolerant SQL parser `parse-seed-migration.ts`) parses the migration's insert blocks into structured rows and asserts an exact, value-for-value match against the seed arrays — so a divergence fails loudly (a one-field mutation trips two assertions and names the row), and `seed.test.ts`'s assertions become transitively true of runtime data. Guarded duplication, not full single-source: the seed migration is immutable insert-once, so generating one copy from the other helps only the initial seed — revisit when the first UPDATE migration appears. **Deferred — Problem B (provenance enrichment):** bring findingRef-grade sourcing to the runtime program data (today: bare domain links, mostly "derived", no findingRefs, and that source link shows on the program card). The `au-*` source modules are richer but a different shape *and* a different/subset program set (they include Torrens/Holmesglen pathway providers, don't cover all 64), so it's reshape + backfill — grounding corrected the "duplicate" premise: the `au-*` set is *disjoint* from the runtime 64 (UTS Pharmacy, online Melbourne Education, Torrens — none appear in the catalogue), so it can't backfill them. **Slice 1 — honest surfacing shipped (2026-06-08, `e317946`):** the program card now distinguishes `dataQuality` (primary/secondary → "Verified", derived → "Estimated") with the `lastVerified` freshness date, and softens the footer link to "Provider site" for estimated rows so it stops implying a citation the bare-domain homepage doesn't substantiate — verdict-neutral (compute.ts reads none of source/dataQuality/lastVerified; golden byte-identical; estimated label sits one ink-shade darker so the caveat is noticed). Remaining sub-lanes (research-gated): **deepen** (derived→primary, deep links + finding refs, sliced by field) and **widen** (reshape the 8 sourced au-* rows into the runtime catalogue).
- **Lint gate restored (2026-06-08, `3c8810c`).** `npm run lint` had ~210 problems and always failed — a dead CI gate where any real issue hid in the noise (it's why session work had to be scope-linted by hand). Root cause was *not* a version conflict (the first hypothesis): the config ignored the design prototype at `design-extract/**` but not its sibling copy at `claudedesign/**`, so eslint linted 15 loose `.jsx` prototype files and reported ~151 `react/jsx-no-undef` (every `<Home>`/`<Wizard>`/… read as "undefined") + 20 `no-unescaped-entities` on never-built code. Fix: ignore `claudedesign/**`; allow `require()` in the CommonJS `_tools/*.js` scripts; honour the `_`-prefix unused convention. Cleared the genuine tail too — one real `react-hooks` smell (`MatchesTabs` defined a component in render; hoisted, `3b7149e`), 3 test `no-explicit-any` (typed `as unknown as Parameters<…>` casts), unused imports/vars, a stale eslint-disable. `npm run lint` now exits 0 (0 problems); typecheck clean; 660 tests green.
- **Ledger slice A — DHA visa requirements → checklist + plan (merged 2026-06-08).** Spec `docs/superpowers/specs/2026-06-08-ledger-slice-a-dha-visa-requirements-design.md`, plan `docs/superpowers/plans/2026-06-08-ledger-slice-a-dha-visa-requirements.md`. First Ledger-by-slice integration: a new sourced module `lib/data/source/au-student-visa-requirements.ts` (4 pillar records — CoE, OSHC, financial coverage, Genuine Student) backs 21 Category-A findings; `FLIP_STATUS` promoted them (A: used 12 → 33, pending 110 → 89, 0 rejected). The checklist now sources the CoE/OSHC items (SourceLine) and states travel in the financial note; a new AU-gated high-impact plan item walks the four Genuine Student answers (≤150 words). Four-state tagging: 21 used, 7 use-later by slice boundary (under-18 welfare A.003–A.005, dependant school costs A.014, English exemption/floor A.023–A.024 — the 6.0 floor already ships via J1.003, processing time A.032). No scorer touched; `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
- **Ledger slice B — finance evidence readiness → checklist + plan + profile (merged 2026-06-08).** Spec `docs/superpowers/specs/2026-06-08-ledger-slice-b-finance-evidence-design.md`, plan `docs/superpowers/plans/2026-06-08-ledger-slice-b-finance-evidence.md`. New sourced module `lib/data/source/au-financial-evidence.ts` (4 DHA-accepted evidence paths — money deposit, loan, scholarship/sponsorship, parent/partner income — + the living-cost-indicative rule) backs findings B.007–B.011; `FLIP_STATUS` promoted all five (overall used 363 → 368, pending 751 → 746; B 82 → 87; 0 rejected). The plan's `upload-proof-of-funds` item now enumerates the four accepted paths, the checklist financial note states the living-cost figure is indicative, and the profile finance editor names the paths with a DHA source link. Four-state tagging: 5 used, 0 rejected/use-later/needs-human-call in scope (G12 fully consumed); the B-finance remainder — NRB/NOC B.012–B.026, bank products B.090–B.096, payment mechanics B.099–B.133 — stays use-later by slice boundary. No scorer touched (`financial.ts` + `funding-reliability.ts` untouched); `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
- **Ledger slice C — source-of-funds / remittance readiness → checklist + plan (merged 2026-06-08).** Spec `docs/superpowers/specs/2026-06-08-ledger-slice-c-source-of-funds-design.md`, plan `docs/superpowers/plans/2026-06-08-ledger-slice-c-source-of-funds.md`. New sourced module `lib/data/source/nepal-source-of-funds.ts` (5 records, `kind`-discriminated — NOC definition, NOC + institution-document bank requirements, NRB living-expense remittance, MoEST-portal forex confirmation) backs findings B.012–B.016; `FLIP_STATUS` promoted all five (overall used 368 → 373, pending 746 → 741; B 87 → 92; 0 rejected). The checklist gains an unconditional financial-group info item ("NOC + institution documents") composing the NRB remittance note (NRB-sourced), and the plan gains a `prepare-fund-remittance` action gated on a declared funding source that isn't pure scholarship. Four-state tagging: 5 used, 0 rejected/needs-human-call in scope; B.017–B.026 (the MoEST NOC document journey — doc list G13, portal submission, contacts) stays use-later by slice boundary, alongside bank products B.090–B.096 and payment mechanics B.099–B.133. No scorer touched (`financial.ts` + `funding-reliability.ts` untouched); `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
- **Ledger slice D — MoEST NOC document journey → checklist + plan (merged 2026-06-08).** Spec `docs/superpowers/specs/2026-06-08-ledger-slice-d-noc-journey-design.md`, plan `docs/superpowers/plans/2026-06-08-ledger-slice-d-noc-journey.md`. New sourced module `lib/data/source/nepal-noc-journey.ts` (8 records, `kind`-discriminated — six required documents: citizenship certificate, academic certificate, guardian citizenship, previous NOC, +2/PCL transcript, offer/I-20 letter; plus two process steps: online submission, in-person originals check) backs findings B.017–B.024; `FLIP_STATUS` promoted all eight (overall used 373 → 381, pending 741 → 733; B 92 → 100; 0 rejected). The sequel to slice C: now that the app says the bank needs an NOC, it says how to get one — the checklist gains an after-offer `noc-application` info item in the visa group (MoEST-sourced, composing the documents + process steps), and the plan gains an `apply-for-noc` action gated on an Australian primary destination (the timed "apply right after your offer" nudge). Four-state tagging: 8 used, 0 rejected/needs-human-call in scope; B.025–B.026 (NOC portal contact email/phone) stay use-later by slice boundary, alongside bank products B.090–B.096 and payment mechanics B.099–B.133. No scorer touched (`financial.ts` + `funding-reliability.ts` untouched); `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
- **Ledger slice E — DHA document preparation (translation + certified copies) → checklist + plan (merged 2026-06-08).** Spec `docs/superpowers/specs/2026-06-08-ledger-slice-e-document-preparation-design.md`, plan `docs/superpowers/plans/2026-06-08-ledger-slice-e-document-preparation.md`. First Category-A logistics slice on document *form*: new sourced module `lib/data/source/au-document-preparation.ts` (5 records, `kind`-discriminated — three translation rules: translate non-English documents, submit original + translation, overseas-translator details; two certified-copy rules: birth certificate, national identity card) backs findings A.026–A.028 + A.041–A.042; `FLIP_STATUS` promoted all five (overall used 381 → 386, pending 733 → 728; A 33 → 38; 0 rejected). The checklist gains an unconditional identity-group info item ("Translations & certified copies", DHA-sourced, placed after the birth certificate) and the plan gains a `translate-certify-documents` action gated on an Australian primary destination — certification scoped to the named identity documents, not every translated document. Four-state tagging: 5 used, 0 rejected/needs-human-call in scope; A.040 (plain passport copy, already covered by the passport row), the apostille pair A.092–A.093, and the Nepal-side verification/equivalence cluster stay use-later by slice boundary. No scorer touched (`financial.ts` + `funding-reliability.ts` untouched); `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
- **Ledger slice F — DHA health-exam readiness → checklist + plan (merged 2026-06-08).** Spec `docs/superpowers/specs/2026-06-08-ledger-slice-f-health-exam-design.md`, plan `docs/superpowers/plans/2026-06-08-ledger-slice-f-health-exam.md`. New sourced module `lib/data/source/au-health-exam.ts` (4 records, `kind`-discriminated — three process rules: panel physician/clinic outside Australia, cost paid directly to the clinic, My Health Declarations before lodging; plus the 6-month health-undertaking validity) backs findings A.033/A.035/A.036/A.038; `FLIP_STATUS` promoted all four (overall used 386→390, pending 728→724; A 38→42; 0 rejected). The existing after-offer `medical` checklist item is enriched in place (no new item) and a new AU-primary-gated `prepare-health-exam` plan action is added; both reuse the already-`used` structured finding C.092 (`au-health-biometric-facts`) for the 12-month validity — its first user-facing surface, with no C-category churn. Four-state tagging: 4 used, 0 rejected/needs-human-call; A.034 (12-month validity, duplicate of C.092) and A.037 (Nepal Mediciti panel-physician contact) stay use-later, alongside biometrics (A.029–A.031) and police certificate (A.039). No scorer touched (`financial.ts` + `funding-reliability.ts` untouched); `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
- **Ledger slice G — DHA biometrics readiness → checklist + plan (merged 2026-06-09).** Spec `docs/superpowers/specs/2026-06-09-ledger-slice-g-biometrics-design.md`, plan `docs/superpowers/plans/2026-06-09-ledger-slice-g-biometrics.md`. New single-record sourced module `lib/data/source/au-biometrics.ts` backs finding A.031 (after lodging, the Immi App requires the biometrics letter whose Visa Lodgement Number starts with "AUI"); `FLIP_STATUS` promoted it (overall used 390→391, pending 724→723; A 42→43; 0 rejected). A new after-offer `biometrics` checklist info item ("Biometrics letter") and a new AU-primary-gated `prepare-biometrics` plan action ("Prepare for biometrics after you lodge") compose A.031 with two structured facts reused read-only from `au-health-biometric-facts` — Nepal's inclusion in the biometrics program (C.123) and the VFS Kathmandu collection fee (C.127, NPR 2,365) — its first user-facing surface, with no C-category churn. Source-display guard: the checklist item's SourceLine points at the C.127 fee/biometrics page (vfsglobal.com), not A.031, since the visible note carries the fee. Four-state tagging: 1 used, 0 rejected/needs-human-call; A.029/A.030 (Kathmandu/Pokhara ABCC locations) stay use-later as contact/location data. No scorer touched (`financial.ts` + `funding-reliability.ts` untouched); `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
- **Ledger slice H — DHA police / character certificate → checklist + plan (merged 2026-06-09).** Spec `docs/superpowers/specs/2026-06-09-ledger-slice-h-police-certificate-design.md`, plan `docs/superpowers/plans/2026-06-09-ledger-slice-h-police-certificate.md`. New single-record sourced module `lib/data/source/au-police-certificate.ts` backs finding A.039 (DHA may ask for a police certificate from each country where the applicant spent 12 months or more in the last 10 years, counting only time after turning 16); `FLIP_STATUS` promoted it (overall used 391→392, pending 723→722; A 43→44; 0 rejected). The third post-lodgement visa-readiness item after health (F) and biometrics (G): a new after-offer `police-certificate` checklist info item ("Police certificate", `kind:null`, "recommended" since DHA says "may ask") and a new AU-primary-gated `prepare-police-certificate` plan action ("Get your police certificate") — both open with A.039's rule verbatim, then the soft Nepal framing ("for most Nepali students that means a Nepal Police character certificate, plus one from any other country you've lived in that long"). Single source per surface, so no source-display guard: the SourceLine is the DHA character page. Four-state tagging: 1 used, 0 rejected/needs-human-call; the Nepal-side OPCR/CID process (A.094–A.103) stays use-later for a future Nepal-side police slice, with the already-`used` OPCR turnarounds (A.098/A.099) left unsurfaced and untouched. No scorer touched (`financial.ts` + `funding-reliability.ts` untouched); `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
- **Readiness IA cleanup — checklist + plan information architecture (merged 2026-06-09).** Spec `docs/superpowers/specs/2026-06-09-readiness-ia-cleanup-design.md`, plan `docs/superpowers/plans/2026-06-09-readiness-ia-cleanup.md`. A pure product/IA slice (no data, no findings, no ledger movement, no scoring, no DB). (A) The after-offer checklist now splits into **Documents** + **Visa lodgement steps** (`ChecklistStageSection` became a generic labeled-blocks renderer; the "now" stage stays topical). (B) `kind:null` items gain an explicit `infoKind` and render a **Step** (after-offer process) or **Note** (now-stage reference) chip instead of "Bring this"; the required/recommended pill is suppressed on info items (so police-certificate shows just "Step", its "may ask" conditionality carried by the note). (C) The plan groups into **Your next steps** (impact-grouped) + **Visa preparation** (AU visa-prep actions, declared in `lib/plan/phases.ts`, Genuine Student first), grouped at render time from `kind`. Checklist↔plan de-dupe deferred. `golden-assessments.json` byte-identical; scorer + sourced data untouched.
- **Ledger slice I — Nepal-side police / OPCR process → checklist + plan (merged 2026-06-09).** Spec `docs/superpowers/specs/2026-06-09-ledger-slice-i-nepal-police-process-design.md`, plan `docs/superpowers/plans/2026-06-09-ledger-slice-i-nepal-police-process.md`. The sequel to slice H (the DHA character requirement): new 3-record `kind`-discriminated module `lib/data/source/nepal-police-certificate.ts` backs the OPCR-core findings — the application route (A.095/A.096/A.097, the `G8` web/Nagarik-App enumeration plus apply-from-abroad collapsed into one route record), the uploaded document set (A.100), and the 3-month study/migration validity (A.102); `FLIP_STATUS` promoted all five (overall used 392→397, pending 722→717; A 44→49; 0 rejected). **Extend-not-add:** the existing `police-certificate` checklist item's note gains the document set to prepare (what-to-prepare), and the existing AU-gated `prepare-police-certificate` plan action's body gains the OPCR route (portal/Nagarik App/from abroad), the standard+urgent turnaround (A.098/A.099 reused **read-only** from `nepal-document-processing-times` — their first user-facing surface, no C/processing-times churn), the 3-month validity, and a timing nudge (how-to-and-when). No new checklist item, no new plan kind (no `phases.ts` change); the checklist note stays shorter than the plan body. Four-state tagging: 5 used; A.095/A.096 both ship `used` (enumeration, conflict gate green); A.094 (general CID statement), A.101 (non-TIA ward recommendation), A.103 (abroad PDF download) stay use-later by slice boundary; B.134 (cross-category near-dup) left untouched (no `B.jsonl` edit). No scorer touched (`financial.ts` + `funding-reliability.ts` untouched); `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
- **Ledger slice J — Nepal passport process readiness → checklist + plan (merged 2026-06-10).** Spec `docs/superpowers/specs/2026-06-10-ledger-slice-j-passport-process-design.md`, plan `docs/superpowers/plans/2026-06-10-ledger-slice-j-passport-process.md`. New 4-record module `lib/data/source/nepal-passport-process.ts` (no `kind` — records picked by id) backs the e-passport pre-enrolment steps: the online pre-enrolment form (A.043), choosing an enrolment centre + appointment (A.044), the barcode/QR copy produced on submission (A.045), and photo + biometrics at the centre (A.046); `FLIP_STATUS` promoted all four (overall used 397→401, pending 717→713; A 49→53; 0 rejected). Answers "if I don't have a passport yet, how do I start?": the existing "Passport bio page" checklist row gains a short how-to-start note + Department of Passports SourceLine **only when no passport is uploaded** (conditionally framed, "If you still need a passport…"), and a new plan action `start-passport-process` ("Start your passport application", medium impact) carries the fuller process + the central-office ~2-working-day turnaround (A.049, reused **read-only** from `nepal-document-processing-times`). **First document-derived plan input:** `generatePlan` gains a narrow `hasPassport?: boolean` (omitted ⇒ not emitted); `invalidatePlan` derives it from one `listDocumentsForUser` load (`docs.some(d => d.kind === "passport")`) — no broad documents-table dependency. Destination-agnostic → not a `VISA_PREP_KIND` (no `phases.ts` change); auto-closes once a passport is uploaded (existing satisfied-todo sweep). No new `DocumentKind`. Four-state tagging: 4 used; fees A.047/A.048 stay in `nepal-application-fees` (cost-to-apply); A.050 (district 15–45 days range) use-later. No scorer touched (`financial.ts` + `funding-reliability.ts` untouched); `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
- **Ledger slice K — Refusal risk & recovery panel → results page (trust-defense; merged 2026-06-10).** Spec `docs/superpowers/specs/2026-06-10-refusal-risk-recovery-panel-design.md`, plan `docs/superpowers/plans/2026-06-10-refusal-risk-recovery-panel.md`. **First trust-defense slice** (pivot from linear A→J slicing to a pending-ledger value audit; category I chosen as the highest value-to-feasibility, gov 62/78). New 11-record module `lib/data/source/nepal-refusal-recovery.ts` (category I, `kind`-discriminated) backs a new propless results-page panel `components/results/refusal-recovery.tsx`, rendered after `PolicyBanner` in both anonymous and owned modes (not gated). Four gov-sourced sections: **why applications are refused** (Genuine Student I.008/I.006, financial+English capacity I.029, document integrity I.027), **honest odds by sector** (Higher Education 85.3% I.034 emphasized / VET 36.3% I.035 as contrast, with the locked VET guard line — never personal odds), **what recovery looks like** (ART review I.044, the AUD 3,580 fee I.045, 50% hardship reduction I.046, ministerial intervention as a limited conditional last resort — *not a normal appeal path* — I.057/I.059/I.060), and **what not to trust** (no work permits/visa labels/LMIAs I.078/I.079/I.080, bogus documents I.028). `FLIP_STATUS` promoted all 16 (overall used 401→417, pending 713→697; I 2→18; 0 rejected). **Three headline numbers wired `structured`** (I.034 85.3%, I.035 36.3%, I.045 AUD 3,580) — each carries a numeric `value` reconcile's value-fidelity pass guards against drift; the other 13 are prose-only. Complements `PolicyBanner` (onshore/offshore) with the orthogonal sector cut. Four-state tagging: 16 used; use-later = clause enumeration (I.007/I.009), GS-process dups (I.001–005), capacity figures already used via `au-cost-of-living` (I.017–020), raw Nepal counts (I.036–039), dataset-meta (I.030/031), I.058 (must-leave deep dive); needs-human-call = the 16 non-gov I findings (feed the future G agent-risk task). No scoring change (`golden-assessments.json` byte-identical; scorer + `phases.ts` untouched); no new `DocumentKind`; reconcile/schema/flip-status green incl. value-fidelity; clusters unchanged at 41.
- **Visual & functional audit + agreed fix order (2026-06-10).** Full preview walkthrough (marketing → wizard → anonymous results → dev sign-in → dashboard/matches/plan/checklist/profile/documents/guide, desktop + mobile + dark probe, interactive testing of plan actions / profile edits / uploads / shortlist). Report + findings inventory (4 critical / 7 high / 11 medium / 5 polish) + verified reactivity map + user-agreed 10-item fix order: `docs/audits/2026-06-10-visual-audit-and-fix-order.md`. Headline criticals: destination silent swap (C1), dashboard next-step contradicts the plan (C2), mobile nav dead-end (C3), invisible next-step CTA (C4). The UX-fix backlog now leads the lane; ledger triage (F slice-shaped, G needs human sourcing) resumes after.
- **Destination honesty — wizard + API + results (fix #1; merged 2026-06-10).** Spec `docs/superpowers/specs/2026-06-10-destination-honesty-design.md`, plan `docs/superpowers/plans/2026-06-10-destination-honesty.md`. Pure product/trust slice (no data, no scoring) killing audit finding C1: the wizard offered six destinations while every corridor silently resolved to Australia data (`lib/results/assemble.ts` even claimed a "more countries coming" UI note that never existed — a Canada run rendered a fully Australia-framed assessment with zero mentions of Canada). New single source of truth `SUPPORTED_DESTINATIONS`/`isDestinationSupported()` in `lib/scoring/types.ts` (exports only — no engine change) consumed by three guards: (a) the destination step renders Canada/UK/Germany/USA/Ireland disabled with a "Coming soon" note (`OptionCard` gains a `disabled` prop) + honest subtext, and `isStepComplete` rejects unsupported values from stale drafts; (b) `/api/assess` returns 422 (`Destination not supported yet`) instead of assessing an unsupported corridor; (c) `Results` gains a required `destination` prop — unsupported renders an `UnsupportedDestinationNotice` ("We don't cover Nepal → Canada yet." + one explicit `/assess?new=1` CTA) instead of the assessment, `not-sure` renders the readout plus an explicit delegation-resolved framing notice ("Australia is the only corridor we fully cover today…"), `australia` unchanged; both call sites pass it (`AssessFlow` from the wizard profile, `/assessment/[id]` from `destination_id`, covering legacy rows). 9 new tests across `tests/scoring/destination-support.test.ts`, `tests/components/wizard/destination-step.test.tsx`, `tests/api/assess.test.ts`, `tests/components/results/results-destination.test.tsx`. Browser-verified live: five disabled "Coming soon" options, Canada click selects nothing + Continue stays disabled, the not-sure run shows the framing notice above the verdict. Out of scope (noted in spec): profile destination editor (still lists all six; uses `"us"` vs scoring's `"usa"`), dashboard standing for hypothetical legacy non-AU rows. Gate: 165 files / 760 tests green, typecheck + lint clean, `golden-assessments.json` byte-identical, `financial.ts` + `funding-reliability.ts` + `docs/research-briefs` + `lib/data/source` untouched.
- **Parallel wave 1 — fixes #3, #7+#9, #6 (merged 2026-06-10, `cbdc74e`…`baa7a13`).** First parallel-agent wave: three worktree agents implemented disjoint slices TDD-style; the main loop stayed the sole integration gate (diff review → full gate → ff-only merge → push → browser smoke). (a) **Mobile nav (#3):** new `components/layout/mobile-tab-bar.tsx` — fixed bottom tab bar below `md` in the signed-in shell (Home/Matches/My plan/Documents/Guide mirroring the canonical `NAV_APP`; Profile stays in the avatar menu), `aria-current` active state, safe-area inset, content+footer bottom padding; kills audit C3 (six dead nav links at 375px). (b) **Affordance & claim honesty (#7+#9):** DOCUMENTS tile → `/documents` (was `/checklist`); journey stepper de-chipped to a plain progress row (4 of 5 steps had no route — stripped the tappable styling rather than fake links); SCHOLARSHIPS tile an honest non-link "Coming soon"; the anonymous gate no longer blur-teases "3 scholarships" (feature doesn't exist); footer claim "checked daily" → "Every data point carries its source and a verification date."; guide h1 de-jargoned ("Your AI guide is coming soon."), matches stub tabs lead with plain "Coming soon —". (c) **Profile save lifecycle (#6):** agent verification corrected the audit — editors always had inline Saved/error text; the real bugs were stale row summaries + completeness ring (no refresh anywhere), a permanent un-animated notice, and a form stuck on "saving" forever after a network-level fetch rejection. New shared `useSectionSave` hook + `SaveFeedback` (deduplicates 13 editors, net −48 lines): `router.refresh()` on success so summaries/ring update live (browser-verified: rename updates the row without reload), `animate-fade` notice auto-clearing after 2 s, `.catch(() => null)` failure path. Infra: `.claude/**` agent worktrees excluded from eslint/vitest/git (`e0876ba`) — unexcluded worktree copies had produced 558 phantom lint errors. Gate after each merge; suite grew 760 → 777 green.
- **Next-step unification — the plan is the single "what's next" brain (fix #2 + #8's CTA; merged 2026-06-10).** Spec `docs/superpowers/specs/2026-06-10-next-step-unification-design.md`, plan `docs/superpowers/plans/2026-06-10-next-step-unification.md`. Kills audit C2 (dashboard said "All caught up — refresh your assessment whenever your profile changes" — naming a control that exists nowhere — while the plan had 3 open high-impact items; root cause: `pickPromptKind` never consulted the plan) and C4 (invisible CTA). **Model (user decision 2026-06-10, "two kinds + waiting"):** every plan kind is declared `verified` or `self-reported` in `lib/plan/completion.ts` — verified kinds (10: profile fields, uploads, passport) complete only via `invalidatePlan`'s observed-state sweep, lose the Done button (the card CTA deep-links to the completing surface; `/api/plan/action` 422s manual done/started on them — computed truth wins), while self-reported kinds keep Done/Dismiss and gain **"Mark as in progress"** (`started_at timestamptz`, additive migration `20260610150000`; status stays `todo` so the partial unique index, open-item queries, and `invalidatePlan` are untouched; any status change clears it). `add-safer-options` deliberately self-reported: its generator condition watches match verdicts, not the shortlist the user edits. **Selector** `lib/plan/select.ts` (`groupOpenItems`/`orderOpenItems`/`selectNextStep`) extracts the plan page's exact ranking (impact groups, then visa-prep sequence) and is consumed by both `PlanList` and the dashboard; next step = top open *actionable* (not started) item; "All caught up" only at zero open; all-waiting renders "Everything is underway" (n in progress), never caught-up. **Live-caught determinism bug:** batch inserts share `created_at` and Postgres returns ties in arbitrary per-query order — dashboard and plan page disagreed on the top item ("Add proof of funds" vs "Add evidence for your study gap") until the selector took ownership of ordering (`created_at` desc, `id` asc tiebreak). **C4 root cause found and fixed:** an *unlayered* `a { color: inherit }` in `globals.css` beat every Tailwind utility layer (unlayered CSS wins over all `@layer` rules), silently disabling color utilities on links app-wide — deleted (preflight's layered copy provides the same base), CTA pill now `bg-bg`/`text-primary` (computed teal-on-paper verified live; distinct tokens in both palettes). Remaining unlayered resets (`p`/`h1–h4` margins eat `mt-*` utilities) flagged as a spawn-task for its own visual-review slice. 20 new tests (selector determinism/waiting/caught-up, completion classification, API guard + started toggle, kind-aware card controls, prompt three states + repro-inverted dashboard tests); suite 777 → 797 green. Browser-verified: dashboard top == plan top, "Mark as in progress" persists (badge + Back to open) and the dashboard skips started items, phantom copy grepped to zero. Dev DB migrated via MCP (`started_at` live).
- **Parallel wave 3 — fixes #4, #5, #8 remainder (merged 2026-06-10, `714d71a`/`be05d8f`/`3913433` + follow-through `da59c82`).** Three worktree agents, same integration gate. (a) **Plan polish (#4):** honest lift estimates — the "Could re-classify N possible matches as strong" claim was *provably* impossible (the report supplies min-of-bands ≤ overall, so a band gap can only hold or grow; `compute.ts` can never lift possible→strong on upload) → now "Verifies per-band requirements on N possible match(es)" counting only `scoreSnapshot.bandGap > 0` rows; "Single biggest lift…" → "Core financial evidence for your visa case"; "Prevents the most common refusal reason…" → "Addresses a documented refusal ground — financial capacity" (the sourced refusal data ranks no frequencies, and "prevents" read as a guarantee); bodies (sourced findings) untouched. Closed rows get explicit mono "Done"/"Dismissed" chips (dismissed not struck through); `PlanListLive` 16-line client shell wires `onChanged → router.refresh()` so section counts/grouping stay live (the #6 pattern). **Integrator follow-through (`da59c82`): `invalidatePlan` now refreshes generator-owned copy** (title/body/impact/estimates) on still-relevant open rows — stored rows persist insert-time copy, so honesty fixes otherwise reached only new inserts; user-owned state (status, `started_at`) untouched; browser-verified that a stale stored claim refreshed while keeping its In-progress badge. (b) **Checklist step completion (#5):** checklist STEP rows mirror their plan item (the plan stays the *single* completion authority — no second Done control anywhere, pinned by a `queryByRole("button")` test): `lib/checklist/plan-links.ts` maps noc-application→apply-for-noc, biometrics→prepare-biometrics, police-certificate→prepare-police-certificate, doc-preparation→translate-certify-documents; rows show "In your plan" / "In progress" / "Done" chips + "Track in your plan →"; `medical` deliberately unmapped (vault-bound document row — a plan mirror would put two completion authorities on one row; a unit test locks mapped keys to `kind === null`); dismissed plan rows render as unlinked (user declined). (c) **#8 remainder:** factor-bar expand affordance is data-driven (`factors.length > 0`) — profile-strength for most profiles ships zero factors and no longer pretends to open, and dimensions *missing* the factors array (legacy stored payloads) no longer crash on click; the "threshold for australia" casing leak originates in goldens-pinned `lib/scoring/visa.ts` strings, so it's humanized at the single render seam (`lib/results/factor-copy.ts`, word-bounded + case-sensitive `DESTINATION_LABELS` with in-sentence "the UK"/"your destination" forms); source-line rendering confirmed dimension-agnostic — academic/profile-strength factors carry no source in the engine (heuristic-backed by design), so nothing was fabricated, and a characterization test pins the seam. Suite 799 → 839 green across the wave; browser-verified (plan chips + refreshed claims, checklist mirror chips live on /checklist/curtin-mit).
- **CSS reset layering — slice 9.5 (merged 2026-06-10, `d31034f`).** User-prioritized ahead of #10 (both touch visual behavior; the corrected cascade is #10's review baseline — strictly sequential). The remaining unlayered element resets in `app/globals.css` (`*`, `html,body`, `body`, `h1–h4`, `p`, `button`, `::selection`, scrollbar `*`) moved into `@layer base` — unlayered CSS outranks every Tailwind layer, so they had been silently disabling margin/leading/tracking/font/cursor utilities on those elements app-wide (same defect class as the `a { color: inherit }` rule killed in the next-step slice; this is occurrence two and three). Purely structural diff (+5 lines, declarations byte-identical); token blocks/`@theme` untouched. Agent produced a 75-hit census of awakened utilities; integrator ran an element-by-element before/after diff (computed margins/weights captured into localStorage pre-change across marketing home, guide, assessment readout, dashboard, profile): **zero regressions** — every delta restores authored intent (hero `mt-5`/`leading-[1.05]` live again, verdict-card/accuracy/match-card spacing back, `mx-auto` subcopy actually centers, mono-up labels regain `tracking-wide`, disabled option-cards finally show `cursor-not-allowed`); the two likeliest double-spacing candidates (verdict card, match cards) have block parents with no `gap` to stack against. New regression guard `tests/styles/globals-layering.test.ts` fails if any unlayered element/universal rule reappears in globals.css. Suite 839 → 841 green.
- **Profile editor consolidation — fix #10, the fix order's final slice (merged 2026-06-10, `3c1f0db`).** Spec `docs/superpowers/specs/2026-06-10-profile-editor-consolidation-design.md` (user-approved 13→8 grouping; built strictly after slice 9.5 per the user's sequencing). Editor-level regroup, storage keys frozen: 8 group editors (About you = personal+family; Destination & intake = destination+`personal.intakeIso`+deal-breakers; Academic; Study & career goals = intended-study+career; English; Work & study gap = work+gap; Money & scholarships = finance+scholarships; Visa history = immigration), 10 emptied editors + their tests deleted, 11 independently-green commits. **Group save fan-out:** `useGroupSave` PATCHes `/api/profile/section` once per *dirty* member section (per-section `JSON.stringify` baseline refs; zero-dirty saves skip the network), one Saved/error notice, `router.refresh()` after all succeed; the route's shallow per-section merge makes the split-personal pattern safe (About you patches `{name,age}`, Destination & intake patches `{intakeIso}` — neither clobbers the other). Group row status derives from member sections (all complete / any progress / none); ring math untouched (breakdown still counts the 13 storage sections). Structured inputs: shared `ChipInput` (Enter/comma/blur commit, `string[]`) for gap evidence, scholarship tags, must-haves (replacing the predefined checkboxes per spec); grade system a select over the `GradeSystem` enum. **Destination honesty folded in:** primary + alternates offer only `SUPPORTED_DESTINATIONS` + not-sure via `isDestinationSupported` (the wizard's source of truth), others disabled "Coming soon"; legacy `"us"` loads as `"usa"` and self-heals on next save (dirty baseline deliberately built from raw stored values; Zod would 422 a `"us"` write); stored unsupported values are preserved, and an integrator follow-up made selected-but-unsupported *alternates* unticakble — honesty restricts adding, not removing. Tests: 35 old editor tests reorganized + 71 added, acceptance criteria 1–8 each mapped; suite 841 → 878 green. Browser-verified: exactly 8 rows with composed summaries + derived statuses, honesty cards live in the editor, grade-system enum select, and a live About-you group save (age) → one Saved notice + row summary updated without reload. **The 2026-06-10 audit fix order (#1–#10 + user-inserted 9.5) is fully shipped.**
- **Data governance Phase 1 — memo + triage/freshness schema + guard (merged 2026-06-10, `cf5f411`/`0777580`/`03cba3f`).** Memo `docs/audits/2026-06-10-data-governance-and-triage.md` pins the post-fix-order pivot (user-agreed): **no more row-by-row slicing by default**; slices chosen from ranked clusters; ledger "done" = fully *triaged*, not fully used. **Ownership split:** `status` stays machine-owned (FLIP_STATUS derives used/pending from code refs; `rejected:*` the one human-set status) — new human-owned `triage` (`ready`|`use-later`|`needs-human-call`|`stale`) + required one-line `triage_reason` in `finding-schema.js`, valid only on `pending` (integrating/rejecting must clear it in the same change — the schema fails as the designed reminder; the FLIP_STATUS JSONL rewrite preserves unknown fields, verified); `cluster_triage` (shape) stays orthogonal. **Freshness enforced, not decorative:** both provenance schemas (`ProvenanceSchema` + `ConfigProvenanceSchema`) gain optional `volatility` (`stable`|`annual`|`volatile`) and `reverifyBy` (ISO; required when non-stable); new `tests/data/freshness.test.ts` walks `DATA_MODULES` and goes red the day any `reverifyBy` arrives — deadlines are change-dates (DHA fees → 1 July), not TTLs; backfill lands with the phase-3 volatile refresh. Zero findings/data rows touched; goldens byte-identical; suite 878 → 898 green. **Next: Phase 2** — cluster-level triage of the 697 pending (parallel per-category agents; uncertainty → `needs-human-call`; output = ranked cluster report + triage fields only) with PostHog analytics instrumentation in parallel (app code, no ledger overlap); then Phase 3 volatile-fact refresh (AI-drafted, human-verified) + the human compliance read-through packet; then the next lane is chosen from evidence (F = current hypothesis).
- **Data governance Phase 2a — full pending-ledger triage (merged 2026-06-10, `dcfb892`/`6ab86ab`).** All 697 pending findings triaged in one pass: ten parallel **read-only** category agents (A–J) classified each pending row + grouped 102 thematic clusters; the main loop validated and applied centrally via the new `docs/research-briefs/_tools/apply-triage.js` (refuse-on-any-error single writer, same EOL/verbatim discipline as FLIP_STATUS; 9 TDD tests). Zero validation errors; a field-level diff proved **only `triage`/`triage_reason` changed on exactly 697 rows** (claim/source/status bytes untouched); goldens byte-identical; suite 898 → 907. Result: **280 ready / 298 use-later / 104 needs-human-call / 15 stale**, ranked in `docs/audits/2026-06-10-pending-ledger-cluster-triage.md`. **Headline 1: the Genuine Student slice is confirmed by three-category convergence** (~50 gov findings — F's MD106 factor set (17) + official prompt set + regime basics + post-study honesty, E's GS mechanics (8), C's GS framework (7)). **Headline 2: G is not human-only** — a 23-finding gov spine (OMARA lawful-assistance rules (16) + the dated 2026 onshore commission reform (7)) makes a "working with agents" surface code-ready now; the ~84 consultancy self-claims stay the precisely-scoped editorial task. Recommended slice sequence pinned in the report: (1) GS credibility module, (2) working-with-agents gov core, (3) source-of-funds deepening, (4) refusal/recovery panel extension (incl. the in-force 2026-06-01 paper-only ART change). Triage notes worth acting on: fresher grant-rate dataset BP0015 (2026-04-30) for a band refresh; I.058 overturned its prior park (gov MI myth-buster).
- **Analytics instrumentation — Phase 2b (merged 2026-06-10).** Spec approved by user same day (`docs/superpowers/specs/2026-06-10-analytics-instrumentation-design.md`, as-built notes inside; user constraint: "lightweight — typed events, no private payloads, done"). posthog-js init in one client provider mounted from the root layout — **silent no-op without `NEXT_PUBLIC_POSTHOG_KEY`** (dev/test/CI emit nothing); **autocapture off, session recording off, `respect_dnt`, pageviews via `history_change`** (App Router client navs count). One typed catalog `lib/analytics/events.ts` (discriminated `AnalyticsEvents` map + thin `track()`/`identify()`, the only call surfaces; payloads are closed enums + id strings only — pinned by `expectTypeOf` + `@ts-expect-error` tests). **9 of the spec's 10 events wired** (`checklist_item_toggled` deferred — no toggle exists; checklist completion mirrors plan/documents, so a catalog entry would be decoration): wizard step/completion, assessment_viewed (band only), source_link_clicked via new client leaf `components/analytics/source-anchor.tsx` (five real surfaces: factor-bars, refusal-recovery, cost-to-apply, checklist, matches — panels stay server components), both anonymous gate CTAs, dashboard prompt CTA (all four states), plan_action on confirmed API success, checklist→plan link, signed_in + UUID-only identify from the `(app)` shell (`identify-user.tsx`, once per page session). 10 new tests in `tests/analytics/` (no-op, catalog pins, fetch-spy provider, three mocked-posthog surface tests incl. API-failure-emits-nothing); suite 907 → 917 green. Browser-verified with the dev key empty: provider mounts app-wide with zero PostHog network calls/storage and a clean console; wizard steps normally with the per-step effect live. The two events the lane reads first: `source_link_clicked.surface` and `plan_action`.
- **GS credibility module — Genuine Student panel → results page (trust-defense slice ②; merged 2026-06-10).** Spec `docs/superpowers/specs/2026-06-10-genuine-student-credibility-design.md`, plan `docs/superpowers/plans/2026-06-10-genuine-student-credibility.md`. **Slice ② of the user-ratified sequence**, confirmed by the Phase 2a ranked cluster report (Headline 1: GS is the top gov-backed converged cluster across F/E/C). New 20-row sourced module `lib/data/source/au-genuine-student.ts` (category F, prose-only) backs a new collapsible results-page panel `components/results/genuine-student.tsx`, rendered directly after `RefusalRecovery` (which names Genuine Student among its main grounds) in both anonymous + owned modes, not gated. Five native `<details>` sections (first open, rest collapsed — all rows stay in the DOM, so the panel remains a server component with the `SourceAnchor` client leaf as its only interactivity): what GS is, the four questions, how officers weigh it (Direction 106 — seven factor rows + the SSVF evidence level), post-study honesty, and evidence + English red flags. `FLIP_STATUS` promoted all 49 gov findings pending→used (overall used 417→466, pending 697→648; 0 rejected); I.008 (clause 500.212) is **rewired, not newly flipped** — already `used` by `nepal-refusal-recovery`, it now also anchors the post-study row's genuineness clause. Two governance firsts: **flip-status taught to clear triage on promotion** (new pure `applyChange` — GS is the first slice to integrate triaged findings, and a `used` row must not carry the human-owned `triage`/`triage_reason`), and the 49 prose findings marked `value_status:"prose-only"` (SLICE-TEMPLATE step 3 — the module carries no structured values). **Plan + checklist enrichment:** the existing `prepare-gs-answers` plan body rebuilt from the module (short in-form questions, 150 words each in English, evidence carries weight, the PR-genuineness line), and a new after-offer `gs-responses` checklist step mirrored to that plan item via `CHECKLIST_PLAN_LINKS` (the plan stays the single completion authority); new `"genuine-student"` analytics surface (source links flow through `SourceAnchor`, type-pinned). **Two user copy tweaks honored:** no "#1 refusal ground" framing (softened to "a main ground"), and the PR line tied to genuineness + eligibility ("wanting permanent residence later doesn't count against you as long as your study plan and stay are genuine under the visa rules" — "temporary" dropped since GS replaced the GTE test). F.040/F.041/F.055 stay pending (practitioner corroborations; trust-sensitive content renders from gov sources only). No scorer touched (`golden-assessments.json` byte-identical; fact-only module); reconcile/schema/findings-integrity/freshness/flip-status green. Suite 917 → 925; typecheck + lint clean; **browser-verified live** on the anonymous results page (panel after refusal, section 1 open + the MD106 section expanded showing all eight rows, 20 source links, zero console errors).
- **Working-with-agents gov core — agents trust panel → results page (trust-defense slice ③; merged 2026-06-12).** Spec `docs/superpowers/specs/2026-06-12-working-with-agents-gov-core-design.md`, plan `docs/superpowers/plans/2026-06-12-working-with-agents-gov-core.md`. **Slice ③ of the user-ratified sequence.** New 16-row sourced module `lib/data/source/au-working-with-agents.ts` (category G, prose-only) backs a new collapsible results-page panel `components/results/working-with-agents.tsx`, rendered directly after `GenuineStudent` — completing the trust-defense triptych (why applications fail → the GS test → working with agents) in both anonymous + owned modes, not gated. Five native `<details>` sections (first open, rest collapsed): do you need an agent, check the register first, what your agent owes you, formal representation (Form 956), and the 2026 commission ban. Gov-only spine: 12 OMARA/DHA lawful-assistance rules + 4 from the dated 2026 onshore-commission reform. `FLIP_STATUS` promoted exactly 16 gov findings pending→used (overall used 466→482, pending 648→632; 0 rejected, **0 rewired** — all fresh category-G refs, no cross-category reuse), each marked `value_status:"prose-only"` **before** the flip so no `used`+`unset` window ever existed (the `USED_UNSET` gap caught during GS, now engineered out). The 7 `use-later` rows in these clusters stay pending; the 66 consultancy + 18 university self-claims stay pending (editorial / needs-human-call). New `"working-with-agents"` analytics surface (7th member, type-pinned). **Four user copy tweaks honored:** broader disclaimer scope (migration assistance + education-agent commissions), G.074 softened to "limited exempt persons", G.090 made date-precise (after 31 March 2026), G.096 re-sourced to "the government warned… could expose students to exploitation". Surface-only — **no plan/checklist/scoring/golden change** (`golden-assessments.json` byte-identical); reconcile/schema/findings-integrity/flip-status green; an adversarial findingRef-drop confirmed the coverage guard bites (schema + reconcile fail, then revert). Suite 925 → 930; typecheck + lint clean; **browser-verified live** on the anonymous results page (panel after GS, section 1 open, all 16 rows across the 5 sections, the three copy-locked trust lines verbatim, zero console errors).
- **Open backlog (working-with-agents shipped 2026-06-12; user-ratified sequence):** ① **data-governance Phase 3 + refusal/recovery extension** (volatile refresh incl. the 15 stale findings + reverifyBy backfill, human read-through packet — **the in-force 2026-06-01 paper-only ART change touches shipped refusal/recovery copy; slot it in early as the next trust-maintenance item, not months later**), then next lane from usage + ranked clusters. Standing: the 104-finding human queue (agent-risk editorial task precisely scoped, salary-evidence policy, gap markers to commission or close); `/matches` Problem B remaining sub-lanes (research-gated); minor parked items: snapshot-card test fixture uses a drifted dimension shape (test-hygiene), `not-sure` wording in factor copy reads "your destination" via the render seam.

---

## Phase log

### Pre-existing (before this autonomous session)
- **Foundation + domain** (`docs/superpowers/plans/2026-06-02-foundation-and-domain.md`) — Tailwind tokens, scoring engine (4 dims), Nepal source data, Australia destination data, callouts rules, fields registry
- **Wizard + results UI** (`docs/superpowers/plans/2026-06-02-wizard-and-results-ui.md`) — 9-step wizard, results page, ConversionPaths
- **Auth + persistence** (`docs/superpowers/plans/2026-06-03-auth-and-persistence.md`) — Supabase scaffolding, `/api/assess` with anon persistence, OAuth callback, lead capture, owner-only `/assessment/[id]`

### Phase 0 — Marketing + chrome
**Spec:** `docs/superpowers/specs/2026-06-04-marketing-and-shell-design.md`
**Plan:** `docs/superpowers/plans/2026-06-04-phase-0-marketing-and-chrome.md`
**Tasks (21):**
1. Logo primitive
2. TrustStrip
3. Footer
4. FocusBar
5. AppBar marketing variant
6. Route group restructure → `(marketing)/` + `(focused)/`
7. Eyebrow primitive
8. Tile primitive
9. HeroPreview card
10. HowItWorks card
11. TrustCallout
12. Homepage composition
13. Marketing destinations data layer (6 countries)
14. DestinationCard
15. Destinations index page
16. Fact + DestinationDetail
17. Destination detail page with [id]
18. `/how` + `/trust` stubs
19. AuthCard component
20. `/auth` page
21. Verification gate

**Outcome:** ✅ Merged. +1321 lines / 45 files. No DB changes. Final review found 0 critical issues; mobile-nav gap + `max-w-[1120px]` literals flagged as follow-ups.

### Phase 1.5 — Signed-in shell + multi-assessment
**Spec:** `docs/superpowers/specs/2026-06-04-phase-1-5-signed-in-shell-design.md`
**Plan:** `docs/superpowers/plans/2026-06-04-phase-1-5-signed-in-shell.md`
**Tasks (37):**
1. Profile section keys + types (`lib/profiles/sections.ts`)
2. Completeness calc (pure)
3. From-assessment mapper (pure)
4. Profiles types re-export
5. DB migration: `profiles` table + evolve `assessments` (drop `profile`, add `destination_id`, `is_primary`, `profile_snapshot`)
6. Regenerate `lib/supabase/types.ts`
7. Migrate `lib/assessments/repo.ts` to new schema
8. Add `getPrimaryAssessmentForUser` + `listAssessmentsForUser`
9. `lib/profiles/repo.ts` (get, upsert, patch)
10. `claimAndBootstrapProfile`
11. Wire OAuth callback to new claim flow
12. Validation `lib/validation/profile-section.ts` (personal only)
13. `PATCH /api/profile/section`
14. `/api/assess` signed-in branch
15. AppBar variants (marketing-signed-in + app)
16. UserPill component
17. FocusBar `signedIn` prop
18. `(marketing)/layout.tsx` reads session
19. `(focused)/layout.tsx` reads session
20. `(app)/layout.tsx` auth gate
21. Stub pages (matches/plan/checklist/guide)
22–27. Dashboard components (Greeting, SnapshotCard, PromptCard, JourneyTimeline, StatsRow, RecentUpdates)
28. `/dashboard` page
29. CompletenessRing
30. SectionAccordion + SectionSummary
31. PersonalEditor
32. `/profile` page composition
33. AssessInterstitial component
34. `/assess` server-side fork
35. `/auth` honors `?next=`
36. AuthCard carries `next=/dashboard`
37. Verification gate

**Post-review fixes (3 critical/important):** Signed-in refresh shows owned-mode results, callback redirects to `/assess?error=expired` on failed claim, `safeNext` rejects `//attacker.com`.

**Outcome:** ✅ Merged. +6,931 lines / 78 files. 262 tests at merge.

### Phase 2 — Full profile editor
**Spec:** `docs/superpowers/specs/2026-06-04-phase-2-full-profile-editor-design.md`
**Plan:** `docs/superpowers/plans/2026-06-04-phase-2-full-profile-editor.md`
**Tasks (4):**
1. Extend `lib/validation/profile-section.ts` to discriminated-union over all 13 sections; add 24 test cases
2. Build 6 editors: destination, academic, intended-study, english, gap, work
3. Build 6 editors: finance, immigration, family, career, scholarships, deal-breakers
4. Wire EDITORS dispatch table in `/profile`; full verification; merge

**Post-merge hotfix:** 12 TS strict errors in editor tests (`fetchMock.mock.calls[0][1]` needed `!`).

**Outcome:** ✅ Merged. 316 tests at merge.

### Phase 3 — Programs + matches with real Nepal→Australia data
**Spec:** `docs/superpowers/specs/2026-06-04-phase-3-programs-and-matches-design.md`
**Plan:** No standalone MD; tasks were dispatched directly. **Plan reconstructed in §Phase 3 details below.**
**Tasks (5):**
1. DB migration (`universities`, `programs`, `user_program_state`) + types regen + `lib/programs/policy.ts` with Nepal AL3 constants
2. `lib/programs/{types,seed,repo}.ts` — 15 universities × 64 programs from research, seeded via separate migration
3. `lib/matches/{types,compute,repo}.ts` (pure compute, shortlist persistence), `lib/scoring/multi-destination.ts`, deprecation marker on legacy `lib/matching/universities.ts`
4. `POST /api/shortlist`, `/matches` page composition, components: PolicyBanner, MatchesTabs, ShortlistButton, ProgramCard, VerdictGroup
5. Dashboard Universities stat sources from `listShortlistForUser`; verification + merge

**Sourcing context:** All data derived from `docs/research/2026-06-04-nepal-australia-data.md` — a deep-research report with university-level entry thresholds + DHA financial floor + Genuine Student factor list + Nepal Assessment Level 3 timeline (effective 2026-01-09).

**Outcome:** ✅ Merged. 360 tests at merge.

### Phase 4 — Plan generator + ranked actions
**Spec:** No standalone MD; design captured inline in Phase 1.5 spec §13 + the Phase 4 dispatch prompts. **Plan reconstructed in §Phase 4 details below.**
**Plan:** No standalone MD.
**Tasks (5):**
1. Migration: `plan_items` table with partial unique index `(owner, kind) where status='todo'` + RLS + types regen
2. `lib/plan/{types,generator,repo,invalidate}.ts` — pure rules generator, repo, invalidate-and-insert
3. `POST /api/plan/action` + wire `invalidatePlan` into `/api/profile/section` and `/api/assess`
4. `/plan` page + ImpactPill + PlanItemCard + PlanList; defensive try/catch around invalidate in profile route
5. Milestone + merge

**Outcome:** ✅ Merged. 383 tests at merge.

---

## Phase 3 detailed plan (reconstructed)

### File structure delivered

```
supabase/migrations/<ts>_add_programs_universities_state.sql   NEW
supabase/migrations/<ts>_seed_universities_and_programs.sql    NEW

lib/programs/
├── types.ts          University, Program, ProgramLevel, DataQuality + Supabase Row aliases
├── seed.ts           SEED_UNIVERSITIES (15) + SEED_PROGRAMS (64)
├── policy.ts         NEPAL_ASSESSMENT_LEVEL ("L3"), DHA_LIVING_COSTS_AUD (29710), TU→WAM conversion table
└── repo.ts           listAllPrograms, listProgramsForField, listProgramsForUniversity, getProgram, listAllUniversities

lib/matches/
├── types.ts          MatchResult, MatchVerdict ("strong"|"possible"|"reach"), MatchReason
├── compute.ts        pure computeMatches(inputs, programs, universities)
└── repo.ts           upsertProgramState, deleteProgramState, listShortlistForUser

lib/scoring/multi-destination.ts   composeScoresForAllDestinations (wraps existing engine)

lib/matching/universities.ts       (deprecation header — anonymous wizard still uses)

app/api/shortlist/route.ts         POST { programId, status } | null deletes

app/(app)/matches/page.tsx         REPLACE stub — server reads profile + programs + shortlist, computes, renders verdict groups via MatchesTabs

components/matches/
├── matches-tabs.tsx     client; Universities (default), Scholarships (Coming soon), Cost estimate (Coming soon)
├── program-card.tsx     server; verdict pill, university+program, tuition, requirements, reasons, ShortlistButton
├── shortlist-button.tsx client; POSTs /api/shortlist; toggles label
├── verdict-group.tsx    server; "Strong matches (N)" + grid of cards
└── policy-banner.tsx    server; surfaces Nepal AL3 + DHA $29,710 + grant rate band
```

### Match algorithm

Per program, given user grade %, IELTS overall + band, budget in AUD, intended field:
- `gradeGap = max(0, min_grade − userGrade)`
- `englishGap = max(0, min_english − userOverall)`
- `bandGap = max(0, min_english_band − userBand)` (band defaults to overall until report upload)
- `tuitionGap = max(0, tuition_min − budget)`
- **Strong:** all gaps zero
- **Reach:** `gradeGap > 10` OR `englishGap > 1` OR `tuitionGap / tuition_min > 0.5`
- **Possible:** otherwise

Reasons surfaced: positive ("Your 72% meets the 65% minimum") + negative ("Budget below tuition by AUD 8,000") + policy ("Nepal AL3 — Genuine Student narrative needed") + field alignment.

### Migration (DDL summary)

```
universities       text PK, country, name, city, ranking_tier 1-3,
                   source, last_verified date, data_quality
                   ('primary' | 'derived' | 'secondary'),
                   timestamps + set_updated_at trigger.
                   RLS: select to authenticated for all (true).

programs           text PK, university_id FK CASCADE, name, level enum
                   (bachelors|masters|doctorate), field, tuition_min/max
                   numeric(12,2), tuition_currency, min_grade int,
                   min_english + min_english_band numeric(3,1),
                   intakes text[], source, last_verified, data_quality,
                   notes, timestamps + trigger.
                   Indexes on university_id, field, level. RLS: select to auth.

user_program_state owner uuid FK CASCADE, program_id FK CASCADE,
                   status (shortlisted|applied|withdrawn), notes,
                   composite PK (owner, program_id),
                   index on owner. RLS: per-user select/insert/update/delete.
```

### Seeding

64 programs spread across all 15 universities; tuition in AUD, sources cited. RMIT marked `data_quality: 'primary'` (only Go8 with Nepal-specific entry table); others marked `derived` per research caveats. Idempotent via `on conflict (id) do nothing`.

---

## Phase 4 detailed plan (reconstructed)

### File structure delivered

```
supabase/migrations/<ts>_add_plan_items.sql                    NEW

lib/plan/
├── types.ts          PlanItem, PlanItemRow, Impact ("high"|"medium"|"low"), PlanStatus ("todo"|"done"|"dismissed")
├── generator.ts      pure generatePlan({ sections, primaryDestinationId, matches, policy }) → PlanItem[]
├── repo.ts           listOpenPlanForUser, listAllPlanForUser, setPlanItemStatus
└── invalidate.ts     invalidatePlan(adminDb, userId) — reads profile + primary + programs, computes matches, generates plan, inserts new (owner, kind) items + auto-closes satisfied todos (kind no longer generated → done)

app/api/plan/action/route.ts          POST { id, status }
app/(app)/plan/page.tsx               REPLACE stub — server reads listAllPlanForUser, renders PlanList

components/plan/
├── impact-pill.tsx       server; "High impact" pill with token-coded color
├── plan-item-card.tsx    client; Done / Dismiss / Undo buttons that POST to /api/plan/action
└── plan-list.tsx         server; groups by High/Medium/Low; closed items in <details>

app/api/profile/section/route.ts      MODIFY: try { await invalidatePlan(...) } catch {} after patch
app/api/assess/route.ts                MODIFY: await invalidatePlan(...) inside try/catch of signed-in branch
```

### Generator rules (current set)

| Trigger | Item kind | Impact |
|---|---|---|
| `!sections.personal.name` | `set-name` | low |
| `!sections.academic.gradePercent` | `add-grade` | high |
| `sections.english?.overall == null` | `add-english-score` | high |
| English set + `reportUploaded === false` | `upload-ielts-report` | medium (with lift estimate referencing possible-count) |
| `!sections.finance.proofUploaded` | `upload-proof-of-funds` | high (mentions DHA AUD 29,710) |
| Gap ≥ 1 yr + no reasons | `document-gap-reasons` | medium |
| Gap ≥ 1 yr + no evidence | `document-gap-evidence` | high |
| Nepal AL3 | `season-funds-six-months` | high (6-month seasoning + source-of-funds note) |
| `sections.work.title` set + `!docs` | `add-work-docs` | medium |
| `!sections["intended-study"].field` | `set-intended-field` | medium |
| Has primary + has reach matches + zero strong | `add-safer-options` | medium |

Generator is **pure** (no I/O). `invalidatePlan` runs it then reconciles: it INSERTs items whose `kind` isn't already an open todo, **and auto-closes (→ `done` + `completed_at`) any open todo whose `kind` the generator no longer emits** — i.e. whose triggering condition is now satisfied. `done`/`dismissed` rows are left untouched. The partial unique index `(owner, kind) where status='todo'` provides DB-level safety.

### Migration (DDL summary)

```
plan_items   bigint identity PK, owner uuid FK CASCADE,
             kind text, impact text check ('high','medium','low'),
             title, body, lift_estimate, time_estimate,
             status text default 'todo' check
               ('todo','done','dismissed'),
             created_at, completed_at.
             Indexes: owner, partial (owner, created_at desc)
               WHERE status='todo', partial UNIQUE (owner, kind)
               WHERE status='todo'.
             RLS: select + update (status) to authenticated;
             insert/delete via service role only.
```

### API

- `POST /api/plan/action`: `{ id: positive int, status: 'todo'|'done'|'dismissed' }` → 200 / 401 / 422 / 400. Mutation via admin client (RLS permits owner update on status; admin used for consistency with other write paths).
- Existing routes call `invalidatePlan` best-effort (wrapped in try/catch). Never blocks the response.

---

## Inventory of all spec + plan files now in the repo

```
docs/superpowers/specs/
├── 2026-06-02-onboarding-mvp-design.md
├── 2026-06-03-auth-and-persistence-design.md
├── 2026-06-04-marketing-and-shell-design.md
├── 2026-06-04-phase-1-5-signed-in-shell-design.md
├── 2026-06-04-phase-2-full-profile-editor-design.md
└── 2026-06-04-phase-3-programs-and-matches-design.md

docs/superpowers/plans/
├── 2026-06-02-foundation-and-domain.md
├── 2026-06-02-wizard-and-results-ui.md
├── 2026-06-03-auth-and-persistence.md
├── 2026-06-04-phase-0-marketing-and-chrome.md
├── 2026-06-04-phase-1-5-signed-in-shell.md
└── 2026-06-04-phase-2-full-profile-editor.md

docs/research/
└── 2026-06-04-nepal-australia-data.md           (15 universities, DHA AUD figures, GS factors, AL3 timeline, OSHC, sources)

docs/PROJECT_STATUS.md                            (this file)

supabase/migrations/
├── 20260603011208_init_assessments_and_leads.sql
├── 20260603170655_add_profiles_evolve_assessments.sql
├── 20260604002139_add_programs_universities_state.sql
├── 20260604120000_seed_universities_and_programs.sql
└── 20260604024609_add_plan_items.sql
```

**Plans missing from disk** (reconstructed inline above; should be promoted to standalone MDs before Phase 5 begins for traceability):
- Phase 3 plan
- Phase 4 plan (spec also missing; sketched in the dispatch prompts but never persisted)

---

## What to do next — recommended order

_(Reconciled 2026-06-08. Lint cleanup ✓ done (`3c8810c`). Phase A/B scorer-wiring ✓ done. Phase 5 documents vault + per-program checklist ✓ shipped. Signed-in flows ✓ manually smoked green; prod build ✓ passes. Center of gravity is now **release-readiness for the Nepal→Australia journey**, framed by the five student questions below.)_

**Definition of "Nepal→Australia complete"** — a real student can answer: (1) can I apply? (2) what's my biggest risk? (3) what money + documents do I need? (4) which programs are realistic? (5) what do I do next?

1. ~~Documents/checklist slice~~ ✓ **shipped 2026-06-08** — per-program `/checklist/[programId]` + landing, rule-derived generator, 29 tests, no migration/scoring touched. The "money + documents" question is now answered program-by-program. (Possible follow-ons, not scheduled: checklist completeness on the dashboard; an anonymous "what you'll need" preview.)
2. ~~Manual smoke~~ ✓ **done 2026-06-08** — signed-in flows browser-smoked green via a throwaway dev-session seam (since removed), plus a clean prod build. The standing #1 risk is retired. One minor pre-existing bug found there and **fixed 2026-06-08** (plan items lingered after their condition was satisfied — `invalidatePlan` now auto-closes them; see Known issues).
3. **Ledger by slice (later).** Integrate remaining `lib/data/source/*` findings per-slice, tagging each used / rejected:&lt;reason&gt; / use-later / needs-human-call — not row-by-row.
4. **Housekeeping (low priority).** Promote the Phase 3/4 plans to standalone MDs; hotfix the `private.set_updated_at` `search_path` WARN advisor (`alter function private.set_updated_at() set search_path = '';`).

---

## Honest concerns about the autonomous run

- **Two real bugs slipped past per-task verification and were caught only by whole-branch review** (Phase 1.5 signed-in refresh, Phase 1.5 callback claim-fail 404). Adding `npm run typecheck` to each task's TDD loop would have caught the typed mismatches earlier; adding a behavioral integration test in the review pass might have caught the UI regression. Worth budgeting more time for review on Phase 5+ where Storage + signed URLs add new failure surfaces.
- **No phase has been clicked through.** Every phase passes its test suite, but the actual signed-in user experience hasn't been exercised end-to-end since Phase 0. Tests verify isolated behavior; they don't verify whether the dashboard actually feels right or whether the shortlist toggle actually round-trips against the live RLS policy.
- ~~Master is 92 commits ahead of `origin/master`; nothing pushed.~~ **Resolved 2026-06-07:** the local-only preference was lifted; master now branches → ff-merges → pushes every slice and is in sync with `origin/master`.
