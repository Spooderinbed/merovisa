export const SECTION_KEYS = [
  "personal", "destination", "academic", "intended-study", "english",
  "gap", "work", "finance", "immigration", "family", "career",
  "scholarships", "deal-breakers",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface ProfileSections {
  personal?:        { name?: string; age?: number; intakeIso?: string };
  destination?:     { primary?: string; alternates?: string[] };
  academic?:        { institution?: string; degree?: string; gradePercent?: number; gradeSystem?: string };
  "intended-study"?: { level?: string; field?: string; specialisation?: string };
  english?:         { test?: "ielts" | "pte" | "toefl"; overall?: number; reportUploaded?: boolean };
  gap?:             { years?: number; reasons?: string[]; evidence?: string[] };
  work?:            { title?: string; years?: number; relevance?: string; docs?: boolean };
  finance?:         { total?: number; currency?: string; source?: string; proofUploaded?: boolean };
  immigration?:     { refusals?: string; travelled?: boolean };
  family?:          { situation?: string };
  career?:          { goal?: string; targetRole?: string };
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
