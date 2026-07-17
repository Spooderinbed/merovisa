import { describe, it, expect } from "vitest";
import { computeMatches } from "@/lib/matches/compute";
import type { MatchInputs } from "@/lib/matches/types";
import type { Program, University } from "@/lib/programs/types";

const uni = (id: string): University => ({
  id,
  country: "AU",
  name: `Uni ${id}`,
  city: "Y",
  rankingTier: 2,
  source: "https://x",
  lastVerified: "2026-01-01",
  dataQuality: "primary",
});

let counter = 0;
const prog = (over: Partial<Program> = {}): Program => ({
  id: `p${counter++}`,
  universityId: "u1",
  name: "Program",
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

const baseInputs = (over: Partial<MatchInputs> = {}): MatchInputs => ({
  userGradePercent: 72,
  userEnglishOverall: 7,
  userEnglishBand: 7,
  userBudgetAud: 45000,
  userField: null,
  userTargetLevel: null,
  // Tuition-only: this suite is about the LEVEL/field eligibility passes, not the
  // financial floor, so it opts out of the capacity model rather than let a budget
  // shift silently re-band its fixtures (MV-120).
  policy: { nepalAssessmentLevel: "L3", financialCapacity: null },
  ...over,
});

// A small representative catalogue mirroring the live shape (bachelors + masters,
// multiple fields, including fields with masters-only coverage).
const universities = [uni("u1"), uni("u2")];
const catalogue: Program[] = [
  prog({ id: "cs-bach", field: "computer-science", level: "bachelors" }),
  prog({ id: "cs-mast", field: "computer-science", level: "masters" }),
  prog({ id: "bus-bach", field: "business", level: "bachelors", universityId: "u2" }),
  prog({ id: "bus-mast", field: "business", level: "masters", universityId: "u2" }),
  prog({ id: "nursing-mast", field: "nursing", level: "masters" }),
  prog({ id: "ds-mast", field: "data-science", level: "masters", universityId: "u2" }),
];

describe("computeMatches eligibility pre-filter", () => {
  it("a CS bachelors-holder (target=masters) sees CS masters ranked first and no bachelors / wrong-level programs", () => {
    const results = computeMatches(
      baseInputs({ userField: "computer-science", userTargetLevel: "masters" }),
      catalogue,
      universities,
    );

    // Level hard-filter: only masters programs remain.
    expect(results.every((r) => r.program.level === "masters")).toBe(true);
    // No bachelors programs leaked through.
    expect(results.some((r) => r.program.level === "bachelors")).toBe(false);

    // Field-first ranking: the CS masters program is first.
    expect(results[0]?.program.field).toBe("computer-science");
    expect(results[0]?.program.id).toBe("cs-mast");

    // Other-field masters are still present (soft rule), but after the CS one.
    const ids = results.map((r) => r.program.id);
    expect(ids).toContain("bus-mast");
    expect(ids.indexOf("cs-mast")).toBeLessThan(ids.indexOf("bus-mast"));
  });

  it("a higher-secondary-holder (target=bachelors) sees only bachelors programs", () => {
    const results = computeMatches(
      baseInputs({ userField: "computer-science", userTargetLevel: "bachelors" }),
      catalogue,
      universities,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.program.level === "bachelors")).toBe(true);
    expect(results[0]?.program.field).toBe("computer-science");
  });

  it("a user in a field with no catalogue programs still gets a non-empty, level-correct fallback", () => {
    // 'arts' is not in the catalogue; level filter (masters) must still apply,
    // and the list must not be empty — all level-eligible programs come back.
    const results = computeMatches(
      baseInputs({ userField: "arts", userTargetLevel: "masters" }),
      catalogue,
      universities,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.program.level === "masters")).toBe(true);
    // No same-field program exists, so none carry the positive field reason.
    expect(results.some((r) => r.reasons.some((x) => x.kind === "field" && x.positive))).toBe(false);
  });

  it("a data-science bachelors seeker (field has only masters) still gets a non-empty bachelors list", () => {
    // data-science has zero bachelors programs — a hard field filter would empty
    // the list. The soft rule keeps all bachelors programs instead.
    const results = computeMatches(
      baseInputs({ userField: "data-science", userTargetLevel: "bachelors" }),
      catalogue,
      universities,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.program.level === "bachelors")).toBe(true);
  });

  it("counts shrink from the full catalogue once the level filter applies", () => {
    const all = computeMatches(baseInputs(), catalogue, universities);
    const mastersOnly = computeMatches(
      baseInputs({ userTargetLevel: "masters" }),
      catalogue,
      universities,
    );
    expect(all.length).toBe(catalogue.length); // no filter when target level unknown
    expect(mastersOnly.length).toBeLessThan(all.length);
    expect(mastersOnly.length).toBe(catalogue.filter((p) => p.level === "masters").length);
  });

  it("falls back to the full level-eligible set ranked by field when level is unknown", () => {
    const results = computeMatches(
      baseInputs({ userField: "computer-science", userTargetLevel: null }),
      catalogue,
      universities,
    );
    // No level filter, but field-first ranking still applies.
    expect(results.length).toBe(catalogue.length);
    expect(results[0]?.program.field).toBe("computer-science");
  });

  it("defensive: if the level filter would empty the list, returns the unfiltered set", () => {
    // A doctorate target has zero matching programs; the engine must not return [].
    const mastersOnlyCatalogue = catalogue.filter((p) => p.level === "masters");
    const results = computeMatches(
      baseInputs({ userTargetLevel: "doctorate" }),
      mastersOnlyCatalogue,
      universities,
    );
    expect(results.length).toBe(mastersOnlyCatalogue.length);
  });
});
