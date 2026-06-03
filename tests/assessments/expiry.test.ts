import { describe, it, expect } from "vitest";
import { ASSESSMENT_TTL_DAYS, assessmentExpiry, isExpired } from "@/lib/assessments/expiry";

describe("assessment expiry", () => {
  const now = new Date("2026-06-03T00:00:00.000Z");

  it("is a 3-day window", () => {
    expect(ASSESSMENT_TTL_DAYS).toBe(3);
  });

  it("computes expiry 3 days out as an ISO string", () => {
    expect(assessmentExpiry(now)).toBe("2026-06-06T00:00:00.000Z");
  });

  it("detects expiry relative to now", () => {
    expect(isExpired("2026-06-02T00:00:00.000Z", now)).toBe(true);
    expect(isExpired("2026-06-04T00:00:00.000Z", now)).toBe(false);
  });
});
