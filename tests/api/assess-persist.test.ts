import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  createAnonymousAssessment, getPrimaryAssessmentForCase, getProfileForCase, upsertProfileForCase, getUser,
  adminInsertSingle, invalidatePlan,
} = vi.hoisted(() => ({
  createAnonymousAssessment: vi.fn(),
  getPrimaryAssessmentForCase: vi.fn(),
  getProfileForCase: vi.fn(),
  upsertProfileForCase: vi.fn(),
  getUser: vi.fn(),
  adminInsertSingle: vi.fn(),
  invalidatePlan: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({ single: adminInsertSingle }),
      }),
    }),
  }),
}));
vi.mock("@/lib/assessments/repo", () => ({
  createAnonymousAssessment,
  getPrimaryAssessmentForCase,
}));
vi.mock("@/lib/profiles/repo", () => ({ getProfileForCase, upsertProfileForCase }));
vi.mock("@/lib/plan/invalidate", () => ({ invalidatePlan }));

// MV-157: every migrated route and page resolves the actor's personal case and
// authorizes it before its first query. Both are mocked to the happy path here;
// the denial branch is asserted where the route owns it.
const { resolvePersonalCaseId, ensurePersonalCase, checkCasePermission, caseBindColumns, adoptOwnerKeyedResidue } =
  vi.hoisted(() => ({
    resolvePersonalCaseId: vi.fn(),
    ensurePersonalCase: vi.fn(),
    checkCasePermission: vi.fn(),
    caseBindColumns: vi.fn(),
    adoptOwnerKeyedResidue: vi.fn(),
  }));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));
// The signed-in insert derives `owner` from `cases.student_user_id` through the
// dual-write choke point instead of reading it off the session a second time
// (review MAJOR 3), and adopts MV-155 residue on a 23505 (review MAJOR 1b).
vi.mock("@/lib/cases/dual-write", () => ({ caseBindColumns }));
vi.mock("@/lib/cases/residue", () => ({ adoptOwnerKeyedResidue }));
beforeEach(() => {
  resolvePersonalCaseId.mockResolvedValue("case-1");
  ensurePersonalCase.mockResolvedValue("case-1");
  checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
  caseBindColumns.mockResolvedValue({ case_id: "case-1", owner: "u1" });
  adoptOwnerKeyedResidue.mockResolvedValue(0);
});
vi.mock("@/lib/programs/repo", async () => {
  const { TEST_PROGRAMS, TEST_UNIVERSITIES } = await import("../fixtures/catalog");
  return {
    listAllPrograms: vi.fn().mockResolvedValue(TEST_PROGRAMS),
    listAllUniversities: vi.fn().mockResolvedValue(TEST_UNIVERSITIES),
  };
});

import { POST } from "@/app/api/assess/route";
import { CatalogReadError } from "@/lib/programs/errors";

const validProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getFullYear() - 1,
  gapReasons: ["worked"],
  englishStatus: "taken",
  englishScore: 7,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

const req = (body: unknown) =>
  new Request("http://localhost/api/assess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/assess", () => {
  beforeEach(() => {
    createAnonymousAssessment.mockReset();
    getPrimaryAssessmentForCase.mockReset();
    getProfileForCase.mockReset();
    upsertProfileForCase.mockReset();
    getUser.mockReset();
    adminInsertSingle.mockReset();
    invalidatePlan.mockReset();
  });

  describe("anonymous flow", () => {
    it("persists the assessment and returns its id alongside the payload", async () => {
      getUser.mockResolvedValue({ data: { user: null } });
      createAnonymousAssessment.mockResolvedValue("assessment-123");
      const res = await POST(req(validProfile));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe("assessment-123");
      expect(json.payload.result.verdict).toBeDefined();
      expect(json.payload.matchedCount).toBeGreaterThan(0);
      expect(invalidatePlan).not.toHaveBeenCalled();
    });

    it("still returns the payload with id:null when persistence fails", async () => {
      getUser.mockResolvedValue({ data: { user: null } });
      createAnonymousAssessment.mockResolvedValue(null);
      const res = await POST(req(validProfile));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBeNull();
      expect(json.payload.result.verdict).toBeDefined();
      expect(invalidatePlan).not.toHaveBeenCalled();
    });
  });

  it("returns 422 for an invalid profile (no persistence attempted)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ ...validProfile, grade: 999 }));
    expect(res.status).toBe(422);
    expect(createAnonymousAssessment).not.toHaveBeenCalled();
  });

  describe("signed-in flow", () => {
    it("persists with owner + is_primary when user has no prior primary", async () => {
      getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: { full_name: "Aarav" } } } });
      getPrimaryAssessmentForCase.mockResolvedValue(null);
      getProfileForCase.mockResolvedValue(null);
      upsertProfileForCase.mockResolvedValue("p1");
      adminInsertSingle.mockResolvedValue({ data: { id: "as-1" }, error: null });

      const res = await POST(req(validProfile));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe("as-1");
      expect(createAnonymousAssessment).not.toHaveBeenCalled();
      expect(upsertProfileForCase).toHaveBeenCalled();
      expect(invalidatePlan).toHaveBeenCalled();
    });

    it("does not bootstrap profile when user already has one", async () => {
      getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: {} } } });
      getPrimaryAssessmentForCase.mockResolvedValue({ id: "old", owner: "u1" });
      getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 0 });
      adminInsertSingle.mockResolvedValue({ data: { id: "as-2" }, error: null });

      const res = await POST(req(validProfile));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe("as-2");
      expect(upsertProfileForCase).not.toHaveBeenCalled();
      expect(invalidatePlan).toHaveBeenCalled();
    });

    // MV-133: the plan rebuild is a derived side-effect, and now that catalogue reads
    // throw it can fail on its own. The assessment WAS saved — reporting "failed to save"
    // would be the same class of lie in reverse (mirrors the caught-and-logged treatment
    // invalidatePlan already gets at every other call site).
    it("still reports the saved assessment when the derived plan rebuild fails", async () => {
      getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: {} } } });
      getPrimaryAssessmentForCase.mockResolvedValue({ id: "old", owner: "u1" });
      getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 0 });
      adminInsertSingle.mockResolvedValue({ data: { id: "as-3" }, error: null });
      invalidatePlan.mockRejectedValue(new CatalogReadError("programs"));

      const res = await POST(req(validProfile));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe("as-3");
    });

    it("returns 500 (not 200) when persistence throws for an authenticated user", async () => {
      getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: {} } } });
      getPrimaryAssessmentForCase.mockRejectedValue(new Error("db down"));

      const res = await POST(req(validProfile));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Failed to save assessment");
      // Payload is still included so the client can display results even on failure
      expect(json.payload.result.verdict).toBeDefined();
    });

    it("returns 500 when the insert returns an error value (not a throw) for an authed user", async () => {
      // PostgREST reports a failed write as `error`, not a throw — the route must
      // still surface it instead of returning 200 with id:null (MV-02).
      getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: {} } } });
      getPrimaryAssessmentForCase.mockResolvedValue(null);
      getProfileForCase.mockResolvedValue(null);
      adminInsertSingle.mockResolvedValue({ data: null, error: { message: "insert failed" } });

      const res = await POST(req(validProfile));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Failed to save assessment");
      expect(json.payload.result.verdict).toBeDefined();
      // Dependent writes are skipped once the primary insert failed.
      expect(upsertProfileForCase).not.toHaveBeenCalled();
      expect(invalidatePlan).not.toHaveBeenCalled();
    });
  });
});
