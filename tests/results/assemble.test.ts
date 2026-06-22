import { describe, it, expect, vi } from "vitest";

// assemble.ts now reaches lib/matches/evidence.ts, which carries `import "server-only"`
// (the build-time boundary guard). Neutralise that throw in the node test env, as the
// other server-module tests (e.g. re-score.test.ts) do.
vi.mock("server-only", () => ({}));

import { assembleAssessment } from "@/lib/results/assemble";
import { CONFIG_VERSION, CONFIG_RULES_VERIFIED } from "@/lib/data/scoring-config";
import { TEST_PROGRAMS, TEST_UNIVERSITIES } from "../fixtures/catalog";
import type { StudentProfile } from "@/lib/scoring/types";
import type { Program, University } from "@/lib/programs/types";

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

  it("attaches each match's DHA Nepal evidence level for resolvable catalogue universities (MV-25)", () => {
    // Inject a catalogue whose university id resolves through cricos-lookup
    // (sydney → CRICOS 00026A → Streamlined), proving the assemble seam carries the
    // level onto the payload's matches — the data the anonymous results MatchCard reads.
    const sydney: University = {
      id: "sydney",
      country: "AU",
      name: "University of Sydney",
      city: "Sydney",
      rankingTier: 1,
      source: "https://www.sydney.edu.au",
      lastVerified: "2026-06-04",
      dataQuality: "primary",
    };
    const program: Program = { ...TEST_PROGRAMS[0]!, id: "syd-mit", universityId: "sydney" };
    const payload = assembleAssessment(aarav, [program], [sydney], new Date("2026-06-03"));
    expect(payload.matches.length).toBeGreaterThan(0);
    expect(payload.matches.every((m) => m.evidence?.level === "Streamlined")).toBe(true);
  });

  it("leaves matches without evidence when the university does not resolve to a CRICOS provider", () => {
    // The default fixtures use ids (u-melb/u-uts) that aren't catalogue ids, so no
    // match carries an evidence level — present-when-known holds end-to-end.
    const payload = assemble(aarav, new Date("2026-06-03"));
    expect(payload.matches.length).toBeGreaterThan(0);
    expect(payload.matches.some((m) => m.evidence)).toBe(false);
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
