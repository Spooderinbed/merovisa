import { describe, it, expect } from "vitest";
import { ProfileSchema } from "@/lib/validation/profile";
import { scoreVisa } from "@/lib/scoring/visa";

// F-1 (audit): the anonymous wizard now asks about prior visa refusals, and the
// answer MUST survive /api/assess validation so the ANONYMOUS verdict already
// reflects it. Otherwise the wizard asks, zod strips the unknown key, and the
// verdict silently ignores the refusal (the "wizard asks, server discards"
// strip-risk). This drives the answer end-to-end: raw input -> ProfileSchema ->
// scoreVisa, through the exact point where the answer used to be dropped.
const validInput = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: 2025,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7.0,
  destination: "australia",
  budget: 4500000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
} as const;

describe("anonymous assessment reflects prior visa refusals (F-1)", () => {
  it("a declared refusal survives validation and lowers the visa score", () => {
    const clean = scoreVisa(ProfileSchema.parse({ ...validInput }));
    const multiple = scoreVisa(ProfileSchema.parse({ ...validInput, priorRefusals: "multiple" }));
    expect(multiple.value).toBe(clean.value - 35);
    expect(multiple.value).toBeLessThan(clean.value);
  });

  it("one refusal is a smaller penalty than multiple", () => {
    const clean = scoreVisa(ProfileSchema.parse({ ...validInput }));
    const one = scoreVisa(ProfileSchema.parse({ ...validInput, priorRefusals: "one" }));
    expect(one.value).toBe(clean.value - 15);
  });

  it("a clean history is unchanged (none and undefined score identically)", () => {
    const undeclared = scoreVisa(ProfileSchema.parse({ ...validInput }));
    const none = scoreVisa(ProfileSchema.parse({ ...validInput, priorRefusals: "none" }));
    expect(none.value).toBe(undeclared.value);
  });
});
