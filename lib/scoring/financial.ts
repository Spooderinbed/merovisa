import type { DimensionScore, Destination, FundingSource, StudentProfile, Currency } from "./types";
import { TYPICAL_YEARLY_USD, FUNDING_RELIABILITY, FX_RATES } from "@/lib/data/scoring-config";

const DESTINATION_LABEL: Record<Destination, string> = {
  australia: "Australia",
  canada: "Canada",
  uk: "the UK",
  germany: "Germany",
  usa: "the USA",
  ireland: "Ireland",
  "not-sure": "your destination",
};

function toUsd(amount: number, currency: string): number {
  // An unmapped currency has no rate → passthrough (amount unchanged), exactly
  // as the previous switch's `default` branch did. USD's rate is 1 (identity).
  const rate = FX_RATES[currency as Currency];
  return rate === undefined ? amount : amount / rate;
}

export function scoreFinancial(profile: StudentProfile): DimensionScore {
  const budgetUsd = toUsd(profile.budget, profile.budgetCurrency);
  const typical = TYPICAL_YEARLY_USD[profile.destination];
  const midpoint = (typical.min + typical.max) / 2;
  const ratio = budgetUsd / midpoint;

  // Ratio of 1.0 → baseline 70. Higher ratio adds points, lower subtracts.
  const baseFromBudget = 70 + (ratio - 1) * 35;
  const reliability = FUNDING_RELIABILITY[profile.fundingSource];
  const reliabilityAdjustment = (reliability - 0.8) * 50;
  const value = Math.max(0, Math.min(100, Math.round(baseFromBudget + reliabilityAdjustment)));

  const factors: DimensionScore["factors"] = [];

  if (budgetUsd < typical.min) {
    factors.push({
      label: `Budget below typical range`,
      influence: "risk",
      detail: `Typical year in ${DESTINATION_LABEL[profile.destination]} costs USD ${typical.min.toLocaleString()}–${typical.max.toLocaleString()}.`,
    });
  } else if (budgetUsd > typical.max) {
    factors.push({
      label: `Budget above typical range`,
      influence: "positive",
      detail: `Comfortably covers ${DESTINATION_LABEL[profile.destination]} costs.`,
    });
  } else {
    factors.push({
      label: `Budget within typical range`,
      influence: "neutral",
      detail: `Aligned with typical ${DESTINATION_LABEL[profile.destination]} costs.`,
    });
  }

  if (profile.fundingSource === "scholarship-dependent") {
    factors.push({
      label: "Scholarship-dependent funding",
      influence: "risk",
      detail: "Outcome depends on receiving scholarships — adds uncertainty to visa case.",
    });
  } else if (profile.fundingSource === "self-funded") {
    factors.push({
      label: "Self-funded",
      influence: "positive",
      detail: "Strongest funding signal for visa officers.",
    });
  } else if (profile.fundingSource === "education-loan") {
    factors.push({
      label: "Education loan",
      influence: "neutral",
      detail: "Acceptable funding when sanction letter is documented.",
    });
  }

  return { value, factors };
}
