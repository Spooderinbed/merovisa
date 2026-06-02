import { describe, it, expect } from "vitest";
import { evaluateWizardCallouts } from "@/lib/callouts/rules";
import type { StudentProfile } from "@/lib/scoring/types";

const partial = (overrides: Partial<StudentProfile>): Partial<StudentProfile> => ({
  homeCountry: "Nepal",
  destination: "australia",
  fieldOfStudy: "computer-science",
  educationLevel: "bachelors",
  ...overrides,
});

const currentYear = new Date().getFullYear();

describe("evaluateWizardCallouts", () => {
  it("returns a long-gap callout when graduation was 6+ years ago", () => {
    const callouts = evaluateWizardCallouts(
      partial({ graduationYear: currentYear - 6 }) as StudentProfile,
      "graduationYear",
    );
    expect(callouts.some((c) => /5 years/i.test(c.message))).toBe(true);
  });

  it("returns an IELTS callout when score is below 6.5 and destination is Australia", () => {
    const callouts = evaluateWizardCallouts(
      partial({
        englishStatus: "taken",
        englishScore: 6.0,
        destination: "australia",
      }) as StudentProfile,
      "english",
    );
    expect(callouts.some((c) => /6\.5\+/i.test(c.message))).toBe(true);
  });

  it("returns no English callout when IELTS is 7.0 and destination is Australia", () => {
    const callouts = evaluateWizardCallouts(
      partial({
        englishStatus: "taken",
        englishScore: 7.0,
        destination: "australia",
      }) as StudentProfile,
      "english",
    );
    expect(callouts).toHaveLength(0);
  });

  it("returns a nursing-specific callout for nursing + australia", () => {
    const callouts = evaluateWizardCallouts(
      partial({ fieldOfStudy: "nursing", destination: "australia" }) as StudentProfile,
      "fieldOfStudy",
    );
    expect(callouts.some((c) => /AHPRA/i.test(c.message))).toBe(true);
  });

  it("returns a scholarship-friendly callout when funding is scholarship-dependent", () => {
    const callouts = evaluateWizardCallouts(
      partial({ fundingSource: "scholarship-dependent" }) as StudentProfile,
      "budget",
    );
    expect(callouts.some((c) => /scholarship/i.test(c.message))).toBe(true);
  });

  it("returns multi-country comparison callout when destination is 'not-sure'", () => {
    const callouts = evaluateWizardCallouts(
      partial({ destination: "not-sure" }) as StudentProfile,
      "destination",
    );
    expect(callouts.some((c) => /compare/i.test(c.message))).toBe(true);
  });
});
