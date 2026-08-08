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
  it("INSERTs the ownership axis and the mutable columns — never an upsert", async () => {
    // MV-168. The `.upsert()` this replaced put `case_id` in the `ON CONFLICT DO UPDATE SET`
    // list, and `UPDATE (case_id)` is withheld by design, so it raised 42501 at plan time on the
    // FIRST call — with no row present and neither branch reachable. Stage 3's INSERT grant is
    // only reachable through a plain INSERT.
    const { client, calls } = fakeSupabase([CASE_ROW, { data: { id: "p1" }, error: null }]);

    const id = await upsertProfileForCase(client, {
      caseId: CASE,
      sections: { personal: { name: "Aarav" } },
      completeness: 8,
    });

    expect(id).toBe("p1");
    expect(calls.some((c) => c.method === "upsert")).toBe(false);
    const payload = calls.find((c) => c.method === "insert")?.args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ case_id: CASE, owner: STUDENT, completeness: 8 });
  });

  it("INSERTs `owner: null` for a case with no student — the consultancy shape", async () => {
    const { client, calls } = fakeSupabase([
      { data: { id: CASE, student_user_id: null }, error: null },
      { data: { id: "p1" }, error: null },
    ]);

    expect(
      await upsertProfileForCase(client, { caseId: CASE, sections: {}, completeness: 0 }),
    ).toBe("p1");
    const payload = calls.find((c) => c.method === "insert")?.args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ case_id: CASE, owner: null });
  });

  it("resolves a 23505 by UPDATING, and that update names neither ownership column", async () => {
    // Since MV-160 dropped `profiles_owner_key` and made `case_id` NOT NULL, `profiles_case_idx`
    // is the only unique left besides the primary key — so a 23505 here means "somebody created
    // this case's profile concurrently" and the remedy is to write the mutable columns onto it.
    // It used to mean two things with opposite remedies, which is why this is asserted rather
    // than assumed.
    const { client, calls } = fakeSupabase([
      CASE_ROW,
      { data: null, error: { code: "23505", message: "duplicate key" } },
      { data: { id: "p1" }, error: null },
    ]);

    expect(
      await upsertProfileForCase(client, { caseId: CASE, sections: {}, completeness: 3 }),
    ).toBe("p1");
    const patch = calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("case_id");
    expect(patch).not.toHaveProperty("owner");
    expect(patch).toMatchObject({ completeness: 3 });
  });

  it("returns null when the case cannot be resolved rather than writing an unowned row", async () => {
    const { client, calls } = fakeSupabase([{ data: null, error: null }]);

    expect(
      await upsertProfileForCase(client, { caseId: CASE, sections: {}, completeness: 0 }),
    ).toBeNull();
    expect(calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("returns null when the insert fails for a reason that is not a unique violation", async () => {
    const { client } = fakeSupabase([CASE_ROW, { data: null, error: { code: "42501", message: "denied" } }]);
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

  it("INSERTs when the UPDATE matches 0 rows (no profile row exists)", async () => {
    // data:[] is a 0-row update; the fallback then needs the `cases` lookup and
    // the insert to answer, in that order. THIS IS THE FIRST-EVER-SAVE PATH, and the one Stage 3
    // grant 1 exists for — it reaches `upsertProfileForCase` precisely when there is no row.
    const { client, calls } = fakeSupabase([
      { data: [], error: null },
      { data: [], error: null },
      CASE_ROW,
      { data: { id: "p1" }, error: null },
    ]);

    const result = await patchProfileSectionForCase(client, CASE, "personal", { name: "New" });

    expect(typeof result.completeness).toBe("number");
    expect(calls.some((c) => c.method === "update")).toBe(true);
    expect(calls.some((c) => c.method === "insert")).toBe(true);
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

  it("throws when the new-profile insert fallback fails to write", async () => {
    // A genuinely failed first-ever save must surface, not resolve as success
    // (MV-02 no silent failures).
    const { client } = fakeSupabase({ data: null, error: null });
    await expect(
      patchProfileSectionForCase(client, CASE, "personal", { name: "New" }),
    ).rejects.toThrow(/upsert fallback failed/i);
  });
});
