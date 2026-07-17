# Competitive Analysis — LandingPad (MeroVisa)

*Auditor lens: Nepal education-consultancy market strategist. Audit date 2026-07-10. Corridor: Nepal → Australia.*

## The honest frame

LandingPad's founder thesis is that the app **replaces the local consultancy**, and that every self-serve dead-end is a bounce back to one. That framing is half right and half a trap. The consultancy is not primarily an *information* provider that LandingPad can out-inform — it is a **free, full-service, do-it-for-you paperwork-and-lodgement operator** funded by college commissions. LandingPad today competes on the *first 10%* of the journey (should I go, where do I stand, what do I need) and abandons the student at the *90%* the consultancy actually monetises (fill the forms, lodge the visa, arrange the loan, chase the CoE). Positioning LandingPad as a consultancy *replacement* over-claims; positioning it as the **honest second opinion that makes you un-exploitable by the consultancy** is defensible and true to the code that exists.

Below, each competitor: where LandingPad is genuinely stronger *today*, weaker *today*, and the one defensible wedge.

---

## 1. Nepali education consultancies (the real incumbent)

**Their economics (the thing the product exists to expose).** Consultancies are *free to students* because destination colleges pay them a placement commission — typically ~15–30% of first-year tuition per enrolled student (industry-standard agent commission; *uncertain on exact Nepal figures, mark as estimate*). This is a structural conflict: the agent is financially motivated to steer students toward **commission-paying colleges**, not best-fit or lowest-risk ones. LandingPad's `/trust` page names this directly — "No agents. No hidden commissions... We do not earn a commission when you enquire" (`app/(marketing)/trust/page.tsx:9,24`) — and the scoring engine is server-side and rule-based (`lib/scoring/engine.ts`), so verdicts cannot be silently tilted toward a paying partner. **This is the single most defensible claim in the product and it is real in code.**

| | LandingPad today | Consultancy |
|---|---|---|
| Cost to student | Free | Free (commission-funded) |
| Conflict of interest | None wired (`/trust`, rule engine) | Structural — pushes paying colleges |
| Honest "you're a Reach" verdict | Yes — `mapVerdict` will return "reach" (`lib/scoring/verdict.ts`) | Rare — a Reach student is still a commission if placed |
| Fills your visa forms | **No** (guide *refuses* to draft — `system-prompt.ts` rule 3) | Yes, end-to-end |
| Lodges Subclass 500 | No | Yes |
| Arranges loan / bank guarantee | Explains only | Yes, hand-holds |
| IELTS/PTE prep | No | Yes (often in-house classes) |
| Human accountability when it goes wrong | None | A person in an office |

**Where LandingPad is genuinely stronger today.** (a) An **unconflicted verdict** a student can trust *before* walking into an office — the entire value of a second opinion. (b) **Sourced, dated figures**: the DHA AUD 29,710 living-capacity number carries `effectiveDate 2024-05-10, lastVerified 2026-06-07` and a gov URL (`lib/data/policy/au-cost-of-living.ts`), and the 2026-07-02 reverify scout caught the Subclass-500 fee jump to AUD 2,500 — a consultancy front-desk will quote you last year's number. (c) **The financial-capacity gate** (`lib/scoring/financial.ts`) tells a student honestly they *cannot fund this* before a consultancy takes a deposit to find out. (d) The guide's **refusal to write the SOP** (`system-prompt.ts` rule 3) actively protects genuine-student credibility — the exact thing consultancy-ghostwritten applications destroy.

**Where LandingPad is weaker today — and it is not close. [P1]** The consultancy *does the work*. LandingPad's own `/how` page admits "uploading doesn't change your verdict or match scores" (`app/(marketing)/how/page.tsx:80`) — the documents vault is an **organiser, not a processor**. There is no form-filling, no lodgement, no CoE tracking beyond a checklist row, no human to call at 11pm before a deadline. A student who reaches the end of the plan still has to *go somewhere* to actually lodge — and the only "somewhere" is the consultancy the app told them to distrust. **This is the strategic hole**: the app builds distrust of the consultancy without building a replacement for the consultancy's actual labour, so the most likely real-world outcome is *"LandingPad told me I'm Possible, now I'll take that to an agent to do the paperwork."* That is a useful product — but it is a **companion**, not a replacement, and the roadmap should stop pretending otherwise.

**Second structural weakness [P1]:** the **only account path is Google OAuth** (`components/auth/auth-card.tsx:61` — "Google is the only way to sign in for now"). A meaningful share of the Nepali student cohort lives in Facebook/Messenger, not Google, and the consultancy's onboarding is *"walk in, we'll handle it."* LandingPad's onboarding is *"have a Google account, don't lose your session for 3 days, or your assessment is gone forever"* (anonymous recovery requires Google claim before `ASSESSMENT_TTL_DAYS` expiry — `lib/assessments/expiry.ts`; no email/anonymous retrieval). Against a zero-friction human incumbent, this is a self-inflicted funnel wound.

---

## 2. Official government sites (Home Affairs, CRICOS, VEVO)

**Stronger today.** LandingPad *pre-digests* the gov data into a Nepal-specific, personalised verdict. Home Affairs will tell you the AUD 29,710 figure and the 6.0 IELTS visa floor; it will **not** tell a specific Kathmandu bachelor's-in-CS student with a 3.2 CGPA and a 2-year gap where they personally stand. LandingPad's engine composes those into a banded verdict + factor bars (`lib/scoring/engine.ts`, `visa.ts`, `financial.ts`), and the CRICOS/university minimums are matched against the student's declared grade/English (`lib/matches/compute.ts`). The dataset also encodes **Nepal-specific** risk the gov site never surfaces: evidence levels (`lib/matches/evidence.ts`), refusal-recovery guidance (`lib/data/source/nepal-refusal-recovery.ts`), working-with-agents cautions (`au-working-with-agents.ts`).

**Weaker today.** The gov sites are the **source of truth and never stale**; LandingPad is a *cache* with a freshness cliff. Fifteen facts reverify on the single date 2027-07-01 (a simultaneous staleness event), and the FX rates that gate the financial verdict (`lib/data/policy/fx-rates.ts`, NPR 135/USD) are hand-entered "internal-heuristic" approximations with no `reverifyBy` — a drifted NPR/AUD rate silently changes who passes the capacity gate. A student who wants *the authoritative current number* must still go to immi.homeaffairs.gov.au. LandingPad mitigates this honestly (every figure is sourced and dated; the guide cites the source per figure — `system-prompt.ts` rule 2), but it cannot *win* on authority against the primary source. **Defensible only as an interpreter, never as the authority.**

---

## 3. University websites

**Stronger today.** LandingPad aggregates ~64 programs across 15 AU universities into one comparable, verdict-banded list (`lib/programs/seed.ts`; DB seed). A student comparing Melbourne vs RMIT vs Deakin CS otherwise opens 15 tabs and mentally normalises grade/English/tuition themselves. LandingPad does the normalisation and attaches a per-program Strong/Possible/Reach (`compute.ts`).

**Weaker today [P2].** Coverage is **thin and mostly derived, not primary**. 15 universities is a fraction of the ~40+ CRICOS providers Nepali students actually apply to; many program English/grade minimums are `data_quality='derived'` (inferred, not scraped from the provider page) per the migration provenance. A student whose target university isn't in the 15 gets *nothing* — and worse, a non-AU destination short-circuits to an "we don't cover this yet" dead-end (`UnsupportedDestinationNotice`). The university's own site is always more complete and current for *that* university. LandingPad wins on *comparison breadth within its 15*, loses on *depth and completeness*.

---

## 4. Reddit / Facebook groups / student communities

**Stronger today.** LandingPad is **calm, private, sourced, and non-adversarial**. Facebook groups for Nepali students are dominated by consultancy-run pages, sponsored "success stories," survivorship bias (nobody posts their refusal), and confidently-wrong peer advice. LandingPad's every figure is dated and sourced; PostHog captures band-only, never scores or PII (`lib/analytics/events.ts`); no lead-selling. For a student who has been burned by a Facebook agent, the *tone* alone (`system-prompt.ts` rule 6, sentence-case, no overpromising) is a differentiator.

**Weaker today [P2].** Communities have the two things LandingPad structurally cannot fake: **real recent outcomes** ("I got my 500 granted last week with these docs, Evidence Level 2") and **human reassurance**. This is exactly what MV-08 (the outcome-validation loop, "the moat") is meant to capture — and it is **shipped-but-inert**: the tables exist (`program_predictions`, `outcome_events`) but *no request path writes them* (confirmed inert in ground truth). Until that loop turns on, communities beat LandingPad on the single most persuasive artefact in the market: *proof that someone like me made it.* The moat is dug but not filled.

---

## 5. YouTube creators (Nepali study-abroad channels)

**Stronger today.** LandingPad is **personalised and non-monetised**. YouTube creators give generic timelines and are frequently consultancy-sponsored (the same conflict, in video form). LandingPad answers *your* situation, not the median viewer's.

**Weaker today.** Creators own **trust-through-face and vernacular** (Nepali-language, relatable, a human who "made it"). LandingPad is English-only (no Nepali UI surfaced in the codebase) and faceless. For discovery and top-of-funnel persuasion, a creator with 200k subscribers beats a website with no distribution. LandingPad has **no acquisition channel visible in the repo** — no referral, no share mechanic beyond `SparkleCta`. A great verdict engine no one is sent to is a tree falling in an empty forest.

---

## 6. Generic AI assistants (ChatGPT / Gemini) — *be honest here*

**The honest truth: ChatGPT/Gemini answer AU student-visa questions well, for free, in Nepali, right now.** "What's the IELTS requirement for a Subclass 500?" or "How much bank balance do I need?" — a frontier model answers competently and conversationally. This is LandingPad's **most under-acknowledged competitor** and the founder should not wave it away.

**Where LandingPad is genuinely stronger [defensible].** (a) **Grounding + citation**: the guide grounds *only* in dated sourced facts and cites the source per figure (`buildGuideContext`, `system-prompt.ts` rules 1–2); ChatGPT will confidently state a *2023* fee with no date and no source, and hallucinate CoE specifics. (b) **Personalised to a persistent profile**: LandingPad's verdict runs a versioned rule engine over 13 saved profile sections; ChatGPT starts cold every session and cannot compute a defensible banded verdict against CRICOS minimums. (c) **Refusal discipline**: the guide *will not* write the SOP (rule 3) — ChatGPT will happily ghostwrite one and torpedo the student's genuine-student credibility. (d) **Structured downstream workflow**: matches → plan → per-program checklist → documents vault is a *system*, not a chat turn.

**Where LandingPad is weaker.** ChatGPT is *free, multilingual, zero-onboarding, infinitely broad, and never has a 3-day expiry or a Google-only gate.* A student who just wants a quick answer has no reason to sign up for LandingPad. LandingPad's advantage collapses to **"the parts that must be sourced, personalised, and honest"** — which is real, but narrow.

---

## The defensible wedge — where to double down

Ranked by defensibility against *all six* competitors:

1. **Unconflicted, sourced, personalised verdict [double down].** No competitor combines *no commission conflict* + *dated gov-sourced data* + *personalised rule-based band*. Consultancies have the conflict; gov sites lack personalisation; AI lacks grounding + persistence; communities lack rigor. This is the core and it is real in code (`engine.ts`, `verdict.ts`, `/trust`).

2. **The outcome-validation loop (MV-08) [the actual moat — but it is INERT].** *Real Nepali outcomes tied to the profile that predicted them* is the one asset that would beat communities, creators, and AI simultaneously — and it is the founder's own stated moat. It is shipped-to-DB but **writes nothing**. Every quarter it stays inert, the community's "I got approved last week" advantage compounds. **This is the highest-leverage unblock in the competitive set.**

3. **Refusal-risk / genuine-student / working-with-agents corridor knowledge [double down].** The Nepal-specific trust-defense content (`nepal-refusal-recovery.ts`, `au-genuine-student.ts`, `au-working-with-agents.ts`) is knowledge the consultancy has an incentive to *withhold* (it names their conflict) and that gov sites and AI don't localise. This is genuinely differentiated.

**Where NOT to compete:** paperwork/lodgement labour (consultancy wins), authority on raw figures (gov wins), distribution/vernacular reach (creators + FB win), quick generic answers (AI wins). Stop framing the product as a full replacement; it dilutes the one true claim.

---

## Positioning statement I would actually use

> **"Know exactly where you stand — before any agent, and before you pay anyone.**
> LandingPad gives Nepali students an honest Strong / Possible / Reach verdict for studying in Australia, built from current government figures we date and cite, with no agent taking a commission on your future. We won't fill your forms or write your application — because a case officer can tell, and because the win has to be genuinely yours. We'll show you the truth; you decide who you trust with the rest."

This is defensible because every clause maps to code that exists (`/trust`, `verdict.ts`, sourced data layer, guide refusal rule) and it *concedes the paperwork ground* honestly rather than over-claiming a replacement the product does not deliver.

---

### Findings summary

- **[P1]** Product positions as a consultancy *replacement* but delivers only pre-lodgement assessment; the monetised 90% (form-fill, lodgement, loan) is explicitly out of scope (`/how` admits uploads don't process; guide refuses to draft). Reframe to "honest second opinion / companion," or the strategy over-promises.
- **[P1]** Google-only auth (`auth-card.tsx:61`) + 3-day anonymous-expiry with no email recovery is a severe funnel disadvantage vs a zero-friction walk-in incumbent.
- **[P1]** MV-08 outcome loop — the founder's stated moat and the one asset that beats communities/creators/AI — is shipped-but-inert (no write path). Highest-leverage competitive unblock.
- **[P2]** No visible acquisition/distribution channel in repo; creators and FB groups own top-of-funnel. A verdict engine with no traffic loses by default.
- **[P2]** ChatGPT/Gemini are an under-acknowledged free, multilingual competitor for quick answers; LandingPad's edge narrows to grounded+personalised+honest, which must be marketed explicitly.
- **[P2]** University/program coverage is 15 unis / ~64 programs, mostly `data_quality='derived'`; non-AU destinations dead-end. Thin vs the full university-site + CRICOS surface.
- **[P3]** FX rates gating the financial verdict are hand-entered heuristics with no `reverifyBy` (`fx-rates.ts`) — a silent staleness risk against gov authority.
