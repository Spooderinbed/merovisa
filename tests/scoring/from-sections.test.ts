import { describe, test, expect } from "vitest";
import { sectionsToStudentProfile } from "@/lib/scoring/from-sections";
import type { ProfileSections } from "@/lib/profiles/sections";

describe("sectionsToStudentProfile", () => {
  test("maps full profile sections to StudentProfile", () => {
    const sections: ProfileSections = {
      destination: { primary: "australia" },
      academic: { degree: "bachelors", gradePercent: 72, gradeSystem: "percentage-nepal", institution: "TU" },
      english: { test: "ielts", overall: 7.0 },
      finance: { total: 3_000_000, currency: "NPR", source: "parents" },
      career: { goal: "permanent-residency" },
      gap: { years: 2, reasons: ["worked"] },
      "intended-study": { field: "computer-science" },
    };
    const result = sectionsToStudentProfile(sections);
    expect(result.destination).toBe("australia");
    expect(result.educationLevel).toBe("bachelors");
    expect(result.grade).toBe(72);
    expect(result.gradeSystem).toBe("percentage-nepal");
    expect(result.englishScore).toBe(7.0);
    expect(result.budget).toBe(3_000_000);
    expect(result.budgetCurrency).toBe("NPR");
    expect(result.fundingSource).toBe("parents-family");
    expect(result.goal).toBe("permanent-residency");
    expect(result.gapReasons).toEqual(["worked"]);
    expect(result.fieldOfStudy).toBe("computer-science");
  });

  test("returns sensible defaults for empty sections", () => {
    const result = sectionsToStudentProfile({});
    expect(result.homeCountry).toBe("nepal");
    expect(result.destination).toBe("australia");
    expect(result.grade).toBe(0);
    expect(result.englishStatus).toBe("not-taken");
    expect(result.gapReasons).toEqual([]);
  });

  test("derives englishStatus from score presence", () => {
    const withScore = sectionsToStudentProfile({ english: { overall: 6.5 } });
    expect(withScore.englishStatus).toBe("taken");
    expect(withScore.englishScore).toBe(6.5);

    const without = sectionsToStudentProfile({ english: { test: "ielts" } });
    expect(without.englishStatus).toBe("booked");
  });
});
