import { describe, it, expect } from "vitest";
import { computeMatches } from "@/lib/matches/compute";
import type { Program, University } from "@/lib/programs/types";

const uni: University = {
  id: "u1",
  country: "AU",
  name: "X",
  city: "Y",
  rankingTier: 2,
  source: "https://x",
  lastVerified: "2026-01-01",
  dataQuality: "primary",
};
const p = (over: Partial<Program> = {}): Program => ({
  id: "p1",
  universityId: "u1",
  name: "Master of IT",
  level: "masters",
  field: "computer-science",
  tuitionMin: 40000,
  tuitionMax: 40000,
  tuitionCurrency: "AUD",
  minGrade: 65,
  minEnglish: 6.5,
  minEnglishBand: 6.0,
  intakes: ["feb"],
  source: "https://x",
  lastVerified: "2026-01-01",
  dataQuality: "primary",
  notes: null,
  ...over,
});

const policy = { nepalAssessmentLevel: "L3" as const };

describe("computeMatches verdict", () => {
  it("strong when grade, english and budget all meet minimums", () => {
    const m = computeMatches(
      {
        userGradePercent: 72,
        userEnglishOverall: 7,
        userEnglishBand: 7,
        userBudgetAud: 45000,
        userField: "computer-science",
        policy,
      },
      [p()],
      [uni],
    )[0]!;
    expect(m.verdict).toBe("strong");
  });

  it("reach when grade > 10 short", () => {
    const m = computeMatches(
      {
        userGradePercent: 50,
        userEnglishOverall: 7,
        userEnglishBand: 7,
        userBudgetAud: 45000,
        userField: "computer-science",
        policy,
      },
      [p()],
      [uni],
    )[0]!;
    expect(m.verdict).toBe("reach");
  });

  it("reach when english > 1 short", () => {
    const m = computeMatches(
      {
        userGradePercent: 72,
        userEnglishOverall: 5,
        userEnglishBand: 5,
        userBudgetAud: 45000,
        userField: "computer-science",
        policy,
      },
      [p()],
      [uni],
    )[0]!;
    expect(m.verdict).toBe("reach");
  });

  it("reach when tuitionGap > 50% of tuition", () => {
    const m = computeMatches(
      {
        userGradePercent: 72,
        userEnglishOverall: 7,
        userEnglishBand: 7,
        userBudgetAud: 10000,
        userField: "computer-science",
        policy,
      },
      [p()],
      [uni],
    )[0]!;
    expect(m.verdict).toBe("reach");
  });

  it("possible when one factor short by a little", () => {
    const m = computeMatches(
      {
        userGradePercent: 60,
        userEnglishOverall: 7,
        userEnglishBand: 7,
        userBudgetAud: 45000,
        userField: "computer-science",
        policy,
      },
      [p()],
      [uni],
    )[0]!;
    expect(m.verdict).toBe("possible");
  });

  it("reasons include a positive field alignment when fields match", () => {
    const m = computeMatches(
      {
        userGradePercent: 72,
        userEnglishOverall: 7,
        userEnglishBand: 7,
        userBudgetAud: 45000,
        userField: "computer-science",
        policy,
      },
      [p()],
      [uni],
    )[0]!;
    expect(m.reasons.some((r) => r.kind === "field" && r.positive)).toBe(true);
  });

  it("reasons include the AL3 policy note when nepalAssessmentLevel = L3", () => {
    const m = computeMatches(
      {
        userGradePercent: 72,
        userEnglishOverall: 7,
        userEnglishBand: 7,
        userBudgetAud: 45000,
        userField: "computer-science",
        policy,
      },
      [p()],
      [uni],
    )[0]!;
    expect(m.reasons.some((r) => r.kind === "policy")).toBe(true);
  });

  it("returns [] when programs reference a missing university", () => {
    const m = computeMatches(
      {
        userGradePercent: 72,
        userEnglishOverall: 7,
        userEnglishBand: 7,
        userBudgetAud: 45000,
        userField: "computer-science",
        policy,
      },
      [p({ universityId: "nope" })],
      [],
    );
    expect(m).toEqual([]);
  });
});
