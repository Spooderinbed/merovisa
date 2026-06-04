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

import { reScoreAssessment } from "@/lib/assessments/re-score";

describe("reScoreAssessment", () => {
  const mockEq2 = vi.fn().mockResolvedValue({});
  const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 });
  const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
  const fakeDb = { from: mockFrom } as any;

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

  test("updates assessment when both exist", async () => {
    mockGetProfile.mockResolvedValue({ sections: { academic: { gradePercent: 75 }, english: { overall: 7.0 } } });
    mockGetPrimary.mockResolvedValue({ id: "assess-1" });
    await reScoreAssessment(fakeDb, "user-1");
    expect(mockFrom).toHaveBeenCalledWith("assessments");
    expect(mockUpdate).toHaveBeenCalled();
  });
});
