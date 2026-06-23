import { describe, it, expect } from "vitest";
import { getRecoverableAssessment } from "@/lib/assessments/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

const NOW = "2026-06-23T00:00:00.000Z";
const FUTURE = "2999-01-01T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";

describe("getRecoverableAssessment", () => {
  it("returns an unclaimed, unexpired row and scopes the query to that predicate", async () => {
    const row = { id: "aid", owner: null, expires_at: FUTURE, result: { result: { verdict: "possible" } } };
    const { client, calls } = fakeSupabase({ data: row, error: null });

    const got = await getRecoverableAssessment(client, "aid", NOW);

    expect(got).toEqual(row);
    // The predicate must live in the query (the admin client bypasses RLS, so this
    // is the gate) — keyed by id, unclaimed, and unexpired.
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === "aid")).toBe(true);
    expect(calls.some((c) => c.method === "is" && c.args[0] === "owner" && c.args[1] === null)).toBe(true);
    expect(calls.some((c) => c.method === "gt" && c.args[0] === "expires_at" && c.args[1] === NOW)).toBe(true);
  });

  it("returns null when the query matches nothing (missing id)", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getRecoverableAssessment(client, "aid", NOW)).toBeNull();
  });

  it("returns null for a claimed row even if it slips past the query filter (app-side guard)", async () => {
    // Defense in depth: prove the guard rejects a claimed row independent of the
    // query predicate, so a future query-filter regression can't leak owned PII.
    const claimed = { id: "aid", owner: "user-1", expires_at: FUTURE, result: {} };
    const { client } = fakeSupabase({ data: claimed, error: null });
    expect(await getRecoverableAssessment(client, "aid", NOW)).toBeNull();
  });

  it("returns null for an expired row even if it slips past the query filter (app-side guard)", async () => {
    const expired = { id: "aid", owner: null, expires_at: PAST, result: {} };
    const { client } = fakeSupabase({ data: expired, error: null });
    expect(await getRecoverableAssessment(client, "aid", NOW)).toBeNull();
  });

  it("returns null on a query error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    expect(await getRecoverableAssessment(client, "aid", NOW)).toBeNull();
  });
});
