# MVP Promise-to-Behavior Audit — MyVisa

**Date:** 2026-06-14
**Question:** Find every place where the UI, copy, or flow implies a capability that is not actually implemented or not backed by real data.
**Method:** Live admin walkthrough of the running dev server (seeded dev user, Nepal→Australia) + 8 per-surface code-analysis agents → adversarial verification of every finding → ranked synthesis. 35 findings, all verified (0 dropped as false positives).
**Scope note:** Preference-fit matching (slice 7) is mid-flight; in-progress preference wiring is treated as backlog, not a defect.

## Executive summary

MyVisa's internal code is mostly truthful — the wizard, `/guide`, and the scholarship/cost tabs all honestly disclose "coming soon." But several of its **highest-trust surfaces make affirmative claims the engine does not back.** The two systemic risks:

1. **Fabricated methodology on the primary verdict surfaces** — a Nepal TU→Australian WAM grade conversion that never runs, document-upload "verification" that never feeds scoring, and declared prior visa refusals that are never scored.
2. **The "every data point carries its source and a verification date" promise is broken on three screens** — per-program source links, plan figures, and policy-banner numbers all drop their provenance.

Counts: **7 must-fix · 15 should-fix · 7 backlog · 0 don't-build.**

> **Reconciliation 2026-06-15 (owner):** Slice 7 shipped, so backlog #2 is **RESOLVED** — the preference engine is now wired on both `/matches` (`app/(app)/matches/page.tsx:39-52`) and anonymous results (`lib/results/assemble.ts`). Footer anchors (backlog #7) **reclassified → should-fix soon**.
>
> **Reconciliation 2026-06-15b (owner) — must-fix batch + provenance cluster shipped:**
> - **All 7 must-fix RESOLVED** (commits `258edfb..1db3200`): #1 TU→WAM claim removed, #2 uploads reworded (organize/track), #3 prior refusals scored (RULE_VERSION v0.4.0), #4 email-lead form removed, #5 3-day retrieval promise removed, #6 unsupported corridors marked "Not yet available", #7 not-sure routed through the AU financial gate.
> - **Provenance cluster (should-fix #1–#4) RESOLVED** (commits `2eb93e2`, `1ffbeb8`, `fad8fce`; suite 989 green): program-card links labelled by URL shape + `/how` Section 3 softened (#1); plan numeric claims now carry source/date via `lib/plan/sources.ts` + drift guard (#2); policy-banner DHA cost + grant rate now render `SourceLine`s (#3); grant rate relabelled "latest available — Apr–Jun 2025" (#4).
> - **Audit re-run (workflow, 15 agents) confirmed all four CLOSED (0 rejected) and surfaced 11 residual provenance gaps** — see "Provenance cluster round 2" below. Footer + `/trust` were excluded from this slice by design.
>
> ### Provenance cluster round 2 — residual gaps from the 2026-06-15 re-run (all verified real + in-scope)
> **Status 2026-06-15d (owner) — ROUND 2 CLOSED:** mechanical batch SHIPPED (`63348f0` plan surface, `d5a5db4` university-matches; suite 989→997) + policy-banner seasoning reworded to recommendation voice (`1be5989`; suite →**998**; pushed `fad8fce..1be5989`). **Owner closed round 2 here** — the remaining 3 copy items are deliberately left, not deferred: `/how` §1 is defensible (anchored to DHA pages that do deep-link; Section 3 already carries the program hedge); the 2 checklist rows are already hedged ("typically" / "confirm with your provider") and sourcing AHPRA would be a new data claim we don't need. **NEXT lane: refusal/recovery extension** (user pick — user-facing trust content fits the trust-first lane ahead of the feed-system infrastructure).
> **Plan surface (6) ✅ RESOLVED (`63348f0`) — same `SOURCES`-map pattern, trivially extensible:**
> - `prepare-police-certificate` — OPCR 2/1 working days + 3-month validity, unsourced → `nepal-document-processing-times.ts` (A.098/A.099) + `nepal-police-certificate.ts` opcr-validity (A.102); one OPCR URL covers all three.
> - `prepare-health-exam` — DHA 12-month validity, unsourced → `au-health-biometric-facts.ts` health-examination-validity (C.092). *(Inconsistent: sibling `prepare-biometrics` reads the same module and IS wired.)*
> - `start-passport-process` — Dept of Passports ~2 working days, unsourced → `nepal-document-processing-times.ts` passport-central (A.049).
> - `prepare-gs-answers` — DHA 150-word limit + 23 Mar 2024, unsourced → `au-student-visa-requirements.ts` genuine-student (A.021/A.016).
> - `prepare-fund-remittance` — NRB rules, unsourced → `nepal-source-of-funds.ts` (needs **two** URLs: NRB_STUDY + NRB_ANNUAL, B.012–B.015).
> - `certify-sponsor-income` — names "Lalitpur Metropolitan City's published list", unsourced → `nepal-income-certification.ts` (LMC_FAQ). **Caveat:** body is hand-written prose (not interpolated), so it needs a prose↔rows drift guard, not just a URL pin; and the `generator.ts:146` comment claims a "typically" hedge that isn't actually in the rendered body.
> **Anonymous results (1) ✅ RESOLVED (`d5a5db4`) — highest-trust surface:**
> - `components/results/university-matches.tsx:34-38` — tuition + grade bar + IELTS shown with **no source**, while the signed-in `ProgramCard` carries source links. `UniversityData` has `source`/`lastVerified`; dropped at render. (3 free MatchCards + all owned-view cards.)
> **Marketing copy (1) — ⏸ LEFT by owner (defensible):**
> - `/how` Section 1 "Data sources" (`app/(marketing)/how/page.tsx:27`) says "we pull the published thresholds and **link to the exact page**" — grammatically anchored to DHA visa rules, which *do* deep-link, and Section 3 already carries the program-card hedge. Owner judged it defensible; not changed.
> **Policy-banner (1) ✅ RESOLVED (`1be5989`):**
> - First `<li>` reworded "plan for 6 months of bank seasoning" → **"we recommend planning for around 6 months of bank seasoning and a strong Genuine Student case."** The duration stays unsourced *by design* (F2-A: DHA publishes none) — recommendation voice is the honest frame; a copy-lock pins it. *(Related, NOT changed: `lib/matches/compute.ts:105` carries the same "6 months bank seasoning expected (Nepal AL3)" phrasing as a signed-in match reason — out of this slice's scope, flagged for awareness.)*
> **Checklist (2) — ⏸ LEFT by owner (already hedged):**
> - English row "Nursing programs **typically** require each band ≥ 7" (`lib/checklist/generator.ts:168`) — already hedged with "typically"; owner judged "confirm with provider" would be noise. (The **latent** no-SourceLine path if a program's `source` is empty remains a robustness note; seed always sets it today.)
> - AHPRA row (`lib/checklist/generator.ts:178`) already self-hedges ("confirm your program's requirements with the provider"); adding an AHPRA source would be a new data claim — owner left as-is.

---

## Must fix before MVP — trust-breaking mismatch (7)

### 1. Matches verdicts claim a Nepal TU→Australian WAM grade conversion that never runs `[high]`
- **Where:** `app/(app)/matches/page.tsx:84-87`, `lib/plan/generator.ts:93`, `lib/matches/compute.ts:22,32,55`, `lib/matches/from-sections.ts:20`, `lib/programs/policy.ts:34-39` (`tuPctToAuWamBand` — dead code)
- **Promise:** "Strong / Possible / Reach against each program's published thresholds. Grade conversion follows the Nepal TU → Australian WAM table from our research."
- **Behavior:** No conversion happens. `from-sections.ts:20` passes `gradePercent` verbatim; `compute.ts:32` does `gradeGap = max(0, minGrade - userGrade)` on the raw value. `tuPctToAuWamBand` is imported by nothing but its own test. The "85%" seen live is a stored profile value, not WAM output.
- **Why:** The one sentence justifying every verdict for a Nepali applicant describes a methodology not in the code; a raw TU% is silently treated as if already on the Australian scale.
- **Fix:** Implement the conversion (call `tuPctToAuWamBand` in the compute path) **or** remove the claim. Don't ship copy asserting a research-backed conversion that doesn't execute.

### 2. `/how` claims document uploads verify values and update every match score; uploads never feed scoring `[high]`
- **Where:** `app/(marketing)/how/page.tsx:76-80`, `components/results/accuracy-meter.tsx:18-26`, `lib/results/accuracy.ts:16-30`, `lib/scoring/from-sections.ts:35,47,52`, `app/api/documents/upload/route.ts:104-127`
- **Promise:** Uploading a scorecard/transcript/bank statement "replaces a declared value with a verified one… your dashboard verdict refreshes… and every program match score updates." Accuracy meter: "Upload your transcript → exact grade verification."
- **Behavior:** Scoring reads only declared numbers, never document contents. Upload flips boolean flags consumed only by plan steps; no OCR/extraction exists. The accuracy meter is a fixed heuristic that **caps at ~28%** regardless of uploads. Verdict and match scores never change.
- **Why:** On a product whose core value is an evidence-backed verdict, this falsely tells users that uploading yields verified, more-precise scores.
- **Fix:** Hedge the cascade + accuracy-meter copy to what actually happens (uploads are stored for checklist/plan, not parsed into the verdict), **or** build extraction.

### 3. Prior visa refusals are collected but never scored, while the dashboard shows a "Visa case strength" verdict `[high]`
- **Where:** `components/profile/editors/immigration-editor.tsx:34-45`, `lib/scoring/from-sections.ts:26-58`, `lib/scoring/visa.ts:13-119`, `app/(marketing)/how/page.tsx:45-47`
- **Promise:** A "Visa history" editor collects prior refusals (None/One/Multiple) beside a dashboard chip "Visa case strength Solid."
- **Behavior:** `sectionsToStudentProfile()` never reads `sections.immigration`; `StudentProfile` has no refusals field. A user with "Multiple" refusals and one with "None" get an identical verdict.
- **Why:** Prior refusals are one of the strongest real-world DHA Subclass 500 risk factors. A user declaring one sees no penalty and may conclude their case is "Solid" — exactly the false reassurance the platform exists to prevent.
- **Fix:** Map `sections.immigration` into scoring and penalize refusals in `scoreVisa`, **or** remove the field + the chip until scored.

### 4. "Email me my results" harvests the email and confirms delivery, but no email is ever sent `[high]`
- **Where:** `components/results/conversion-paths.tsx:68-87`, `app/api/leads/route.ts:27-32`, `lib/assessments/repo.ts:32-43`
- **Promise:** "Email me my results" → on submit confirms "We'll send your results to {email}."
- **Behavior:** `POST /api/leads` only upserts an `{email, assessment_id}` row. No email-sending code exists anywhere (repo-wide search for resend/nodemailer/sendgrid/postmark finds only commented-out SMTP boilerplate).
- **Why:** A user told to defer to family and ask for results by email never receives anything — an unhedged promise of an action the system doesn't perform, while harvesting the email as a lead.
- **Fix:** Wire a real email send, **or** change copy to what happens ("Save your assessment — sign in to keep it") and stop confirming delivery.

### 5. "Come back later — available for 3 days," but an anonymous user has no way to return `[high]`
- **Where:** `components/results/conversion-paths.tsx:56-59,91-93`, `app/(focused)/assessment/[id]/page.tsx:11-15`, `lib/assessments/repo.ts:60-64`, migration `20260603011208_*.sql:28-36`
- **Promise:** "Your assessment expires in 3 days… Or come back later — your assessment is available for 3 days."
- **Behavior:** No anonymous retrieval path. `/assessment/[id]` calls `getUser()` and redirects to `/assess` if not signed in; RLS grants read only to authenticated. The result lives only in React state. The sole way back is account creation.
- **Why:** "Come back later" tells anonymous users they can return when they can't; choosing it silently loses the assessment.
- **Fix:** Build anonymous retrieval (signed expiring link / localStorage), **or** state plainly the result is only retained on sign-in. Cut "come back later."

### 6. Marketing scores 5 unsupported destinations with confident verdict + eligibility CTA that dead-ends `[high]`
- **Where:** `lib/marketing/destinations.ts:42-141`, `components/destinations/destination-detail.tsx:89-100`, `lib/scoring/types.ts:49` (`SUPPORTED_DESTINATIONS=["australia"]`), `app/api/assess/route.ts:42-46`
- **Promise:** "Six countries, done well." CA/UK/DE/US/IE each get a verdict badge, fact table, doc checklist, and active CTA "Check your standing for {country}."
- **Behavior:** Australia only is end-to-end. `/api/assess` returns 422 "Destination not supported yet" for the other five; the wizard disables them with "Coming soon." That disclosure exists **only in the wizard, not on marketing.**
- **Why:** A student researching Canada/US sees a full source-linked page with a verdict + CTA — every signal says "we assess this" — then hits a disabled country.
- **Fix:** Add a "Not yet available — we fully cover Nepal → Australia today" state to the five pages and disable/relabel their CTA.

### 7. "Not sure" verdict is sold as the Australia standing but skips the DHA financial-capacity gate `[high]`
- **Where:** `lib/scoring/financial.ts:71` (gate guarded by `destination==="australia"`), `lib/results/assemble.ts:11-13`, `components/results/destination-notice.tsx:31-40`, `lib/data/policy/au-cost-of-living.ts:100`
- **Promise:** For "Not sure yet": "Australia is the only corridor we fully cover today, so this readout shows where you stand for Nepal → Australia."
- **Behavior:** The DHA financial-capacity floor runs only `if (destination==="australia")`. A "not-sure" profile skips the gate and uses a lower cost band. Verifier reproduced: an identical under-funded profile scores **financial=29 / Reach** as Australia vs **financial=75 / Possible-Strong** as not-sure.
- **Why:** The disclosure claims the not-sure readout equals the Australia readout, but the most decision-relevant rule is silently omitted — an under-funded user is shown better odds than the corridor warrants.
- **Fix:** One-line fix in `assemble.ts` to rewrite destination to "australia" before scoring (so the gate + cost band apply), **or** hedge the disclosure.

---

## Should fix soon — confusing but not fatal (15)

1. ✅ **RESOLVED 2026-06-15** (`2eb93e2`) — **Per-program "Source ↗" links land on bare university homepages, not the published thresholds** `[high]` — `components/matches/program-card.tsx`. Link label now keys off URL shape (`isDeepLink`): "Source" only for a deep link, "Provider site" for a bare host; `/how` Section 3 softened. *(Residual: `/how` Section 1 "link to the exact page" still untouched — round 2.)*
2. ✅ **RESOLVED 2026-06-15** (`fad8fce`) — **Plan steps quote authoritative DHA/Nepal figures with no inline source or date** `[high]`. Wired via client-safe `lib/plan/sources.ts` + drift guard, rendered as `SourceLine` in `PlanItemCard`. *(Resolved for 4 figure-bearing items; 6 more found in the re-run — round 2.)*
3. ✅ **RESOLVED 2026-06-15** (`1ffbeb8`) — **Policy-banner grant-rate & DHA cost numbers shown without their source link** `[high]` — `components/matches/policy-banner.tsx`. Both figures now render a `SourceLine` (verified date + DHA host link) from their `Sourced<>` objects.
4. ✅ **RESOLVED 2026-06-15** (`1ffbeb8`) — **Policy banner frames a year-stale, declining grant rate as "Current policy"** `[medium]`. Grant rate relabelled "latest available — Apr–Jun 2025" (the relabel option).
5. **Matches header says "published thresholds" but ~69% of programs are estimates** `[high]` — `matches/page.tsx:85-86`, `lib/programs/seed.ts` (44/64 `dataQuality "derived"`). Verdicts computed against estimated fields while the header frames all as published. Per-card "Estimated" label is the saving grace. Fix: hedge header to match cards.
6. **Destination verdict pills reuse the personalized Strong/Possible/Reach vocabulary for static editorial labels** `[medium]` — `lib/marketing/destinations.ts:27,…`, `components/destinations/destination-card.tsx`. Hardcoded per-country `match` reuses the exact `VERDICT_STYLE`; Australia shows "Strong" to a visitor whose real verdict would be Reach. Fix: differentiate the marketing badge + add "illustrative" caption.
7. **AI-guide home tile presented as live while disclosed "coming soon" everywhere else** `[high]` — `app/(marketing)/page.tsx:90-94` (no badge) vs `:99` (sibling SOP tile `badge="Soon"`). The one unbuilt headline feature shown as live. Fix: add `badge="Soon"` + label the hero mockup as a preview.
8. **Gated teaser promises a "23-step procedure guide" + "14 documents" that, on unlock, are "coming soon"** `[high]` — `components/results/gated-teasers.tsx:4-13`. Hardcoded counts; no 23-step guide exists; real checklist count is variable. Unlock reveals "we'll email you" (no email path). Fix: remove fabricated counts + the email promise.
9. **Journey-timeline `currentStep` is hardcoded to "shortlist" for every user** `[high]` — `app/(app)/dashboard/page.tsx:65`, `components/dashboard/journey-timeline.tsx:11-28`. A progress tracker that never advances. Fix: derive from real state or relabel as a generic roadmap.
10. **"Deal-breakers / must-haves" collected with filtering language but never filter or rank matches** `[high]` — `components/profile/editors/destination-intake-editor.tsx:144-149`, `lib/matches/from-sections.ts:4-27`. Stored + echoed but no match is filtered. Fix: wire into ranking or soften "deal-breakers… must meet."
11. **Scholarship-profile chips claim they "help match you to scholarship opportunities" while scholarships are "coming soon"** `[high]` — `components/profile/editors/money-scholarships-editor.tsx:128-131`. Present-tense editor copy contradicts the `/matches` "coming soon." Fix: hedge editor helper text.
12. **Document vault rejects PDFs but every slot names PDF-native documents** `[high]` — `app/api/documents/upload/route.ts:19,49-51`. `ALLOWED_TYPES` = JPEG/PNG/WebP only; "Bank Statement", "Confirmation of Enrolment" are normally PDFs; image-only/5MB limit only surfaced via post-selection error. Fix: accept PDFs (preferred) or state the constraint up front.
13. **Checklist English requirement labelled "verified" but cites derived program data** `[medium]` — `lib/checklist/generator.ts:169-176`, `components/results/source-line.tsx:22`. Same IELTS figure is "Estimated" on matches but "verified" on the checklist. Fix: pass `dataQuality` through to the checklist `SourceLine`.
14. **Plan not regenerated on first-time OAuth claim despite "we regenerate whenever your profile changes"** `[high]` — `app/auth/callback/route.ts:34-40`, `lib/assessments/claim.ts:21-56` (no `invalidatePlan`). New user lands on `/plan` with the empty state at the exact moment their profile was fully populated. Fix: one-line `invalidatePlan` in the claim path.
15. **Dashboard promises update notifications with no feed or change-detection behind it** `[medium]` — `components/dashboard/recent-updates.tsx:13`. "We'll notify you here when visa rules or matches change" is a forward-tense capability claim with no alerting system. Fix: hedge to "Update alerts are coming soon" (→ backlog) or build the feed.

---

## Backlog — useful feature, not required (honestly disclosed) (7)

1. **Scholarships & Cost-estimate match tabs** — honestly "coming soon"; underlying `au-scholarships.ts` / `au-pathway-programs.ts` data is real + sourced but unwired. Build: wire the data in.
2. **Signed-in preference engine (slice 7)** — ✅ **RESOLVED 2026-06-15.** `applyPreference` + `PreferenceNote` are now called in `matches/page.tsx:39-52` (and on anonymous results via `lib/results/assemble.ts`). No longer pending. *(Original finding: adapter built + tested but not yet called — verified stale by re-reading the matches finder.)*
3. **Scholarships dashboard stat tile** — honestly labelled "Coming soon", intentionally non-interactive. Build scholarship matching later.
4. **SOP coach** — honestly badged "Soon" on the tile; only gap is the dead `/how#sop` anchor (see #7). Build when prioritized.
5. **Career "Target role"** — collected but consumed by nothing; no explicit claim it changes the verdict. Wire into matching or drop.
6. **Checklist "Upload in documents" generic link** — `PROJECT_STATUS.md:61` calls it a "deep-link" but it's a flat `/documents` href. Add a per-kind anchor or correct the doc.
7. **Footer anchor links land at top of page silently (7 dead anchors)** — `components/layout/footer.tsx:12-30`; none of `#guide #sop #sources #privacy #about #contact #careers` exist on `/how` or `/trust`; About/Contact/Careers imply company info that exists nowhere. **Synthesizer note:** the verifier rated this should-fix; it was placed in backlog as low-stakes UX cleanup — flagged for your call. Fix: add the anchors + real content, or remove the dead links. **→ Reclassified should-fix soon (owner, 2026-06-15): dead Sources/Privacy/Contact links on a trust product are not acceptable.**

---

## Do not build yet — distraction or unsupported by data (0)

None. Every promised capability either maps to a real fix, a copy hedge, or already-sourced data worth wiring — nothing was a pure distraction to cut.
