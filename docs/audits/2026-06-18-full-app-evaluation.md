# Full app evaluation — 18-concern audit (2026-06-18)

**Method:** 14-agent evidence-based audit. The scoring questions (Q1–Q7) were answered **empirically** — a temporary harness ran `runAssessment()` against a realistic Nepal→Australia baseline and perturbed each wizard input one field at a time, recording verdict + dimension deltas (harness deleted after). All other concerns were answered by code-reading agents that cite `file:line`. Two highest-stakes claims (the GPA bug, the auth-gate bug) were re-verified by hand. No app code was changed in this pass — this is diagnosis + a ranked plan.

**Baseline used:** bachelors, percentage-nepal grade 70, computer-science, 0-year gap, IELTS 6.5 taken, AUD 90,000 budget, parents-family funding, goal best-employment → **verdict `strong`, weighted 72** (sits exactly on the strong cutoff, so downward nudges flip it — useful for sensitivity testing).

---

## Verdict table

| # | Concern | Finding | Severity |
|---|---|---|---|
| 1 | Grades %-only, no GPA, AU conversion | **GPA path is broken**: wizard is %-only; the profile editor's GPA options score to 0 (no conversion) | 🔴 Critical |
| 2 | Does education level matter? | **Yes** — moves academic + profile-strength; can flip the verdict | 🟢 Works |
| 3 | Does subject matter? | **Yes** — ~14-pt academic spread by field competitiveness; decisive near the boundary | 🟢 Works |
| 4 | Does graduation year matter? | **Yes** — gap drives the visa dimension; any gap can flip strong→possible | 🟢 Works |
| 5 | IELTS only; PTE/per-uni? | English score works (with dead zones); **no test-type field — PTE/TOEFL mis-read; per-uni minimums unwired** | 🟠 High |
| 6 | Budget NPR/USD optimized? | **Scoring works** (currency→USD before DHA gate); concern is UX + hard-coded FX | 🟢 Works / 🟡 UX |
| 7 | "What matters most" logic? | **Inert for the verdict** (by design); re-orders matches for 3/6 goals, default goal (PR) does nothing | 🟡 Medium |
| 8 | Results page overwhelming? | **Yes** — ~13–16 panels in one scroll; CTA buried at the bottom | 🟠 High (UX) |
| 9 | Blur/unlock when ≤ unis; login | **Confirmed bugs**: no unlock button when ≤3 matches; unlock CTA scrolls, doesn't start OAuth | 🟠 High |
| 10 | Dashboard structure | "Your journey" is **hardcoded/fake**; RecentUpdates always empty; next-step can surface upload oddly | 🟡 Medium |
| 11 | Matches completeness | 15 unis / 64 programs, thresholds complete; **no field/level eligibility filter** (all 64 show to everyone) | 🟡 Medium |
| 12 | Scholarships + cost | **Both tabs are "Coming soon" stubs**; scholarship data exists unused; no per-year cost estimate | 🟠 High |
| 13 | Ledger left + scrape unis | 594 pending findings (195 ready); **scrape is feasible & recommended** (DHA JSON, CC-BY licensed) | 🟠 High (value) |
| 14 | My Plans done right? | Engine is sound; **plan↔checklist boundary is confusing/overlapping** | 🟡 Medium |
| 15 | Documents idea valid? | Organizer-only; **"upload improves your assessment" is a no-op (misleading)**; reconsider asking for photos | 🟠 High |
| 16 | Profile functional? | Mostly yes; **work section is a dead input**; two match engines; errors swallowed | 🟡 Medium |
| 17 | AI guide API | Recommend **Claude Haiku 4.5** + corpus-in-cached-prefix RAG + profile injection | ✅ Plan |
| 18 | What else am I missing | Cross-cutting trust risks: inert inputs, silent failures, duplicate engines | 🟠 High |

---

## Part 1 — Does each wizard input actually change the result? (Q1–Q7)

The engine ([engine.ts:17](../../lib/scoring/engine.ts)) composes exactly four dimensions — **academic, financial, visa, profile-strength** — into the verdict. Empirical sweep results:

| Input | Moves verdict? | Mechanism | Notes |
|---|---|---|---|
| **Education level** (Q2) | ✅ yes | academic `LEVEL_BONUS` + profile-strength base | higher-secondary→bachelors flipped possible→strong |
| **Subject / field** (Q3) | ✅ near boundary | academic `FIELD_COMPETITIVENESS` | CS/data-science ~14 pts below arts/hospitality |
| **Grad year / gap** (Q4) | ✅ yes | visa `GAP_PENALTIES`; `gapReasons:["worked"]` mitigates + adds profile-strength | any gap flipped strong→possible |
| **IELTS score** (Q5) | ✅ with dead zones | visa floor 6.0 / threshold 6.5 | 6.0–6.4 inert by design; "booked" == "taken-no-score" == 6.5 |
| **Budget** (Q6) | ✅ strongest driver | financial DHA capacity gate | spans reach→possible→strong alone |
| **Budget currency** (Q6) | ✅ yes | `toUsd()` converts before the gate | same number in NPR vs USD gives opposite verdicts — conversion is real & correct |
| **Funding source** (Q6) | ✅ yes | financial reliability | ~20-pt spread |
| **Dependents** | ✅ conditional | raises DHA floor (partner +AUD 10,394, per child +4,449) | inert at comfortable budget, decisive at borderline |
| **Grade (as %)** (Q1) | ✅ yes | academic delta vs baseline | only when entered as a percentage |
| **Grade system** (Q1) | ❌ **never read** | — | **BUG** — see below |
| **Grade number in any CGPA system** (Q1) | ❌ **inert** | clamped to 0 | **BUG** — see below |
| **Goal / "what matters most"** (Q7) | ❌ **completely inert for the verdict** | read by zero scorers | re-orders matches only — see below |

### Q1 — Grades, GPA, and AU conversion 🔴 **Critical bug**

- The wizard collects **percentage only** and hard-codes `gradeSystem`. The signed-in **profile editor does expose** GPA systems (`cgpa-4`, `cgpa-10`, `cgpa-5`) via a select.
- **But the engine never converts them.** [academic.ts:23](../../lib/scoring/academic.ts) is literally `const normalisedGrade = profile.grade;` with a comment that CGPA conversion is "handled upstream… out of scope for Plan 1" — **no such upstream conversion exists.** A 3.5/4 GPA is scored as "3.5%", driving academic to 0 and forcing **`reach` no matter how strong the student is.** Within a CGPA system the number is inert (2.5 and 3.5 both → 0).
- There is an **unused WAM/grade-conversion helper** in the data layer (flagged by the coverage agent) — built but never wired.
- **Why it matters:** for a Nepali audience, percentage is the common case so the *wizard* mostly dodges this — but anyone who uses the profile editor's GPA option silently gets a wrong (worst-case) verdict. That is a direct hit to the "real chances" promise.
- **Fix:** implement grade→percentage normalization keyed by `gradeSystem` (a small lookup/linear map per system; the WAM helper may already do it), OR — if GPA isn't needed for Nepal MVP — remove the GPA options from the editor so we never collect an input we score wrong. **Do not leave the broken middle state.**

### Q2 / Q3 / Q4 — Education level, subject, graduation year ✅ **All three genuinely matter**

Confirmed empirically (table above). These were the user's biggest worry ("is choosing X doing anything?") — the answer for level, subject, and grad-year is **yes**, each drives a real dimension and can change the verdict. Subject only nudges at this baseline but is decisive near a band boundary.

### Q5 — IELTS, PTE, per-university English 🟠 **High**

- IELTS score is active but has **deliberate dead zones**: 6.0–6.4 is neutral (visa floor met, course threshold not), and `englishStatus:"booked"` is indistinguishable from "taken with no score" and from a clean 6.5.
- **The real gap:** `StudentProfile` has a single `englishScore` and **no test-type field**. The wizard is IELTS-only. Matching therefore treats *every* score as IELTS — a PTE 58 (≈ IELTS 6.5) would be read as a failing "5.8". We have `au-english-tests.ts` (PTE/TOEFL/etc.) and `au-provider-english-minimums.ts`, but they're read only by the registry, **not wired into matching**. We are **not** classifying which test each university accepts.
- **Fix:** add an English test-type field + a test→IELTS-equivalent map; then either wire `au-provider-english-minimums` into matching or explicitly defer it.

### Q6 — Budget, NPR/USD 🟢 **Scoring is correct** / 🟡 UX

- Budget is one of the **strongest** verdict drivers via the DHA capacity gate, and currency **is** converted to USD before the gate ([financial.ts](../../lib/scoring/financial.ts) `toUsd`, `FX_RATES`). Same number in NPR vs USD produces opposite verdicts — so nothing is "missing" in the math.
- What *is* worth improving: FX rates are **hard-coded** (NPR 135 / AUD 1.5) and the budget step's UX (showing NPR and a live USD/AUD equivalent, anchoring against the DHA floor) — that's a clarity upgrade, not a correctness fix.

### Q7 — "What matters most to you?" 🟡 **Medium — honest but over-promised**

- **It does not affect the verdict at all** (grep-confirmed: no scorer reads `goal`). That's correct by design.
- It re-orders/labels matches via `applyPreference` ([preference.ts](../../lib/matches/preference.ts)) on both surfaces — but the logic is solid for only **3 of 6** goals (highest-ranked → rankingTier, lowest-cost → tuition, fastest-admission → intakes [signed-in only]). The other **3 — permanent-residency (the default!), best-employment, research — have no backing data** and only show a deferred note.
- So the wizard's copy "we use this to order and label your matches" is **only partly true**, and the *default* selection does nothing visible.
- **Fix:** this is a copy/product decision, not a bug. Either soften the Q7 subtext to match reality, or source the missing data (PR pathway, employment outcomes) so the promise holds.

---

## Part 2 — Post-wizard UX & IA (Q8, Q9, Q10)

### Q8 — Results page is overwhelming 🟠 **High (UX)**

Everything is one component, [results.tsx:57-95](../../components/results/results.tsx), a flat vertical stack of ~13–16 sections for an anonymous first-timer, in this order: VerdictCard → FactorBars → PolicyBanner → RefusalRecovery (5 sub-sections) → GenuineStudent → WorkingWithAgents → CostToApply → IntakeTiming → PreferenceNote → UniversityMatches → GatedTeasers → AccuracyMeter → **ConversionPaths (the signup CTA, dead last)**.

- The verdict and the CTA are separated by ~10 reference panels; the 3-day-expiry urgency in ConversionPaths is **wasted at the bottom**.
- **Recommendation (no content removed — it's all trust-defense):** (1) promote a compact CTA to just under FactorBars; (2) define an "above-the-fold" core = verdict + top 3 matches + one next step; (3) collapse the gov reference triptych (RefusalRecovery / GenuineStudent / WorkingWithAgents) into a tabbed/accordion "Know before you go" block; (4) consider moving the deep reference panels to the dashboard for signed-in users.

### Q9 — Blur / unlock / login 🟠 **High (confirmed bugs)**

In [university-matches.tsx:56-72](../../components/results/university-matches.tsx): `free = matches.slice(0,3)`, and the unlock button renders **only inside `locked.length > 0`**.
- **Bug A:** when the engine returns **≤3 matches**, `locked` is empty → no blur, **no unlock button at all** (your "2 or fewer" — true cutoff is ≤3). The user can't sign in from results.
- **Bug B:** the unlock CTA calls `onUnlock()`, which **smooth-scrolls to ConversionPaths**; the user must then separately click "Continue with Google." It does **not** start OAuth directly.
- **Fix:** (A) render an unlock CTA whenever `!unlocked` (even with nothing to blur); (B) wire the CTA to call `signInWithOAuth` (via the existing `/api/results/sign-claim` flow) directly. Scope note: `components/matches/verdict-group.tsx` is the *signed-in* list — no gate, out of scope.

### Q10 — Dashboard structure 🟡 **Medium**

Top-to-bottom ([dashboard/page.tsx:58-73](<../../app/(app)/dashboard/page.tsx>)): Greeting → SnapshotCard + PromptCard (next step) → **JourneyTimeline** → StatsRow (Universities/Documents/Profile/Scholarships) → RecentUpdates.
- **"Your journey" is fake** — `JourneyTimeline` is hardcoded to step 1 ("Shortlist & prep") regardless of real progress. On a trust-first product a frozen tracker that lies is worse than none.
- **RecentUpdates always renders empty** (`updates={[]}`).
- The **out-of-place upload step** you noticed: the next-step card pulls the top plan item, and `upload-proof-of-funds` is high-impact and default-on for new users, so it legitimately tops the card — feeling abrupt before the user has context.
- **Fix:** make journey dynamic or drop it; hide RecentUpdates until it has a source; reconsider next-step ordering for brand-new users (lead with profile/assessment before document uploads).

---

## Part 3 — Data & features (Q11, Q12, Q14, Q15, Q16)

### Q11 — Matches completeness 🟡 **Medium**

- **15 universities, 64 programs** (15 bachelors, 49 masters, 0 doctorate). By field: CS 22, business 12, engineering 10, nursing 10, data-science 8, accounting 2. TS seed and SQL migration are parity-tested.
- Thresholds are **fully populated** (tuition, minGrade, minEnglish, intakes 64/64). `dataQuality`: 20 primary / 44 derived (~69% "Estimated").
- **Biggest defect:** there's **no field/level eligibility pre-filter** in [compute.ts](../../lib/matches/compute.ts) — all 64 programs are shown to every user regardless of their field or level. Plus no program-level scholarships/employment/PR/ranking fields, and `notes` (AHPRA, MBA work-experience) isn't surfaced as a reason.
- **Fix:** add a field+level pre-filter (small, highest user-visible win); surface `notes`; add the missing program fields when sourced (ties to the scrape, Q13).

### Q12 — Scholarships & cost 🟠 **High**

- **Both the Scholarships and Cost-estimate tabs are hardcoded "Coming soon" stubs** ([matches/page.tsx](<../../app/(app)/matches/page.tsx>) lines 64-75). The tab shell works; only Universities has content.
- **Scholarship data already exists** unused: `australia-awards-scholarship.ts` (Nepal-scoped, fully funded) + `au-scholarships.ts`, schema-validated.
- **Key distinction:** cost-**to-apply** (one-off: IELTS, VFS, medical, passport, equivalence, visa charge, app fee) is **done and live** above the tabs. Cost-**estimate** (ongoing per-year tuition + DHA living + OSHC) **does not exist** — and OSHC amounts aren't in our data yet.
- **Fix:** two shippable slices — (1) Scholarships tab over existing data (lead with Australia Awards); (2) Cost-estimate tab (needs OSHC sourcing first).

### Q14 — My Plans 🟡 **Medium**

- A coherent, well-engineered server-side **rule-based to-do generator** (~24 fixed rules in [plan/generator.ts](../../lib/plan/generator.ts), each a stable `kind`), gated on profile gaps / doc gaps / study-gap / matches / Nepal level / passport presence. Completion is two-mode (verified vs self-reported), and it regenerates + auto-closes satisfied items on profile change. **The engine is sound — don't rewrite it.**
- **The real problem is conceptual overlap with the per-program checklist** — both surfaces carry the same AU visa-prep STEPS (NOC, biometrics, police cert, health, translations). Users see the same actions in two places.
- **Fix:** pick one mental model and say it in the UI — e.g. **Plan = your action queue; Checklist = read-only per-program requirement reference** — then strip duplicated visa-prep steps out of the checklist.

### Q15 — Documents 🟠 **High (trust)**

- Documents is a **pure organizer**: upload one photo per kind (20 kinds, JPG/PNG/WebP ≤5MB) to a private vault, View/Delete. **OCR was removed** (columns dropped; spec superseded).
- **The trust problem:** upload flips a boolean that triggers `reScoreAssessment` — but **the verdict cannot change**, because `sectionsToStudentProfile` never reads those booleans (grep: 0 matches). So "uploading proof of funds / IELTS improves your assessment" is **implied but false**. The flags only move plan/checklist ticks.
- **Recommendations:** (1) **Now (small):** drop the no-op `reScoreAssessment` call on document flag-flips ([documents/upload route](<../../app/api/documents/upload/route.ts>):117-121 + DELETE) — keep `invalidatePlan` (the plan genuinely consumes the flags). (2) **Validate the idea:** at MVP, **keep-as-checklist, drop-the-bytes** — the only delivered value is a have/missing tick, which a checkbox captures *without* asking students to upload sensitive document photos (storage cost, privacy liability, and a justification gap). Reintroduce uploads when there's real extraction or a counsellor-review feature behind them.

### Q16 — Profile functionality 🟡 **Medium**

- Profile editing **is functional, not cosmetic**: saving a section persists (PATCH→DB), re-scores, reconciles the plan, recomputes matches, and refreshes the summary/completeness ring. Verified for ~5 sections.
- **The work section is a dead input** — it saves but is read by neither scoring nor matches, so work experience never moves the verdict (mirrors the gap.ts/profile-strength asymmetry).
- Two divergent match engines exist (anonymous `lib/matching/universities` vs signed-in `lib/matches/compute`) — confirmed by `university-matches.tsx` still importing the deprecated one.
- Re-score/plan failures are **swallowed** (`ok:true` even on failure).
- **Fix:** map `sections.work` into `from-sections` (or relabel the editor as informational); collapse the two match engines; surface failures instead of silent `ok:true`.

---

## Part 4 — Roadmap (Q13, Q17)

### Q13a — Ledger status 🟠 **High value still locked**

- **1,118 findings total: 516 used / 594 pending / 8 rejected**, across 41 entity+attribute clusters.
- Pending triage: **195 "ready" (integration-only, no new sourcing)**, 295 use-later, 98 needs-human-call, ~6 stale.
- **Ship-now slices, ranked:**
  1. **Category E (programs seed) — ~45 ready.** Program IELTS/duration rows (E.044–E.119) feed both program cards **and** the academic/English scoring dimensions. Highest leverage, zero new sourcing.
  2. **Category C (post-study pathways + health-exam chain) — 48 ready.**
  3. **Category D (universities seed, incl. D.098–D.100 RTO-closure red-flags) — 28 ready.**
- These are status-flip integrations, not research. The 98 "needs-human-call" findings are the genuine new-data backlog.

### Q13b — Scrape the DHA Web Evidentiary Tool 🟢 **Feasible & recommended**

- The tool (a.k.a. Document Checklist Tool) is the public front-end to DHA's combined country×provider evidence framework. It is **backed by SharePoint JSON endpoints**: `Termstore.aspx/GetTermsByProperty` returns the full **237-country and 1,669-provider** lists; a checklist endpoint returns the evidence level for a country×provider×study-type combo.
- We already reference this exact URL statically ([au-document-checklist-tool.ts](../../lib/data/policy/au-document-checklist-tool.ts)) and hand-maintain a ~55-row CRICOS list ([au-cricos-codes.ts](../../lib/data/source/au-cricos-codes.ts)) with Melbourne/ANU explicitly missing.
- **Recommended: Option A — direct API harvest, scoped to Nepal.** Pull the provider list, then iterate `countryPassport=NPL` × 1,669 providers × study types (~a few minutes with polite rate-limiting). Emit two sourced datasets: a **complete CRICOS provider directory** (closes "never miss a provider/major/campus", auto-fills Melbourne/ANU) and a **per-provider Nepal evidence-level map** (Regular/Streamlined/Undetermined) that upgrades the GS panel from a static link to a real answer. **~0.5–1 day** incl. schema + reconcile + tests.
- **Licensing/legal:** content is **CC BY 3.0 AU** (re-publishable with attribution to DHA); robots.txt does not disallow it. Defensible.
- **Risk:** these are internal SharePoint endpoints, not a published API — DHA could add a CSRF token / cookie gate / bot protection and break the harvest. Treat as a periodic batch job with a manual-export fallback, not a live dependency.

### Q17 — AI guide API 🟢 **Recommendation ready**

- The guide is a **RAG + grounded-generation** problem, not a "smartest model" problem. The cost driver is **input tokens** (system prompt + retrieved corpus + history), not output. So a cheap model with **cheap cached input** wins.
- **Our moat already exists:** 50+ Zod-validated, provenance-stamped sourced modules (registry), each carrying `source` + `lastVerified` + `findingRefs` — citation-ready.
- **Recommendation: Claude Haiku 4.5** ($1 / $5 per M tokens; cache reads ~0.1×). Rationale: (1) trust-first means *instruction-following is the feature* — "cite a source or refuse" must hold, and Claude is the most reliable there; (2) it matches the already-documented Phase 6 plan (Anthropic SDK + prompt caching + SSE) — zero stack drift; (3) 200K context holds the **whole corpus as a cached prefix**, so we can **defer building a vector DB** for MVP.
- **Personalization:** inject the user's `StudentProfile` + `AssessmentResult` + plan per conversation, on top of the cached corpus. Force `{answer, citations[]}` via structured output; cite-or-refuse system prompt; ship an **eval set** (golden questions → expected source URLs) to gate any model change.
- Cheaper models (Gemini Flash-Lite, GPT-nano) save pennies at MVP volume but cost us the guardrail reliability that *is* the product.

---

## Part 5 — What else you're missing (Q18) — cross-cutting

1. **Trust-credibility risk from inert/partial inputs.** A "tell me my real chances" product currently collects several inputs that do **nothing** or are **wrong**: `goal` default is inert, `work` is a dead input, **GPA is mis-scored**. Each one a savvy user can notice erodes the core promise. Treat "every collected input visibly matters (or is honestly labeled optional)" as a product invariant.
2. **Silent failure surface.** Re-score/plan/profile paths return `ok:true` on failure. Users can't tell when their data didn't take. Add error surfacing + Sentry breadcrumbs.
3. **Two match engines** (anonymous vs signed-in) drift independently — an anonymous result and the post-login `/matches` can disagree. Consolidate.
4. **"Estimated" data is ~69% of program tuition/grade.** Honest labeling is in place, but the 1-July re-verify + the DHA scrape should promote these to primary.
5. **The expiry/urgency mechanic is under-used** — 3-day expiry is a strong conversion lever buried at the bottom of results (ties to Q8).

---

## Ranked action plan

**P0 — correctness & trust (do first):**
- Fix the **GPA scoring bug** (Q1): convert by `gradeSystem`, or remove GPA options from the editor. *Wrong verdicts today.*
- Fix the **auth gate** (Q9): always show an unlock CTA; make it start Google OAuth directly.
- Remove the **misleading document re-score no-op** (Q15) and decide keep-bytes vs drop-bytes.

**P1 — high-value, mostly wiring over existing data:**
- **Scholarships tab** over existing data; scope the **cost-estimate tab** (source OSHC) (Q12).
- **English test-type field** + test→IELTS map; wire/defer per-uni minimums (Q5).
- **Matches field/level eligibility filter** (Q11).
- **Results IA**: promote CTA, progressive disclosure (Q8).
- **Dashboard**: fix/drop "Your journey" + RecentUpdates (Q10).
- **Ledger slice E** (program IELTS/duration → cards + scoring) (Q13a).

**P2 — strategic / larger:**
- **DHA evidentiary-tool harvest** → CRICOS directory + Nepal evidence levels (Q13b).
- **Plan↔checklist** model clarification (Q14).
- Map/relabel **work** input; consolidate **match engines**; surface **errors** (Q16, Q18).
- **AI guide (Phase 6)**: Haiku 4.5 + cached-corpus RAG + eval set (Q17).

---

> **Codex reorder note (see below):** Codex argues the **anonymous results→account conversion fix (Q8 IA + Q9 auth gate, combined) is the single highest-ROI P0** — it touches *every* anonymous user, whereas the GPA bug hits a subset (profile-editor/GPA users). Both stay P0; the conversion moment leads. Codex also recommends **deferring the AI guide (P2→later)** until the deterministic core is "boringly reliable."

---

# Appendix — Codex (GPT-5.x) independent second opinion

*Verbatim strategic critique. Grounds claims in the codebase or flags them as speculation.*

## Where I'd reorder the plan
I would put the anonymous conversion path above the GPA bug, even though the GPA bug is more embarrassing technically. The audit's P0 starts with "wrong verdicts today," but the highest-ROI two-week fix for a trust-first anonymous MVP is: make the result page convert immediately after trust is earned. In code, `Results` renders the verdict and factors first, then buries `ConversionPaths` after policy, refusal, GS, agents, cost, intake, matches, gated teasers, and accuracy (`components/results/results.tsx:57-94`). The unlock action passed into `UniversityMatches` only scrolls to that bottom conversion block (`results.tsx:35-37`, `80-83`), and the audit establishes that when there are ≤3 matches there is no unlock button at all. That is a direct conversion leak on the only path that matters before revenue: anonymous user gets a scary/personal verdict, wants next step, and the product either scrolls instead of authenticating or shows no auth CTA. GPA scoring is still P0 because `scoreAcademic` treats `profile.grade` as a percentage (`lib/scoring/academic.ts:19-28`) while `sectionsToStudentProfile` carries `gradeSystem` separately (`lib/scoring/from-sections.ts:45-46`), but it affects a subset of signed-in/profile-editor users. The auth/results CTA affects every anonymous assessment. I would combine "results IA" and "auth gate" into P0, not split them across P0/P1.

The most over-prioritized item is the Phase-6 AI guide. The codebase has a `/guide` stub only per project status (`docs/PROJECT_STATUS.md:29`, `63-65`), while core answer quality is still inconsistent: `runAssessment` reads only four dimensions and never reads `goal` (`lib/scoring/engine.ts:17-42`), `sectionsToStudentProfile` ignores work entirely (`from-sections.ts:26-58`), and signed-in matches do not filter by user field or level before returning programs (`lib/matches/compute.ts:10-12`, `110-116`). An AI guide may improve perceived sophistication, but it sits on top of unresolved product truth. For a trust-first MVP, wrong or inert answers are more damaging than the absence of chat.

## What the audit missed (the real Q18)
A 14-agent code audit can find whether inputs are wired, but it cannot prove the funnel is monetizable. The current path is anonymous assessment → account claim → dashboard/matches/plan/documents, verified in the project status as the main app loop (`docs/PROJECT_STATUS.md:19-29`). I could not verify any payment, lead-sale, consultancy referral, subscription, or counselor-booking surface from the required files, so the business model gap remains real. If the product's promise is "avoid bad consultancies," monetization via consultancy referral may also conflict with positioning (speculation). The audit should have asked what the user buys after trust is created.

The legal/compliance surface is larger than "copy must be sourced." The product gives visa-chance assessments, verdict bands, and plan items that can influence study and migration decisions. `runAssessment` returns a concrete `verdict` and weighted score (`lib/scoring/engine.ts:35-42`), not just educational content. The required files do not show disclaimers, consent language, privacy retention, or "not immigration advice" boundaries, so I cannot verify that these exist. Uploaded passports, financial proof, IELTS reports, and identity documents are especially sensitive; project status says the documents vault stores photos with signed URLs and service-role-only RLS (`docs/PROJECT_STATUS.md:27`, `58-61`), but code correctness is not the same as privacy compliance under Nepal/Australia law (speculation). Before scaling, the product needs a lawyer-reviewed boundary: information tool, not migration agent, plus retention/deletion rules and breach posture.

Data freshness is also an operating risk, not a backlog item. The project status says freshness guards exist and can fail when `reverifyBy` arrives (`docs/PROJECT_STATUS.md:103`), which is good engineering, but the user-facing consequence is unclear. If DHA fees, evidence levels, English rules, or provider status change, a stale "strong" or "possible" verdict can become harmful. The audit recommends a DHA evidentiary-tool scrape, but it does not define stale-data UX: when a fact expires, does the app hide the verdict, show a warning, degrade confidence, or keep serving cached advice?

The moat is under-argued. The audit says the corpus is a moat, but the code's visible advantage is mostly sourced data plus rule wiring. A consultancy can clone the public questionnaire, scrape the same DHA sources, and market it with human counselors. The defensible asset would be validated outcomes: anonymous-to-enrolled funnel data, refusal/approval feedback, program response rates, Nepal-specific document patterns, and trust distribution over time. I saw no such feedback loop in the required files. Cold start is therefore the hardest validation problem: 15 universities and 64 programs are seeded (`docs/PROJECT_STATUS.md:55`), many values are estimated per the audit, and no code file proves that verdicts correlate with actual visa outcomes.

## Pressure-test two decisions
**Documents:** the strongest case for keeping uploads is that document readiness is one of the few tangible workflows after assessment. Project status says `/documents` is shipped, typed by visa document taxonomy, and integrated with checklist items (`docs/PROJECT_STATUS.md:27`, `58-61`). For a nervous student, seeing "passport have/missing" or "proof of funds missing" can turn abstract chance into concrete progress. Uploads also create account stickiness: a user who has stored sensitive documents is less likely to churn (speculation). If the future business model includes counselor review, OCR, or application packaging, early uploads create the substrate.

My verdict: keep the checklist, stop asking for bytes until there is a real byte-level benefit. The audit-established no-op re-score is materially misleading, and `sectionsToStudentProfile` proves assessment inputs come from profile sections only, not document booleans (`lib/scoring/from-sections.ts:26-58`). The privacy/liability cost of passport and bank-statement photos is too high for "organized in a vault" as the only delivered value. Use checkboxes or self-attestation now; reintroduce uploads when they either extract facts, verify claims, or route to human review.

**AI guide:** Claude Haiku 4.5 may be a sensible model choice if the guide is built, but the guide is not the right Phase-6 bet before the core answer loop is trusted. The current product still has inert goal behavior: `goal` is mapped from career (`from-sections.ts:55`) and preference sorting handles only some goals while PR/employment/research become notes or deferred messages (`lib/matches/preference.ts:86-115`, `127-138`). An AI guide would have to explain around these gaps. Cheaper-to-trust work is stronger: fix conversion, remove inert fields, filter matches by eligibility, surface freshness, and create a human-readable "why this verdict changed" trail. My verdict: defer AI until the deterministic product is boringly reliable; then use a small grounded guide for source navigation, not personalized visa advice.

## Sharpest single recommendation
In the next two weeks, rebuild the anonymous results-to-account moment: put a direct Google OAuth CTA immediately under `VerdictCard`/`FactorBars`, keep a secondary CTA near matches, make every unlock button start auth instead of scrolling, and show the CTA even when there are ≤3 matches. This is the highest-leverage fix because it touches every anonymous user, repairs the audit's confirmed auth-gate bug, and converts at the exact moment the product has delivered value. At the same time, remove or soften any promise that account creation "unlocks accuracy" unless the signed-in profile actually changes the assessment, because trust is the product and the code still has known inert inputs.
