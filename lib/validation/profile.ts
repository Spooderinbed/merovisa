import { z } from "zod";
import {
  EDUCATION_LEVELS,
  GRADE_SYSTEMS,
  FIELDS_OF_STUDY,
  ENGLISH_STATUSES,
  DESTINATIONS,
  FUNDING_SOURCES,
  GOALS,
  CURRENCIES,
  GAP_REASONS,
  ENGLISH_TESTS,
} from "@/lib/scoring/types";
import type { StudentProfile } from "@/lib/scoring/types";
import { computeGapYears, GAP_REQUIRES_REASON_THRESHOLD } from "@/lib/scoring/gap";
import { ALSO_CONSIDERING_CAP } from "@/lib/wizard/also-considering";
import { SECONDARY_GOALS_CAP } from "@/lib/wizard/secondary-goals";

export const ProfileSchema = z
  .object({
    homeCountry: z.string().min(1),
    educationLevel: z.enum(EDUCATION_LEVELS),
    gradeSystem: z.enum(GRADE_SYSTEMS),
    grade: z.number().min(0).max(100),
    fieldOfStudy: z.enum(FIELDS_OF_STUDY),
    alsoConsidering: z.array(z.enum(FIELDS_OF_STUDY)).max(ALSO_CONSIDERING_CAP).optional(),
    graduationYear: z.number().int().min(2010).max(new Date().getFullYear() + 5),
    gapReasons: z.array(z.enum(GAP_REASONS)),
    englishStatus: z.enum(ENGLISH_STATUSES),
    englishTest: z.enum(ENGLISH_TESTS).optional(),
    // Score is in the chosen test's own scale; the per-test range is enforced by the
    // refine below. Upper bound here is the widest scale (TOEFL iBT 0–120).
    englishScore: z.number().min(0).max(120).optional(),
    destination: z.enum(DESTINATIONS),
    budget: z.number().positive(),
    budgetCurrency: z.enum(CURRENCIES),
    fundingSource: z.enum(FUNDING_SOURCES),
    goal: z.enum(GOALS),
    secondaryGoals: z.array(z.enum(GOALS)).max(SECONDARY_GOALS_CAP).optional(),
    dependents: z
      .object({ partner: z.boolean(), children: z.number().int().min(0).max(10) })
      .optional(),
    // F-1 — prior student-visa refusals (none/one/multiple). Optional so existing
    // assess payloads stay valid, but present in the schema so the wizard's answer
    // is NOT stripped before scoring. Mirrors StudentProfile.priorRefusals; the visa
    // dimension penalises one (−15) / multiple (−35) in lib/scoring/visa.ts.
    priorRefusals: z.enum(["none", "one", "multiple"]).optional(),
  })
  .refine(
    (data) => {
      const gap = computeGapYears(data.graduationYear);
      if (gap > GAP_REQUIRES_REASON_THRESHOLD && data.gapReasons.length === 0) return false;
      return true;
    },
    {
      message: "gapReasons required when graduation year implies a gap",
      path: ["gapReasons"],
    },
  )
  .refine(
    (data) => {
      const also = data.alsoConsidering;
      if (!also || also.length === 0) return true;
      // Must stay disjoint from the primary and carry no duplicates.
      if (also.includes(data.fieldOfStudy)) return false;
      if (new Set(also).size !== also.length) return false;
      return true;
    },
    {
      message: "alsoConsidering must exclude the primary field and contain no duplicates",
      path: ["alsoConsidering"],
    },
  )
  .refine(
    (data) => {
      const secondaries = data.secondaryGoals;
      if (!secondaries || secondaries.length === 0) return true;
      // Must stay disjoint from the primary goal and carry no duplicates.
      if (secondaries.includes(data.goal)) return false;
      if (new Set(secondaries).size !== secondaries.length) return false;
      return true;
    },
    {
      message: "secondaryGoals must exclude the primary goal and contain no duplicates",
      path: ["secondaryGoals"],
    },
  )
  .refine(
    (data) => {
      if (data.englishStatus === "taken" && data.englishScore === undefined) {
        return false;
      }
      return true;
    },
    {
      message: "englishScore required when englishStatus is 'taken'",
      path: ["englishScore"],
    },
  )
  .refine(
    (data) => {
      if (data.englishScore === undefined) return true;
      // Per-test valid score range. Default (no test) is IELTS.
      const test = data.englishTest ?? "ielts";
      const RANGE: Record<typeof test, [number, number]> = {
        ielts: [4, 9],
        pte: [10, 90],
        toefl: [0, 120],
      };
      const [min, max] = RANGE[test];
      return data.englishScore >= min && data.englishScore <= max;
    },
    {
      message: "englishScore is outside the valid range for the chosen test",
      path: ["englishScore"],
    },
  );

// Compile-time check: ProfileSchema's inferred output must be assignable to StudentProfile and vice versa.
// If you change one without the other, this line will fail typecheck.
type _InferredMatchesDomain = z.infer<typeof ProfileSchema> extends StudentProfile
  ? StudentProfile extends z.infer<typeof ProfileSchema>
    ? true
    : never
  : never;

// Touch the type so it isn't tree-shaken or flagged as unused.
const _typeCheck: _InferredMatchesDomain = true;
void _typeCheck;
