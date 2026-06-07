import type { AssessmentResult, StudentProfile } from "./types";
import { scoreAcademic } from "./academic";
import { scoreFinancial } from "./financial";
import { scoreVisa } from "./visa";
import { scoreProfileStrength } from "./profile-strength";
import { mapVerdict } from "./verdict";
import { DIMENSION_WEIGHTS, CONFIG_VERSION } from "@/lib/data/scoring-config";

// v0.2.0: financial dimension applies the Australia DHA capacity gate (a budget
// below the visa's financial-capacity floor caps the dimension into 'possible'/'reach').
const RULE_VERSION = "v0.2.0";

export function runAssessment(profile: StudentProfile): AssessmentResult {
  const academic = scoreAcademic(profile);
  const financial = scoreFinancial(profile);
  const visa = scoreVisa(profile);
  const profileStrength = scoreProfileStrength(profile);

  const weighted = Math.round(
    academic.value * DIMENSION_WEIGHTS.academic +
      financial.value * DIMENSION_WEIGHTS.financial +
      visa.value * DIMENSION_WEIGHTS.visa +
      profileStrength.value * DIMENSION_WEIGHTS.profileStrength,
  );

  const verdict = mapVerdict({
    weighted,
    dimensions: [academic.value, financial.value, visa.value, profileStrength.value],
  });

  return {
    verdict,
    weighted,
    dimensions: { academic, financial, visa, profileStrength },
    ruleVersion: RULE_VERSION,
    configVersion: CONFIG_VERSION,
    computedAt: new Date().toISOString(),
  };
}
