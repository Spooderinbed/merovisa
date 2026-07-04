import type { AuWorkerWage } from "@/lib/data/types";

/**
 * Wage and superannuation figures a student worker in Australia needs: the ATO
 * super guarantee rate, the Fair Work National Minimum Wage (current rate), and
 * the Hospitality Industry Award adult-casual introductory penalty ladder. One
 * rate per record — `ratePct` for the super guarantee, `hourlyRateAud` for
 * wages. Fact-only — no scorer reads it; it backs the eventual working-in-
 * Australia guidance and is machine-checked against the findings.
 */
const ATO_SUPER_SOURCE =
  "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-contributions/how-much-super-to-pay";
const FAIRWORK_MIN_WAGE_SOURCE = "https://www.fairwork.gov.au/pay-and-wages/minimum-wages";
const HOSPITALITY_AWARD_SOURCE = "https://awards.fairwork.gov.au/MA000009.html";

const HOSPITALITY_CASUAL_NOTE =
  "Adult casual, introductory classification (Hospitality Industry Award MA000009); penalty-inclusive, ppc 2026-07-01. Not a generic hospitality wage.";

export const AU_STUDENT_WORKER_WAGES: AuWorkerWage[] = [
  {
    id: "super-guarantee-rate",
    label: "Super guarantee rate",
    wageType: "super-guarantee",
    ratePct: 12,
    source: ATO_SUPER_SOURCE,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["H.065"],
      effectiveDate: "2025-07-01",
      note: "Paid by the employer on top of wages into the worker's super fund — not received as take-home pay. 12% from 1 July 2025.",
    },
  },
  {
    id: "national-minimum-wage-current",
    label: "National Minimum Wage (current)",
    wageType: "national-minimum-wage",
    hourlyRateAud: 26.44,
    status: "current",
    source: FAIRWORK_MIN_WAGE_SOURCE,
    lastVerified: "2026-07-02",
    provenance: {
      findingRefs: ["H.067"],
      volatility: "annual",
      reverifyBy: "2027-07-01",
      effectiveDate: "2026-07-01",
      note: "AUD 26.44/hour ($1,004.90/week) took effect from the first full pay period on or after 1 July 2026 (2026 Annual Wage Review) and is now in force, superseding the prior AUD 24.95 rate.",
    },
  },
  {
    id: "hospitality-casual-ordinary",
    label: "Hospitality Award casual introductory — ordinary hours",
    wageType: "award-penalty",
    hourlyRateAud: 32.18,
    award: "Hospitality Industry Award",
    penaltyDay: "ordinary",
    source: HOSPITALITY_AWARD_SOURCE,
    lastVerified: "2026-07-02",
    provenance: { findingRefs: ["H.068"], volatility: "annual", reverifyBy: "2027-07-01", note: HOSPITALITY_CASUAL_NOTE },
  },
  {
    id: "hospitality-casual-saturday",
    label: "Hospitality Award casual introductory — Saturday",
    wageType: "award-penalty",
    hourlyRateAud: 38.61,
    award: "Hospitality Industry Award",
    penaltyDay: "saturday",
    source: HOSPITALITY_AWARD_SOURCE,
    lastVerified: "2026-07-02",
    provenance: { findingRefs: ["H.069"], volatility: "annual", reverifyBy: "2027-07-01", note: HOSPITALITY_CASUAL_NOTE },
  },
  {
    id: "hospitality-casual-sunday",
    label: "Hospitality Award casual introductory — Sunday",
    wageType: "award-penalty",
    hourlyRateAud: 45.05,
    award: "Hospitality Industry Award",
    penaltyDay: "sunday",
    source: HOSPITALITY_AWARD_SOURCE,
    lastVerified: "2026-07-02",
    provenance: { findingRefs: ["H.070"], volatility: "annual", reverifyBy: "2027-07-01", note: HOSPITALITY_CASUAL_NOTE },
  },
  {
    id: "hospitality-casual-public-holiday",
    label: "Hospitality Award casual introductory — public holiday",
    wageType: "award-penalty",
    hourlyRateAud: 64.35,
    award: "Hospitality Industry Award",
    penaltyDay: "public-holiday",
    source: HOSPITALITY_AWARD_SOURCE,
    lastVerified: "2026-07-02",
    provenance: { findingRefs: ["H.071"], volatility: "annual", reverifyBy: "2027-07-01", note: HOSPITALITY_CASUAL_NOTE },
  },
];
