import type { AssessmentResult, StudentProfile } from "./types";
import { scoreAcademic } from "./academic";
import { scoreFinancial } from "./financial";
import { scoreVisa } from "./visa";
import { scoreProfileStrength } from "./profile-strength";
import { mapVerdict } from "./verdict";

const RULE_VERSION = "v0.1.0";

const WEIGHTS = {
  academic: 0.3,
  financial: 0.25,
  visa: 0.25,
  profileStrength: 0.2,
} as const;

export function runAssessment(profile: StudentProfile): AssessmentResult {
  const academic = scoreAcademic(profile);
  const financial = scoreFinancial(profile);
  const visa = scoreVisa(profile);
  const profileStrength = scoreProfileStrength(profile);

  const weighted = Math.round(
    academic.value * WEIGHTS.academic +
      financial.value * WEIGHTS.financial +
      visa.value * WEIGHTS.visa +
      profileStrength.value * WEIGHTS.profileStrength,
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
    computedAt: new Date().toISOString(),
  };
}
