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

/**
 * English tests the product collects a score for. The set matches what
 * lib/data/source/au-english-tests.ts supports a numeric IELTS-equivalence for and
 * what the wizard/profile editor expose. `englishScore` is the score in the chosen
 * test's OWN scale; lib/scoring/english-equivalent.ts maps it to an IELTS band.
 */
export const ENGLISH_TESTS = ["ielts", "pte", "toefl"] as const;
export type EnglishTest = (typeof ENGLISH_TESTS)[number];

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

/**
 * Corridors the product actually covers end-to-end (data + results + checklist).
 * The wizard, /api/assess, and the Results gate all read this — "not-sure" is
 * allowed as delegation but is not a supported corridor.
 */
export const SUPPORTED_DESTINATIONS = ["australia"] as const;
export type SupportedDestination = (typeof SUPPORTED_DESTINATIONS)[number];

export function isDestinationSupported(d: Destination): d is SupportedDestination {
  return (SUPPORTED_DESTINATIONS as readonly Destination[]).includes(d);
}

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
  /**
   * Extra fields the student is also weighing, beyond their primary `fieldOfStudy`
   * (max 2, disjoint from the primary). Purely additive: the verdict and every
   * scoring rule read ONLY `fieldOfStudy`, so these never move a score — they only
   * broaden which programs the matcher surfaces (see lib/matches/compute.ts) and
   * drive an honest competitiveness note (lib/scoring/field-note.ts).
   * Omitted/undefined = considering the primary alone.
   */
  alsoConsidering?: FieldOfStudy[];
  graduationYear: number;
  gapReasons: GapReason[];
  englishStatus: EnglishStatus;
  /**
   * The English test the score belongs to. Omitted/undefined = IELTS, so all
   * pre-existing data and the IELTS-default wizard are unchanged. Drives the
   * score→IELTS conversion (lib/scoring/english-equivalent.ts) at every threshold
   * comparison — a PTE 58 is otherwise mis-read as a failing IELTS 5.8.
   */
  englishTest?: EnglishTest;
  /** Score in the chosen test's own scale (IELTS band, PTE 10–90, TOEFL iBT 0–120). */
  englishScore?: number;
  destination: Destination;
  budget: number;
  budgetCurrency: Currency;
  fundingSource: FundingSource;
  goal: Goal;
  /**
   * Family the applicant intends to bring. Omitted/undefined = applying alone.
   * Raises the DHA Subclass 500 financial-capacity floor (partner + each child)
   * in the Australia financial gate — see lib/scoring/financial.ts.
   */
  dependents?: { partner: boolean; children: number };
  /**
   * Prior student-visa refusals (immigration section). A real DHA Subclass 500
   * risk factor — penalised in the visa dimension (see lib/scoring/visa.ts).
   * Omitted/undefined = none (the anonymous wizard doesn't collect it).
   */
  priorRefusals?: "none" | "one" | "multiple";
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
