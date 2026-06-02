import { z } from "zod";

export const ProfileSchema = z
  .object({
    homeCountry: z.string().min(1),
    educationLevel: z.enum(["higher-secondary", "bachelors", "masters"]),
    gradeSystem: z.enum([
      "percentage-nepal",
      "cgpa-4",
      "percentage-india",
      "cgpa-10",
      "cgpa-5",
      "percentage",
    ]),
    grade: z.number().min(0).max(100),
    fieldOfStudy: z.enum([
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
    ]),
    graduationYear: z.number().int().min(2010).max(2030),
    gapReasons: z.array(
      z.enum([
        "worked",
        "retook-exams",
        "health-family",
        "started-something",
        "preparing",
      ]),
    ),
    englishStatus: z.enum(["not-taken", "booked", "taken"]),
    englishScore: z.number().min(4).max(9).optional(),
    destination: z.enum([
      "australia",
      "canada",
      "uk",
      "germany",
      "usa",
      "ireland",
      "not-sure",
    ]),
    budget: z.number().positive(),
    budgetCurrency: z.enum(["NPR", "USD"]),
    fundingSource: z.enum([
      "self-funded",
      "parents-family",
      "education-loan",
      "mixed",
      "scholarship-dependent",
    ]),
    goal: z.enum([
      "permanent-residency",
      "lowest-cost",
      "highest-ranked",
      "fastest-admission",
      "best-employment",
      "research",
    ]),
  })
  .refine(
    (data) => {
      const currentYear = new Date().getFullYear();
      const gap = currentYear - data.graduationYear;
      if (gap > 1 && data.gapReasons.length === 0) return false;
      return true;
    },
    {
      message: "gapReasons required when graduation year implies a gap",
      path: ["gapReasons"],
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
  );

export type Profile = z.infer<typeof ProfileSchema>;
