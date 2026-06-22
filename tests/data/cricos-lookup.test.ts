import { describe, it, expect } from "vitest";
import { cricosCodeForUniversity } from "@/lib/data/cricos-lookup";

describe("cricosCodeForUniversity — catalogue university → sourced CRICOS code", () => {
  it("resolves a catalogue id to its sourced provider code", () => {
    expect(cricosCodeForUniversity("sydney")?.cricosCode).toBe("00026A");
    expect(cricosCodeForUniversity("unsw")?.cricosCode).toBe("00098G");
    expect(cricosCodeForUniversity("monash")?.cricosCode).toBe("00008C");
  });

  it("maps explicitly, not by name (Adelaide kept its catalogue name but is the merged Adelaide University)", () => {
    // Catalogue name is still "University of Adelaide" while the current CRICOS
    // entity is "Adelaide University" (04249J) — a name match would miss it.
    const adelaide = cricosCodeForUniversity("adelaide");
    expect(adelaide?.cricosCode).toBe("04249J");
    expect(adelaide?.provider).toBe("Adelaide University");
  });

  it("resolves Melbourne and ANU from the harvested DHA directory (were previously null)", () => {
    const mel = cricosCodeForUniversity("melbourne");
    expect(mel?.cricosCode).toBe("00116K");
    expect(mel?.provider).toMatch(/Melbourne/i);
    expect(mel?.source).toMatch(/^https?:\/\//);

    const anu = cricosCodeForUniversity("anu");
    expect(anu?.cricosCode).toBe("00120C");
    expect(anu?.provider).toMatch(/Australian National University/i);
  });

  it("returns null for an unknown university id", () => {
    expect(cricosCodeForUniversity("not-a-real-uni")).toBeNull();
  });

  it("covers every mapped catalogue university with a real, well-formed code (guards target typos)", () => {
    // The 13 catalogue universities that have a sourced CRICOS code. Each must
    // resolve to a record whose code matches the register shape — a typo'd map
    // target would return null and fail here.
    const covered = [
      "unsw", "sydney", "monash", "uq", "uwa", "adelaide", "uts",
      "rmit", "macquarie", "deakin", "curtin", "latrobe", "wsu",
    ];
    for (const id of covered) {
      const rec = cricosCodeForUniversity(id);
      expect(rec, `expected a CRICOS record for "${id}"`).not.toBeNull();
      expect(rec!.cricosCode).toMatch(/^\d{5}[A-Z]$/);
    }
  });
});
