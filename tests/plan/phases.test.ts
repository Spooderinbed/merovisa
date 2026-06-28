import { describe, it, expect } from "vitest";
import {
  PLAN_PHASES,
  phaseOf,
  phaseOrder,
  isVisaPrep,
  visaPrepOrder,
  journeyRank,
  VISA_PREP_KINDS,
} from "@/lib/plan/phases";

describe("PLAN_PHASES", () => {
  it("is the A–E journey spine, in order, each with a title and blurb", () => {
    expect(PLAN_PHASES.map((p) => p.id)).toEqual(["A", "B", "C", "D", "E"]);
    for (const p of PLAN_PHASES) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe("phaseOf", () => {
  it("places profile + shortlist work in Phase A (decide)", () => {
    for (const k of [
      "set-name",
      "add-grade",
      "add-english-score",
      "upload-ielts-report",
      "set-intended-field",
      "add-safer-options",
      "add-work-docs",
      "document-gap-reasons",
      "document-gap-evidence",
    ]) {
      expect(phaseOf(k)).toBe("A");
    }
  });

  it("places the passport prerequisite in Phase B (apply)", () => {
    expect(phaseOf("start-passport-process")).toBe("B");
  });

  it("places post-offer place-confirmation work in Phase C (NOC, fund remittance)", () => {
    expect(phaseOf("apply-for-noc")).toBe("C");
    expect(phaseOf("prepare-fund-remittance")).toBe("C");
  });

  it("places Subclass 500 evidence in Phase D (visa prep)", () => {
    for (const k of [
      "upload-proof-of-funds",
      "season-funds-six-months",
      "certify-sponsor-income",
      "prepare-gs-answers",
      "translate-certify-documents",
      "prepare-health-exam",
      "prepare-biometrics",
      "prepare-police-certificate",
      "verify-agent-marn",
    ]) {
      expect(phaseOf(k)).toBe("D");
    }
  });

  it("defaults unknown visa-prep kinds to D and everything else to A (forward compatible)", () => {
    expect(phaseOf("future-profile-thing")).toBe("A");
    // A future kind added to VISA_PREP_KINDS auto-lands in the visa phase.
    expect(VISA_PREP_KINDS.every((k) => phaseOf(k) === "C" || phaseOf(k) === "D")).toBe(true);
  });
});

describe("phaseOf — MV-57 journey-spine connective steps", () => {
  it("submit-university-applications lands in Phase B (apply)", () => {
    expect(phaseOf("submit-university-applications")).toBe("B");
  });

  it("accept-offer and get-coe land in Phase C (confirm your place)", () => {
    expect(phaseOf("accept-offer")).toBe("C");
    expect(phaseOf("get-coe")).toBe("C");
  });

  it("arrange-oshc and lodge-subclass-500 land in Phase D (prepare your visa)", () => {
    expect(phaseOf("arrange-oshc")).toBe("D");
    expect(phaseOf("lodge-subclass-500")).toBe("D");
  });

  it("track-visa-decision lands in Phase E (visa decision)", () => {
    expect(phaseOf("track-visa-decision")).toBe("E");
  });

  it("the six connective kinds are NOT visa-prep (no checklist mirror, drift guard untouched)", () => {
    for (const k of [
      "submit-university-applications",
      "accept-offer",
      "get-coe",
      "arrange-oshc",
      "lodge-subclass-500",
      "track-visa-decision",
    ]) {
      expect(isVisaPrep(k)).toBe(false);
    }
  });
});

describe("journeyRank — within-phase primary ordering key", () => {
  it("orders Phase C: accept-offer < apply-for-noc < prepare-fund-remittance < get-coe", () => {
    expect(journeyRank("accept-offer")).toBeLessThan(journeyRank("apply-for-noc"));
    expect(journeyRank("apply-for-noc")).toBeLessThan(journeyRank("prepare-fund-remittance"));
    expect(journeyRank("prepare-fund-remittance")).toBeLessThan(journeyRank("get-coe"));
  });

  it("ranks lodge-subclass-500 after every other Phase D prep step", () => {
    for (const k of [
      "arrange-oshc",
      "upload-proof-of-funds",
      "season-funds-six-months",
      "prepare-gs-answers",
      "translate-certify-documents",
      "prepare-health-exam",
      "prepare-biometrics",
      "prepare-police-certificate",
      "verify-agent-marn",
      "certify-sponsor-income",
    ]) {
      expect(journeyRank(k)).toBeLessThan(journeyRank("lodge-subclass-500"));
    }
  });

  it("gives submit-university-applications a rank (first in B, ahead of any unranked default)", () => {
    expect(journeyRank("submit-university-applications")).toBeLessThan(journeyRank("start-passport-process"));
  });

  it("gives unranked kinds a single shared default so existing A/B/D order is preserved", () => {
    // Two unranked, same-phase kinds tie on journeyRank — their relative order then falls
    // through to the existing visaPrepOrder → impact → id keys, unchanged.
    expect(journeyRank("set-name")).toBe(journeyRank("add-grade"));
    expect(journeyRank("upload-proof-of-funds")).toBe(journeyRank("season-funds-six-months"));
  });
});

describe("phaseOrder", () => {
  it("ranks phases A < B < C < D < E so the plan reads as a sequence", () => {
    expect(phaseOrder("add-grade")).toBeLessThan(phaseOrder("start-passport-process"));
    expect(phaseOrder("start-passport-process")).toBeLessThan(phaseOrder("apply-for-noc"));
    expect(phaseOrder("apply-for-noc")).toBeLessThan(phaseOrder("prepare-gs-answers"));
  });
});

describe("visa-prep helpers (unchanged contract)", () => {
  it("still recognises and orders the curated visa-prep kinds", () => {
    expect(isVisaPrep("prepare-gs-answers")).toBe(true);
    expect(isVisaPrep("add-grade")).toBe(false);
    expect(visaPrepOrder("prepare-gs-answers")).toBeLessThan(visaPrepOrder("prepare-police-certificate"));
  });
});
