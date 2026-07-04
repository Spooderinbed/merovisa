import { describe, it, expect } from "vitest";
import { computeSecondaryVerdicts } from "@/lib/results/secondary-verdicts";
import { runAssessment } from "@/lib/scoring/engine";
import type { StudentProfile, FieldOfStudy } from "@/lib/scoring/types";

// A well-funded, strong-English profile so the FIELD baseline is what moves the
// band (the financial/visa dimensions don't cap it). At grade 68 the primary CS
// lands Possible while Business lands Strong — a real, engine-derived band split.
const base: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 68,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getFullYear(),
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 8,
  destination: "australia",
  budget: 90_000,
  budgetCurrency: "AUD",
  fundingSource: "parents-family",
  goal: "permanent-residency",
};

const withExtras = (fieldOfStudy: FieldOfStudy, alsoConsidering?: FieldOfStudy[]): StudentProfile => ({
  ...base,
  fieldOfStudy,
  alsoConsidering,
});

const primaryOf = (p: StudentProfile) => runAssessment(p);

describe("computeSecondaryVerdicts", () => {
  it("returns null when alsoConsidering is undefined", () => {
    const profile = withExtras("computer-science");
    expect(computeSecondaryVerdicts(profile, primaryOf(profile))).toBeNull();
  });

  it("returns null when alsoConsidering is empty", () => {
    const profile = withExtras("computer-science", []);
    expect(computeSecondaryVerdicts(profile, primaryOf(profile))).toBeNull();
  });

  it("drops an extra equal to the primary and a duplicate before scoring", () => {
    // ["computer-science" (=primary), "business", "business" (dup)] → only one item (business).
    const profile = withExtras("computer-science", ["computer-science", "business", "business"]);
    const result = computeSecondaryVerdicts(profile, primaryOf(profile));
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0]!.field).toBe("business");
  });

  it("returns null when every extra is filtered out (all equal the primary)", () => {
    const profile = withExtras("computer-science", ["computer-science"]);
    expect(computeSecondaryVerdicts(profile, primaryOf(profile))).toBeNull();
  });

  it("gives each extra the band of a re-score with that field swapped in", () => {
    const profile = withExtras("computer-science", ["business", "data-science"]);
    const result = computeSecondaryVerdicts(profile, primaryOf(profile))!;
    const businessBand = runAssessment({ ...profile, fieldOfStudy: "business" }).verdict;
    const dataBand = runAssessment({ ...profile, fieldOfStudy: "data-science" }).verdict;
    expect(businessBand).toBe("strong"); // fixture anchor
    expect(dataBand).toBe("possible"); // fixture anchor
    expect(result.items.map((i) => [i.field, i.verdict])).toEqual([
      ["business", "strong"],
      ["data-science", "possible"],
    ]);
  });

  it("carries the primary field's own label and band as the anchor for the rows", () => {
    const profile = withExtras("computer-science", ["business"]);
    const primary = primaryOf(profile);
    const result = computeSecondaryVerdicts(profile, primary)!;
    expect(result.primary).toEqual({ label: "Computer Science", verdict: primary.verdict });
  });

  it("carries the field label and preserves the student's chosen order", () => {
    const profile = withExtras("computer-science", ["data-science", "business"]);
    const result = computeSecondaryVerdicts(profile, primaryOf(profile))!;
    expect(result.items.map((i) => i.field)).toEqual(["data-science", "business"]);
    expect(result.items.map((i) => i.label)).toEqual(["Data Science", "Business"]);
  });

  it("sets outranksPrimary only for a strictly stronger band", () => {
    // primary CS = Possible; business = Strong (outranks), data-science = Possible (does not).
    const profile = withExtras("computer-science", ["business", "data-science"]);
    const result = computeSecondaryVerdicts(profile, primaryOf(profile))!;
    const byField = Object.fromEntries(result.items.map((i) => [i.field, i.outranksPrimary]));
    expect(byField.business).toBe(true);
    expect(byField["data-science"]).toBe(false);
  });

  it("common case: two extras, neither outranking → items populated, pivot null", () => {
    // primary business = Strong; both extras are Possible or weaker → no pivot.
    const profile = withExtras("business", ["computer-science", "data-science"]);
    const result = computeSecondaryVerdicts(profile, primaryOf(profile))!;
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.outranksPrimary === false)).toBe(true);
    expect(result.pivot).toBeNull();
  });

  it("pivot picks the strongest outranking field; ties resolve to first in student order", () => {
    // primary CS = Possible; data-science = Possible (no), business = Strong, arts = Strong.
    // business and arts tie on band → pivot is the first in the student's order (business).
    const profile = withExtras("computer-science", ["data-science", "business", "arts"]);
    const result = computeSecondaryVerdicts(profile, primaryOf(profile))!;
    expect(result.pivot).not.toBeNull();
    expect(result.pivot!.field).toBe("business");
    expect(result.pivot!.verdict).toBe("strong");
  });

  it("pivot is null when no extra outranks the primary", () => {
    const profile = withExtras("business", ["computer-science"]);
    const result = computeSecondaryVerdicts(profile, primaryOf(profile))!;
    expect(result.pivot).toBeNull();
  });

  it("boundary-straddle: a band differs across a cutoff but the item still carries only a band", () => {
    // grade 62: primary CS = Possible, education = Strong — the fields sit either side
    // of the verdict cutoff. The item exposes the band word only, no numeric margin.
    const profile: StudentProfile = { ...base, grade: 62, fieldOfStudy: "computer-science", alsoConsidering: ["education"] };
    const result = computeSecondaryVerdicts(profile, runAssessment(profile))!;
    const item = result.items[0]!;
    expect(item.field).toBe("education");
    expect(item.verdict).toBe("strong");
    expect(item.outranksPrimary).toBe(true);
    expect(item).not.toHaveProperty("weighted");
  });

  it("no-leak: a SecondaryVerdict carries only field/label/verdict/outranksPrimary", () => {
    const profile = withExtras("computer-science", ["business"]);
    const result = computeSecondaryVerdicts(profile, primaryOf(profile))!;
    expect(Object.keys(result.items[0]!).sort()).toEqual(
      ["field", "label", "outranksPrimary", "verdict"],
    );
    expect(result.items[0]).not.toHaveProperty("weighted");
    expect(result.items[0]).not.toHaveProperty("dimensions");
    expect(result.items[0]).not.toHaveProperty("computedAt");
  });
});
