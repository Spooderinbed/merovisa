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
    // Read-through F8 (+travel): DHA's rule covers travel too, and the Class A convention is
    // Nepali banking practice — a separate sentence, not part of DHA's wording.
    expect(proof?.body).toMatch(/covering travel, AUD 29[,.]?710 living costs, and first-year tuition/);
    expect(proof?.body).toContain(
      "In Nepal, a bank statement or loan sanction letter from a Class A commercial bank is the usual route.",
    );
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
    expect(gs?.body).toContain("150 words or less, in English");
    expect(gs?.body).toContain(
      "wanting permanent residence later doesn't count against you as long as your study plan and stay are genuine under the visa rules",
    );
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

  it("adds the prepare-health-exam item for an Australian primary destination (A.033, A.035, A.036, A.038)", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const med = items.find((i) => i.kind === "prepare-health-exam");
    expect(med).toBeTruthy();
    expect(med?.impact).toBe("medium");
    expect(med?.title).toContain("health examination");
    expect(med?.body).toContain("panel physician or clinic");
    expect(med?.body).toContain("12 months");
  });

  it("does not add the prepare-health-exam item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "prepare-health-exam")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "prepare-health-exam")).toBe(false);
  });

  it("adds the prepare-biometrics item for an Australian primary destination (A.031 + reuse C.123/C.127)", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const bio = items.find((i) => i.kind === "prepare-biometrics");
    expect(bio).toBeTruthy();
    expect(bio?.impact).toBe("medium");
    expect(bio?.title).toContain("biometrics");
    expect(bio?.body).toContain("AUI");
    expect(bio?.body).toMatch(/2[,.]?365/); // locale-tolerant fee assertion
  });

  it("does not add the prepare-biometrics item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "prepare-biometrics")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "prepare-biometrics")).toBe(false);
  });

  it("adds the prepare-police-certificate item for an Australian primary destination (A.039)", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const police = items.find((i) => i.kind === "prepare-police-certificate");
    expect(police).toBeTruthy();
    expect(police?.impact).toBe("medium");
    expect(police?.title.toLowerCase()).toContain("police certificate");
    expect(police?.body).toContain("12 months or more");
    expect(police?.body).toContain("after you turned 16");
  });

  it("does not add the prepare-police-certificate item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "prepare-police-certificate")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "prepare-police-certificate")).toBe(false);
  });

  it("enriches the police action with the OPCR route, turnaround, and validity (A.095/096/097, A.098/099, A.102)", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const police = items.find((i) => i.kind === "prepare-police-certificate");
    expect(police?.body).toContain("OPCR");
    expect(police?.body).toContain("Nagarik App");
    expect(police?.body).toContain("working days");
    expect(police?.body).toContain("3 months");
  });

  it("adds start-passport-process when hasPassport is false, regardless of destination (A.043-046, A.049)", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy, hasPassport: false });
    const pp = items.find((i) => i.kind === "start-passport-process");
    expect(pp).toBeTruthy();
    expect(pp?.impact).toBe("medium");
    expect(pp?.title).toBe("Start your passport application");
    expect(pp?.body).toContain("pre-enrolment");
    expect(pp?.body).toContain("barcode");
    expect(pp?.body).toContain("working days");
  });

  it("does not add start-passport-process when a passport is uploaded or when hasPassport is omitted", () => {
    const has = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy, hasPassport: true });
    expect(has.some((i) => i.kind === "start-passport-process")).toBe(false);
    const omitted = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    expect(omitted.some((i) => i.kind === "start-passport-process")).toBe(false);
  });

  // Honest lift estimates (visual audit 2026-06-10, fix #4): the engine can never
  // re-classify possible → strong from a report upload (min band ≤ overall), so the
  // lift line counts only the possible matches actually gated on per-band scores and
  // claims verification, not upgrade.
  describe("liftEstimate honesty", () => {
    const mkMatch = (
      verdict: "strong" | "possible" | "reach",
      bandGap: number,
    ) => ({
      verdict,
      program: {} as never,
      university: {} as never,
      reasons: [],
      scoreSnapshot: { gradeGap: 0, englishGap: 0, bandGap, tuitionGap: 0 },
    });

    it("upload-ielts-report counts only band-gated possible matches and never promises re-classification", () => {
      const matches = [
        mkMatch("possible", 0.5), // band-gated possible — counted
        mkMatch("possible", 0),   // possible but band already clears — not counted
        mkMatch("strong", 0),     // not possible
        mkMatch("reach", 1),      // band-gated but reach — not counted
      ];
      const items = generatePlan({
        sections: { english: { overall: 6.5, reportUploaded: false } },
        primaryDestinationId: null, matches, policy,
      });
      const upload = items.find((i) => i.kind === "upload-ielts-report");
      expect(upload?.liftEstimate).toBe("Verifies per-band requirements on 1 possible match");
    });

    it("upload-ielts-report pluralizes the band-gated count", () => {
      const matches = [mkMatch("possible", 0.5), mkMatch("possible", 1)];
      const items = generatePlan({
        sections: { english: { overall: 6, reportUploaded: false } },
        primaryDestinationId: null, matches, policy,
      });
      const upload = items.find((i) => i.kind === "upload-ielts-report");
      expect(upload?.liftEstimate).toBe("Verifies per-band requirements on 2 possible matches");
    });

    it("upload-ielts-report falls back to the band-aware line when no possible match is band-gated", () => {
      const matches = [mkMatch("possible", 0), mkMatch("possible", 0)];
      const items = generatePlan({
        sections: { english: { overall: 7, reportUploaded: false } },
        primaryDestinationId: null, matches, policy,
      });
      const upload = items.find((i) => i.kind === "upload-ielts-report");
      expect(upload?.liftEstimate).toBe("Sharpens band-aware verdicts");
    });

    it("proof-of-funds and AL3 seasoning carry no unverifiable superlatives", () => {
      const items = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
      const proof = items.find((i) => i.kind === "upload-proof-of-funds");
      const season = items.find((i) => i.kind === "season-funds-six-months");
      expect(proof?.liftEstimate).toBe("Core financial evidence for your visa case");
      expect(season?.liftEstimate).toBe("Addresses a documented refusal ground — financial capacity");
    });

    it("the permanently rejected F2 wording never returns (F2-A closure)", () => {
      const blob = JSON.stringify(
        generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy }),
      );
      expect(blob).not.toMatch(/Assessment Level/i);
      expect(blob).not.toMatch(/case officers?/i);
      expect(blob).not.toMatch(/AUD 5,000/);
    });

    it("adds the verify-agent-marn action with the conditional framing (user-locked copy)", () => {
      const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
      const agent = items.find((i) => i.kind === "verify-agent-marn");
      expect(agent?.title).toBe("If you're using an agent, verify their MARN");
      expect(agent?.body).toBe(
        "If you pay for immigration help, DHA's own guidance is to use a registered migration agent listed with OMARA. Confirm your agent on the OMARA public register — search it by their MARN (Migration Agent Registration Number) — before you pay or sign anything. Not using an agent? Dismiss this step — you can apply for the visa yourself.",
      );
      expect(agent?.liftEstimate).toBeUndefined();
      expect(agent?.timeEstimate).toBe("10 minutes");
    });

    it("emits certify-sponsor-income only for sponsor-backed funding (slice 6, user-locked copy)", () => {
      const body =
        "If a parent or family member funds your study, their income needs to be documented, not just stated. Ward offices certify each income type with specific papers — Lalitpur Metropolitan City's published list: rental income needs the tenancy agreement; business or agricultural income the business-registration certificate plus audit report; salary or pension the original letter from the employer; fixed-deposit or savings interest a bank certificate; foreign income a recommendation letter authenticated by the Nepali embassy in that country or that country's embassy in Nepal. For the English income statement, include citizenship and relationship certificates. Gather the set for your sponsor's income type before you go.";
      const items = generatePlan({ sections: { finance: { source: "parents-family" } }, primaryDestinationId: "australia", matches: [], policy });
      const cert = items.find((i) => i.kind === "certify-sponsor-income");
      expect(cert?.title).toBe("Certify your sponsor's income at the ward office");
      expect(cert?.body).toBe(body);
      expect(cert?.impact).toBe("medium");
      expect(cert?.liftEstimate).toBeUndefined();
      expect(cert?.timeEstimate).toBe("1-2 days");
      const mixed = generatePlan({ sections: { finance: { source: "mixed" } }, primaryDestinationId: null, matches: [], policy });
      expect(mixed.some((i) => i.kind === "certify-sponsor-income")).toBe(true);
      const self = generatePlan({ sections: { finance: { source: "self-funded" } }, primaryDestinationId: null, matches: [], policy });
      expect(self.some((i) => i.kind === "certify-sponsor-income")).toBe(false);
    });
  });
});
