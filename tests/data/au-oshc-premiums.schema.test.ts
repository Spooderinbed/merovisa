import { describe, it, expect } from "vitest";
import { AuOshcPremiumsListSchema } from "@/lib/data/schema/au-oshc-premiums.schema";
import { AU_OSHC_PREMIUMS } from "@/lib/data/source/au-oshc-premiums";

const priced = {
  id: "x",
  provider: "X Health",
  singleCoverAudPerYear: 680,
  singleCoverAudPerMonth: 56.63,
  coverType: "single",
  quoteOnly: false,
  basis: "X OSHC rate card, single cover",
  source: "https://example.org/x",
  lastVerified: "2026-06-20",
};

const quoteOnlyRecord = {
  id: "y",
  provider: "Y Care",
  singleCoverAudPerYear: null,
  singleCoverAudPerMonth: null,
  coverType: "single",
  quoteOnly: true,
  basis: "Y OSHC quote tool only — no static rate card",
  source: "https://example.org/y",
  lastVerified: "2026-06-20",
};

describe("AuOshcPremiumsListSchema", () => {
  it("accepts the real AU_OSHC_PREMIUMS data", () => {
    const result = AuOshcPremiumsListSchema.safeParse(AU_OSHC_PREMIUMS);
    if (!result.success) {
      throw new Error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("accepts a priced record and a quote-only record", () => {
    expect(AuOshcPremiumsListSchema.safeParse([priced, quoteOnlyRecord]).success).toBe(true);
  });

  it("rejects a non-http source", () => {
    const bad = [{ ...priced, source: "ftp://example.org/x" }];
    expect(AuOshcPremiumsListSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-ISO lastVerified", () => {
    const bad = [{ ...priced, lastVerified: "June 2026" }];
    expect(AuOshcPremiumsListSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a zero or negative annual premium", () => {
    expect(AuOshcPremiumsListSchema.safeParse([{ ...priced, singleCoverAudPerYear: 0 }]).success).toBe(
      false,
    );
  });

  it("rejects a priced provider (quoteOnly false) with no annual figure", () => {
    const bad = [{ ...priced, singleCoverAudPerYear: null }];
    expect(AuOshcPremiumsListSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a quote-only provider that still carries a premium figure", () => {
    const bad = [{ ...quoteOnlyRecord, singleCoverAudPerYear: 680 }];
    expect(AuOshcPremiumsListSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate ids", () => {
    expect(AuOshcPremiumsListSchema.safeParse([priced, priced]).success).toBe(false);
  });
});
