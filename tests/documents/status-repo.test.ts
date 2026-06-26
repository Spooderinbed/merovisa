import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listObtainedKinds, setObtained } from "@/lib/documents/status-repo";
import { fakeSupabase } from "@/tests/helpers/fake-supabase";

describe("document status repo", () => {
  test("listObtainedKinds returns the set of obtained kinds for the user", async () => {
    const { client, calls } = fakeSupabase({
      data: [{ kind: "passport" }, { kind: "ielts" }],
      error: null,
    });
    const kinds = await listObtainedKinds(client, "u1");
    expect(kinds).toBeInstanceOf(Set);
    expect(kinds.has("passport")).toBe(true);
    expect(kinds.has("ielts")).toBe(true);
    expect(kinds.has("coe")).toBe(false);
    expect(calls.some((c) => c.method === "from" && c.args[0] === "document_status")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner" && c.args[1] === "u1")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "obtained" && c.args[1] === true)).toBe(true);
  });

  test("listObtainedKinds returns an empty set when nothing is obtained", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    const kinds = await listObtainedKinds(client, "u1");
    expect(kinds.size).toBe(0);
  });

  test("setObtained(true) upserts the (owner, kind) row obtained=true", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    await setObtained(client, "u1", "passport", true);
    const upsert = calls.find((c) => c.method === "upsert");
    expect(upsert).toBeDefined();
    expect(upsert?.args[0]).toMatchObject({ owner: "u1", kind: "passport", obtained: true });
    // it should target the (owner, kind) composite key on conflict
    expect(upsert?.args[1]).toMatchObject({ onConflict: "owner,kind" });
    expect(calls.some((c) => c.method === "from" && c.args[0] === "document_status")).toBe(true);
    // turning it ON must never delete
    expect(calls.some((c) => c.method === "delete")).toBe(false);
  });

  test("setObtained(false) deletes the (owner, kind) row (absence = not obtained)", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    await setObtained(client, "u1", "passport", false);
    expect(calls.some((c) => c.method === "delete")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner" && c.args[1] === "u1")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "kind" && c.args[1] === "passport")).toBe(true);
    // turning it OFF must never upsert
    expect(calls.some((c) => c.method === "upsert")).toBe(false);
  });
});
