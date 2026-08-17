import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { ProfilePanel } from "@/components/case-experience/profile-panel";

/**
 * The student's own profile. MV-172 moved the body into `ProfilePanel` so the
 * counsellor's case route renders the SAME editor for a case that is not the
 * actor's own — one implementation, two case ids. Nothing here changed but the
 * indirection: this page still resolves the personal case and authorizes it.
 */
export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    const h = await headers();
    const next = safeNext(h.get("x-pathname")) ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }
  const user = userData.user;
  // MV-157: resolve the personal case ONCE per render and authorize ONCE, before
  // the first read — never per repo call. A signed-in actor with no personal case
  // is the residue of the MV-155-apply-to-this-deploy window; they see the same
  // empty state a brand-new account does, and `/api/assess` heals it by calling
  // `ensurePersonalCase` on their next assessment (MV-160 §B's sweep is the bulk
  // remedy).
  const caseId = await resolvePersonalCaseId(user.id, supabase);
  if (caseId !== null) {
    const { decision } = await checkCasePermission(user.id, caseId, "case.read", supabase);
    if (!decision.allowed) redirect("/auth?next=/profile");
  }

  // Awaited rather than returned as an element: the panel is an async server
  // component, and a page that hands one back unrendered defers its data fetch
  // past the point where this route can report a failure.
  return ProfilePanel({
    db: supabase,
    caseId,
    subtitle: <span className="text-body text-ink-soft">{user.email}</span>,
    // Account controls (deletion included) live on /settings — an exposed delete
    // panel here planted the idea. The app bar's nav is hidden below md and the
    // mobile tab bar has no settings tab, so this link is the mobile route to them.
    footer: (
      <Link
        href="/settings"
        className="justify-self-start text-meta text-ink-soft underline-offset-2 hover:text-ink hover:underline lg:col-span-2"
      >
        Settings
      </Link>
    ),
  });
}
