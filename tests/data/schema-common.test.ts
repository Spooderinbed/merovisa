import { describe, it, expect } from "vitest";
import {
  IsoDate,
  HttpUrl,
  FindingId,
  ProvenanceSchema,
  freshIsoDate,
} from "@/lib/data/schema/common";

describe("FindingId", () => {
  it("accepts canonical finding ids", () => {
    for (const id of ["A.001", "B.045", "J.028", "E.176", "J1.001", "J2.010"]) {
      expect(FindingId.safeParse(id).success).toBe(true);
    }
  });

  it("rejects malformed ids", () => {
    for (const bad of ["b.045", "B.4", "X.045", "B045", "B.", "", "B.045x"]) {
      expect(FindingId.safeParse(bad).success).toBe(false);
    }
  });
});

describe("HttpUrl", () => {
  it("accepts http(s) urls", () => {
    expect(HttpUrl.safeParse("https://nrb.org.np/list").success).toBe(true);
    expect(HttpUrl.safeParse("http://x.test").success).toBe(true);
  });

  it("rejects non-http strings", () => {
    for (const bad of ["ftp://x", "nrb.org.np", "www.x.com", ""]) {
      expect(HttpUrl.safeParse(bad).success).toBe(false);
    }
  });
});

describe("IsoDate", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(IsoDate.safeParse("2026-06-06").success).toBe(true);
  });

  it("rejects other date shapes", () => {
    for (const bad of ["2026-6-6", "06-06-2026", "2026/06/06", "2026-06"]) {
      expect(IsoDate.safeParse(bad).success).toBe(false);
    }
  });
});

describe("ProvenanceSchema", () => {
  it("accepts at least one valid finding ref", () => {
    expect(ProvenanceSchema.safeParse({ findingRefs: ["B.045"] }).success).toBe(true);
    expect(
      ProvenanceSchema.safeParse({
        findingRefs: ["B.045", "B.046"],
        source: "https://x.test",
        lastVerified: "2026-06-06",
      }).success,
    ).toBe(true);
  });

  it("rejects empty or malformed refs", () => {
    expect(ProvenanceSchema.safeParse({ findingRefs: [] }).success).toBe(false);
    expect(ProvenanceSchema.safeParse({ findingRefs: ["nope"] }).success).toBe(false);
    expect(ProvenanceSchema.safeParse({}).success).toBe(false);
  });
});

describe("ProvenanceSchema — volatility & reverifyBy", () => {
  const base = { findingRefs: ["B.045"] };

  it("accepts stable volatility without a reverifyBy", () => {
    expect(ProvenanceSchema.safeParse({ ...base, volatility: "stable" }).success).toBe(true);
  });

  it("accepts annual/volatile with a reverifyBy date", () => {
    for (const v of ["annual", "volatile"]) {
      expect(
        ProvenanceSchema.safeParse({ ...base, volatility: v, reverifyBy: "2026-07-01" }).success,
      ).toBe(true);
    }
  });

  it("rejects non-stable volatility without a reverifyBy", () => {
    for (const v of ["annual", "volatile"]) {
      expect(ProvenanceSchema.safeParse({ ...base, volatility: v }).success).toBe(false);
    }
  });

  it("accepts a reverifyBy on its own (deadline without a volatility class)", () => {
    expect(ProvenanceSchema.safeParse({ ...base, reverifyBy: "2026-07-01" }).success).toBe(true);
  });

  it("rejects an unknown volatility", () => {
    expect(ProvenanceSchema.safeParse({ ...base, volatility: "weekly" }).success).toBe(false);
  });

  it("rejects a malformed reverifyBy", () => {
    expect(
      ProvenanceSchema.safeParse({ ...base, volatility: "volatile", reverifyBy: "July 2026" }).success,
    ).toBe(false);
  });
});

describe("freshIsoDate", () => {
  it("accepts a recent date within the TTL", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(freshIsoDate(365).safeParse(today).success).toBe(true);
  });

  it("rejects a date older than the TTL", () => {
    expect(freshIsoDate(365).safeParse("2000-01-01").success).toBe(false);
  });

  it("still enforces ISO format", () => {
    expect(freshIsoDate(365).safeParse("not-a-date").success).toBe(false);
  });
});
