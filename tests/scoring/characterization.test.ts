import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runAssessment } from "@/lib/scoring/engine";
import type { AssessmentResult, Currency, StudentProfile } from "@/lib/scoring/types";

/**
 * Characterization lock (Plan Phase 3).
 *
 * Pins the *current* deterministic output of `runAssessment` across a profile
 * matrix. Any drift in a dimension value, factor array, weighted total, or verdict
 * — including a one-point shift across a band cutoff — makes a golden mismatch.
 *
 * RULE_VERSION v0.2.0 / config-v2 introduced the Australia DHA financial-capacity
 * gate (lib/scoring/financial.ts): a budget below the visa's capacity floor caps
 * the financial dimension into 'possible'/'reach'. That is an INTENDED verdict
 * change, so this golden was regenerated for it. The verdict.ts boundary-straddle
 * fixtures below sit on `canada` (an un-gated destination) so they isolate the
 * verdict.ts cutoffs from the AU gate; the gate itself is covered by
 * tests/scoring/financial.test.ts and by the Australia cases in this matrix.
 *
 * Determinism: the only time-dependent input is the graduation gap
 * (`computeGapYears` reads `new Date()`). Each profile's `graduationYear` is
 * expressed relative to the current year, so the *gap* — and therefore the whole
 * output — is identical in every calendar year (same convention as visa.test.ts).
 * `computedAt` (a wall-clock timestamp) is the one field excluded from the golden.
 *
 * Regenerate after an *intended* behaviour change:  WRITE_GOLDENS=1 npx vitest run tests/scoring/characterization.test.ts
 */

const GOLDEN_PATH = resolve(process.cwd(), "tests/scoring/__fixtures__/golden-assessments.json");
const WRITE = process.env.WRITE_GOLDENS === "1";

const BASE_YEAR = new Date().getFullYear();
const gradYear = (gap: number) => BASE_YEAR - gap;

type GoldenOutput = Omit<AssessmentResult, "computedAt">;

interface Case {
  name: string;
  note: string;
  profile: StudentProfile;
}

// A 14-profile matrix spanning: every education level; field-competitiveness
// extremes (0.95 CS/data-science ↔ 0.70 arts/hospitality); funding extremes
// (0.95 self-funded ↔ 0.55 scholarship-dependent); currencies NPR/AUD/USD + one
// out-of-enum (EUR passthrough); gaps 0/1/2/6; English not-taken/booked/below/at/
// 7.0/7.5+; germany (6.0 threshold) and not-sure destinations; the Australia DHA
// capacity gate (strong-clear clears it; possible-mid clears with a positive
// factor; several AU cases fall below it); and canada profiles straddling every
// verdict.ts cutoff (72/71 strong↔possible, 50/49 possible↔reach, 30/29
// min-dimension floor) so one-point drift flips a verdict.
const CASES: Case[] = [
  {
    name: "strong-clear",
    note: "every dimension high → strong, weighted well above 72; masters/CS(0.95)/self-funded/IELTS 7.5/gap 0/USD",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "masters",
      gradeSystem: "percentage-nepal",
      grade: 86,
      fieldOfStudy: "computer-science",
      graduationYear: gradYear(0),
      gapReasons: [],
      englishStatus: "taken",
      englishScore: 7.5,
      destination: "australia",
      budget: 60000,
      budgetCurrency: "USD",
      fundingSource: "self-funded",
      goal: "permanent-residency",
    },
  },
  {
    name: "strong-boundary",
    note: "weighted at the 72 strong cutoff (min-dim ≥ 50) → strong; one-point drift down flips to possible",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "bachelors",
      gradeSystem: "percentage-nepal",
      grade: 71,
      fieldOfStudy: "business",
      graduationYear: gradYear(0),
      gapReasons: [],
      englishStatus: "taken",
      englishScore: 7.0,
      destination: "canada",
      budget: 33000,
      budgetCurrency: "USD",
      fundingSource: "parents-family",
      goal: "best-employment",
    },
  },
  {
    name: "possible-boundary-high",
    note: "weighted one below the strong cutoff (71, min-dim ≥ 50) → possible; drift up flips to strong",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "bachelors",
      gradeSystem: "percentage-nepal",
      grade: 70,
      fieldOfStudy: "business",
      graduationYear: gradYear(0),
      gapReasons: [],
      englishStatus: "taken",
      englishScore: 7.0,
      destination: "canada",
      budget: 31000,
      budgetCurrency: "USD",
      fundingSource: "parents-family",
      goal: "best-employment",
    },
  },
  {
    name: "possible-mid",
    note: "comfortably possible; gap 2 explained by work, IELTS at threshold, NPR budget clears the AU DHA capacity floor (positive factor), education-loan, hospitality(0.70)",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "bachelors",
      gradeSystem: "percentage-nepal",
      grade: 62,
      fieldOfStudy: "hospitality",
      graduationYear: gradYear(2),
      gapReasons: ["worked"],
      englishStatus: "taken",
      englishScore: 6.5,
      destination: "australia",
      budget: 7000000, // NPR ≈ 51.9k USD — clears the AU DHA capacity floor (≈49.5k USD)
      budgetCurrency: "NPR",
      fundingSource: "education-loan",
      goal: "fastest-admission",
    },
  },
  {
    name: "possible-boundary-low",
    note: "weighted at the 50 possible floor (min-dim ≥ 30) → possible; drift down flips to reach; gap 6 preparing, not-taken, arts; canada (un-gated) so this pins verdict.ts, not the AU gate",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "bachelors",
      gradeSystem: "percentage-nepal",
      grade: 57,
      fieldOfStudy: "arts",
      graduationYear: gradYear(6),
      gapReasons: ["preparing"],
      englishStatus: "not-taken",
      destination: "canada",
      budget: 2700000, // NPR = 20,000 USD; sibling of reach-weighted-boundary (grade −1)
      budgetCurrency: "NPR",
      fundingSource: "scholarship-dependent",
      goal: "lowest-cost",
    },
  },
  {
    name: "reach-weighted-boundary",
    note: "weighted one below the possible floor (49, min-dim ≥ 30) → reach; drift up flips to possible; sibling of possible-boundary-low (same budget, grade −1); canada (un-gated)",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "bachelors",
      gradeSystem: "percentage-nepal",
      grade: 56,
      fieldOfStudy: "arts",
      graduationYear: gradYear(6),
      gapReasons: ["preparing"],
      englishStatus: "not-taken",
      destination: "canada",
      budget: 2700000, // NPR = 20,000 USD; same budget as possible-boundary-low, 1 grade lower
      budgetCurrency: "NPR",
      fundingSource: "scholarship-dependent",
      goal: "lowest-cost",
    },
  },
  {
    name: "reach-min-dimension",
    note: "financial dim at 29 (<30) forces reach regardless of weighted; tiny budget + scholarship-dependent; canada (un-gated) so financial 29 comes from the heuristic, not the AU cap",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "bachelors",
      gradeSystem: "percentage-nepal",
      grade: 80,
      fieldOfStudy: "computer-science",
      graduationYear: gradYear(0),
      gapReasons: [],
      englishStatus: "taken",
      englishScore: 7.0,
      destination: "canada",
      budget: 6500,
      budgetCurrency: "USD",
      fundingSource: "scholarship-dependent",
      goal: "highest-ranked",
    },
  },
  {
    name: "possible-min-dimension",
    note: "financial dim at exactly 30 (the min-dim floor) → not forced to reach; sibling of reach-min-dimension; canada (un-gated)",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "bachelors",
      gradeSystem: "percentage-nepal",
      grade: 80,
      fieldOfStudy: "computer-science",
      graduationYear: gradYear(0),
      gapReasons: [],
      englishStatus: "taken",
      englishScore: 7.0,
      destination: "canada",
      budget: 7500,
      budgetCurrency: "USD",
      fundingSource: "scholarship-dependent",
      goal: "highest-ranked",
    },
  },
  {
    name: "germany-threshold",
    note: "germany IELTS threshold 6.0 (vs 6.5 elsewhere); score exactly at threshold → zero english delta; gap 1 worked; mixed funding; germany midpoint 17000",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "bachelors",
      gradeSystem: "percentage-nepal",
      grade: 75,
      fieldOfStudy: "engineering",
      graduationYear: gradYear(1),
      gapReasons: ["worked"],
      englishStatus: "taken",
      englishScore: 6.0,
      destination: "germany",
      budget: 16000,
      budgetCurrency: "USD",
      fundingSource: "mixed",
      goal: "research",
    },
  },
  {
    name: "not-sure-destination",
    note: "destination not-sure (midpoint 35000, threshold 6.5) → strong; masters/data-science(0.95)/self-funded/IELTS 7.5",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "masters",
      gradeSystem: "percentage-nepal",
      grade: 82,
      fieldOfStudy: "data-science",
      graduationYear: gradYear(0),
      gapReasons: [],
      englishStatus: "taken",
      englishScore: 7.5,
      destination: "not-sure",
      budget: 40000,
      budgetCurrency: "USD",
      fundingSource: "self-funded",
      goal: "research",
    },
  },
  {
    name: "higher-secondary-no-english",
    note: "higher-secondary level (academic −5, profile-strength base only) + no English test (visa −8, risk factor) + arts(0.70); NPR budget falls just below the AU DHA capacity floor → financial gated to 29 → reach",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "higher-secondary",
      gradeSystem: "percentage-nepal",
      grade: 65,
      fieldOfStudy: "arts",
      graduationYear: gradYear(0),
      gapReasons: [],
      englishStatus: "not-taken",
      destination: "australia",
      budget: 5000000,
      budgetCurrency: "NPR",
      fundingSource: "parents-family",
      goal: "lowest-cost",
    },
  },
  {
    name: "unknown-currency-passthrough",
    note: "budgetCurrency outside the enum (EUR) → toUsd default passthrough (amount unchanged); locks the FX fallback before the Phase 4 fx-rates refactor; usa/accounting(0.80)/started-something/masters",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "masters",
      gradeSystem: "percentage-nepal",
      grade: 78,
      fieldOfStudy: "accounting",
      graduationYear: gradYear(2),
      gapReasons: ["started-something"],
      englishStatus: "taken",
      englishScore: 7.0,
      destination: "usa",
      budget: 50000,
      // Intentionally outside the Currency enum to exercise toUsd's passthrough default.
      budgetCurrency: "EUR" as unknown as Currency,
      fundingSource: "education-loan",
      goal: "best-employment",
    },
  },
  {
    name: "long-gap-below-english",
    note: "6-year gap (>5 bucket, −22) part-mitigated by health-family + IELTS 6.0 below the 6.5 threshold (visa −5, risk factor); nursing(0.85); USD budget below the AU DHA capacity floor → financial gated to 29",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "bachelors",
      gradeSystem: "percentage-nepal",
      grade: 70,
      fieldOfStudy: "nursing",
      graduationYear: gradYear(6),
      gapReasons: ["health-family"],
      englishStatus: "taken",
      englishScore: 6.0,
      destination: "australia",
      budget: 35000,
      budgetCurrency: "USD",
      fundingSource: "mixed",
      goal: "fastest-admission",
    },
  },
  {
    name: "booked-english-aud",
    note: "englishStatus 'booked' (neither taken nor not-taken → no visa english adjustment) + AUD currency (FX /1.5) + gap 2 retook-exams (reason not work/venture → risk factor) + mixed; AUD 60k ≈ 40k USD sits in the AU gate's block-strong band → financial capped at 49",
    profile: {
      homeCountry: "Nepal",
      educationLevel: "bachelors",
      gradeSystem: "percentage-nepal",
      grade: 76,
      fieldOfStudy: "engineering",
      graduationYear: gradYear(2),
      gapReasons: ["retook-exams"],
      englishStatus: "booked",
      destination: "australia",
      budget: 60000,
      budgetCurrency: "AUD",
      fundingSource: "mixed",
      goal: "highest-ranked",
    },
  },
];

function compute(profile: StudentProfile): GoldenOutput {
  const { computedAt: _omit, ...rest } = runAssessment(profile);
  void _omit;
  return rest;
}

const ACTUAL: Record<string, GoldenOutput> = {};
for (const c of CASES) ACTUAL[c.name] = compute(c.profile);

const minDim = (o: GoldenOutput) =>
  Math.min(
    o.dimensions.academic.value,
    o.dimensions.financial.value,
    o.dimensions.visa.value,
    o.dimensions.profileStrength.value,
  );

describe("scoring characterization goldens", () => {
  it("generates the golden fixture when WRITE_GOLDENS=1", () => {
    if (!WRITE) return;
    mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
    writeFileSync(GOLDEN_PATH, JSON.stringify(ACTUAL, null, 2) + "\n");
  });

  it("has no duplicate case names", () => {
    const names = CASES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("matches the committed golden for every profile (and no orphan goldens)", () => {
    if (WRITE) return;
    const golden: Record<string, GoldenOutput> = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
    expect(Object.keys(ACTUAL).sort()).toEqual(Object.keys(golden).sort());
    for (const c of CASES) {
      expect(ACTUAL[c.name], `${c.name} — ${c.note}`).toEqual(golden[c.name]);
    }
  });

  it("straddles every verdict.ts boundary so one-point drift flips a verdict", () => {
    if (WRITE) return;
    const at = (name: string): GoldenOutput => {
      const o = ACTUAL[name];
      if (!o) throw new Error(`missing case: ${name}`);
      return o;
    };

    // 72/71 — strong vs possible (both min-dim ≥ 50, decided by weighted)
    expect(at("strong-boundary").weighted).toBe(72);
    expect(at("strong-boundary").verdict).toBe("strong");
    expect(at("possible-boundary-high").weighted).toBe(71);
    expect(at("possible-boundary-high").verdict).toBe("possible");

    // 50/49 — possible vs reach (both min-dim ≥ 30, decided by weighted)
    expect(at("possible-boundary-low").weighted).toBe(50);
    expect(at("possible-boundary-low").verdict).toBe("possible");
    expect(at("reach-weighted-boundary").weighted).toBe(49);
    expect(at("reach-weighted-boundary").verdict).toBe("reach");

    // 30/29 — min-dimension floor (a dim < 30 forces reach)
    expect(minDim(at("reach-min-dimension"))).toBe(29);
    expect(at("reach-min-dimension").verdict).toBe("reach");
    expect(minDim(at("possible-min-dimension"))).toBe(30);
    expect(at("possible-min-dimension").verdict).not.toBe("reach");
  });
});
