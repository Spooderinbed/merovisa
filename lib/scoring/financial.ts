import type { DimensionScore, Destination, StudentProfile, Currency } from "./types";
import {
  TYPICAL_YEARLY_USD,
  FUNDING_RELIABILITY,
  FX_RATES,
  AU_DHA_LIVING_CAPACITY_AUD,
  AU_DHA_PARTNER_CAPACITY_AUD,
  AU_DHA_CHILD_CAPACITY_AUD,
  AU_REPRESENTATIVE_TUITION_AUD,
  AU_DHA_CAPACITY_GATE,
  CONFIG_PROVENANCE,
} from "@/lib/data/scoring-config";

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

/**
 * Additional DHA financial capacity required for declared dependents (AUD). A partner and
 * each child each add their gov-sourced Subclass 500 figure. School costs are deferred —
 * they need child ages the wizard does not capture.
 *
 * Exported because the matches engine must price dependents identically (lib/matches/
 * capacity.ts): two independent copies of this sum drifting apart is precisely the class
 * of bug MV-120 / audit C-3 fixed.
 */
export function auDependentsCapacityAud(dependents: StudentProfile["dependents"]): number {
  return (
    (dependents?.partner ? AU_DHA_PARTNER_CAPACITY_AUD : 0) +
    (dependents?.children ?? 0) * AU_DHA_CHILD_CAPACITY_AUD
  );
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
  let value = Math.max(0, Math.min(100, Math.round(baseFromBudget + reliabilityAdjustment)));

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

  // DHA financial-capacity gate (Australia). The Subclass 500 visa is decided
  // against a financial-capacity floor — 12 months' living + first-year tuition —
  // so a budget below it is a real visa risk regardless of how it compares to the
  // typical-cost heuristic. The caps land just under verdict.ts's min-dimension
  // thresholds (50 blocks "strong", 30 forces "reach"), reusing those floors
  // rather than inventing new verdict logic. The gate only ever lowers the score.
  if (profile.destination === "australia") {
    // Declared dependents raise the DHA financial-capacity floor, so bringing family
    // honestly requires more provable funds. Shared with the matches engine.
    const dependentsAud = auDependentsCapacityAud(profile.dependents);
    const capacityAud = AU_DHA_LIVING_CAPACITY_AUD + AU_REPRESENTATIVE_TUITION_AUD + dependentsAud;
    const fxAud = FX_RATES.AUD ?? 1;
    const capacityUsd = capacityAud / fxAud;
    const capacityLabel = `~AUD ${capacityAud.toLocaleString()}`;
    // Keep the itemised breakdown consistent with the raised total — an unexplained
    // jump in the ~AUD figure would read as a contradiction in a trust-first UI.
    const familyClause = dependentsAud > 0 ? ` + AUD ${dependentsAud.toLocaleString()} for family` : "";
    // Trust attribution: the gov DHA figure backs this factor; surface its source.
    const dhaProv = CONFIG_PROVENANCE.AU_DHA_LIVING_CAPACITY_AUD;
    const dhaUrl = dhaProv?.source;
    const source = dhaUrl ? { url: dhaUrl, lastVerified: dhaProv?.lastVerified } : undefined;
    if (budgetUsd >= capacityUsd) {
      factors.push({
        label: "Meets DHA financial-capacity requirement",
        influence: "positive",
        detail: `Budget covers the ${capacityLabel} the student visa expects (AUD ${AU_DHA_LIVING_CAPACITY_AUD.toLocaleString()} living + AUD ${AU_REPRESENTATIVE_TUITION_AUD.toLocaleString()} first-year tuition${familyClause}).`,
        source,
        refusalFactor: "financial-capacity",
      });
    } else if (budgetUsd >= capacityUsd * AU_DHA_CAPACITY_GATE.reachRatio) {
      value = Math.min(value, AU_DHA_CAPACITY_GATE.blockStrongCap);
      factors.push({
        label: "Below DHA financial-capacity requirement",
        influence: "risk",
        detail: `Short of the ${capacityLabel} the student visa expects (12-month living + first-year tuition) — show more provable funds to strengthen the case.`,
        source,
        refusalFactor: "financial-capacity",
      });
    } else {
      value = Math.min(value, AU_DHA_CAPACITY_GATE.forceReachCap);
      factors.push({
        label: "Well below DHA financial-capacity requirement",
        influence: "risk",
        detail: `Far short of the ${capacityLabel} the student visa expects — a major risk on financial capacity.`,
        source,
        refusalFactor: "financial-capacity",
      });
    }
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
