import type { ProfileSections } from "./sections";
import type {
  Destination,
  EducationLevel,
  FieldOfStudy,
  GapReason,
  Currency,
  FundingSource,
  Goal,
  GradeSystem,
} from "@/lib/scoring/types";
import { normalizeGradeToPercentage } from "@/lib/scoring/grade-normalize";

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

  // academic — gradePercent is canonical: a true 0–100 percentage. The wizard
  // collects a raw grade in its own system (e.g. CGPA 3.5), so normalize it here at
  // the boundary; storing it raw would mis-read a 3.5 CGPA as "3.5%" downstream
  // (collapsing the signed-in verdict + matches). gradeSystem is deliberately not
  // persisted — gradePercent is already system-agnostic, and re-attaching the source
  // system would re-trigger normalization (double-counting) on the next read.
  const grade = get<number>("grade");
  const gradeSystem = get<GradeSystem>("gradeSystem");
  const educationLevel = get<EducationLevel>("educationLevel");
  if (grade !== undefined || educationLevel) {
    out.academic = {};
    if (grade !== undefined) {
      out.academic.gradePercent = normalizeGradeToPercentage(grade, gradeSystem ?? "percentage");
    }
    if (educationLevel) out.academic.degree = educationLevel;
  }

  // intended study
  const field = get<FieldOfStudy>("fieldOfStudy");
  if (field) {
    const alsoConsidering = get<FieldOfStudy[]>("alsoConsidering");
    out["intended-study"] = {
      field,
      ...(alsoConsidering && alsoConsidering.length > 0 ? { alsoConsidering } : {}),
    };
  }

  // english
  const score = get<number>("englishScore");
  const englishTest = get<"ielts" | "pte" | "toefl">("englishTest");
  if (score !== undefined) out.english = { test: englishTest ?? "ielts", overall: score };

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
  if (goal) {
    const secondaryGoals = get<Goal[]>("secondaryGoals");
    out.career = {
      goal,
      ...(secondaryGoals && secondaryGoals.length > 0 ? { secondaryGoals } : {}),
    };
  }

  return out;
}
