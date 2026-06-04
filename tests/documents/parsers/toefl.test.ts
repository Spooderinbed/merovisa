import { describe, it, expect } from "vitest";
import { parseToefl } from "@/lib/documents/parsers/toefl";

describe("parseToefl", () => {
  it("extracts all scores from a standard TOEFL iBT score report", () => {
    const text = `
      TOEFL iBT Score Report
      Test Taker: Amit Kumar
      Total Score: 100
      Reading: 27
      Listening: 26
      Speaking: 24
      Writing: 23
    `;
    const result = parseToefl(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(100);
    expect(result!.reading).toBe(27);
    expect(result!.listening).toBe(26);
    expect(result!.speaking).toBe(24);
    expect(result!.writing).toBe(23);
  });

  it("handles compact format", () => {
    const text = `Total Score:90 Reading:25 Listening:23 Writing:20 Speaking:22`;
    const result = parseToefl(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(90);
  });

  it("returns null for garbage text", () => {
    expect(parseToefl("Passport: Nepal DOB: 1995-03-10")).toBeNull();
    expect(parseToefl("")).toBeNull();
  });

  it("returns null when total score is missing", () => {
    const text = `Reading: 25 Listening: 23 Writing: 22 Speaking: 20`;
    expect(parseToefl(text)).toBeNull();
  });

  it("returns null when any sub-score is missing", () => {
    const text = `Total Score: 88 Reading: 25 Listening: 23 Writing: 22`;
    // Speaking missing
    expect(parseToefl(text)).toBeNull();
  });

  it("returns null when total score exceeds 120", () => {
    const text = `Total Score: 125 Reading: 30 Listening: 30 Writing: 30 Speaking: 35`;
    expect(parseToefl(text)).toBeNull();
  });

  it("returns null when sub-score exceeds 30", () => {
    const text = `Total Score: 100 Reading: 35 Listening: 25 Writing: 22 Speaking: 20`;
    expect(parseToefl(text)).toBeNull();
  });

  it("accepts boundary values (0 sub-score, 120 total)", () => {
    const text = `Total Score: 120 Reading: 30 Listening: 30 Writing: 30 Speaking: 30`;
    const result = parseToefl(text);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(120);
  });
});
