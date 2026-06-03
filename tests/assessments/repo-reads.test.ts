import { describe, it, expect } from "vitest";
import { getPrimaryAssessmentForUser, listAssessmentsForUser } from "@/lib/assessments/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("getPrimaryAssessmentForUser", () => {
  it("returns the user's primary assessment when one exists", async () => {
    const row = { id: "a1", owner: "u1", is_primary: true, destination_id: "australia" };
    const { client, calls } = fakeSupabase({ data: row, error: null });
    const out = await getPrimaryAssessmentForUser(client, "u1");
    expect(out).toEqual(row);
    expect(calls.some((c) => c.method === "from" && c.args[0] === "assessments")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner" && c.args[1] === "u1")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "is_primary" && c.args[1] === true)).toBe(true);
  });

  it("returns null when no primary exists", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getPrimaryAssessmentForUser(client, "u1")).toBeNull();
  });
});

describe("listAssessmentsForUser", () => {
  it("returns all assessments owned by the user, newest first", async () => {
    const rows = [
      { id: "a2", owner: "u1", created_at: "2026-06-01T00:00:00Z" },
      { id: "a1", owner: "u1", created_at: "2026-05-01T00:00:00Z" },
    ];
    const { client, calls } = fakeSupabase({ data: rows, error: null });
    const out = await listAssessmentsForUser(client, "u1");
    expect(out).toEqual(rows);
    expect(calls.some((c) => c.method === "order" && c.args[0] === "created_at" && (c.args[1] as { ascending: boolean }).ascending === false)).toBe(true);
  });

  it("returns [] on error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    expect(await listAssessmentsForUser(client, "u1")).toEqual([]);
  });
});
