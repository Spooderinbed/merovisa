import { describe, it, expect } from "vitest";
import { hasSufficientInputs } from "@/lib/matches/sufficiency";
import type { MatchInputs } from "@/lib/matches/types";

// A name-only profile: every verdict-driving input is absent. compute.ts floors each
// unknown to 0 (userGradePercent ?? 0, …), so scoring this student fabricates a
// "Reach · Grade short by 65%" band they never earned. hasSufficientInputs is the
// upstream gate that lets the three consumer sites abstain instead (audit C-4).
const base: MatchInputs = {
  userGradePercent: null,
  userEnglishOverall: null,
  userEnglishBand: null,
  userBudgetAud: null,
  userField: null,
  userTargetLevel: null,
  policy: { nepalAssessmentLevel: "L2", financialCapacity: null },
};

describe("hasSufficientInputs", () => {
  it("is false when all three verdict-driving inputs are absent (name-only profile)", () => {
    expect(hasSufficientInputs(base)).toBe(false);
  });

  it("is true when the profile is fully populated", () => {
    expect(
      hasSufficientInputs({
        ...base,
        userGradePercent: 72,
        userEnglishOverall: 7,
        userEnglishBand: 6.5,
        userBudgetAud: 50000,
      }),
    ).toBe(true);
  });

  // The threshold, pinned: ANY single verdict-driving input present ⇒ sufficient. A
  // partial profile must still render match cards — a wall is itself a bounce to a
  // consultancy, so the gate closes ONLY on the fully-absent case.
  it("is true when only the grade is present", () => {
    expect(hasSufficientInputs({ ...base, userGradePercent: 72 })).toBe(true);
  });

  it("is true when only the English overall is present", () => {
    expect(hasSufficientInputs({ ...base, userEnglishOverall: 6.5 })).toBe(true);
  });

  it("is true when only the budget is present", () => {
    expect(hasSufficientInputs({ ...base, userBudgetAud: 50000 })).toBe(true);
  });

  // Non-verdict inputs (field, target level) do NOT lift the gate: a student who set
  // only their intended field still has no grade/English/budget to score, so scoring
  // them would fabricate a band exactly as the name-only case does.
  it("is false when only non-verdict inputs (field, target level) are present", () => {
    expect(
      hasSufficientInputs({ ...base, userField: "computer-science", userTargetLevel: "masters" }),
    ).toBe(false);
  });

  // A bands-only profile (all four IELTS bands entered, no overall) CAN occur: the adapter
  // sets userEnglishBand from min(bands) while userEnglishOverall stays null. We still gate
  // it, and that is honest under Layer A — compute.ts derives the English verdict from the
  // 0-floored overall (englishGap = minEnglish - 0), so scoring a bands-only profile would
  // fabricate an "IELTS overall short by X" reason and a reach. Deriving a verdict from
  // bands alone is deferred Layer B; here, abstaining beats fabricating.
  it("is false when a per-band value is set but the English overall is absent", () => {
    expect(hasSufficientInputs({ ...base, userEnglishBand: 6.5 })).toBe(false);
  });
});
