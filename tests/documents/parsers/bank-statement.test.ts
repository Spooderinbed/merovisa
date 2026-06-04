import { describe, it, expect } from "vitest";
import { parseBankStatement } from "@/lib/documents/parsers/bank-statement";

describe("parseBankStatement", () => {
  it("extracts balance and NPR currency from a typical Nepali bank statement", () => {
    const text = `
      Rastriya Banijya Bank
      Account No: 1234567890
      Statement Period: 01/01/2024 - 31/03/2024
      Closing Balance: NPR 2,500,000.00
    `;
    const result = parseBankStatement(text);
    expect(result).not.toBeNull();
    expect(result!.balance).toBe(2500000.0);
    expect(result!.currency).toBe("NPR");
  });

  it("extracts balance from available balance label", () => {
    const text = `
      Available Balance: 1,800,000
      Currency: NPR
    `;
    const result = parseBankStatement(text);
    expect(result).not.toBeNull();
    expect(result!.balance).toBe(1800000);
  });

  it("extracts AUD balance", () => {
    const text = `Current Balance: AUD 45,000.00 as of 2024-03-31`;
    const result = parseBankStatement(text);
    expect(result).not.toBeNull();
    expect(result!.balance).toBe(45000.0);
    expect(result!.currency).toBe("AUD");
  });

  it("returns null for garbage text", () => {
    expect(parseBankStatement("IELTS Score Report Overall: 7.5")).toBeNull();
    expect(parseBankStatement("")).toBeNull();
  });

  it("returns null when balance is zero or negative", () => {
    expect(parseBankStatement("Balance: 0")).toBeNull();
    expect(parseBankStatement("Closing Balance: -500")).toBeNull();
  });

  it("handles NRs as NPR currency alias", () => {
    const text = `Balance: 500,000 NRs`;
    const result = parseBankStatement(text);
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("NPR");
  });

  it("handles balance without commas", () => {
    const text = `Closing Balance: 750000.50 NPR`;
    const result = parseBankStatement(text);
    expect(result).not.toBeNull();
    expect(result!.balance).toBe(750000.5);
  });

  it("returns null currency when no currency code found", () => {
    const text = `Balance: 100000`;
    const result = parseBankStatement(text);
    expect(result).not.toBeNull();
    expect(result!.balance).toBe(100000);
    expect(result!.currency).toBeNull();
  });
});
