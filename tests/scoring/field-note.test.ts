import { describe, it, expect } from "vitest";
import { competitivenessNote } from "@/lib/scoring/field-note";

describe("competitivenessNote", () => {
  it("returns null when there are no extras", () => {
    expect(competitivenessNote("computer-science", [])).toBeNull();
    expect(competitivenessNote("computer-science", undefined)).toBeNull();
  });

  it("flags a materially easier extra as a potentially stronger chance", () => {
    // CS 0.95 vs Business 0.85 → 10 competitiveness points ⇒ material.
    const note = competitivenessNote("computer-science", ["business"]);
    expect(note).not.toBeNull();
    expect(note!.field).toBe("business");
    expect(note!.direction).toBe("easier");
    expect(note!.text).toMatch(/less competitive/i);
    expect(note!.text).toContain("Business");
    expect(note!.text).toContain("Computer Science");
  });

  it("flags a materially tougher extra honestly (never hides a higher bar)", () => {
    const note = competitivenessNote("business", ["computer-science"]);
    expect(note!.direction).toBe("harder");
    expect(note!.text).toMatch(/more competitive/i);
  });

  it("stays quiet when the gap is immaterial (< 10 points)", () => {
    expect(competitivenessNote("business", ["nursing"])).toBeNull(); // both 0.85
    expect(competitivenessNote("computer-science", ["engineering"])).toBeNull(); // 0.95 vs 0.90 = 5 pts
  });

  it("surfaces the single most material extra", () => {
    // primary CS 0.95; engineering 0.90 (5 pts, immaterial) + arts 0.70 (25 pts) ⇒ arts wins.
    const note = competitivenessNote("computer-science", ["engineering", "arts"]);
    expect(note!.field).toBe("arts");
    expect(note!.direction).toBe("easier");
  });
});
