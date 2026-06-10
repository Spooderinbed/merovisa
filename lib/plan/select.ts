import type { Impact, PlanItemRow } from "./types";
import { isVisaPrep, visaPrepOrder } from "./phases";

export interface PlanGroups {
  high: PlanItemRow[];
  medium: PlanItemRow[];
  low: PlanItemRow[];
  visaPrep: PlanItemRow[];
}

/** The plan page's grouping, extracted so every surface ranks items identically.
 *  Sorting lives here (newest first, id as tiebreak) because batch inserts share a
 *  created_at — Postgres returns ties in arbitrary per-query order, which made the
 *  dashboard and the plan page disagree on the top item. */
export function groupOpenItems(items: PlanItemRow[]): PlanGroups {
  const open = items
    .filter((i) => i.status === "todo")
    .sort((a, b) =>
      a.createdAt === b.createdAt ? a.id - b.id : a.createdAt < b.createdAt ? 1 : -1,
    );
  const rest = open.filter((i) => !isVisaPrep(i.kind));
  const byImpact = (impact: Impact) => rest.filter((i) => i.impact === impact);
  return {
    high: byImpact("high"),
    medium: byImpact("medium"),
    low: byImpact("low"),
    visaPrep: open
      .filter((i) => isVisaPrep(i.kind))
      .sort((a, b) => visaPrepOrder(a.kind) - visaPrepOrder(b.kind)),
  };
}

export function orderOpenItems(items: PlanItemRow[]): PlanItemRow[] {
  const g = groupOpenItems(items);
  return [...g.high, ...g.medium, ...g.low, ...g.visaPrep];
}

export type NextStepState = "next" | "waiting" | "caught-up";

export interface NextStepSelection {
  state: NextStepState;
  item: PlanItemRow | null;
  openCount: number;
  waitingCount: number;
}

/** Open = status todo. Actionable = open and not marked in progress. */
export function selectNextStep(items: PlanItemRow[]): NextStepSelection {
  const open = orderOpenItems(items);
  const actionable = open.filter((i) => i.startedAt === null);
  if (open.length === 0) return { state: "caught-up", item: null, openCount: 0, waitingCount: 0 };
  if (actionable.length === 0)
    return { state: "waiting", item: null, openCount: open.length, waitingCount: open.length };
  return {
    state: "next",
    item: actionable[0]!,
    openCount: open.length,
    waitingCount: open.length - actionable.length,
  };
}
