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

  test("setObtained(true) INSERTs, naming case_id explicitly — never an upsert", async () => {
    // MV-168. An `.upsert()` puts every payload column in the `ON CONFLICT DO UPDATE SET` list and
    // the privilege check happens at plan time; `case_id` is in this table's INSERT grant and not
    // its UPDATE grant, so the upsert form is 42501 on the first call. `UPDATE (case_id)` is
    // forbidden by design — a client holding it could re-point a row into another case.
    const { client, calls } = fakeSupabase([CASE_ROW, { data: null, error: null }]);

    expect(await setObtained(client, CASE, "passport", true)).toBe(true);

    expect(calls.some((c) => c.method === "upsert")).toBe(false);
    const payload = calls.find((c) => c.method === "insert")?.args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ owner: STUDENT, case_id: CASE, kind: "passport", obtained: true });
    expect(calls.some((c) => c.method === "delete")).toBe(false);
  });

  test("setObtained(true) resolves a 23505 by UPDATING, and that update names neither ownership column", async () => {
    const { client, calls } = fakeSupabase([
      CASE_ROW,
      { data: null, error: { code: "23505", message: "duplicate key" } },
      { data: null, error: null },
    ]);

    expect(await setObtained(client, CASE, "passport", true)).toBe(true);

    const patch = calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>;
    expect(patch).toEqual({ obtained: true });
    const eqs = calls.filter((c) => c.method === "eq").map((c) => c.args[0]);
    expect(eqs).toContain("case_id");
    expect(eqs).toContain("kind");
  });

  test("setObtained(true) SERVES a case with no student user — owner NULL, case_id supplied", async () => {
    // THE INVERSION. `caseUpsertColumns` used to refuse this shape and the tick was dropped
    // silently while the route answered 200 — the failure this function's doc comment was
    // written about. Stage 3's INSERT grant and `ds_insert_case`'s `owner IS NULL` arm admit it.
    const { client, calls } = fakeSupabase([
      { data: { id: CASE, student_user_id: null }, error: null },
      { data: null, error: null },
    ]);

    expect(await setObtained(client, CASE, "passport", true)).toBe(true);

    const payload = calls.find((c) => c.method === "insert")?.args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ owner: null, case_id: CASE, kind: "passport", obtained: true });
  });

  test("setObtained(true) reports false when the insert fails for any other reason", async () => {
    const { client } = fakeSupabase([CASE_ROW, { data: null, error: { code: "42501", message: "denied" } }]);
    expect(await setObtained(client, CASE, "passport", true)).toBe(false);
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
