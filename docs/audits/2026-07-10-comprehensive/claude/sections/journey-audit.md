# End-to-End Journey Audit — LandingPad (MeroVisa)

**Auditor role:** Service designer mapping consultancy-replacement coverage.
**Date:** 2026-07-10 · **Corridor:** Nepal → Australia · **North star:** every self-serve dead-end is a bounce to a consultancy.

## Thesis

LandingPad is genuinely strong from *eligibility* through *visa lodgement* — the sourced plan/checklist spine (`lib/plan/generator.ts`, `lib/checklist/generator.ts`) is deep, Nepal-specific, and beats what a mediocre consultant offers on the paperwork. But the app models the student journey as **five hard phases that END at "visa decision"** (`lib/plan/phases.ts:26-32`, phases A–E). There is no Phase F. Everything a consultancy actually earns repeat trust on — pre-departure, arrival, first weeks, work, housing, community, and the post-study/PR endgame that motivates the whole trip — is **absent from every rendered surface**. Worse: the founder has *already sourced and built* data modules for five of those late stages, and **wired none of them to any UI**. That is dead knowledge, and it is the single clearest gap between the product's ambition and a student's lived journey.

## Stage-by-stage coverage

| Stage | Coverage | Proof / gap | Consultancy bounce? |
|---|---|---|---|
| Before applying (orientation) | **Partial** | Landing + `/how` honestly frame the corridor and the four scoring dimensions; no discovery/"is study abroad right for me" content | Soft — no hard bounce |
| Choosing a country | **Absent (decorative)** | `MARKETING_DESTINATIONS` lists 6 (`lib/marketing/destinations.ts`), but `SUPPORTED_DESTINATIONS = ["australia"]` (`lib/scoring/types.ts:58`); non-AU wizard completion short-circuits to `UnsupportedDestinationNotice` | **BOUNCE** — every non-AU aspirant |
| Eligibility | **Strong** | Server-side engine `lib/scoring/engine.ts` → banded verdict; deep, sourced | No |
| University selection | **Partial** | 15 AU universities, tier data, per-program match verdicts (`lib/matches/compute.ts`) | Partial — narrow catalogue |
| Course selection | **Partial** | 64 programs across **only 6 fields** (business, CS, engineering, data-science, nursing, accounting) | **BOUNCE** — law/medicine/arts/architecture etc. get no matches |
| Budget planning | **Strong (apply) / Partial (living)** | `components/matches/cost-estimate-panel.tsx` folds tuition + DHA living + OSHC + visa charge into one AUD band; no ongoing/monthly living budget | Partial |
| Visa understanding | **Strong** | Subclass 500 spine, Genuine Student, biometrics, police, health — all sourced in plan+checklist | No |
| Document preparation | **Strong** | `lib/checklist/generator.ts` — funding-source-aware, Nepal NOC/translation/certify/ward-office income, IELTS centres | No |
| Application (submit) | **Partial** | One generic step: "check each provider's 'how to apply' page… there's no single national portal" (`generator.ts:322-329`); **no application tracking, no per-provider mechanics** | **BOUNCE-risk** |
| Waiting period | **Weak** | One step: `track-visa-decision` = "track in ImmiAccount… respond if they ask for more" (`generator.ts:388-396`); no processing-time expectations, no RFI handholding | **BOUNCE** |
| Pre-departure | **Absent** | `nepal-forex-cards.ts` **exists but consumed in 0 surfaces**; no flights/packing/SIM/first-transfer guidance | **BOUNCE** |
| Arrival | **Absent** | `au-arrival-cash-guidance.ts` **exists, wired to 0 surfaces** | **BOUNCE** |
| First week | **Absent** | Nothing | **BOUNCE** |
| First month | **Absent** | Nothing | **BOUNCE** |
| First semester | **Absent** | Nothing | **BOUNCE** |
| Finding work | **Absent** | `au-student-worker-wages.ts` **exists, 0 surfaces**; work-rights/40-hr cap not surfaced anywhere in product body | **BOUNCE** |
| Finding accommodation | **Absent** | No data module at all | **BOUNCE** |
| Building community | **Absent** | No data module at all | **BOUNCE** |
| Long-term settlement / PR | **Absent** | `au-temporary-graduate-visa.ts` surfaces ONLY as a single deferred link-note when goal=PR (`lib/matches/preference.ts:87-95`); `au-skilled-visa-directory.ts` wired to **0 surfaces** | **BOUNCE** |

**Verdict distribution:** Strong 4 · Partial 4 · Absent 11. The app covers the first ~40% of the real journey well and the back ~55% not at all.

## Findings

### P1 — The journey model hard-stops at "visa decision"; the entire post-grant journey is out of scope
`lib/plan/phases.ts` defines exactly five phases, terminating at `E · Visa decision` ("Track the outcome once your visa is lodged"). Every plan `kind` maps into A–E (`KIND_PHASE`, lines 58-86). There is no phase, no plan kind, and no results panel for anything after the visa is granted. For a product whose north star is *replacing the consultancy*, this is the load-bearing gap: a Nepali consultancy's stickiest value is the pre-departure briefing, the airport-pickup/first-week handholding, and the "we'll help you get PR after" promise. LandingPad goes dark at exactly the moment the student is most anxious and most likely to phone an agent. Getting the visa is where the app *ends*; for the student it is the halfway point.

### P1 — Five sourced, validated late-journey data modules are wired to ZERO UI surfaces (dead knowledge)
Verified by grepping every consuming surface (`components`, `app`, `lib/{results,guide,plan,checklist,matches}`):

| Module | Journey stage | UI surfaces consuming it |
|---|---|---|
| `au-arrival-cash-guidance.ts` | Arrival | **0** |
| `nepal-forex-cards.ts` | Pre-departure | **0** |
| `au-student-worker-wages.ts` | Finding work | **0** |
| `au-student-transport-concessions.ts` | Settlement | **0** |
| `au-skilled-visa-directory.ts` | Long-term PR | **0** |

Each carries provenance, passes the Zod/freshness guards, and cost real research effort — yet a student never sees a byte of it. This is precisely the "% findings wired" vanity the founder explicitly retired: knowledge was ledgered without a consumer. The remediation is not more research — it is *rendering what already exists*. `au-temporary-graduate-visa.ts` is the sole late-stage module with a consumer, and only as a one-line "we don't rank by PR outcome" deferral (`preference.ts:87-95`) — an honest admission, not settlement support.

### P2 — "Choosing a country" is theatre; every non-Australia student is a designed dead-end
`/destinations` renders 6 countries with static params (`app/(marketing)/destinations/[id]/page.tsx`), implying breadth. But scoring supports only Australia (`SUPPORTED_DESTINATIONS`), and a wizard-completing student who picks Canada/UK/US/Germany/Ireland is short-circuited to `UnsupportedDestinationNotice` — an honest "we don't cover this yet" wall. The honesty is good; the *funnel* is not. A student researching "where should I go" is invited in by six country cards and bounced the moment they act on any of the five decoys. The marketing surface promises a decision-support tool the engine cannot honour.

### P2 — Course-selection catalogue is 6 fields wide; anyone outside them gets no matches
`computeMatches` filters 64 seeded programs spanning business, computer-science, engineering, data-science, nursing, accounting. A student targeting law, medicine, pharmacy (beyond the few enriched rows), architecture, arts, or psychology completes the wizard, gets a verdict, then finds an empty or irrelevant match list. For those students the app cannot do course selection at all — a direct bounce at the exact stage consultancies monetise ("which uni, which course").

### P2 — The application stage is a single generic instruction with no tracking
`submit-university-applications` (`generator.ts:321-329`) tells the student to "apply to each university… check each provider's 'how to apply' page." There is no per-provider deep-link, no application-status tracking, no multi-application dashboard (the code comment at `phases.ts:14` explicitly defers "per-application multi-track state"). "Figure out each university's portal yourself" is the precise friction a consultant removes. The `user_program_state` table tracks shortlist/applied/withdrawn, but nothing in the plan surfaces or drives it as an application tracker.

### P2 — Waiting-period support is one line; no expectations, no RFI coaching
Post-lodgement, the plan offers only `track-visa-decision`. There is no sourced processing-time expectation ("Subclass 500 for Nepal typically takes X weeks"), no structured "if DHA asks for more documents, here's what and how," and no reassurance cadence. The waiting period is the highest-anxiety window; a consultancy fills it with reassurance calls. The app fills it with one to-do that says "check ImmiAccount."

### P3 — Scholarship coverage is thin (4 rows) and honestly labelled but easy to outgrow
`au-scholarships.ts` (3 rows) + `australia-awards-scholarship.ts` (1) back the Scholarships tab. MV-58 shipped this as an honest subset with no false "you qualify" copy — correct restraint — but four entries is closer to a placeholder than a decision tool, and a budget-constrained student (the core persona) will exhaust it in one screen and go elsewhere.

## Recommendation (student-outcome framing)

The highest-leverage move is **not** new research — it is wiring the five already-sourced late-journey modules into a **Phase F "After your visa" / pre-departure surface**. `au-arrival-cash-guidance`, `nepal-forex-cards`, `au-student-worker-wages`, and `au-student-transport-concessions` are shovel-ready and would extend the journey past the current cliff at minimal cost, directly attacking the biggest cluster of bounce points (pre-departure → settlement). Second: gate the five decoy destination cards behind a clear "coming soon" state so "choosing a country" stops promising what the engine can't deliver. Course-catalogue breadth and an application tracker are larger builds, correctly sequenced after the free wins above.

The founder's instinct to steer by journey completeness is right — and this audit says the journey is ~45% complete by stage count, with a fully-stocked pantry of unused ingredients for the missing half.
