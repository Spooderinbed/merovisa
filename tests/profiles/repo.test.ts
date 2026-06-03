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
    const existingRow = { sections: { personal: { name: "Old" }, academic: { gradePercent: 70 } } };
    const { client, calls } = fakeSupabase({ data: existingRow, error: null });
    const result = await patchProfileSection(client, "u1", "personal", { name: "New" });
    expect(typeof result.completeness).toBe("number");
    expect(calls.some((c) => c.method === "update")).toBe(true);
  });
});
