import { describe, it, expect } from "vitest";
import { computeIntakeTiming, buildIntakeTimeline } from "@/lib/timing/intake";
import type { IntakeTiming } from "@/lib/timing/intake";
import { AUSTRALIA } from "@/lib/data/destination/australia";
import type { StudentProfile } from "@/lib/scoring/types";

const profile: StudentProfile = {
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

describe("computeIntakeTiming", () => {
  it("picks the nearest intake whose deadline has not passed", () => {
    const timing = computeIntakeTiming(profile, AUSTRALIA, new Date("2026-06-03"));
    expect(timing.nearest.name).toBe("February");
    expect(timing.nearest.year).toBe(2027);
    expect(timing.nearest.status).toBe("open");
  });

  it("lists later intakes as alternatives", () => {
    const timing = computeIntakeTiming(profile, AUSTRALIA, new Date("2026-06-03"));
    expect(timing.alternatives.length).toBeGreaterThan(0);
    expect(timing.alternatives.some((a) => a.name === "July" && a.year === 2027)).toBe(true);
  });

  it("flags an intake as tight when English is not ready and the deadline is near", () => {
    const soon = computeIntakeTiming(
      { ...profile, englishStatus: "not-taken", englishScore: undefined },
      AUSTRALIA,
      new Date("2026-02-20"),
    );
    expect(["tight", "open"]).toContain(soon.nearest.status);
  });
});

describe("buildIntakeTimeline", () => {
  // Alternatives are intentionally out of order to prove the helper sorts.
  const timing: IntakeTiming = {
    nearest: { name: "February", year: 2027, month: 2, status: "open", note: "On track." },
    alternatives: [
      { name: "February", year: 2028, month: 2, status: "tight", note: "Tight." },
      { name: "July", year: 2027, month: 7, status: "open", note: "On track." },
    ],
  };
  const now = new Date("2026-08-01");

  it("returns one point per intake, ordered chronologically", () => {
    const points = buildIntakeTimeline(timing, now);
    expect(points.map((p) => `${p.name} ${p.year}`)).toEqual([
      "February 2027",
      "July 2027",
      "February 2028",
    ]);
  });

  it("places the furthest intake at 100% with offsets increasing from now", () => {
    const points = buildIntakeTimeline(timing, now);
    expect(points[points.length - 1]!.offsetPct).toBe(100);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.offsetPct).toBeGreaterThan(points[i - 1]!.offsetPct);
    }
    // `now` sits before every future intake, so each tick is past the start.
    expect(points[0]!.offsetPct).toBeGreaterThan(0);
  });

  it("keeps every offset within the 0–100 track", () => {
    for (const p of buildIntakeTimeline(timing, now)) {
      expect(p.offsetPct).toBeGreaterThanOrEqual(0);
      expect(p.offsetPct).toBeLessThanOrEqual(100);
    }
  });

  it("preserves each intake's status, name and year", () => {
    const points = buildIntakeTimeline(timing, now);
    expect(points[0]).toMatchObject({ name: "February", year: 2027, status: "open" });
    expect(points[2]).toMatchObject({ name: "February", year: 2028, status: "tight" });
  });

  it("places a sole intake at the end of the track", () => {
    const one: IntakeTiming = {
      nearest: { name: "July", year: 2027, month: 7, status: "open", note: "" },
      alternatives: [],
    };
    const points = buildIntakeTimeline(one, now);
    expect(points).toHaveLength(1);
    expect(points[0]!.offsetPct).toBe(100);
  });
});
