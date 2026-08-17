import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { ChecklistAllPanel } from "@/components/case-experience/checklist-landing-panel";

// MV-53 — the global, program-agnostic document checklist. Lets a signed-in user
// mark each document kind as obtained, independent of whether they've uploaded a
// file. The per-program checklists (/checklist/[programId]) are unchanged.
//
// MV-172 moved the body into `ChecklistAllPanel` so the counsellor's case route
// renders the same list for a case that is not the actor's own.
export default async function GlobalChecklistPage() {
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
    if (!decision.allowed) redirect("/auth?next=/checklist/all");
  }

  // Awaited rather than returned as an element — see `/profile`.
  return ChecklistAllPanel({
    db: supabase,
    caseId,
    footer: (
      <a href="/documents" className="text-small text-primary hover:underline">
        Go to your documents vault →
      </a>
    ),
  });
}
