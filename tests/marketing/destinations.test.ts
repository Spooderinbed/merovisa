import { describe, it, expect } from "vitest";
import { MARKETING_DESTINATIONS, getMarketingDestination } from "@/lib/marketing/destinations";

describe("marketing destinations registry", () => {
  it("ships exactly the six designed countries", () => {
    expect(MARKETING_DESTINATIONS.map((c) => c.id).sort()).toEqual(["au", "ca", "de", "ie", "uk", "us"].sort());
  });

  it("every entry has a non-empty source, lastVerified, tagline, tuition, and at least one doc", () => {
    for (const c of MARKETING_DESTINATIONS) {
      expect(c.source).toMatch(/^https?:\/\//);
      expect(c.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.tagline.length).toBeGreaterThan(10);
      expect(c.tuition.length).toBeGreaterThan(0);
      expect(c.docs.length).toBeGreaterThan(0);
    }
  });

  it("getMarketingDestination returns the entry by id or null", () => {
    expect(getMarketingDestination("au")?.name).toBe("Australia");
    expect(getMarketingDestination("xx")).toBeNull();
  });
});
