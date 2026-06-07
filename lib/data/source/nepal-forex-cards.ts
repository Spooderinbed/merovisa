import type { NepalForexCard } from "@/lib/data/types";

/**
 * Forex / travel card fees for Nepalese students going abroad (arrival category
 * H). Nepali bank cards come from the banks' standard tariff sheets; the Wise
 * card figures are Wise's own published terms. Each record carries only the fees
 * its issuer states. "40+ currencies" is recorded as the published floor.
 *
 * NIC ASIA's foreign-ATM fee is a "greater of" rule (USD 5 or 2.5%): the percent
 * is the gate-checked value and the USD floor rides as sourced detail.
 *
 * Fact-only — no scorer reads it; it backs the eventual money-abroad view and is
 * machine-checked against the findings.
 */
export const NEPAL_FOREX_CARDS: NepalForexCard[] = [
  {
    id: "nic-asia-international-card",
    provider: "NIC ASIA Bank",
    card: "International card",
    cashLoadFeeNpr: 500,
    foreignAtmFeePct: 2.5,
    foreignAtmFeeMinUsd: 5,
    source: "https://cms.nicasiabank.com/framework/uploads/Standard%20Tariff%20of%20Charges.pdf",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["H.032", "H.033"],
      note: "Standard tariff: NPR 500 cash-load per transaction; foreign-ATM withdrawal is the greater of USD 5 or 2.5% of the amount.",
    },
  },
  {
    id: "nabil-usd-card",
    provider: "Nabil Bank",
    card: "USD card",
    crossBorderFeePct: 1,
    source:
      "https://siteadmin.nabilbank.com/assets/backend/uploads/Documents/Standard%20Charge%20Sheets/Standard-Charge-Sheet.pdf",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["H.035"],
      note: "Standard charge sheet: cross-border fee of 1% of the transaction amount.",
    },
  },
  {
    id: "wise-card",
    provider: "Wise",
    card: "Wise card",
    feeFreeAtmMonthlyLimitAud: 400,
    atmFeeAboveLimitPct: 2.69,
    supportedCurrencyCount: 40,
    source: "https://wise.com/au/blog/using-wise-au-card-overseas",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["H.037", "H.038", "H.036"],
      note: "Wise's published terms: ATM withdrawals fee-free up to AUD 400/month, then a 2.69% variable fee; loads, holds and converts 40+ currencies at the mid-market rate.",
    },
  },
];
