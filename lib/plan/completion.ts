export type CompletionKind = "verified" | "self-reported";

export interface CompletionMeta {
  completion: CompletionKind;
  /** Open-item CTA target: the surface that completes it (verified) or the plan (self-reported). */
  href: string;
  cta: string;
}

const PROFILE: CompletionMeta = { completion: "verified", href: "/profile", cta: "Add it in your profile →" };
const DOCUMENTS: CompletionMeta = { completion: "verified", href: "/documents", cta: "Upload in documents →" };
const SELF: CompletionMeta = { completion: "self-reported", href: "/plan", cta: "Open your plan →" };

/**
 * Verified kinds complete from observed account state: their generator condition
 * watches a profile field, an upload, or matches — invalidatePlan auto-closes them,
 * so the user gets no Done button and /api/plan/action rejects manual completion.
 * Everything else (external actions the system cannot observe) is self-reported.
 * add-safer-options is deliberately self-reported: its generator condition watches
 * match verdicts, not the shortlist the user actually edits.
 */
const VERIFIED: Record<string, CompletionMeta> = {
  "set-name": PROFILE,
  "add-grade": PROFILE,
  "add-english-score": PROFILE,
  "set-intended-field": PROFILE,
  "document-gap-reasons": PROFILE,
  "document-gap-evidence": PROFILE,
  "add-work-docs": PROFILE,
  "upload-ielts-report": DOCUMENTS,
  "upload-proof-of-funds": DOCUMENTS,
  "start-passport-process": DOCUMENTS,
};

export function completionFor(kind: string): CompletionMeta {
  return VERIFIED[kind] ?? SELF;
}
