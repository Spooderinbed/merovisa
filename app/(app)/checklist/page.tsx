import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { listShortlistForUser } from "@/lib/matches/repo";
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

  const [shortlist, programs] = await Promise.all([
    listShortlistForUser(supabase, user.id),
    listAllPrograms(supabase),
  ]);
  const ids = new Set(shortlist.map((s) => s.programId));
  const shortlisted = programs.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name }));

  return <ChecklistLanding shortlisted={shortlisted} />;
}
