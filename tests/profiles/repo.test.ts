import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  getProfileForCase,
  upsertProfileForCase,
  patchProfileSectionForCase,
} from "@/lib/profiles/repo";
import { CaseReadError } from "@/lib/cases/errors";
import { fakeSupabase } from "../helpers/fake-supabase";

const CASE = "case-1";
const STUDENT = "u1";
/** What the dual-write helper's `cases` lookup answers with. */
const CASE_ROW = { data: { id: CASE, student_user_id: STUDENT }, error: null };

describe("getProfileForCase", () => {
  it("returns the row for the case", async () => {
    const row = { id: "p1", owner: STUDENT, case_id: CASE, sections: { personal: { name: "Aarav" } }, completeness: 8 };
    const { client, calls } = fakeSupabase({ data: row, error: null });

    expect(await getProfileForCase(client, CASE)).toEqual(row);
    expect(calls.some((c) => c.method === "from" && c.args[0] === "profiles")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });

  it("returns null on not found", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getProfileForCase(client, CASE)).toBeNull();
  });

  it("THROWS on a read error — `null` means the case has no profile", async () => {
    // MV-133 on the case axis. `null` here drives the profile BOOTSTRAP decision
    // in two places (the claim seam and /api/assess), so a failed read wearing it
    // does not merely render an empty page: it makes the code decide to create a
    // profile the student already has.
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    await expect(getProfileForCase(client, CASE)).rejects.toBeInstanceOf(CaseReadError);
  });
});

describe("upsertProfileForCase", () => {
  it("dual-writes case_id and the derived owner, conflicting on the case index", async () => {
    const { client, calls } = fakeSupabase([CASE_ROW, { data: { id: "p1" }, error: null }]);

    const id = await upsertProfileForCase(client, {
      caseId: CASE,
      sections: { personal: { name: "Aarav" } },
      completeness: 8,
    });

    expect(id).toBe("p1");
    const upsert = calls.find((c) => c.method === "upsert");
    expect(upsert?.args[0]).toMatchObject({ case_id: CASE, owner: STUDENT });
    expect(upsert?.args[1]).toMatchObject({ onConflict: "case_id" });
  });

  it("returns null when the case cannot be resolved rather than writing an unowned row", async () => {
    const { client, calls } = fakeSupabase([{ data: null, error: null }]);

    expect(
      await upsertProfileForCase(client, { caseId: CASE, sections: {}, completeness: 0 }),
    ).toBeNull();
    expect(calls.some((c) => c.method === "upsert")).toBe(false);
  });

  it("returns null when the upsert errors", async () => {
    const { client } = fakeSupabase([CASE_ROW, { data: null, error: { message: "duplicate" } }]);
    expect(
      await upsertProfileForCase(client, { caseId: CASE, sections: {}, completeness: 0 }),
    ).toBeNull();
  });
});

describe("patchProfileSectionForCase", () => {
  it("merges into sections[key] and updates completeness in one go", async () => {
    const { client, calls } = fakeSupabase({ data: [{ id: "p1" }], error: null });

    const result = await patchProfileSectionForCase(client, CASE, "personal", { name: "New" });

    expect(typeof result.completeness).toBe("number");
    expect(calls.some((c) => c.method === "update")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
  });

  it("upserts when the UPDATE matches 0 rows (no profile row exists)", async () => {
    // data:[] is a 0-row update; the fallback then needs the `cases` lookup and
    // the upsert to answer, in that order.
    const { client, calls } = fakeSupabase([
      { data: [], error: null },
      { data: [], error: null },
      CASE_ROW,
      { data: { id: "p1" }, error: null },
    ]);

    const result = await patchProfileSectionForCase(client, CASE, "personal", { name: "New" });

    expect(typeof result.completeness).toBe("number");
    expect(calls.some((c) => c.method === "update")).toBe(true);
    expect(calls.some((c) => c.method === "upsert")).toBe(true);
  });

  it("throws when the UPDATE returns an error", async () => {
    // The current-profile READ answers cleanly (no row) and only the UPDATE
    // fails, so the message pins the update leg specifically. A single shared
    // error response would now be caught one step earlier by `getProfileForCase`,
    // which throws `CaseReadError` since review minor 5.
    const { client } = fakeSupabase([
      { data: null, error: null },
      { data: null, error: { message: "db error" } },
    ]);
    await expect(
      patchProfileSectionForCase(client, CASE, "personal", { name: "New" }),
    ).rejects.toThrow("patchProfileSectionForCase update failed: db error");
  });

  it("propagates a CaseReadError from the current-profile read rather than saving over it", async () => {
    // A failed read of the CURRENT sections must not be treated as "the profile
    // is empty": the patch would be merged into `{}` and written back, silently
    // erasing every section the student already filled.
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    await expect(
      patchProfileSectionForCase(client, CASE, "personal", { name: "New" }),
    ).rejects.toBeInstanceOf(CaseReadError);
  });

  it("throws when the new-profile upsert fallback fails to write", async () => {
    // A genuinely failed first-ever save must surface, not resolve as success
    // (MV-02 no silent failures).
    const { client } = fakeSupabase({ data: null, error: null });
    await expect(
      patchProfileSectionForCase(client, CASE, "personal", { name: "New" }),
    ).rejects.toThrow(/upsert fallback failed/i);
  });
});
