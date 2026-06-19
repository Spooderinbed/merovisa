import type { AuOshcPremium } from "@/lib/data/types";

/**
 * OSHC (Overseas Student Health Cover) single-cover premiums for a Nepal → Australia
 * Subclass 500 student, across the government-approved providers, in AUD. Three
 * providers publish a citable single-cover rate; two (ahm, Allianz Care) publish no
 * static rate card and quote individually — those are recorded as `quoteOnly` with
 * null amounts rather than a fabricated number, so the cost estimate can present an
 * honest range anchored on the published rate cards and link each figure to its source.
 *
 * DISPLAY data on the cost-to-apply model: per-record source + lastVerified, validated
 * by lib/data/schema/au-oshc-premiums.schema.ts, NOT registered in the findings ledger
 * (no scorer reads it; it is not a scoring rule). Rate cards are dated mid-2025
 * (volatility: annual) — re-verify against each provider's current rate card.
 */
export const AU_OSHC_PREMIUMS: AuOshcPremium[] = [
  {
    id: "nib",
    provider: "nib",
    singleCoverAudPerYear: 679.56,
    singleCoverAudPerMonth: 56.63,
    coverType: "single",
    quoteOnly: false,
    basis:
      "nib OSHC Core rate card — single cover AUD 56.63/month; annual = 12 × monthly. Rate card correct as of 3 Jul 2025.",
    source: "https://www.nib.com.au/docs/oshc-core-rate-card",
    lastVerified: "2026-06-20",
  },
  {
    id: "bupa",
    provider: "Bupa",
    singleCoverAudPerYear: 760,
    singleCoverAudPerMonth: 64,
    coverType: "single",
    quoteOnly: false,
    basis:
      "Bupa Advantage OSHC price list (partner-hosted) — single cover ~AUD 760/year (AUD 64/month), effective 30 Jun 2025; bupa.com.au itself is a quote tool.",
    source:
      "https://www.ilsc.com/hubfs/pdf/applications-pricelists/bupa-advantage-overseas-student-health-cover-price-list.pdf",
    lastVerified: "2026-06-20",
  },
  {
    id: "medibank",
    provider: "Medibank",
    singleCoverAudPerYear: 949.2,
    singleCoverAudPerMonth: 79.1,
    coverType: "single",
    quoteOnly: false,
    basis:
      "Medibank Essentials OSHC — single cover from AUD 79.10/month; annual ≈ 12 × monthly. A 'from' price; the exact premium depends on cover dates.",
    source: "https://www.medibank.com.au/overseas-health-insurance/oshc/essentials-oshc/",
    lastVerified: "2026-06-20",
  },
  {
    id: "ahm",
    provider: "ahm",
    singleCoverAudPerYear: null,
    singleCoverAudPerMonth: null,
    coverType: "single",
    quoteOnly: true,
    basis:
      "ahm OSHC publishes no static rate card — the single-cover premium is available via the ahm OSHC quote tool only.",
    source: "https://www.ahmoshc.com.au/get-a-quote/",
    lastVerified: "2026-06-20",
  },
  {
    id: "allianz-care",
    provider: "Allianz Care",
    singleCoverAudPerYear: null,
    singleCoverAudPerMonth: null,
    coverType: "single",
    quoteOnly: true,
    basis:
      "Allianz Care OSHC single-cover premium is available via the quote tool only — no static rate card published.",
    source: "https://www.allianzcare.com.au/en/visas/student-visa-oshc.html",
    lastVerified: "2026-06-20",
  },
];
