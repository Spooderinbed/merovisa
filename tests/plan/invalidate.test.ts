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

const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) });
const insert = vi.fn().mockResolvedValue({ data: null, error: null });
const from = vi.fn(() => ({ select, insert }));
const fakeAdmin = { from } as never;

import { invalidatePlan } from "@/lib/plan/invalidate";

describe("invalidatePlan", () => {
  beforeEach(() => {
    getProfile.mockReset();
    getPrimaryAssessmentForUser.mockReset();
    listAllPrograms.mockReset();
    listAllUniversities.mockReset();
    select.mockClear();
    insert.mockClear();
    from.mockClear();
  });

  it("inserts items generated for an empty profile (all expected high-impact prompts)", async () => {
    getProfile.mockResolvedValue(null);
    getPrimaryAssessmentForUser.mockResolvedValue(null);
    listAllPrograms.mockResolvedValue([]);
    listAllUniversities.mockResolvedValue([]);

    await invalidatePlan(fakeAdmin, "u1");

    expect(insert).toHaveBeenCalled();
    const rows = insert.mock.calls[0]![0] as Array<{ kind: string }>;
    const kinds = rows.map((r) => r.kind);
    expect(kinds).toContain("add-grade");
    expect(kinds).toContain("season-funds-six-months");
    expect(kinds).toContain("upload-proof-of-funds");
  });

  it("does not insert when all current generator items already exist as open todos", async () => {
    getProfile.mockResolvedValue(null);
    getPrimaryAssessmentForUser.mockResolvedValue(null);
    listAllPrograms.mockResolvedValue([]);
    listAllUniversities.mockResolvedValue([]);

    // Pre-existing todos for every kind generator returns
    const allKinds = ["add-grade","add-english-score","upload-proof-of-funds","season-funds-six-months","set-intended-field","set-name"];
    const eqs = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: allKinds.map((k) => ({ kind: k })), error: null }) });
    select.mockReturnValueOnce({ eq: eqs });

    await invalidatePlan(fakeAdmin, "u1");

    expect(insert).not.toHaveBeenCalled();
  });
});
