import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAllPlanForUser } from "@/lib/plan/repo";
import { PlanList } from "@/components/plan/plan-list";

export default async function PlanPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const items = await listAllPlanForUser(supabase, user!.id);
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
      <PlanList items={items} />
    </div>
  );
}
