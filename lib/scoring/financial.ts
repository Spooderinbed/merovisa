import type { DimensionScore, Destination, FundingSource, StudentProfile } from "./types";

// Typical yearly total (tuition + living) in USD for each destination.
const TYPICAL_YEARLY_USD: Record<Destination, { min: number; max: number }> = {
  australia: { min: 30000, max: 55000 },
  canada: { min: 25000, max: 45000 },
  uk: { min: 28000, max: 50000 },
  germany: { min: 12000, max: 22000 },
  usa: { min: 40000, max: 75000 },
  ireland: { min: 25000, max: 40000 },
  "not-sure": { min: 25000, max: 45000 },
};

const FUNDING_RELIABILITY: Record<FundingSource, number> = {
  "self-funded": 0.95,
  "parents-family": 0.9,
  "education-loan": 0.8,
  mixed: 0.85,
  "scholarship-dependent": 0.55,
};

const DESTINATION_LABEL: Record<Destination, string> = {
  australia: "Australia",
  canada: "Canada",
  uk: "the UK",
  germany: "Germany",
  usa: "the USA",
  ireland: "Ireland",
  "not-sure": "your destination",
};

const NPR_PER_USD = 135;

export function scoreFinancial(profile: StudentProfile): DimensionScore {
  const budgetUsd =
    profile.budgetCurrency === "USD" ? profile.budget : profile.budget / NPR_PER_USD;
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
