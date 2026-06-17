import type { AssessmentResult, StudentProfile } from "./types";
import { scoreAcademic } from "./academic";
import { scoreFinancial } from "./financial";
import { scoreVisa } from "./visa";
import { scoreProfileStrength } from "./profile-strength";
import { mapVerdict } from "./verdict";
import { DIMENSION_WEIGHTS, CONFIG_VERSION } from "@/lib/data/scoring-config";

// v0.2.0: financial dimension applies the Australia DHA capacity gate (a budget
// below the visa's financial-capacity floor caps the dimension into 'possible'/'reach').
// v0.3.0: visa dimension applies the DHA visa English floor — a visa-valid IELTS
// 6.0–6.4 is no longer penalised as a course-threshold shortfall.
// v0.4.0: visa dimension penalises declared prior student-visa refusals
// (lib/scoring/visa.ts) — one −15, multiple −35.
// v0.5.0: academic dimension normalises the grade to a 0-100 percentage by
// gradeSystem (lib/scoring/grade-normalize.ts) — CGPA systems (cgpa-4/10/5) are
// now scored correctly instead of being read as a raw percentage (which floored
// any CGPA grade to 0 and forced 'reach'). Percentage systems are unchanged.
const RULE_VERSION = "v0.5.0";

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
