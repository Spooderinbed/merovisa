// tests/marketing/guide-answers.test.ts
import { describe, it, expect } from "vitest";
import { GUIDE_ANSWERS, GUIDE_ORDER } from "@/lib/marketing/guide-answers";

describe("guide answers", () => {
  it("has exactly the three approved exchanges in order, ielts first", () => {
    expect(GUIDE_ORDER).toEqual(["ielts", "funds", "gte"]);
    expect(Object.keys(GUIDE_ANSWERS).sort()).toEqual(["funds", "gte", "ielts"]);
  });

  it("every exchange has a chip label, first-person question, answer, and a source+verified citation", () => {
    for (const key of GUIDE_ORDER) {
      const ex = GUIDE_ANSWERS[key];
      expect(ex.chip.length).toBeGreaterThan(3);
      expect(ex.q.length).toBeGreaterThan(10);
      expect(ex.a.length).toBeGreaterThan(20);
      expect(ex.source).toMatch(/Home Affairs/);
      expect(ex.verified).toBe("Jun 2026");
    }
  });

  it("uses Genuine Student wording, never user-facing GTE", () => {
    expect(JSON.stringify(GUIDE_ANSWERS)).not.toMatch(/GTE|Genuine Temporary Entrant/);
  });
});
