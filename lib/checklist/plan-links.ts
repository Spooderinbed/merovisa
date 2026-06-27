import type { PlanItemRow } from "@/lib/plan/types";
import type { ChecklistStage } from "./types";

/**
 * Checklist info rows that mirror a plan action. The plan is the single
 * completion authority — the checklist never mutates these rows, it only
 * reflects the linked plan item's state. Keys are checklist item keys
 * (lib/checklist/generator), values are plan kinds (all declared AU
 * visa-prep actions in lib/plan/phases).
 *
 * `medical` is deliberately unmapped: it is a vault-bound document row
 * (DocumentKind "medical") completed by uploading the exam results — giving
 * it a plan mirror would add a second completion signal to one row.
 */
export const CHECKLIST_PLAN_LINKS: Record<string, string> = {
  "noc-application": "apply-for-noc",
  biometrics: "prepare-biometrics",
  "police-certificate": "prepare-police-certificate",
  "doc-preparation": "translate-certify-documents",
  "gs-responses": "prepare-gs-answers",
  "agent-marn": "verify-agent-marn",
  "sponsor-income-cert": "certify-sponsor-income",
};

export type LinkedPlanState = "open" | "in-progress" | "done";

/**
 * Checklist stage of each plan-linked action's mirrored row — the reverse of
 * CHECKLIST_PLAN_LINKS, so a plan card can point back to the checklist stage it
 * belongs to (closing the loop: checklist rows already link into the plan). These
 * rows are emitted unconditionally with a fixed stage, so a static map is safe; the
 * plan-links test asserts it never drifts from what the generator actually emits.
 */
const PLAN_KIND_CHECKLIST_STAGE: Record<string, ChecklistStage> = {
  "apply-for-noc": "after-offer",
  "prepare-biometrics": "after-offer",
  "prepare-police-certificate": "after-offer",
  "translate-certify-documents": "now",
  "prepare-gs-answers": "after-offer",
  "verify-agent-marn": "now",
  "certify-sponsor-income": "now",
};

/**
 * The checklist stage a plan action belongs to, or null when the action mirrors no
 * checklist requirement (so its plan card carries no checklist tag).
 */
export function checklistStageForPlanKind(kind: string): ChecklistStage | null {
  return PLAN_KIND_CHECKLIST_STAGE[kind] ?? null;
}

/**
 * Per-checklist-key state of the linked plan items. Keys with no plan row —
 * or whose latest row is dismissed (the user declined the action) — are
 * omitted, so the row renders exactly as an unlinked one.
 *
 * The open row, if any, is the current truth (the partial unique index keeps
 * one open row per kind); otherwise the newest closed row decides.
 */
export function planStatesForChecklist(rows: PlanItemRow[]): Record<string, LinkedPlanState> {
  const states: Record<string, LinkedPlanState> = {};
  for (const [checklistKey, planKind] of Object.entries(CHECKLIST_PLAN_LINKS)) {
    const forKind = rows.filter((r) => r.kind === planKind);
    if (forKind.length === 0) continue;
    const current =
      forKind.find((r) => r.status === "todo") ??
      forKind.reduce((a, b) =>
        a.createdAt === b.createdAt ? (a.id > b.id ? a : b) : a.createdAt > b.createdAt ? a : b,
      );
    if (current.status === "dismissed") continue;
    states[checklistKey] =
      current.status === "done" ? "done" : current.startedAt !== null ? "in-progress" : "open";
  }
  return states;
}
