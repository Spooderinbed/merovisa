import type { StudentProfile } from "@/lib/scoring/types";

export interface AccuracySuggestion {
  id: string;
  label: string;
  gain: string;
}

export interface ProfileAccuracy {
  completeness: number; // 0-100
  level: "Basic" | "Verified" | "Complete";
  suggestions: AccuracySuggestion[];
}

export function computeProfileAccuracy(profile: StudentProfile): ProfileAccuracy {
  let completeness = 25; // wizard complete, all self-reported
  const suggestions: AccuracySuggestion[] = [
    { id: "transcript", label: "Upload your transcript", gain: "exact grade verification" },
    { id: "financials", label: "Add financial documents", gain: "precise budget assessment" },
  ];

  if (profile.englishStatus === "taken") {
    completeness += 3;
  } else {
    suggestions.push({ id: "english", label: "Verify your English score", gain: "band-level verification" });
  }

  const level = completeness >= 75 ? "Complete" : completeness >= 40 ? "Verified" : "Basic";
  return { completeness, level, suggestions };
}
