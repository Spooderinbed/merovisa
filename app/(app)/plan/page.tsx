import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { listAllPlanForCase } from "@/lib/plan/repo";
import { PlanListLive } from "@/components/plan/plan-list-live";
import { VerdictDisclaimer } from "@/components/ui/verdict-disclaimer";

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
  const items = caseId === null ? [] : await listAllPlanForCase(supabase, caseId);
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-caption uppercase tracking-wide text-ink-faint">
          Your plan
        </span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">
          The shortest path to a stronger application.
        </h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Ranked by impact on your verdict + visa case. We regenerate this whenever your profile
          changes.
        </p>
      </header>
      <VerdictDisclaimer message="Your plan is ranked by rules-based impact estimates, not immigration advice. The rankings come from published rules and can change — they are not a guarantee of any visa or admission outcome. The relevant decision-makers decide your case under the rules that apply at the time — the Department of Home Affairs for your visa, and each institution for its own admission. For advice on your own application, see a registered migration agent (OMARA) or a lawyer." />
      <PlanListLive items={items} />
    </div>
  );
}
