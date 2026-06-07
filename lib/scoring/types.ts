export const EDUCATION_LEVELS = ["higher-secondary", "bachelors", "masters"] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const GRADE_SYSTEMS = [
  "percentage-nepal",
  "cgpa-4",
  "percentage-india",
  "cgpa-10",
  "cgpa-5",
  "percentage",
] as const;
export type GradeSystem = (typeof GRADE_SYSTEMS)[number];

export const FIELDS_OF_STUDY = [
  "computer-science",
  "business",
  "nursing",
  "engineering",
  "hospitality",
  "accounting",
  "data-science",
  "education",
  "agriculture",
  "law",
  "arts",
  "other",
] as const;
export type FieldOfStudy = (typeof FIELDS_OF_STUDY)[number];

export const ENGLISH_STATUSES = ["not-taken", "booked", "taken"] as const;
export type EnglishStatus = (typeof ENGLISH_STATUSES)[number];

export const DESTINATIONS = [
  "australia",
  "canada",
  "uk",
  "germany",
  "usa",
  "ireland",
  "not-sure",
] as const;
export type Destination = (typeof DESTINATIONS)[number];

export const FUNDING_SOURCES = [
  "self-funded",
  "parents-family",
  "education-loan",
  "mixed",
  "scholarship-dependent",
] as const;
export type FundingSource = (typeof FUNDING_SOURCES)[number];

export const GOALS = [
  "permanent-residency",
  "lowest-cost",
  "highest-ranked",
  "fastest-admission",
  "best-employment",
  "research",
] as const;
export type Goal = (typeof GOALS)[number];

export const CURRENCIES = ["NPR", "USD", "AUD", "INR", "BDT", "PKR", "NGN"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const GAP_REASONS = [
  "worked",
  "retook-exams",
  "health-family",
  "started-something",
  "preparing",
] as const;
export type GapReason = (typeof GAP_REASONS)[number];

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

export const VERDICTS = ["strong", "possible", "reach"] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface DimensionScore {
  value: number;
  factors: Array<{
    label: string;
    influence: "positive" | "neutral" | "risk";
    detail: string;
    /**
     * Optional external source backing this factor, surfaced in the UI for trust
     * attribution. Present only where the factor cites a genuine primary/gov
     * source (e.g. the DHA capacity figure) — heuristic-backed factors omit it.
     */
    source?: { url: string; lastVerified?: string };
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
  /** Version of the sourced scoring config (lib/data/scoring-config) used. Bumps when any sourced value changes; stamped so an old verdict stays explainable. */
  configVersion: string;
  computedAt: string;
}
