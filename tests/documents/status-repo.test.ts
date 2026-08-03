import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listObtainedKinds, setObtained } from "@/lib/documents/status-repo";
import { fakeSupabase } from "@/tests/helpers/fake-supabase";

const CASE = "case-1";
const STUDENT = "u1";
/** What the dual-write helper's `cases` lookup answers with. */
const CASE_ROW = { data: { id: CASE, student_user_id: STUDENT }, error: null };

describe("document status repo", () => {
  test("listObtainedKinds returns the set of obtained kinds for the case", async () => {
    const { client, calls } = fakeSupabase({
      data: [{ kind: "passport" }, { kind: "ielts" }],
      error: null,
    });

    const kinds = await listObtainedKinds(client, CASE);

    expect(kinds).toBeInstanceOf(Set);
    expect(kinds.has("passport")).toBe(true);
    expect(kinds.has("ielts")).toBe(true);
    expect(kinds.has("coe")).toBe(false);
    expect(calls.some((c) => c.method === "from" && c.args[0] === "document_status")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "obtained" && c.args[1] === true)).toBe(true);
    // No residual owner predicate — a belt-and-braces owner filter makes every
    // case-scoping bug invisible until MV-159 removes the owner-scoped policy.
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });

  test("listObtainedKinds returns an empty set when nothing is obtained", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect((await listObtainedKinds(client, CASE)).size).toBe(0);
  });

  test("setObtained(true) conflicts on the CASE-scoped index", async () => {
    // MV-155 shipped `document_status_case_kind_idx` FULL so PostgREST's bare
    // `on_conflict=` can infer it; a partial arbiter raises 42P10.
    const { client, calls } = fakeSupabase([CASE_ROW, { data: null, error: null }]);

    await setObtained(client, CASE, "passport", true);

    const upsert = calls.find((c) => c.method === "upsert");
    expect(upsert?.args[1]).toMatchObject({ onConflict: "case_id,kind" });
    expect(calls.some((c) => c.method === "delete")).toBe(false);
  });

  test("setObtained(true) writes owner but NOT case_id in the payload", async () => {
    // The conflict TARGET names case_id; the PAYLOAD must not. Stage 2 grants
    // `UPDATE (owner, kind, obtained)` here — no case_id — and PostgREST puts
    // every payload column in the ON CONFLICT DO UPDATE SET list, so naming it is
    // a 42501 at plan time. MV-155 §H's trigger derives case_id from owner.
    const { client, calls } = fakeSupabase([CASE_ROW, { data: null, error: null }]);

    await setObtained(client, CASE, "passport", true);

    const payload = calls.find((c) => c.method === "upsert")?.args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ owner: STUDENT, kind: "passport", obtained: true });
    expect(payload).not.toHaveProperty("case_id");
  });

  test("setObtained(true) refuses a case with no student user", async () => {
    const { client, calls } = fakeSupabase([{ data: { id: CASE, student_user_id: null }, error: null }]);

    await setObtained(client, CASE, "passport", true);

    expect(calls.some((c) => c.method === "upsert")).toBe(false);
  });

  test("setObtained(false) deletes the (case_id, kind) row (absence = not obtained)", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });

    await setObtained(client, CASE, "passport", false);

    expect(calls.some((c) => c.method === "delete")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "kind" && c.args[1] === "passport")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
    expect(calls.some((c) => c.method === "upsert")).toBe(false);
  });
});
