// tests/marketing/guide-answers.test.ts
import { describe, it, expect } from "vitest";
import { GUIDE_ANSWERS, GUIDE_ORDER } from "@/lib/marketing/guide-answers";

describe("guide answers", () => {
  it("has exactly the three approved exchanges in order, ielts first", () => {
    expect(GUIDE_ORDER).toEqual(["ielts", "funds", "gte"]);
    expect(Object.keys(GUIDE_ANSWERS).sort()).toEqual(["funds", "gte", "ielts"]);
  });

  it("every exchange has a first-person question, an answer, and a bare citation", () => {
    for (const key of GUIDE_ORDER) {
      const exchange = GUIDE_ANSWERS[key];
      expect(exchange.q.length).toBeGreaterThan(10);
      expect(exchange.a.length).toBeGreaterThan(20);
      expect(exchange.c).toMatch(/Home Affairs/);
      expect(exchange.c).not.toMatch(/^Source: /);
      expect(exchange.c).not.toMatch(/verified/i);
    }
  });

  it("ielts citation is the bare 'source · month year' form, no prefix or verified word", () => {
    expect(GUIDE_ANSWERS.ielts.c).toBe("Home Affairs · Jun 2026");
  });

  it("uses Genuine Student wording, never user-facing GTE", () => {
    expect(JSON.stringify(GUIDE_ANSWERS)).not.toMatch(/GTE|Genuine Temporary Entrant/);
  });
});
