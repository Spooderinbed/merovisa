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
    [{ section: "intended-study", patch: { level: "masters", field: "computer-science" } }, true],
    [{ section: "intended-study", patch: { level: "phd" } }, false],
    [{ section: "intended-study", patch: { field: "cs" } }, false],
    [{ section: "english", patch: { test: "ielts", overall: 7 } }, true],
    // `overall` is the score in the chosen test's own scale (PTE ≤90, TOEFL ≤120),
    // so a 10 is now valid; the envelope cap is the widest scale (120).
    [{ section: "english", patch: { test: "pte", overall: 58 } }, true],
    [{ section: "english", patch: { overall: 10 } }, true],
    [{ section: "english", patch: { overall: 120 } }, true],
    [{ section: "english", patch: { overall: 121 } }, false],
    [{ section: "gap", patch: { years: 2, reasons: ["worked"] } }, true],
    [{ section: "gap", patch: { years: -1 } }, false],
    [{ section: "work", patch: { title: "Junior Dev", years: 1 } }, true],
    [{ section: "work", patch: { relevance: "tangentially" } }, false],
    [{ section: "finance", patch: { total: 4_500_000, currency: "NPR", source: "education-loan" } }, true],
    [{ section: "finance", patch: { currency: "XYZ" } }, false],
    [{ section: "finance", patch: { source: "loan" } }, false],
    [{ section: "immigration", patch: { refusals: "none", travelled: true } }, true],
    [{ section: "immigration", patch: { refusals: "many" } }, false],
    [{ section: "family", patch: { situation: "alone" } }, true],
    [{ section: "family", patch: { situation: "spouse++" } }, false],
    [{ section: "family", patch: { situation: "spouse-and-kids", children: 2 } }, true],
    [{ section: "family", patch: { children: 0 } }, true],
    [{ section: "family", patch: { children: 10 } }, true],
    [{ section: "family", patch: { children: 11 } }, false],
    [{ section: "family", patch: { children: -1 } }, false],
    [{ section: "family", patch: { children: 1.5 } }, false],
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

describe("IntendedStudyPatch — alsoConsidering disjoint/dedup (MV-102)", () => {
  const parse = (patch: unknown) =>
    ProfileSectionPatchBodySchema.safeParse({ section: "intended-study", patch }).success;

  it("rejects an also-considering list that contains the primary field", () => {
    expect(parse({ field: "computer-science", alsoConsidering: ["computer-science"] })).toBe(false);
  });

  it("rejects a duplicate in the also-considering list", () => {
    expect(parse({ alsoConsidering: ["business", "business"] })).toBe(false);
  });

  it("accepts a valid disjoint pair alongside the primary", () => {
    expect(parse({ field: "computer-science", alsoConsidering: ["business", "nursing"] })).toBe(true);
  });

  it("accepts a disjoint dedup list when no field is present in the same patch", () => {
    // Disjointness can only be checked when the primary is in the same patch;
    // with no field, only dedup + cap apply.
    expect(parse({ alsoConsidering: ["business", "nursing"] })).toBe(true);
  });

  it("rejects more than the cap of two also-considering fields", () => {
    expect(parse({ alsoConsidering: ["business", "nursing", "engineering"] })).toBe(false);
  });
});

describe("FamilyPatch — child count", () => {
  it("preserves an in-range child count through the envelope (not stripped)", () => {
    const r = ProfileSectionPatchBodySchema.safeParse({
      section: "family",
      patch: { situation: "spouse-and-kids", children: 3 },
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.section === "family") {
      expect(r.data.patch.children).toBe(3);
    }
  });
});
