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
      section: "academic", patch: {},
    }).success).toBe(false);
  });
});
