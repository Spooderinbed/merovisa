import { describe, it, expect } from "vitest";
import { humanizeFactorDetail } from "@/lib/results/factor-copy";

/**
 * Display-layer guard for the fix-#8 casing leak: scoring factor details
 * interpolate the raw destination id ("threshold for australia"), and the
 * engine's output is versioned, so the id is humanized at the render seam.
 */
describe("humanizeFactorDetail", () => {
  it("replaces a raw destination id with the proper name", () => {
    expect(humanizeFactorDetail("Meets the 6.5 threshold for australia.")).toBe(
      "Meets the 6.5 threshold for Australia.",
    );
  });

  it("covers the visa-floor variant", () => {
    expect(humanizeFactorDetail("Below the DHA visa floor (6.0) for australia.")).toBe(
      "Below the DHA visa floor (6.0) for Australia.",
    );
  });

  it("reads as a phrase for the not-sure delegation", () => {
    expect(humanizeFactorDetail("Meets the 6.5 threshold for not-sure.")).toBe(
      "Meets the 6.5 threshold for your destination.",
    );
  });

  it("uses in-sentence forms for every destination id (stored pre-honesty payloads)", () => {
    expect(humanizeFactorDetail("Meets the 6.5 threshold for canada.")).toBe(
      "Meets the 6.5 threshold for Canada.",
    );
    expect(humanizeFactorDetail("Meets the 6.5 threshold for usa.")).toBe(
      "Meets the 6.5 threshold for the USA.",
    );
    expect(humanizeFactorDetail("Meets the 6.5 threshold for uk.")).toBe(
      "Meets the 6.5 threshold for the UK.",
    );
  });

  it("leaves already-proper names and unrelated copy untouched", () => {
    expect(humanizeFactorDetail("Most Computer Science programs in Australia expect 73%+.")).toBe(
      "Most Computer Science programs in Australia expect 73%+.",
    );
    expect(humanizeFactorDetail("No gap — strong timing signal for visa.")).toBe(
      "No gap — strong timing signal for visa.",
    );
  });
});
