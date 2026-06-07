# MyVisa — project status & phase log

**Snapshot:** 2026-06-07, scorer-wiring slices 1–3 (DHA gate + provenance UI + corridor context) merged
**Tests:** 602 passing across 153 test files
**Typecheck:** clean
**Build:** clean (27 routes including `/api/plan/action`, `/api/shortlist`, `/api/profile/section`, `/api/assess`, `/api/leads`)
**Code surface:** 25 files in `app/`, 52 in `lib/`, 76 in `components/`, 125 in `tests/`, 5 SQL migrations applied
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
| `/matches` | Tabs (Universities/Scholarships/Cost estimate), policy banner (Nepal AL3 + AUD 29,710), Strong/Possible/Reach groups, ProgramCard with verdict pill + tuition + IELTS/grade min + intakes + reasons + Source link + Shortlist toggle |
| `/plan` | Impact-ranked (High/Medium/Low) action items with Done/Dismiss/Undo, closed items collapse, regenerates on profile change |
| Stubs (`/checklist`, `/guide`) | "Coming soon — landing in Phase 5/6" with back-to-dashboard CTA |
| `/api/profile/section` | Zod-validated PATCH for any of 13 sections, auth-gated, invalidates plan after save (try/catch protected) |
| `/api/assess` | Anonymous path persists with 3-day TTL; signed-in path persists as owner, sets `is_primary` if none, bootstraps profile if missing, invalidates plan |
| `/api/shortlist`, `/api/plan/action` | Auth-gated POST endpoints with admin client writes via service role |
| Auth-gated `(app)` layout | Server-side `redirect("/auth?next=/dashboard")` on no session. `?next=` whitelisted via `lib/auth/safe-next.ts` (rejects `//attacker.com`) |

### ⚠️ Known issues, untested paths, or follow-ups

| Issue | Where | Severity |
|---|---|---|
| **No manual smoke since Phase 0.** Signed-in flows pass tests but have never been clicked through with real Google OAuth. Highest-risk: profile editors saving correctly to DB, dashboard rendering with real data, shortlist persisting across sessions, plan regenerating on profile edit. | All `(app)/*` routes | **High** — biggest unknown |
| `destination_id` rendered raw (e.g. "australia" not "Australia") | `components/dashboard/snapshot-card.tsx`, `components/assess/assess-interstitial.tsx` | Minor UX |
| Day-of-week greeting uses server time, not user TZ | `app/(app)/dashboard/page.tsx` `partOfDay()` | Minor UX |
| 195 ESLint errors | ~185 in gitignored `claudedesign/`; the rest are: inner `Btn` component in `MatchesTabs` (react-hooks/static-components), 2× `any` in `tests/scoring/multi-destination.test.ts`, 2× unused destructures in `tests/assessments/claim.test.ts` | Low; cleanup task |
| `private.set_updated_at` trigger function has mutable `search_path` | Supabase advisor WARN, present since Phase 1.5 migration | Low; harden in a follow-up migration |
| `patchProfileSection` race condition | Two parallel PATCHes to same user lose one update (read-modify-write with no row-version) | Low for single-tab use; fix before enabling autosave |
| `userEnglishBand = userEnglishOverall` proxy in match compute | Per-band scoring not accurate until IELTS report upload (Phase 5) | Designed limitation |
| FX rates hard-coded for budget→AUD conversion | `app/(app)/matches/page.tsx` `budgetToAud()` | Replace with FX API later |
| Tuition rendered as "AUD 50,000–55,000 / yr" without explanation that 12-month figure varies by subject load | `components/matches/program-card.tsx` | Note, not bug |
| `lib/matching/universities.ts` still in code (deprecation header only) | Used by anonymous wizard's results payload; will retire when anonymous flow reads from DB | Designed |
| Dashboard `RecentUpdates` always empty | No "what's new" feed exists yet | Empty state covered |
| Nursing programs need AHPRA registration warning | `notes` field in seed says so, but UI doesn't elevate it | Minor; could surface in ProgramCard |

### 🔬 Verified via Supabase MCP (not just code)

- 5 migrations applied to live project `obfvrxixtautamflzxzq`: `init_assessments_and_leads`, `add_profiles_evolve_assessments`, `add_programs_universities_state`, `seed_universities_and_programs`, `add_plan_items`
- 15 universities + 64 programs seeded into live DB
- Security advisors: no new ERROR-level. Pre-existing WARN: `auth_leaked_password_protection` (project-level), `function_search_path_mutable` on `private.set_updated_at`. Pre-existing INFO: `rls_enabled_no_policy` on `public.leads`

### 🚫 Not built yet

- Phase 5: `documents` + `checklist_items` tables, Supabase Storage bucket + RLS, signed-upload URL flow, `/checklist/[programId]` page with section grouping (Identity/Academic/Financial/Visa), document upload affordance per item, dashboard Checklist stat
- Phase 6: `guide_threads` + `guide_messages` tables, `private.owns_thread()` security-definer helper, `/guide` page with SSE-streamed chat, Anthropic SDK integration with prompt caching. **Blocks at runtime without `ANTHROPIC_API_KEY` set in `.env.local`.**

---

## Data integration & scorer-wiring (2026-06-04 → 2026-06-07)

Two layers feed verdicts: (a) the **production scoring path** — `lib/scoring/*` reads sourced config via `lib/data/scoring-config.ts` (from `lib/data/policy/*`); the per-program `/matches` path reads `lib/programs/seed.ts` (15 unis, 64 programs) via Supabase; and (b) the **reconciled fact layer** `lib/data/source/*` — ~342 atomic findings turned into typed, sourced, machine-checked modules (registry-driven, guarded by `docs/research-briefs/_tools/reconcile.js`). Most of (b) is reference-only; wiring a fact into (a) is verdict-changing.

- **Scorer-wiring slice 1 — DHA financial-capacity gate (merged 2026-06-07).** Spec: `docs/superpowers/specs/2026-06-07-dha-financial-capacity-gate-design.md`. The financial dimension now gates a Nepal→Australia budget against the government DHA capacity floor (living 29,710 + representative tuition 44,500 ≈ AUD 74,210 ≈ USD 49,473) instead of only the internal-heuristic cost band: below the floor caps financial at 49 (blocks "strong"); below 0.75× forces "reach". AU-only; non-AU unchanged. `RULE_VERSION v0.1.0→v0.2.0`, `CONFIG_VERSION config-v1→config-v2`; characterization golden regenerated (boundary-straddle fixtures relocated to `canada` to isolate verdict.ts cutoffs from the gate). **Known design note:** the cap makes AU financial values 30–48 unreachable (a deliberate dead-zone). **Deferred fast-follows:** travel/airfare in the floor; field-of-study-indexed tuition; dependents (needs a profile-schema field).
- **Slice 2 — provenance under verdicts (merged 2026-06-07).** Optional `source` on the `DimensionScore` factor type; the financial capacity factor carries the DHA gov source (`immi.homeaffairs.gov.au` · verified date), rendered by a new `SourceLine` under sourced factors. Heuristic-backed factors show nothing. Additive/explainability only — no verdict, score, or version change; golden regenerated for the new optional field. Browser-verified end-to-end.
- **Slice 3 — corridor context on the results page (merged 2026-06-07).** The anonymous results page now renders the existing `PolicyBanner` (AL3, DHA floor, the DHA grant-rate range) after the factor breakdown, matching `/matches`. Pure additive UI; no scorer/golden change.
- **Roadmap corrections (2026-06-07):** (a) **visa-grant-rate into the scorer — won't do.** `visa-outcomes.ts` deliberately documents "no scorer reads it… shown as a range, never a single number"; it's already surfaced honestly (banner + slice 3). Force-wiring it would break that intentional cohort-not-odds decision. (b) **field-of-study-indexed tuition — not worth it now.** Only 6/12 fields have program data and the 6 missing are the cheap fields that'd fall back to the *higher* median, so it wouldn't fix the over-gating it targets; the single 44,500 median stands.
- **Next designed slice (A4):** distinguish the DHA *visa* English floor (IELTS 6.0 each band, sourced) from the *course* threshold (6.5) in the visa dimension, so visa-valid 6.0–6.4 English isn't over-penalised. Verdict-changing with a broad recalibration effect — wants a short design pass first.
- **Open backlog:** A4 (above); total cost-to-apply context (visa charge + Nepal fees); `/matches` sourced-data consolidation; dependents profile-schema field; pre-existing FX-rates (`internal-heuristic`) + ESLint debt.

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
└── invalidate.ts     invalidatePlan(adminDb, userId) — reads profile + primary + programs, computes matches, generates plan, inserts only new (owner, kind) items

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

Generator is **pure** (no I/O). `invalidatePlan` runs it then INSERTs only items whose `kind` doesn't already exist as an open todo for the user. The partial unique index `(owner, kind) where status='todo'` provides DB-level safety.

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

1. **Manual smoke first.** Run `npm run dev`, sign in with Google, verify: dashboard renders with your real data; profile editors save; matches page loads with shortlist toggle; plan items appear after editing a field. This is the highest-value step you can take right now because it'll surface anything tests + types missed.
2. **Promote Phase 3 + Phase 4 plans to MD files** (cleanup; data already in this file).
3. **Lint cleanup pass.** Add `.eslintignore` for `claudedesign/` (kills ~185 errors); fix the inner `Btn` in `MatchesTabs` (lift to a top-level component); annotate `any` in `multi-destination.test.ts`; drop unused destructures in `claim.test.ts`. Should bring lint to clean.
4. **Hotfix the WARN advisor.** One-line migration: `alter function private.set_updated_at() set search_path = '';`. Quiets Supabase advisor.
5. **Phase 5 or Phase 6** — your call. Phase 5 is bigger but unblocked. Phase 6 is smaller but needs `ANTHROPIC_API_KEY` set before it functions.

---

## Honest concerns about the autonomous run

- **Two real bugs slipped past per-task verification and were caught only by whole-branch review** (Phase 1.5 signed-in refresh, Phase 1.5 callback claim-fail 404). Adding `npm run typecheck` to each task's TDD loop would have caught the typed mismatches earlier; adding a behavioral integration test in the review pass might have caught the UI regression. Worth budgeting more time for review on Phase 5+ where Storage + signed URLs add new failure surfaces.
- **No phase has been clicked through.** Every phase passes its test suite, but the actual signed-in user experience hasn't been exercised end-to-end since Phase 0. Tests verify isolated behavior; they don't verify whether the dashboard actually feels right or whether the shortlist toggle actually round-trips against the live RLS policy.
- **Master is 92 commits ahead of `origin/master`.** Nothing has been pushed. The branch protection rule that would normally catch broken-master-on-remote isn't in play. If your laptop dies, the work is lost.
