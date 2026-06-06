import type { AuWorkerWage } from "@/lib/data/types";

/**
 * Wage and superannuation figures a student worker in Australia needs: the ATO
 * super guarantee rate, the Fair Work National Minimum Wage (the current rate and
 * the announced next rate), and the Hospitality Industry Award adult-casual
 * introductory penalty ladder. One rate per record — `ratePct` for the super
 * guarantee, `hourlyRateAud` for wages. Fact-only — no scorer reads it; it backs
 * the eventual working-in-Australia guidance and is machine-checked against the
 * findings.
 */
const ATO_SUPER_SOURCE =
  "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-contributions/how-much-super-to-pay";
const FAIRWORK_MIN_WAGE_SOURCE = "https://www.fairwork.gov.au/pay-and-wages/minimum-wages";
const FAIRWORK_AWR_2026_SOURCE =
  "https://www.fairwork.gov.au/about-us/workplace-laws/annual-wage-review/annual-wage-review-2026";
const HOSPITALITY_AWARD_SOURCE = "https://awards.fairwork.gov.au/MA000009.html";

const HOSPITALITY_CASUAL_NOTE =
  "Adult casual, introductory classification (Hospitality Industry Award MA000009); penalty-inclusive, ppc 2025-07-01. Not a generic hospitality wage.";

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
    hourlyRateAud: 24.95,
    status: "current",
    source: FAIRWORK_MIN_WAGE_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.066"], effectiveDate: "2025-07-01" },
  },
  {
    id: "national-minimum-wage-announced-2026",
    label: "National Minimum Wage (announced, from 1 July 2026)",
    wageType: "national-minimum-wage",
    hourlyRateAud: 26.44,
    status: "announced",
    source: FAIRWORK_AWR_2026_SOURCE,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["H.067"],
      effectiveDate: "2026-07-01",
      note: "Announced in the 2026 Annual Wage Review; operative 1 July 2026, not yet in force as of 2026-06-05.",
    },
  },
  {
    id: "hospitality-casual-ordinary",
    label: "Hospitality Award casual introductory — ordinary hours",
    wageType: "award-penalty",
    hourlyRateAud: 30.35,
    award: "Hospitality Industry Award",
    penaltyDay: "ordinary",
    source: HOSPITALITY_AWARD_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.068"], note: HOSPITALITY_CASUAL_NOTE },
  },
  {
    id: "hospitality-casual-saturday",
    label: "Hospitality Award casual introductory — Saturday",
    wageType: "award-penalty",
    hourlyRateAud: 36.42,
    award: "Hospitality Industry Award",
    penaltyDay: "saturday",
    source: HOSPITALITY_AWARD_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.069"], note: HOSPITALITY_CASUAL_NOTE },
  },
  {
    id: "hospitality-casual-sunday",
    label: "Hospitality Award casual introductory — Sunday",
    wageType: "award-penalty",
    hourlyRateAud: 42.49,
    award: "Hospitality Industry Award",
    penaltyDay: "sunday",
    source: HOSPITALITY_AWARD_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.070"], note: HOSPITALITY_CASUAL_NOTE },
  },
  {
    id: "hospitality-casual-public-holiday",
    label: "Hospitality Award casual introductory — public holiday",
    wageType: "award-penalty",
    hourlyRateAud: 60.7,
    award: "Hospitality Industry Award",
    penaltyDay: "public-holiday",
    source: HOSPITALITY_AWARD_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.071"], note: HOSPITALITY_CASUAL_NOTE },
  },
];
