import { describe, test, expect } from "vitest";
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
import type { ProfileSections } from "@/lib/profiles/sections";

describe("sectionsToMatchInputs English test-type conversion", () => {
  const policy = { nepalAssessmentLevel: "L3" as const };

  test("converts a PTE overall to its IELTS equivalent", () => {
    const sections: ProfileSections = { english: { test: "pte", overall: 58 } };
    const result = sectionsToMatchInputs(sections, policy);
    expect(result.userEnglishOverall).toBe(6.5);
  });

  test("converts a TOEFL overall to its IELTS equivalent", () => {
    const sections: ProfileSections = { english: { test: "toefl", overall: 79 } };
    const result = sectionsToMatchInputs(sections, policy);
    expect(result.userEnglishOverall).toBe(6.5);
  });

  test("passes an IELTS overall through unchanged", () => {
    const sections: ProfileSections = { english: { test: "ielts", overall: 6.5 } };
    const result = sectionsToMatchInputs(sections, policy);
    expect(result.userEnglishOverall).toBe(6.5);
  });

  test("treats an omitted test as IELTS", () => {
    const sections: ProfileSections = { english: { overall: 7.0 } };
    const result = sectionsToMatchInputs(sections, policy);
    expect(result.userEnglishOverall).toBe(7.0);
  });

  test("uses the converted overall as the band proxy for a non-IELTS test", () => {
    // PTE per-subskill scores are not IELTS bands, so the band proxy falls back to
    // the converted overall rather than the raw sub-scores.
    const sections: ProfileSections = {
      english: { test: "pte", overall: 58, listening: 50, reading: 55, writing: 52, speaking: 60 },
    };
    const result = sectionsToMatchInputs(sections, policy);
    expect(result.userEnglishBand).toBe(6.5);
  });

  test("keeps IELTS per-band minimum as the band proxy", () => {
    const sections: ProfileSections = {
      english: { test: "ielts", overall: 7.0, listening: 7.5, reading: 6.5, writing: 6.5, speaking: 7.0 },
    };
    const result = sectionsToMatchInputs(sections, policy);
    expect(result.userEnglishBand).toBe(6.5);
  });
});
