import { describe, it, expect } from "vitest";
import {
  ASSESSMENT_TTL_DAYS,
  assessmentExpiry,
  formatExpiryLabel,
  isExpired,
} from "@/lib/assessments/expiry";

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

  it("formats the expiry day pinned to Asia/Kathmandu, not UTC or the runtime zone (MV-118 #4)", () => {
    // 19:00 UTC is already the next calendar day in Kathmandu (UTC+5:45), so a UTC
    // or runtime-local format would read a day early. Pinning the zone is what makes
    // the label identical on the server and the client (kills the hydration mismatch).
    expect(formatExpiryLabel("2026-07-11T19:00:00.000Z")).toBe("Jul 12");
    expect(formatExpiryLabel("2026-06-06T06:00:00.000Z")).toBe("Jun 6");
  });
});
