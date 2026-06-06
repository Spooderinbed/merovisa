import type { DimensionScore, StudentProfile, FieldOfStudy } from "./types";
import { FIELD_COMPETITIVENESS, LEVEL_BONUS } from "@/lib/data/scoring-config";

const FIELD_LABEL: Record<FieldOfStudy, string> = {
  "computer-science": "Computer Science",
  "data-science": "Data Science",
  business: "Business",
  nursing: "Nursing",
  engineering: "Engineering",
  hospitality: "Hospitality",
  accounting: "Accounting",
  education: "Education",
  agriculture: "Agriculture",
  law: "Law",
  arts: "Arts",
  other: "this field",
};

export function scoreAcademic(profile: StudentProfile): DimensionScore {
  const fieldDifficulty = FIELD_COMPETITIVENESS[profile.fieldOfStudy];
  // Normalised grade — percentage-nepal is already 0-100. CGPA conversion is handled
  // upstream when we expand source countries (out of scope for Plan 1).
  const normalisedGrade = profile.grade;
  // Higher field difficulty raises the typical admission threshold.
  const baseline = 60 + (fieldDifficulty - 0.7) * 40;
  const delta = normalisedGrade - baseline;
  const raw = 50 + delta * 1.4 + LEVEL_BONUS[profile.educationLevel];
  const value = Math.max(0, Math.min(100, Math.round(raw)));

  const factors: DimensionScore["factors"] = [];

  if (normalisedGrade >= baseline + 8) {
    factors.push({
      label: `Strong grade (${normalisedGrade}%)`,
      influence: "positive",
      detail: `Above the typical threshold for ${FIELD_LABEL[profile.fieldOfStudy]}.`,
    });
  } else if (normalisedGrade <= baseline - 8) {
    factors.push({
      label: `Grade below threshold`,
      influence: "risk",
      detail: `Most ${FIELD_LABEL[profile.fieldOfStudy]} programs in Australia expect ${Math.round(
        baseline,
      )}%+.`,
    });
  } else {
    factors.push({
      label: `Grade within range`,
      influence: "neutral",
      detail: `Around the typical threshold for ${FIELD_LABEL[profile.fieldOfStudy]}.`,
    });
  }

  if (profile.educationLevel === "masters") {
    factors.push({
      label: "Master's degree completed",
      influence: "positive",
      detail: "Postgraduate level strengthens academic standing.",
    });
  }

  return { value, factors };
}
