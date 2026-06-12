# Nepal/SSVF financial-evidence scrutiny — F2 Option A research brief

**Date:** 2026-06-12 · **Slice:** F2-A (research-only; spec `docs/superpowers/specs/2026-06-12-f2a-ssvf-scrutiny-research-design.md`)
**Question:** can the claim cluster the ④·3b Option B reword removed ("Assessment Level L3 since 2026-01-09 · 6-month seasoning · >AUD 5,000 source-of-funds") be properly sourced — or should it permanently stay in our-recommendation voice?
**Rule honoured:** no product copy changed in this slice. Ledger rows C.145–C.148 added (`pending`, triaged); product use is a separate, user-gated slice.

## Verdicts, per decomposed claim

| # | Claim | Verdict | Best tier |
|---|---|---|---|
| 1 | Nepal moved from SSVF **evidence level 2 → 3**, announced out-of-cycle ~9 Jan 2026 | **Real and corroborated, but only sector-sourceable.** No public primary artifact exists *by design* — DHA communicates level changes through PRISMS (provider-facing) notices and the Document Checklist Tool, and told The PIE News levels are not made public. Dates wobble across outlets (8 vs 9 Jan — even VisaHQ's two items disagree). | Tier 2 (news/sector) — C.145, C.147 |
| 2 | "6-month bank seasoning" | **Not sourceable as a rule — practitioners disagree with each other.** VisaHQ: ≥3 months. Landmark: ≥6 (some say 12). Search Education: 6–12 months "**as requested by the respective university/immigration agents**" (their words — the ask isn't even attributed to DHA). DHA publishes no seasoning duration anywhere (DCT + financial-capacity content checked 2026-06-12). | Tier 3 spread — C.148 |
| 3 | ">AUD 5,000 source-of-funds threshold" | **No source at any tier.** Appears in none of the fetched coverage. Stays rejected (already dropped in ④·3b). | none |
| 4 | "Heightened financial-evidence scrutiny" (current Option B line) | **True and now better grounded** — the EL3 re-rating (C.145), the DCT's full financial enumeration (C.146, gov, fetched live), and the trigger reporting (forged bank guarantees / fake degrees, Nov–Dec 2025) all support it. The *recommendation voice* remains the honest register for the seasoning action. | Tiers 1+2 |

## Source table (tiered)

**Tier 1 — gov/primary**
- Document Checklist Tool (`immi.homeaffairs.gov.au/visas/web-evidentiary-tool`) — **fetched substantively 2026-06-12**: evidence list generated from *country of passport + education provider*; financial capacity = travel + 12 months living + tuition + school costs, or spouse/parent support with minimum annual income. No seasoning duration. No level display. → **C.146 (new)**
- SSVF + evidence-levels framework pages — remain **JS shells** to plain fetchers (1.27 MB raw / ~1.5 KB text; the preview browser is sandboxed to localhost so no render either). Mechanism stands on **C.007/C.008** (gov, browser-verified 2026-06-05, `used`): SSVF is the current framework; evidence level derives from institution-linked outcomes. C.007's caveat already recorded that "Assessment Level" is legacy market language.
- Historical context (not a finding): the pre-2016 AL regime's Schedule 5A legislated a 3-month held-funds rule — the likely origin of the practitioner "3-month baseline"; SSVF repealed that machinery.

**Tier 2 — sector/news**
- VisaHQ news desk, two items (9 + 10 Jan 2026): EL2→EL3 for India/Nepal/Bangladesh/Bhutan, out-of-cycle, Subclass 500; "bank statements covering at least **three** months"; processing 3→8 weeks; forged-documents trigger. Internal date inconsistency (announced 9 Jan vs effective 8 Jan). → **C.145 (new)**
- The PIE News (3 Oct 2025, on the Sept 2025 cycle): DHA statement on PRISMS confirming the update; **DHA spokesperson: provider levels "not made public"**; sector infers levels via the DCT; stakeholders call the system opaque. → **C.147 (new)**
- The Australia Today; The Koala News ("…PRISMS Update Flags Integrity Concerns") — independent corroboration of the Jan 2026 event and its channel.

**Tier 3 — practitioner (one-logical-source rule from the 2026-06-04 memo)**
- Landmark Edu, Search Education, PEC, Westford, AECC, R&Associates etc.: consistent on the *event*, inconsistent on *seasoning* (3 vs 6 vs 12 months), and Search Education attributes the duration ask to universities/agents, not DHA. → **C.148 (new)**

## Proposal (user's call — no copy changes until sign-off)

**(a) Restore a sourced line — partially, in two parts:**
- **(a1) Ship-ready on gov grounding (recommended):** add a Document Checklist Tool pointer beside the scrutiny line, e.g. *"See exactly what you must attach for your provider with DHA's Document Checklist Tool."* (source link → the DCT, C.146 + C.008-class mechanism). Bulletproof, primary, actionable — the strongest trust upgrade available without any attribution compromise.
- **(a2) The dated event line — your taste call:** a sector-attributed, dated line is now *defensible*, e.g. *"Sector reporting, January 2026: Nepal applications are assessed at the SSVF's strictest evidence level — expect full financial evidence up front."* (C.145; displayed source would be a news page, not DHA — a first for a banner line). If a non-gov source on the banner feels off-brand, skip a2 and keep the current recommendation sentence; C.145/C.147 stay in the ledger as the recorded justification.
- **(b) Keep recommendation wording for seasoning — permanently (recommended).** The 6-month figure is genuinely guidance: practitioners disagree (3/6/12), DHA publishes nothing, and one practitioner attributes the ask to universities/agents. C.148 records this so the question doesn't reopen. Current ④·3b wording stays as-is.
- **(c) Reject the stronger claims — permanently (recommended):** the >AUD 5,000 threshold (no source at any tier), "DHA case officers now expect…" (unattributable), and "Assessment Level L3" terminology in user-facing copy (legacy vocabulary; C.007 caveat + all current DHA material says evidence levels).

**Recommended package: a1 + b + c now; a2 if you accept sector attribution on the banner.** Any adopted copy ships as a separate user-gated product slice (wording to be locked in that slice's spec).

## Freshness note

C.145's event class is volatile by nature (the Sept-2025 item shows a regular annual update cycle; the Jan event was out-of-cycle). If a2 ships, the line should carry `volatility: "volatile"` + a `reverifyBy` around the next expected cycle (2026-09-30) so the freshness guard owns it.
