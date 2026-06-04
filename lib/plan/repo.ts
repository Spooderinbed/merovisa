import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { PlanItemRow, PlanStatus } from "./types";

type DB = SupabaseClient<Database>;

export async function listOpenPlanForUser(db: DB, userId: string): Promise<PlanItemRow[]> {
  const { data, error } = await db
    .from("plan_items")
    .select("*")
    .eq("owner", userId)
    .eq("status", "todo")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapRow);
}

export async function listAllPlanForUser(db: DB, userId: string): Promise<PlanItemRow[]> {
  const { data, error } = await db
    .from("plan_items")
    .select("*")
    .eq("owner", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapRow);
}

export async function setPlanItemStatus(
  db: DB,
  owner: string,
  id: number,
  status: PlanStatus,
): Promise<boolean> {
  const { error } = await db
    .from("plan_items")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("owner", owner)
    .eq("id", id);
  return !error;
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
  };
}
