import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { JourneyMarker } from "@/components/journey/journey-marker";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { getJourneySignals } from "@/lib/journey/signals";
import { buildJourney, type Journey } from "@/lib/journey/journey";

/**
 * The STUDENT shell — the chrome for a person working their own journey: app bar,
 * the persistent journey marker, the mobile tab bar, the footer.
 *
 * This was `app/(app)/layout.tsx` until MV-180 moved it down one level into a route
 * group, so that consultancy routes stop inheriting it. The group is invisible in
 * the URL: `/dashboard`, `/matches`, `/plan` and the rest are unchanged.
 *
 * The user is re-read rather than passed down, because a layout cannot receive
 * props from its parent layout. The parent has already redirected anyone
 * unauthenticated, so `data.user` is non-null here in practice; the `?? null` on
 * the app bar keeps a hypothetical race from throwing inside chrome.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  // The persistent "where am I" marker (MV-103) rides in the chrome on every
  // student page. Wayfinding is non-critical, so a signals failure degrades to no
  // marker — it must never take a page down with it.
  //
  // MV-157: the six signal reads are case-scoped like every other read, so the
  // chrome resolves and authorizes the case exactly as a page does. No case (or a
  // denial) degrades to no marker rather than a redirect — the chrome must never be
  // the thing that decides a student cannot see their own app.
  let journey: Journey | null = null;
  try {
    if (data.user) {
      const caseId = await resolvePersonalCaseId(data.user.id, supabase);
      if (caseId !== null) {
        const { decision } = await checkCasePermission(data.user.id, caseId, "case.read", supabase);
        if (decision.allowed) {
          journey = buildJourney(await getJourneySignals(supabase, caseId));
        }
      }
    }
  } catch {
    journey = null;
  }

  return (
    <>
      {/* Full-height flex column pins the footer to the viewport bottom, so a short
          streamed loading fallback doesn't paint the footer high and then jump it
          down when the taller real page streams in (MV-98 CLS fix). The chrome
          (AppBar + JourneyMarker) lives INSIDE this column, not above it: the
          parent's corridor wrapper is `contents` (boxless), so any chrome placed as
          its sibling would stack ~103px *outside* the 100dvh column, leaving the
          document taller than one viewport — a dead scrollbar on every short
          signed-in page and on the loading fallback, with the footer below the fold
          (MV-115 fix; mirrors app/(marketing)/layout.tsx). Padded below md so the
          fixed tab bar never covers content or footer. */}
      <div className="flex min-h-dvh flex-col pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        <AppBar variant="app" user={data.user ?? null} />
        {journey && <JourneyMarker journey={journey} />}
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
      <MobileTabBar />
    </>
  );
}
