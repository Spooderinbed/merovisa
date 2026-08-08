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
  it("upsertProgramState INSERTs, naming case_id explicitly — never an upsert", async () => {
    // MV-168. An `.upsert()` compiles to `INSERT … ON CONFLICT DO UPDATE SET` with EVERY payload
    // column in the SET list, checked at plan time; `case_id` is in this table's INSERT grant and
    // not its UPDATE grant, so the upsert form is 42501 on the first call and a plain INSERT is
    // not. `UPDATE (case_id)` is forbidden by design, so the fix has to be here rather than in
    // the grant.
    const { client, calls } = fakeSupabase([CASE_ROW, { data: null, error: null }]);

    const ok = await upsertProgramState(client, {
      caseId: CASE,
      programId: "p1",
      status: "shortlisted",
    });

    expect(ok).toBe(true);
    expect(calls.some((c) => c.method === "upsert")).toBe(false);
    const payload = calls.find((c) => c.method === "insert")?.args[0] as Record<string, unknown>;
    expect(payload.case_id).toBe(CASE);
    expect(payload.owner).toBe(STUDENT);
    expect(payload.program_id).toBe("p1");
  });

  it("upsertProgramState resolves a 23505 by UPDATING, and that update names neither ownership column", async () => {
    // The row already exists on this case for this program. The resolve branch may not name
    // `case_id` (absent from the UPDATE grant) nor `owner` (write-once, enforced by MV-155 §H's
    // trigger clause (c)).
    const { client, calls } = fakeSupabase([
      CASE_ROW,
      { data: null, error: { code: "23505", message: "duplicate key" } },
      { data: null, error: null },
    ]);

    const ok = await upsertProgramState(client, { caseId: CASE, programId: "p1", status: "applied" });

    expect(ok).toBe(true);
    const patch = calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("case_id");
    expect(patch).not.toHaveProperty("owner");
    expect(patch.status).toBe("applied");
    const eqs = calls.filter((c) => c.method === "eq").map((c) => c.args[0]);
    expect(eqs).toContain("case_id");
    expect(eqs).toContain("program_id");
  });

  it("upsertProgramState SERVES a case with no student user — owner NULL, case_id supplied", async () => {
    // THE INVERSION. Stage 2 could not express the consultancy shortlist write: `caseUpsertColumns`
    // returned null for a student-less case and this returned `false` — silently, since the route
    // still answered 200. Stage 3 grants `INSERT (…, case_id, owner)` and the policy admits
    // `owner IS NULL`, so the write lands.
    const { client, calls } = fakeSupabase([ORG_CASE_ROW, { data: null, error: null }]);

    expect(
      await upsertProgramState(client, { caseId: CASE, programId: "p1", status: "shortlisted" }),
    ).toBe(true);
    const payload = calls.find((c) => c.method === "insert")?.args[0] as Record<string, unknown>;
    expect(payload.owner).toBeNull();
    expect(payload.case_id).toBe(CASE);
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
