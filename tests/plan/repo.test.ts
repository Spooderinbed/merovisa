import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { listOpenPlanForUser, setPlanItemStatus } from "@/lib/plan/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("plan repo", () => {
  it("listOpenPlanForUser filters by owner + todo, ordered desc", async () => {
    const { client, calls } = fakeSupabase({
      data: [{ id: 1, owner: "u1", kind: "k", impact: "high", title: "T", body: null, lift_estimate: null, time_estimate: null, status: "todo", created_at: "2026-06-04", completed_at: null }],
      error: null,
    });
    const out = await listOpenPlanForUser(client, "u1");
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(1);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "status" && c.args[1] === "todo")).toBe(true);
  });

  it("setPlanItemStatus sets completed_at when done", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    await setPlanItemStatus(client, "u1", 1, "done");
    const update = calls.find((c) => c.method === "update");
    const arg = update?.args[0] as Record<string, unknown>;
    expect(arg.status).toBe("done");
    expect(typeof arg.completed_at).toBe("string");
  });

  it("setPlanItemStatus clears completed_at when dismissed", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    await setPlanItemStatus(client, "u1", 1, "dismissed");
    const update = calls.find((c) => c.method === "update");
    const arg = update?.args[0] as Record<string, unknown>;
    expect(arg.completed_at).toBeNull();
  });

  it("setPlanItemStatus returns false on error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    expect(await setPlanItemStatus(client, "u1", 1, "done")).toBe(false);
  });
});
