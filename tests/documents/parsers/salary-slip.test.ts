import { describe, it, expect } from "vitest";
import { parseSalarySlip } from "@/lib/documents/parsers/salary-slip";

describe("parseSalarySlip", () => {
  it("extracts net pay and employer from a standard salary slip", () => {
    const text = `
      Salary Slip - June 2024
      Company: TechCorp Nepal Pvt. Ltd.
      Employee: Binod Raj Poudel
      Gross Salary: NPR 85,000
      Deductions: NPR 12,000
      Net Pay: NPR 73,000
    `;
    const result = parseSalarySlip(text);
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(73000);
    expect(result!.employer).toContain("TechCorp Nepal");
  });

  it("extracts gross pay when net pay is not labeled", () => {
    const text = `
      Employer: Nepal Airlines
      Gross Pay: 120,000.00
    `;
    const result = parseSalarySlip(text);
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(120000.0);
  });

  it("extracts total salary label", () => {
    const text = `
      Organization: Himalayan Bank
      Total Salary: 65,500
    `;
    const result = parseSalarySlip(text);
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(65500);
  });

  it("returns null for garbage text", () => {
    expect(parseSalarySlip("Passport: Nepal Date of Birth: 1995-03-10")).toBeNull();
    expect(parseSalarySlip("")).toBeNull();
  });

  it("returns null when pay amount is zero or negative", () => {
    expect(parseSalarySlip("Net Pay: 0")).toBeNull();
  });

  it("handles take home pay label", () => {
    const text = `Company: Software House Take Home: 55,000`;
    const result = parseSalarySlip(text);
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(55000);
  });

  it("returns null employer when no company keyword found", () => {
    const text = `Net Pay: 40,000`;
    const result = parseSalarySlip(text);
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(40000);
    expect(result!.employer).toBeNull();
  });

  it("handles amounts without commas", () => {
    const text = `Employer: ABC Corp Total Earnings: 98500`;
    const result = parseSalarySlip(text);
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(98500);
  });
});
