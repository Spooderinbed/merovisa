import { Suspense } from "react";
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
 *
 * ## This layout does not await (MV-184)
 *
 * It used to read the user before returning anything, which suspended the ENTIRE
 * workspace subtree on one auth round trip. A layout's own suspension is caught by
 * the boundary ABOVE it, and the only boundary above this one is
 * `app/(app)/loading.tsx` - the student dashboard's silhouette. So every cold entry
 * to a queue painted the student shell first, no matter what skeletons the workspace
 * defined for itself. Keeping this layout synchronous is what lets
 * `workspace/loading.tsx` be the thing a counsellor actually sees.
 *
 * The read now sits behind a `Suspense` whose fallback is the SAME bar with no user
 * pill: identical mark, label, border and height, so the pill fills in without
 * moving anything. `WorkspaceTopBar` already renders that state - a signed-out
 * render is not a new branch invented for this fallback.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={<WorkspaceTopBar user={null} />}>
        <WorkspaceTopBarSlot />
      </Suspense>
      <main className="flex-1">{children}</main>
    </div>
  );
}

/** The bar's one asynchronous dependency, isolated so it cannot hold up the page. */
async function WorkspaceTopBarSlot() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  return <WorkspaceTopBar user={data.user ?? null} />;
}
