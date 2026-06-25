import { describe, it, expect } from "vitest";
import {
  PLAN_PHASES,
  phaseOf,
  phaseOrder,
  isVisaPrep,
  visaPrepOrder,
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
