/**
 * The student journey, modelled as five sequential phases (A–E). The plan groups
 * every open action under the phase it belongs to, so "My plan" reads as a guided
 * timeline ("what to do next, in order") rather than an impact-ranked queue.
 *
 * Phases are HARD GATES between each other (you decide → apply → confirm a place →
 * prepare the visa → get a decision); within a phase, tasks are parallel and the
 * student picks the order. This is render-time grouping only — no DB column, no
 * migration. The per-kind placement below is the founder-reviewable artifact: to
 * move a step, change its phase here.
 *
 * Scope note (MV-37 slice 1): the timeline sequences and references the per-program
 * checklist; it does NOT re-source requirement specifics — those live in
 * lib/checklist/generator.ts. Per-application multi-track state and offer/CoE entry
 * states are deferred to slice 2.
 */

export type PhaseId = "A" | "B" | "C" | "D" | "E";

export interface PlanPhase {
  id: PhaseId;
  title: string;
  blurb: string;
}

export const PLAN_PHASES: readonly PlanPhase[] = [
  { id: "A", title: "Decide where to apply", blurb: "Complete your profile, get your verdicts, and shortlist programs." },
  { id: "B", title: "Apply to programs", blurb: "Prepare your documents and submit your applications." },
  { id: "C", title: "Confirm your place", blurb: "Clear any offer conditions, accept, and get your confirmation of enrolment." },
  { id: "D", title: "Prepare your visa", blurb: "Gather what your Subclass 500 application needs, then lodge it." },
  { id: "E", title: "Visa decision", blurb: "Track the outcome once your visa is lodged." },
] as const;

const PHASE_RANK = new Map<PhaseId, number>(PLAN_PHASES.map((p, i) => [p.id, i]));

/**
 * AU visa-preparation plan kinds, in the order to tackle them (Genuine Student leads).
 * Used for (a) checklist→plan link validation and (b) the curated within-phase order of
 * the visa phase. A future AU visa-prep action MUST add its kind here so it sequences and
 * lands in the visa phase. Render-time only — no DB column, no migration.
 */
export const VISA_PREP_KINDS = [
  "prepare-gs-answers",
  "apply-for-noc",
  "translate-certify-documents",
  "prepare-health-exam",
  "prepare-biometrics",
  "prepare-police-certificate",
  "verify-agent-marn",
  "certify-sponsor-income",
] as const;

const ORDER = new Map<string, number>(VISA_PREP_KINDS.map((k, i) => [k, i]));
export const isVisaPrep = (kind: string): boolean => ORDER.has(kind);
export const visaPrepOrder = (kind: string): number => ORDER.get(kind) ?? Number.MAX_SAFE_INTEGER;

/** Explicit per-kind phase placement. Kinds not listed fall back in phaseOf(). */
const KIND_PHASE = new Map<string, PhaseId>([
  // A · Decide — profile completeness, case strengtheners, shortlist guidance.
  ["set-name", "A"],
  ["add-grade", "A"],
  ["add-english-score", "A"],
  ["upload-ielts-report", "A"],
  ["set-intended-field", "A"],
  ["add-safer-options", "A"],
  ["add-work-docs", "A"],
  ["document-gap-reasons", "A"],
  ["document-gap-evidence", "A"],
  // B · Apply — prerequisites for lodging applications.
  ["start-passport-process", "B"],
  // C · Confirm your place — post-offer steps tied to accepting + paying.
  ["apply-for-noc", "C"],
  ["prepare-fund-remittance", "C"],
  // D · Prepare your visa — Subclass 500 lodgement evidence. (The remaining
  // VISA_PREP_KINDS land here via the fallback below.)
  ["upload-proof-of-funds", "D"],
  ["season-funds-six-months", "D"],
]);

/**
 * The journey phase a plan kind belongs to. Unmapped kinds default to the visa phase
 * if they are visa-prep, otherwise to Phase A — so a new profile action surfaces early
 * and a new visa action lands with the rest of the visa prep (forward compatible).
 */
export function phaseOf(kind: string): PhaseId {
  return KIND_PHASE.get(kind) ?? (isVisaPrep(kind) ? "D" : "A");
}

/** Sortable rank of a kind's phase (A=0 … E=4) so the plan reads as a sequence. */
export function phaseOrder(kind: string): number {
  return PHASE_RANK.get(phaseOf(kind)) ?? Number.MAX_SAFE_INTEGER;
}
