# Trust-copy read-through — 2026-06-12 (slice ④·3)

A line-by-line confidence pass over every high-trust copy surface: **are we saying this accurately, calmly, and safely?**
Spec: `docs/superpowers/specs/2026-06-12-trust-copy-readthrough-design.md`. **No code, data, or ledger changes shipped with this packet** — the fix batch below becomes slice ④·3b only after your read-through.

## How to read this packet

- Every rendered line has a **stable ID** (`surface.group.row`). Fixes, discussion, and ④·3b patches key on these IDs.
- **Verdicts** (one per line, worst across lenses): `MUST-FIX` (wrong, unsafe, or overpromising), `SHOULD-FIX` (drift/tone/precision, not actively harmful), `WATCH` (correct today, fragile), `ok`.
- Flagged rows reference an entry (F1…F16, W1…W8) in the fix-batch section, which carries the verbatim current line, the evidence, and ship-ready replacement wording.
- Lens-agent flags that did **not** survive adjudication are recorded at the end with rejection reasons — you can overrule any of them.

## Method

- **Inventory + grounding (main agent):** 92 rendered lines across six surfaces + plan/checklist mirrors; all **117 backing findings located, every one `used`** — the machine layer is coherent. Copy compared against ledger claim text (verified 2026-06-05 → 06-12).
- **Spot-fetches (7 of ≤10):** the GS requirement page, English-language page, and providing-accurate-information page fetched substantively (key sentences quoted in flags); the Study Australia commission page fetched substantively (ban nuance confirmed); the 485, SSVF, and visa-scams pages returned JS shells — those lines are grounded on ledger only (findings verified 06-05/06-10), noted where relevant.
- **Three blind lens agents** (read-only, no access to main-agent verdicts or each other): anxious-student (15 flags), advice-boundary (7 flags), precision-pedant (2 flags + broad fidelity confirmation). All flags adjudicated below; 9 rejected with reasons.

## Ratified-decisions register (settled calls — not re-litigated here)

R1 "a main ground", never "#1 refusal ground" · R2 the PR line's wording incl. "as long as your study plan and stay are genuine under the visa rules" · R3 "limited exempt persons" · R4 ban date "after 31 March 2026" · R5 "The government warned…" attribution · R6 personal chances = banded verdicts, never percentages; corridor cohort rates are percentages by design · R7 grant-rate cohort naming (offshore/onshore) · R8 the three ART lines (paper-only 1 June 2026, non-extendable deadline, ~19-month median) freshly verified + copy-locked · R9 fix-#4 lift claims deliberately de-overclaimed · R10 agents-disclaimer scope · R11 the VET contrast line user-locked verbatim · R12 "home country"→"Nepal" corridor localization.

---

## Surface 1 — Refusal & recovery (`components/results/refusal-recovery.tsx` ← `nepal-refusal-recovery.ts`)

| ID | Rendered line (abridged) | Backing | Verdict |
|---|---|---|---|
| `refusal.frame.title` | Refusal risk & recovery (Nepal → Australia) | framing | ok |
| `refusal.grounds.heading` | Why applications are refused | heading | ok |
| `refusal.grounds.genuine-student` | Not being assessed as a genuine student — DHA weighs your GS answers and the evidence behind them. | I.008, I.006 | ok |
| `refusal.grounds.capacity` | Not showing enough financial and English-language capacity. | I.029 | ok |
| `refusal.grounds.document-integrity` | Document problems — altered, edited, or manipulated documents are unlawful. | I.027 (live-confirmed) | ok |
| `refusal.odds.heading` | Honest odds — by sector | heading | ok |
| `refusal.odds.higher-ed` | …granted 85.3% of the time when applying from outside Australia (Apr–Jun 2025). | I.034 | ok (see W8) |
| `refusal.odds.vet` | Vocational (VET) applications were granted 36.3% over the same period. | I.035 | WATCH → W5 |
| `refusal.odds.vet-guard` | We show VET as a contrast because some students are steered into cheaper courses — it is not your personal probability. | user-locked R11 | ok |
| `refusal.recovery.review` | …since 1 June 2026 it decides most student-visa refusal reviews on the papers… | I.044, I.051 · R8 | ok |
| `refusal.recovery.deadline` | The deadline to apply for review is strict — the Tribunal has no power to extend it. | I.050 · R8 | ok |
| `refusal.recovery.timeline` | Be ready to wait — about half of student refusal reviews finish within 19 months of applying. | I.048 · R8 | WATCH → W3 |
| `refusal.recovery.cost` | The review has a fee — AUD 3,580 for most migration decisions. | I.045 (reverifyBy 2026-07-01) | ok |
| `refusal.recovery.hardship` | A 50% reduction may apply on financial-hardship grounds. | I.046 | ok |
| `refusal.recovery.ministerial` | Ministerial intervention exists, but it is not a normal appeal path — it is a limited, conditional last resort. | I.057, I.059, I.060 | ok |
| `refusal.scam.heading` | What not to trust | heading | ok |
| `refusal.scam.no-issuance` | Australia issues no work permits, visa labels, or LMIAs — anyone offering these is running a scam. | I.078–I.080 | SHOULD-FIX → F4 |
| `refusal.scam.bogus-documents` | Bogus or false documents can lead to refusal, cancellation, and **bans** on future applications. | I.028 (live-checked) | **MUST-FIX → F1** |
| `refusal.frame.disclaimer` | General context for Nepal → Australia, not legal advice. | framing | ok |

## Surface 2 — Odds (`policy-banner.tsx`, `verdict-card.tsx`, `accuracy-meter.tsx`)

| ID | Rendered line (abridged) | Backing | Verdict |
|---|---|---|---|
| `odds.banner.title` | Current policy (Nepal → Australia) | heading | ok |
| `odds.banner.assessment-level` | Assessment Level L3 in effect since 2026-01-09. Expect 6-month bank seasoning + GS narrative. | **NO FINDING** | **MUST-FIX → F2** |
| `odds.banner.dha-floor` | DHA financial floor: AUD 29,710 per year (effective 2024-05-10). | A.015, B.002 | SHOULD-FIX → F9 |
| `odds.banner.grant-rate` | Nepal student-visa grant rate (DHA, Apr–Jun 2025): 76.5% outside Australia, 78.7% within. | I.032, I.033 | ok |
| `odds.verdict.strong` | Strong match → You have a realistic shot, with strong fundamentals. | band copy R6 | ok |
| `odds.verdict.possible` | Possible → You have a realistic shot, with a few areas to strengthen. | band copy R6 | ok |
| `odds.verdict.reach` | Reach → This is ambitious — focus on strengthening a few key areas. | band copy R6 | ok (rejection X4) |
| `odds.verdict.provenance` | Based on rules verified 2026-06-02 · immi.homeaffairs.gov.au | destination-config date | SHOULD-FIX → F16 |
| `odds.accuracy.readout` | Profile accuracy — 25% · Basic | heuristic | ok |
| `odds.accuracy.transcript` | Upload your transcript → exact grade verification | heuristic | ok |
| `odds.accuracy.financials` | Add financial documents → precise budget assessment | heuristic | ok |
| `odds.accuracy.english` | Verify your English score → **confirmed eligibility** | heuristic | SHOULD-FIX → F5 |

## Surface 3 — Genuine Student (`genuine-student.tsx` ← `au-genuine-student.ts`)

| ID | Rendered line (abridged) | Backing | Verdict |
|---|---|---|---|
| `gs.frame.title` | The Genuine Student test (Australia) | framing | ok |
| `gs.what.since-2024` | Every student visa lodged on/after 23 Mar 2024 is assessed on GS — replaced the old GTE test. | F.001, F.002, C.005 | ok |
| `gs.what.format` | You answer in the form itself — 150 words or less per question, in English… | F.004, E.006, F.003, E.007, C.133, E.005 (live-confirmed) | ok (rejection X8) |
| `gs.what.extra-question` | Additional question if you've held a student visa / applying in Australia from a non-student visa. | F.005, C.135, C.136 | ok |
| `gs.questions.heading` | The questions you'll answer | heading | SHOULD-FIX → F3 (a question is missing) |
| `gs.questions.circumstances` | Your current circumstances — ties to family, community, employment, economic situation. | F.006 | ok |
| `gs.questions.why-course` | Why this course, in Australia, with this provider — and what you understand about… | F.007, F.008 | ok |
| `gs.questions.benefit` | How completing the course will benefit you. | F.009 | ok |
| *(missing row)* | — the live form's fourth question ("any other relevant information") is not shown | A.020 (already `used`) | **→ F3** |
| `gs.weighing.not-checklist` | Direction 106 tells decision makers not to treat the factors as a checklist… | F.014, F.010 | ok |
| `gs.weighing.ties` | Your personal ties to Nepal — family, community, employment — and economic circumstances… | F.018, F.019 · R12 | ok |
| `gs.weighing.research` | How much you actually know: course, provider, living arrangements — depth of research counts. | F.020, F.021 | ok |
| `gs.weighing.home-course` | Whether a similar course is available at home…and your reasons for studying it in Australia instead. | F.017, E.010 | SHOULD-FIX → F13 |
| `gs.weighing.course-value` | Whether the course fits your past study or work — reasonable career changes are accepted — and the pay… | F.023, F.024, E.011 | ok |
| `gs.weighing.history` | Your immigration history counts: previous applications and refusal circumstances… | F.025, F.011, F.012, F.026 | ok |
| `gs.weighing.scrutiny` | Closer scrutiny is flagged for: a field unrelated to your past study or work… | F.015, F.016, F.022, F.027 | ok |
| `gs.weighing.ssvf-evidence-level` | Under the SSVF, documentation expectations also depend on your provider's evidence level… | C.007, C.008 | ok |
| `gs.poststudy.pr-not-disqualifying` | Wanting to apply for permanent residence later does not count against you — as long as… | C.006, I.008, F.013, E.012 · R2 (live-confirmed) | ok |
| `gs.poststudy.say-it-straight` | Study Australia says the requirement removed the old confusion about expressing a desire to migrate. | F.034 | ok |
| `gs.poststudy.485-reality` | The 485 lets you live, work and study temporarily — but generally 35 or under, and since 1 Jul 2024… | F.035–F.038 (485 page = JS shell; ledger-grounded) | ok |
| `gs.evidence.weight` | DHA gives more weight to answers supported by evidence — attach documents in ImmiAccount… | E.009, E.008 (live-confirmed) | ok |
| `gs.evidence.online-tests` | DHA does not accept English tests delivered completely online. | E.013 (live-confirmed) | SHOULD-FIX → F12 |
| `gs.evidence.test-validity` | English test results from on or before 6 Aug 2025 can be used until 6 Aug 2028, depending on the visa. | E.014 (live-confirmed) | ok |
| `gs.frame.disclaimer` | General context for the Australian GS requirement, not legal advice. | framing | ok |

## Surface 4 — Working with agents (`working-with-agents.tsx` ← `au-working-with-agents.ts`)

| ID | Rendered line (abridged) | Backing | Verdict |
|---|---|---|---|
| `agents.frame.title` | Working with an agent (Australia) | framing | ok |
| `agents.need.optional` | You don't have to use a registered migration agent — you can apply for the visa yourself. | G.075 | ok |
| `agents.need.who-can-assist` | Immigration assistance can only be given by registered migration agents, Australian legal practitioners, or limited "exempt persons". | G.074 · R3 | ok |
| `agents.need.complex-cases` | OMARA says a registered agent may be especially helpful if your case is complex. | G.076 | ok (rejection X7) |
| `agents.need.pay-use-registered` | If you pay for immigration help, the Department says use a registered migration agent listed with OMARA. | G.084 | ok |
| `agents.register.verify-marn` | Confirm your agent on the OMARA public register — you can search it by their MARN. | G.077 | ok |
| `agents.register.standards` | Registered agents must keep meeting OMARA's professional standards to stay on the register. | G.085 | ok |
| `agents.owes.documents` | Your agent must give you the documents the Department sends about your case. | G.088 | ok |
| `agents.owes.updates` | Your agent must keep you updated on your visa application's progress. | G.089 | ok |
| `agents.owes.fee-agreement` | OMARA lists **agreeing the written** service agreement and fees as a step… | G.087 ("**discussing**", no "written") | SHOULD-FIX → F7 |
| `agents.owes.exempt-no-charge` | "Exempt persons" must not charge a fee for immigration assistance. | G.079 | ok |
| `agents.form956.appointment` | Form 956 is what formally appoints a registered agent, legal practitioner, or exempt person… | G.080 | ok |
| `agents.form956.authorised-recipient` | Once you appoint an authorised recipient, the Department sends all written communication to them. | G.081 | ok |
| `agents.commission.ban` | Education providers cannot pay agent commissions for student transfers **between onshore providers**… | G.090 · R4 (live page adds the principal-course scope) | SHOULD-FIX → F10 |
| `agents.commission.hidden` | The ban's definition is written to catch hidden commissions too — including bonuses. | G.092 | ok |
| `agents.commission.average` | The government's analysis put the 2025 average onshore-transfer commission at about AUD 510. | G.094 | ok |
| `agents.commission.direct-pay-risk` | The government warned that direct payments to agents for transfers could expose students to exploitation. | G.096 · R5 | WATCH → W4 |
| `agents.frame.disclaimer` | General context on migration assistance and education-agent commissions…not legal advice. | framing · R10 | ok |

## Surface 5 — Eligibility / "what counts" (`factor-bars.tsx` + `factor-copy.ts`, `cost-to-apply.tsx`)

| ID | Rendered line (abridged) | Backing | Verdict |
|---|---|---|---|
| `eligibility.factors.dimensions` | Academic fit / Financial readiness / Visa case strength / Profile strength · bands Strong / Solid / Building / Needs work | engine bands R6 | ok |
| `eligibility.factors.engine-details` | [class] per-profile engine factor strings, goldens-pinned, destination names humanized at the render seam | engine | ok (class) — rewording any of them is a scoring change, out of slice scope |
| `eligibility.cost.title` | What it costs to apply (Nepal → Australia) | framing | ok |
| `eligibility.cost.ielts` | IELTS test (computer-delivered) — NPR 36,000 | B.121, G.051 | WATCH → W1 |
| `eligibility.cost.vfs-biometric` | VFS biometrics — NPR 2,365 | B.097 | WATCH → W1 |
| `eligibility.cost.medical` | Panel medical exam — NPR 6,400 | B.125 (one clinic: Norvic) | WATCH → W1/W2 |
| `eligibility.cost.passport` | Passport (34-page) — NPR 12,000 | A.047 | WATCH → W1 |
| `eligibility.cost.equivalence` | Academic equivalence (TU) — NPR 1,000 | A.085 | WATCH → W1 |
| `eligibility.cost.nepal-subtotal` | Core steps — NPR 57,765 | sum verified ✓ | ok |
| `eligibility.cost.visa-charge` | Student visa charge (DHA) — AUD 2,000 | A.001, B.001 (reverifyBy 2026-07-01) | WATCH → W1 |
| `eligibility.cost.provider-fee` | University application fee — varies by university; **often waived** — AUD 0–150 | D.062, D.102–D.109 | SHOULD-FIX → F11 |
| `eligibility.cost.note` | Application costs only — separate from tuition and living costs…we don't blend exchange rates. | framing | ok |

## Mirrors — plan + checklist (`lib/plan/generator.ts`, `lib/checklist/generator.ts`)

| ID | Rendered line (abridged) | Backing | Verdict |
|---|---|---|---|
| `mirror.plan.gs-answers` | Prepare your Genuine Student answers (full body) | A.016–A.021 · R2 | SHOULD-FIX → F3 (three of four questions) |
| `mirror.plan.proof-of-funds` | DHA expects evidence covering AUD 29,710 living costs plus first-year tuition. It accepts…Class A institution… | A.015, B.007–B.010 | SHOULD-FIX → F8 |
| `mirror.plan.proof-lift` | Core financial evidence for your visa case | R9 | ok |
| `mirror.plan.ielts-body` | Uploading the official report lets us check per-band scores…(some nursing programs need each band ≥ 7) | program data | ok (rejection X3) |
| `mirror.plan.ielts-lift` | Verifies per-band requirements on N possible match(es) / Sharpens band-aware verdicts | R9 | ok |
| `mirror.plan.season-funds` | Season your bank statements for 6 months: "Nepal returned to Assessment Level 3 in Jan 2026. DHA case officers now expect…> AUD 5,000." | **NO FINDING** | **MUST-FIX → F2** |
| `mirror.plan.season-lift` | Addresses a documented refusal ground — financial capacity | R9 (via I.029) | ok |
| `mirror.plan.gap-reasons` | GS narrative needs a coherent explanation for any gap ≥ 1 year… | F.027 (no numeric threshold in MD106) | SHOULD-FIX → F15 |
| `mirror.plan.gap-evidence` | Employment letter, salary slips, or other docs. Without evidence the GS test gets harder. | E.009, I.006 | ok |
| `mirror.plan.work-docs` | Title, dates, salary, role description. Strengthens both admissions…and GS narrative. | heuristic | ok |
| `mirror.plan.safer-options` | Your current matches are all reach. Add 2–3 **mid-tier** programs (e.g. RMIT, UTS, Macquarie)… | heuristic tiering | SHOULD-FIX → F14 |
| `mirror.checklist.gs-responses` | Short answers in the visa form — 150 words each, in English. Attach supporting evidence in ImmiAccount… | A.021, E.008, E.009 | ok |
| `mirror.checklist.finance-note` | DHA expects evidence covering your travel, at least AUD 29,710 living costs, and tuition (plus family)… | A.011–A.013, A.015, B.011 | ok |
| `mirror.checklist.finance-seasoning` | Under Nepal Assessment Level 3, season your balance for 6 months with source-of-funds evidence. | **NO FINDING** | **MUST-FIX → F2** |
| `mirror.checklist.english-generic` | Most Australian programs require an English test for both admission and the visa. | heuristic | WATCH → W6 |
| `mirror.checklist.english-program` | This program lists {TEST} {score}, each band ≥ {band}. | program data | ok |
| `mirror.checklist.nursing-bands` | Nursing programs typically require each band ≥ 7. | heuristic | WATCH → W7 |
| `mirror.checklist.ahpra` | Nursing programs require registration with…(AHPRA). | **NO SOURCE** | SHOULD-FIX → F6 |
| `mirror.checklist.gap-note` | Evidence for your study gap (employment letter, salary slips). | heuristic | ok |

## Surface 6 — Scam/trust warnings (cross-cutting index — lines live above, no duplicates)

`refusal.scam.no-issuance` (F4) · `refusal.scam.bogus-documents` (F1) · `refusal.grounds.document-integrity` (ok) · `agents.need.who-can-assist` (ok) · `agents.need.pay-use-registered` (ok) · `agents.register.verify-marn` (ok) · `agents.owes.exempt-no-charge` (ok) · `agents.commission.direct-pay-risk` (W4) · `gs.evidence.online-tests` (F12). The warning spine is gov-grounded throughout; the two flags are an overstated consequence (F1) and an attribution gap (F4).

---

# Fix batch

> **④·3b status (2026-06-12, commit `ba5a6bc`): APPLIED — F1 · F2 Option B (plus a fourth F2 line the slice sweep found on the marketing `/how` page, which claimed the seasoning rule came "directly from the Department of Home Affairs") · F3 · F4 · F7 · F10 · F11 · F12 · F13 · F14 · F15.**
> **④·3c status (2026-06-12, commit `c33bb8b`): APPLIED — F5 · F6 · F8 · F9, as proposed, plus two user-approved extensions: "travel" added to the F8 body's first sentence (A.011–A.013; matches the checklist finance note), and the F9 defect class swept on the marketing `/how` page ("the financial floor (AUD 29,710 living costs plus first-year tuition)" → "the financial-capacity rules (AUD 29,710 per year for living costs, plus travel and first-year tuition evidence)"). Every changed line is copy-locked. REMAINING — F16 (mechanical wiring, separate slice — now the only open row). Watch items stay watch. F2 Option A queued as a research task: properly source the Nepal/SSVF financial-evidence scrutiny claim (see the PROJECT_STATUS backlog).**

## MUST-FIX NOW (2 entries, 4 lines)

**F1 · `refusal.scam.bogus-documents` — "bans" overstates the sourced consequence.** *(found by: advice-boundary lens; confirmed against live page)*
- Current: "Bogus or false documents can lead to refusal, cancellation, and bans on future applications."
- Evidence: I.028 and the live providing-accurate-information page both say "**restrictions** on future applications" ("Providing bogus documents or information that is false and misleading may lead to refusal of your application, cancellation of your visa, restrictions on future applications, and possible legal action."). "Bans" is a materially stronger legal claim than the cited source makes.
- Proposed: "Bogus or false documents can lead to refusal, cancellation, and restrictions on future applications."
- ④·3b note: data-only edit in `nepal-refusal-recovery.ts`; this row is not pinned by the ④·1 copy-lock test.

**F2 · The Assessment-Level cluster — an unsourced dated official claim + asserted DHA practice, on three lines.** *(found by: advice-boundary lens + main-agent grounding; jargon point from anxious-student lens folded in)*
- Lines: `odds.banner.assessment-level` · `mirror.plan.season-funds` (title + body) · `mirror.checklist.finance-seasoning`.
- Current: "Assessment Level L3 in effect since 2026-01-09. Expect 6-month bank seasoning + Genuine Student narrative." / "Season your bank statements for 6 months: Nepal returned to Assessment Level 3 in Jan 2026. DHA case officers now expect 6 months of stable balance + source-of-funds documentation for any deposit > AUD 5,000." / "Under Nepal Assessment Level 3, season your balance for 6 months with source-of-funds evidence."
- Evidence problem: **no finding backs any of it** — the L3 designation, the 2026-01-09 date, the "DHA case officers now expect", the 6-month figure, and the >AUD 5,000 threshold all trace only to the internal research memo (2026-06-04). "Assessment Level" is also the pre-2016 regime's terminology — DHA's current machinery is the SSVF's evidence levels. These are the only lines on the audited surfaces that assert a specific official action/practice with zero ledger backing, in a product whose core promise is source + lastVerified on every data point. They also seed the banner — the first "policy" line a user reads.
- Remediation — **pick one**:
  - **Option A (preferred): source it.** Research the SSVF evidence-level position for Nepal properly (DHA documentation / reputable dated sector reporting), land findings in the ledger, then keep a dated, correctly-termed line (e.g. "Nepal sits at the SSVF's highest financial-evidence level — expect full financial evidence and a strong Genuine Student case"). The underlying reality (heightened Nepal scrutiny) is likely true and is corridor-valuable — it deserves real sourcing, not deletion.
  - **Option B (interim reword): claim only what we can ground.** Banner: "Nepal applications face heightened financial-evidence scrutiny — plan for 6 months of bank seasoning and a strong Genuine Student case." Plan title: "Build 6 months of stable bank history" ("season" is banking jargon — anxious-student lens); body: "Nepal student applications face heightened financial-evidence scrutiny. We recommend 6 months of stable, documented balance — large or sudden deposits need source-of-funds evidence, or they weaken your financial case." Checklist: "We recommend 6 months of stable, documented balance with source-of-funds evidence." (Drops the unsourced >AUD 5,000 precision and the false attribution; keeps the action and marks the recommendation as ours.)
- ④·3b note: `mirror.plan.season-lift` ("Addresses a documented refusal ground — financial capacity") stays — it is grounded via I.029 and R9.

## SHOULD-FIX SOON (14)

**F3 · `gs.questions.*` + `mirror.plan.gs-answers` — the panel shows three of the four GS questions.** *(main-agent grounding; live-confirmed)*
- The live GS page lists a fourth form question — "Give details of any other relevant information the applicant would like to include" — already in the ledger as A.020 (`used`, via `au-student-visa-requirements`, which correctly lists all four). The panel section is headed "The questions you'll answer" and shows three; the plan body enumerates the same three.
- Proposed: new panel row `gs.questions.anything-else`: "Anything else you think matters — the form ends with an open question for any other relevant information." (findingRefs: A.020; displayed source: the GS page.) Plan body: "…your circumstances and ties, why this course and this provider, how it benefits you, and anything else you want considered — each in 150 words or less, in English."

**F4 · `refusal.scam.no-issuance` — the scam conclusion is unattributed product voice.** *(advice-boundary lens)*
- Current: "…— anyone offering these is running a scam." The findings only establish that DHA's page says Australia does not issue these.
- Proposed: "Australia issues no work permits, visa labels, or Labour Market Impact Assessments — DHA lists offers of these among visa scams."

**F5 · `odds.accuracy.english` — "confirmed eligibility" overpromises.** *(advice-boundary lens)*
- Proposed gain text: "Verify your English score → band-level verification".
- ④·3c: applied verbatim (`lib/results/accuracy.ts`); the gain string is copy-locked.

**F6 · `mirror.checklist.ahpra` — unsourced eligibility claim.** *(advice-boundary lens)*
- Current: "Nursing programs require registration with the Australian Health Practitioner Regulation Agency (AHPRA)." No source attached; as stated it is also imprecise about *when/who* registers.
- Proposed: "Nursing pathways involve registration with the Australian Health Practitioner Regulation Agency (AHPRA) — confirm your program's requirements with the provider." Ledger follow-up: source AHPRA student-registration properly and restore a firmer line.
- ④·3c: applied verbatim (`lib/checklist/generator.ts`); note copy-locked. The AHPRA-sourcing follow-up (with W7) stays in the backlog.

**F7 · `agents.owes.fee-agreement` — "agreeing the written" outruns G.087's "discussing".** *(precision lens)*
- Proposed: "OMARA lists discussing the service agreement and fees as a step in choosing an agent — settle both upfront."

**F8 · `mirror.plan.proof-of-funds` — "Class A institution" reads as part of DHA's rule.** *(precision lens)*
- DHA's evidence paths (B.007–B.010) say "financial institution"; Class A is Nepali banking vocabulary. Separate the DHA rule from local practice: "…or your parents' or partner's annual income. In Nepal, a bank statement or loan sanction letter from a Class A commercial bank is the usual route."
- ④·3c: applied, with the user-approved travel addition to the first sentence — "DHA expects evidence covering travel, AUD 29,710 living costs, and first-year tuition." Both sentences copy-locked (`tests/plan/generator.test.ts`).

**F9 · `odds.banner.dha-floor` — "financial floor" implies the whole requirement; 29,710 is the living-cost component.** *(main agent)*
- A.015/B.002 define the living-cost figure; the full DHA requirement also covers travel + tuition (A.011–A.013 — the checklist note gets this right).
- Proposed: "DHA living-cost requirement: AUD 29,710 per year (effective 2024-05-10) — travel and tuition evidence come on top."
- ④·3c: applied verbatim on the banner (copy-locked; "financial floor" asserted absent). Same defect class swept on the marketing `/how` page (user-approved): "the financial-capacity rules (AUD 29,710 per year for living costs, plus travel and first-year tuition evidence)".

**F10 · `agents.commission.ban` — missing the principal-course scope.** *(main agent; live page)*
- The live page defines the banned "onshore transfer" as switching providers after starting in Australia **before completing the principal course**; initial enrolments and post-completion enrolments stay commissionable. "Between onshore providers" can read as all transfers.
- Proposed: "Education providers cannot pay agent commissions when a student switches providers in Australia before finishing their principal course (transfers after 31 March 2026)."

**F11 · `eligibility.cost.provider-fee` — "often waived" overstates the evidence.** *(main agent)*
- Base: Trinity Foundation no fee; UTS waives only for current UTS/UTS College students; UNSW "may be payable"; Sydney/Monash charge flat. For a fresh Nepal applicant, fees are usually payable.
- Proposed note text: "varies by university; sometimes waived".

**F12 · `gs.evidence.online-tests` — scope qualifier dropped; a centre-tested student can misread it.** *(anxious-student lens; live-confirmed wording)*
- E.013 and the live page scope the rule to at-home/remote-proctored delivery for visa purposes; tests at a secure centre are fine.
- Proposed: "DHA does not accept English tests delivered completely online (at-home or remote-proctored) for visa purposes — tests taken at a secure test centre are accepted."

**F13 · `gs.weighing.home-course` — drops F.017's "reasonable", which is the actual standard.** *(anxious-student lens kernel, source-faithful fix)*
- Proposed: "Whether a similar course is available at home or in the region, and whether you have reasonable reasons for studying it in Australia instead."

**F14 · `mirror.plan.safer-options` — "mid-tier" is unsourced editorial tiering of named universities.** *(anxious-student lens + main agent)*
- Proposed: "Your current matches are all reach. Add 2–3 universities whose published requirements sit closer to your profile (e.g. RMIT, UTS, Macquarie) to balance your portfolio."

**F15 · `mirror.plan.gap-reasons` — an internal threshold presented as a GS rule.** *(main agent)*
- Direction 106 weighs "gaps of concern" with no numeric threshold; "≥ 1 year" is our UI convention.
- Proposed: "Officers weigh study gaps that lack explanation (Direction 106). For a gap of a year or more, note what you did per year — work, family, preparation — so your narrative holds together."

**F16 · `odds.verdict.provenance` — "rules verified 2026-06-02" shows the destination-config date, not a ruleset verification.** *(main agent)*
- The scoring engine is versioned separately (CONFIG_VERSION); the rendered date is `lib/data/destination/australia.ts` `lastVerified`.
- Proposed (mechanical, not copy-only): wire the line to the scoring config's version + verification date, same sentence shape. Flagged for ④·3b sizing.

## ACCEPTABLE BUT WATCH (8)

| # | ID(s) | What to watch | When |
|---|---|---|---|
| W1 | `eligibility.cost.*` (all six fee lines) | The volatile-fee class deliberately deferred from ④·2 W1 (no `reverifyBy` — fuzzy change dates). The visa charge alone is guard-armed (2026-07-01). Belongs to the planned **dynamic-data/feed** follow-up. | dynamic-data slice |
| W2 | `eligibility.cost.medical` | NPR 6,400 is one clinic's price (Norvic). Optional qualifier "(Norvic, Kathmandu)" if it ever reads as universal. | with W1 |
| W3 | `refusal.recovery.timeline` | Anxious-student lens suggests adding "the other half can take longer". Pending finding I.049 (95% within 2 years) could source a fuller line in a recovery extension. | recovery extension |
| W4 | `agents.commission.direct-pay-risk` | True and attributed (R5), but the same gov page notes agents may still lawfully charge students direct fees — if students read our line as "direct fees are illegitimate", add the counterpart fact (G-cluster has use-later rows). | next agents touch |
| W5 | `refusal.odds.vet` | Cohort qualifier rides on the HE row ("outside Australia") + "same period". Optionally make the VET row self-contained. | polish |
| W6 | `mirror.checklist.english-generic` | "Most Australian programs require an English test for both admission and the visa" conflates who requires what (program vs DHA). | polish |
| W7 | `mirror.checklist.nursing-bands` | "typically ≥ 7 each band" is heuristic; AHPRA's English standard is sourceable — do it together with F6. | with F6 |
| W8 | `refusal.odds.higher-ed` | Cohort-vs-personal separation currently leans on the VET guard line; if analytics show odds confusion, consider a "cohort rate, not your personal chance" footing on the HE row too. | evidence-driven |

## Lens flags rejected in adjudication (you can overrule)

| # | ID | Lens | Flag | Rejection reason |
|---|---|---|---|---|
| X1 | `refusal.odds.vet-guard` | anxious | reword the guard line | R11 — user-locked verbatim; tone concern recorded here for your eyes |
| X2 | `agents.commission.direct-pay-risk` | anxious | add "negotiate fees…confirm not hidden inside tuition" | adds unsourced advice (crosses the inform/advise boundary); R5 settles the attribution form; kernel kept as W4 |
| X3 | `mirror.plan.ielts-body` | anxious | soften the nursing parenthetical | already qualified ("some"); proposed text adds unsourced claims |
| X4 | `odds.verdict.reach` | anxious | "improve your chances significantly" | replacement overpromises (advice-boundary violation); current line is calm + actionable banded copy |
| X5 | `refusal.scam.bogus-documents` | anxious | add "professionally translated documents do not fall into this category" | unsourced legal scoping; the doc-prep checklist row covers translations; F1 fixes the real defect |
| X6 | `refusal.recovery.cost` | anxious | merge the hardship clause into the fee line | the hardship row is directly adjacent with its own source link; merging loses traceability |
| X7 | `agents.need.complex-cases` | anxious | define "complex" with examples | would put an unsourced definition in OMARA's mouth |
| X8 | `gs.what.format` | anxious | add "they assess for honesty and clarity, not native-speaker perfection" | asserts a DHA assessment standard no source states |
| X9 | `refusal.grounds.document-integrity` | anxious | scope "unlawful" to "submitted as originals" | would alter a sourced legal claim (I.027 is live-verbatim); translation guidance lives in doc-prep rows |

## Summary

**92 lines read.** 68 no-issue · **2 must-fix entries (4 lines)** · **14 should-fix** · **8 watch** · 9 lens flags rejected with reasons. The machine layer held up — all 117 backing findings exist and are `used`, every structured number matched its claim, and the three ART lines, both grant-rate surfaces, and the whole agents register/owes spine read clean. The two must-fixes are exactly the two places copy outran the ledger: one word against a legal-consequence source ("bans"), and the one cluster that never had a source at all (Assessment Level L3). The biggest single content gap is the missing fourth GS question (F3).

## Not covered (explicitly out of scope)

Wizard step callouts · dashboard prompts · gated teasers · conversion paths · marketing pages · auth/emails · intake-timing card · university-match card copy · NOC/health/biometrics/police/passport plan+checklist logistics bodies (sourced-module composites, not one of the six trust surfaces) · per-profile engine factor strings (goldens-pinned; class-level reviewed only).

## Human read-through checklist

- [ ] Surface 1 — refusal & recovery (19 lines, F1, F4, W3, W5, W8)
- [ ] Surface 2 — odds banner / verdict / accuracy (12 lines, F2a, F5, F9, F16)
- [ ] Surface 3 — Genuine Student (26 lines, F3, F12, F13)
- [ ] Surface 4 — working with agents (18 lines, F7, F10, W4)
- [ ] Surface 5 — eligibility / cost (13 lines, F11, W1, W2)
- [ ] Mirrors — plan + checklist (19 lines, F2b/F2c, F3, F6, F8, F14, F15, W6, W7)
- [ ] Decide F2 Option A (source it) vs Option B (interim reword)
- [ ] Approve / edit / strike each F-row → the approved set becomes slice ④·3b
- [ ] Review the 9 rejections (X1–X9) — overrule any
