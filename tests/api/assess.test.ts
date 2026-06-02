import { describe, it, expect } from "vitest";
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
    expect(json.result.verdict).toBeDefined();
    expect(json.matchedCount).toBeGreaterThan(0);
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
