import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  listOpenPlanForCase,
  listAllPlanForCase,
  getPlanItemKind,
  setPlanItemStarted,
  setPlanItemStatus,
} from "@/lib/plan/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

const CASE = "case-1";

const ROW = {
  id: 1,
  owner: "u1",
  case_id: CASE,
  kind: "k",
  impact: "high",
  title: "T",
  body: null,
  lift_estimate: null,
  time_estimate: null,
  status: "todo",
  created_at: "2026-06-04",
  completed_at: null,
  started_at: null,
};

describe("plan repo", () => {
  it("listOpenPlanForCase filters by case_id + todo, ordered desc", async () => {
    const { client, calls } = fakeSupabase({ data: [ROW], error: null });

    const out = await listOpenPlanForCase(client, CASE);

    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(1);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "status" && c.args[1] === "todo")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });

  it("listAllPlanForCase reads by case_id only", async () => {
    const { client, calls } = fakeSupabase({ data: [ROW], error: null });

    await listAllPlanForCase(client, CASE);

    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });

  it("setPlanItemStatus sets completed_at when done and scopes by case_id", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });

    await setPlanItemStatus(client, CASE, 1, "done");

    const arg = calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>;
    expect(arg.status).toBe("done");
    expect(typeof arg.completed_at).toBe("string");
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });

  it("setPlanItemStatus clears completed_at when dismissed", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });

    await setPlanItemStatus(client, CASE, 1, "dismissed");

    const arg = calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>;
    expect(arg.completed_at).toBeNull();
  });

  it("setPlanItemStatus returns false on error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    expect(await setPlanItemStatus(client, CASE, 1, "done")).toBe(false);
  });

  it("setPlanItemStarted scopes by case_id and only touches open items", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });

    await setPlanItemStarted(client, CASE, 1, true);

    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "status" && c.args[1] === "todo")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });

  it("getPlanItemKind scopes by case_id", async () => {
    const { client, calls } = fakeSupabase({ data: { kind: "k" }, error: null });

    expect(await getPlanItemKind(client, CASE, 1)).toBe("k");
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });
});
