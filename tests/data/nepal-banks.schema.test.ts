import { describe, it, expect } from "vitest";
import { NepalBanksSchema } from "@/lib/data/schema/nepal-banks.schema";
import { NEPAL_BANKS } from "@/lib/data/source/nepal-banks";

const validBank = {
  id: "x",
  name: "X Bank Ltd.",
  nrbClass: "A",
  headOffice: "Somewhere, Kathmandu",
  source: "https://example.org/x",
  lastVerified: "2025-01-15",
  provenance: { findingRefs: ["B.001"] },
};

describe("NepalBanksSchema", () => {
  it("accepts the real NEPAL_BANKS data", () => {
    const result = NepalBanksSchema.safeParse(NEPAL_BANKS);
    if (!result.success) {
      throw new Error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("accepts a minimal valid bank", () => {
    expect(NepalBanksSchema.safeParse([validBank]).success).toBe(true);
  });

  it("rejects a record with empty findingRefs (provenance must point somewhere)", () => {
    const bad = [{ ...validBank, provenance: { findingRefs: [] } }];
    expect(NepalBanksSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-http source", () => {
    const bad = [{ ...validBank, source: "ftp://example.org/x" }];
    expect(NepalBanksSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a loan with no provenance (closes the LoanPricing gap)", () => {
    const bad = [
      {
        ...validBank,
        educationLoan: {
          minAmountNpr: 100_000,
          maxAmountNpr: 200_000,
          source: "https://example.org/loan",
        },
      },
    ];
    expect(NepalBanksSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a loan whose max amount is below its min amount", () => {
    const bad = [
      {
        ...validBank,
        educationLoan: {
          minAmountNpr: 200_000,
          maxAmountNpr: 100_000,
          source: "https://example.org/loan",
          provenance: { findingRefs: ["B.002"] },
        },
      },
    ];
    expect(NepalBanksSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate bank ids", () => {
    expect(NepalBanksSchema.safeParse([validBank, validBank]).success).toBe(false);
  });
});
