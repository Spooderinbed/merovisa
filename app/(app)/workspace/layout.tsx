import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkspaceTopBar } from "@/components/workspace/workspace-top-bar";

/**
 * The CONSULTANCY shell (MV-180, spec §1). Staff chrome, and none of the student
 * chrome: no journey marker, no "My plan", no student mobile tabs.
 *
 * A plain segment layout rather than a `(consultancy)` route group, because
 * `/workspace` is already a URL segment and every consultancy route lives under it —
 * the group is only needed on the student side, where the URLs (`/dashboard`,
 * `/matches`, …) have no shared segment to hang a layout on.
 *
 * NO FIXED BOTTOM BAR, and so no bottom padding: the organization rail becomes a
 * horizontal row on a narrow screen instead (spec §1). Padding for a bar that does
 * not exist would be dead space on every phone.
 *
 * The tenant's name is not here. A parent layout cannot read a child segment's
 * `params`, so `[organizationId]/layout.tsx` renders the organization band directly
 * beneath this bar; `/workspace` itself has no organization to name yet.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <WorkspaceTopBar user={data.user ?? null} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
