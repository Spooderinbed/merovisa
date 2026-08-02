import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getUser, signOut, deleteUser, storageRemove, state } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  deleteUser: vi.fn(),
  storageRemove: vi.fn(),
  state: {
    docsList: [] as { file_path: string }[],
    deletedTables: [] as string[],
    /** Every filter applied to each delete, so scoping can be asserted and not assumed. */
    deleteFilters: [] as { table: string; filters: string[] }[],
    failTable: null as string | null,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser, signOut } }),
}));

// Admin client: from(table).select().eq() resolves the doc list;
// from(table).delete()… records the table plus its filters and resolves { error }.
//
// The delete builder is a THENABLE CHAIN rather than `eq: () => Promise`, because the
// personal-case delete is `.delete().eq(…).is(…)` — two filters, not one. A mock whose
// `eq()` returns a bare Promise makes `.is()` a TypeError, so the chain has to survive
// an arbitrary number of filters and settle only when awaited.
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({ data: state.docsList, error: null }),
      }),
      delete: () => {
        const filters: string[] = [];
        const settle = () => {
          state.deletedTables.push(table);
          state.deleteFilters.push({ table, filters: [...filters] });
          return Promise.resolve({
            error: state.failTable === table ? { message: "boom" } : null,
          });
        };
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push(`${col}=${String(val)}`);
            return chain;
          },
          is: (col: string, val: unknown) => {
            filters.push(`${col} is ${String(val)}`);
            return chain;
          },
          then: (
            onFulfilled?: (v: { error: { message: string } | null }) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) => settle().then(onFulfilled, onRejected),
        };
        return chain;
      },
    }),
    storage: { from: () => ({ remove: storageRemove }) },
    auth: { admin: { deleteUser } },
  }),
}));

import { POST } from "@/app/api/account/delete/route";

function req(headers: Record<string, string> = { origin: "http://localhost" }): Request {
  return new Request("http://localhost/api/account/delete", { method: "POST", headers });
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.docsList = [{ file_path: "u1/passport/a.png" }, { file_path: "u1/bank-statement/b.png" }];
    state.deletedTables = [];
    state.deleteFilters = [];
    state.failTable = null;
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    signOut.mockResolvedValue({ error: null });
    deleteUser.mockResolvedValue({ error: null });
    storageRemove.mockResolvedValue({ error: null });
  });

  it("removes storage objects, every owned row, and the auth user, then signs out", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(storageRemove).toHaveBeenCalledWith([
      "u1/passport/a.png",
      "u1/bank-statement/b.png",
    ]);
    // All nine student-owned tables, children before parents, then the personal case.
    // The four that used to be left to the `owner` FK cascade are explicit since MV-155:
    // each carries `case_id` ON DELETE RESTRICT, so the case cannot be deleted while
    // their rows survive.
    expect(state.deletedTables).toEqual([
      "outcome_events",
      "application_attempts",
      "program_predictions",
      "plan_items",
      "user_program_state",
      "document_status",
      "documents",
      "profiles",
      "assessments",
      "cases",
    ]);
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("deletes the personal case BEFORE the auth user, and only the personal one", async () => {
    // MV-155 regression guard. `cases` carries the student's real name and email, and
    // `cases.student_user_id` is ON DELETE SET NULL — so if this delete does not happen,
    // or happens after `deleteUser`, the row survives account deletion carrying their
    // identity with nothing left to link it back to them.
    // Records the delete order interleaved with deleteUser, so "before" is asserted
    // rather than inferred from the source reading top-to-bottom.
    const order: string[] = [];
    deleteUser.mockImplementation(async () => {
      order.push(`deleteUser@${state.deletedTables.length}`);
      return { error: null };
    });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const caseDelete = state.deleteFilters.find((f) => f.table === "cases");
    expect(caseDelete, "the personal case must be deleted").toBeDefined();

    // Scoped to THIS student, and to personal cases only — a consultancy case belongs
    // to the organisation and must survive the student closing their account.
    expect(caseDelete!.filters).toEqual(["student_user_id=u1", "organization_id is null"]);

    // `cases` is the last delete, and deleteUser ran only after all ten had landed.
    expect(state.deletedTables.at(-1), "cases is deleted last").toBe("cases");
    expect(order).toEqual([`deleteUser@${state.deletedTables.length}`]);
  });

  it("keeps the auth identity when the personal-case delete fails, so a retry can still find it", async () => {
    state.failTable = "cases";
    const res = await POST(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
    expect(body.failedSteps).toContain("cases:delete");
    // The decisive assertion: `student_user_id` is ON DELETE SET NULL, so destroying
    // the Auth row here would orphan a case carrying the student's name and email with
    // nothing left to link it back to them — permanently un-findable, by any retry.
    expect(deleteUser, "the identity must survive so the case stays findable").not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("skips storage removal when the user has no documents", async () => {
    state.docsList = [];
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(storageRemove).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });

  it("surfaces a partial failure as 500 and does NOT sign out or claim success", async () => {
    state.failTable = "profiles";
    const res = await POST(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
    expect(body.failedSteps).toContain("profiles:delete");
    // A half-deleted account must not be reported as gone.
    expect(signOut).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin POST with 403 before touching any data", async () => {
    const res = await POST(req({ origin: "http://evil.example.com" }));
    expect(res.status).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(state.deletedTables).toEqual([]);
  });

  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
