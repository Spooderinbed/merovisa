import { describe, it, expect } from "vitest";
import { PROFILE_GROUPS, deriveGroupStatus, summarizeGroup } from "@/components/profile/groups";
import { SECTION_KEYS, type SectionKey } from "@/lib/profiles/sections";
import type { SectionStatus } from "@/lib/profiles/completeness";

const STATUS_ALL_EMPTY = Object.fromEntries(SECTION_KEYS.map((k) => [k, "empty"])) as Record<
  SectionKey,
  SectionStatus
>;

describe("PROFILE_GROUPS", () => {
  it("renders the 8 approved groups with the approved display names, in order", () => {
    expect(PROFILE_GROUPS.map((g) => g.title)).toEqual([
      "About you",
      "Destination & intake",
      "Academic background",
      "Study & career goals",
      "English proficiency",
      "Work & study gap",
      "Money & scholarships",
      "Visa history",
    ]);
  });

  it("covers every storage section exactly once — storage keys never change", () => {
    const covered = PROFILE_GROUPS.flatMap((g) => [...g.sections]).sort();
    expect(covered).toEqual([...SECTION_KEYS].sort());
  });

  it("maps the approved storage sections to each group", () => {
    const byTitle = Object.fromEntries(PROFILE_GROUPS.map((g) => [g.title, [...g.sections]]));
    expect(byTitle["About you"]).toEqual(["personal", "family"]);
    expect(byTitle["Destination & intake"]).toEqual(["destination", "deal-breakers"]);
    expect(byTitle["Academic background"]).toEqual(["academic"]);
    expect(byTitle["Study & career goals"]).toEqual(["intended-study", "career"]);
    expect(byTitle["English proficiency"]).toEqual(["english"]);
    expect(byTitle["Work & study gap"]).toEqual(["work", "gap"]);
    expect(byTitle["Money & scholarships"]).toEqual(["finance", "scholarships"]);
    expect(byTitle["Visa history"]).toEqual(["immigration"]);
  });
});

describe("deriveGroupStatus", () => {
  it("is complete only when every member section is complete", () => {
    expect(
      deriveGroupStatus(["personal", "family"], { ...STATUS_ALL_EMPTY, personal: "complete", family: "complete" }),
    ).toBe("complete");
  });

  it("is partial when members mix complete and not started", () => {
    expect(
      deriveGroupStatus(["personal", "family"], { ...STATUS_ALL_EMPTY, personal: "complete" }),
    ).toBe("partial");
  });

  it("is partial when any member is partial", () => {
    expect(
      deriveGroupStatus(["work", "gap"], { ...STATUS_ALL_EMPTY, gap: "partial" }),
    ).toBe("partial");
  });

  it("is not started when every member is empty", () => {
    expect(deriveGroupStatus(["finance", "scholarships"], STATUS_ALL_EMPTY)).toBe("empty");
  });
});

describe("summarizeGroup", () => {
  const group = (title: string) => PROFILE_GROUPS.find((g) => g.title === title)!;

  it("joins member section summaries with a middle dot, skipping empty ones", () => {
    const text = summarizeGroup(group("About you"), {
      personal: { name: "Aarav Sharma", age: 23 },
    });
    expect(text).toBe("Aarav Sharma · 23");
  });

  it("keeps intake out of About you — it renders under Destination & intake", () => {
    const sections = {
      personal: { name: "Aarav", intakeIso: "2027-07-01" },
      destination: { primary: "australia" as const },
    };
    expect(summarizeGroup(group("About you"), sections)).toBe("Aarav");
    expect(summarizeGroup(group("Destination & intake"), sections)).toBe(
      "Australia · 2027-07-01 intake",
    );
  });

  it("summarizes a legacy stored \"us\" destination as United States", () => {
    expect(
      summarizeGroup(group("Destination & intake"), {
        destination: { primary: "us" as never },
      }),
    ).toBe("United States");
  });

  it("composes multi-section summaries across members", () => {
    const text = summarizeGroup(group("Money & scholarships"), {
      finance: { source: "education-loan" },
      scholarships: { profile: ["merit", "regional"] },
    });
    expect(text).toBe("Education loan · proof not uploaded · merit, regional");
  });
});
