import { describe, it, expect } from "vitest";
import { cn, formatNpr, formatUsd, yearsBetween } from "@/lib/utils";

describe("cn", () => {
  it("merges class names with tailwind precedence", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-ink", undefined, false && "hidden", "text-ink-soft")).toBe("text-ink-soft");
  });

  // MV-106: the type scale (text-body, text-caption, …) is registered with
  // tailwind-merge as font-size utilities. Without this, twMerge groups a bare
  // size token with text-<colour> and silently drops the size wherever both
  // meet in one cn() call. This guard fails if the extension is reverted.
  it("keeps a scale font-size beside a colour utility (not treated as a colour)", () => {
    expect(cn("text-caption", "text-strong")).toBe("text-caption text-strong");
    expect(cn("text-title", "text-ink-soft")).toBe("text-title text-ink-soft");
  });

  it("dedupes two scale sizes and lets an arbitrary size override the scale", () => {
    expect(cn("text-small", "text-body")).toBe("text-body");
    expect(cn("text-small", "text-[13px]")).toBe("text-[13px]");
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
