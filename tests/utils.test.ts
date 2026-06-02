import { describe, it, expect } from "vitest";
import { cn, formatNpr, formatUsd, yearsBetween } from "@/lib/utils";

describe("cn", () => {
  it("merges class names with tailwind precedence", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-ink", undefined, false && "hidden", "text-ink-soft")).toBe("text-ink-soft");
  });
});

describe("formatNpr", () => {
  it("formats with Nepali lakh notation under 1 crore", () => {
    expect(formatNpr(4500000)).toBe("NPR 45 lakh");
  });

  it("formats with crore notation at or above 1 crore", () => {
    expect(formatNpr(15000000)).toBe("NPR 1.5 crore");
  });
});

describe("formatUsd", () => {
  it("formats with k suffix above 1000", () => {
    expect(formatUsd(33000)).toBe("USD 33k");
  });
});

describe("yearsBetween", () => {
  it("returns positive integers for past graduations", () => {
    const now = new Date().getFullYear();
    expect(yearsBetween(now - 3)).toBe(3);
  });
});
