import { describe, it, expect } from "vitest";
import { computeMatches, computeMatch } from "@/lib/matches/compute";
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

describe("computeMatch (single program, no list filter — used to freeze a prediction)", () => {
  const inputs = {
    userGradePercent: 72,
    userEnglishOverall: 7,
    userEnglishBand: 7,
    userBudgetAud: 45000,
    userField: "computer-science",
    userTargetLevel: "masters" as const,
    policy,
  };

  it("returns a verdict for one program directly, even at a level the list filter would drop", () => {
    const m = computeMatch(inputs, p({ level: "bachelors" }), uni);
    expect(m).not.toBeNull();
    expect(["strong", "possible", "reach"]).toContain(m!.verdict);
  });

  it("returns null when the university is missing", () => {
    expect(computeMatch(inputs, p(), undefined)).toBeNull();
  });
});

describe("computeMatches verdict", () => {
  it("strong when grade, english and budget all meet minimums", () => {
    const m = computeMatches(
      {
        userGradePercent: 72,
        userEnglishOverall: 7,
        userEnglishBand: 7,
        userBudgetAud: 45000,
        userField: "computer-science",
        userTargetLevel: "masters",
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
        userTargetLevel: "masters",
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
        userTargetLevel: "masters",
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
        userTargetLevel: "masters",
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
        userTargetLevel: "masters",
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
        userTargetLevel: "masters",
        policy,
      },
      [p()],
      [uni],
    )[0]!;
    expect(m.reasons.some((r) => r.kind === "field" && r.positive)).toBe(true);
  });

  it("sorts also-considering programs below the primary field but above the rest (three-tier soft sort)", () => {
    const csProgram = p({ id: "cs", field: "computer-science" });
    const bizProgram = p({ id: "biz", field: "business" });
    const artsProgram = p({ id: "arts", field: "arts" });
    const uniB: University = { ...uni, id: "u2" };
    const uniC: University = { ...uni, id: "u3" };
    const ordered = computeMatches(
      {
        userGradePercent: 72,
        userEnglishOverall: 7,
        userEnglishBand: 7,
        userBudgetAud: 45000,
        userField: "computer-science",
        alsoFields: ["business"],
        userTargetLevel: "masters",
        policy,
      },
      // Deliberately out of order: rest, extra, primary.
      [
        p({ id: "arts", field: "arts", universityId: "u3" }),
        p({ id: "biz", field: "business", universityId: "u2" }),
        p({ id: "cs", field: "computer-science" }),
      ],
      [uni, uniB, uniC],
    );
    expect(ordered.map((m) => m.program.id)).toEqual(["cs", "biz", "arts"]);
    void csProgram;
    void bizProgram;
    void artsProgram;
  });

  it("labels an also-considering program as exploratory (not covered by the verdict)", () => {
    const uniB: University = { ...uni, id: "u2" };
    const m = computeMatches(
      {
        userGradePercent: 72,
        userEnglishOverall: 7,
        userEnglishBand: 7,
        userBudgetAud: 45000,
        userField: "computer-science",
        alsoFields: ["business"],
        userTargetLevel: "masters",
        policy,
      },
      [p({ id: "biz", field: "business", universityId: "u2" })],
      [uniB],
    )[0]!;
    const exploring = m.reasons.find((r) => r.kind === "field-exploring");
    expect(exploring).toBeDefined();
    expect(exploring!.text).toMatch(/also considering/i);
    expect(exploring!.text).toMatch(/not covered by your verdict/i);
    // It must NOT also claim a positive primary-field alignment.
    expect(m.reasons.some((r) => r.kind === "field")).toBe(false);
  });

  it("reasons include the AL3 policy note when nepalAssessmentLevel = L3", () => {
    const m = computeMatches(
      {
        userGradePercent: 72,
        userEnglishOverall: 7,
        userEnglishBand: 7,
        userBudgetAud: 45000,
        userField: "computer-science",
        userTargetLevel: "masters",
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
        userTargetLevel: "masters",
        policy,
      },
      [p({ universityId: "nope" })],
      [],
    );
    expect(m).toEqual([]);
  });
});
