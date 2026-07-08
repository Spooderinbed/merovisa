// tests/marketing/plan-steps.test.ts
import { describe, it, expect } from "vitest";
import { PLAN_STEPS } from "@/lib/marketing/plan-steps";

describe("plan steps", () => {
  it("ships exactly five steps numbered 01..05", () => {
    expect(PLAN_STEPS).toHaveLength(5);
    expect(PLAN_STEPS.map((s) => s.n)).toEqual(["01", "02", "03", "04", "05"]);
  });

  it("step 02 is the one open at rest, and is the 'Now' step", () => {
    const open = PLAN_STEPS.filter((s) => s.open);
    expect(open).toHaveLength(1);
    expect(open[0]!.n).toBe("02");
    expect(open[0]!.state).toBe("Now");
  });

  it("every sourced step renders a 'Source: ... · <month>' citation", () => {
    for (const s of PLAN_STEPS) {
      if (s.cite.startsWith("Source:")) expect(s.cite).toMatch(/·\s*\w+\s*\d{4}$/);
    }
  });
});
