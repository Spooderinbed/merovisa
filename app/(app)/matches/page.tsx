import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { MatchesPanel } from "@/components/case-experience/matches-panel";

/**
 * The student's own matches. MV-172 moved the body into `MatchesPanel` so the
 * counsellor's case route renders the same surface for a case that is not the
 * actor's own — one implementation, two case ids.
 */
export default async function MatchesPage() {
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
    if (!decision.allowed) redirect("/auth?next=/matches");
  }

  // Awaited rather than returned as an element — see `/profile`.
  return MatchesPanel({
    db: supabase,
    caseId,
    header: (
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Matches</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Where your profile fits today.</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Strong / Possible / Reach against each program&apos;s published thresholds. We compare
          your Nepal TU percentage directly against each program&apos;s minimum.
        </p>
      </header>
    ),
  });
}
