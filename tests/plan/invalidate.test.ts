import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getProfileForCase, getPrimaryAssessmentForCase, listAllPrograms, listAllUniversities, listDocumentsForCase } = vi.hoisted(() => ({
  getProfileForCase: vi.fn(),
  getPrimaryAssessmentForCase: vi.fn(),
  listAllPrograms: vi.fn(),
  listAllUniversities: vi.fn(),
  listDocumentsForCase: vi.fn(),
}));
vi.mock("@/lib/profiles/repo", () => ({ getProfileForCase }));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForCase }));
vi.mock("@/lib/programs/repo", () => ({ listAllPrograms, listAllUniversities }));
vi.mock("@/lib/documents/repo", () => ({ listDocumentsForCase }));

// MV-157: every migrated route and page resolves the actor's personal case and
// authorizes it before its first query. Both are mocked to the happy path here;
// the denial branch is asserted where the route owns it.
const { resolvePersonalCaseId, ensurePersonalCase, checkCasePermission } = vi.hoisted(() => ({
  resolvePersonalCaseId: vi.fn(),
  ensurePersonalCase: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
// The dual-write helper reads `cases` for the owner it derives; this suite is
// about the generator reconciliation, not that derivation (which has its own
// tests in tests/cases/dual-write.test.ts).
const { caseWriteColumns } = vi.hoisted(() => ({ caseWriteColumns: vi.fn() }));
vi.mock("@/lib/cases/dual-write", () => ({ caseWriteColumns }));
beforeEach(() => caseWriteColumns.mockResolvedValue({ case_id: "case-1", owner: "u1" }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));
beforeEach(() => {
  resolvePersonalCaseId.mockResolvedValue("case-1");
  ensurePersonalCase.mockResolvedValue("case-1");
  checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
});

// select(...).eq("owner", u).eq("status", "todo")  -> resolves the open-todo read
const selectEqEq = vi.fn().mockResolvedValue({ data: [], error: null });
const select = vi.fn(() => ({ eq: () => ({ eq: selectEqEq }) }));
// update({...}).eq("owner", u).in("id", ids)  -> the auto-close write
// update({...}).eq("owner", u).eq("id", id)   -> the per-row copy refresh
const updateEqIn = vi.fn().mockResolvedValue({ error: null });
const updateEqEq = vi.fn().mockResolvedValue({ error: null });
const update = vi.fn(() => ({ eq: () => ({ in: updateEqIn, eq: updateEqEq }) }));
const insert = vi.fn().mockResolvedValue({ data: null, error: null });
const from = vi.fn(() => ({ select, insert, update }));
const fakeAdmin = { from } as never;

import { invalidatePlan } from "@/lib/plan/invalidate";
import { CatalogReadError } from "@/lib/programs/errors";

// Kinds the generator emits for a completely empty profile (L3 policy).
const EMPTY_PROFILE_KINDS = [
  "set-name",
  "add-grade",
  "add-english-score",
  "upload-proof-of-funds",
  "start-passport-process",
  "season-funds-six-months",
  "set-intended-field",
];

/** Make the open-todo read return these rows for the next invalidatePlan call. */
function openTodos(rows: Array<Record<string, unknown> & { id: number; kind: string }>) {
  selectEqEq.mockResolvedValueOnce({ data: rows, error: null });
}

describe("invalidatePlan", () => {
  beforeEach(() => {
    getProfileForCase.mockReset();
    getPrimaryAssessmentForCase.mockReset();
    listAllPrograms.mockReset();
    listAllUniversities.mockReset();
    selectEqEq.mockReset().mockResolvedValue({ data: [], error: null });
    updateEqIn.mockReset().mockResolvedValue({ error: null });
    updateEqEq.mockReset().mockResolvedValue({ error: null });
    insert.mockReset().mockResolvedValue({ data: null, error: null });
    select.mockClear();
    update.mockClear();
    from.mockClear();

    // Default world: empty profile, no assessment, no programs.
    getProfileForCase.mockResolvedValue(null);
    getPrimaryAssessmentForCase.mockResolvedValue(null);
    listAllPrograms.mockResolvedValue([]);
    listAllUniversities.mockResolvedValue([]);
    listDocumentsForCase.mockReset().mockResolvedValue([]);
  });

  // MV-133: the plan is regenerated FROM the catalogue. Reading it as empty on failure
  // silently rewrote the student's plan without its match-driven items — a degraded plan
  // persisted as if it were the truth. The read now throws before any write happens, and
  // callers (every route that triggers a rebuild) catch and log, leaving the prior plan.
  it("writes nothing when the catalogue read fails", async () => {
    getProfileForCase.mockResolvedValue({ sections: { academic: { gradePercent: 75 } } });
    getPrimaryAssessmentForCase.mockResolvedValue({ id: "a1" });
    listAllPrograms.mockRejectedValue(new CatalogReadError("programs"));

    await expect(invalidatePlan(fakeAdmin, "u1")).rejects.toThrow(CatalogReadError);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
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

  /** Run invalidatePlan once on an empty plan and return the inserted rows —
   *  the generator's current copy, usable as fully in-sync open todos. */
  type CapturedRow = Record<string, unknown> & { id: number; kind: string };
  async function captureGeneratedRows(): Promise<CapturedRow[]> {
    await invalidatePlan(fakeAdmin, "u1");
    const rows = insert.mock.calls[0]![0] as Array<Record<string, unknown> & { kind: string }>;
    insert.mockClear();
    update.mockClear();
    updateEqIn.mockClear();
    updateEqEq.mockClear();
    return rows.map((r, i) => ({ ...r, id: i + 1 }));
  }

  it("does not insert, close, or rewrite when open todos match the generator exactly", async () => {
    openTodos(await captureGeneratedRows());

    await invalidatePlan(fakeAdmin, "u1");

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("refreshes generator-owned copy on open rows whose stored claims drifted (state untouched)", async () => {
    const rows = await captureGeneratedRows();
    const season = rows.find((r) => r.kind === "season-funds-six-months")!;
    openTodos(
      rows.map((r) =>
        r.kind === "season-funds-six-months"
          ? { ...r, lift_estimate: "Prevents the most common refusal reason for Nepal AL3 applicants" }
          : r,
      ),
    );

    await invalidatePlan(fakeAdmin, "u1");

    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ lift_estimate: season.lift_estimate }),
    );
    // Copy refresh never touches user-owned state.
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ status: expect.anything() }));
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ started_at: expect.anything() }),
    );
    expect(updateEqEq).toHaveBeenCalledWith("id", season.id);
  });

  it("auto-closes an open todo the generator no longer emits, leaving still-needed todos open", async () => {
    // add-grade is still generated (empty profile) → leave alone (in-sync copy so
    // the copy-refresh pass stays quiet — this test measures auto-close only).
    // add-work-docs is NOT generated for an empty profile → its condition is satisfied → close.
    const addGrade = (await captureGeneratedRows()).find((r) => r.kind === "add-grade")!;
    openTodos([
      { ...addGrade, id: 1 },
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

  // A reach-forcing program used by the two C-4 gate tests below.
  const uni = {
    id: "u1",
    country: "AU",
    name: "Monash",
    city: "Melbourne",
    rankingTier: 1,
    source: "https://x",
    lastVerified: "2026-01-01",
    dataQuality: "primary",
  };
  const program = {
    id: "p1",
    universityId: "u1",
    name: "Master of IT",
    level: "masters",
    field: "computer-science",
    tuitionMin: 40000,
    tuitionMax: 40000,
    tuitionCurrency: "AUD",
    minGrade: 65,
    minEnglish: 6.5,
    minEnglishBand: 6,
    intakes: ["feb"],
    source: "https://x",
    lastVerified: "2026-01-01",
    dataQuality: "primary",
    notes: null,
  };

  it("does not seed match-driven plan items off a name-only profile, but still emits profile prompts (C-4)", async () => {
    // Audit C-4 "Unknown is not zero": a name-only profile has no grade/English/budget,
    // so computeMatches would floor them to 0 and call every program a reach — seeding
    // add-safer-options ("your current matches are all reach") off a fabricated verdict.
    // The gate skips the match-driven items; the profile-completeness prompts still fire.
    getProfileForCase.mockResolvedValue({ sections: { personal: { name: "Asha" } } });
    getPrimaryAssessmentForCase.mockResolvedValue({ destination_id: "australia" });
    listAllPrograms.mockResolvedValue([program]);
    listAllUniversities.mockResolvedValue([uni]);

    await invalidatePlan(fakeAdmin, "u1");

    const rows = insert.mock.calls[0]![0] as Array<{ kind: string }>;
    const kinds = rows.map((r) => r.kind);
    // The match-driven item is suppressed — no plan seeded off a fabricated reach.
    expect(kinds).not.toContain("add-safer-options");
    // But the plan is NOT walled: the real completeness prompts still generate.
    expect(kinds).toContain("add-grade");
    expect(kinds).toContain("add-english-score");
  });

  it("still seeds add-safer-options from real matches when the profile has verdict inputs (no over-gating)", async () => {
    // A sufficient profile (grade + English + budget present) whose tiny budget makes the
    // one program a genuine reach with no strong. The match-driven item must still fire —
    // the gate abstains only when there is nothing real to score.
    getProfileForCase.mockResolvedValue({
      sections: {
        academic: { gradePercent: 72 },
        english: { overall: 7 },
        finance: { total: 10000, currency: "AUD" },
        "intended-study": { field: "computer-science" },
      },
    });
    getPrimaryAssessmentForCase.mockResolvedValue({ destination_id: "australia" });
    listAllPrograms.mockResolvedValue([program]);
    listAllUniversities.mockResolvedValue([uni]);

    await invalidatePlan(fakeAdmin, "u1");

    const rows = insert.mock.calls[0]![0] as Array<{ kind: string }>;
    expect(rows.map((r) => r.kind)).toContain("add-safer-options");
  });

  it("never auto-closes an existing add-safer-options as done when the matcher abstains (C-4 regression)", async () => {
    // The abstain gate sets matches=[] for a name-only profile, so the generator stops
    // emitting the match-driven add-safer-options. That absence must NOT be read by the
    // auto-close as 'condition satisfied': a legacy row seeded by the very zero-floor bug
    // this slice fixes would otherwise be struck 'Done', telling the student they added
    // safer options when they never did — a fresh fabrication in place of the old one.
    getProfileForCase.mockResolvedValue({ sections: { personal: { name: "Asha" } } });
    getPrimaryAssessmentForCase.mockResolvedValue({ destination_id: "australia" });
    listAllPrograms.mockResolvedValue([program]);
    listAllUniversities.mockResolvedValue([uni]);
    openTodos([{ id: 9, kind: "add-safer-options" }]);

    await invalidatePlan(fakeAdmin, "u1");

    // No auto-close write at all — the match-driven row is left untouched, not completed.
    expect(updateEqIn).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "done" }),
    );
  });

  it("does not emit start-passport-process once a passport is uploaded, and auto-closes an open one", async () => {
    listDocumentsForCase.mockResolvedValue([{ kind: "passport" }]);
    openTodos([{ id: 5, kind: "start-passport-process" }]);

    await invalidatePlan(fakeAdmin, "u1");

    // passport uploaded → generator omits start-passport-process → the open todo is satisfied → closed.
    expect(updateEqIn).toHaveBeenCalledWith("id", [5]);
    const insertedKinds = (insert.mock.calls[0]?.[0] as Array<{ kind: string }> | undefined)?.map((r) => r.kind) ?? [];
    expect(insertedKinds).not.toContain("start-passport-process");
  });
});
