# Monetization Strategy

**Audit date:** 2026-07-10 · **Section:** Monetization · **Verdict:** No revenue model is built, and the brand's core promise makes most obvious models toxic. There is a narrow, defensible path — but the founder must decide the neutrality firewall *before* wiring the first dollar, because the trust copy has already pre-committed the disclosure standard.

## Starting position: greenfield, with a promise already made

There is **zero billing infrastructure** in the repo — no Stripe/Razorpay/eSewa/Khalti/PayPal integration, no subscription/checkout/price code in `app/` or `lib/` (grep-confirmed; the sole `payment` match is `lib/data/policy/au-payment-surcharges.ts`, a DHA card-surcharge *data* module, not product billing). Everything below is design, not audit-of-existing.

Two facts constrain every option:

1. **The trust page has already drawn the line and pre-authorized one escape hatch.** `app/(marketing)/trust/page.tsx:9,21,24` states: *"No agents. No hidden commissions. No upsells in disguise… No referral fees, no agent partnerships… We do not earn a commission when you enquire at a university. We are not a lead-generation service with an assessment layer on top."* Then line 26-28: *"If we ever earn referral revenue from a partner — for instance, if a future paid plan includes an optional referral link to a vetted service — we will say so explicitly on the page where that link appears, not buried in terms."* This is load-bearing. Any affiliate revenue is **already permitted** provided it is (a) disclosed at point-of-link and (b) not a lead-sale of contact details. Any commission-per-lead on a *student's contact info* directly violates the sentence "We do not sell your contact details to consultancies" and is off the table.

2. **The mission metric is journey-completeness.** Per CLAUDE.md, every self-serve dead-end is a bounce to a consultancy. So **paywalling the core journey is self-defeating** — a locked verdict, locked matches, or locked plan sends the exact student the app exists to keep straight into a consultancy's arms. Student-facing monetization can only ride on *incremental* value, and even there it competes with "free."

## The structural problem the founder named — head-on

Consultancies are free to students because **universities and OSHC/loan providers pay them commissions** (see `lib/data/source/au-working-with-agents.ts`, which cites the ~AUD 510 average agent commission and the 2026 onshore-transfer commission ban). A paid *student-facing* product competes against that "free" and loses. The only durable answer is the one the founder already intuits: **businesses pay, students stay free.** But there is a trap unique to *this* brand: the entire value proposition is being the anti-commission, anti-lead-gen alternative. So "businesses pay" cannot mean "we resell student leads" — that is just a consultancy with better UX, and the trust page explicitly disavows it. The workable distinction is:

> **Neutrality of the *recommendation* (verdict + ranking) is sacred and unpurchasable. Commerce is permitted only on commoditized, mandatory-anyway ancillary products, ranked by student benefit, with disclosure — and never wired into the scoring engine.**

The scoring engine (`lib/scoring/engine.ts`, `lib/matches/compute.ts`) is server-side, rule-based, versioned, and reads *only* profile inputs — no affiliate field exists or should ever exist. That architecture is the technical guarantor of neutrality. Protect it with a test that asserts no scorer reads any commercial/partner field.

## Stream-by-stream evaluation

| Stream | Who pays | Rev potential | Build difficulty | Scale | Trust risk | Verdict |
|---|---|---|---|---|---|---|
| **OSHC comparison (affiliate)** | Insurer | Med | Low (data exists) | High | **Low** if price-ranked | **Post-PMF, first commerce** |
| **Forex/remittance (affiliate)** | Wise/bank | Med | Low (data exists) | High | Low | Post-PMF |
| **Education-loan directory → lead** | Nepal bank | Med | Low | Med | **HIGH** (sells financial lead) | **Reject lead model; keep neutral directory** |
| **Student banking (AU account open)** | AU bank | Med | Low | High | Low-Med | Post-PMF |
| **B2B market intelligence / moat** | Universities, gov | **High** | High (needs MV-08 live) | High | Med (consent) | **Long-term core** |
| **University "verified listing" (no ranking influence)** | University | Med-High | Med | High | **HIGH** | Later, only with hard firewall |
| **Recruitment / agent partnership** | Consultancy | High | Low | High | **FATAL** | **Reject — brand suicide** |
| **Premium workflow subscription** | Student/family | Med | Med | High | Low-Med if core truth stays free | After MVP |
| **Human document/SOP review** | Student | Med | High (ops-heavy) | **Low** (labour) | Med (drifts into being a consultancy) | Cautious, later |
| **AI premium tools** | Student | Low | Low | High | Low | Marginal; freemium at most |
| **Application assistance** | Student | Med-High | High | Med | Med; strict boundary from visa advice | After PMF |
| **Licensed visa/legal marketplace** | Student or professional | High | High | Med | **High**; licensed providers only, no pay-to-rank | Later |
| **Interview/resume prep** | Student | Low | Med | Med | Low | Later, thin |
| **Accommodation / flights / SIM / discounts** | Vendor | Low-Med | Low | High | Low | Post-PMF, disclosed |
| **Advertising / display** | Advertiser | Low | Low | High | **High** (cheapens trust) | **Reject** |
| **API licensing / white-label / enterprise** | B2B SaaS buyer | Med-High | High | High | Low | 100k+ users |
| **Career services / job marketplace** | Employer | Med | High | Med | Med | 1M+, out-of-corridor |
| **Premium analytics for students** | Student | Low | Low | Med | Med | Marginal |

### The trust-safe winners (ancillary commerce, businesses-pay-mostly)

**OSHC is the single cleanest first dollar.** It is *mandatory* for a Subclass-500 visa, commoditized, and the data already exists: `lib/data/source/au-oshc-premiums.ts` holds five government-approved providers (nib, Bupa, Medibank + two quote-only). The trust-safe implementation is a **price-ranked comparison table** (cheapest first, never commission-first) with disclosed affiliate links — insurers pay a commission on policies they'd sell anyway, and the student gets an honest price comparison a consultancy would never show. This satisfies the trust-page escape hatch verbatim ("optional referral link to a vetted service… say so explicitly on the page"). **Risk:** if the display ever re-orders by payout, the whole brand collapses. Enforce ordering-by-price in code with a test.

**Forex/remittance** (`lib/data/source/nepal-forex-cards.ts`) can use the same pattern: commoditized, disclosed, and ranked by total student cost. Partner availability and Nepal-specific compliance must be verified before launch; no provider should be assumed monetizable merely because it is in the dataset.

**AU student banking** fits the arrival phase and can remain free to students through disclosed bank-funded acquisition partnerships. The product must first verify which banks actually offer compliant partner programs and preserve a neutral comparison, including a no-partner option.

**The Nepal education-loan directory is a trap dressed as an asset.** `lib/data/source/nepal-banks.ts` is a genuinely valuable, sourced directory of 21 NRB Class-A banks with education-loan terms (rates, tenure, financing ratios, all with `findingRefs`). The temptation is loan-lead-gen — but selling a *financial* lead on a student who just disclosed budget/funding-source is the highest-trust-risk stream in the entire matrix and reads as exactly the "lead-generation service with an assessment layer" the trust page disavows. **Keep the directory neutral and free** (sorted by interest rate, no lead capture). Its monetization value is indirect: it deepens the moat and journey-completeness, which is what actually retains the audience B2B buyers want.

### The long-term core: B2B market intelligence built on the moat

The outcome-validation loop (MV-08) already writes self-reported data, but authenticated users can also bypass the API and insert semantically forged owner rows through Supabase's Data API because RLS enforces ownership, not server derivation or state-machine validity. What is blocked is therefore **integrity first**, then verification, consent, calibration, and minimum cohorts. Aggregated outcome insight can become a major B2B asset only after those gates and independent methodology/governance exist. It must never expose individual leads or be sold as personal “visa odds.”

### The trust-killers — reject explicitly

- **Recruitment / agent / consultancy partnerships.** The hero of `/trust` is literally "No agents." Taking consultancy referral money is not a trade-off, it's brand suicide. Reject permanently.
- **Advertising / display.** Cheapens "calm authority," invites pay-to-play perception, trivial revenue. Reject.
- **Paywalling core truth.** Official rules, the readiness explanation, recommendation rationale, correction path, and core checklist must remain free. A premium tier is acceptable for incremental workflow value: family sharing, scenario comparison, calendar/reminders, exports, more application workspaces, and optional human review.
- **Unlicensed or bundled immigration assistance.** LandingPad should not provide individual immigration assistance unless it is delivered by an appropriately registered migration agent or legal practitioner. A later marketplace can create real value if professional licensing, scope, pricing, conflicts, and ranking are transparent and commercial payment never changes the recommendation.

### The ambiguous middle

- **University "verified listing" / enhanced profiles.** Universities pay to enrich their catalogue entry (media, open-day links, direct-apply) — permitted *only* if it cannot touch `compute.ts` ranking or `mapVerdict`. Technically enforceable (ranking is pure-functional off student inputs), but perceptually dangerous: the moment a paying university appears "featured," the neutrality story wobbles. Defer until the brand is strong enough to survive the scrutiny, and require a visible "sponsored info, not ranked by payment" label.
- **Human document/response review.** Plausible willingness-to-pay, but unproven and labour-bound. Define a narrow completeness/clarity scope, use qualified reviewers, separate regulated immigration advice, protect sensitive data, and test price/value rather than assuming demand.
- **AI premium tools.** Model inference can scale, but the current Guide lacks structured citation validation, persistence, feedback/evals, processor disclosure, and per-generation cost accounting. Test willingness to pay only after those foundations; keep high-stakes core answers free.

## Revenue roadmap by stage

| Stage | Primary streams | Rationale |
|---|---|---|
| **Before launch** | Capped, clearly labelled paid concierge/document-readiness pilot; one or two fixed-fee B2B design-partner studies. | Tests willingness to pay and operational load without altering rankings. Do not expose sensitive uploads until legal/consent gates clear. |
| **Immediately after launch** | Optional one-time journey pass or premium workflow; human document-completeness review with a narrow scope. | Creates direct student value while core truth remains free; reveals whether users pay for convenience or human assurance. |
| **Post-PMF** | Subscription/workflow, application operations, career review, then disclosed OSHC/forex/banking/accommodation comparisons. | Diversified value-based revenue; businesses can fund useful student services without purchasing rank. |
| **100k+ users** | Institution/employer workflow; privacy-safe market intelligence only after MV-08 integrity/verification; firewalled listings; governed data API. | Audience and reliable operations/data can become assets. Businesses pay for workflow/insight, not ranking or raw leads. |
| **1M+ users** | White-label the assessment engine to other corridors/governments; enterprise data products; career/employer streams beyond the student corridor. | The neutral scoring engine + provenance layer is licensable IP. This is where dominant revenue lives. |

## Which streams dominate in 5-10 years, and the optimal model

In 5-10 years the most plausible dominant streams are:

1. **B2B workflow and privacy-safe market intelligence** — institutions and employers paying for application operations, aggregate demand/outcome insight, and recruiting infrastructure. Do not sell individual “verified applicant flow” as leads; student-initiated sharing must be explicit.
2. **Engine/data licensing (white-label + API)** — the versioned rule engine plus a future fully governed published data bundle could be licensed to institutions/corridors that want an explainable triage layer. The current dataset has provenance/freshness escape hatches and hardcoded corridor assumptions, so this is an at-scale destination, not ready inventory.

Ancillary commerce can become a useful steady floor, but its share should be treated as an experiment rather than forecast without traffic, conversion, and partner-rate evidence.

**Recommended optimal long-term model: a two-sided trust utility.** Keep the *core truth and recommendation rationale* free forever. Let students optionally pay for workflow convenience or clearly scoped human work; let businesses pay for ancillary transactions, institution/employer workflow, and privacy-safe aggregate data. Sequence business revenue by trust-safety: (1) fixed-fee student workflow/review; (2) disclosed, benefit-ranked ancillary commerce; (3) aggregate consented intelligence; (4) firewalled enterprise/API licensing. The **one inviolable rule** — encode it as an architectural invariant and a test, not only a policy document — is that **no commercial relationship may ever be an input to `engine.ts` or `compute.ts`.** Neutrality of the verdict and ranking is the product.

## Findings

- **[P0] MV-08 capture is live but not integrity-safe for analytics.** Direct authenticated inserts can bypass API derivation/transition checks. Fix the write boundary before verification, consent, aggregation, or calibration; treat current rows as untrusted self-report inventory.
- **[P1] The Nepal bank directory invites the single most trust-toxic stream (financial lead-gen) precisely because it's the most valuable-looking asset.** `lib/data/source/nepal-banks.ts` (21 sourced banks). A loan-lead model would violate `/trust` line 24 verbatim. Decide *now* to keep it neutral, before someone proposes monetizing it.
- **[P2] `/privacy` and `/terms` are still unpublished (MV-05 blocked on founder).** No monetization stream — especially data-driven B2B — can legally launch without them. This is a hard prerequisite, not polish.
- **[P2] The trust page already pre-authorized disclosed affiliate revenue** (`app/(marketing)/trust/page.tsx:26-28`). OSHC comparison (`au-oshc-premiums.ts`) and forex (`nepal-forex-cards.ts`) can be built trust-safely today *if* ranked by student benefit; the copy standard is already set.
- **[P2] No architectural guard prevents a future commercial field from entering the scoring engine.** Neutrality currently rests on convention. Add a test asserting no scorer in `lib/scoring/**` or `lib/matches/compute.ts` reads any partner/commission/sponsored field — make the firewall executable.
- **[P3] Recruitment/agent partnerships and display advertising must be explicitly ruled out in writing** so no future growth-pressure decision reopens them; they are brand-fatal given the "No agents" hero.
