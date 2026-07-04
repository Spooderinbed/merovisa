import type { AuSkilledVisaCharge } from "@/lib/data/types";

/**
 * Base (primary-applicant) application charges for the Australian skilled and
 * employer-sponsored visa subclasses a graduating student might pursue after a
 * Subclass 500. Each is the "from" figure DHA publishes on the visa-listing
 * page, in AUD. Fact-only — no scorer reads it; it backs the eventual post-study
 * pathway cost view and is machine-checked against the findings.
 */
export const AU_SKILLED_VISA_CHARGES: AuSkilledVisaCharge[] = [
  {
    id: "skilled-491",
    subclass: 491,
    visaName: "Skilled Work Regional (Provisional)",
    baseFeeAud: 6140,
    source:
      "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skilled-work-regional-provisional-491/application",
    lastVerified: "2026-07-02",
    provenance: { findingRefs: ["C.060"], volatility: "annual", reverifyBy: "2027-07-01" },
  },
  {
    id: "regional-191",
    subclass: 191,
    visaName: "Permanent Residence (Skilled Regional) — Regional Provisional stream",
    baseFeeAud: 630,
    source:
      "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skilled-regional-191/regional-provisional",
    lastVerified: "2026-07-02",
    provenance: { findingRefs: ["C.064"], volatility: "annual", reverifyBy: "2027-07-01" },
  },
  {
    id: "skilled-189",
    subclass: 189,
    visaName: "Skilled Independent (points-tested stream)",
    baseFeeAud: 6135,
    source:
      "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skilled-independent-189/points-tested",
    lastVerified: "2026-07-02",
    provenance: { findingRefs: ["C.068"], volatility: "annual", reverifyBy: "2027-07-01" },
  },
  {
    id: "employer-186",
    subclass: 186,
    visaName: "Employer Nomination Scheme",
    baseFeeAud: 6140,
    source:
      "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/employer-nomination-scheme-186",
    lastVerified: "2026-07-02",
    provenance: { findingRefs: ["C.073"], volatility: "annual", reverifyBy: "2027-07-01" },
  },
];
