import { describe, it, expect } from "vitest";
import { LeadSchema } from "@/lib/validation/lead";

describe("LeadSchema", () => {
  it("accepts a valid email + assessment uuid", () => {
    const r = LeadSchema.safeParse({
      email: "student@example.com",
      assessmentId: "11111111-1111-1111-1111-111111111111",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a bad email", () => {
    expect(LeadSchema.safeParse({ email: "nope", assessmentId: "11111111-1111-1111-1111-111111111111" }).success).toBe(false);
  });

  it("rejects a non-uuid assessmentId", () => {
    expect(LeadSchema.safeParse({ email: "a@b.com", assessmentId: "x" }).success).toBe(false);
  });
});
