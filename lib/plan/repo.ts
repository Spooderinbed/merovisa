import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { CaseReadError } from "@/lib/cases/errors";
import type { PlanItemRow, PlanStatus } from "./types";

type DB = SupabaseClient<Database>;

/**
 * MV-157: every plan read and write is keyed on `case_id` alone. The list
 * functions are RENAMED (`…ForUser` → `…ForCase`) so a stale call site fails to
 * compile instead of silently reading by owner; the three mutators keep their
 * names because their second parameter changes from `owner` to `caseId` in the
 * same commit and every call site is enumerated by the compiler through the
 * renamed reads above them.
 *
 * These take an already-resolved, already-AUTHORIZED case id.
 *
 * MV-133 on the case axis: `[]` means the case has no plan items, which is the
 * normal state before the first assessment. A read that never answered wearing
 * that same `[]` renders "you're all caught up" over an outage.
 */
export async function listOpenPlanForCase(db: DB, caseId: string): Promise<PlanItemRow[]> {
  const { data, error } = await db
    .from("plan_items")
    .select("*")
    .eq("case_id", caseId)
    .eq("status", "todo")
    .order("created_at", { ascending: false });
  if (error) throw new CaseReadError("plan_items", error);
  return (data ?? []).map(mapRow);
}

export async function listAllPlanForCase(db: DB, caseId: string): Promise<PlanItemRow[]> {
  const { data, error } = await db
    .from("plan_items")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw new CaseReadError("plan_items", error);
  return (data ?? []).map(mapRow);
}

export async function setPlanItemStatus(
  db: DB,
  caseId: string,
  id: number,
  status: PlanStatus,
): Promise<boolean> {
  const { error } = await db
    .from("plan_items")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
      // Any explicit status change resets the in-progress marker.
      started_at: null,
    })
    .eq("case_id", caseId)
    .eq("id", id);
  return !error;
}

/** Toggle the in-progress marker. Only open items can be (un)started. */
export async function setPlanItemStarted(
  db: DB,
  caseId: string,
  id: number,
  started: boolean,
): Promise<boolean> {
  const { error } = await db
    .from("plan_items")
    .update({ started_at: started ? new Date().toISOString() : null })
    .eq("case_id", caseId)
    .eq("id", id)
    .eq("status", "todo");
  return !error;
}

export async function getPlanItemKind(db: DB, caseId: string, id: number): Promise<string | null> {
  const { data, error } = await db
    .from("plan_items")
    .select("kind")
    .eq("case_id", caseId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new CaseReadError("plan_items", error);
  return data?.kind ?? null;
}

function mapRow(r: Database["public"]["Tables"]["plan_items"]["Row"]): PlanItemRow {
  return {
    id: r.id,
    owner: r.owner,
    kind: r.kind,
    impact: r.impact as PlanItemRow["impact"],
    title: r.title,
    body: r.body,
    liftEstimate: r.lift_estimate,
    timeEstimate: r.time_estimate,
    status: r.status as PlanStatus,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    startedAt: r.started_at,
  };
}
