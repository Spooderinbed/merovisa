import { describe, it, expect } from "vitest";
import { getNepalBanks, getEducationLoanBanks } from "@/lib/data/source/banks";

describe("bank accessors", () => {
  it("getNepalBanks returns the full directory", () => {
    expect(getNepalBanks().length).toBeGreaterThanOrEqual(20);
  });
  it("getEducationLoanBanks returns only banks with an educationLoan", () => {
    const lenders = getEducationLoanBanks();
    expect(lenders.length).toBeGreaterThanOrEqual(3);
    expect(lenders.every((b) => b.educationLoan)).toBe(true);
  });
});
