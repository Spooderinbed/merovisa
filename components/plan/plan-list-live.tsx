"use client";

import { useRouter } from "next/navigation";
import type { PlanItemRow } from "@/lib/plan/types";
import { PlanList } from "./plan-list";

/**
 * Client shell for the server-rendered /plan page: re-fetches server data after
 * any item action so section counts and grouping stay live (same pattern as the
 * profile editors' section-save). PlanItemCard keeps its optimistic local state;
 * the refresh reconciles it with the server's grouping.
 */
export function PlanListLive({ items }: { items: PlanItemRow[] }) {
  const router = useRouter();
  return <PlanList items={items} onChanged={() => router.refresh()} />;
}
