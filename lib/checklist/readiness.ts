import type { ChecklistItem, ChecklistStage } from "./types";
import { CHECKLIST_PLAN_LINKS, type LinkedPlanState } from "./plan-links";

export interface StageReadiness {
  ready: number;
  total: number;
}

export interface ChecklistReadiness {
  now: StageReadiness;
  afterOffer: StageReadiness;
  readyToApplyNow: boolean;
}

/**
 * Whether a required item is done — or null when it isn't completable and so must not
 * enter the denominator. Vault rows are done when uploaded ("have") or self-reported
 * ("obtained"); plan-mirrored rows (kind null, key in CHECKLIST_PLAN_LINKS) are done when
 * the linked plan action is "done"; pure-info reference rows have no completion signal.
 *
 * Exported for MV-199, which needs the same verdict PER ROW to name a blocking item.
 * `computeReadiness` remains the counts authority — the submittability read takes its
 * numbers from there and its rows from here, and a test asserts the two agree, so a
 * second denominator can never quietly grow beside this one.
 */
export function completion(
  item: ChecklistItem,
  planStates: Record<string, LinkedPlanState>,
): boolean | null {
  if (item.requirement !== "required") return null;
  if (item.kind !== null) return item.status === "have" || item.status === "obtained";
  if (item.key in CHECKLIST_PLAN_LINKS) return planStates[item.key] === "done";
  return null;
}

/**
 * Honest "X of Y required documents ready" rollup, scoped per stage so the headline never
 * counts offer-dependent documents a student can't have yet. Only required + completable
 * items count; recommended and uncompletable reference rows are excluded. "Ready to apply
 * now" means every now-stage required completable item is done — it never claims full
 * visa-readiness (the after-offer set remains).
 */
export function computeReadiness(
  items: ChecklistItem[],
  planStates: Record<string, LinkedPlanState> = {},
): ChecklistReadiness {
  const tally = (stage: ChecklistStage): StageReadiness => {
    let ready = 0;
    let total = 0;
    for (const it of items) {
      if (it.stage !== stage) continue;
      const done = completion(it, planStates);
      if (done === null) continue;
      total += 1;
      if (done) ready += 1;
    }
    return { ready, total };
  };
  const now = tally("now");
  const afterOffer = tally("after-offer");
  return { now, afterOffer, readyToApplyNow: now.total > 0 && now.ready === now.total };
}
