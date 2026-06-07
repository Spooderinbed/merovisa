import { describe, it, expect } from "vitest";
import { scoreVisa } from "@/lib/scoring/visa";
import type { StudentProfile } from "@/lib/scoring/types";

const baseProfile: StudentProfile = {
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
};

const currentYear = new Date().getFullYear();

describe("scoreVisa", () => {
  it("returns a score between 0 and 100", () => {
    const result = scoreVisa(baseProfile);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
  });

  it("scores higher for recent graduates than for long gaps", () => {
    const recent = scoreVisa({ ...baseProfile, graduationYear: currentYear, gapReasons: [] });
    const longGap = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 6,
      gapReasons: ["worked"],
    });
    expect(recent.value).toBeGreaterThan(longGap.value);
  });

  it("scores higher when gap is explained by work", () => {
    const explained = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 2,
      gapReasons: ["worked"],
    });
    const unexplained = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 2,
      gapReasons: ["health-family"],
    });
    expect(explained.value).toBeGreaterThan(unexplained.value);
  });

  it("rewards IELTS at or above 6.5 for Australia", () => {
    const low = scoreVisa({ ...baseProfile, englishScore: 6.0 });
    const ok = scoreVisa({ ...baseProfile, englishScore: 7.0 });
    expect(ok.value).toBeGreaterThan(low.value);
  });

  it("flags long unexplained gap as risk", () => {
    const result = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 5,
      gapReasons: ["health-family"],
    });
    expect(result.factors.some((f) => f.influence === "risk")).toBe(true);
  });
});

// B1 — the DHA visa English floor (IELTS 6.0 each band) is distinct from the 6.5
// course-admission threshold. Visa-valid English (6.0–6.4) must not be scored as a
// shortfall; below 6.0 stays a real risk. Australia: floor 6.0, course threshold 6.5.
describe("scoreVisa — DHA visa English floor (Australia)", () => {
  const ielts = (englishScore: number) => scoreVisa({ ...baseProfile, englishScore });
  const ieltsFactor = (s: number) => ielts(s).factors.find((f) => /IELTS/.test(f.label));

  it("does not penalise IELTS 6.0–6.4 — the visa floor is met (same as scoring at 6.5)", () => {
    expect(ielts(6.0).value).toBe(ielts(6.5).value);
    expect(ielts(6.25).value).toBe(ielts(6.5).value);
  });

  it("labels visa-valid 6.0–6.4 as meeting the floor (neutral) with the DHA gov source", () => {
    const f = ieltsFactor(6.0);
    expect(f?.influence).toBe("neutral");
    expect(f?.detail).toMatch(/visa floor/i);
    expect(f?.source?.url).toMatch(/^https:\/\/immi\.homeaffairs\.gov\.au/);
    expect(f?.source?.lastVerified).toBe("2026-06-07");
  });

  it("still penalises below the 6.0 floor, unchanged from the course-threshold curve", () => {
    // 5.5 is one full band below the 6.5 course threshold → −10 vs the threshold baseline.
    expect(ielts(5.5).value).toBe(ielts(6.5).value - 10);
    const f = ieltsFactor(5.5);
    expect(f?.influence).toBe("risk");
    expect(f?.detail).toMatch(/below the dha visa floor/i);
  });

  it("rewards above the 6.5 course threshold, unchanged (+10 per band)", () => {
    expect(ielts(7.5).value).toBe(ielts(6.5).value + 10);
    expect(ieltsFactor(7.5)?.influence).toBe("positive");
  });

  it("keeps a hard cliff at the floor: 6.0 is not penalised, 5.5 is", () => {
    expect(ielts(6.0).value).toBeGreaterThan(ielts(5.5).value);
  });
});
