import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { PlanPanel } from "@/components/case-experience/plan-panel";

/**
 * The student's own plan. MV-172 moved the body into `PlanPanel` so the
 * counsellor's case route renders the same surface for a case that is not the
 * actor's own — one implementation, two case ids.
 */
export default async function PlanPage() {
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
  // the first read — never per repo call. A signed-in actor with no personal case
  // is the residue of the MV-155-apply-to-this-deploy window; they see the same
  // empty state a brand-new account does, and `/api/assess` heals it by calling
  // `ensurePersonalCase` on their next assessment (MV-160 §B's sweep is the bulk
  // remedy).
  const caseId = await resolvePersonalCaseId(user.id, supabase);
  if (caseId !== null) {
    const { decision } = await checkCasePermission(user.id, caseId, "case.read", supabase);
    if (!decision.allowed) redirect("/auth?next=/plan");
  }

  // Awaited rather than returned as an element — see `/profile`.
  return PlanPanel({
    db: supabase,
    caseId,
    header: (
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Your plan</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">
          The shortest path to a stronger application.
        </h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Ranked by impact on your verdict + visa case. We regenerate this whenever your profile
          changes.
        </p>
      </header>
    ),
  });
}
