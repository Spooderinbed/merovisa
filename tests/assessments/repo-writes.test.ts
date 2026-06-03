import { describe, it, expect } from "vitest";
import { createAnonymousAssessment, createLead } from "@/lib/assessments/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("createAnonymousAssessment", () => {
  it("inserts a row and returns the new id", async () => {
    const { client, calls } = fakeSupabase({ data: { id: "new-id" }, error: null });
    const id = await createAnonymousAssessment(client, {
      profile: { homeCountry: "Nepal" },
      result: { result: { verdict: "possible" } },
      ruleVersion: "v0.1.0",
      expiresAt: "2026-06-06T00:00:00.000Z",
    });
    expect(id).toBe("new-id");
    expect(calls[0]).toEqual({ method: "from", args: ["assessments"] });
    expect(calls.some((c) => c.method === "insert")).toBe(true);
  });

  it("returns null when the insert errors", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    const id = await createAnonymousAssessment(client, {
      profile: {},
      result: {},
      ruleVersion: "v0.1.0",
      expiresAt: "2026-06-06T00:00:00.000Z",
    });
    expect(id).toBeNull();
  });
});

describe("createLead", () => {
  it("upserts on the (assessment_id, email) conflict target, ignoring duplicates", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    await createLead(client, { email: "a@b.com", assessmentId: "aid" });
    expect(calls[0]).toEqual({ method: "from", args: ["leads"] });
    const upsert = calls.find((c) => c.method === "upsert");
    expect(upsert?.args[1]).toEqual({ onConflict: "assessment_id,email", ignoreDuplicates: true });
  });
});
