import { describe, it, expect } from "vitest";
import { parseOfferLetter } from "@/lib/documents/parsers/offer-letter";

describe("parseOfferLetter", () => {
  it("extracts university, program, and intake from a standard offer letter", () => {
    const text = `
      University of Melbourne
      Faculty of Engineering and Information Technology

      Dear Suresh Thapa,

      We are pleased to offer you a place in:
      Program: Master of Information Technology
      Commencement Date: February 2025
    `;
    const result = parseOfferLetter(text);
    expect(result).not.toBeNull();
    expect(result!.university).toContain("Melbourne");
    expect(result!.program).toContain("Information Technology");
    expect(result!.intake).toContain("February 2025");
  });

  it("extracts intake from start date label", () => {
    const text = `
      University of Sydney
      Course: Bachelor of Business
      Start Date: July 2025
    `;
    const result = parseOfferLetter(text);
    expect(result).not.toBeNull();
    expect(result!.intake).toContain("July 2025");
  });

  it("extracts intake from intake label", () => {
    const text = `
      RMIT University
      Degree: Master of Science
      Intake: Semester 1, 2025
    `;
    const result = parseOfferLetter(text);
    expect(result).not.toBeNull();
    expect(result!.intake).toContain("Semester 1, 2025");
  });

  it("returns null for garbage text", () => {
    expect(parseOfferLetter("Bank statement Balance: NPR 500,000")).toBeNull();
    expect(parseOfferLetter("")).toBeNull();
    expect(parseOfferLetter("Random text without any relevant info")).toBeNull();
  });

  it("returns null when both university and program are missing", () => {
    const text = `Commencement Date: March 2025 Student: John Doe`;
    expect(parseOfferLetter(text)).toBeNull();
  });

  it("returns result with null intake when no date is present", () => {
    const text = `
      University of Queensland
      Program: Bachelor of Science
    `;
    const result = parseOfferLetter(text);
    expect(result).not.toBeNull();
    expect(result!.intake).toBeNull();
  });

  it("handles 'commence' variant of intake keyword", () => {
    const text = `
      Monash University
      Course: Master of Engineering
      Commencing: March 2026
    `;
    const result = parseOfferLetter(text);
    expect(result).not.toBeNull();
    expect(result!.intake).toContain("March 2026");
  });

  it("returns result with university only when program keyword absent", () => {
    const text = `
      University of Western Australia
      Commencing: Semester 2, 2025
    `;
    const result = parseOfferLetter(text);
    expect(result).not.toBeNull();
    expect(result!.university).toContain("Western Australia");
  });
});
