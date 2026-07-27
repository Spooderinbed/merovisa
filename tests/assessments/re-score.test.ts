import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockGetProfile = vi.fn();
const mockGetPrimary = vi.fn();

vi.mock("@/lib/profiles/repo", () => ({
  getProfile: (...a: unknown[]) => mockGetProfile(...a),
}));
vi.mock("@/lib/assessments/repo", () => ({
  getPrimaryAssessmentForUser: (...a: unknown[]) => mockGetPrimary(...a),
}));
vi.mock("@/lib/programs/repo", () => ({
  listAllPrograms: vi.fn().mockResolvedValue([]),
  listAllUniversities: vi.fn().mockResolvedValue([]),
}));

import { reScoreAssessment } from "@/lib/assessments/re-score";
import { listAllPrograms } from "@/lib/programs/repo";
import { CatalogReadError } from "@/lib/programs/errors";

describe("reScoreAssessment", () => {
  const mockEq2 = vi.fn().mockResolvedValue({});
  const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 });
  const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
  const fakeDb = { from: mockFrom } as unknown as Parameters<typeof reScoreAssessment>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ update: mockUpdate });
    mockUpdate.mockReturnValue({ eq: mockEq1 });
    mockEq1.mockReturnValue({ eq: mockEq2 });
  });

  test("skips when no primary assessment exists", async () => {
    mockGetProfile.mockResolvedValue({ sections: { academic: { gradePercent: 75 } } });
    mockGetPrimary.mockResolvedValue(null);
    await reScoreAssessment(fakeDb, "user-1");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("skips when no profile exists", async () => {
    mockGetProfile.mockResolvedValue(null);
    mockGetPrimary.mockResolvedValue({ id: "assess-1" });
    await reScoreAssessment(fakeDb, "user-1");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // MV-133: re-scoring REPLACES the stored payload. A catalogue read that degraded to []
  // rewrote the student's assessment of record with zero matches — their saved results
  // would then say nothing fits them, long after the outage passed. Abort instead: the
  // previous (truthful) assessment stands, and callers catch and log.
  test("does not overwrite the stored assessment when the catalogue read fails", async () => {
    mockGetProfile.mockResolvedValue({ sections: { academic: { gradePercent: 75 } } });
    mockGetPrimary.mockResolvedValue({ id: "assess-1" });
    vi.mocked(listAllPrograms).mockRejectedValueOnce(new CatalogReadError("programs"));

    await expect(reScoreAssessment(fakeDb, "user-1")).rejects.toThrow(CatalogReadError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("updates assessment when both exist", async () => {
    mockGetProfile.mockResolvedValue({ sections: { academic: { gradePercent: 75 }, english: { overall: 7.0 } } });
    mockGetPrimary.mockResolvedValue({ id: "assess-1" });
    await reScoreAssessment(fakeDb, "user-1");
    expect(mockFrom).toHaveBeenCalledWith("assessments");
    expect(mockUpdate).toHaveBeenCalled();
  });
});
