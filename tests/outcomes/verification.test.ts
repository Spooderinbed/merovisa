import { describe, it, expect } from "vitest";
import { classifyEvidence } from "@/lib/outcomes/verification";

describe("classifyEvidence — inline forward (Codex change #1)", () => {
  it("downgrades an inline forward to a self-report (never DKIM-eligible)", () => {
    const r = classifyEvidence({ captureMethod: "inline_forward", dkimResult: "pass", strongIdentifierMatches: 5 });
    expect(r.source).toBe("self_reported");
    expect(r.evidenceSubtype).toBeNull();
    expect(r.rejected).toBe(false);
    expect(r.isDraft).toBe(true);
  });
});

describe("classifyEvidence — DKIM forwarded .eml", () => {
  it("promotes to document_verified only with a DKIM pass AND >=2 strong identifiers", () => {
    const r = classifyEvidence({ captureMethod: "eml_attachment", dkimResult: "pass", strongIdentifierMatches: 2 });
    expect(r.source).toBe("document_verified");
    expect(r.evidenceSubtype).toBe("dkim_identity_bound");
    expect(r.needsHumanReview).toBe(false);
    expect(r.rejected).toBe(false);
    // always a draft until the student confirms the extracted fields
    expect(r.isDraft).toBe(true);
  });

  it("does NOT auto-promote a DKIM pass with weak identity (<2 matches) — routes to human review", () => {
    const r = classifyEvidence({ captureMethod: "eml_attachment", dkimResult: "pass", strongIdentifierMatches: 1 });
    expect(r.source).toBe("self_reported");
    expect(r.evidenceSubtype).toBe("dkim_identity_weak");
    expect(r.needsHumanReview).toBe(true);
    expect(r.rejected).toBe(false);
  });

  it("rejects a forwarded .eml whose DKIM does not pass", () => {
    expect(classifyEvidence({ captureMethod: "eml_attachment", dkimResult: "fail", strongIdentifierMatches: 5 }).rejected).toBe(true);
    expect(classifyEvidence({ captureMethod: "eml_attachment", dkimResult: "none", strongIdentifierMatches: 5 }).rejected).toBe(true);
  });
});

describe("classifyEvidence — uploads", () => {
  it("promotes a human-reviewed upload to document_verified (not a draft — a human read it)", () => {
    const r = classifyEvidence({ captureMethod: "upload", humanReviewed: true });
    expect(r.source).toBe("document_verified");
    expect(r.evidenceSubtype).toBe("human_reviewed");
    expect(r.isDraft).toBe(false);
    expect(r.needsHumanReview).toBe(false);
    expect(r.rejected).toBe(false);
  });

  it("queues an unreviewed upload as a self-report awaiting human review", () => {
    const r = classifyEvidence({ captureMethod: "upload", humanReviewed: false });
    expect(r.source).toBe("self_reported");
    expect(r.evidenceSubtype).toBeNull();
    expect(r.needsHumanReview).toBe(true);
    expect(r.rejected).toBe(false);
  });
});

describe("classifyEvidence — invariant", () => {
  it("never returns official_verified (that tier is admin/VEVO-only, not a capture classification)", () => {
    const inputs = [
      { captureMethod: "inline_forward" as const },
      { captureMethod: "eml_attachment" as const, dkimResult: "pass" as const, strongIdentifierMatches: 2 },
      { captureMethod: "upload" as const, humanReviewed: true },
    ];
    for (const i of inputs) {
      expect(classifyEvidence(i).source).not.toBe("official_verified");
    }
  });
});
