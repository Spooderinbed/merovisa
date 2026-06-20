// MV-08 outcome-validation loop — shared taxonomy.
// Design: docs/superpowers/specs/2026-06-19-outcome-validation-loop-design.md
// Mirrors the check constraints in
// supabase/migrations/20260620000000_add_outcome_validation.sql; the reason-code
// taxonomy and the legal-transition machine live here (server-side, F16).

export const EVENT_TYPES = [
  "applied",
  "offer_received",
  "conditional_offer",
  "application_rejected",
  "offer_accepted",
  "coe_issued",
  "visa_lodged",
  "visa_granted",
  "visa_refused",
  "enrolled",
  "withdrawn",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// The two gates each calibrate independently (design §2).
export const GATES = ["admission", "visa"] as const;
export type Gate = (typeof GATES)[number];

export const DECISION_AUTHORITIES = ["institution", "dha", "student", "agent"] as const;
export type DecisionAuthority = (typeof DECISION_AUTHORITIES)[number];

// Verification tiers (the `source` column). official_verified is reached only by
// an admin/VEVO promotion, never by capture classification.
export const SOURCES = ["self_reported", "document_verified", "official_verified"] as const;
export type Source = (typeof SOURCES)[number];

// Evidence subtype, stamped into outcome_events.detail (no schema column).
export const EVIDENCE_SUBTYPES = ["dkim_identity_bound", "dkim_identity_weak", "human_reviewed"] as const;
export type EvidenceSubtype = (typeof EVIDENCE_SUBTYPES)[number];

// How a piece of evidence reached us (drives the verification tier — Codex 2026-06-20).
export const CAPTURE_METHODS = ["inline_forward", "eml_attachment", "upload"] as const;
export type CaptureMethod = (typeof CAPTURE_METHODS)[number];

// Reason-code taxonomy, split by gate so a refusal can be attributed to the
// right sub-factor (design §7.2). Codes are gate-disjoint on purpose.
export const ADMISSION_REASON_CODES = [
  "academic_below_threshold",
  "english_below_threshold",
  "capacity_full",
  "incomplete_application",
  "other_admission",
] as const;
export type AdmissionReasonCode = (typeof ADMISSION_REASON_CODES)[number];

export const VISA_REASON_CODES = [
  "gs_intent",
  "financial_capacity",
  "english_requirement",
  "documentation",
  "health_character",
  "other_visa",
] as const;
export type VisaReasonCode = (typeof VISA_REASON_CODES)[number];

export const REASON_CODES = [...ADMISSION_REASON_CODES, ...VISA_REASON_CODES] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** The gate a reason code belongs to, or null if it isn't a known code. */
export function reasonCodeGate(code: string): Gate | null {
  if ((ADMISSION_REASON_CODES as readonly string[]).includes(code)) return "admission";
  if ((VISA_REASON_CODES as readonly string[]).includes(code)) return "visa";
  return null;
}
