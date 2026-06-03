import { describe, it, expect } from "vitest";
import { claimAssessment, getOwnedAssessment } from "@/lib/assessments/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("claimAssessment", () => {
  it("claims only an unowned, unexpired row and reports success", async () => {
    const { client, calls } = fakeSupabase({ data: [{ id: "aid" }], error: null });
    const claimed = await claimAssessment(client, {
      id: "aid",
      userId: "user-1",
      nowIso: "2026-06-03T00:00:00.000Z",
    });
    expect(claimed).toBe(true);
    expect(calls.some((c) => c.method === "update")).toBe(true);
    expect(calls.some((c) => c.method === "is" && c.args[0] === "owner" && c.args[1] === null)).toBe(true);
    expect(calls.some((c) => c.method === "gt" && c.args[0] === "expires_at")).toBe(true);
  });

  it("reports failure when no row matched (already claimed or expired)", async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    const claimed = await claimAssessment(client, { id: "aid", userId: "u", nowIso: "2026-06-03T00:00:00.000Z" });
    expect(claimed).toBe(false);
  });
});

describe("getOwnedAssessment", () => {
  it("returns the row when RLS allows it", async () => {
    const row = { id: "aid", owner: "user-1", result: { result: { verdict: "possible" } } };
    const { client } = fakeSupabase({ data: row, error: null });
    const got = await getOwnedAssessment(client, "aid");
    expect(got).toEqual(row);
  });

  it("returns null when not found / not owner", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getOwnedAssessment(client, "aid")).toBeNull();
  });
});
