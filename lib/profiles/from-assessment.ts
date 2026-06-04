import type { ProfileSections } from "./sections";
import type {
  Destination,
  EducationLevel,
  FieldOfStudy,
  GapReason,
  Currency,
  FundingSource,
  Goal,
} from "@/lib/scoring/types";

interface Fallback {
  name?: string;
}

interface Options {
  nowYear?: number;
}

export function profileSectionsFromAssessment(
  snapshot: Record<string, unknown>,
  fallback: Fallback,
  opts: Options = {},
): ProfileSections {
  const out: ProfileSections = {};
  const get = <T>(k: string) => snapshot[k] as T | undefined;

  // personal
  if (fallback.name) out.personal = { name: fallback.name };

  // destination
  const dest = get<Destination>("destination");
  if (dest) out.destination = { primary: dest };

  // academic
  const grade = get<number>("grade");
  const educationLevel = get<EducationLevel>("educationLevel");
  if (grade !== undefined || educationLevel) {
    out.academic = {};
    if (grade !== undefined) out.academic.gradePercent = grade;
    if (educationLevel) out.academic.degree = educationLevel;
  }

  // intended study
  const field = get<FieldOfStudy>("fieldOfStudy");
  if (field) out["intended-study"] = { field };

  // english
  const score = get<number>("englishScore");
  if (score !== undefined) out.english = { test: "ielts", overall: score };

  // gap
  const gapReasons = get<GapReason[]>("gapReasons");
  const gradYear = get<number>("graduationYear");
  if ((gapReasons && gapReasons.length > 0) || gradYear !== undefined) {
    out.gap = {};
    if (gapReasons && gapReasons.length > 0) out.gap.reasons = gapReasons;
    if (gradYear !== undefined && opts.nowYear !== undefined) {
      out.gap.years = Math.max(0, opts.nowYear - gradYear);
    }
  }

  // finance
  const budget = get<number>("budget");
  const budgetCurrency = get<Currency>("budgetCurrency");
  const fundingSource = get<FundingSource>("fundingSource");
  if (budget !== undefined || budgetCurrency || fundingSource) {
    out.finance = {};
    if (budget !== undefined) out.finance.total = budget;
    if (budgetCurrency) out.finance.currency = budgetCurrency;
    if (fundingSource) out.finance.source = fundingSource;
  }

  // career
  const goal = get<Goal>("goal");
  if (goal) out.career = { goal };

  return out;
}
