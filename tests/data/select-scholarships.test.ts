import { describe, it, expect } from "vitest";
import { selectScholarships } from "@/lib/data/select-scholarships";

describe("selectScholarships", () => {
  const rows = selectScholarships();

  it("leads with the Nepal-scoped, fully-funded Australia Awards Scholarship", () => {
    expect(rows[0]?.id).toBe("australia-awards-nepal");
    expect(rows[0]?.name).toBe("Australia Awards Scholarship");
    // Fully funded — the four DFAT inclusions should read in the what-it-covers line.
    expect(rows[0]?.whatItCovers).toMatch(/full tuition/i);
  });

  it("includes the au-scholarships rows after Australia Awards", () => {
    const ids = rows.map((r) => r.id);
    expect(ids).toContain("destination-australia-scholarship");
    expect(ids).toContain("unimelb-graduate-research-scholarship");
    expect(ids).toContain("university-of-sydney-scholarships");
    // Australia Awards is first; the others follow.
    expect(ids.indexOf("australia-awards-nepal")).toBe(0);
  });

  it("renders amounts currency-honest, with the provenance 'more than'/'over' qualifiers", () => {
    const destination = rows.find((r) => r.id === "destination-australia-scholarship");
    expect(destination?.amount).toBe("AUD 15,000 per year");

    const unimelb = rows.find((r) => r.id === "unimelb-graduate-research-scholarship");
    // J2.008 records this as a "more than 300" floor — the qualifier must survive.
    expect(unimelb?.amount).toMatch(/more than 300/i);
  });

  it("carries a source URL and a verified date on every row for traceability", () => {
    for (const row of rows) {
      expect(row.source, row.name).toMatch(/^https?:\/\//);
      expect(row.lastVerified, row.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("gives every row a non-empty provider/who line", () => {
    for (const row of rows) {
      expect(row.who.length, row.name).toBeGreaterThan(0);
    }
  });

  it("surfaces the held Australia Awards application window as a readable key-dates line", () => {
    // applicationOpens 2026-02-01 / applicationCloses 2026-04-30 are held in the
    // source record but were never surfaced. MV-54 renders them readably.
    const awards = rows.find((r) => r.id === "australia-awards-nepal");
    expect(awards?.applicationWindow).toMatch(/open/i);
    expect(awards?.applicationWindow).toMatch(/close/i);
    expect(awards?.applicationWindow).toMatch(/1 Feb 2026/);
    expect(awards?.applicationWindow).toMatch(/30 Apr 2026/);
  });

  it("leaves the application window undefined for funders that publish no fixed dates (honest absence)", () => {
    // au-scholarships records hold no open/close dates; we never invent one.
    for (const id of [
      "destination-australia-scholarship",
      "unimelb-graduate-research-scholarship",
      "university-of-sydney-scholarships",
    ]) {
      expect(rows.find((r) => r.id === id)?.applicationWindow, id).toBeUndefined();
    }
  });

  it("flags research-degree-only scholarships so coursework applicants aren't misled", () => {
    // The UniMelb Graduate Research Scholarship funds HDR candidates only; a
    // coursework master's applicant can't use it. Surface that plainly.
    const unimelb = rows.find((r) => r.id === "unimelb-graduate-research-scholarship");
    expect(unimelb?.studyEligibility).toMatch(/research degrees only/i);
  });

  it("frames the University of Sydney pool figure as an institution-wide total, not a single applyable award", () => {
    const sydney = rows.find((r) => r.id === "university-of-sydney-scholarships");
    // The $135M is real and sourced (J2.009), so it is kept — but it is the
    // University's whole scholarship spend, not one award a student receives. The
    // amount must carry that qualifier so it can never read as a single award.
    expect(sydney?.amount).toMatch(/135 million/i);
    expect(sydney?.amount).toMatch(/across all its scholarships/i);
    // Sydney's pool spans coursework + research, so no research-only restriction
    // is claimed for the row (honest absence — we don't have it ledgered).
    expect(sydney?.studyEligibility).toBeUndefined();
  });

  it("leaves study-eligibility undefined where the award isn't research-restricted (honest absence)", () => {
    // Australia Awards (coursework master's, signalled in its who-line),
    // Destination Australia (any level, regional), and the mixed Sydney pool carry
    // no research restriction — we never invent one.
    for (const id of [
      "australia-awards-nepal",
      "destination-australia-scholarship",
      "university-of-sydney-scholarships",
    ]) {
      expect(rows.find((r) => r.id === id)?.studyEligibility, id).toBeUndefined();
    }
  });
});
