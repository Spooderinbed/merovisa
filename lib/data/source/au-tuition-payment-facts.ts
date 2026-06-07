import type { AuTuitionPaymentFact } from "@/lib/data/types";

/**
 * Facts about paying tuition to an Australian university (finance category B):
 * payment-channel clearing times, the FX-rate hold window, the initial deposit
 * on accepting an offer, and refund-processing fees. University-stated where the
 * university publishes the figure; the Flywire refund fee is the provider's own.
 * One labeled value per record.
 *
 * Convera's "available in 140+ currencies / 200+ countries" scale claims are
 * deferred as provider marketing. Fact-only — no scorer reads it; it backs the
 * eventual tuition-payment view and is machine-checked against the findings.
 */
export const AU_TUITION_PAYMENT_FACTS: AuTuitionPaymentFact[] = [
  {
    id: "usyd-bank-transfer-time",
    provider: "University of Sydney",
    channel: "international bank transfer",
    kind: "processing-time",
    label: "International bank transfer clearing time",
    value: 10,
    unit: "business days",
    source: "https://www.sydney.edu.au/students/paying-fees.html",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["B.103"], note: "Up to 10 business days." },
  },
  {
    id: "unsw-convera-fx-rate-hold",
    provider: "UNSW Sydney",
    channel: "Convera",
    kind: "fx-rate-hold",
    label: "Convera exchange-rate hold window",
    value: 72,
    unit: "hours",
    source: "https://www.unsw.edu.au/student/managing-your-studies/fees",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["B.105"], note: "The quoted exchange rate is held for 72 hours." },
  },
  {
    id: "monash-convera-telegraphic-transfer-time",
    provider: "Monash University",
    channel: "Convera",
    kind: "processing-time",
    label: "Convera telegraphic transfer clearing time (from outside Australia)",
    value: 5,
    unit: "working days",
    source: "https://www.monash.edu/students/admin/fees/payment/options",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["B.106"], note: "Telegraphic transfers from outside Australia take 5 working days." },
  },
  {
    id: "monash-card-payment-time",
    provider: "Monash University",
    channel: "card",
    kind: "processing-time",
    label: "Card payment clearing time",
    value: 2,
    unit: "working days",
    source: "https://www.monash.edu/students/admin/fees/payment/options",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["B.107"], note: "Card payments take 2 working days." },
  },
  {
    id: "unimelb-initial-tuition-deposit",
    provider: "University of Melbourne",
    kind: "deposit",
    label: "Initial tuition-fee deposit on accepting an offer",
    value: 17000,
    unit: "AUD",
    source: "https://students.unimelb.edu.au/course-admin/paying-your-fees/international-students",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["B.111"], note: "A$17,000 deposit required when an international student accepts an offer." },
  },
  {
    id: "flywire-refund-processing-fee",
    provider: "Flywire",
    channel: "Flywire",
    kind: "refund-fee",
    label: "Refund-processing charge",
    value: 1,
    unit: "%",
    source: "https://help.flywire.com/hc/en-us/articles/360013120674-Are-there-any-fees-associated-with-a-refund",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["B.114"], note: "Refund requests may incur a 1% refund-processing charge." },
  },
];
