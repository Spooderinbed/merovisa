import { describe, it, expect } from "vitest";
import { isStepComplete, STEP_CALLOUT_KEY } from "@/components/wizard/step-meta";

describe("isStepComplete", () => {
  it("requires a grade as well as an education level", () => {
    expect(isStepComplete("education", { educationLevel: "bachelors" })).toBe(false);
    expect(isStepComplete("education", { educationLevel: "bachelors", grade: 72 })).toBe(true);
  });

  it("requires an english score only when status is taken", () => {
    expect(isStepComplete("english", { englishStatus: "not-taken" })).toBe(true);
    expect(isStepComplete("english", { englishStatus: "taken" })).toBe(false);
    expect(isStepComplete("english", { englishStatus: "taken", englishScore: 7 })).toBe(true);
  });

  it("requires at least one gap reason on the gap step", () => {
    expect(isStepComplete("gap", { gapReasons: [] })).toBe(false);
    expect(isStepComplete("gap", { gapReasons: ["worked"] })).toBe(true);
  });

  it("requires budget, currency, and funding on the budget step", () => {
    expect(isStepComplete("budget", { budget: 4500000, budgetCurrency: "NPR" })).toBe(false);
    expect(
      isStepComplete("budget", { budget: 4500000, budgetCurrency: "NPR", fundingSource: "education-loan" }),
    ).toBe(true);
  });

  it("maps wizard steps to callout keys (gap has none)", () => {
    expect(STEP_CALLOUT_KEY.graduationYear).toBe("graduationYear");
    expect(STEP_CALLOUT_KEY.fieldOfStudy).toBe("fieldOfStudy");
    expect(STEP_CALLOUT_KEY.gap).toBeUndefined();
  });
});
