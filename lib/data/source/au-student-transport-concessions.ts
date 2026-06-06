import type { AuTransportConcession } from "@/lib/data/types";

/**
 * State public-transport concession facts for international/tertiary students
 * across NSW, VIC, QLD and the ACT — card fees, card validity, percentage
 * savings, and flat fares. Each record sets only the field matching its
 * `concessionType`. Fact-only — no scorer reads it; it backs the eventual
 * arrival/settlement cost guidance and is machine-checked against the findings.
 */
export const AU_STUDENT_TRANSPORT_CONCESSIONS: AuTransportConcession[] = [
  {
    id: "nsw-concession-card-fee",
    state: "NSW",
    label: "Transport Concession Entitlement Card fee",
    concessionType: "card-fee",
    amountAud: 0,
    source: "https://transportnsw.info/tickets-fares/eligibility-concessions/tertiary-tafe-students",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.085"] },
  },
  {
    id: "nsw-concession-card-validity",
    state: "NSW",
    label: "Transport Concession Entitlement Card validity",
    concessionType: "card-validity",
    validityMonths: 15,
    source: "https://transportnsw.info/tickets-fares/eligibility-concessions/tertiary-tafe-students",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.086"], note: "Valid up to 15 months while eligibility continues." },
  },
  {
    id: "vic-international-student-pass",
    state: "VIC",
    label: "International Student Travel Pass saving",
    concessionType: "percentage-saving",
    discountPct: 50,
    source: "https://internationalstudent.ptv.vic.gov.au/",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.088"], note: "Eligibility depends on participating education providers." },
  },
  {
    id: "qld-translink-flat-fare",
    state: "QLD",
    label: "Translink flat per-journey fare",
    concessionType: "flat-fare",
    amountAud: 0.5,
    source: "https://translink.com.au/tickets-and-fares/concessions/tertiary",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.089"] },
  },
  {
    id: "act-myway-tertiary",
    state: "ACT",
    label: "MyWay+ tertiary student per-trip fare",
    concessionType: "flat-fare",
    amountAud: 1.71,
    source:
      "https://www.transport.act.gov.au/news/news-and-events-items/january-2026/public-transport-fare-changes",
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["H.092"],
      effectiveDate: "2026-01-10",
      note: "Per-trip fare only; a temporary monthly-cap reduction also applied 2026-04-08 to 2026-06-30.",
    },
  },
];
