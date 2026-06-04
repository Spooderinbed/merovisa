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

  it("fills missing sub-scores with overall", () => {
    const text = `Overall Band Score: 7.0 Listening: 7.5 Speaking: 6.5`;
    const result = parseIelts(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(7.0);
    expect(result!.listening).toBe(7.5);
    expect(result!.reading).toBe(7.0);
    expect(result!.writing).toBe(7.0);
    expect(result!.speaking).toBe(6.5);
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

  it("handles real Tesseract OCR output from IELTS scorecard photo", () => {
    const ocrText = `Test Report Form ACADEMIC
NOTE Admission to undergraduate and pos! graduate courses should be based on the ACADEMIC Reading and Whiting Modules.
Centre Number Date 20/0CT/2022 Candidate Number 099543
Candidate Details
Date of Birth Sex (M/F) [] Scheme Code | Private Candidate
Country of
Nationality BANGLADESH
First Language BANGALI
Test Results
| Overall | | CEFR |
Listening Reading ) Writing 5 Speaking | 6.0 Band 5.0 Level !
Score ve
Administrator Comments Centre stamp Validation stamp`;
    const result = parseIelts(ocrText);
    expect(result).not.toBeNull();
    expect(result!.overall).toBeGreaterThanOrEqual(5.0);
    expect(result!.writing).toBeGreaterThanOrEqual(5.0);
    expect(result!.speaking).toBe(6.0);
  });

  it("handles 'Band X.X' without 'Overall' prefix", () => {
    const text = `Listening 7.0 Reading 6.5 Writing 6.5 Speaking 7.0 Band 7.0`;
    const result = parseIelts(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(7.0);
  });
});
