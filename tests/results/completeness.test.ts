import { describe, it, expect } from "vitest";
import { computeProfileCompleteness } from "@/lib/results/completeness";
import type { StudentProfile } from "@/lib/scoring/types";

// A fully-answered profile EXCEPT prior visa history (the one signal the wizard
// forces but this fixture omits) — matches the shape the older tests used.
const base: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: 2025,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

// The "name-only"/empty shape sectionsToStudentProfile({}) produces: grade/budget
// floored to the 0 unknown-sentinel, English never taken, no visa history.
const empty: StudentProfile = {
  ...base,
  grade: 0,
  budget: 0,
  englishStatus: "not-taken",
  englishScore: undefined,
  priorRefusals: undefined,
};

// Everything the meter measures, filled — the top tier must be reachable (audit C-6:
// with the old meter, Verified/Complete were mathematically unreachable).
const full: StudentProfile = { ...base, priorRefusals: "none" };

describe("computeProfileCompleteness", () => {
  it("reaches the top tier / 100 for a fully-filled profile (reachability)", () => {
    const c = computeProfileCompleteness(full);
    expect(c.completeness).toBe(100);
    expect(c.level).toBe("Full picture");
    expect(c.suggestions).toHaveLength(0);
  });

  it("reads LOW ('Started'), not an arbitrary 25, for a name-only/empty profile", () => {
    const c = computeProfileCompleteness(empty);
    expect(c.completeness).toBeLessThan(25);
    expect(c.level).toBe("Started");
  });

  it("never emits the removed 'Verified' tier or any verification-implying gain", () => {
    for (const p of [empty, base, full]) {
      const c = computeProfileCompleteness(p);
      expect(c.level).not.toBe("Verified");
      for (const s of c.suggestions) {
        expect(s.gain.toLowerCase()).not.toContain("verif");
      }
    }
  });

  it("every listed suggestion, once satisfied, RAISES the bar (no dead progress items)", () => {
    const docs = { transcript: false, financials: false };
    const c = computeProfileCompleteness(empty, docs);
    const before = c.completeness;
    expect(c.suggestions.length).toBeGreaterThan(0);

    const satisfy: Record<string, () => number> = {
      grade: () => computeProfileCompleteness({ ...empty, grade: 72 }, docs).completeness,
      english: () =>
        computeProfileCompleteness({ ...empty, englishStatus: "taken", englishScore: 7 }, docs).completeness,
      budget: () => computeProfileCompleteness({ ...empty, budget: 4_500_000 }, docs).completeness,
      refusals: () => computeProfileCompleteness({ ...empty, priorRefusals: "none" }, docs).completeness,
      transcript: () => computeProfileCompleteness(empty, { ...docs, transcript: true }).completeness,
      financials: () => computeProfileCompleteness(empty, { ...docs, financials: true }).completeness,
    };

    for (const s of c.suggestions) {
      const after = satisfy[s.id]?.();
      expect(after, `suggestion "${s.id}" must move the bar`).toBeDefined();
      expect(after as number, `suggestion "${s.id}" must move the bar`).toBeGreaterThan(before);
    }
  });

  it("does not list documents as bar items on the anonymous surface (docs absent)", () => {
    const ids = computeProfileCompleteness(base).suggestions.map((s) => s.id);
    expect(ids).not.toContain("transcript");
    expect(ids).not.toContain("financials");
  });

  it("counts obtained documents on a surface that can reach them (docs passed)", () => {
    const none = computeProfileCompleteness(full, { transcript: false, financials: false });
    const both = computeProfileCompleteness(full, { transcript: true, financials: true });
    // With docs in scope, a full profile alone is no longer 100 — the picture now
    // includes documents — and obtaining them raises completeness back to 100.
    expect(none.completeness).toBeLessThan(100);
    expect(both.completeness).toBe(100);
    expect(both.level).toBe("Full picture");
    expect(none.suggestions.map((s) => s.id)).toEqual(expect.arrayContaining(["transcript", "financials"]));
  });

  it("replaces the dishonest English suggestion with an honest, non-verification one", () => {
    const english = computeProfileCompleteness(empty).suggestions.find((s) => s.id === "english");
    expect(english?.label).toBe("Add your English score");
    expect(english?.gain).not.toContain("verification");
  });
});
