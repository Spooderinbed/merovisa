import type { AuVisaFact } from "@/lib/data/types";

/**
 * Miscellaneous sourced Australian visa facts not covered by the dedicated
 * modules (visa-conditions category C): the Student Guardian (590) application
 * charge, the skilled-temporary category processing median, and the Visitor (600)
 * tourist maximum stay, Sponsored Family work rights, and security bond. The
 * Visitor-visa facts matter for a student's visiting family.
 *
 * Each record is one labeled fact — a scalar with a unit, a boolean (work right),
 * or a money range (security bond, via minValue/maxValue). Charges and bonds are
 * recorded at the stated figure ("from", "between"); the processing median is
 * effective-dated. Fact-only — no scorer reads it; machine-checked against the
 * findings.
 */
const DHA_FORM_1149 = "https://immi.homeaffairs.gov.au/form-listing/forms/1149.pdf";

export const AU_VISA_FACTS: AuVisaFact[] = [
  {
    id: "subclass-590-application-charge",
    subclass: "590",
    category: "Student Guardian visa (590)",
    kind: "application-charge",
    label: "Base application charge (from)",
    value: 2000,
    unit: "AUD",
    source: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-590",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["C.035"], note: "Base application charge is a 'from AUD 2,000.00' figure." },
  },
  {
    id: "skilled-temporary-median-processing-time",
    category: "Skilled temporary visa category",
    kind: "processing-time",
    label: "Median processing time (category, April 2026)",
    value: 63,
    unit: "days",
    source: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-processing-times",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.057"],
      effectiveDate: "2026-04-01",
      note: "Whole-category median for April 2026; DHA revises it monthly.",
    },
  },
  {
    id: "subclass-600-tourist-maximum-stay",
    subclass: "600",
    category: "Visitor visa Tourist stream (600)",
    kind: "stay-period",
    label: "Maximum stay (tourist, offshore applicant)",
    value: 12,
    unit: "months",
    source: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600/tourist-stream-overseas",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["C.077"], note: "Up to 12 months to visit as a tourist, cruise, or see family/friends." },
  },
  {
    id: "subclass-600-sponsored-family-work-right",
    subclass: "600",
    category: "Visitor visa Sponsored Family stream (600)",
    kind: "work-right",
    label: "Permitted to work in Australia",
    value: false,
    source: DHA_FORM_1149,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["C.081"], note: "Form 1149: Sponsored Family stream holders are not permitted to work." },
  },
  {
    id: "subclass-600-sponsored-family-security-bond",
    subclass: "600",
    category: "Visitor visa Sponsored Family stream (600)",
    kind: "security-bond",
    label: "Security bond (per person)",
    minValue: 5000,
    maxValue: 15000,
    unit: "AUD",
    source: DHA_FORM_1149,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["C.082"], note: "Form 1149: bond is generally between AUD 5,000 and AUD 15,000 per person." },
  },
];
