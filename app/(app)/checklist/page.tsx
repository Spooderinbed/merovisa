import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { listShortlistForCase } from "@/lib/matches/repo";
import { listAllPrograms } from "@/lib/programs/repo";
import { ChecklistLanding } from "@/components/checklist/checklist-landing";

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
  const [shortlist, programs] = await Promise.all([
    caseId === null ? [] : listShortlistForCase(supabase, caseId),
    listAllPrograms(supabase),
  ]);
  const ids = new Set(shortlist.map((s) => s.programId));
  const shortlisted = programs.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name }));

  return <ChecklistLanding shortlisted={shortlisted} />;
}
