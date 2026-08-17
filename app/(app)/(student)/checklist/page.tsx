import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { ChecklistLandingPanel } from "@/components/case-experience/checklist-landing-panel";

/**
 * The student's own checklist landing. MV-172 moved the body into
 * `ChecklistLandingPanel` so the counsellor's case route renders the same surface
 * for a case that is not the actor's own — one implementation, two case ids.
 */
export default async function ChecklistLandingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const h = await headers();
    const next = safeNext(h.get("x-pathname")) ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }

  // MV-157: resolve the personal case ONCE per render and authorize ONCE, before
  // the first read. A signed-in actor with no personal case sees the same empty
  // state a brand-new account does (see the dashboard for the full note).
  const caseId = await resolvePersonalCaseId(user.id, supabase);
  if (caseId !== null) {
    const { decision } = await checkCasePermission(user.id, caseId, "case.read", supabase);
    if (!decision.allowed) redirect("/auth?next=/checklist");
  }

  // Awaited rather than returned as an element — see `/profile`.
  return ChecklistLandingPanel({ db: supabase, caseId });
}
