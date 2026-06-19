import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { listAllPlanForUser } from "@/lib/plan/repo";
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
  const items = await listAllPlanForUser(supabase, user.id);
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
          Your plan
        </span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">
          The shortest path to a stronger application.
        </h1>
        <p className="max-w-[64ch] text-[16px] text-ink-soft">
          Ranked by impact on your verdict + visa case. We regenerate this whenever your profile
          changes.
        </p>
      </header>
      <VerdictDisclaimer message="Your plan is ranked by rules-based impact estimates, not immigration advice." />
      <PlanListLive items={items} />
    </div>
  );
}
