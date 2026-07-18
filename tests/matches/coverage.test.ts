import { describe, it, expect } from "vitest";
import { uncoveredField } from "@/lib/matches/coverage";
import type { Program } from "@/lib/programs/types";

const prog = (field: string): Program => ({
  id: `p-${field}`,
  universityId: "u1",
  name: "A program",
  level: "masters",
  field,
  tuitionMin: 40000,
  tuitionMax: 40000,
  tuitionCurrency: "AUD",
  minGrade: 65,
  minEnglish: 6.5,
  minEnglishBand: 6.0,
  intakes: ["feb"],
  source: "https://x",
  lastVerified: "2026-01-01",
  dataQuality: "primary",
  notes: null,
});

describe("uncoveredField", () => {
  const catalogue = [prog("computer-science"), prog("business"), prog("nursing")];

  it("returns the field id when the catalogue carries zero programs for it", () => {
    // A Law student against a catalogue that lists no Law: the honest signal that we
    // don't cover their field yet (audit C-10).
    expect(uncoveredField("law", catalogue)).toBe("law");
    expect(uncoveredField("agriculture", catalogue)).toBe("agriculture");
  });

  it("returns null when the field IS present in the passed-in catalogue", () => {
    expect(uncoveredField("computer-science", catalogue)).toBeNull();
    expect(uncoveredField("business", catalogue)).toBeNull();
  });

  it("derives coverage from the catalogue actually passed in, not a hardcoded list", () => {
    // The over-disclosure risk the build order flagged: if a field the live DB now
    // carries were hardcoded as unsupported, we'd falsely tell the student we don't
    // list it. Coverage must follow the injected catalogue.
    expect(uncoveredField("law", [prog("law")])).toBeNull();
  });

  it("treats 'other' as never covered when the catalogue is non-empty", () => {
    // 'other' is a wizard field that can never be a program discipline, so it is
    // always uncovered — the student gets the honest reference-only framing.
    expect(uncoveredField("other", catalogue)).toBe("other");
  });

  it("returns null for a null/undefined field (nothing to disclose)", () => {
    expect(uncoveredField(null, catalogue)).toBeNull();
    expect(uncoveredField(undefined, catalogue)).toBeNull();
  });

  it("returns null for an empty catalogue — an outage/empty-state, not a per-field claim", () => {
    // Listing NOTHING is a read-outage / empty-state concern (MV-133). We must not tell
    // a student "we don't list your field" when we are listing no fields at all.
    expect(uncoveredField("computer-science", [])).toBeNull();
    expect(uncoveredField("law", [])).toBeNull();
  });
});
