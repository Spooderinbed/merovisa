import { describe, it, expect } from "vitest";
import { AU_CRICOS_DIRECTORY } from "@/lib/data/source/au-cricos-directory";
import { AuCricosDirectorySchema } from "@/lib/data/schema/au-cricos-directory.schema";

describe("AU_CRICOS_DIRECTORY — complete harvested CRICOS provider directory", () => {
  it("satisfies its schema (every code is a well-formed CRICOS code)", () => {
    expect(() => AuCricosDirectorySchema.parse(AU_CRICOS_DIRECTORY)).not.toThrow();
  });

  it("carries the full provider directory (a thousand-plus providers, not the ~62-row hand list)", () => {
    expect(AU_CRICOS_DIRECTORY.length).toBeGreaterThan(1500);
  });

  it("auto-fills the two providers the hand list is missing (University of Melbourne + ANU)", () => {
    const codes = new Set(AU_CRICOS_DIRECTORY.map((e) => e.cricosCode));
    expect(codes.has("00116K")).toBe(true); // University of Melbourne
    expect(codes.has("00120C")).toBe(true); // Australian National University
  });

  it("normalises the one malformed source code (Babel International College 3522E → 03522E)", () => {
    const babel = AU_CRICOS_DIRECTORY.find((e) => /Babel International College/i.test(e.provider));
    expect(babel?.cricosCode).toBe("03522E");
    expect(AU_CRICOS_DIRECTORY.some((e) => e.cricosCode === "3522E")).toBe(false);
  });
});
