export type EducationLevel = "higher-secondary" | "bachelors" | "masters";

export type GradeSystem =
  | "percentage-nepal"
  | "cgpa-4"
  | "percentage-india"
  | "cgpa-10"
  | "cgpa-5"
  | "percentage";

export type FieldOfStudy =
  | "computer-science"
  | "business"
  | "nursing"
  | "engineering"
  | "hospitality"
  | "accounting"
  | "data-science"
  | "education"
  | "agriculture"
  | "law"
  | "arts"
  | "other";

export type EnglishStatus = "not-taken" | "booked" | "taken";

export type Destination =
  | "australia"
  | "canada"
  | "uk"
  | "germany"
  | "usa"
  | "ireland"
  | "not-sure";

export type FundingSource =
  | "self-funded"
  | "parents-family"
  | "education-loan"
  | "mixed"
  | "scholarship-dependent";

export type Goal =
  | "permanent-residency"
  | "lowest-cost"
  | "highest-ranked"
  | "fastest-admission"
  | "best-employment"
  | "research";

export type Currency = "NPR" | "USD";

export type GapReason =
  | "worked"
  | "retook-exams"
  | "health-family"
  | "started-something"
  | "preparing";

export interface StudentProfile {
  homeCountry: string;
  educationLevel: EducationLevel;
  gradeSystem: GradeSystem;
  grade: number;
  fieldOfStudy: FieldOfStudy;
  graduationYear: number;
  gapReasons: GapReason[];
  englishStatus: EnglishStatus;
  englishScore?: number;
  destination: Destination;
  budget: number;
  budgetCurrency: Currency;
  fundingSource: FundingSource;
  goal: Goal;
}

export type Verdict = "strong" | "possible" | "reach";

export interface DimensionScore {
  value: number;
  factors: Array<{
    label: string;
    influence: "positive" | "neutral" | "risk";
    detail: string;
  }>;
}

export interface AssessmentResult {
  verdict: Verdict;
  weighted: number;
  dimensions: {
    academic: DimensionScore;
    financial: DimensionScore;
    visa: DimensionScore;
    profileStrength: DimensionScore;
  };
  ruleVersion: string;
  computedAt: string;
}
