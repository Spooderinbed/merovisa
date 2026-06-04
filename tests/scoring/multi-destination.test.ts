import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/scoring/engine", () => ({
  runAssessment: vi.fn((input: { destination: string }) => ({
    verdict: "possible",
    weighted: 50,
    dimensions: {},
    ruleVersion: "test",
    computedAt: "2026-01-01T00:00:00.000Z",
    destinationId: input.destination,
  })),
}));

import { composeScoresForAllDestinations } from "@/lib/scoring/multi-destination";

describe("composeScoresForAllDestinations", () => {
  it("runs runAssessment once per destination", () => {
    const base: any = { grade: 72 };
    const out = composeScoresForAllDestinations(base, [
      "australia",
      "canada",
      "uk",
    ]);
    expect(Object.keys(out)).toEqual(["australia", "canada", "uk"]);
  });

  it("returns empty object when no destinations given", () => {
    expect(composeScoresForAllDestinations({} as any, [])).toEqual({});
  });
});
