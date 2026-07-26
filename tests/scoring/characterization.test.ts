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
 * RULE_VERSION v0.3.0 / config-v3 added the DHA visa English floor
 * (lib/scoring/visa.ts): a visa-valid IELTS 6.0–6.4 is no longer penalised as a
 * course-threshold shortfall. The only matrix case affected is
 * `long-gap-below-english` (Australia, IELTS 6.0) — its visa dimension rises and
 * its factor is relabelled; the verdict stays reach (financial gated to 29).
 *
 * RULE_VERSION v0.3.0 / config-v3 also added dependents → DHA capacity
 * (lib/scoring/financial.ts): a declared partner/children raise the visa's
 * financial-capacity floor. No pre-existing fixture carries dependents (so none
 * moved); the `dependents-alone-clears` / `dependents-partner-capped` pair below
 * isolates the effect — identical profiles whose only difference, a partner,
 * drops an otherwise-strong Australia verdict to possible.
 *
 * RULE_VERSION v0.4.0 (config-v3 unchanged) added prior visa refusals → the visa
 * dimension (lib/scoring/visa.ts): one refusal −15, multiple −35. No pre-existing
 * fixture carries refusals, so every prior case keeps its dimension values and
 * only its `ruleVersion` field moved to v0.4.0; the `refusal-one-penalised` /
 * `refusal-multiple-penalised` cases below (siblings of strong-clear) isolate the
 * penalty — only the visa dimension drops by 15 / 35.
 *
 * RULE_VERSION v0.5.0 (config-v3 unchanged) added grade-system normalization to
 * the academic dimension (lib/scoring/grade-normalize.ts): the grade is mapped to
 * a 0-100 percentage by `gradeSystem` before scoring, so CGPA systems (cgpa-4/10/5)
 * are no longer read as raw percentages (which floored any CGPA grade to 0). Every
 * fixture in this matrix uses `percentage-nepal`, which passes through unchanged,
 * so every dimension value is byte-identical — only the `ruleVersion` field moved
 * to v0.5.0. The CGPA conversion is covered by tests/scoring/grade-normalize.test.ts
 * and the grade-system cases in tests/scoring/academic.test.ts.
 *
 * config-v4 (RULE_VERSION unchanged) corrected the FX table (MV-132 / audit F-20):
 * the rates are now read from their publishing authorities (NRB for the Nepal
 * corridor, U.S. Treasury elsewhere) instead of undated approximations that had
 * drifted ~20% — NPR 90 per A$1 where NRB published ~108. This is a DATA correction,
 * not a rule change, but it moves every non-USD budget, so it is an intended golden
 * change: each NPR fixture's budget was restated to preserve the USD intent its own
 * comment documents (e.g. possible-boundary-low is still exactly 20,000 USD, so it
 * still lands on the weighted-50 boundary it exists to pin), and the AU capacity
 * floor's USD expression moved from ≈49.5k to ≈51.9k with the corrected AUD leg.
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

// A 16-profile matrix spanning: every education level; field-competitiveness
// extremes (0.95 CS/data-science ↔ 0.70 arts/hospitality); funding extremes
// (0.95 self-funded ↔ 0.55 scholarship-dependent); currencies NPR/AUD/USD + one
// out-of-enum (EUR passthrough); gaps 0/1/2/6; English not-taken/booked/below/at/
// 7.0/7.5+; germany (6.0 threshold) and not-sure destinations; the Australia DHA
// capacity gate (strong-clear clears it; possible-mid clears with a positive
// factor; several AU cases fall below it); canada profiles straddling every
// verdict.ts cutoff (72/71 strong↔possible, 50/49 possible↔reach, 30/29
// min-dimension floor) so one-point drift flips a verdict; and a dependents pair
// (alone vs partner, otherwise identical) isolating the B2 capacity-floor lift.
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
      budget: 8100000, // NPR ≈ 52.4k USD — clears the AU DHA capacity floor (≈51.9k USD)
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
      budget: 3090400, // NPR = 20,000 USD; sibling of reach-weighted-boundary (grade −1)
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
      budget: 3090400, // NPR = 20,000 USD; same budget as possible-boundary-low, 1 grade lower
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
    note: "6-year gap (>5 bucket, −22) part-mitigated by health-family + IELTS 6.0 meets the DHA visa floor (no penalty, neutral factor); nursing(0.85); USD budget below the AU DHA capacity floor → financial gated to 29 → reach",
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
    note: "englishStatus 'booked' (neither taken nor not-taken → no visa english adjustment) + AUD currency (FX /1.4289) + gap 2 retook-exams (reason not work/venture → risk factor) + mixed; AUD 60k ≈ 42k USD sits in the AU gate's block-strong band → financial capped at 49",
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
  {
    name: "dependents-alone-clears",
    note: "AU masters/CS(0.95)/self-funded/IELTS 7.5/gap 0; 52k USD clears the alone DHA capacity floor (≈49.5k) → strong; sibling of dependents-partner-capped (identical but applying alone)",
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
      budget: 52000,
      budgetCurrency: "USD",
      fundingSource: "self-funded",
      goal: "permanent-residency",
    },
  },
  {
    name: "dependents-partner-capped",
    note: "identical to dependents-alone-clears but bringing a partner: the DHA floor rises to ≈56.4k USD, so 52k now falls short → financial capped at 49 (min-dim <50) → strong drops to possible; isolates the B2 dependents effect",
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
      budget: 52000,
      budgetCurrency: "USD",
      fundingSource: "self-funded",
      goal: "permanent-residency",
      dependents: { partner: true, children: 0 },
    },
  },
  {
    name: "refusal-one-penalised",
    note: "identical to strong-clear but with one prior visa refusal → visa dimension −15 (rule v0.4.0); isolates the single-refusal penalty",
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
      priorRefusals: "one",
    },
  },
  {
    name: "refusal-multiple-penalised",
    note: "identical to strong-clear but with multiple prior visa refusals → visa dimension −35 (rule v0.4.0); isolates the multiple-refusal penalty",
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
      priorRefusals: "multiple",
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

  it("keeps secondaryVerdicts off the engine result (single-field payload is null; MV-102)", () => {
    // MV-102 attaches secondary verdicts to the assembled *payload*, never to the
    // engine's AssessmentResult — so the goldens above stay byte-identical. A raw
    // single-field re-score carries no secondaryVerdicts key at all.
    const result = ACTUAL["strong-clear"]!;
    expect((result as Record<string, unknown>).secondaryVerdicts).toBeUndefined();
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

  it("isolates the B2 dependents effect: a partner drops an otherwise-strong AU profile to possible", () => {
    if (WRITE) return;
    const alone = ACTUAL["dependents-alone-clears"]!;
    const partner = ACTUAL["dependents-partner-capped"]!;
    expect(alone.verdict).toBe("strong");
    expect(partner.verdict).toBe("possible");
    // The partner changes ONLY the financial dimension (the raised capacity floor);
    // every other dimension is identical, so the band drop is attributable to B2.
    expect(partner.dimensions.financial.value).toBe(49);
    expect(alone.dimensions.academic).toEqual(partner.dimensions.academic);
    expect(alone.dimensions.visa).toEqual(partner.dimensions.visa);
    expect(alone.dimensions.profileStrength).toEqual(partner.dimensions.profileStrength);
  });

  it("isolates the #3 refusal penalty: prior refusals lower only the visa dimension", () => {
    if (WRITE) return;
    const clean = ACTUAL["strong-clear"]!;
    const one = ACTUAL["refusal-one-penalised"]!;
    const multiple = ACTUAL["refusal-multiple-penalised"]!;
    expect(one.dimensions.visa.value).toBe(clean.dimensions.visa.value - 15);
    expect(multiple.dimensions.visa.value).toBe(clean.dimensions.visa.value - 35);
    // Only visa moves — academic / financial / profileStrength are untouched.
    expect(one.dimensions.academic).toEqual(clean.dimensions.academic);
    expect(one.dimensions.financial).toEqual(clean.dimensions.financial);
    expect(one.dimensions.profileStrength).toEqual(clean.dimensions.profileStrength);
    expect(multiple.dimensions.financial).toEqual(clean.dimensions.financial);
  });
});
