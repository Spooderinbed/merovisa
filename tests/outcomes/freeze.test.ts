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
import { CatalogReadError } from "@/lib/programs/errors";
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

// A strong-fit signed-in profile (grade 72, IELTS 7, ~72k AUD budget).
//
// MV-120: the budget was 4.5M NPR (~50k AUD) back when a budget was judged against
// tuition alone. Under the real AU capacity model this student needs tuition (40k) +
// living (29,710) = 69,710 AUD, so ~50k is a reach and "strong-fit" was false. Raised
// so the fixture means what its name says, rather than opting out of the capacity
// model to keep the old number green.
//
// MV-132: raised again, 6.5M → 7.8M NPR, for the same reason. The ~72k AUD intent was
// computed at the old NPR 90 ≈ A$1; at the corrected NRB rate (108.14) 6.5M NPR is only
// ~60k AUD, back under the floor.
const strongSections = {
  academic: { degree: "bachelors", gradeSystem: "percentage-nepal", gradePercent: 72 },
  english: { test: "ielts", overall: 7, listening: 7, reading: 7, writing: 7, speaking: 7 },
  "intended-study": { field: "computer-science", level: "masters" },
  finance: { total: 7_800_000, currency: "NPR" },
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

  // MV-133: "this program does not exist" and "we couldn't read the catalogue" are
  // different answers. The 404 above is honest only when the query answered.
  it("503s (not 404 'unknown program') when the program read fails", async () => {
    getPrimaryAssessmentForUser.mockResolvedValue({ id: "a1" });
    getProgram.mockRejectedValue(new CatalogReadError("programs"));
    const r = await freezePredictionForProgram(db, "owner1", "p1");
    expect(r).toEqual({ ok: false, status: 503, error: expect.any(String) });
    expect(insertPrediction).not.toHaveBeenCalled();
  });

  it("503s (not 409 'missing its university') when the university read fails", async () => {
    getPrimaryAssessmentForUser.mockResolvedValue({ id: "a1" });
    listAllUniversities.mockRejectedValue(new CatalogReadError("universities"));
    const r = await freezePredictionForProgram(db, "owner1", "p1");
    expect(r).toEqual({ ok: false, status: 503, error: expect.any(String) });
    expect(insertPrediction).not.toHaveBeenCalled();
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

  it("returns a not-enough-data status and persists no prediction when the profile lacks verdict inputs (C-4)", async () => {
    // A name-only signed-in profile: no grade/English/budget. buildPrediction would run
    // computeMatch on inputs floored to 0 and freeze a fabricated "Reach" verdict-of-
    // record. Abstain instead — return a 422 and write nothing (audit C-4).
    getPrimaryAssessmentForUser.mockResolvedValue({ id: "a1" });
    getProfile.mockResolvedValue({ sections: { personal: { name: "Asha" } } });
    const r = await freezePredictionForProgram(db, "owner1", "p1");
    expect(r).toEqual({ ok: false, status: 422, error: expect.any(String) });
    expect(insertPrediction).not.toHaveBeenCalled();
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
