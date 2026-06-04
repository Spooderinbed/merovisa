import { describe, it, expect } from "vitest";
import { SEED_UNIVERSITIES, SEED_PROGRAMS } from "@/lib/programs/seed";

describe("seed data", () => {
  it("ships exactly 15 universities", () => {
    expect(SEED_UNIVERSITIES).toHaveLength(15);
  });

  it("ships 50+ programs across all universities", () => {
    expect(SEED_PROGRAMS.length).toBeGreaterThanOrEqual(50);
  });

  it("every program references a valid university id", () => {
    const uniIds = new Set(SEED_UNIVERSITIES.map((u) => u.id));
    for (const p of SEED_PROGRAMS) {
      expect(uniIds.has(p.universityId)).toBe(true);
    }
  });

  it("every entry has source + lastVerified + dataQuality", () => {
    for (const u of SEED_UNIVERSITIES) {
      expect(u.source).toMatch(/^https?:\/\//);
      expect(u.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["primary", "derived", "secondary"]).toContain(u.dataQuality);
    }
    for (const p of SEED_PROGRAMS) {
      expect(p.source).toMatch(/^https?:\/\//);
      expect(p.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["primary", "derived", "secondary"]).toContain(p.dataQuality);
    }
  });

  it("RMIT programs are marked primary (Nepal-specific entry table)", () => {
    for (const p of SEED_PROGRAMS.filter((p) => p.universityId === "rmit")) {
      expect(p.dataQuality).toBe("primary");
    }
  });
});
