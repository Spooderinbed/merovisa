import type {
  EducationLevel,
  GradeSystem,
  FieldOfStudy,
  GapReason,
  FundingSource,
  Goal,
  Currency,
  Destination,
} from "@/lib/scoring/types";

export const SECTION_KEYS = [
  "personal", "destination", "academic", "intended-study", "english",
  "gap", "work", "finance", "immigration", "family", "career",
  "scholarships", "deal-breakers",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface ProfileSections {
  personal?:        { name?: string; age?: number; intakeIso?: string };
  destination?:     { primary?: Destination; alternates?: Destination[] };
  academic?:        { institution?: string; degree?: EducationLevel; gradePercent?: number; gradeSystem?: GradeSystem };
  "intended-study"?: { level?: EducationLevel; field?: FieldOfStudy; alsoConsidering?: FieldOfStudy[]; specialisation?: string };
  english?:         { test?: "ielts" | "pte" | "toefl"; overall?: number; listening?: number; reading?: number; writing?: number; speaking?: number; reportUploaded?: boolean };
  gap?:             { years?: number; reasons?: GapReason[]; evidence?: string[] };
  work?:            { title?: string; years?: number; relevance?: "directly-related" | "related" | "unrelated"; docs?: boolean };
  finance?:         { total?: number; currency?: Currency; source?: FundingSource; proofUploaded?: boolean };
  immigration?:     { refusals?: "none" | "one" | "multiple"; travelled?: boolean };
  family?:          { situation?: "alone" | "spouse" | "spouse-and-kids" | "other"; children?: number };
  career?:          { goal?: Goal; secondaryGoals?: Goal[]; targetRole?: string };
  scholarships?:    { profile?: string[] };
  "deal-breakers"?: { mustHaves?: string[] };
}

export const REQUIRED_FIELDS: Record<SectionKey, string[]> = {
  "personal":        ["name"],
  "destination":     ["primary"],
  "academic":        ["institution", "gradePercent"],
  "intended-study":  ["level", "field"],
  "english":         ["test", "overall"],
  "gap":             ["years"],
  "work":            ["title"],
  "finance":         ["total", "source"],
  "immigration":     ["refusals"],
  "family":          ["situation"],
  "career":          ["goal"],
  "scholarships":    [],
  "deal-breakers":   [],
};
