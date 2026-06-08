import { describe, it, expect } from "vitest";
import { generatePlan } from "@/lib/plan/generator";

const policy = { nepalAssessmentLevel: "L3" as const };

describe("generatePlan", () => {
  it("returns the AL3 6-month seasoning item under Nepal AL3", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(items.some((i) => i.kind === "season-funds-six-months")).toBe(true);
  });

  it("requests grade + english + proof when profile is empty", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain("add-grade");
    expect(kinds).toContain("add-english-score");
    expect(kinds).toContain("upload-proof-of-funds");
  });

  it("enumerates the four DHA-accepted evidence paths in the proof-of-funds item", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    const proof = items.find((i) => i.kind === "upload-proof-of-funds");
    expect(proof).toBeTruthy();
    expect(proof?.body).toContain("money deposit held with a financial institution");
    expect(proof?.body).toContain("loan from a government or financial institution");
    expect(proof?.body).toContain("scholarship or sponsorship");
    expect(proof?.body).toContain("parents' or partner's annual income");
  });

  it("when english.overall set + reportUploaded=false, asks to upload report instead of asking for score", () => {
    const items = generatePlan({
      sections: { english: { overall: 7, reportUploaded: false } },
      primaryDestinationId: null, matches: [], policy,
    });
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain("upload-ielts-report");
    expect(kinds).not.toContain("add-english-score");
  });

  it("asks for gap reasons + evidence when years ≥ 1 but they're missing", () => {
    const items = generatePlan({
      sections: { gap: { years: 2 } },
      primaryDestinationId: null, matches: [], policy,
    });
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain("document-gap-reasons");
    expect(kinds).toContain("document-gap-evidence");
  });

  it("suggests safer options when all matches are reach + has primary", () => {
    const reachMatch = { verdict: "reach" as const, program: {} as never, university: {} as never, reasons: [], scoreSnapshot: { gradeGap: 0, englishGap: 0, bandGap: 0, tuitionGap: 0 } };
    const items = generatePlan({
      sections: {}, primaryDestinationId: "australia", matches: [reachMatch], policy,
    });
    expect(items.some((i) => i.kind === "add-safer-options")).toBe(true);
  });

  it("does not suggest safer options when there are strong matches", () => {
    const strongMatch = { verdict: "strong" as const, program: {} as never, university: {} as never, reasons: [], scoreSnapshot: { gradeGap: 0, englishGap: 0, bandGap: 0, tuitionGap: 0 } };
    const items = generatePlan({
      sections: {}, primaryDestinationId: "australia", matches: [strongMatch], policy,
    });
    expect(items.some((i) => i.kind === "add-safer-options")).toBe(false);
  });

  it("returns a stable order on repeated calls (kinds match)", () => {
    const a = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    const b = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(a.map((i) => i.kind)).toEqual(b.map((i) => i.kind));
  });

  it("adds the Genuine Student answers item for an Australian primary destination", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const gs = items.find((i) => i.kind === "prepare-gs-answers");
    expect(gs).toBeTruthy();
    expect(gs?.impact).toBe("high");
    expect(gs?.title).toContain("Genuine Student");
    expect(gs?.body).toContain("150 words");
  });

  it("does not add the Genuine Student item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "prepare-gs-answers")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "prepare-gs-answers")).toBe(false);
  });

  it("adds the Nepal remittance prep item when a funding source is set (B.012–B.016)", () => {
    const items = generatePlan({ sections: { finance: { source: "self-funded" } }, primaryDestinationId: null, matches: [], policy });
    const remit = items.find((i) => i.kind === "prepare-fund-remittance");
    expect(remit).toBeTruthy();
    expect(remit?.body).toContain("No Objection Certificate");
    expect(remit?.body).toContain("institution letter");
    expect(remit?.body).toContain("Nepal Rastra Bank");
    expect(remit?.body).toContain("MoEST portal");
  });

  it("omits the remittance prep item when no funding source is set", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(items.some((i) => i.kind === "prepare-fund-remittance")).toBe(false);
  });

  it("omits the remittance prep item for scholarship-dependent funding", () => {
    const items = generatePlan({ sections: { finance: { source: "scholarship-dependent" } }, primaryDestinationId: null, matches: [], policy });
    expect(items.some((i) => i.kind === "prepare-fund-remittance")).toBe(false);
  });

  it("adds the apply-for-NOC item for an Australian primary destination (B.017–B.024)", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const noc = items.find((i) => i.kind === "apply-for-noc");
    expect(noc).toBeTruthy();
    expect(noc?.impact).toBe("medium");
    expect(noc?.title).toContain("NOC");
    expect(noc?.body).toContain("academic transcript");
    expect(noc?.body).toContain("original documents");
    expect(noc?.body).toContain("MoEST");
  });

  it("does not add the apply-for-NOC item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "apply-for-noc")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "apply-for-noc")).toBe(false);
  });

  it("adds the translate-and-certify item for an Australian primary destination (A.026–A.028, A.041–A.042)", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const prep = items.find((i) => i.kind === "translate-certify-documents");
    expect(prep).toBeTruthy();
    expect(prep?.impact).toBe("medium");
    expect(prep?.title).toContain("Translate");
    expect(prep?.body).toContain("outside Australia");
    expect(prep?.body).toContain("certified copies of some identity documents");
  });

  it("does not add the translate-and-certify item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "translate-certify-documents")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "translate-certify-documents")).toBe(false);
  });
});
