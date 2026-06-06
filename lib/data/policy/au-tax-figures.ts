import type { AuTaxFigure } from "@/lib/data/types";

/**
 * ATO tax figures relevant to a student who works in Australia — the tax-file-
 * number mailing turnaround, the tax-free threshold, and the Departing Australia
 * Superannuation Payment (DASP) rates. Fact-only — no scorer reads it; it backs
 * the eventual working/tax guidance and is machine-checked against the findings.
 */
const ATO_DASP_SOURCE =
  "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/temporary-residents-and-superannuation/departing-australia-superannuation-payment-dasp";

export const AU_TAX_FIGURES: AuTaxFigure[] = [
  {
    id: "tfn-mail-turnaround",
    label: "TFN mailed after the application is processed",
    value: 28,
    unit: "days",
    source:
      "https://www.ato.gov.au/individuals-and-families/tax-file-number/apply-for-a-tfn/foreign-passport-holders-permanent-migrants-and-temporary-visitors-tfn-application",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.057"] },
  },
  {
    id: "tax-free-threshold",
    label: "Tax-free threshold (full-year Australian resident)",
    value: 18200,
    unit: "AUD",
    source:
      "https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/coming-to-australia/tax-free-threshold-for-newcomers-to-australia",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.059"] },
  },
  {
    id: "dasp-taxed-element",
    label: "DASP rate on the taxable component's taxed element",
    value: 35,
    unit: "%",
    source: ATO_DASP_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.060"], note: "Applies to non-WHM temporary residents." },
  },
  {
    id: "dasp-untaxed-element",
    label: "DASP rate on the taxable component's untaxed element",
    value: 45,
    unit: "%",
    source: ATO_DASP_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.061"], note: "Applies to non-WHM temporary residents." },
  },
  {
    id: "dasp-whm",
    label: "DASP rate for working holiday makers",
    value: 65,
    unit: "%",
    source: ATO_DASP_SOURCE,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["H.062"],
      note: "The 65% working-holiday-maker rate is often misapplied to non-WHM students.",
    },
  },
];
