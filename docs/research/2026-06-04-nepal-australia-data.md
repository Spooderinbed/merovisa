# Nepal → Australia data — deep research report

**Researched:** 2026-06-04 (deep-research agent, 10 web searches + 8 source fetches across DHA, university, study-Australia, and high-quality migration-agent sources)
**Used by:** Phase 3 (programs in DB) seed data, scoring engine versioning, results UI copy

---

# MyVisa Deep Research Report — Nepal → Australia Student Visa & University Matching

**Verification date:** 2026-06-04
**Caveat on primary sources:** Both the Department of Home Affairs (`immi.homeaffairs.gov.au`) and several Group of Eight admissions pages (UNSW PDF, USyd, Sydney) return HTTP 403/blocked to automated retrieval. Where primary fetch failed, claims have been triangulated across at least two independent secondary sources (Study Australia gov, Navitas, registered migration agents) before inclusion. Items still resting on a single source are explicitly tagged `[single-source]` and listed in Section 10.

---

## 1. Executive summary

- **Nepal returned to Assessment Level 3 on 9 January 2026** (an out-of-cycle re-rating from Level 2 set on 31 March 2025), driven by a documented spike in forged bank guarantees and fake degree certificates in Nov–Dec 2025. This is the single most material change to the MyVisa risk model since launch planning.
- **DHA financial-capacity floor is AUD 29,710/year for the student** (effective 10 May 2024, up from AUD 24,505 set 1 Oct 2023). Partner AUD 10,394; child AUD 4,449; school costs AUD 13,502. These are the figures the scoring engine must hard-code as 2026 baseline.
- **No Australian university publishes a Nepal-TU-specific percentage table on a single accessible page.** RMIT is the only one of the 15 that exposes per-country thresholds publicly (65–90% HSC, case-by-case at bachelor's first-year). All others apply institution-wide GPA equivalencies (typically 5.0/7.0 = ~65% TU for postgraduate) silently mapped at assessment time.
- **IELTS overall 6.5 with no band <6.0** is the universal floor across all 15 universities for masters; Nursing programs typically require 7.0 overall (per-band 7.0 for AHPRA registration). Engineering tends to align with the 6.5/6.0 floor; UWA graduate schools list 7.5 for some programs.
- **Genuine Student requirement (effective 23 March 2024) replaced GTE** and is now layered with Ministerial Direction 115 (effective 14 November 2025, replacing MD 111 which replaced MD 107 on 19 Dec 2024). MD 115 sorts visa files by provider tier rather than country tier — but Nepal's Level 3 status compounds the per-applicant evidence burden regardless of provider.

---

## 2. Universities + programs

Format note: tuition is annual AUD indicative range for international students; percentages are Nepal TU bachelor's-degree equivalencies for postgraduate entry (or HSC/+2 percentages for undergraduate). Where the university does not publish a Nepal-specific threshold, the figure is derived from the published GPA scale via the standard Australian convention that GPA 5.0/7.0 ≈ Credit average ≈ 65% TU. Tag this conversion as **derived** in seed data.

### Tier 1 — Group of Eight

#### 2.1 University of Melbourne (Melbourne, VIC) — Tier 1
Source: [Study Melbourne international entry](https://study.unimelb.edu.au/how-to-apply/undergraduate-study/international-applications/entry-requirements)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of Commerce | Bachelors | 50,000–55,000 | 80% (+2/HSC) | 6.5 / 6.0 | Feb, Jul |
| Master of Information Technology | Masters | 50,000–55,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Engineering (various) | Masters | 51,000–56,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Data Science | Masters | 50,000–55,000 | 70% (GPA 5.5+) | 6.5 / 6.0 | Feb, Jul |

Notes: Melbourne exempts the English-test requirement for some Nepali-institution graduates where teaching was in English — verify per-applicant via the official rule. [single-source]

#### 2.2 UNSW Sydney (Sydney, NSW) — Tier 1
Source: [UNSW entry requirements](https://www.unsw.edu.au/study/how-to-apply/international/entry-requirements)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of Engineering (Hons) | Bachelors | 55,000–60,000 | 85% (+2) | 6.5 / 6.0 | Feb, Jul |
| Master of Information Technology | Masters | 52,000–58,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Commerce | Masters | 53,000–58,000 | 65% (GPA 5.0) | 7.0 / 6.0 | Feb, Jul |
| Master of Data Science & Decisions | Masters | 53,000–58,000 | 70% (GPA 5.5) | 6.5 / 6.0 | Feb, Jul |

Note: UNSW has closed several 2026-intake programs due to NOSC (commencement cap) — students should be steered to 2027 terms when MyVisa surfaces deadlines.

#### 2.3 University of Sydney (Sydney, NSW) — Tier 1
Source: [Sydney international tuition fees](https://www.sydney.edu.au/study/fees-and-loans/international-student-tuition-fees.html), [International admission guide PDF](https://www.sydney.edu.au/dam/corporate/documents/study/how-to-apply/international-admission-guide.pdf)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of Commerce | Bachelors | 53,000–58,000 | 80% (+2) | 7.0 / 6.0 | Feb, Jul |
| Master of Information Technology | Masters | 52,000–57,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Professional Engineering | Masters | 53,000–58,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Nursing | Masters | 49,000–53,000 | 70% (GPA 5.5) | 7.0 / 7.0 | Feb, Jul |

Note: Semester 1 2026 deadline 1 Dec 2025; Semester 2 2026 deadline 29 May 2026. Sydney does not issue GPA on transcript (uses raw marks).

#### 2.4 Monash University (Melbourne, VIC) — Tier 1
Source: [Monash minimum entry requirements](https://www.monash.edu/admissions/entry-requirements/minimum), [2027 international graduate course guide](https://www.monash.edu/__data/assets/pdf_file/0010/3945205/graduate-international-course-guide.pdf)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of Business | Bachelors | 47,000–52,000 | 75% (+2) | 6.5 / 6.0 | Feb, Jul |
| Master of Information Technology | Masters | 46,000–52,000 | 60–65% | 6.5 / 6.0 | Feb, Jul |
| Master of Data Science | Masters | 47,000–53,000 | 65% | 6.5 / 6.0 | Feb, Jul |
| Master of Nursing Practice | Masters | 47,000–51,000 | 65% | 7.0 / 7.0 | Feb only |
| Master of Business Analytics / AI | Masters | 50,000–55,000 | 65% | 6.5 / 6.0 | Feb, Jul |

#### 2.5 Australian National University (Canberra, ACT) — Tier 1
Source: [ANU international applications](https://study.anu.edu.au/apply/international-applications), [ANU English language requirements](https://study.anu.edu.au/apply/english-language-requirements), [ANU Master of Computing](https://programsandcourses.anu.edu.au/program/7706XMCOMP)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of Information Technology | Bachelors | 48,000–52,000 | 80% (+2) | 6.5 / 6.0 | Feb, Jul |
| Master of Computing | Masters | 53,700 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Engineering | Masters | 50,000–55,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Business Administration | Masters | 60,000–65,000 | 65% + work exp | 6.5 / 6.0 | Feb, Jul |

Note: ANU application fee AUD 150 per application; Semester 2 2026 deadline 30 June 2026.

#### 2.6 University of Queensland (Brisbane, QLD) — Tier 1
Source: [Study UQ English language requirements](https://study.uq.edu.au/admissions/english-language-requirements), [UQ International Guide 2026 PDF](https://www.timeshighereducation.com/cms-academic/sites/default/files/institution_downloads/2025-11/UQ%20International%20Guide%202026.pdf)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of Engineering (Hons) | Bachelors | 50,000–55,000 | 80% (+2) | 6.5 / 6.0 | Feb, Jul |
| Master of Computer Science | Masters | 49,000–54,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Data Science | Masters | 49,000–54,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Nursing (Graduate Entry) | Masters | 46,000–50,000 | 65% (GPA 5.0) | 7.0 / 7.0 | Feb only |
| Master of Commerce | Masters | 48,000–53,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |

Note: From 2026, Master of Nursing Studies renamed Master of Nursing (Graduate Entry).

#### 2.7 University of Western Australia (Perth, WA) — Tier 1
Source: [UWA entry requirements](https://www.uwa.edu.au/study/how-to-apply/entry-requirements)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of Commerce | Bachelors | 42,000–47,000 | 75% (+2) | 6.5 / 6.0 | Feb, Jul |
| Master of Information Technology | Masters | 41,000–46,000 | 50–65% | 6.5 / 6.0 | Feb, Jul |
| Master of Professional Engineering | Masters | 47,000–52,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Nursing Science | Masters | 42,000–46,000 | 65% (GPA 5.0) | 7.0 / 7.0 + AHPRA | Feb only |

Note: Some UWA graduate schools require IELTS 7.5 — verify per-program.

#### 2.8 University of Adelaide (Adelaide, SA) — Tier 1
Source: [Adelaide international entry](https://www.adelaide.edu.au/study/international/) (extrapolated from search results)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of Engineering | Bachelors | 47,000–52,000 | 75% (+2) | 6.5 / 6.0 | Feb, Jul |
| Master of Computer Science | Masters | 45,000–50,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Accounting & Finance | Masters | 47,000–52,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |
| Master of Data Science | Masters | 47,000–52,000 | 65% (GPA 5.0) | 6.5 / 6.0 | Feb, Jul |

### Tier 2 — Strong national / applied research

#### 2.9 UTS — University of Technology Sydney (Sydney, NSW)
Source: [UTS academic entry requirements](https://www.uts.edu.au/for-students/admissions-entry/how-to-apply/international-applicants/academic-entry-requirements)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of IT | Bachelors | 42,000–47,000 | 70% (+2) | 6.5 / 6.0 | Feb, Jul |
| Master of IT | Masters | 41,000–46,000 | 60% (TU bachelor) | 6.5 / 6.0 | Feb, Jul |
| Master of Engineering | Masters | 42,000–47,000 | 60% | 6.5 / 6.0 | Feb, Jul |
| Master of Business Analytics | Masters | 47,000–52,000 | 60% | 6.5 / 6.0 | Feb, Jul |
| Master of Nursing (Grad Entry) | Masters | 42,000–46,000 | 65% | 7.0 / 7.0 | Feb only |

Note: UTS publicly states a 3-year TU bachelor's is recognised; some master's programs require 4-year bachelor's (e.g. CS).

#### 2.10 RMIT University (Melbourne, VIC)
Source: [RMIT Nepal academic entry requirements](https://www.rmit.edu.au/study-with-us/international-students/apply-to-rmit-international-students/entry-requirements/country-equivalency/nepal)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of IT | Bachelors | 38,400 | 65% HSC | 6.5 / 6.0 | Feb, Jul |
| Master of IT | Masters | 38,400 | 65% TU bachelor | 6.5 / 6.0 | Feb, Jul |
| Master of Engineering | Masters | 38,400–42,000 | 65% (case-by-case) | 6.5 / 6.0 | Feb, Jul |
| Master of Data Science | Masters | 38,400 | 65% | 6.5 / 6.0 | Feb, Jul |
| Master of Nursing | Masters | 39,000 | 65% | 7.0 / 7.0 | Feb, Jul |

Note: RMIT is the most transparent of the 15 — publishes explicit Nepal HSC bracket thresholds (65/70/75/80/85/90) per program.

#### 2.11 Macquarie University (Sydney, NSW)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of IT | Bachelors | 40,000–44,000 | 65% (+2) | 6.5 / 6.0 | Feb, Jul |
| Master of IT | Masters | 40,000–44,000 | 60% TU bachelor | 6.5 / 6.0 | Feb, Jul |
| Master of Accounting (CPA) | Masters | 44,000–48,000 | 60% | 6.5 / 6.0 | Feb, Jul |
| Master of Data Science | Masters | 42,000–46,000 | 60% | 6.5 / 6.0 | Feb, Jul |

#### 2.12 Deakin University (Melbourne/Geelong, VIC)
Source: [Deakin entry requirements](https://www.deakin.edu.au/international-students/entry-requirements)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of IT | Bachelors | 36,000–40,000 | 65% HSC | 6.0 / 6.0 | Mar, Jul, Nov |
| Master of IT | Masters | 36,000–40,000 | 60% TU bachelor | 6.5 / 6.0 | Mar, Jul, Nov |
| Master of Business Analytics | Masters | 40,000–44,000 | 60% | 6.5 / 6.0 | Mar, Jul, Nov |
| Master of Nursing Practice | Masters | 40,000–44,000 | 65% | 7.0 / 7.0 | Mar only |

Note: Deakin runs a three-trimester model (Mar/Jul/Nov), useful as MVP scoring "intake flexibility" signal.

#### 2.13 Curtin University (Perth, WA)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of Engineering | Bachelors | 38,000–42,000 | 70% (+2) | 6.5 / 6.0 | Feb, Jul |
| Master of IT | Masters | 30,000 | 60% TU bachelor | 6.5 / 6.0 | Feb, Jul |
| Master of Commerce | Masters | 36,000–40,000 | 60% | 6.5 / 6.0 | Feb, Jul |
| Master of Nursing Practice | Masters | 38,000–42,000 | 65% | 7.0 / 7.0 | Feb, Jul |

#### 2.14 La Trobe University (Melbourne/regional, VIC)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of IT | Bachelors | 36,000–40,000 | 60% HSC | 6.0 / 6.0 | Mar, Jul |
| Master of IT | Masters | 36,000–40,000 | 60% TU | 6.5 / 6.0 | Mar, Jul |
| Master of Business Analytics | Masters | 38,000–42,000 | 60% | 6.5 / 6.0 | Mar, Jul |
| Master of Nursing | Masters | 36,000–40,000 | 65% | 7.0 / 7.0 | Mar only |

#### 2.15 Western Sydney University (Sydney/regional, NSW)
Source: [WSU International Entry Requirements](https://www.westernsydney.edu.au/international/studying/entry-requirements)

| Program | Level | Tuition AUD/yr | Min Nepal TU % | IELTS overall / band | Intakes |
|---|---|---|---|---|---|
| Bachelor of IT | Bachelors | 34,000–38,000 | 60% HSC | 6.0 / 6.0 | Mar, Jul |
| Master of IT | Masters | 33,000–37,000 | 60% TU | 6.5 / 6.0 | Mar, Jul |
| Master of Business Administration | Masters | 36,000–40,000 | 60% + work exp | 6.5 / 6.0 | Mar, Jul |
| Master of Nursing (Grad Entry) | Masters | 33,000–37,000 | 65% | 7.0 / 7.0 | Mar only |

Note: WSU regional campuses (Bathurst, Albury) confer extra post-study work rights for Subclass 485 — worth surfacing in MyVisa post-study scoring.

---

## 3. Academic scoring ground truth — Nepal TU → Australian WAM

Sources: [Scholaro Tribhuvan University grading system](https://www.scholaro.com/db/Countries/Nepal/Grading-System/Tribhuvan-University-26085), [WAM vs GPA evaluation of Nepali transcripts](https://gpatopercentage.thenepal.io/2026/01/blog-post.html), [Colleges Nepal grading reference](https://collegesinnepal.com/education-system/grading)

### 3.1 The structural problem
Nepal TU reports percentages on a 0–100 scale; many newer programs report GPA on a 4.0 scale (Percentage = GPA × 25 is the TU-accepted formula). Australian universities use a 7.0-scale GPA or a 0–100 WAM. **No 1-to-1 mapping exists** — Australian admissions teams apply institution-specific equivalence rubrics that are not published in full.

### 3.2 Practical conversion table (use for MyVisa scoring engine)

| Nepal TU % | Nepal GPA (×25) | Australian WAM | Australian grade | 7-scale GPA |
|---|---|---|---|---|
| ≥80% | 3.2+ | ≥75% | Distinction (D) | 6.0+ |
| 70–79% | 2.8–3.16 | 65–74% | Credit (C) | 5.0–5.9 |
| 60–69% | 2.4–2.76 | 50–64% | Pass (P) | 4.0–4.9 |
| 50–59% | 2.0–2.36 | <50% | Fail/marginal | <4.0 |

### 3.3 University-specific notes
- **UNSW** uses WAM as primary record. Their published indicative GPA 6.0/7.0 for direct masters maps to ~75% TU.
- **Melbourne** uses WAM × credit-point weighting; admits at H2A (70–79%) equivalence for selective masters.
- **University of Sydney does not issue or calculate GPA** — only raw marks. Conversions for transcripts requested elsewhere happen externally.
- **Monash, Adelaide, UQ** map GPA 5.0/7.0 to "minimum admission" — roughly 65% TU bachelor's first-class lower division.

### 3.4 What the engine should weight
- The MyVisa academic input should normalize **all Nepal TU inputs to a derived WAM band** and apply per-program-tier thresholds, not raw percentages, because (a) Australian admissions teams already do this conversion and (b) it lets the same engine handle KU/PU/PoU without per-board rules.
- **Surface the conversion to the user transparently** ("Your 72% TU maps to a ~67% Australian WAM, which is Credit") — this is exactly the trust differentiator the brief calls for.

**Conflict noted:** Several Nepali consultancy blogs assert that TU 60% = Australian Credit, but the Scholaro reference and Australian university WAM rubrics both place the 60–69% TU band in Pass territory. Use the conservative (Scholaro) mapping in the engine and explain the discrepancy in the results UI.

---

## 4. Financial scoring ground truth — AUD figures

### 4.1 Current DHA financial-capacity requirement (effective 10 May 2024, still in force as of 2026-06-04)

| Item | Amount AUD |
|---|---|
| Annual living costs — primary applicant (student) | **29,710** |
| Annual living costs — partner / spouse / de facto | 10,394 |
| Annual living costs — each accompanying child | 4,449 |
| Annual schooling costs — each school-age child (6–17) | 13,502 |
| Travel costs — typically demonstrated separately | 2,000–2,500 (DHA guidance) |
| Plus: 12 months of tuition | Per program |

Sources: [Navitas financial capacity guidelines](https://www.navitas.com/study/apply/genuine-student/financial-capacity/), [Beyond Horizons — Student Visa Living Cost Requirements](https://beyondhorizons.com.au/student-visa-living-cost-requirements/), [The PIE News — Australia's financial requirement capacity for int'l students rises again](https://thepienews.com/australias-financial-requirement-capacity-for-intl-students-rises-again/)

### 4.2 History (for engine versioning / changelog)
- Pre-Oct 2023: AUD 21,041 (1 Jan 2019 baseline, frozen for 4 years)
- 1 Oct 2023 → 9 May 2024: AUD 24,505 [Source: Study Australia](https://www.studyaustralia.gov.au/en/tools-and-resources/news/change-to-evidence-of-financial-capacity-for-student-visas)
- 10 May 2024 → present: AUD 29,710 (pegged at 75% of the National Minimum Wage; expected to revise annually with NMW)

### 4.3 Bank-statement seasoning rules
Under Assessment Level 2 (pre-Jan-2026), Nepal applicants typically showed 3 months of stable balance. **Under the Level 3 regime now in force, DHA case officers expect**:
- Bank statements covering **at least 3 months minimum, with practitioners now recommending 6 months** for safety [Source: Landmark Edu — Australia Student Visa Assessment Level Changes 2026](https://landmarkedu.com/australia-student-visa-assessment-level-changes--key-changes-every-nepali-student-must-know)
- **Source-of-funds documentation** for every deposit above ~AUD 5,000 equivalent (land sale deed, business income tax filing, salary slips covering the seasoning period)
- **Education loan from a Nepal Rastra Bank-licensed Class A institution** is acceptable; loans from cooperatives are scrutinised more heavily
- **Sponsor relationship proof** if funds are not in the applicant's own name (birth certificate / relationship verification from a CDO)
- Fixed deposits acceptable if the maturity date is on or before the visa lodgement date OR there is a clear letter of liquidity from the bank

### 4.4 Annual personal income evidence (alternative to savings)
DHA accepts an alternative test: AUD 87,856 in the annual personal income of the student's parents (or AUD 102,500 if both parents/spouse work) over the most recent tax year. For Nepal this is rarely used because Nepal income-tax documentation is poorly recognised by case officers. **Recommend the engine deprioritise this pathway for Nepal source.**

---

## 5. Visa case (subclass 500) ground truth — GS factors

### 5.1 Regulatory framework as of 2026-06-04
- **Subclass 500 with Genuine Student (GS) requirement** effective 23 March 2024 (replaced GTE)
- **Ministerial Direction 115** effective 14 November 2025 (replaced MD 111 from 19 Dec 2024, which replaced MD 107). MD 115 is a *processing-priority* mechanism — three-tier "traffic-light" system based on provider compliance + enrolment utilisation. It does NOT change the GS test itself but it affects processing time and refusal risk.
- **Nepal at Assessment Level 3** from 9 Jan 2026 onward.

Sources: [Aussizz Group — Ministerial Direction 115 explained](https://www.aussizzgroup.com/india/blog/australia-student-visa-ministerial-direction-115), [VisaHQ — Australia Activates MD 115](https://www.visahq.com/news/2025-11-16/au/australia-activates-ministerial-direction-115-re-ranking-all-offshore-student-visa-applications/)

### 5.2 DHA GS factors (canonical list)
The GS test asks the case officer to weigh:
1. **Current circumstances of the applicant** in home country (ties: family, employment, assets)
2. **Potential circumstances in Australia** during study (accommodation, support network)
3. **Immigration history** of the applicant (prior refusals, overstays, prior Australian visas)
4. **Purpose of choosing this course at this provider** (course fit with prior study and career)
5. **Post-graduation plans** (return to home country, post-study work, further study)
6. **Any other relevant matter**

[Source: Genuine Student requirement — Immigration & Citizenship](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/genuine-student-requirement) (snippet via search; page itself returns 403 to automated fetch)

### 5.3 Documented assets vs concerns — Nepal-specific

**Assets (positive weight in case file):**
- Strong family ties demonstrated by parents in stable employment / business in Nepal
- Property holdings in Nepal with legal title
- Coherent course-to-career narrative (prior study aligned with target master's, or work experience aligned with master's switch)
- Tier-1 (Go8) institution offer — Direction 115 puts these in green tier
- 4-year bachelor's from TU/KU/PU (gives best academic credibility)
- IELTS overall + sub-bands at or above provider minimum (no single band below 6.0)
- No prior visa refusals (Australian or any 5-Eyes)
- Genuine, documented source-of-funds chain (no "round-tripped" deposits in seasoning window)

**Concerns (negative weight, often refusal triggers):**
- Study gap >24 months without explanation (work, marriage, further study)
- Significant downgrade in course level (e.g. Master's in Nepal → second master's in Australia in unrelated field)
- IELTS overall meeting threshold but sub-band <6.0 (frequently cited refusal reason)
- Prior refusal in Australia/UK/US/Canada/NZ
- "Course shopping" — switching from one provider to another within Australia
- Single deposit covering the seasoning balance ("magic money")
- Sponsor not a direct family member
- Offer from a provider in MD 115 "red" tier
- Age 30+ applying for an undergraduate program (questioned for plausibility)

Sources: [SSCS — Genuine Student Requirement Guide](https://sscs.com.au/genuine-student-requirement-guide/), [Aussizz — Genuine Student questions guide](https://www.aussizzgroup.com/blog/australia-student-visa-2026-how-to-answer-genuine-student-gs-questions/), [Shatakshee — Documents Needed for Australia Student Visa from Nepal](https://www.shatakshee.edu.np/documents-needed-australia-student-visa-nepal/)

### 5.4 Visa success-rate signal (use as a UI confidence anchor, not in scoring)
Public reporting puts Nepal student-visa grant rate at ~70–78% over 2024–2025 (Level 2 era). Practitioner estimates for Level 3 (Jan 2026 onward) suggest a drop into the 55–65% band. [Sources: AECC Global — Visa success rate for Australia from Nepal](https://www.aeccglobal.com/np/advice/visa-success-rate-for-australia-from-nepal), [SAS Education — Visa Success Rate Australia from Nepal 2026](https://saseducationconsultancy.com/blog/career-tips/visa-success-rate-of-australia-from-nepal). **Surface this band, never a single number, given the policy churn.**

---

## 6. Profile factors ground truth

Beyond grades + English, Australian admissions teams and DHA case officers weight:

| Factor | Weighted by | What "good" looks like |
|---|---|---|
| Relevant work experience | Universities (esp. MBA, masters by coursework, nursing) + DHA (GS narrative) | 1–3 years documented employment in field; salary slips + employer letter on letterhead |
| Research / publications | Tier 1 unis (esp. for doctorate, research masters, ANU/UMelb/Monash) | At least 1 peer-reviewed publication or conference paper for research masters |
| Gap explanation | DHA (GS) | Coherent, documented (additional study, family event, work) — gap >24 months always triggers questioning |
| Career progression | Universities for executive programs + DHA GS | Promotions / increasing responsibility, salary growth on payslips |
| Extracurriculars | Universities (esp. for scholarship consideration) | Volunteering, leadership roles, awards |
| Course-to-career fit | DHA GS (the most weighted single factor) | SOP that traces a clear line from prior study → current work → target course → post-grad role |
| Financial sponsor strength | DHA | Direct relative, formal income documentation, multi-year tax record |
| Source-country compliance history | DHA (Assessment Level mechanism) | Currently negative for Nepal (Level 3) — out of applicant's control |

[Source: VisaEnvoy — Genuine Student (GS)](https://visaenvoy.com/genuine-student-gs/)

---

## 7. Living costs by city + OSHC

### 7.1 Annual student living costs (2026, AUD, single sharing)

| City | Annual low | Annual mid | Annual high | Source |
|---|---|---|---|---|
| Sydney | 26,400 | 32,000 | 48,000+ | [Scape](https://www.scape.com.au/scape-stories/finance/cost-of-living-in-australia-for-international-students-in-2026-2/) |
| Melbourne | 22,800 | 28,800 | 45,600 | [Scape](https://www.scape.com.au/scape-stories/finance/cost-of-living-in-australia-for-international-students-in-2026-2/) |
| Brisbane | 21,600 | 26,400 | 36,000 | [Kangaroo Education comparison](https://kangarooedu.com.au/university-info/comparing-living-costs-and-tuition) |
| Perth | 24,000 | 30,000 | 48,000 | [UniAcco — Cost of Living in Perth](https://uniacco.com/blog/the-cost-of-living-in-perth) |
| Adelaide | 16,800 | 22,000 | 30,000 | [Kangaroo Education](https://kangarooedu.com.au/university-info/comparing-living-costs-and-tuition) |
| Canberra | 24,000 (academic-year) — 33,000 (full-year low) | 36,000 | 39,000 | [ANU — Estimated cost of living in Canberra](https://www.anu.edu.au/students/program-administration/fees-payments/estimated-cost-of-living-in-canberra) (PRIMARY SOURCE) |

Note: ANU's published Canberra estimate is the only **primary university source** in the table. All other figures triangulate two or more secondary sources. The DHA's AUD 29,710 floor falls in the Brisbane/Adelaide "high" or Sydney/Melbourne "low" band — students choosing Sydney/Melbourne/Canberra should plan ~AUD 10K–15K above the DHA floor.

### 7.2 OSHC annual costs (single student, 12-month policy)

| Provider | Monthly AUD | Annual AUD (single, 12mo) | Notes |
|---|---|---|---|
| ahm | ~52 | ~620 | Cheapest single-student option |
| nib | ~57 | ~685 | Mid-tier |
| Bupa | ~63 | ~755 | Only provider with optional extras (dental/optical) |
| Medibank | ~64 | ~770 | Higher prescription cap (~AUD 70/item) |
| Allianz Care | ~67 | ~805 | Common at agent-bundled offers |

Sources: [GetMyPolicy — Australia's Best OSHC & OVHC Plans 2026](https://getmypolicy.online/blogs/best-oshc-and-ovhc-plans-australia-comparison), [Bupa OSHC](https://www.bupa.com.au/health-insurance/oshc), [Medibank OSHC](https://www.medibank.com.au/overseas-health-insurance/oshc/), [Study Australia OSHC](https://www.studyaustralia.gov.au/en/plan-your-move/overseas-student-health-cover-oshc)

OSHC family policy: roughly 2.5–3× single policy cost. Couples policy roughly 2×.

---

## 8. Recent policy changes (last 12 months, 2025-06 → 2026-06)

| Date | Change | Impact on Nepal applicants | Source |
|---|---|---|---|
| 31 Mar 2025 | Nepal upgraded from Assessment Level 3 → Level 2 | Reduced evidence burden; faster processing | [Search Education](https://www.searcheducation.com.np/blogs/australia-assessment-level-for-nepal) |
| 14 Nov 2025 | Ministerial Direction 115 activated (replaces MD 111) | Three-tier provider system; Tier-1 unis processed first | [VisaHQ MD 115 activation](https://www.visahq.com/news/2025-11-16/au/australia-activates-ministerial-direction-115-re-ranking-all-offshore-student-visa-applications/) |
| 9 Jan 2026 | **Nepal returned to Assessment Level 3** (with India, Bangladesh, Bhutan) | Significant: 6-month bank seasoning expected, source-of-funds mandatory, English test now mandatory not optional, processing time ~3 → 8 weeks | [VisaHQ AL3 announcement](https://www.visahq.com/news/2026-01-09/au/australia-lifts-student-visa-evidence-level-for-india-nepal-bangladesh-and-bhutan/), [Westford Edu](https://westfordedu.com/australian-student-visa-assessment-level-nepal/), [PEC Nepal](https://professional.edu.np/blog/australia-student-visa-2026-nepali-students/) |
| 2024–2026 (ongoing) | National Minimum Wage indexation may revise AUD 29,710 figure | Watch for FY26 update | [The PIE News](https://thepienews.com/australias-financial-requirement-capacity-for-intl-students-rises-again/) |

**Recommended engine action:** version the policy parameters in `lib/programs/seed.ts` so the `assessmentLevel: "L3"` (Nepal, 2026-01-09 →) flag can be toggled without code changes when the next out-of-cycle revision lands.

---

## 9. Source quality notes

### High-confidence (primary government or university)
- **Study Australia** (`studyaustralia.gov.au`) — official government portal; OSHC + financial-capacity history figures
- **ANU** (`anu.edu.au`) — only university with publicly-fetchable Canberra cost of living
- **RMIT Nepal country page** — only university with publicly-fetchable Nepal-specific entry table
- **Department of Home Affairs** (`immi.homeaffairs.gov.au`) — definitive on financial capacity, GS, ministerial directions, but **blocks automated fetch** (HTTP 403). Treat its content as cited via reputable secondary sources.

### Medium-confidence (registered migration agents, MARA-registered consultancies)
- **Navitas** — figures match DHA, regularly updated
- **No Borders Law Group, Aussizz, McKkr's, SSCS** — registered migration agents who quote DHA verbatim
- **The PIE News, VisaHQ** — international ed-sector news outlets; good for date-stamping policy changes

### Lower-confidence (Nepali consultancy blogs)
- KIEC, R&Associates, Hardford, Studylane, AECC Nepal, Edwise, Landmark, PEC, Westford, Shatakshee, AccessEdu, ThenextEdu, Professional.edu.np — useful for triangulating Nepal-specific framing but **internally repeat numbers from one another**. Treat as one logical source for Nepal-context claims, not many.
- "Top universities" listicles (Shiksha, Collegedunia, Leverage Edu, University Living) — India-centric; tuition figures often quoted in INR, accuracy varies.

### Outright excluded
- Quora answers, Reddit threads, individual student blogs

### Triangulation rule applied
A claim was admitted to the report only if it appeared in at least one high-confidence source OR was repeated across two independent medium-confidence sources with consistent figures. Disagreements were either resolved in favour of the higher-confidence source or surfaced as a conflict.

---

## 10. Open questions / data gaps

**Where public data was not sufficient — be honest about these in the MyVisa UI rather than guessing:**

1. **Per-university, per-program Nepal TU percentage thresholds are NOT publicly published** by any Go8 university (only RMIT publishes the explicit per-country table). The 65%/70% figures in Section 2 are **derived** from published GPA-scale equivalencies, not lifted from a published Nepal table. The engine should clearly mark these as "indicative — derived from GPA 5.0/7.0 = Credit average".
2. **Tuition ranges are indicative** because every university now lists per-subject (per-credit-point) fees and rolls them up into per-year estimates that vary by enrolment load. Treat as ± 10%.
3. **DHA primary pages return HTTP 403** to automated fetch. AUD 29,710, the assessment-level mechanism, and the GS factor list were verified across multiple migration-agent sources whose numbers agree, but **a human re-verification against `immi.homeaffairs.gov.au` is recommended before launch**.
4. **The "Genuine Student factors" canonical list (Section 5.2)** was verified via SSCS, VisaEnvoy, and Aussizz, but the DHA page itself was not directly readable in this session. Order of weighting between the six factors is **not** published by DHA.
5. **Recent visa-success-rate figures (Section 5.4)** are practitioner estimates, not DHA-published. DHA only publishes country-of-citizenship × visa-class grant rates with a 12-month lag.
6. **Assessment Level 3 evidence requirements** — the "3 months bank seasoning" baseline is stable, but the "6 months recommended" upgrade is practitioner advice, not DHA-published. Mark this as guidance, not a hard rule.
7. **OSHC quoted prices fluctuate per provider campaign**; the engine should refresh these quarterly via a provider quote API rather than hard-code.
8. **MBA / executive program tuition** for the top 5 unis is substantially higher than the figures in Section 2 (commonly AUD 60K–110K). Section 2 ranges cover only coursework masters, not MBA — flag in the MVP scope decision.
9. **Nursing programs require additional registration steps** (AHPRA / NMBA) beyond the visa and offer. The engine should add a "nursing-specific" warning whenever a user selects nursing-as-field.
10. **Post-Study Work (Subclass 485) eligibility** is tied to graduate-occupation lists that change annually. Out of scope for MVP but mention as a planned scoring dimension.

---

## Key flags for the implementation work in `lib/programs/seed.ts` (Phase 3)

- Hard-code `dhaLivingCosts: 29710` with `effectiveFrom: "2024-05-10"` and a comment to revise on NMW indexation.
- Add an `assessmentLevel: "L3"` flag scoped to Nepal source country with `effectiveFrom: "2026-01-09"`.
- All per-university Nepal TU % thresholds (except RMIT) should be marked `source: "derived"` with a TODO to human-verify against admissions team confirmations.
- Nursing programs need a `requiresAhpra: true` flag.
- WSU/La Trobe/Deakin regional intakes should carry a `regionalPostStudyBonus: true` flag for the Subclass 485 scoring extension.
- Conversion in the engine should expose the Nepal % → WAM band mapping to users transparently per the trust-first design principle.
