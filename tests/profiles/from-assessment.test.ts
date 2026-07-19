import { describe, it, expect } from "vitest";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { sectionsToStudentProfile } from "@/lib/scoring/from-sections";

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

  // A student who declares a partner/children anonymously must keep them through
  // account bootstrap, or the signed-in re-score reads sections.family === undefined
  // (applying alone), drops the DHA financial-capacity floor, and can falsely soften
  // an under-funded verdict — the exact trust break the app exists to prevent.
  it("preserves a declared partner through profile bootstrap and signed-in re-scoring", () => {
    const partner = { partner: true, children: 0 };
    const sections = profileSectionsFromAssessment({ ...wizardProfile, dependents: partner }, {});
    expect(sections.family).toEqual({ situation: "spouse", children: 0 });
    expect(sectionsToStudentProfile(sections).dependents).toEqual(partner);
  });

  it("preserves declared children through profile bootstrap and signed-in re-scoring", () => {
    const family = { partner: true, children: 3 };
    const sections = profileSectionsFromAssessment({ ...wizardProfile, dependents: family }, {});
    expect(sections.family).toEqual({ situation: "spouse-and-kids", children: 3 });
    expect(sectionsToStudentProfile(sections).dependents).toEqual(family);
  });

  it("omits the family section when applying alone (no dependents)", () => {
    const sections = profileSectionsFromAssessment(wizardProfile, {});
    expect(sections.family).toBeUndefined();
    expect(sectionsToStudentProfile(sections).dependents).toBeUndefined();
  });

  it("normalizes a CGPA grade to a true percentage at the boundary (gradePercent invariant)", () => {
    // A CGPA anon student who signs in must not have 3.5 persisted as '3.5%'. The
    // boundary normalizes once so every downstream reader treats gradePercent as a
    // real percentage — this is what keeps the signed-in verdict + matches correct.
    const out = profileSectionsFromAssessment(
      { ...wizardProfile, gradeSystem: "cgpa-4", grade: 3.5 },
      {},
    );
    expect(out.academic?.gradePercent).toBe(87.5);
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

  // MV-105 Layer A — non-empty secondaryGoals ride into the career section.
  it("maps non-empty secondaryGoals into the career section", () => {
    const out = profileSectionsFromAssessment(
      { ...wizardProfile, secondaryGoals: ["lowest-cost", "highest-ranked"] },
      {},
    );
    expect(out.career?.goal).toBe("permanent-residency");
    expect(out.career?.secondaryGoals).toEqual(["lowest-cost", "highest-ranked"]);
  });

  it("omits secondaryGoals from the career section when empty or absent", () => {
    const empty = profileSectionsFromAssessment({ ...wizardProfile, secondaryGoals: [] }, {});
    expect(empty.career?.goal).toBe("permanent-residency");
    expect(empty.career?.secondaryGoals).toBeUndefined();

    const absent = profileSectionsFromAssessment(wizardProfile, {});
    expect(absent.career?.secondaryGoals).toBeUndefined();
  });
});
