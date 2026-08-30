import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { runAssessment } from "@/lib/scoring/engine";
import type { DimensionScore, StudentProfile } from "@/lib/scoring/types";

/**
 * MV-198 criterion 1 — MEASURE BEFORE CHANGING ANYTHING.
 *
 * This file asserts what the codebase does TODAY, before the visa-risk read exists.
 * It is a characterization probe, not a specification: several assertions here are
 * expected to be rewritten by the slice that follows, and each one that will be says
 * so at the point it is made. Its job is to stop the slice being built on a belief.
 *
 * The card's premise is that MV-198 is a COMPOSITION slice — that four of the six
 * refusal factors named in `docs/research/2026-08-11-program-data-wedge.md` §6 are
 * already modelled — and the whole build plan rests on that being true. MV-196's
 * criterion 1 measured its own premise and the measurement rewrote the card. So this
 * one checks the premise factor by factor rather than trusting the carve.
 *
 * The six factors the research names, in its own words:
 *   "financial capacity, source-of-funds credibility, English visa-floor vs course
 *    threshold, gap justification, prior refusal, provider risk level"
 */

const currentYear = new Date().getFullYear();

/** Nepal → Australia, the only corridor the MVP covers. */
const baseProfile: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: currentYear,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7.0,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

/** Every factor a counsellor would see, across both dimensions that carry visa signal. */
function factorsOf(profile: StudentProfile): {
  visa: DimensionScore["factors"];
  financial: DimensionScore["factors"];
  labels: string[];
} {
  const { dimensions } = runAssessment(profile);
  return {
    visa: dimensions.visa.factors,
    financial: dimensions.financial.factors,
    labels: [...dimensions.visa.factors, ...dimensions.financial.factors].map((f) => f.label),
  };
}

const has = (labels: string[], needle: string) =>
  labels.some((l) => l.toLowerCase().includes(needle.toLowerCase()));

describe("MV-198 criterion 1 — which refusal factors are modelled today", () => {
  it("FACTOR 3 (English visa-floor vs course threshold) is modelled, and the two are distinct", () => {
    // The distinction is the point: a score in [floor, threshold) is visa-valid but
    // below the course preference, and the research names exactly this pair.
    const atFloor = factorsOf({ ...baseProfile, englishScore: 6.0 });
    const belowFloor = factorsOf({ ...baseProfile, englishScore: 5.0 });
    const aboveThreshold = factorsOf({ ...baseProfile, englishScore: 7.5 });

    const floorFactor = atFloor.visa.find((f) => f.label.startsWith("IELTS"));
    const belowFactor = belowFloor.visa.find((f) => f.label.startsWith("IELTS"));
    const aboveFactor = aboveThreshold.visa.find((f) => f.label.startsWith("IELTS"));

    expect(floorFactor?.influence).toBe("neutral");
    expect(floorFactor?.detail).toMatch(/visa floor/i);
    expect(belowFactor?.influence).toBe("risk");
    expect(aboveFactor?.influence).toBe("positive");
  });

  it("FACTOR 4 (gap justification) is modelled, and the reason mitigates the gap", () => {
    const unexplained = factorsOf({ ...baseProfile, graduationYear: currentYear - 4 });
    const worked = factorsOf({
      ...baseProfile,
      graduationYear: currentYear - 4,
      gapReasons: ["worked"],
    });
    const unexplainedGap = unexplained.visa.find((f) => f.label.includes("gap"));
    const workedGap = worked.visa.find((f) => f.label.includes("gap"));

    expect(unexplainedGap?.influence).toBe("risk");
    expect(workedGap?.influence).toBe("neutral");
  });

  it("FACTOR 5 (prior refusal) is modelled, and escalates from one to multiple", () => {
    expect(has(factorsOf({ ...baseProfile, priorRefusals: "none" }).labels, "refusal")).toBe(false);
    expect(has(factorsOf({ ...baseProfile, priorRefusals: "one" }).labels, "One prior visa refusal")).toBe(true);
    expect(
      has(factorsOf({ ...baseProfile, priorRefusals: "multiple" }).labels, "Multiple prior visa refusals"),
    ).toBe(true);
  });

  it("FACTOR 1 (financial capacity) is modelled — but it lives in the FINANCIAL dimension, not the visa one", () => {
    // This is the composition the slice has to perform, and the measurement that
    // justifies it: the DHA capacity test is a visa-refusal factor sitting under a
    // heading a counsellor reads as affordability.
    const thin = factorsOf({ ...baseProfile, budget: 500_000 });

    expect(has(thin.financial.map((f) => f.label), "DHA financial-capacity")).toBe(true);
    expect(has(thin.visa.map((f) => f.label), "DHA financial-capacity")).toBe(false);
  });

  it("FACTOR 2 (source-of-funds credibility) is NOT modelled anywhere", () => {
    // `fundingSource` is a DECLARED funding type, not evidence of where the money
    // came from. The distinction is the whole factor: DHA weighs the credibility of
    // the source, and a declaration is not credibility. The evidence for it lives in
    // Stage 4 document rows, which is the seam with MV-199.
    const declared = factorsOf({ ...baseProfile, fundingSource: "education-loan" });
    expect(has(declared.labels, "Education loan")).toBe(true);
    expect(has(declared.labels, "source of funds")).toBe(false);
    expect(has(declared.labels, "source-of-funds")).toBe(false);
  });

  it("FACTOR 6 (provider risk level) is NOT modelled anywhere — and is data-blocked, not merely missing", () => {
    // The spec forbids approximating this one. The slice must NAME it as absent on
    // the surface; this assertion is what keeps a later author from quietly
    // inventing a proxy for it.
    for (const profile of [baseProfile, { ...baseProfile, budget: 500_000 }]) {
      expect(has(factorsOf(profile).labels, "provider risk")).toBe(false);
    }
  });
});

describe("MV-198 criterion 1 — what a caller can get today", () => {
  it("no single call returns a composed refusal-risk read", () => {
    // `runAssessment` returns four dimensions and one OVERALL verdict. The verdict
    // is an admissions-shaped answer, not a refusal-shaped one — it folds academic
    // and profile-strength in with visa. Nothing in the engine answers "will the
    // visa hold", which is the gap MV-198 exists to close.
    const result = runAssessment(baseProfile);
    expect(Object.keys(result.dimensions).sort()).toEqual([
      "academic",
      "financial",
      "profileStrength",
      "visa",
    ]);
    expect(result).not.toHaveProperty("refusalRisk");
    expect(result).not.toHaveProperty("visaRisk");
  });

  it("the visa dimension exposes a raw 0–100 value, which must never reach a user", () => {
    // Recorded because it is the trap in the slice: the composition input is
    // numeric, the output may not be. CLAUDE.md — banded verdicts, never percentages.
    const { dimensions } = runAssessment(baseProfile);
    expect(typeof dimensions.visa.value).toBe("number");
    expect(dimensions.visa.value).toBeGreaterThanOrEqual(0);
    expect(dimensions.visa.value).toBeLessThanOrEqual(100);
  });

  it("provenance is present on the English floor factor and absent on the heuristic ones", () => {
    // Criterion 5's baseline: the slice must render a source where one exists and
    // must not manufacture one where it does not.
    const atFloor = factorsOf({ ...baseProfile, englishScore: 6.0 });
    const englishFactor = atFloor.visa.find((f) => f.label.startsWith("IELTS"));
    expect(englishFactor?.source?.url).toBeTruthy();

    const refusal = factorsOf({ ...baseProfile, priorRefusals: "one" }).visa.find((f) =>
      f.label.includes("refusal"),
    );
    expect(refusal?.source).toBeUndefined();
  });
});

describe("MV-198 criterion 1 — what the consultancy workspace renders today", () => {
  // NOTE for whoever ships the slice: this block asserts ABSENCE. It is expected to
  // fail once the surface exists, and the fix is to replace it with a positive
  // assertion about the new surface — not to delete it.
  const CASE_DIR = join(
    process.cwd(),
    "app",
    "(app)",
    "workspace",
    "[organizationId]",
    "students",
    "[caseId]",
  );

  function tsxFilesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...tsxFilesUnder(full));
      else if (entry.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("the case has surfaces for profile, matches, plan, checklist, documents and manage", () => {
    const names = tsxFilesUnder(CASE_DIR).map((f) => f.replace(process.cwd(), ""));
    for (const surface of ["profile", "matches", "plan", "checklist", "documents", "manage"]) {
      expect(names.some((n) => n.includes(surface))).toBe(true);
    }
  });

  it("and NO surface renders a verdict, a risk read or a refusal read", () => {
    // Split on /\r?\n/ — a bare "\n" split matches zero lines on a CRLF checkout and
    // makes this assertion vacuously true (MISTAKES.md, Windows CRLF).
    const offenders: string[] = [];
    for (const file of tsxFilesUnder(CASE_DIR)) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        // `runAssessment` / a rendered band / a refusal read would each match. The
        // plan page's prose mentions "verdict and visa case" in copy, which is a
        // sentence and not a surface, so identifiers are what is matched here.
        if (/runAssessment|refusalRisk|visaRisk|<VerdictBand|dimensions\.visa/.test(line)) {
          offenders.push(`${file.replace(process.cwd(), "")}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
