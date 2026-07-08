// tests/marketing/sample-profiles.test.ts
import { describe, it, expect } from "vitest";
import { SAMPLE_PROFILES, getProfile, formatCost } from "@/lib/marketing/sample-profiles";

describe("sample profiles", () => {
  it("ships exactly two profiles, both kind:'sample'", () => {
    expect(SAMPLE_PROFILES).toHaveLength(2);
    for (const p of SAMPLE_PROFILES) expect(p.kind).toBe("sample");
  });

  it("Aarav is GPA 3.2 -> Possible, ~A$42,600; Shruti is GPA 3.8 -> Strong, ~A$44,200", () => {
    const aarav = getProfile("aarav");
    const shruti = getProfile("shruti");
    expect(aarav.label).toBe("Aarav · GPA 3.2");
    expect(aarav.verdict).toBe("Possible");
    expect(aarav.cost).toBe(42600);
    expect(shruti.label).toBe("Shruti · GPA 3.8");
    expect(shruti.verdict).toBe("Strong");
    expect(shruti.cost).toBe(44200);
  });

  it("every profile has 4 dims (Academic/English/Finances/Visa risk) and no citation fields", () => {
    for (const p of SAMPLE_PROFILES) {
      expect(p.dims.map((d) => d.name)).toEqual(["Academic", "English", "Finances", "Visa risk"]);
      for (const d of p.dims) {
        expect(d.width).toBeGreaterThan(0);
        expect("cite" in d).toBe(false);
        expect("verified" in d).toBe(false);
      }
    }
  });

  it("formatCost renders a non-sourced approximate estimate", () => {
    expect(formatCost(42600)).toBe("≈ A$42,600");
    expect(formatCost(44200)).toBe("≈ A$44,200");
  });

  it("getProfile returns the matching profile, defaulting handled by caller", () => {
    expect(getProfile("shruti").id).toBe("shruti");
  });
});
