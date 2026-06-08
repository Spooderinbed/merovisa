import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getProfile, getPrimaryAssessmentForUser, listAllPrograms, listAllUniversities } = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getPrimaryAssessmentForUser: vi.fn(),
  listAllPrograms: vi.fn(),
  listAllUniversities: vi.fn(),
}));
vi.mock("@/lib/profiles/repo", () => ({ getProfile }));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForUser }));
vi.mock("@/lib/programs/repo", () => ({ listAllPrograms, listAllUniversities }));

// select("id, kind").eq("owner", u).eq("status", "todo")  -> resolves the open-todo read
const selectEqEq = vi.fn().mockResolvedValue({ data: [], error: null });
const select = vi.fn(() => ({ eq: () => ({ eq: selectEqEq }) }));
// update({...}).eq("owner", u).in("id", ids)  -> the auto-close write
const updateEqIn = vi.fn().mockResolvedValue({ error: null });
const update = vi.fn(() => ({ eq: () => ({ in: updateEqIn }) }));
const insert = vi.fn().mockResolvedValue({ data: null, error: null });
const from = vi.fn(() => ({ select, insert, update }));
const fakeAdmin = { from } as never;

import { invalidatePlan } from "@/lib/plan/invalidate";

// Kinds the generator emits for a completely empty profile (L3 policy).
const EMPTY_PROFILE_KINDS = [
  "set-name",
  "add-grade",
  "add-english-score",
  "upload-proof-of-funds",
  "season-funds-six-months",
  "set-intended-field",
];

/** Make the open-todo read return these rows for the next invalidatePlan call. */
function openTodos(rows: Array<{ id: number; kind: string }>) {
  selectEqEq.mockResolvedValueOnce({ data: rows, error: null });
}

describe("invalidatePlan", () => {
  beforeEach(() => {
    getProfile.mockReset();
    getPrimaryAssessmentForUser.mockReset();
    listAllPrograms.mockReset();
    listAllUniversities.mockReset();
    selectEqEq.mockReset().mockResolvedValue({ data: [], error: null });
    updateEqIn.mockReset().mockResolvedValue({ error: null });
    insert.mockReset().mockResolvedValue({ data: null, error: null });
    select.mockClear();
    update.mockClear();
    from.mockClear();

    // Default world: empty profile, no assessment, no programs.
    getProfile.mockResolvedValue(null);
    getPrimaryAssessmentForUser.mockResolvedValue(null);
    listAllPrograms.mockResolvedValue([]);
    listAllUniversities.mockResolvedValue([]);
  });

  it("inserts items generated for an empty profile (all expected high-impact prompts)", async () => {
    await invalidatePlan(fakeAdmin, "u1");

    expect(insert).toHaveBeenCalled();
    const rows = insert.mock.calls[0]![0] as Array<{ kind: string }>;
    const kinds = rows.map((r) => r.kind);
    expect(kinds).toContain("add-grade");
    expect(kinds).toContain("season-funds-six-months");
    expect(kinds).toContain("upload-proof-of-funds");
  });

  it("does not insert or close when all current generator items already exist as open todos", async () => {
    openTodos(EMPTY_PROFILE_KINDS.map((k, i) => ({ id: i + 1, kind: k })));

    await invalidatePlan(fakeAdmin, "u1");

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("auto-closes an open todo the generator no longer emits, leaving still-needed todos open", async () => {
    // add-grade is still generated (empty profile) → leave alone.
    // add-work-docs is NOT generated for an empty profile → its condition is satisfied → close.
    openTodos([
      { id: 1, kind: "add-grade" },
      { id: 2, kind: "add-work-docs" },
    ]);

    await invalidatePlan(fakeAdmin, "u1");

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done", completed_at: expect.any(String) }),
    );
    expect(updateEqIn).toHaveBeenCalledWith("id", [2]);

    // add-grade is still open AND still generated → neither closed nor re-inserted.
    const insertedKinds = (insert.mock.calls[0]?.[0] as Array<{ kind: string }> | undefined)?.map((r) => r.kind) ?? [];
    expect(insertedKinds).not.toContain("add-grade");
    expect(insertedKinds).not.toContain("add-work-docs");
  });

  it("closes satisfied todos even when there are no new items to insert", async () => {
    // Every generated kind is already open (nothing to insert) plus one satisfied straggler.
    openTodos([
      ...EMPTY_PROFILE_KINDS.map((k, i) => ({ id: i + 1, kind: k })),
      { id: 77, kind: "add-work-docs" },
    ]);

    await invalidatePlan(fakeAdmin, "u1");

    expect(updateEqIn).toHaveBeenCalledWith("id", [77]);
    expect(insert).not.toHaveBeenCalled();
  });
});
