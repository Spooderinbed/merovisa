import type { FieldOfStudy, GradeSystem, StudentProfile } from "@/lib/scoring/types";
import { AU_UNIVERSITIES } from "@/lib/data/universities/au";
import type { UniversityData } from "@/lib/data/types";

export type MatchLevel = "strong" | "possible" | "reach";

export interface UniversityMatch {
  university: UniversityData;
  matchLevel: MatchLevel;
  reason: string;
}

export function gradeToPercent(grade: number, system: GradeSystem): number {
  switch (system) {
    case "cgpa-4":
      return (grade / 4) * 100;
    case "cgpa-5":
      return (grade / 5) * 100;
    case "cgpa-10":
      return (grade / 10) * 100;
    default:
      return grade; // percentage, percentage-nepal, percentage-india
  }
}

export function effectiveEnglish(profile: Partial<StudentProfile>): number {
  if (profile.englishStatus === "taken" && typeof profile.englishScore === "number") {
    return profile.englishScore;
  }
  if (profile.englishStatus === "booked") return 6.5;
  return 6.0;
}

const LEVEL_ORDER: Record<MatchLevel, number> = { strong: 0, possible: 1, reach: 2 };

export function matchUniversities(profile: StudentProfile): UniversityMatch[] {
  const pct = gradeToPercent(profile.grade, profile.gradeSystem);
  const english = effectiveEnglish(profile);
  const field = profile.fieldOfStudy;

  const pool = AU_UNIVERSITIES.filter(
    (u) => field === "other" || u.fieldsOffered.includes(field as FieldOfStudy),
  );

  const matches: UniversityMatch[] = pool.map((u) => {
    const englishOk = english >= u.minEnglishScore;
    let matchLevel: MatchLevel;
    if (pct >= u.minGradePercent + 5 && englishOk) matchLevel = "strong";
    else if (pct >= u.minGradePercent - 5 && english >= u.minEnglishScore - 0.5) matchLevel = "possible";
    else matchLevel = "reach";

    const reason =
      matchLevel === "strong"
        ? `Your grade clears the ~${u.minGradePercent}% bar with room to spare.`
        : matchLevel === "possible"
          ? `You're near the ~${u.minGradePercent}% requirement — a realistic target.`
          : `Stretch: needs ~${u.minGradePercent}% and IELTS ${u.minEnglishScore}.`;

    return { university: u, matchLevel, reason };
  });

  return matches.sort(
    (a, b) =>
      LEVEL_ORDER[a.matchLevel] - LEVEL_ORDER[b.matchLevel] ||
      a.university.rankingTier - b.university.rankingTier,
  );
}
