import type { DimensionScore, StudentProfile, FieldOfStudy } from "./types";

const FIELD_COMPETITIVENESS: Record<FieldOfStudy, number> = {
  "computer-science": 0.95,
  "data-science": 0.95,
  engineering: 0.9,
  business: 0.85,
  nursing: 0.85,
  accounting: 0.8,
  law: 0.85,
  education: 0.75,
  hospitality: 0.7,
  agriculture: 0.7,
  arts: 0.7,
  other: 0.8,
};

const LEVEL_BONUS: Record<StudentProfile["educationLevel"], number> = {
  "higher-secondary": -5,
  bachelors: 0,
  masters: 6,
};

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
