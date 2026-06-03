import { describe, it, expect } from "vitest";
import { SECTION_KEYS, REQUIRED_FIELDS, type SectionKey } from "@/lib/profiles/sections";

describe("profile sections registry", () => {
  it("ships exactly the 13 designed sections", () => {
    expect(SECTION_KEYS).toEqual([
      "personal", "destination", "academic", "intended-study", "english",
      "gap", "work", "finance", "immigration", "family", "career",
      "scholarships", "deal-breakers",
    ]);
  });

  it("REQUIRED_FIELDS has an entry for every section", () => {
    for (const k of SECTION_KEYS) {
      const required = REQUIRED_FIELDS[k as SectionKey];
      expect(Array.isArray(required)).toBe(true);
    }
  });

  it("personal section requires at least name", () => {
    expect(REQUIRED_FIELDS.personal).toContain("name");
  });
});
