# The program-data wedge — testing the "no CRM holds program knowledge" thesis

**Date:** 2026-08-11
**Type:** Desk research. No source changes, no PR, no board edits.
**Scope correction applied:** this is a general question about how education consultancies work across corridors (India, Nigeria, Vietnam, Pakistan, Nepal, China → AU/UK/CA/US). Nepal→Australia is treated as one instance, not the subject.

## Evidence marking

Every claim below carries one of:

- **[F]** VERIFIED FACT — I read it on the primary source, or it is a measurement I made of this repo.
- **[M]** VENDOR MARKETING CLAIM — the vendor asserts it; I could not test the product behind the login.
- **[I]** MY INFERENCE — reasoning from the above. An unmarked inference would be worse than an admitted gap, so every inference is marked.

A recurring limit, stated once: **every commercial platform in this report is behind a login or a demo gate.** I could read feature pages, help-centre articles, pricing tables and product screenshots. I could not run a query and inspect the result. So for the eligibility products, the *existence and shape* of the feature is [F] (it is documented, priced, and screenshotted) while the *quality and currency of the data underneath* is [M]. That distinction is load-bearing and I have kept it everywhere.

---

## 1. Verdict on the thesis

### **REFUTED as stated. A narrower thesis is SUPPORTED and is the one worth building on.**

The founder's thesis has two clauses. The first is false. The second is true and more valuable than the first.

**Clause 1 — "No education-consultancy CRM holds knowledge of programs; none can tell you whether a student clears the requirements." → REFUTED.**

This is not a marketing-language problem where vendors overclaim a filtered catalogue. Structured eligibility logic against stored entry requirements is a shipped, documented, *priced* feature in at least six products, including **two of the four the founder was told about**:

- **Adventus.io "Grade Match"** — counsellor enters the student's grades *and grading system*; search results carry a badge reading "Almost there" / "Just above" / "Well above" relative to the course's entry requirements, and a filter restricts results to courses whose requirements the student's grades meet. Over 70,000–80,000 courses at 1,300–1,600+ institutions. **[F]** ([blog.adventus.io](https://blog.adventus.io/introducing-grade-match-for-smarter-course-searches), [adventus.io/recruiters/course-search](https://adventus.io/recruiters/course-search/))
- **ApplyBoard** — 140,000–150,000+ programs; once a student profile is populated "the platform checks their overall program eligibility"; a **dedicated CX Journey Team collects, evaluates and implements program requirement information and liaises with admissions offices** to keep the pre-screening rules aligned with each institution's actual process. Manual review additionally checks pre-requisite courses, study gaps, and **"previous rejection cases for similar students."** Pre-screening has filtered out **24% of all applications** before they reach partner institutions (current as of June 2026). **[F]** ([applyboard.com/applyinsights-article/how-applyboard-screens-every-student-application-for-quality-and-completion](https://www.applyboard.com/applyinsights-article/how-applyboard-screens-every-student-application-for-quality-and-completion), [applyboard.com/blog/new-student-search](https://www.applyboard.com/blog/new-student-search))
- **Cosmic CRM (Nepal, one of the four named)** — ships an "AI University Finder". Product screenshots on the public site show counsellors entering "student profile, academic, English test, budget, intake, city, course, and scholarship preferences", and a result card carrying **"AI match score, eligibility, course details, warnings, AI reasoning, shortlist actions, and application creation."** **[F]** that the feature is shipped and shown; **[M]** as to its data quality ([cosmiccrm.com](https://cosmiccrm.com/))
- **NC-CRM (Nepal, one of the four named)** — "University Matching: our intelligent algorithm analyzes student credentials and recommends universities with the best admission chances. Multi-factor matching algorithm · GPA, test scores, budget analysis · **University database with requirements**." **[M]** — note that "AI-Powered University Matching" appears on a *Coming Soon* tier, so this may be roadmap rather than shipped ([nepaliconsultancy.com/nc-crm](https://www.nepaliconsultancy.com/nc-crm))
- **Avenlixx (one of the four named)** — "**Automatic Eligibility Checker** — instantly verify student eligibility for specific courses and universities based on their academic profile and test scores", alongside "Course & University Filtering — easily **add, update**, and filter through thousands of courses and universities." **[M]** ([avenlixx.com](https://avenlixx.com/))
- **SmartX / EduCa CRM (India, global)** — "Score & Language-Based Eligibility Filters: only show courses where the student meets minimum IELTS/PTE scores, academic GPA, and subject prerequisites." **[M]** ([smartxcrm.com/university-course-finder-crm](https://smartxcrm.com/university-course-finder-crm/))

The claim "a counsellor using one of those CRMs still has to know that themselves or look it up" is therefore **wrong for the aggregator platforms and wrong for at least one of the four local Nepali CRMs**. If MeroVisa pitches "your CRM cannot answer whether this student will get in," a Cosmic CRM or Adventus customer will open a tab and show you that it can.

**The strongest single piece of counter-evidence, stated plainly:** ApplyBoard runs a maintained, institution-liaised program-requirements dataset, applies automated eligibility checks plus human review against it, factors in *prior rejection patterns for similar students*, and can point to a measured 24% pre-submission rejection rate as proof the logic bites. That is a more mature version of what this thesis proposes to build, operating at ~1,800× MeroVisa's current catalogue size, and it has been in market for years. **[F]**

**Clause 2 — the reframed thesis that survives:**

> Every one of these systems answers **"will this student receive an OFFER?"** None of them answers **"will this student receive a VISA?"** — and in the corridors that matter most, the visa is where students are actually lost.

This is not a nuance. It is the whole economics of the market:

| Cohort | Australian student-visa refusal rate, Feb 2026 | Source |
|---|---|---|
| **Nepal** | **65%** | ICEF Monitor, citing DHA data **[F]** |
| Bangladesh | 51% | same |
| India | 40% | same |
| Sri Lanka | 38% | same |
| Bhutan | 36% | same |
| **All applicants to AU universities** | **32.5%** — highest monthly figure in 21 years of tracking | same |
| China | ~3.5% | same |

([monitor.icef.com/2026/04/australia-student-visa-refusal-rates-reach-record-high…](https://monitor.icef.com/2026/04/australia-student-visa-refusal-rates-reach-record-high-amid-weakening-demand-from-china/)) Canada refused 52% of study-permit applications in 2024, up from 38% in 2023; US F-1 refusals hit 36% **[F]** ([monitor.icef.com/2025/03/high-study-visa-refusal-rates…](https://monitor.icef.com/2025/03/high-study-visa-refusal-rates-disrupting-the-international-education-landscape/)).

An offer-eligibility engine is a solved problem *and it is the wrong problem for a Nepali, Bangladeshi or Indian student*. A counsellor who perfectly shortlists a Grade-Match-badged course has a roughly two-in-three chance of that student never boarding a plane. **[I]** — the arithmetic is mine; the refusal rates are [F].

Three further facts sharpen the wedge:

1. **Refusals are now an institutional balance-sheet problem, not just a student problem.** Australian provider risk levels are set mostly on student-visa outcomes — "especially visa refusal rates due to fraud (40%) or other reasons (10%)", i.e. refusals compose ~50% of the criteria. A spike pushes a university into Level 2 or 3, which forces it to demand *more* documentation from every subsequent student and slows processing. Universities Australia has asked the government for **weekly refusal dashboards so providers can intervene early with extra document checks and GTE coaching** rather than lose applicants. **[F]** (ICEF, Apr 2026). In the UK the parallel mechanism is UKVI's annual **Basic Compliance Assessment**, which scores every sponsor on visa refusal rate, enrolment rate and completion rate; falling short can strip an institution of the right to self-assess English ability. A new **Agent Quality Framework** is being extended "so institutions can no longer treat agent-sourced evidence as somebody else's responsibility." **[F]** ([monitor.icef.com/2026/07/why-sharper-english-language-guidance…](https://monitor.icef.com/2026/07/why-sharper-english-language-guidance-is-becoming-an-agents-sharpest-tool-for-student-success/))
2. **Refusal exposure has already killed an agency.** GrowPro (founded 2013, 17 countries) accumulated a ~50% visa refusal rate by mid-2023; its model spent student fees before visas were approved, and the refusals triggered its collapse. **[F]** (ICEF, Mar 2025, citing El Diario)
3. **Aggregator eligibility is scoped to the aggregator's own commission catalogue.** Independent commentary and survey evidence: >30% of surveyed staff agreed "agents push students to where they receive the highest commission rate"; 24% of international students who used an agent thought their agent was biased toward certain universities; agents commonly recommend only schools paying 10–15% placement fees. **[F]** (survey figures as reported; [markashwill.com](https://markashwill.com/2024/01/24/what-are-the-problems-with-education-agent-aggregators/), [thepienews.com/is-the-term-aggregator-becoming-a-dirty-word](https://thepienews.com/is-the-term-aggregator-becoming-a-dirty-word/)) **[I]** A consultancy holding its own direct university contracts gets no eligibility coverage from an aggregator for those institutions — the aggregator has no commercial reason to hold them.

**So: REFUTED as written; the corrected thesis is "your platform tells you whether the university will say yes. Nobody tells you whether the embassy will."**

---

## 2. Competitor capability matrix

Columns: **Program data?** does it hold structured institution/program records · **Eligibility logic?** does it compute a student-vs-requirement result, not just filter a catalogue · **Verified & dated?** is provenance (source + verification date) exposed per data point · **Visa/refusal risk?** does it model visa outcome as distinct from admission outcome.

| Product | Program data? | Eligibility logic? | Verified & dated? | Visa/refusal risk? | Evidence |
|---|---|---|---|---|---|
| **Adventus.io** | Yes — 70–80k courses, 1,300–1,600+ institutions **[F]** | **Yes, real.** Grade Match: grades + grading system → badge vs entry requirements, plus a hard filter to requirement-meeting courses **[F]** | No published provenance. Currency claim is a process claim: "an experienced and extensive **data entry team** that updates the platform" **[M]** | No evidence of any visa-outcome model. Filters include visa *status*, not visa *risk* **[F: absence in public docs]** | [1](https://blog.adventus.io/introducing-grade-match-for-smarter-course-searches) [2](https://adventus.io/recruiters/course-search/) |
| **ApplyBoard** | Yes — 140–150k programs, 5 destinations **[F]** | **Yes, deepest found.** Automated eligibility + human CX Journey review (pre-reqs, study gaps, prior rejection cases for similar students); 24% of applications filtered pre-submission **[F]** | No per-record provenance published. Currency = dedicated team liaising with admissions offices **[M]** | Only indirectly: "success prediction" ranks *acceptance* likelihood; a separate visa support team exists but no visa-risk scoring is documented **[F: absence]** | [3](https://www.applyboard.com/applyinsights-article/how-applyboard-screens-every-student-application-for-quality-and-completion) [4](https://www.applyboard.com/blog/new-student-search) |
| **Cosmic CRM** (NP) | Yes — an "AI University Finder" over university/course records **[F: screenshotted]** | **Claimed and shown**: match score + eligibility signals + warnings + AI reasoning **[F: feature exists]** / **[M: quality]** | Not shown anywhere in the product tour **[F: absence]** | No **[F: absence]** | [5](https://cosmiccrm.com/) |
| **NC-CRM** (NP) | Claimed — "university database with requirements" **[M]** | Claimed — GPA/test/budget multi-factor "best admission chances"; **"AI-Powered University Matching" sits on a *Coming Soon* tier** **[F]** | No **[F: absence]** | No. Visa appears only as a *pipeline stage* and a *commission clawback trigger* **[F]** | [6](https://www.nepaliconsultancy.com/nc-crm) |
| **Avenlixx** (NP/global) | Yes, but **consultancy-entered**: "easily **add, update**, and filter through thousands of courses" **[F: their wording]** | Claimed — "Automatic Eligibility Checker … based on academic profile and test scores" **[M]** | No. **[I]** If the consultancy enters and updates the rows, provenance and currency are the consultancy's problem, which is the status quo with extra steps | No **[F: absence]** | [7](https://avenlixx.com/) |
| **OSOM** (NP) | **No requirements data.** "University Course Management" is course *administration* — schedules, enrolments, "ensure all students are registered in the right programs" **[F]** | **No** **[F]** | n/a | No — "Visa Schedule" is date tracking **[F]** | [8](https://osom.global/) |
| **SmartX / EduCa CRM** (IN) | Claimed global course database **[M]** | Claimed — "only show courses where the student meets minimum IELTS/PTE scores, academic GPA, and subject prerequisites" **[M]** | "Real-time updates" asserted, no mechanism given **[M]** | No **[F: absence]** | [9](https://smartxcrm.com/university-course-finder-crm/) |
| **Meritto** (IN, enterprise) | **No.** Pure lead/pipeline/counsellor-performance CRM — lead scoring, funnels, user management **[F]** | **No** **[F]** | n/a | No **[F]** | [10](https://www.meritto.com/study-abroad-education-consultant-crm-software/) |
| **Leverage Edu** | Yes — "AI Course Finder", 850+ university partners **[M]** | Claimed **[M]** — could not inspect; page is a JS shell | No **[F: absence]** | No **[F: absence]** | [11](https://leverageedu.com/course-finder/) |
| **UniAgents** | Directory of partner institutions + courses **[F]** | Not evidenced **[F: absence]** | No | No | [12](https://www.uniagents.com/) |
| **StudyLink / Edvoy** | Course search present **[M]** | Not established — StudyLink returned 403, Edvoy is a JS shell **[gap]** | — | — | — |
| **Free/official: CRICOS register** | Yes — the authoritative AU list of providers and CRICOS-registered courses, free **[F]** | **No.** It is a registry, not a matcher; the site is JS-only, has no public JSON API I could reach, and TEQSA directs students to "find out about course availability, admission requirements and fees" from providers **[F]** | Authoritative but not per-field dated for admissions criteria **[F]** | No | [13](https://cricos.education.gov.au/) [14](https://www.teqsa.gov.au/cricos-and-elicos/cricos-frequently-asked-questions-faqs) |
| **Free tools: visa-risk checklists** (e.g. UniversitySwitch, PathwayToAus EFC calculator) | No | Coarse self-serve triage: destination, funding proof, refusal history, academic gap, course logic, documents → "readiness score" **[F]** | No | **Partially — and free.** This is the closest free substitute for MeroVisa's differentiator **[F]** | [15](https://www.universityswitch.com/tools/visa-risk-checklist/) |
| **MeroVisa today** | 15 universities / 83 programs, 1 corridor (see §5) **[F: measured]** | Yes — versioned server-side engine, banded verdicts | **Yes — `source` + `lastVerified` on every data point. Nobody else in this table does this.** **[F]** | **Yes — refusal penalties, financial-capacity gate, GS/GTE evidence model, English *visa floor* distinct from *course threshold*** **[F: measured]** | this repo |

**The two columns nobody else fills are the last two.** That is the entire finding of this table.

---

## 3. Who already owns this data, and is it free?

**Short answer: the aggregators own it, it is not free to a consultancy, but it is cheap enough that a consultancy can get "good enough" offer-eligibility for the price of joining a marketplace — which is zero.**

- **Not available free from official sources.** The CRICOS register is authoritative for *which provider may enrol international students in which course*, and it is free, but it is a compliance registry. TEQSA's own FAQ routes "admission requirements and fees" questions to the providers. **[F]** There is no national register, in Australia or elsewhere, of *entry criteria per program per applicant nationality*. Those live on ~40 institutional websites per destination, in inconsistent shapes, with country-equivalency tables that differ per institution.
- **Cost of the manual route.** **[I]** — my estimate, and I want it read as one. For one student, one corridor, a competent counsellor needs: the course page (fees, duration, intake), the country-equivalency page (does a Nepali +2 / TU bachelor's meet this?), the English requirements page (overall *and* per-band, which frequently differ), the provider CRICOS entry, plus the destination's visa financial-capacity figure and any provider-level risk overlay. That is 5–7 sources per program per student, most of which are not linked to each other. Fifteen minutes per program is optimistic; a genuine six-program shortlist is a half-day. Against that, an Adventus Grade Match query is seconds. **This is why the aggregators won this ground and why competing on it is a losing race.**
- **The catch that makes the free route non-free:** the aggregator's answer is bounded by its commission catalogue and carries the commission-bias problem documented in §1. **[F]** for the bias evidence; **[I]** for the conclusion that a consultancy's *own* direct-contract universities go uncovered.
- **Commercial data layers exist but sell to institutions, not agents.** Keystone Education Group operates ~460 student-facing sites and serves 5,500+ institutions; Studyportals runs Mastersportal/Bachelorsportal. **[F]** ([educationsmediagroup.com/discover-keg](https://www.educationsmediagroup.com/discover-keg), [en.wikipedia.org/wiki/Studyportals](https://en.wikipedia.org/wiki/Studyportals)) **[I]** Their revenue model is institutional lead-gen, so their program data is a means to sell traffic; I found no evidence of either licensing a structured entry-requirements feed to agent CRMs. That is an unfilled slot, but the absence of a market may be evidence that nobody will pay for it.

---

## 4. The counsellor's day, and where program knowledge actually binds

Evidence base: real vacancy postings from Nepal (merojob), generic JD templates used across India/Nigeria/Gulf markets, agency self-descriptions, and the ICEF material on what is changing for agents. Where I extrapolate, it is marked.

**What the postings actually list.** A Kathmandu **Documentation Officer** role: assist the counsellor with applications and documentation · coordinate with students to facilitate documentation and visa application · **check the documents in detail for accuracy and authenticity** · storage, cataloguing, retrieval, access control, destruction of obsolete documents · guide students with visa interview preparation. **[F]** ([merojob.com/documentation-officer-116](https://merojob.com/documentation-officer-116)) An **Admissions Officer** posting: "arrange documents, certify and process applications assigned by the counselors." **[F]** An **Admission Counsellor** posting: counselling walk-ins and off-campus prospects, handling queries across calls/email/walk-ins/portals/agencies, identifying and researching prospective students — i.e. **a sales role**, with a stated NPR 20,000–30,000/month salary. **[F]** ([merojob.com/admission-counsellor-5](https://merojob.com/admission-counsellor-5/))

Agencies describe their *counsellors* as the knowledge holders — "our well experienced counselors are **up to date with the information** regarding study abroad procedures", "they suggest the students about programs (courses), colleges/universities, application deadline, documents required" **[F]** — while the *documentation officer* is the one who never touches program selection.

**Where the time goes.** **[I]**, but grounded: the division of labour in these postings is unambiguous. Shortlisting is one bullet inside a counsellor role that is otherwise lead handling, conversion and follow-up; document handling is a whole separate salaried headcount. The four Nepali CRMs allocate their surface area the same way — NC-CRM's twelve modules are unified inbox, live chat, booking, commission tracking, reviews, classrooms, payroll, and *one* university-matching module. Cosmic CRM's headline problem statements are "warm leads disappear between inboxes", "counsellors work from memory", "applications move without visibility", "payments sit outside CRM" — none of them is "we don't know what the university requires." **[F]** These vendors sell against the pain their customers report.

**Conclusion on where program knowledge binds:**

1. **Shortlisting is NOT the bottleneck, and pitching it as one will not land.** It is a bounded, once-per-student task, already served free-at-point-of-use by aggregator portals for partner institutions. **[I]**
2. **Where knowledge genuinely binds is at the visa-evidence stage**, and it binds on a *different* body of knowledge: financial-capacity thresholds and acceptable source-of-funds, English *visa floors* vs *course thresholds*, gap-year justification, provider risk level, prior refusal handling. This is the work that produces a 65% Nepal refusal rate when done badly, and it is the work that the documentation officer — the least senior, least paid, most procedural role on the org chart — is currently doing. **[I]**, from the JD structure + the refusal statistics.
3. **The regulatory direction of travel makes this worse for consultancies and better for a tool.** The UK's extended Agent Quality Framework means institutions "can no longer treat agent-sourced evidence as somebody else's responsibility"; Australian provider risk levels are ~50% driven by refusal outcomes. **[F]** Agents are being made accountable for evidence quality by their partners, with no instrument to measure it. **[I]**

---

## 5. Honest sizing of MeroVisa's data asset

I measured this rather than taking the CLAUDE.md description at face value. It is smaller than the framing implies, and the gap between the two data layers matters.

**The matchable catalogue — what the matcher actually reads** (`lib/programs/seed.ts` → Supabase `universities` / `programs`, consumed by `lib/matches/compute.ts`):

| Measure | Value |
|---|---|
| Universities | **15** (all Australian) |
| Programs | **83** |
| Corridors | **1** (Nepal → Australia) |
| Fields covered | 10 — CS (24), engineering (16), business (14), nursing (11), data science (9), accounting (3), pharmacy (2), education (2), project mgmt (1), social work (1) |
| `dataQuality: "primary"` | 39 of 83 programs (47%) |
| `dataQuality: "derived"` | **44 of 83 programs (53%)** — i.e. tuition bands and minimum grades that are estimated, not read off a course page |
| Source URL depth | **60 root-only** (`https://www.monash.edu`) vs **4 deep links** to an actual course page, of the 64 literal source strings |
| `lastVerified` | 61 rows at **2026-06-04**, 22 bridged rows at **2026-06-07** — i.e. the whole matchable catalogue was last verified **~2 months ago**, before the 2027 fee/intake cycle |

**The fact layer — richer, better sourced, and mostly *not* wired to the matcher** (`lib/data/source/**`): ~293 `lastVerified` stamps across ~57 modules; a 1,715-line CRICOS directory; 62 CRICOS code records; 21 RMIT programs and 8 non-RMIT university programs each carrying a real course-page URL, per-band IELTS minimums and accrediting bodies; plus the genuinely differentiated material — DHA financial-evidence figures, Genuine Student evidence levels (1,666 lines), source-of-funds rules, refusal-recovery/ART paths, NOC/passport/police/health journeys. Verification dates cluster at 2026-06-05 and 2026-06-07, with 15 records refreshed 2026-07-02 and one stale outlier (`nepal-banks.ts`, 20 records at **2025-01-15** — 19 months old). **[F: measured]**

Two files in that layer carry the header comment **"Fact-only — no scorer reads it; it backs the eventual program/course view"** — so the best-sourced program records in the repo are not the ones the matcher uses. **[F]**

**Honest comparison.** 83 programs against ApplyBoard's 150,000 is **0.055%**. Against Adventus's 70,000+, **0.12%**. **[F]** Any pitch built on catalogue breadth loses on contact with a laptop.

**What is genuinely unmatched:** `source` + `lastVerified` on every data point, and a versioned server-side engine that scores the *visa* dimension separately — `lib/scoring/visa.ts` applies an explicit prior-refusal penalty (−15 one, −35 multiple), gap-year penalties with reason mitigation, and distinguishes the **DHA visa English floor from the course English threshold**, a distinction I found in no competitor product. `lib/scoring/financial.ts` implements the capacity gate. 353 test files back it. **[F: measured]** No product in §2 exposes provenance, and none scores visa outcome.

**Maintenance cost — moat or cost trap?**

The competitors have answered this question in public, and the answer is "cost trap, unless you scope it hard."

- Adventus: currency is maintained by "an experienced and extensive **data entry team**." **[F]** Not an algorithm — headcount.
- ApplyBoard: a **dedicated CX Journey Team** whose job is collecting and implementing program-requirement information, liaising with admissions offices. Company headcount ~1,602 in 2024 (down 17.5% YoY from 1,909 in 2023, after multiple layoff rounds); **~60.8% of staff sit in Finance and Operations** and **~55% of the global workforce is in India**. **[F]** ([reveliolabs.com](https://www.reveliolabs.com/companies/applyboard/employees/), [betakit.com](https://betakit.com/applyboard-lays-off-employees-due-to-policy-changes-across-major-study-destinations/))

**[I]** — the reading. ApplyBoard's shape is a data-operations company with a software front end, staffed in a low-cost location, running at a scale (150k programs) that only works because application commission funds it. It has been shrinking under policy shocks. This is the strongest available evidence that **maintaining broad program-requirements data is a cost trap for anyone who is not monetising the application flow itself.** MeroVisa has no application-commission revenue and no offshore data-ops team.

**Rough burden estimate for MeroVisa. [I], my numbers, treat as an order of magnitude:**

| Scope | One-off build | Steady-state re-verification |
|---|---|---|
| Deepen the *current* corridor to ~40 AU institutions × ~15 programs (600 rows) with real course-page sources | ~250–400 person-hours | ~2 refresh cycles/yr (Feb + Jul intakes) × ~120 h = **~240 h/yr** |
| Add one destination (UK or Canada) at the same depth | ~300–450 h, plus a *new* visa/financial-evidence rule set — the expensive part, since none of the DHA work transfers | **~250 h/yr** |
| Add one source country (India, Nigeria, Vietnam) to an existing destination | ~120–200 h — grade equivalency, banks/funds norms, document journeys | **~100 h/yr** |
| The visa/policy layer alone, current corridor | already built | **~80–120 h/yr** — DHA figures, Ministerial Directions and evidence levels move more than once a year |

**Verdict on cost:** **breadth is a cost trap; depth on the visa layer is a defensible moat.** Program entry requirements are commoditised by two well-funded aggregators giving them away free to agents. Visa-evidence rules per corridor are (a) not aggregated by anyone, (b) changing fast enough that staleness is visible and embarrassing, (c) exactly what MeroVisa's `lastVerified` discipline exists to manage, and (d) the thing that a 65% refusal rate is made of. **[I]**

---

## 6. Ranked data-enabled capabilities

Ranked by (evidence of demand × distance from what competitors already ship). "Evidenced" means I found a party outside MeroVisa asking for it.

| # | Capability | Demand status | Evidence |
|---|---|---|---|
| 1 | **Pre-lodgement visa-refusal risk read per student** — financial capacity, source-of-funds credibility, English visa-floor vs course-threshold, gap justification, prior refusal, provider risk level — with the evidence gap named | **EVIDENCED, strongly.** Universities Australia is asking government for weekly refusal dashboards precisely so providers can "intervene early with extra document checks and GTE coaching"; 32.5% AU refusal, 65% Nepal; ~50% of provider risk rating is refusal-driven; GrowPro died of refusals | ICEF Apr 2026, Mar 2025 **[F]** |
| 2 | **Evidence-completeness read: which of my students is actually submittable, and what single item is blocking each** | **EVIDENCED, indirectly but firmly.** ApplyBoard filters 24% of applications pre-submission and publishes it as a *selling point to institutions*; UK BCA + Agent Quality Framework make agent-sourced evidence the agent's accountability | ApplyBoard **[F]**, ICEF Jul 2026 **[F]** |
| 3 | **Cross-caseload queries — "which of my 40 students clears X", "who is closest to submittable"** | **PLAUSIBLE-BUT-UNEVIDENCED.** Nobody I found asks for it. **[I]** but it is close to free once #1 and #2 exist and the case model is in place | — |
| 4 | **Provenance-backed answers — every requirement carries its source URL and verification date, shown to the student** | **PLAUSIBLE-BUT-UNEVIDENCED as a purchase driver**, but the *trust deficit it addresses* is documented: 24% of agent-using students believed their agent was biased; >30% of surveyed staff said agents push toward the highest commission | **[F]** for the trust deficit, **[I]** for the link to willingness-to-pay |
| 5 | **Per-program requirement checklists auto-generated** | **PARTIALLY EVIDENCED but CONTESTED.** All four Nepali CRMs already ship document checklists per application; NC-CRM lists "document checklists per application" as a stock feature | **[F]** — do not treat this as differentiated |
| 6 | **Instant evidence-backed shortlisting** | **EVIDENCED as a need, ALREADY SERVED.** Adventus Grade Match and ApplyBoard eligibility do it over 70k–150k programs vs MeroVisa's 83 | **[F]** — **do not build this as the wedge** |
| 7 | **Reducing wasted applications** | **EVIDENCED but captured by the aggregators.** ApplyBoard's ~95% acceptance claim and Adventus's 90% application-success claim are exactly this pitch, already made | **[M]** vendor figures |

**The ranking's message: capabilities 6 and 5 — the ones the founder's thesis leads with — are the two that are already served. Capabilities 1 and 2 are the ones with live, dated, third-party demand and no incumbent.**

---

## 7. Recommended go-to-market shape

**Recommendation: a paid ADD-ON layer that sits alongside whatever CRM the consultancy already runs. Not a replacement, not a pure data subscription.**

Reasoning:

- **Replacement is unwinnable and unnecessary.** The incumbents' surface area is unified inbox across WhatsApp/Messenger/Instagram/Telegram, booking widgets, commission and clawback tracking, payroll, attendance, classroom/LMS for IELTS-PTE prep, Google review harvesting, multi-branch controls. **[F]** MeroVisa would have to rebuild all of it to displace a working system, and none of it is where its advantage lies. Switching cost is the incumbents' moat and it is a good one.
- **A pure data subscription underprices the asset and exposes the weakest flank.** Sold as "program data", MeroVisa is 83 rows against 150,000 and loses instantly. **[I]**
- **An add-on prices the *judgement*, not the rows.** The unit sold is "this student, this program, this corridor — will the visa hold, and what is missing," delivered inside the case workspace already built (`app/(app)/workspace/…`, Stages 1–3 done).

**Price anchoring, from the incumbents' own public pricing [F]:**

| Product | Price |
|---|---|
| OSOM | £6.00–£6.84 / user / month (5- and 10-user packages) |
| Cosmic CRM | NPR 2,250–6,500 / month for 3–10 users ≈ **NPR 650–750 / user / month (~USD 5)**; **add-ons priced separately at NPR 300–600/month each** (reports suite, WhatsApp, accounts, social inboxes) |
| NC-CRM | Positions itself explicitly against add-on pricing: "one price, whole stack… everyone else sells these separately" |

**[I]** Cosmic's structure is the template and the opening: this market already buys NPR 300–600/month modules bolted onto a base plan. A refusal-risk layer at NPR 1,500–3,000/month per branch — 3–5× a normal add-on, justified because it protects revenue rather than adding a screen — is a credible first price. Anchor it against the loss: at a 65% refusal rate, a single avoided refusal is worth more than a year of the subscription.

**One structural warning. [F] on the mechanism, [I] on the implication:** Cosmic CRM meters its AI features as "AI actions" (100 / 500 / 1,500 per organisation per month, with top-ups at NPR 250–400). Metering by inference call, rather than by seat or by query, is what you do when each answer costs you an LLM round trip — i.e. the "AI University Finder" is very likely *generating* eligibility judgements per query rather than *looking them up* in a maintained dataset. If so, its answers are unsourced, undated, and cannot be audited — which is precisely the failure mode MeroVisa's `source`/`lastVerified` discipline exists to prevent, and it is the sharpest available demo contrast. **This is a hypothesis to test in a live demo, not a fact.**

**Positioning line to test — not "your CRM cannot tell you whether this student will get in" (a Cosmic or Adventus user will disprove it in one click), but:**

> "Your platform tells you whether the university will say yes. One in three of those students is refused a visa anyway — two in three from Nepal. We tell you which ones, and what is missing, before you lodge."

---

## 8. What desk research could not settle

These need a live consultancy. Ranked by how much each would change the build.

1. **Whether counsellors actually distrust their existing eligibility tool.** Cosmic and Adventus users can already shortlist. Do they *believe* the answer? Does anyone re-check it against the university site? If they do, that behaviour is the wedge and it is directly observable in an hour of shoulder-surfing. If they don't, provenance has no buyer.
2. **Whether the consultancy or the student bears refusal cost.** The entire add-on pricing case rests on the consultancy carrying real economic exposure to a refusal. If fees are collected up front and non-refundable, refusal is the student's problem and the willingness-to-pay collapses. NC-CRM's "clawbacks tracked properly — visa refusal, withdrawal, deferral, refund, or no-show" **[F]** implies commission clawback exposure exists, but not its size. **This is the single highest-leverage unknown in this report.**
3. **Whether Cosmic's AI University Finder is retrieval or generation** (§7). Twenty minutes on a demo call: ask it about an obscure program, then check the university page.
4. **How a consultancy's institution list overlaps aggregator catalogues.** If a typical Kathmandu or Hyderabad agency's direct contracts are mostly outside ApplyBoard/Adventus, the coverage gap is a second wedge. If they are mostly inside, it isn't.
5. **Who inside the org would use it.** The counsellor (senior, sales-targeted, NPR 20–30k/month) or the documentation officer (junior, procedural)? Different buyer, different UI, different price.
6. **Whether the 2026 Nepal 65% figure is corridor-structural or a policy spike.** Building a business on a temporary refusal peak is a real risk; a longer DHA series would settle it.
7. **What agents pay per student today for visa-file review** by a MARA agent or in-house specialist — the true price comparator for capability #1, unobtainable from public sources.

---

## Appendix — repo measurements

All figures in §5 were measured against this worktree at `ede20ee`, not taken from documentation:

- `lib/programs/seed.ts` — `SEED_UNIVERSITIES` (15), `SEED_PROGRAMS` (83 rows, counted on `universityId:`); `dataQuality` split via scoped `awk` over each array; source-URL depth by slash count; `lastVerified` via the `VERIFIED` / `FACT_VERIFIED` constants.
- `lib/matches/compute.ts` — confirms the matcher consumes `lib/programs/types`, i.e. the seed catalogue, not the `lib/data/source/**` fact layer.
- `lib/data/**` — 57 modules, ~293 `lastVerified` stamps; date histogram: 163 @ 2026-06-07, 77 @ 2026-06-05, 20 @ 2025-01-15 (all in `nepal-banks.ts`), 15 @ 2026-07-02, remainder scattered.
- `lib/scoring/` — 1,048 lines across 16 modules; `visa.ts` (155) and `financial.ts` (149) carry the visa-outcome logic; 353 test files repo-wide.
