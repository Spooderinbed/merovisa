import type { ProfileSections } from "./sections";

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
  const dest = get<string>("destination");
  if (dest) out.destination = { primary: dest };

  // academic
  const grade = get<number>("grade");
  const educationLevel = get<string>("educationLevel");
  if (grade !== undefined || educationLevel) {
    out.academic = {};
    if (grade !== undefined) out.academic.gradePercent = grade;
    if (educationLevel) out.academic.degree = educationLevel;
  }

  // intended study
  const field = get<string>("fieldOfStudy");
  if (field) out["intended-study"] = { field };

  // english
  const score = get<number>("englishScore");
  if (score !== undefined) out.english = { test: "ielts", overall: score };

  // gap
  const gapReasons = get<string[]>("gapReasons");
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
  const budgetCurrency = get<string>("budgetCurrency");
  const fundingSource = get<string>("fundingSource");
  if (budget !== undefined || budgetCurrency || fundingSource) {
    out.finance = {};
    if (budget !== undefined) out.finance.total = budget;
    if (budgetCurrency) out.finance.currency = budgetCurrency;
    if (fundingSource) out.finance.source = fundingSource;
  }

  // career
  const goal = get<string>("goal");
  if (goal) out.career = { goal };

  return out;
}
