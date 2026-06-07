import { describe, test, expect } from "vitest";
import { sectionsToStudentProfile } from "@/lib/scoring/from-sections";
import type { ProfileSections } from "@/lib/profiles/sections";

describe("sectionsToStudentProfile", () => {
  test("maps full profile sections to StudentProfile", () => {
    const sections: ProfileSections = {
      destination: { primary: "australia" },
      academic: { degree: "bachelors", gradePercent: 72, gradeSystem: "percentage-nepal", institution: "TU" },
      english: { test: "ielts", overall: 7.0 },
      finance: { total: 3_000_000, currency: "NPR", source: "parents-family" },
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

  // B2 follow-up — route the signed-in family.situation enum into the dependents
  // signal so a signed-in re-score honours the DHA capacity floor. The enum has no
  // child count, so spouse-and-kids maps to a conservative one-child floor.
  describe("dependents from family.situation", () => {
    const deps = (situation: "alone" | "spouse" | "spouse-and-kids" | "other") =>
      sectionsToStudentProfile({ family: { situation } }).dependents;

    test("spouse → a partner, no children", () => {
      expect(deps("spouse")).toEqual({ partner: true, children: 0 });
    });

    test("spouse-and-kids → a partner plus one child (count not captured by the enum)", () => {
      expect(deps("spouse-and-kids")).toEqual({ partner: true, children: 1 });
    });

    test("alone → no dependents (applying alone)", () => {
      expect(deps("alone")).toBeUndefined();
    });

    test("other → no dependents (ambiguous → no capacity bump)", () => {
      expect(deps("other")).toBeUndefined();
    });

    test("an unset family section leaves dependents undefined", () => {
      expect(sectionsToStudentProfile({}).dependents).toBeUndefined();
      expect(sectionsToStudentProfile({ family: {} }).dependents).toBeUndefined();
    });
  });
});
