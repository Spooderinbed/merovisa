import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/repo", () => ({
  createAnonymousAssessment: vi.fn(),
}));

import { POST } from "@/app/api/assess/route";
import { createAnonymousAssessment } from "@/lib/assessments/repo";

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

describe("POST /api/assess (persistence)", () => {
  beforeEach(() => vi.mocked(createAnonymousAssessment).mockReset());

  it("persists the assessment and returns its id alongside the payload", async () => {
    vi.mocked(createAnonymousAssessment).mockResolvedValue("assessment-123");
    const res = await POST(req(validProfile));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("assessment-123");
    expect(json.payload.result.verdict).toBeDefined();
    expect(json.payload.matchedCount).toBeGreaterThan(0);
  });

  it("still returns the payload with id:null when persistence fails", async () => {
    vi.mocked(createAnonymousAssessment).mockResolvedValue(null);
    const res = await POST(req(validProfile));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBeNull();
    expect(json.payload.result.verdict).toBeDefined();
  });

  it("returns 422 for an invalid profile (no persistence attempted)", async () => {
    const res = await POST(req({ ...validProfile, grade: 999 }));
    expect(res.status).toBe(422);
    expect(createAnonymousAssessment).not.toHaveBeenCalled();
  });
});
