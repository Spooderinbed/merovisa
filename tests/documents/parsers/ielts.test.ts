import { describe, it, expect } from "vitest";
import { parseIelts } from "@/lib/documents/parsers/ielts";

describe("parseIelts", () => {
  it("extracts all scores from a standard IELTS scorecard layout", () => {
    const text = `
      IELTS Test Report Form
      Candidate Name: John Doe
      Overall Band Score: 7.5
      Listening: 8.0
      Reading: 7.5
      Writing: 6.5
      Speaking: 7.5
    `;
    const result = parseIelts(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(7.5);
    expect(result!.listening).toBe(8.0);
    expect(result!.reading).toBe(7.5);
    expect(result!.writing).toBe(6.5);
    expect(result!.speaking).toBe(7.5);
  });

  it("extracts scores from compact format", () => {
    const text = `Overall Score:6.5 Listening:6.0 Reading:7.0 Writing:6.0 Speaking:7.0`;
    const result = parseIelts(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(6.5);
    expect(result!.listening).toBe(6.0);
    expect(result!.reading).toBe(7.0);
  });

  it("returns null for garbage text", () => {
    expect(parseIelts("Invoice #12345 Total: $500.00 Thank you")).toBeNull();
    expect(parseIelts("")).toBeNull();
    expect(parseIelts("random text with no scores at all")).toBeNull();
  });

  it("returns null when overall score is missing", () => {
    const text = `Listening: 7.5 Reading: 8.0 Writing: 6.5 Speaking: 7.0`;
    expect(parseIelts(text)).toBeNull();
  });

  it("returns null when any sub-score is missing", () => {
    const text = `Overall Band Score: 7.0 Listening: 7.5 Reading: 7.0 Speaking: 6.5`;
    // Writing is missing
    expect(parseIelts(text)).toBeNull();
  });

  it("returns null when scores are out of range", () => {
    const text = `Overall Band Score: 10 Listening: 11 Reading: 8 Writing: 7 Speaking: 9`;
    expect(parseIelts(text)).toBeNull();
  });

  it("handles integer scores without decimal", () => {
    const text = `Overall Band Score: 8 Listening: 9 Reading: 8 Writing: 7 Speaking: 8`;
    const result = parseIelts(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(8);
    expect(result!.listening).toBe(9);
  });

  it("handles 'Overall band score' label variant", () => {
    const text = `
      Overall band score 7.0
      Listening 6.5
      Reading 7.5
      Writing 6.5
      Speaking 7.5
    `;
    const result = parseIelts(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(7.0);
  });
});
