export type Impact = "high" | "medium" | "low";
export type PlanStatus = "todo" | "done" | "dismissed";

export interface PlanItem {
  /** Stable identifier for de-dup; the (owner, kind) pair is unique among open items. */
  kind: string;
  impact: Impact;
  title: string;
  body: string;
  liftEstimate?: string;   // e.g. "Unlocks 3 strong matches"
  timeEstimate?: string;   // e.g. "1 day · IELTS test centre booking"
}

export interface PlanItemRow {
  id: number;
  owner: string;
  kind: string;
  impact: Impact;
  title: string;
  body: string | null;
  liftEstimate: string | null;
  timeEstimate: string | null;
  status: PlanStatus;
  createdAt: string;
  completedAt: string | null;
}
