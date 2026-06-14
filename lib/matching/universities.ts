// DEPRECATED — used only by the anonymous wizard's snapshot payload.
// Signed-in users get live DB-driven matches via lib/matches/compute.ts.
// This file will be deleted once the anonymous flow also reads programs from the DB.
import type { FieldOfStudy, StudentProfile } from "@/lib/scoring/types";
import { AU_UNIVERSITIES } from "@/lib/data/universities/au";
import type { UniversityData } from "@/lib/data/types";
import type { PreferenceChip } from "@/lib/matches/types";

export type MatchLevel = "strong" | "possible" | "reach";

export interface UniversityMatch {
  university: UniversityData;
  matchLevel: MatchLevel;
  reason: string;
  /** Set by the preference pass; absent on the eligibility-only path. */
  preferenceChip?: PreferenceChip | null;
}

export function effectiveEnglish(profile: Partial<StudentProfile>): number {
  if (profile.englishStatus === "taken" && typeof profile.englishScore === "number") {
    return profile.englishScore;
  }
  if (profile.englishStatus === "booked") return 6.5;
  return 6.0;
}

const LEVEL_ORDER: Record<MatchLevel, number> = { strong: 0, possible: 1, reach: 2 };

// The wizard collects `grade` as a 0–100 percentage (see education-step + ProfileSchema),
// so it is compared directly against each university's minimum percentage requirement.
// CGPA normalization is intentionally deferred until non-percentage corridors are supported.
export function matchUniversities(profile: StudentProfile): UniversityMatch[] {
  const pct = profile.grade;
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
