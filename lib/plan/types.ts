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
  /**
   * Nullable from MV-156: a consultancy case has no Auth user, so a plan item can carry `case_id`
   * and no `owner`. Admitted here rather than asserted away at the mapping site — a `!` would
   * re-assert "actor equals student" where typecheck can no longer see it. MV-157 re-keys the
   * repository onto `case_id`.
   */
  owner: string | null;
  kind: string;
  impact: Impact;
  title: string;
  body: string | null;
  liftEstimate: string | null;
  timeEstimate: string | null;
  status: PlanStatus;
  createdAt: string;
  completedAt: string | null;
  /** Set when a self-reported item is marked in progress; null = not started. */
  startedAt: string | null;
}
