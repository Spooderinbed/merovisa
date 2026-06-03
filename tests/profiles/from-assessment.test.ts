import { describe, it, expect } from "vitest";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";

describe("profileSectionsFromAssessment", () => {
  const wizardProfile = {
    homeCountry: "Nepal",
    educationLevel: "bachelors",
    gradeSystem: "percentage-nepal",
    grade: 72,
    fieldOfStudy: "computer-science",
    graduationYear: 2024,
    gapReasons: ["worked"],
    englishStatus: "taken",
    englishScore: 7,
    destination: "australia",
    budget: 4_500_000,
    budgetCurrency: "NPR",
    fundingSource: "education-loan",
    goal: "permanent-residency",
  };

  it("maps wizard answers into the section schema", () => {
    const out = profileSectionsFromAssessment(wizardProfile, { name: "Aarav Sharma" });
    expect(out.personal?.name).toBe("Aarav Sharma");
    expect(out.destination?.primary).toBe("australia");
    expect(out.academic?.gradePercent).toBe(72);
    expect(out["intended-study"]?.field).toBe("computer-science");
    expect(out.english?.overall).toBe(7);
    expect(out.gap?.reasons).toEqual(["worked"]);
    expect(out.finance?.total).toBe(4_500_000);
    expect(out.finance?.currency).toBe("NPR");
    expect(out.finance?.source).toBe("education-loan");
    expect(out.career?.goal).toBe("permanent-residency");
  });

  it("omits personal.name when no fallback given and snapshot has no name", () => {
    expect(profileSectionsFromAssessment(wizardProfile, {}).personal?.name).toBeUndefined();
  });

  it("computes gap years from current year - graduationYear when present", () => {
    const out = profileSectionsFromAssessment(
      { ...wizardProfile, graduationYear: 2024 },
      {},
      { nowYear: 2026 },
    );
    expect(out.gap?.years).toBe(2);
  });

  it("handles completely empty input gracefully", () => {
    const out = profileSectionsFromAssessment({}, {});
    expect(out).toEqual({});
  });
});
