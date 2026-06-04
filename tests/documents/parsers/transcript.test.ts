import { describe, it, expect } from "vitest";
import { parseTranscript } from "@/lib/documents/parsers/transcript";

describe("parseTranscript", () => {
  it("extracts data from a GPA-based transcript", () => {
    const text = `
      Tribhuvan University
      Bachelor of Science in Computer Science
      CGPA: 3.6 / 4.0
      Student: Ram Prasad Adhikari
    `;
    const result = parseTranscript(text);
    expect(result).not.toBeNull();
    expect(result!.gradePercent).toBe(90);
    expect(result!.institution).toContain("Tribhuvan University");
    expect(result!.degree).toBe("bachelors");
  });

  it("extracts data from a percentage-based transcript", () => {
    const text = `
      Kathmandu University
      Bachelor of Engineering
      Percentage: 78.5%
    `;
    const result = parseTranscript(text);
    expect(result).not.toBeNull();
    expect(result!.gradePercent).toBe(78.5);
    expect(result!.degree).toBe("bachelors");
  });

  it("extracts masters degree from transcript", () => {
    const text = `
      Pokhara University
      Master of Business Administration
      CGPA: 3.8 / 4.0
    `;
    const result = parseTranscript(text);
    expect(result).not.toBeNull();
    expect(result!.degree).toBe("masters");
    expect(result!.gradePercent).toBe(95);
  });

  it("returns null for garbage text", () => {
    expect(parseTranscript("Salary slip for June 2024 Net Pay: 50000")).toBeNull();
    expect(parseTranscript("")).toBeNull();
  });

  it("returns null when no grade information is present", () => {
    const text = `Tribhuvan University Bachelor of Science Student: John Doe`;
    expect(parseTranscript(text)).toBeNull();
  });

  it("returns null when gradePercent exceeds 100", () => {
    // GPA 5.0 / 4.0 scale → 125% — invalid
    const text = `University of X Bachelor of Arts GPA: 5.0 / 4.0`;
    expect(parseTranscript(text)).toBeNull();
  });

  it("handles GPA without explicit scale (defaults to 4.0)", () => {
    const text = `College of Engineering Bachelor of Tech GPA: 2.8`;
    const result = parseTranscript(text);
    expect(result).not.toBeNull();
    expect(result!.gradePercent).toBe(70);
  });

  it("returns null institution when university keyword absent", () => {
    const text = `Bachelor of Arts Percentage: 65`;
    const result = parseTranscript(text);
    expect(result).not.toBeNull();
    expect(result!.institution).toBeNull();
  });
});
