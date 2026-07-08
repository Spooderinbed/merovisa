// tests/marketing/provenance.test.ts
import { describe, it, expect } from "vitest";
import {
  isSourced,
  isSample,
  verifiedCitation,
  type Sourced,
  type Sample,
} from "@/lib/marketing/provenance";

describe("marketing provenance types", () => {
  it("isSourced narrows kind:'sourced' and requires source + verified", () => {
    const s: Sourced = { kind: "sourced", source: "Home Affairs", verified: "Jun 2026" };
    expect(isSourced(s)).toBe(true);
    expect(isSample(s)).toBe(false);
  });

  it("isSample narrows kind:'sample'", () => {
    const s: Sample = { kind: "sample" };
    expect(isSample(s)).toBe(true);
    expect(isSourced(s)).toBe(false);
  });

  it("verifiedCitation prints 'source · verified <month>' for a sourced claim", () => {
    expect(
      verifiedCitation({ kind: "sourced", source: "Home Affairs", verified: "Jun 2026" })
    ).toBe("Home Affairs · verified Jun 2026");
  });

  it("verifiedCitation refuses to print a citation for sample data (returns null)", () => {
    expect(verifiedCitation({ kind: "sample" })).toBeNull();
  });
});
