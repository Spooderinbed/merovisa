import { describe, test, expect } from "vitest";
import { humanize } from "@/lib/text/humanize";

describe("humanize", () => {
  test("known destinations", () => {
    expect(humanize("australia")).toBe("Australia");
    expect(humanize("uk")).toBe("United Kingdom");
  });
  test("known education levels", () => {
    expect(humanize("higher-secondary")).toBe("+2 / Higher Secondary");
    expect(humanize("bachelors")).toBe("Bachelor's");
  });
  test("known fields of study", () => {
    expect(humanize("computer-science")).toBe("Computer Science");
  });
  test("known funding sources", () => {
    expect(humanize("parents-family")).toBe("Parents / family");
    expect(humanize("scholarship-dependent")).toBe("Scholarship-dependent");
  });
  test("currencies pass through ISO codes", () => {
    expect(humanize("AUD")).toBe("AUD");
  });
  test("empty/null input returns empty string", () => {
    expect(humanize("")).toBe("");
    expect(humanize(null)).toBe("");
    expect(humanize(undefined)).toBe("");
  });
  test("unknown value falls back to Title Case", () => {
    expect(humanize("some-unknown-value")).toBe("Some Unknown Value");
    expect(humanize("snake_case_thing")).toBe("Snake Case Thing");
  });
});
