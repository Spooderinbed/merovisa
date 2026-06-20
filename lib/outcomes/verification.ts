// MV-08 — capture verification tier (Codex-vetted GO-WITH-CHANGES, 2026-06-20).
// Pure classification the inbound handler / upload reviewer runs to decide the
// `source` tier and evidence subtype for a captured outcome. Encodes the four
// non-negotiable rules from the review (design §6/§8):
//   1. inline forwards are NOT DKIM-eligible (the body is re-wrapped → bh= fails)
//      → downgrade to self_reported.
//   2. a DKIM pass alone proves issuer authenticity, NOT that the email is this
//      student's → only >=2 strong identifier matches auto-promote; otherwise it
//      routes to human review.
//   3. a forwarded .eml whose DKIM does not pass is rejected (not stored).
//   4. document_verified via DKIM is ALWAYS a draft until the student confirms
//      the extracted fields (~85% extraction ceiling).
// official_verified is reached only by admin/VEVO promotion, never here.

import type { CaptureMethod, EvidenceSubtype, Source } from "./types";

const STRONG_IDENTIFIER_MIN = 2;

export interface EvidenceInput {
  captureMethod: CaptureMethod;
  /** DKIM verification result of the forwarded message (eml_attachment only). */
  dkimResult?: "pass" | "fail" | "none";
  /** Count of strong identifiers matched to the student (name + DOB/passport/ref/CoE/TRN). */
  strongIdentifierMatches?: number;
  /** Whether an admin has reviewed an uploaded document. */
  humanReviewed?: boolean;
}

export interface EvidenceClassification {
  source: Source;
  evidenceSubtype: EvidenceSubtype | null;
  /** Extracted fields must be confirmed by the student before the event counts. */
  isDraft: boolean;
  needsHumanReview: boolean;
  /** True when the evidence must not be stored at all (DKIM did not pass). */
  rejected: boolean;
}

export function classifyEvidence(input: EvidenceInput): EvidenceClassification {
  const { captureMethod, dkimResult, strongIdentifierMatches = 0, humanReviewed = false } = input;

  switch (captureMethod) {
    // Rule 1: inline forward is never DKIM-eligible — it is at best a self-report.
    case "inline_forward":
      return {
        source: "self_reported",
        evidenceSubtype: null,
        isDraft: true,
        needsHumanReview: false,
        rejected: false,
      };

    case "eml_attachment":
      // Rule 3: no DKIM pass → reject (do not store).
      if (dkimResult !== "pass") {
        return {
          source: "self_reported",
          evidenceSubtype: null,
          isDraft: false,
          needsHumanReview: false,
          rejected: true,
        };
      }
      // Rule 2: DKIM proves the issuer, not the owner. Only a strong identity
      // match auto-promotes; otherwise route to human review (never auto-confirm).
      if (strongIdentifierMatches >= STRONG_IDENTIFIER_MIN) {
        return {
          source: "document_verified",
          evidenceSubtype: "dkim_identity_bound",
          isDraft: true, // Rule 4
          needsHumanReview: false,
          rejected: false,
        };
      }
      return {
        source: "self_reported",
        evidenceSubtype: "dkim_identity_weak",
        isDraft: true,
        needsHumanReview: true,
        rejected: false,
      };

    case "upload":
      // A human read it → document_verified and already confirmed (not a draft).
      if (humanReviewed) {
        return {
          source: "document_verified",
          evidenceSubtype: "human_reviewed",
          isDraft: false,
          needsHumanReview: false,
          rejected: false,
        };
      }
      return {
        source: "self_reported",
        evidenceSubtype: null,
        isDraft: true,
        needsHumanReview: true,
        rejected: false,
      };
  }
}
