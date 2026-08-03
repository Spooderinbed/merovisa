import { describe, it, expect } from "vitest";
import { claimAssessment, getAssessmentById, getAssessmentClaimState } from "@/lib/assessments/repo";
import { AssessmentClaimError } from "@/lib/assessments/errors";
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

  // MV-130: a DB/network error is NOT "no row matched". Collapsing it to `false` is
  // what let the sign-in seam tell a student their still-recoverable assessment was gone.
  it("throws a typed claim error on a DB failure, so callers can offer a retry", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "connection reset" } });
    await expect(
      claimAssessment(client, { id: "aid", userId: "u", nowIso: "2026-06-03T00:00:00.000Z" }),
    ).rejects.toBeInstanceOf(AssessmentClaimError);
  });
});

describe("getAssessmentClaimState", () => {
  const NOW = "2026-06-03T00:00:00.000Z";

  it("returns null when the row no longer exists (purged/deleted)", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getAssessmentClaimState(client, "aid", NOW)).toBeNull();
  });

  it("reports the owner and that the row is still live", async () => {
    const { client } = fakeSupabase({ data: { owner: "u1", expires_at: "2026-06-05T00:00:00.000Z" }, error: null });
    expect(await getAssessmentClaimState(client, "aid", NOW)).toEqual({ owner: "u1", expired: false });
  });

  it("marks an unclaimed row past its expiry as expired", async () => {
    const { client } = fakeSupabase({ data: { owner: null, expires_at: "2026-06-01T00:00:00.000Z" }, error: null });
    expect(await getAssessmentClaimState(client, "aid", NOW)).toEqual({ owner: null, expired: true });
  });

  it("returns null on a read error rather than guessing", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    expect(await getAssessmentClaimState(client, "aid", NOW)).toBeNull();
  });
});

describe("getAssessmentById", () => {
  it("returns the row when RLS allows it", async () => {
    const row = { id: "aid", owner: "user-1", result: { result: { verdict: "possible" } } };
    const { client } = fakeSupabase({ data: row, error: null });
    const got = await getAssessmentById(client, "aid");
    expect(got).toEqual(row);
  });

  it("returns null when not found / not owner", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getAssessmentById(client, "aid")).toBeNull();
  });
});
