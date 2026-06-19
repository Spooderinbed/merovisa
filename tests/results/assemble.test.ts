import { describe, it, expect } from "vitest";
import { assembleAssessment } from "@/lib/results/assemble";
import { CONFIG_VERSION, CONFIG_RULES_VERIFIED } from "@/lib/data/scoring-config";
import { TEST_PROGRAMS, TEST_UNIVERSITIES } from "../fixtures/catalog";
import type { StudentProfile } from "@/lib/scoring/types";

const assemble = (profile: StudentProfile, now: Date) =>
  assembleAssessment(profile, TEST_PROGRAMS, TEST_UNIVERSITIES, now);

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
    const payload = assemble(aarav, new Date("2026-06-03"));
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
    const payload = assemble(aarav, new Date("2026-06-03"));
    expect(payload.result.configVersion).toBe(CONFIG_VERSION);
  });

  it("stamps the rules-verified floor from the scoring config (F16)", () => {
    // The verdict card renders this date; it must originate in the scoring
    // config's provenance — not the destination-config record — and it rides
    // the payload so the date stays true to the snapshot it describes.
    const payload = assemble(aarav, new Date("2026-06-03"));
    expect(payload.rulesVerified).toBe(CONFIG_RULES_VERIFIED);
  });

  it("stamps the scoring-freshness flag from the config, respecting the clock (MV-04)", () => {
    // The verdict card degrades when a scoring-critical input is past its
    // reverifyBy. The flag must originate in the scoring config's provenance and
    // be computed against the assessment's clock — false while every input is
    // current, true once the dated DHA inputs age out.
    expect(assemble(aarav, new Date("2026-06-03")).rulesStale).toBe(false);
    expect(assemble(aarav, new Date("2099-01-01")).rulesStale).toBe(true);
  });

  it("carries the preference note for the chosen goal (PR -> 485 context)", () => {
    const payload = assemble(aarav, new Date("2026-06-03"));
    expect(payload.preferenceNote?.kind).toBe("pr-context");
  });

  it("ranks by lowest cost when that goal is chosen and chips the cheaper universities", () => {
    const payload = assemble({ ...aarav, goal: "lowest-cost" }, new Date("2026-06-03"));
    expect(payload.preferenceNote).toEqual({
      kind: "ranked",
      text: "Ordered by your priority: lowest total cost.",
    });
    // at least one surfaced match earns the Lower tuition chip
    expect(payload.matches.some((m) => m.preferenceChip?.text === "Lower tuition")).toBe(true);
    // tuition is non-decreasing within the first (strong) band
    const strong = payload.matches.filter((m) => m.verdict === "strong");
    const tuitions = strong.map((m) => m.program.tuitionMin ?? 0);
    expect([...tuitions].sort((a, b) => a - b)).toEqual(tuitions);
  });

  it("resolves not-sure to Australia before scoring so the DHA financial-capacity gate applies (#7)", () => {
    // A "not-sure" applicant delegates the corridor to us; NotSureFramingNotice tells
    // them the readout is the Nepal -> Australia standing. So the verdict must be scored
    // as Australia — including the DHA financial-capacity gate — not against the cheaper
    // not-sure cost band with the gate skipped (the audit's #7 trust gap).
    const underfunded: StudentProfile = {
      ...aarav,
      destination: "not-sure",
      budget: 35_000,
      budgetCurrency: "USD",
      fundingSource: "self-funded",
    };
    const notSure = assemble(underfunded, new Date("2026-06-03"));
    const australia = assemble(
      { ...underfunded, destination: "australia" },
      new Date("2026-06-03"),
    );

    // Identical to the Australia readout we resolve it to — same financial dimension,
    // same verdict — not a rosier not-sure score.
    expect(notSure.result.dimensions.financial).toEqual(australia.result.dimensions.financial);
    expect(notSure.result.verdict).toBe(australia.result.verdict);
    // The DHA gate actually fired (the bug skipped it entirely for not-sure).
    expect(
      notSure.result.dimensions.financial.factors.some((f) =>
        f.label.includes("DHA financial-capacity"),
      ),
    ).toBe(true);
  });
});
