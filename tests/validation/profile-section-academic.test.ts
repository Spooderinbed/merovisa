import { describe, test, expect } from "vitest";
import { ProfileSectionPatchBodySchema } from "@/lib/validation/profile-section";

// The route persists exactly what ProfileSectionPatchBodySchema produces, so the
// CGPA→percentage normalization must happen at this boundary — not be left for a
// downstream reader (which is the bug: the matches adapter reads gradePercent raw).
describe("academic section patch normalization (schema boundary)", () => {
  test("normalizes a submitted CGPA to a true percentage and drops gradeSystem", () => {
    const result = ProfileSectionPatchBodySchema.safeParse({
      section: "academic",
      patch: { degree: "bachelors", gradePercent: 3.5, gradeSystem: "cgpa-4" },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.patch).toStrictEqual({
      degree: "bachelors",
      gradePercent: 87.5,
      gradeSystem: undefined,
    });
  });

  test("leaves an already-percentage grade unchanged", () => {
    const result = ProfileSectionPatchBodySchema.safeParse({
      section: "academic",
      patch: { gradePercent: 78 },
    });
    expect(result.success).toBe(true);
    if (!result.success || result.data.section !== "academic") return;
    expect(result.data.patch.gradePercent).toBe(78);
    expect(result.data.patch.gradeSystem).toBeUndefined();
  });

  test("still rejects an out-of-range grade before normalization", () => {
    const result = ProfileSectionPatchBodySchema.safeParse({
      section: "academic",
      patch: { gradePercent: 120, gradeSystem: "cgpa-4" },
    });
    expect(result.success).toBe(false);
  });
});
