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
| **Premium subscription (core journey)** | Student | Low | Med | Med | High (paywall = bounce) | **Reject** |
| **Human document/SOP review** | Student | Med | High (ops-heavy) | **Low** (labour) | Med (drifts into being a consultancy) | Cautious, later |
| **AI premium tools** | Student | Low | Low | High | Low | Marginal; freemium at most |
| **Application/visa assistance** | Student | Med | High | Low | **High** (regulated: OMARA/MARA) | Reject for MVP |
| **Interview/resume prep** | Student | Low | Med | Med | Low | Later, thin |
| **Accommodation / flights / SIM / discounts** | Vendor | Low-Med | Low | High | Low | Post-PMF, disclosed |
| **Advertising / display** | Advertiser | Low | Low | High | **High** (cheapens trust) | **Reject** |
| **API licensing / white-label / enterprise** | B2B SaaS buyer | Med-High | High | High | Low | 100k+ users |
| **Career services / job marketplace** | Employer | Med | High | Med | Med | 1M+, out-of-corridor |
| **Premium analytics for students** | Student | Low | Low | Med | Med | Marginal |

### The trust-safe winners (ancillary commerce, businesses-pay-mostly)

**OSHC is the single cleanest first dollar.** It is *mandatory* for a Subclass-500 visa, commoditized, and the data already exists: `lib/data/source/au-oshc-premiums.ts` holds five government-approved providers (nib, Bupa, Medibank + two quote-only). The trust-safe implementation is a **price-ranked comparison table** (cheapest first, never commission-first) with disclosed affiliate links — insurers pay a commission on policies they'd sell anyway, and the student gets an honest price comparison a consultancy would never show. This satisfies the trust-page escape hatch verbatim ("optional referral link to a vetted service… say so explicitly on the page"). **Risk:** if the display ever re-orders by payout, the whole brand collapses. Enforce ordering-by-price in code with a test.

**Forex/remittance** (`lib/data/source/nepal-forex-cards.ts` — Wise, NIC Asia, etc.) is the same pattern: commoditized, disclosed, ranked by fee. Wise's affiliate program is real revenue and genuinely student-positive (Nepali students overpay on remittance constantly).

**AU student banking** (arrival-stage account opening) — CBA/NAB/ANZ pay for verified new-arrival account opens. Fits the arrival phase of the plan generator. Low trust risk if presented as a neutral list.

**The Nepal education-loan directory is a trap dressed as an asset.** `lib/data/source/nepal-banks.ts` is a genuinely valuable, sourced directory of 21 NRB Class-A banks with education-loan terms (rates, tenure, financing ratios, all with `findingRefs`). The temptation is loan-lead-gen — but selling a *financial* lead on a student who just disclosed budget/funding-source is the highest-trust-risk stream in the entire matrix and reads as exactly the "lead-generation service with an assessment layer" the trust page disavows. **Keep the directory neutral and free** (sorted by interest rate, no lead capture). Its monetization value is indirect: it deepens the moat and journey-completeness, which is what actually retains the audience B2B buyers want.

### The long-term core: B2B market intelligence built on the moat

The outcome-validation loop (MV-08, "the moat") is shipped-but-inert — `program_predictions` / `application_attempts` / `outcome_events` tables exist with immutable/append-only RLS, but **no request path writes them** (confirmed in ground-truth; blocked on founder legal gates: PIA, minor-consent, VEVO ToS). This is the **single most valuable long-term asset in the codebase.** Once live and at scale, aggregated, anonymized, consented outcome data answers questions no one else in the Nepal→Australia corridor can: *which programs actually admit which profiles, what visa-grant rates look like by profile band, where the real bottlenecks are.* That is sellable to **universities** (which Nepali profiles convert), to **DFAT/education bodies**, and it *strengthens* rather than compromises neutrality — it's evidence, not advertising. **Caveat the founder must not skip:** selling outcome insight requires airtight consent and anonymization (the minor-consent gate is real — many applicants are 17-18), and it must be *aggregate* intelligence, never individual lead resale. Cross that line and it becomes the thing the brand exists to oppose.

### The trust-killers — reject explicitly

- **Recruitment / agent / consultancy partnerships.** The hero of `/trust` is literally "No agents." Taking consultancy referral money is not a trade-off, it's brand suicide. Reject permanently.
- **Advertising / display.** Cheapens "calm authority," invites pay-to-play perception, trivial revenue. Reject.
- **Paywalling the core journey (premium subscription on verdict/matches/plan).** Every gated step is a bounce to a consultancy — directly anti-mission. The existing "gated teasers" (blur peek) gate on *account creation*, not payment; keep it that way.
- **Application/visa assistance as a paid service.** Regulated (OMARA/MARA), high-ops, and it turns the app *into* a consultancy — the exact entity it's replacing. `lib/guide/system-prompt.ts` already hard-rules "never write applications." Don't reverse that for money.

### The ambiguous middle

- **University "verified listing" / enhanced profiles.** Universities pay to enrich their catalogue entry (media, open-day links, direct-apply) — permitted *only* if it cannot touch `compute.ts` ranking or `mapVerdict`. Technically enforceable (ranking is pure-functional off student inputs), but perceptually dangerous: the moment a paying university appears "featured," the neutrality story wobbles. Defer until the brand is strong enough to survive the scrutiny, and require a visible "sponsored info, not ranked by payment" label.
- **Human document/SOP review.** Real willingness-to-pay, but labour-bound (doesn't scale), and it drifts toward being a consultancy. If done, frame narrowly ("a human checks your bank statement meets DHA format") and price at cost, not margin.
- **AI premium tools.** The guide runs on cheap DeepSeek (`lib/guide/deepseek.ts`), so marginal cost is near-zero, but so is willingness-to-pay in this market. At most a soft usage cap with a free tier — not a revenue pillar.

## Revenue roadmap by stage

| Stage | Primary streams | Rationale |
|---|---|---|
| **Before launch** | **None.** | Building trust + journey-completeness. Any monetization now poisons the well before the audience exists. Legal gates (MV-05 `/privacy` + `/terms` still unpublished; MV-08 consent) must clear first. |
| **Immediately after launch** | Still none / measure only. | Instrument conversion + retention (PostHog already wired, `lib/analytics/events.ts`). Prove the funnel replaces consultancies before charging anyone. |
| **Post-PMF** | OSHC affiliate → forex → AU banking (all disclosed, ranked-by-benefit). | Commoditized ancillary commerce that businesses fund and students benefit from. First real revenue with lowest trust cost. |
| **100k+ users** | B2B market intelligence (MV-08 live) + university verified listings (firewalled) + API licensing of the sourced dataset (`lib/data/**`, 1118 findings). | Audience + data are now assets. Businesses pay for access/insight, not ranking. |
| **1M+ users** | White-label the assessment engine to other corridors/governments; enterprise data products; career/employer streams beyond the student corridor. | The neutral scoring engine + provenance layer is licensable IP. This is where dominant revenue lives. |

## Which streams dominate in 5-10 years, and the optimal model

In 5-10 years the revenue mix will **not** be student subscriptions and **not** ancillary affiliate (those are bridge revenue — real but capped). The dominant streams will be:

1. **B2B market intelligence + verified applicant flow** — universities and education bodies paying for high-intent, pre-qualified, *consented* corridor data and access. This compounds with the outcome moat and scales without labour.
2. **Engine/data licensing (white-label + API)** — the versioned rule-based scoring engine plus the provenance-carrying dataset (`lib/data/**`, every datum sourced + `lastVerified`) is licensable to new corridors and to institutions that want an honest triage layer. Trust-neutral by construction.

Ancillary affiliate (OSHC/forex/banking) remains a steady 15-30% mid-term but plateaus.

**Recommended optimal long-term model: a two-sided trust utility.** Keep the *entire* student side free forever — that is the moat and the mission. Monetize the business side in strict priority order of trust-safety: (1) disclosed, benefit-ranked ancillary commerce on mandatory commodities (OSHC/forex/banking); (2) aggregate, consented market intelligence from the outcome loop; (3) firewalled verified listings and engine/data licensing. The **one inviolable rule** — encode it as an architectural invariant and a test, not a policy doc — is that **no commercial relationship may ever be an input to `engine.ts` or `compute.ts`.** Neutrality of the verdict and the ranking is the product. Sell everything around it; sell the recommendation itself and there is nothing left to sell.

## Findings

- **[P1] The most valuable long-term revenue asset (MV-08 outcome moat) is inert and legally blocked.** `program_predictions`/`application_attempts`/`outcome_events` are shipped with no write path (ground-truth confirmed) and blocked on PIA/minor-consent gates. Every quarter it stays inert, the compounding data asset that underpins the dominant 5-10yr stream doesn't start compounding. Prioritize the consent/legal gate.
- **[P1] The Nepal bank directory invites the single most trust-toxic stream (financial lead-gen) precisely because it's the most valuable-looking asset.** `lib/data/source/nepal-banks.ts` (21 sourced banks). A loan-lead model would violate `/trust` line 24 verbatim. Decide *now* to keep it neutral, before someone proposes monetizing it.
- **[P2] `/privacy` and `/terms` are still unpublished (MV-05 blocked on founder).** No monetization stream — especially data-driven B2B — can legally launch without them. This is a hard prerequisite, not polish.
- **[P2] The trust page already pre-authorized disclosed affiliate revenue** (`app/(marketing)/trust/page.tsx:26-28`). OSHC comparison (`au-oshc-premiums.ts`) and forex (`nepal-forex-cards.ts`) can be built trust-safely today *if* ranked by student benefit; the copy standard is already set.
- **[P2] No architectural guard prevents a future commercial field from entering the scoring engine.** Neutrality currently rests on convention. Add a test asserting no scorer in `lib/scoring/**` or `lib/matches/compute.ts` reads any partner/commission/sponsored field — make the firewall executable.
- **[P3] Recruitment/agent partnerships and display advertising must be explicitly ruled out in writing** so no future growth-pressure decision reopens them; they are brand-fatal given the "No agents" hero.
