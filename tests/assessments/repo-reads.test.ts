import { describe, it, expect } from "vitest";
import {
  getAssessmentById,
  getPrimaryAssessmentForCase,
  listAssessmentsForCase,
} from "@/lib/assessments/repo";
import { CaseReadError } from "@/lib/cases/errors";
import { fakeSupabase } from "../helpers/fake-supabase";

const CASE = "case-1";

describe("getPrimaryAssessmentForCase", () => {
  it("returns the case's primary assessment when one exists", async () => {
    const row = { id: "a1", owner: "u1", case_id: CASE, is_primary: true, destination_id: "australia" };
    const { client, calls } = fakeSupabase({ data: row, error: null });

    expect(await getPrimaryAssessmentForCase(client, CASE)).toEqual(row);
    expect(calls.some((c) => c.method === "from" && c.args[0] === "assessments")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "is_primary" && c.args[1] === true)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });

  it("returns null when no primary exists", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getPrimaryAssessmentForCase(client, CASE)).toBeNull();
  });
});

describe("listAssessmentsForCase", () => {
  it("returns all of the case's assessments, newest first", async () => {
    const rows = [
      { id: "a2", case_id: CASE, created_at: "2026-06-01T00:00:00Z" },
      { id: "a1", case_id: CASE, created_at: "2026-05-01T00:00:00Z" },
    ];
    const { client, calls } = fakeSupabase({ data: rows, error: null });

    expect(await listAssessmentsForCase(client, CASE)).toEqual(rows);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
    expect(
      calls.some(
        (c) =>
          c.method === "order" &&
          c.args[0] === "created_at" &&
          (c.args[1] as { ascending: boolean }).ascending === false,
      ),
    ).toBe(true);
  });

  it("THROWS on a read error — `[]` means the case has no assessments", async () => {
    // MV-133, recurring on the case axis. This used to return `[]`, which is the
    // same value a case that genuinely has no assessments returns, so a failed
    // read told a student who HAS assessed that they had not. `[]` is now
    // reserved for the query that answered with nothing.
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    await expect(listAssessmentsForCase(client, CASE)).rejects.toBeInstanceOf(CaseReadError);
  });

  it("still returns [] when the query answers with no rows", async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    expect(await listAssessmentsForCase(client, CASE)).toEqual([]);
  });
});

describe("getAssessmentById", () => {
  it("reads by id alone and asserts no ownership — the caller authorizes", async () => {
    // Renamed from `getOwnedAssessment`: it never filtered by owner, so the old
    // name asserted a check it did not perform. `app/(focused)/assessment/[id]`
    // now reads the row, then authorizes `case.read` against its `case_id` for a
    // CLAIMED row (and keeps id-as-credential for an unclaimed, case-less one).
    const row = { id: "a1", owner: null, case_id: null };
    const { client, calls } = fakeSupabase({ data: row, error: null });

    expect(await getAssessmentById(client, "a1")).toEqual(row);
    expect(calls.filter((c) => c.method === "eq")).toHaveLength(1);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === "a1")).toBe(true);
  });
});
