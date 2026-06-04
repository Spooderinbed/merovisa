import { describe, it, expect } from "vitest";
import { parseEmploymentLetter } from "@/lib/documents/parsers/employment-letter";

describe("parseEmploymentLetter", () => {
  it("extracts title, employer, and years from a standard employment letter", () => {
    const text = `
      To Whom It May Concern,

      This is to certify that Mr. Rajesh Shrestha has been employed with our
      Company: TechCorp Nepal Pvt. Ltd.
      Position: Senior Software Engineer
      He has been working with us for 3 years.
    `;
    const result = parseEmploymentLetter(text);
    expect(result).not.toBeNull();
    expect(result!.title).toContain("Senior Software Engineer");
    expect(result!.employer).toContain("TechCorp Nepal");
    expect(result!.years).toBe(3);
  });

  it("extracts years from 'since YYYY' format", () => {
    const text = `
      Employer: Nepal Telecom
      Designation: Network Engineer
      The employee has been with us since 2018.
    `;
    const result = parseEmploymentLetter(text);
    expect(result).not.toBeNull();
    expect(result!.years).toBe(new Date().getFullYear() - 2018);
  });

  it("extracts role and employer without years", () => {
    const text = `
      Role: Marketing Manager
      Organization: ABC Trading House
    `;
    const result = parseEmploymentLetter(text);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Marketing Manager");
    expect(result!.employer).toContain("ABC Trading House");
    expect(result!.years).toBeNull();
  });

  it("returns null for garbage text", () => {
    expect(parseEmploymentLetter("IELTS Overall: 7.5 Listening: 8.0")).toBeNull();
    expect(parseEmploymentLetter("")).toBeNull();
    expect(parseEmploymentLetter("Random text without any relevant info here")).toBeNull();
  });

  it("returns null years when value exceeds 40", () => {
    const text = `Position: Director Company: OldCorp 45 years of service`;
    const result = parseEmploymentLetter(text);
    expect(result).not.toBeNull();
    expect(result!.years).toBeNull();
  });

  it("handles 'employed as' label variant", () => {
    const text = `
      Employed as: Data Analyst
      Firm: Analytics Nepal
      Duration: 2 years
    `;
    const result = parseEmploymentLetter(text);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Data Analyst");
    expect(result!.years).toBe(2);
  });

  it("returns null employer when no company keyword found", () => {
    const text = `Position: Accountant 5 years experience`;
    const result = parseEmploymentLetter(text);
    expect(result).not.toBeNull();
    expect(result!.employer).toBeNull();
  });
});
