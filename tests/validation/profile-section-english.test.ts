import { describe, test, expect } from "vitest";
import { ProfileSectionPatchBodySchema } from "@/lib/validation/profile-section";

describe("English section patch with per-band scores", () => {
  test("accepts per-band scores", () => {
    const result = ProfileSectionPatchBodySchema.safeParse({
      section: "english",
      patch: { listening: 7.5, reading: 6.5, writing: 6.5, speaking: 7.0 },
    });
    expect(result.success).toBe(true);
  });

  test("rejects band score above 9", () => {
    const result = ProfileSectionPatchBodySchema.safeParse({
      section: "english",
      patch: { listening: 10 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects band score below 0", () => {
    const result = ProfileSectionPatchBodySchema.safeParse({
      section: "english",
      patch: { listening: -1 },
    });
    expect(result.success).toBe(false);
  });

  test("accepts mix of overall and band scores", () => {
    const result = ProfileSectionPatchBodySchema.safeParse({
      section: "english",
      patch: { test: "ielts", overall: 7.0, listening: 7.5, reading: 6.5, writing: 6.5, speaking: 7.0, reportUploaded: true },
    });
    expect(result.success).toBe(true);
  });
});
