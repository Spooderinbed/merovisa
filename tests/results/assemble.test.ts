import { describe, it, expect } from "vitest";
import { assembleAssessment } from "@/lib/results/assemble";
import { CONFIG_VERSION } from "@/lib/data/scoring-config";
import type { StudentProfile } from "@/lib/scoring/types";

const aarav: StudentProfile = {
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

describe("assembleAssessment", () => {
  it("returns a complete payload", () => {
    const payload = assembleAssessment(aarav, new Date("2026-06-03"));
    expect(payload.result.verdict).toBeDefined();
    expect(payload.matchedCount).toBe(payload.matches.length);
    expect(payload.matches.length).toBeGreaterThan(0);
    expect(payload.intake.nearest).toBeDefined();
    expect(payload.accuracy.level).toBe("Basic");
  });

  it("stamps the config version into the persisted result payload", () => {
    // The whole payload is serialized into assessments.result (Json), so the
    // config version must ride inside result — that is how a new assessment
    // persists which data figures it used (Phase 6, no DB migration).
    const payload = assembleAssessment(aarav, new Date("2026-06-03"));
    expect(payload.result.configVersion).toBe(CONFIG_VERSION);
  });
});
