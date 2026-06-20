import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getPrimaryAssessmentForUser, getProfile, getProgram, listAllUniversities, insertPrediction } =
  vi.hoisted(() => ({
    getPrimaryAssessmentForUser: vi.fn(),
    getProfile: vi.fn(),
    getProgram: vi.fn(),
    listAllUniversities: vi.fn(),
    insertPrediction: vi.fn(),
  }));

vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForUser }));
vi.mock("@/lib/profiles/repo", () => ({ getProfile }));
vi.mock("@/lib/programs/repo", () => ({ getProgram, listAllUniversities }));
vi.mock("@/lib/outcomes/repo", () => ({ insertPrediction }));

import { freezePredictionForProgram } from "@/lib/outcomes/freeze";
import type { Program, University } from "@/lib/programs/types";

const db = {} as never;

const uni: University = {
  id: "u1",
  country: "AU",
  name: "X",
  city: "Y",
  rankingTier: 2,
  source: "https://x",
  lastVerified: "2026-01-01",
  dataQuality: "primary",
};

const program: Program = {
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
  minEnglishBand: 6.0,
  intakes: ["feb"],
  source: "https://x",
  lastVerified: "2026-01-01",
  dataQuality: "primary",
  notes: null,
};

// A strong-fit signed-in profile (grade 72, IELTS 7, ~50k AUD budget).
const strongSections = {
  academic: { degree: "bachelors", gradeSystem: "percentage-nepal", gradePercent: 72 },
  english: { test: "ielts", overall: 7, listening: 7, reading: 7, writing: 7, speaking: 7 },
  "intended-study": { field: "computer-science", level: "masters" },
  finance: { total: 4_500_000, currency: "NPR" },
};

describe("freezePredictionForProgram (Decision B/C: signed-in adapter + server-derived assessment)", () => {
  beforeEach(() => {
    getPrimaryAssessmentForUser.mockReset();
    getProfile.mockReset();
    getProgram.mockReset();
    listAllUniversities.mockReset();
    insertPrediction.mockReset();
    getProfile.mockResolvedValue({ sections: strongSections });
    getProgram.mockResolvedValue(program);
    listAllUniversities.mockResolvedValue([uni]);
  });

  it("409s when the user has no primary assessment to anchor the prediction", async () => {
    getPrimaryAssessmentForUser.mockResolvedValue(null);
    const r = await freezePredictionForProgram(db, "owner1", "p1");
    expect(r).toEqual({ ok: false, status: 409, error: expect.any(String) });
    expect(insertPrediction).not.toHaveBeenCalled();
  });

  it("404s when the program is unknown", async () => {
    getPrimaryAssessmentForUser.mockResolvedValue({ id: "a1" });
    getProgram.mockResolvedValue(null);
    const r = await freezePredictionForProgram(db, "owner1", "ghost");
    expect(r).toEqual({ ok: false, status: 404, error: expect.any(String) });
  });

  it("freezes the recomputed verdict against the primary assessment (F16, server-side)", async () => {
    getPrimaryAssessmentForUser.mockResolvedValue({ id: "a1" });
    insertPrediction.mockResolvedValue({
      row: { id: "pred1", owner: "owner1", assessmentId: "a1", programId: "p1", verdict: "strong" },
      created: true,
    });
    const r = await freezePredictionForProgram(db, "owner1", "p1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(true);
    // The server recomputed the verdict; the client never supplied it.
    expect(insertPrediction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ owner: "owner1", assessmentId: "a1", programId: "p1", verdict: "strong" }),
    );
  });

  it("is idempotent — a re-freeze returns the existing prediction (created: false)", async () => {
    getPrimaryAssessmentForUser.mockResolvedValue({ id: "a1" });
    insertPrediction.mockResolvedValue({
      row: { id: "pred1", owner: "owner1", assessmentId: "a1", programId: "p1", verdict: "strong" },
      created: false,
    });
    const r = await freezePredictionForProgram(db, "owner1", "p1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(false);
  });
});
