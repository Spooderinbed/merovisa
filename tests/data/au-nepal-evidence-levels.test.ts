import { describe, it, expect } from "vitest";
import { AU_CRICOS_DIRECTORY } from "@/lib/data/source/au-cricos-directory";
import { AU_NEPAL_EVIDENCE_LEVELS } from "@/lib/data/source/au-nepal-evidence-levels";
import { AuNepalEvidenceLevelsSchema } from "@/lib/data/schema/au-nepal-evidence-levels.schema";
import { nepalEvidenceLevel } from "@/lib/data/nepal-evidence-lookup";

describe("AU_NEPAL_EVIDENCE_LEVELS — per-provider Nepal evidence-level map", () => {
  it("satisfies its schema (every value is Regular/Streamlined/Undetermined under a CRICOS-shaped key)", () => {
    expect(() => AuNepalEvidenceLevelsSchema.parse(AU_NEPAL_EVIDENCE_LEVELS)).not.toThrow();
  });

  it("covers every unique provider code in the directory (no provider left without an answer)", () => {
    const directoryCodes = new Set(AU_CRICOS_DIRECTORY.map((e) => e.cricosCode));
    for (const code of directoryCodes) {
      expect(AU_NEPAL_EVIDENCE_LEVELS[code], `missing evidence level for ${code}`).toBeDefined();
    }
  });

  it("carries real per-provider variation, not a blanket level", () => {
    const levels = new Set(Object.values(AU_NEPAL_EVIDENCE_LEVELS));
    expect(levels.has("Regular")).toBe(true);
    expect(levels.has("Streamlined")).toBe(true);
  });
});

describe("nepalEvidenceLevel — lookup by CRICOS code", () => {
  it("returns the harvested level for a known provider", () => {
    // University of Melbourne (00116K) is Streamlined for Nepal in this harvest.
    expect(nepalEvidenceLevel("00116K")).toBe("Streamlined");
  });

  it("returns null for a code that is not in the map", () => {
    expect(nepalEvidenceLevel("99999Z")).toBeNull();
  });
});
