import type * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { listAllPlanForCase } from "@/lib/plan/repo";
import { PlanListLive } from "@/components/plan/plan-list-live";
import { VerdictDisclaimer } from "@/components/ui/verdict-disclaimer";

/**
 * The plan, for ONE case — spec §6.2 entry 8's rendered surface.
 *
 * Extracted from `/plan` unchanged. `db` is the **authenticated** client:
 * `plan_items_select_case` decides the read, and MV-172 moved the write route off
 * service-role entirely, so nothing on this surface bypasses RLS any more.
 *
 * Every action inside `PlanListLive` posts to `/api/plan/action`, which names the
 * case from `CaseScopeProvider` — without that, a counsellor ticking off a step
 * closes it on their OWN plan.
 */
export async function PlanPanel({
  db,
  caseId,
  header,
}: {
  db: SupabaseClient<Database>;
  caseId: string | null;
  /** The caller's own heading — student voice on `/plan`, counsellor voice in a case. */
  header?: React.ReactNode;
}) {
  const items = caseId === null ? [] : await listAllPlanForCase(db, caseId);
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
      {header}
      <VerdictDisclaimer message="Your plan is ranked by rules-based impact estimates, not immigration advice. The rankings come from published rules and can change — they are not a guarantee of any visa or admission outcome. The relevant decision-makers decide your case under the rules that apply at the time — the Department of Home Affairs for your visa, and each institution for its own admission. For advice on your own application, see a registered migration agent (OMARA) or a lawyer." />
      <PlanListLive items={items} />
    </div>
  );
}
