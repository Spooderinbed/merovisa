import type { Impact, PlanItemRow } from "./types";
import { PLAN_PHASES, phaseOf, phaseOrder, journeyRank, visaPrepOrder, type PlanPhase } from "./phases";

export interface PlanPhaseGroup {
  phase: PlanPhase;
  items: PlanItemRow[];
}

const IMPACT_RANK: Record<Impact, number> = { high: 0, medium: 1, low: 2 };

/** Student-meaningful, deterministic order within a phase: the explicit journey rank
 *  first (MV-57 — the connective accept→…→CoE / lodge-last / track-sole sequence), then
 *  the curated visa-prep sequence (Genuine Student leads), then by impact, then by id.
 *  Unranked kinds share one journeyRank default, so they tie on that key and fall through
 *  to the existing visaPrepOrder → impact → id keys — preserving all current ordering.
 *  Never by created_at — batch inserts share a timestamp, so creation order is an artifact,
 *  not a meaning. The id tiebreak keeps every surface (plan page + dashboard) in agreement. */
function withinPhase(a: PlanItemRow, b: PlanItemRow): number {
  return (
    journeyRank(a.kind) - journeyRank(b.kind) ||
    visaPrepOrder(a.kind) - visaPrepOrder(b.kind) ||
    IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] ||
    a.id - b.id
  );
}

/** Open items grouped under their journey phase, phases in A→E order, empty phases
 *  dropped. The plan page renders this as a guided timeline. */
export function groupByPhase(items: PlanItemRow[]): PlanPhaseGroup[] {
  const open = items.filter((i) => i.status === "todo");
  return PLAN_PHASES.map((phase) => ({
    phase,
    items: open.filter((i) => phaseOf(i.kind) === phase.id).sort(withinPhase),
  })).filter((g) => g.items.length > 0);
}

/** The whole plan flattened in journey order — the shared ranking the dashboard
 *  next-step selector and the plan page both read from. */
export function orderOpenItems(items: PlanItemRow[]): PlanItemRow[] {
  return items
    .filter((i) => i.status === "todo")
    .sort((a, b) => phaseOrder(a.kind) - phaseOrder(b.kind) || withinPhase(a, b));
}

export type NextStepState = "next" | "waiting" | "caught-up";

export interface NextStepSelection {
  state: NextStepState;
  item: PlanItemRow | null;
  openCount: number;
  waitingCount: number;
}

/** Open = status todo. Actionable = open and not marked in progress. The next step is
 *  the first actionable item in journey order, so the recommendation is always the
 *  earliest-phase thing the student can act on now. */
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
