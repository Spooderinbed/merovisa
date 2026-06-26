import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildGuideContext } from "@/lib/guide/context";
import type { AssessmentPayload } from "@/lib/results/types";
import type { PlanItemRow } from "@/lib/plan/types";

// A realistic payload touching only the fields the grounding reads. Distinctive
// numbers (73.42 / 88.17 / 12.5) let us prove the raw scores never leak.
function payload(): AssessmentPayload {
  return {
    result: {
      verdict: "strong",
      weighted: 88.17,
      dimensions: {
        academic: {
          value: 73.42,
          factors: [
            {
              label: "Academic record",
              influence: "positive",
              detail: "Your TU percentage clears the entry bar at most matched programs.",
              source: { url: "https://example.gov/academic", lastVerified: "2026-06-07" },
            },
          ],
        },
        financial: { value: 41.0, factors: [{ label: "Finances", influence: "risk", detail: "Funds are thin for the first year." }] },
        visa: { value: 55.0, factors: [] },
        profileStrength: { value: 60.0, factors: [] },
      },
      ruleVersion: "r1",
      configVersion: "c1",
      computedAt: "2026-06-20T00:00:00Z",
    },
    matches: [
      {
        program: { name: "Master of IT", level: "masters" },
        university: { name: "University of Melbourne", city: "Melbourne" },
        verdict: "possible",
        reasons: [{ kind: "academic", text: "Grades are in range.", positive: true }],
        evidence: { level: "Regular", source: "https://example.gov/evidence" },
        scoreSnapshot: { gradeGap: 12.5, englishGap: 0, bandGap: 0, tuitionGap: 0 },
      },
    ],
    matchedCount: 1,
    intake: {} as AssessmentPayload["intake"],
    accuracy: {} as AssessmentPayload["accuracy"],
  } as unknown as AssessmentPayload;
}

function planItem(over: Partial<PlanItemRow> = {}): PlanItemRow {
  return {
    id: 1,
    owner: "o",
    kind: "ielts",
    impact: "high",
    title: "Book your IELTS test",
    body: "Register at a Kathmandu test centre.",
    liftEstimate: null,
    timeEstimate: null,
    status: "todo",
    createdAt: "2026-06-20T00:00:00Z",
    completedAt: null,
    startedAt: null,
    ...over,
  } as PlanItemRow;
}

describe("buildGuideContext", () => {
  it("renders the banded verdict label and never the raw numeric scores", () => {
    const out = buildGuideContext({ payload: payload(), planItems: [] });
    expect(out).toContain("Strong match");
    // No raw scores/rules leaked: dimension value, weighted total, score-gap.
    expect(out).not.toContain("73.42");
    expect(out).not.toContain("88.17");
    expect(out).not.toContain("12.5");
  });

  it("includes factor reasons with their source when one is present", () => {
    const out = buildGuideContext({ payload: payload(), planItems: [] });
    expect(out).toContain("Academic record");
    expect(out).toContain("clears the entry bar");
    expect(out).toContain("https://example.gov/academic");
    // A heuristic factor with no source still appears, just uncited.
    expect(out).toContain("Funds are thin");
  });

  it("includes top matches with program, university and the evidence level + its source", () => {
    const out = buildGuideContext({ payload: payload(), planItems: [] });
    expect(out).toContain("University of Melbourne");
    expect(out).toContain("Master of IT");
    expect(out).toContain("Regular");
    expect(out).toContain("https://example.gov/evidence");
  });

  it("includes the student's open plan items", () => {
    const out = buildGuideContext({ payload: payload(), planItems: [planItem()] });
    expect(out).toContain("Book your IELTS test");
  });

  it("grounds on real sourced cost-to-apply data, each line citing a source", () => {
    const out = buildGuideContext({ payload: payload(), planItems: [] });
    expect(out).toContain("Cost to apply");
    // The cost section is assembled from sourced corridor data — every line carries a source.
    expect(out).toMatch(/Cost to apply[\s\S]*source:/);
  });

  it("does not fabricate a verdict when the student has no assessment yet", () => {
    const out = buildGuideContext({ payload: null, planItems: [] });
    expect(out).toMatch(/has not completed an assessment/i);
    expect(out).not.toContain("Strong match");
    expect(out).not.toContain("Reach");
    // Corridor-general cost data is still safe to ground on.
    expect(out).toContain("Cost to apply");
  });
});
