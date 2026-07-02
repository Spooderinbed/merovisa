# FY2026-27 re-verify scout — 1 July 2026 boundary (2026-07-02)

**What this is:** live-source verification of the 16 records that hit `provenance.reverifyBy: "2026-07-01"`,
gathered by a 4-agent read-only Workflow on 2026-07-02. This is the evidence packet for the fix slice (MV-80):
`tests/data/freshness.test.ts` is designed-red until each record is re-verified and its `lastVerified` +
`reverifyBy` move forward. Values below were read from the authoritative live sources cited per record —
do not blind-copy without opening the source during the fix.

**Headline: 12 of 16 records CHANGED** (all DHA visa charges +~25%, all wage rows via the AWR 2026 6% rise,
the ART fee indexed; all 4 ATO tax figures unchanged).


## DHA visa application charges (student subclass 500 + skilled visas)

Confidence: **high** · 5 records · 5 changed

### AU_SUBCLASS_500_APPLICATION_CHARGE_AUD (lib/data/policy/au-visa-fees.ts) — CHANGED

- **In code:** AUD 2,000 (base application charge, primary applicant)
- **Live value:** AUD 2,500.00 (Student visa (subclass 500) — 'All other students' stream, base application charge)
- **Source:** https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges/current-visa-pricing
- **Note:** Effective 1 July 2026 (~25% rise). Verified live via the DHA pricing API (/_layouts/15/api/data.aspx/GetPriceList) that renders the official Visa Pricing Table; the visa-listing page the record cites (student-500) loads the same figure via JS. Nuance: concessional streams exist — ELICOS and Non-Award sectors are AUD 2,050; Defence/DFAT-sponsored and secondary-exchange are AUD 0 — but the standard 'all other students' charge relevant to a Nepal→Australia higher-ed applicant is 2,500. Corroborated by studyaustralia.gov.au announcement of the 1 July 2026 increase.

### AU_SKILLED_VISA_CHARGES[0] (skilled-491) — CHANGED

- **In code:** AUD 4,910 (baseFeeAud)
- **Live value:** AUD 6,140.00 (Skilled Work Regional (Provisional) visa (subclass 491), base application charge)
- **Source:** https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges/current-visa-pricing
- **Note:** Effective 1 July 2026. Verified via the DHA GetPriceList API feeding the official pricing table; single 491 row, no stream split.

### AU_SKILLED_VISA_CHARGES[1] (regional-191) — CHANGED

- **In code:** AUD 505 (baseFeeAud)
- **Live value:** AUD 630.00 (Permanent Residence (Skilled Regional) visa (subclass 191), Regional Provisional stream, base application charge)
- **Source:** https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges/current-visa-pricing
- **Note:** Effective 1 July 2026. Verified via the DHA GetPriceList API; row explicitly names the Regional Provisional stream, matching the repo record's cited page.

### AU_SKILLED_VISA_CHARGES[2] (skilled-189) — CHANGED

- **In code:** AUD 4,910 (baseFeeAud)
- **Live value:** AUD 6,135.00 (Skilled Independent visa (subclass 189) — Points-tested stream, base application charge)
- **Source:** https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges/current-visa-pricing
- **Note:** Effective 1 July 2026. Verified via the DHA GetPriceList API (Hong Kong stream is also 6,135). Note 189 is AUD 6,135 while 491/186 are AUD 6,140 — a genuine 5-dollar difference in the DHA table, not a typo.

### AU_SKILLED_VISA_CHARGES[3] (employer-186) — CHANGED

- **In code:** AUD 4,910 (baseFeeAud)
- **Live value:** AUD 6,140.00 (Employer Nomination Scheme visa (subclass 186), base application charge — same across Labour agreement and Temporary Residence Transition streams in the DHA table)
- **Source:** https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges/current-visa-pricing
- **Note:** Effective 1 July 2026. Verified via the DHA GetPriceList API; both 186 stream rows returned show AUD 6,140.00, so the 'from' figure on the umbrella visa-listing page the record cites is 6,140.


## ATO tax figures for temporary residents / students (AU FY2026-27 boundary re-verify)

Confidence: **high** · 4 records · 0 changed

### AU_TAX_FIGURES[1] — unchanged

- **In code:** 18200 AUD (tax-free threshold, full-year Australian resident)
- **Live value:** 18200 AUD
- **Source:** https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/coming-to-australia/tax-free-threshold-for-newcomers-to-australia
- **Note:** Confirmed live on the record's own source page (ATO 'Tax-free threshold for newcomers', last updated 3 June 2026): 'you pay no tax on the first $18,200'. Cross-checked against ATO 'Tax rates - Australian resident' (last updated 1 June 2026), whose latest table (2025-26) shows 0-$18,200 = Nil. The threshold is unchanged for FY2026-27; the legislated 1 July 2026 change is the second-bracket rate (16c -> 15c per $1 over $18,200), which does not affect this record. Suggest next reverifyBy 2027-07-01.

### AU_TAX_FIGURES[2] — unchanged

- **In code:** 35 % (DASP rate on the taxable component's taxed element, non-WHM)
- **Live value:** 35 %
- **Source:** https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/temporary-residents-and-superannuation/departing-australia-superannuation-payment-dasp
- **Note:** Confirmed in the live DASP tax-rates table (page last updated 21 April 2026, fetched fresh 2026-07-02): 'Taxable component - taxed element | 35% (ordinary/non-WHM)'. DASP rates are set in tax law, not annually indexed at the FY boundary; no 1 July 2026 change announced. Matches the record's note that it applies to non-WHM temporary residents (e.g. student visa holders).

### AU_TAX_FIGURES[3] — unchanged

- **In code:** 45 % (DASP rate on the taxable component's untaxed element, non-WHM)
- **Live value:** 45 %
- **Source:** https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/temporary-residents-and-superannuation/departing-australia-superannuation-payment-dasp
- **Note:** Confirmed in the same live DASP table: 'Taxable component - untaxed element | 45% (ordinary/non-WHM)'. Untaxed elements are rare for students (untaxed-source funds); rate unchanged across the 1 July 2026 boundary.

### AU_TAX_FIGURES[4] — unchanged

- **In code:** 65 % (DASP rate for working holiday makers)
- **Live value:** 65 %
- **Source:** https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/temporary-residents-and-superannuation/departing-australia-superannuation-payment-dasp
- **Note:** Confirmed in the live DASP table: WHM rate 65% on both taxed and untaxed elements (applies to DASP paid on/after 1 July 2017 where the person held a 417/462 or associated bridging visa). The record's caveat stands: 65% is the WHM-only rate and must not be applied to non-WHM student visa holders (35%/45%).


## Australian student worker wages (Fair Work national minimum wage + Hospitality Award MA000009 casual penalty rates)

Confidence: **high** · 6 records · 6 changed

### AU_STUDENT_WORKER_WAGES[1] — CHANGED

- **In code:** AUD 24.95/hour (national-minimum-wage, status: current, effectiveDate 2025-07-01)
- **Live value:** AUD 26.44/hour ($1,004.90/week), effective from the first full pay period on or after 1 July 2026
- **Source:** https://www.fairwork.gov.au/pay-and-wages/minimum-wages
- **Note:** FWO page states verbatim: 'As of 1 July 2026, the National Minimum Wage is $26.44 per hour or $1,004.90 per week' (6% increase per AWR 2026; page content last updated 2026-07-01). The 24.95 rate expired at the FY boundary. When updating: this record and [2] describe the same now-in-force rate, so the pair likely collapses to one 'current' record (plus optionally a superseded/historical one).

### AU_STUDENT_WORKER_WAGES[2] — CHANGED

- **In code:** AUD 26.44/hour (national-minimum-wage, status: announced, effectiveDate 2026-07-01)
- **Live value:** AUD 26.44/hour ($1,004.90/week) — now IN FORCE (current), effective first full pay period on or after 1 July 2026
- **Source:** https://www.fairwork.gov.au/about-us/workplace-laws/annual-wage-review/annual-wage-review-2026
- **Note:** The hourly figure is UNCHANGED (26.44 verified correct); what changed is lifecycle: status 'announced' and the provenance note 'not yet in force as of 2026-06-05' are now stale — the rate took effect 1 July 2026. Record should flip to status 'current'. No FY2027-28 rate has been announced yet (next AWR is mid-2027).

### AU_STUDENT_WORKER_WAGES[3] — CHANGED

- **In code:** AUD 30.35/hour (Hospitality Award adult casual introductory, ordinary hours, ppc 2025-07-01)
- **Live value:** AUD 32.18/hour (125% of new introductory base $25.74/hour)
- **Source:** https://awards.fairwork.gov.au/MA000009.html
- **Note:** Award Table B.2.3 'Adult casual employees—ordinary and penalty rates', Introductory level, marked 'ppc 01Jul26' (first full pay period on/after 1 July 2026). Introductory base rose to $25.74/hr ($978.10/wk) via the AWR 2026 entry-level floor — NOT a plain 4.75% uplift (which would give ~25.43). Multiplier unchanged at 125%. The shared HOSPITALITY_CASUAL_NOTE string ('ppc 2025-07-01') is stale for records [3]-[6].

### AU_STUDENT_WORKER_WAGES[4] — CHANGED

- **In code:** AUD 36.42/hour (Hospitality Award adult casual introductory, Saturday, ppc 2025-07-01)
- **Live value:** AUD 38.61/hour (150% of introductory base $25.74/hour)
- **Source:** https://awards.fairwork.gov.au/MA000009.html
- **Note:** Same table B.2.3, Saturday column, ppc 01Jul26. Penalty percentage unchanged at 150%; increase driven entirely by the new introductory base rate.

### AU_STUDENT_WORKER_WAGES[5] — CHANGED

- **In code:** AUD 42.49/hour (Hospitality Award adult casual introductory, Sunday, ppc 2025-07-01)
- **Live value:** AUD 45.05/hour (175% of introductory base $25.74/hour)
- **Source:** https://awards.fairwork.gov.au/MA000009.html
- **Note:** Same table B.2.3, Sunday column, ppc 01Jul26. Penalty percentage unchanged at 175%.

### AU_STUDENT_WORKER_WAGES[6] — CHANGED

- **In code:** AUD 60.70/hour (Hospitality Award adult casual introductory, public holiday, ppc 2025-07-01)
- **Live value:** AUD 64.35/hour (250% of introductory base $25.74/hour)
- **Source:** https://awards.fairwork.gov.au/MA000009.html
- **Note:** Same table B.2.3, public holiday column, ppc 01Jul26. Penalty percentage unchanged at 250%. Caution for the updater: the award document also contains a casino-gaming stream (Table 4 / B.6.x) with a DIFFERENT introductory base ($26.13) — the general hospitality stream (Table 3 / B.2.3) is the correct one for these records.


## Nepal refusal-recovery (lib/data/source/nepal-refusal-recovery.ts)

Confidence: **high** · 1 records · 1 changed

### NEPAL_REFUSAL_RECOVERY[11] — CHANGED

- **In code:** AUD 3,580 (id recovery-cost, ART application fee for review of most migration decisions; value: 3580, unit: AUD; summary text also says "AUD 3,580")
- **Live value:** AUD 3,727 (application fee for a review of most migration decisions)
- **Source:** https://www.art.gov.au/applying-review/immigration-and-citizenship
- **Note:** Annual ART fee indexation took effect 1 July 2026. Verified directly on the record's own cited source page (art.gov.au/applying-review/immigration-and-citizenship: "The application fee for a review of most migration decisions is $3,727") and cross-confirmed on art.gov.au/help-and-resources/fees and the ART news item art.gov.au/about/news-and-updates/upcoming-application-fee-increase (published 22/06/2026): new fee applies to any application fee PAID on or after 1 July 2026, even if the application was lodged before that date. The 50% financial-hardship reduction (adjacent record index 12, recovery-hardship) still applies unchanged. Update needed: value 3580 -> 3727, summary copy, provenance note, and roll reverifyBy forward (fee indexes annually each 1 July, so 2027-07-01). Also check any reconcile test pinning I.045 to 3580.


## Fix-slice guidance (MV-80)

- Update each changed value; set `lastVerified: "2026-07-02"` on every record above (changed or not — all 16 were re-verified); set `reverifyBy: "2027-07-01"` for annual-volatility records.
- Wages: record [1] (24.95 current) vs [2] (26.44 announced) — 26.44 is now IN FORCE; collapse/re-status the pair rather than leaving a stale "announced" row.
- 189 is AUD 6,135 while 491/186 are AUD 6,140 — genuinely different, not a typo.
- Never delete a reverifyBy deadline (the guard's contract); goldens + copy may reference old figures — run the full suite.
