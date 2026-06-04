import { describe, it, expect } from "vitest";
import { parsePte } from "@/lib/documents/parsers/pte";

describe("parsePte", () => {
  it("extracts all scores from a standard PTE score report", () => {
    const text = `
      PTE Academic Score Report
      Candidate: Jane Smith
      Overall Score: 79
      Listening: 82
      Reading: 75
      Writing: 76
      Speaking: 84
    `;
    const result = parsePte(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(79);
    expect(result!.listening).toBe(82);
    expect(result!.reading).toBe(75);
    expect(result!.writing).toBe(76);
    expect(result!.speaking).toBe(84);
  });

  it("handles compact inline format", () => {
    const text = `Overall:65 Listening:60 Reading:70 Writing:62 Speaking:68`;
    const result = parsePte(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(65);
  });

  it("returns null for garbage text", () => {
    expect(parsePte("Bank statement July 2024 Balance: 50000")).toBeNull();
    expect(parsePte("")).toBeNull();
  });

  it("returns null when overall score is missing", () => {
    const text = `Listening: 70 Reading: 65 Writing: 68 Speaking: 72`;
    expect(parsePte(text)).toBeNull();
  });

  it("returns null when any sub-score is missing", () => {
    const text = `Overall Score: 70 Listening: 75 Reading: 68 Speaking: 72`;
    // Writing missing
    expect(parsePte(text)).toBeNull();
  });

  it("returns null when scores are out of valid PTE range (10-90)", () => {
    const text = `Overall Score: 95 Listening: 95 Reading: 95 Writing: 95 Speaking: 95`;
    expect(parsePte(text)).toBeNull();
  });

  it("accepts boundary scores of 10 and 90", () => {
    const text = `Overall Score: 90 Listening: 10 Reading: 90 Writing: 10 Speaking: 90`;
    const result = parsePte(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(90);
    expect(result!.listening).toBe(10);
  });
});
