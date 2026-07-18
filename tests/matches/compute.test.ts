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

/**
 * Tuition-only policy: the explicit `financialCapacity: null` opt-out. The verdict then
 * compares the budget against tuition alone, which is the pre-MV-120 behaviour, preserved
 * for non-AU / unknown-destination callers. Tests using this fixture are pinning the
 * FALLBACK contract, not the AU contract — see `policyAu` for the real corridor.
 */
const policy = { nepalAssessmentLevel: "L3" as const, financialCapacity: null };

/** DHA Subclass 500 12-month living-capacity figure (lib/data/policy/au-cost-of-living.ts). */
const AU_LIVING = 29_710;
/** AU_DHA_CAPACITY_GATE.reachRatio — shared with lib/scoring/financial.ts so both engines band alike. */
const AU_REACH_RATIO = 0.75;

/** The real Nepal→Australia corridor policy: tuition + living is the floor a budget is judged against. */
const policyAu = {
  nepalAssessmentLevel: "L3" as const,
  financialCapacity: { livingAud: AU_LIVING, dependentsAud: 0, reachRatio: AU_REACH_RATIO },
};

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
  // MV-120 / audit C-3: this test previously used the AU-shaped budget 45,000 against
  // tuition 40,000 and asserted "strong" — which PINNED THE BUG (the wizard collects
  // tuition+living, so 45,000 does not in fact cover a 69,710 AU floor). It is kept, but
  // re-scoped to what it now honestly asserts: the tuition-only fallback contract. The
  // AU corridor behaviour it used to misdescribe is covered in the C-3 block below.
  it("strong when grade, english and budget all meet minimums (tuition-only policy)", () => {
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

  it("labels an also-considering program as exploratory (not the primary field)", () => {
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
    // MV-102 gives each also-considering field a real band on results, so the old
    // "not covered by your verdict" clause is now false and must be gone.
    expect(exploring!.text).toMatch(/not your primary field/i);
    expect(exploring!.text).not.toMatch(/not covered by your verdict/i);
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
    const policyReason = m.reasons.find((r) => r.kind === "policy")!;
    expect(policyReason).toBeDefined();
    // C-5: the AL3 line must speak in recommendation voice (matching the PolicyBanner),
    // not DHA's authority voice. "expected" reads as a rule the student has already failed.
    expect(policyReason.text).toMatch(/recommend/i);
    expect(policyReason.text).toMatch(/bank seasoning/i);
    expect(policyReason.text).not.toMatch(/expected/i);
  });

  it("marks a pure off-field program as outside the intended field (audit C-10)", () => {
    // Field is a soft sort, not a hard filter, so a nursing program still surfaces for a
    // CS student. Before C-10 it carried NO field reason at all — reading as aligned. It
    // must now say plainly it is outside the field the verdict speaks to.
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
      [p({ id: "nurse", field: "nursing" })],
      [uni],
    )[0]!;
    const outside = m.reasons.find((r) => r.kind === "field-outside");
    expect(outside).toBeDefined();
    expect(outside!.positive).toBe(false);
    expect(outside!.text).toMatch(/outside your intended field/i);
    // It must not simultaneously claim alignment or exploratory (also-considering) status.
    expect(m.reasons.some((r) => r.kind === "field")).toBe(false);
    expect(m.reasons.some((r) => r.kind === "field-exploring")).toBe(false);
  });

  it("keeps a primary-field program aligned, with no off-field reason", () => {
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
      [p({ field: "computer-science" })],
      [uni],
    )[0]!;
    expect(m.reasons.some((r) => r.kind === "field")).toBe(true);
    expect(m.reasons.some((r) => r.kind === "field-outside")).toBe(false);
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

/**
 * MV-120 / audit C-3: the wizard asks for a yearly budget meaning "tuition plus living
 * costs" (components/wizard/steps/budget-step.tsx:83-84), but the matcher compared that
 * whole number against tuition ALONE. A student on 45,000 was told "Strong — budget covers
 * AUD 40,000 tuition" while lib/scoring/financial.ts, reading the same number, called it a
 * reach. Two surfaces, one number, opposite answers. These tests pin the corrected contract.
 */
describe("computeMatches financial capacity (C-3: budget means tuition + living)", () => {
  const clears = {
    userGradePercent: 72,
    userEnglishOverall: 7,
    userEnglishBand: 7,
    userField: "computer-science",
    userTargetLevel: "masters" as const,
  };
  // tuition 40,000 + living 29,710 = a real floor of 69,710.
  const REQUIRED_TOTAL = 40000 + AU_LIVING;
  const run = (userBudgetAud: number, pol: typeof policyAu | typeof policy = policyAu) =>
    computeMatches({ ...clears, userBudgetAud, policy: pol }, [p()], [uni])[0]!;

  it("does NOT call a budget that covers tuition but not living costs 'strong'", () => {
    // The exact case the audit found: 45,000 clears the 40,000 tuition, so the old code
    // said strong. It is ~24,710 short of what the student actually needs.
    const m = run(45000);
    expect(m.verdict).not.toBe("strong");
  });

  it("never claims the budget covers costs when the student is short", () => {
    const m = run(45000);
    const tuition = m.reasons.find((r) => r.kind === "tuition")!;
    expect(tuition.positive).toBe(false);
    expect(tuition.text).not.toMatch(/covers/i);
  });

  it("names living costs, not just tuition, in the shortfall copy", () => {
    const m = run(45000);
    const tuition = m.reasons.find((r) => r.kind === "tuition")!;
    expect(tuition.text).toMatch(/living costs/i);
    // The gap is the real one (69,710 - 45,000), not the tuition-only 0.
    expect(tuition.text).toContain("24,710");
  });

  it("is strong when the budget covers tuition AND living costs", () => {
    const m = run(REQUIRED_TOTAL);
    expect(m.verdict).toBe("strong");
    const tuition = m.reasons.find((r) => r.kind === "tuition")!;
    expect(tuition.positive).toBe(true);
    expect(tuition.text).toMatch(/tuition/i);
    expect(tuition.text).toMatch(/living costs/i);
  });

  it("is possible (not reach) just inside the reach ratio", () => {
    // reachRatio 0.75 → reach below 52,282.5. 53,000 is short but not catastrophically.
    const m = run(53000);
    expect(m.verdict).toBe("possible");
  });

  it("is reach below the shared reachRatio, matching financial.ts's own band", () => {
    // financial.ts forces reach at budget < 0.75 × floor; the matcher must agree.
    const m = run(Math.floor(REQUIRED_TOTAL * AU_REACH_RATIO) - 1);
    expect(m.verdict).toBe("reach");
  });

  it("raises the floor for declared dependents, as financial.ts already does", () => {
    // A partner adds 10,394 to the DHA capacity floor, so a budget that was exactly
    // enough alone is no longer enough with family.
    const withPartner = {
      ...policyAu,
      financialCapacity: { ...policyAu.financialCapacity, dependentsAud: 10_394 },
    };
    expect(run(REQUIRED_TOTAL).verdict).toBe("strong");
    expect(run(REQUIRED_TOTAL, withPartner).verdict).not.toBe("strong");
  });

  it("carries costGap in the snapshot and KEEPS tuitionGap (persisted on frozen predictions)", () => {
    // lib/outcomes/repo.ts persists scoreSnapshot untyped in the score_snapshot Json
    // column; renaming tuitionGap would silently orphan the key on historical rows.
    const m = run(45000);
    expect(m.scoreSnapshot.tuitionGap).toBe(0); // budget does clear tuition alone
    expect(m.scoreSnapshot.costGap).toBe(24710); // ...but not the real floor
  });

  describe("tuition-only fallback (financialCapacity: null)", () => {
    it("reproduces the pre-MV-120 verdict exactly", () => {
      expect(run(45000, policy).verdict).toBe("strong");
    });

    it("never over-claims: copy names tuition only, and costGap collapses to tuitionGap", () => {
      const m = run(45000, policy);
      const tuition = m.reasons.find((r) => r.kind === "tuition")!;
      expect(tuition.text).toMatch(/covers AUD 40,000 tuition\./);
      expect(tuition.text).not.toMatch(/living/i);
      expect(m.scoreSnapshot.costGap).toBe(m.scoreSnapshot.tuitionGap);
    });

    it("keeps the legacy 0.5 tuition cliff", () => {
      expect(run(19999, policy).verdict).toBe("reach");
      expect(run(20001, policy).verdict).toBe("possible");
    });
  });
});
