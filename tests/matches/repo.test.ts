import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  upsertProgramState,
  deleteProgramState,
  listShortlistForUser,
} from "@/lib/matches/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("matches repo", () => {
  it("upsertProgramState upserts on (owner, program_id)", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    const ok = await upsertProgramState(client, {
      owner: "u1",
      programId: "p1",
      status: "shortlisted",
    });
    expect(ok).toBe(true);
    const upsert = calls.find((c) => c.method === "upsert");
    expect(upsert?.args[1]).toMatchObject({ onConflict: "owner,program_id" });
  });

  it("upsertProgramState returns false on error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    expect(
      await upsertProgramState(client, {
        owner: "u1",
        programId: "p1",
        status: "shortlisted",
      }),
    ).toBe(false);
  });

  it("deleteProgramState chains eq twice", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    await deleteProgramState(client, "u1", "p1");
    const eqs = calls.filter((c) => c.method === "eq");
    expect(eqs).toHaveLength(2);
  });

  it("listShortlistForUser maps rows", async () => {
    const { client } = fakeSupabase({
      data: [{ program_id: "p1", status: "shortlisted", notes: null }],
      error: null,
    });
    const out = await listShortlistForUser(client, "u1");
    expect(out).toEqual([{ programId: "p1", status: "shortlisted", notes: null }]);
  });
});
