# End-to-End Journey Audit — LandingPad (MeroVisa)

**Auditor role:** Service designer mapping consultancy-replacement coverage.
**Date:** 2026-07-10 · **Corridor:** Nepal → Australia · **North star:** every self-serve dead-end is a bounce to a consultancy.

## Thesis

LandingPad has deep Nepal-specific **guidance content** from eligibility through visa preparation. It does not lodge or verify the case. Its journey model has five phases ending at “visa decision”; there is no Phase F. Pre-departure, arrival, first weeks, work, housing, community, and longer-term settlement are absent from rendered workflow even though several late-stage data modules already exist. That is the clearest gap between the ambition and the implemented service.

## Stage-by-stage coverage

| Stage | Coverage | Proof / gap | Consultancy bounce? |
|---|---|---|---|
| Before applying (orientation) | **Partial** | Landing + `/how` honestly frame the corridor and the four scoring dimensions; no discovery/"is study abroad right for me" content | Soft — no hard bounce |
| Choosing a country | **Absent (decorative)** | Marketing lists 6; the wizard disables five and “Not sure” still yields Australia | **BOUNCE** — every non-AU aspirant |
| Eligibility | **Partial / unsafe until fixed** | Deep rules/explanations, but internal calibration, omitted refusals, unsupported seasoning, and missing-as-zero paths undermine the result | High trust risk |
| University selection | **Partial** | 15 AU universities, tier data, per-program match verdicts (`lib/matches/compute.ts`) | Partial — narrow catalogue |
| Course selection | **Partial** | 83 programs across **only 6 fields** (business, CS, engineering, data-science, nursing, accounting) | **BOUNCE** — law/medicine/arts/architecture etc. get no relevant matches |
| Budget planning | **Weak / misleading** | A reference cost panel exists, but per-program matching compares an all-in annual budget only with tuition; no course/city/family cash-flow plan | **BOUNCE-risk** |
| Visa understanding | **Partial with strong content** | Rich Subclass 500/GS/health/police content, but fixed seasoning and heuristic-verdict disclosure defects remain | Trust correction required |
| Document preparation | **Strong as guidance / weak as evidence workflow** | Funding-aware Nepal steps and sources; storage is one-file-per-kind presence, not verification or packaging | Partial |
| Application (submit) | **Partial** | One generic step: "check each provider's 'how to apply' page… there's no single national portal" (`generator.ts:322-329`); **no application tracking, no per-provider mechanics** | **BOUNCE-risk** |
| Waiting period | **Weak** | One step: `track-visa-decision` = "track in ImmiAccount… respond if they ask for more" (`generator.ts:388-396`); no processing-time expectations, no RFI handholding | **BOUNCE** |
| Pre-departure | **Absent** | `nepal-forex-cards.ts` **exists but consumed in 0 surfaces**; no flights/packing/SIM/first-transfer guidance | **BOUNCE** |
| Arrival | **Absent** | `au-arrival-cash-guidance.ts` **exists, wired to 0 surfaces** | **BOUNCE** |
| First week | **Absent** | Nothing | **BOUNCE** |
| First month | **Absent** | Nothing | **BOUNCE** |
| First semester | **Absent** | Nothing | **BOUNCE** |
| Finding work | **Absent** | `au-student-worker-wages.ts` exists with no surface; current 48-hours-per-fortnight work conditions are not a signed-in journey stage | **BOUNCE** |
| Finding accommodation | **Absent** | No data module at all | **BOUNCE** |
| Building community | **Absent** | No data module at all | **BOUNCE** |
| Long-term settlement / PR | **Absent** | `au-temporary-graduate-visa.ts` surfaces ONLY as a single deferred link-note when goal=PR (`lib/matches/preference.ts:87-95`); `au-skilled-visa-directory.ts` wired to **0 surfaces** | **BOUNCE** |

**Coverage verdict:** the product is useful for readiness and preparation, thin for application/waiting, and absent across most post-grant stages. Stage counts are directional only; they should not be converted into a “percent complete” vanity metric.

## Findings

### P1 — The journey model hard-stops at "visa decision"; the entire post-grant journey is out of scope
`lib/plan/phases.ts` defines five phases terminating at `E · Visa decision`. There is no plan phase or results surface after grant. For a replacement north star, this is load-bearing: the app goes dark when a student must prepare to travel, find housing, establish banking/phone/transport, understand work rights, and settle into study. Visa grant is the product endpoint, not the student's endpoint.

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

### P2 — "Choosing a country" is theatre
`/destinations` renders six current-looking country pages and says “Six countries, done well,” while scoring supports only Australia. The wizard disables five countries, but “Not sure — help me decide” cannot compare them and returns an Australia framing. A student is given editorial previews rather than a country-decision tool; the copy should say that explicitly.

### P2 — Course-selection catalogue is 6 fields wide; unsupported fields get false matches
`computeMatches` ranks 83 programs spanning six catalogue fields. The wizard enables additional fields such as Law and Arts, but field is only a sort tier; if the chosen tier is empty, unrelated programs remain and are still labelled matches. Browser verification selected Law and received 60 Accounting/Business/etc. results. For those students the app cannot safely do course selection.

### P2 — The application stage is a single generic instruction with no tracking
`submit-university-applications` tells the student to apply on provider sites. Shortlist/Applied state and a self-reported offer→visa→enrolled outcome funnel exist, so capture is better than a blank slate. But there is no per-provider portal/deadline/submitted date, offer-condition list, per-application checklist, or multi-track plan. It records milestones without managing the work between them.

### P2 — Waiting-period support is one line; no expectations, no RFI coaching
Post-lodgement, the plan offers only `track-visa-decision`. There is no sourced processing-time expectation ("Subclass 500 for Nepal typically takes X weeks"), no structured "if DHA asks for more documents, here's what and how," and no reassurance cadence. The waiting period is the highest-anxiety window; a consultancy fills it with reassurance calls. The app fills it with one to-do that says "check ImmiAccount."

### P3 — Scholarship coverage is thin (4 rows) and honestly labelled but easy to outgrow
`au-scholarships.ts` (3 rows) + `australia-awards-scholarship.ts` (1) back the Scholarships tab. MV-58 shipped this as an honest subset with no false "you qualify" copy — correct restraint — but four entries is closer to a placeholder than a decision tool, and a budget-constrained student (the core persona) will exhaust it in one screen and go elsewhere.

## Recommendation (student-outcome framing)

The highest-leverage move is **not** new research — it is wiring the five already-sourced late-journey modules into a **Phase F "After your visa" / pre-departure surface**. `au-arrival-cash-guidance`, `nepal-forex-cards`, `au-student-worker-wages`, and `au-student-transport-concessions` are shovel-ready and would extend the journey past the current cliff at minimal cost, directly attacking the biggest cluster of bounce points (pre-departure → settlement). Second: gate the five decoy destination cards behind a clear "coming soon" state so "choosing a country" stops promising what the engine can't deliver. Course-catalogue breadth and an application tracker are larger builds, correctly sequenced after the free wins above.

The founder's instinct to steer by journey completeness is right. Use stage-level outcomes and bounce points, not a percentage-complete score; the current journey has meaningful readiness depth and a large post-decision gap with several already-researched ingredients.
