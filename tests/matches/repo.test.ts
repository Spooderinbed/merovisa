import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  upsertProgramState,
  deleteProgramState,
  listShortlistForCase,
} from "@/lib/matches/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

const CASE = "case-1";
const STUDENT = "u1";
/** What the dual-write helper's `cases` lookup answers with. */
const CASE_ROW = { data: { id: CASE, student_user_id: STUDENT }, error: null };
const ORG_CASE_ROW = { data: { id: CASE, student_user_id: null }, error: null };

describe("matches repo", () => {
  it("upsertProgramState conflicts on the CASE-scoped index", async () => {
    // MV-155 shipped `user_program_state_case_program_idx` FULL (not partial) so
    // PostgREST's bare `on_conflict=` can infer it. Pointing this string at the
    // legacy owner index would silently keep the write owner-scoped while every
    // read has moved to case_id.
    const { client, calls } = fakeSupabase([CASE_ROW, { data: null, error: null }]);

    const ok = await upsertProgramState(client, {
      caseId: CASE,
      programId: "p1",
      status: "shortlisted",
    });

    expect(ok).toBe(true);
    const upsert = calls.find((c) => c.method === "upsert");
    expect(upsert?.args[1]).toMatchObject({ onConflict: "case_id,program_id" });
  });

  it("upsertProgramState writes owner but NOT case_id in the payload", async () => {
    // The conflict TARGET names case_id; the PAYLOAD must not. PostgREST puts
    // every payload column in the `ON CONFLICT DO UPDATE SET` list, and Stage 2
    // grants no UPDATE(case_id) — so naming it is a 42501 on the first call.
    // MV-155 §H's definer trigger derives case_id from owner instead.
    const { client, calls } = fakeSupabase([CASE_ROW, { data: null, error: null }]);

    await upsertProgramState(client, { caseId: CASE, programId: "p1", status: "shortlisted" });

    const payload = calls.find((c) => c.method === "upsert")?.args[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("case_id");
    expect(payload.owner).toBe(STUDENT);
  });

  it("upsertProgramState refuses a case with no student user", async () => {
    // Stage 2 cannot express the consultancy upsert (spec §4 rule 2): the trigger
    // does not fire with owner NULL and supplying case_id needs a grant Stage 2
    // withholds. Refuse rather than write a row that trips the ownership check.
    const { client, calls } = fakeSupabase([ORG_CASE_ROW]);

    expect(
      await upsertProgramState(client, { caseId: CASE, programId: "p1", status: "shortlisted" }),
    ).toBe(false);
    expect(calls.some((c) => c.method === "upsert")).toBe(false);
  });

  it("upsertProgramState returns false on error", async () => {
    const { client } = fakeSupabase([CASE_ROW, { data: null, error: { message: "boom" } }]);
    expect(
      await upsertProgramState(client, { caseId: CASE, programId: "p1", status: "shortlisted" }),
    ).toBe(false);
  });

  it("deleteProgramState scopes by case_id, never owner", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });

    await deleteProgramState(client, CASE, "p1");

    const eqs = calls.filter((c) => c.method === "eq");
    expect(eqs.map((c) => c.args[0])).toEqual(["case_id", "program_id"]);
  });

  it("listShortlistForCase reads by case_id and maps rows", async () => {
    const { client, calls } = fakeSupabase({
      data: [{ program_id: "p1", status: "shortlisted", notes: null }],
      error: null,
    });

    const out = await listShortlistForCase(client, CASE);

    expect(out).toEqual([{ programId: "p1", status: "shortlisted", notes: null }]);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });
});
