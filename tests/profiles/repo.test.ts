import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getProfile, upsertProfile, patchProfileSection } from "@/lib/profiles/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("getProfile", () => {
  it("returns the row for the user", async () => {
    const row = { id: "p1", owner: "u1", sections: { personal: { name: "Aarav" } }, completeness: 8 };
    const { client, calls } = fakeSupabase({ data: row, error: null });
    expect(await getProfile(client, "u1")).toEqual(row);
    expect(calls.some((c) => c.method === "from" && c.args[0] === "profiles")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner" && c.args[1] === "u1")).toBe(true);
  });

  it("returns null on not found", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getProfile(client, "u1")).toBeNull();
  });
});

describe("upsertProfile", () => {
  it("inserts via service-role client (upsert + select)", async () => {
    const { client, calls } = fakeSupabase({ data: { id: "p1" }, error: null });
    const id = await upsertProfile(client, {
      owner: "u1",
      sections: { personal: { name: "Aarav" } },
      completeness: 8,
    });
    expect(id).toBe("p1");
    expect(calls.some((c) => c.method === "upsert")).toBe(true);
  });

  it("returns null when insert errors", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "duplicate" } });
    expect(await upsertProfile(client, { owner: "u1", sections: {}, completeness: 0 })).toBeNull();
  });
});

describe("patchProfileSection", () => {
  it("merges into sections[key] and updates completeness in one go", async () => {
    // fakeSupabase returns the same result for all calls including getProfile (maybeSingle)
    // and the update+select (then/builder). Return an array so the update looks like it matched a row.
    const { client, calls } = fakeSupabase({ data: [{ id: "p1" }], error: null });
    const result = await patchProfileSection(client, "u1", "personal", { name: "New" });
    expect(typeof result.completeness).toBe("number");
    expect(calls.some((c) => c.method === "update")).toBe(true);
  });

  it("upserts when the UPDATE matches 0 rows (no profile row exists)", async () => {
    // data: [] simulates 0 rows updated — triggers the upsert fallback
    const { client, calls } = fakeSupabase({ data: [], error: null });
    const result = await patchProfileSection(client, "u1", "personal", { name: "New" });
    expect(typeof result.completeness).toBe("number");
    expect(calls.some((c) => c.method === "update")).toBe(true);
    expect(calls.some((c) => c.method === "upsert")).toBe(true);
  });

  it("throws when the UPDATE returns an error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "db error" } });
    await expect(patchProfileSection(client, "u1", "personal", { name: "New" })).rejects.toThrow(
      "patchProfileSection update failed: db error",
    );
  });

  it("throws when the new-profile upsert fallback fails to write", async () => {
    // data:null everywhere → getProfile finds no row, the UPDATE matches 0 rows,
    // and the upsert fallback returns null (no id). A genuinely failed first-ever
    // save must surface, not resolve as success (MV-02 no silent failures).
    const { client } = fakeSupabase({ data: null, error: null });
    await expect(patchProfileSection(client, "u1", "personal", { name: "New" })).rejects.toThrow(
      /upsert fallback failed/i,
    );
  });
});
