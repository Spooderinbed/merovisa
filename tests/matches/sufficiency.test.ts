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

  // English presence keys on userEnglishOverall, not the per-band proxy. (The adapter
  // never yields band-without-overall — minBand falls back to overall — so this only
  // pins the chosen presence signal.)
  it("is false when a per-band value is set but the English overall is absent", () => {
    expect(hasSufficientInputs({ ...base, userEnglishBand: 6.5 })).toBe(false);
  });
});
