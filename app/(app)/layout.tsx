import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { IdentifyUser } from "@/components/analytics/identify-user";
import { DEFAULT_CORRIDOR } from "@/lib/theme/corridor";

/**
 * The NEUTRAL authenticated shell (MV-180). It answers one question — is anyone
 * signed in — and says nothing about who they are.
 *
 * Everything that describes the actor now lives in a shell below it:
 * `(student)/layout.tsx` for a student's own journey, `workspace/layout.tsx` for
 * consultancy staff processing cases. Both are children of this file, so the auth
 * gate and the corridor scope are stated once.
 *
 * Why the split exists: this layout used to mount the student chrome — the journey
 * marker, a "My plan" nav item, the five student mobile tabs — around EVERY
 * signed-in route, `/workspace` included. A counsellor working a queue of other
 * people's cases was told what their own next step was. Route groups change no
 * public URL, so `/dashboard` and `/workspace/…` are exactly where they were
 * (spec §1, "Signed-in shells").
 *
 * `tests/architecture/shell-boundary.test.ts` keeps this file neutral: it fails if
 * either shell's chrome is imported here, and it fails if a route is added directly
 * under `(app)/`, where it would render with no chrome at all.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const h = await headers();
    const pathname = h.get("x-pathname") ?? "/dashboard";
    const next = safeNext(pathname) ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }
  return (
    <>
      <IdentifyUser userId={data.user.id} />
      {/* Corridor scope (MV-96): signed-in = corridor known, always-on. It sits
          ABOVE the shell split because both shells consume corridor accents.
          `contents` = token carrier only, no layout box — which is why each shell
          owns its own full-height column rather than inheriting one from here. */}
      <div className="contents" data-corridor={DEFAULT_CORRIDOR}>
        {children}
      </div>
    </>
  );
}
