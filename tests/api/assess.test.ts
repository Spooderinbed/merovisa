import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getUser } = vi.hoisted(() => ({
  getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/repo", () => ({
  createAnonymousAssessment: vi.fn().mockResolvedValue(null),
  getPrimaryAssessmentForUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/profiles/repo", () => ({
  getProfile: vi.fn().mockResolvedValue(null),
  upsertProfile: vi.fn().mockResolvedValue(null),
}));

import { POST } from "@/app/api/assess/route";

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

function req(body: unknown): Request {
  return new Request("http://localhost/api/assess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/assess", () => {
  it("returns 200 with an assessment payload for a valid profile", async () => {
    const res = await POST(req(validProfile));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.payload.result.verdict).toBeDefined();
    expect(json.payload.matchedCount).toBeGreaterThan(0);
  });

  it("returns 422 for an invalid profile", async () => {
    const res = await POST(req({ ...validProfile, grade: 999 }));
    expect(res.status).toBe(422);
  });

  it("returns 400 for malformed JSON", async () => {
    const bad = new Request("http://localhost/api/assess", { method: "POST", body: "{not json" });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});
