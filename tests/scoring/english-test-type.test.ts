import { describe, it, expect } from "vitest";
import { scoreVisa } from "@/lib/scoring/visa";
import type { StudentProfile } from "@/lib/scoring/types";

// Australia: DHA visa floor 6.0, course threshold 6.5. A PTE 58 ≈ IELTS 6.5 must
// score like a plain IELTS 6.5 — the bug being fixed is that a raw 58 (or 5.8) was
// read against the IELTS curve directly.
const base: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getFullYear(),
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 6.5,
  destination: "australia",
  budget: 4500000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("scoreVisa with englishTest conversion", () => {
  it("scores a PTE 58 identically to an IELTS 6.5", () => {
    const ielts = scoreVisa({ ...base, englishScore: 6.5 }); // no englishTest → IELTS
    const pte = scoreVisa({ ...base, englishTest: "pte", englishScore: 58 });
    expect(pte.value).toBe(ielts.value);
    expect(pte.factors).toEqual(ielts.factors);
  });

  it("scores a PTE 65 identically to an IELTS 7.0 (above-threshold bonus)", () => {
    const ielts = scoreVisa({ ...base, englishScore: 7.0 });
    const pte = scoreVisa({ ...base, englishTest: "pte", englishScore: 65 });
    expect(pte.value).toBe(ielts.value);
    expect(pte.factors).toEqual(ielts.factors);
  });

  it("scores a TOEFL 60 identically to an IELTS 6.0 (DHA floor, neutral)", () => {
    const ielts = scoreVisa({ ...base, englishScore: 6.0 });
    const toefl = scoreVisa({ ...base, englishTest: "toefl", englishScore: 60 });
    expect(toefl.value).toBe(ielts.value);
    expect(toefl.factors).toEqual(ielts.factors);
  });

  it("does NOT read a PTE 58 as a failing IELTS 5.8 (the bug under fix)", () => {
    const pte58 = scoreVisa({ ...base, englishTest: "pte", englishScore: 58 });
    const ieltsFail = scoreVisa({ ...base, englishScore: 5.8 });
    expect(pte58.value).toBeGreaterThan(ieltsFail.value);
  });

  it("an explicit englishTest 'ielts' behaves like an omitted one", () => {
    const omitted = scoreVisa({ ...base, englishScore: 6.5 });
    const explicit = scoreVisa({ ...base, englishTest: "ielts", englishScore: 6.5 });
    expect(explicit).toEqual(omitted);
  });

  it("renders the factor label as the IELTS-equivalent band, not the raw score", () => {
    const pte = scoreVisa({ ...base, englishTest: "pte", englishScore: 58 });
    const label = pte.factors.find((f) => f.label.startsWith("IELTS"))?.label;
    expect(label).toBe("IELTS 6.5");
  });
});
