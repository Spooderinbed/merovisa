import { describe, it, expect } from "vitest";
import { computeCompleteness } from "@/lib/profiles/completeness";
import type { ProfileSections } from "@/lib/profiles/sections";

describe("computeCompleteness", () => {
  it("returns 0 for empty sections", () => {
    const { pct, status } = computeCompleteness({});
    expect(pct).toBe(0);
    expect(status.personal).toBe("empty");
    expect(status.destination).toBe("empty");
  });

  it("marks a fully-required section as complete", () => {
    const sections: ProfileSections = { personal: { name: "Aarav" } };
    const { status } = computeCompleteness(sections);
    expect(status.personal).toBe("complete");
  });

  it("marks a section with some required fields filled as partial", () => {
    const sections: ProfileSections = { academic: { institution: "TU" } };
    const { status } = computeCompleteness(sections);
    expect(status.academic).toBe("partial");
  });

  it("treats zero-required-fields sections (scholarships) as complete when any value exists", () => {
    expect(computeCompleteness({ scholarships: { profile: ["merit"] } }).status.scholarships).toBe("complete");
    expect(computeCompleteness({}).status.scholarships).toBe("empty");
  });

  it("computes percent as weighted sum / total * 100", () => {
    const sections: ProfileSections = {
      personal: { name: "X" },
      academic: { institution: "TU" },
    };
    expect(computeCompleteness(sections).pct).toBe(12);
  });
});
