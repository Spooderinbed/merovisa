import type { AuPaymentSurcharge } from "@/lib/data/types";

/**
 * Payment-method surcharges DHA adds to a visa application charge, as a percent
 * of the charge. Card and PayPal payments carry a small surcharge; the figure
 * feeds the eventual "what you'll actually pay" cost breakdown. Fact-only — no
 * scorer reads it, so it moves no verdict, and it is machine-checked against the
 * findings like every other slice.
 */
const DHA_SURCHARGES_SOURCE =
  "https://immi.homeaffairs.gov.au/Visa-subsite/Pages/Fees-and-charges/surcharges-for-visa-payments.aspx";

export const AU_PAYMENT_SURCHARGES: AuPaymentSurcharge[] = [
  {
    id: "visa-card",
    method: "Visa card",
    surchargePct: 1.4,
    source: DHA_SURCHARGES_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.140"] },
  },
  {
    id: "mastercard",
    method: "Mastercard",
    surchargePct: 1.4,
    source: DHA_SURCHARGES_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.141"] },
  },
  {
    id: "paypal",
    method: "PayPal",
    surchargePct: 1.01,
    source: DHA_SURCHARGES_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.142"] },
  },
];
