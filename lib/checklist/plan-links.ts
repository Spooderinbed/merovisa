import type { PlanItemRow } from "@/lib/plan/types";

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
};

export type LinkedPlanState = "open" | "in-progress" | "done";

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
