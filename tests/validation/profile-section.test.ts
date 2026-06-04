import { describe, it, expect } from "vitest";
import { PersonalSectionPatchSchema, ProfileSectionPatchBodySchema } from "@/lib/validation/profile-section";

describe("PersonalSectionPatchSchema", () => {
  it("accepts a full personal patch", () => {
    const r = PersonalSectionPatchSchema.safeParse({
      name: "Aarav Sharma", age: 23, intakeIso: "2027-07-01",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a partial patch", () => {
    expect(PersonalSectionPatchSchema.safeParse({ name: "Aarav" }).success).toBe(true);
  });

  it("rejects nonsense age", () => {
    expect(PersonalSectionPatchSchema.safeParse({ age: 5 }).success).toBe(false);
    expect(PersonalSectionPatchSchema.safeParse({ age: 200 }).success).toBe(false);
  });

  it("rejects bad ISO date", () => {
    expect(PersonalSectionPatchSchema.safeParse({ intakeIso: "tomorrow" }).success).toBe(false);
  });
});

describe("ProfileSectionPatchBodySchema (envelope)", () => {
  it("accepts {section: 'personal', patch: { name }}", () => {
    expect(ProfileSectionPatchBodySchema.safeParse({
      section: "personal", patch: { name: "Aarav" },
    }).success).toBe(true);
  });

  it("rejects unknown section", () => {
    expect(ProfileSectionPatchBodySchema.safeParse({
      section: "not-a-section", patch: {},
    }).success).toBe(false);
  });
});

describe("ProfileSectionPatchBodySchema — other sections", () => {
  type Case = [unknown, boolean];
  const cases: Case[] = [
    [{ section: "destination", patch: { primary: "australia" } }, true],
    [{ section: "destination", patch: { primary: "" } }, false],
    [{ section: "academic", patch: { institution: "TU", gradePercent: 72 } }, true],
    [{ section: "academic", patch: { gradePercent: 150 } }, false],
    [{ section: "intended-study", patch: { level: "masters", field: "cs" } }, true],
    [{ section: "intended-study", patch: { level: "phd" } }, false],
    [{ section: "english", patch: { test: "ielts", overall: 7 } }, true],
    [{ section: "english", patch: { overall: 10 } }, false],
    [{ section: "gap", patch: { years: 2, reasons: ["worked"] } }, true],
    [{ section: "gap", patch: { years: -1 } }, false],
    [{ section: "work", patch: { title: "Junior Dev", years: 1 } }, true],
    [{ section: "work", patch: { relevance: "tangentially" } }, false],
    [{ section: "finance", patch: { total: 4_500_000, currency: "NPR", source: "loan" } }, true],
    [{ section: "finance", patch: { currency: "XYZ" } }, false],
    [{ section: "immigration", patch: { refusals: "none", travelled: true } }, true],
    [{ section: "immigration", patch: { refusals: "many" } }, false],
    [{ section: "family", patch: { situation: "alone" } }, true],
    [{ section: "family", patch: { situation: "spouse++" } }, false],
    [{ section: "career", patch: { goal: "permanent-residency" } }, true],
    [{ section: "career", patch: { goal: "rich" } }, false],
    [{ section: "scholarships", patch: { profile: ["merit", "minority"] } }, true],
    [{ section: "scholarships", patch: { profile: ["", "x"] } }, false],
    [{ section: "deal-breakers", patch: { mustHaves: ["PR-friendly"] } }, true],
    [{ section: "deal-breakers", patch: { mustHaves: [""] } }, false],
  ];

  for (const [body, expected] of cases) {
    it(`${expected ? "accepts" : "rejects"} ${JSON.stringify(body)}`, () => {
      expect(ProfileSectionPatchBodySchema.safeParse(body).success).toBe(expected);
    });
  }
});
