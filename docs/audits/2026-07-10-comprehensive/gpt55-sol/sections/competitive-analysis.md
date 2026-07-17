# Competitive Analysis — LandingPad (MeroVisa)

*Auditor lens: Nepal education-consultancy market strategist. Audit date 2026-07-10. Corridor: Nepal → Australia.*

## The honest frame

LandingPad's founder thesis is that the app **replaces the local consultancy**. That framing is partly right and strategically dangerous. Consultancies do more than provide information: they supply a human relationship and operational labour across selection, applications, offer follow-up, visa preparation, and pre-departure. LandingPad currently owns discovery/readiness/planning and gives the student instructions for the operational stages. Positioning it as a full replacement over-claims; positioning it as the **source-traceable readiness and coordination layer that lets students make independent decisions** is true today and leaves room to expand.

Below, each competitor: where LandingPad is genuinely stronger *today*, weaker *today*, and the one defensible wedge.

---

## 1. Nepali education consultancies (the real incumbent)

**Their economics (the thing the product exists to expose).** Many consultancies are free or low-cost to students because education providers compensate agents. This creates a potential conflict whenever commercial availability or commission affects what is presented. Australian regulation requires providers to manage education agents, and 2026 reforms expand commission transparency and restrict some onshore transfer commissions. LandingPad's `/trust` page says it has no referral fees or agent partnerships, and no commercial field feeds the scoring engine. That neutral architecture is valuable — but the live privacy/trust copy must first be corrected before it can be used as a competitive promise. See the Australian Department of Education's [Standard 4 obligations](https://www.education.gov.au/esos-framework/resources/standard-4-education-agents) and [2026 legislative changes](https://www.education.gov.au/esos-framework/changes-legislative-framework-overseas-students).

| | LandingPad today | Consultancy |
|---|---|---|
| Cost to student | Free | Free (commission-funded) |
| Conflict of interest | No commercial input is wired into ranking | Potential whenever provider payment shapes recommendations |
| Honest "you're a Reach" verdict | Yes — `mapVerdict` can return "reach" | Varies by agent; incentives and quality are not uniform |
| Fills application forms | **No** (guide refuses to draft submissions) | Often coordinates education applications; immigration assistance must stay within authorised scope |
| Lodges Subclass 500 | No | Varies; individual immigration assistance must be given by an authorised person |
| Arranges loan / financial evidence | Explains only | Often coordinates or refers |
| IELTS/PTE prep | No | Often offered or referred |
| Human accountability when it goes wrong | Support email only; no named owner | A named person/office, though quality and recourse vary |

**Where LandingPad is genuinely stronger today.** It can provide a consistent pre-consultancy second opinion, show source links and dates, explain a rule the same way every time, and refuse hidden pay-to-rank incentives. Its 2026 fee re-verification work also demonstrates the value of a maintained source layer. The caveat is important: the current verdict is a readiness heuristic, not an outcome-calibrated prediction, and the live match budget/unknown-data defects must be fixed before calling it trustworthy.

**Where LandingPad is weaker today — and it is not close. [P1]** The consultancy *does the work*. LandingPad's own `/how` page admits "uploading doesn't change your verdict or match scores" (`app/(marketing)/how/page.tsx:80`) — the documents vault is an **organiser, not a processor**. There is no form-filling, no lodgement, no CoE tracking beyond a checklist row, no human to call at 11pm before a deadline. A student who reaches the end of the plan still has to *go somewhere* to actually lodge — and the only "somewhere" is the consultancy the app told them to distrust. **This is the strategic hole**: the app builds distrust of the consultancy without building a replacement for the consultancy's actual labour, so the most likely real-world outcome is *"LandingPad told me I'm Possible, now I'll take that to an agent to do the paperwork."* That is a useful product — but it is a **companion**, not a replacement, and the roadmap should stop pretending otherwise.

**Second structural weakness [P1]:** the **only account path is Google OAuth**. Anyone unwilling or unable to use a personal Google account on the current device cannot save their result. Combined with a short anonymous expiry and no delivered copy, this is avoidable friction against an incumbent whose onboarding is a conversation.

This gap is concrete, not theoretical. [IDP Nepal](https://www.idp.com/nepal/idp-services/free-study-abroad-counselling/) advertises free counselling, selection, application submission, scholarship guidance, visa support, pre-departure help, and arrival events. [ApplyBoard](https://www.applyboard.com/) advertises a very large multi-country catalogue, application tracking, and partner services. LandingPad cannot win near-term on catalogue breadth, institution integrations, or human operational capacity. It can win on Nepal-specific neutrality, source traceability, explainable readiness, and a calmer student-owned workflow.

---

## 2. Official government sites (Home Affairs, CRICOS, VEVO)

**Stronger today.** LandingPad *pre-digests* the gov data into a Nepal-specific, personalised verdict. Home Affairs will tell you the AUD 29,710 figure and the 6.0 IELTS visa floor; it will **not** tell a specific Kathmandu bachelor's-in-CS student with a 3.2 CGPA and a 2-year gap where they personally stand. LandingPad's engine composes those into a banded verdict + factor bars (`lib/scoring/engine.ts`, `visa.ts`, `financial.ts`), and the CRICOS/university minimums are matched against the student's declared grade/English (`lib/matches/compute.ts`). The dataset also encodes **Nepal-specific** risk the gov site never surfaces: evidence levels (`lib/matches/evidence.ts`), refusal-recovery guidance (`lib/data/source/nepal-refusal-recovery.ts`), working-with-agents cautions (`au-working-with-agents.ts`).

**Weaker today.** Home Affairs and CRICOS are authoritative for their respective rules/registers; LandingPad is a maintained interpretation and can lag a change. Its freshness guard covers only some facts, and FX inputs lack a reliable watchdog. A student must always be able to open the primary source and see which LandingPad interpretation or heuristic was applied. LandingPad wins on synthesis and sequence, never on source authority. Use [Home Affairs Student visa](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500) and [CRICOS](https://cricos.education.gov.au/) as the canonical links.

---

## 3. University websites

**Stronger today.** LandingPad aggregates 83 programs across 15 AU universities into one comparable, verdict-banded list (`lib/programs/seed.ts`; DB seed). A student comparing Melbourne vs RMIT vs Deakin CS otherwise opens many tabs and mentally normalises grade/English/tuition themselves. LandingPad does the normalisation and attaches a per-program Strong/Possible/Reach (`compute.ts`).

**Weaker today [P2].** Coverage is thin and many rows are derived rather than deep-linked primary requirements. A student whose target course is outside the 83-row/six-field set gets no relevant decision support. Official Australian course search and provider pages expose far more courses, locations, delivery modes, start dates, and total costs. LandingPad wins on personalised comparison within its curated set; it loses on breadth and authoritative course detail. See [Study Australia course search](https://search.studyaustralia.gov.au/courses).

---

## 4. Reddit / Facebook groups / student communities

**Stronger today.** LandingPad can impose source, date, and consistency standards that peer posts do not. Community advice is valuable lived experience, but quality and conflicts vary and individual success stories are not representative evidence. LandingPad should not claim perfect privacy — Guide and analytics use third-party processors — but it can be transparent and data-minimising once disclosure is fixed.

**Weaker today [P2].** Communities have two things LandingPad cannot responsibly fabricate: **recent lived outcomes** and **human reassurance**. MV-08 now captures self-reported application, offer, visa, and enrolment events against frozen predictions, but it has no verification/admin path and cannot yet support calibrated claims. Until consented, verified outcome evidence exists at meaningful sample sizes, communities remain more persuasive on “someone like me just made it,” even though they are less reliable.

---

## 5. YouTube creators (Nepali study-abroad channels)

**Stronger today.** LandingPad is interactive and profile-aware; creator content is usually general. Commercial sponsorship varies by creator and should not be assumed without disclosure.

**Weaker today.** Creators own trust-through-face, story, vernacular language, and existing distribution. LandingPad is English-only and faceless, with no meaningful sharing/referral loop. It should partner with credible creators for distribution while keeping research, ranking, and sponsorship disclosure independent.

---

## 6. Generic AI assistants (ChatGPT / Gemini) — *be honest here*

General-purpose AI assistants are fast, broad, conversational, and multilingual. For a quick generic question, that is a lower-friction substitute than creating a LandingPad account. This is an important competitor, not a feature category to copy blindly.

**Where LandingPad can be stronger.** It owns a bounded, versioned corpus; connects answers to a persistent structured profile; uses deterministic rules for the verdict; and connects an explanation to matches, plan, checklist, and application state. That advantage is only defensible if citations are validated rather than merely requested in a prompt, processor use is disclosed, and the readiness model is corrected/calibrated.

**Where LandingPad is weaker.** General assistants are broader, multilingual, and lower-friction. LandingPad's advantage narrows to high-stakes answers that benefit from a curated corpus, persistent state, versioning, and workflow — a narrow but meaningful wedge.

---

## The defensible wedge — where to double down

Ranked by defensibility against *all six* competitors:

1. **Neutral, source-traceable, personalised readiness explanation [double down].** This combines official facts, explicit product heuristics, profile context, and a sequenced workflow. Call it readiness until outcome calibration supports a stronger prediction claim.

2. **The outcome-validation loop (MV-08) [the actual long-term moat].** Self-reported capture is live: marking a program Applied freezes the prediction, opens an attempt, and later funnel events can be reported. The missing value is verified evidence, consent, sample-size discipline, and calibration. Every quarter verification remains blocked, the community's "I got approved last week" advantage compounds. **This is a legal/data-operations unblock, not a missing capture feature.**

3. **Refusal-risk / genuine-student / working-with-agents corridor knowledge [double down].** The Nepal-specific trust-defense content (`nepal-refusal-recovery.ts`, `au-genuine-student.ts`, `au-working-with-agents.ts`) is knowledge the consultancy has an incentive to *withhold* (it names their conflict) and that gov sites and AI don't localise. This is genuinely differentiated.

**Where NOT to compete:** paperwork/lodgement labour (consultancy wins), authority on raw figures (gov wins), distribution/vernacular reach (creators + FB win), quick generic answers (AI wins). Stop framing the product as a full replacement; it dilutes the one true claim.

---

## Positioning statement I would actually use

> **"Know where you stand before anyone profits from your decision.**
> LandingPad turns your Nepal→Australia profile into a source-linked readiness assessment, a shortlist, and a step-by-step plan. Official rules are labelled as official; our judgement is labelled as ours. We do not sell ranking positions, and we show you what still needs an authoritative or licensed professional check."

This is defensible because every clause maps to code that exists (`/trust`, `verdict.ts`, sourced data layer, guide refusal rule) and it *concedes the paperwork ground* honestly rather than over-claiming a replacement the product does not deliver.

---

### Findings summary

- **[P1]** Product positions as a consultancy replacement but currently delivers decision support/readiness, not application operations or post-arrival support. Reframe the present promise and make replacement a staged north star.
- **[P1]** Google-only auth (`auth-card.tsx:61`) + 3-day anonymous-expiry with no email recovery is a severe funnel disadvantage vs a zero-friction walk-in incumbent.
- **[P1]** MV-08 outcome capture is live but self-reported; verification, consent, and calibration are the highest-leverage competitive unblock.
- **[P2]** No visible acquisition/distribution channel in repo; creators and FB groups own top-of-funnel. A verdict engine with no traffic loses by default.
- **[P2]** ChatGPT/Gemini are an under-acknowledged free, multilingual competitor for quick answers; LandingPad's edge narrows to grounded+personalised+honest, which must be marketed explicitly.
- **[P2]** University/program coverage is 15 universities / 83 programs across six fields, many `data_quality='derived'`; non-AU destinations dead-end. Thin versus official course-search and CRICOS surfaces.
- **[P3]** FX rates gating the financial verdict are hand-entered heuristics with no `reverifyBy` (`fx-rates.ts`) — a silent staleness risk against gov authority.
