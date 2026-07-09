import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { JourneyMarker } from "@/components/journey/journey-marker";
import { IdentifyUser } from "@/components/analytics/identify-user";
import { getJourneySignals } from "@/lib/journey/signals";
import { buildJourney, type Journey } from "@/lib/journey/journey";
import { DEFAULT_CORRIDOR } from "@/lib/theme/corridor";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const h = await headers();
    const pathname = h.get("x-pathname") ?? "/dashboard";
    const next = safeNext(pathname) ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }
  // The persistent "where am I" marker (MV-103) rides in the chrome on every
  // signed-in page. Wayfinding is non-critical, so a signals failure degrades to
  // no marker — it must never take a page down with it.
  let journey: Journey | null = null;
  try {
    journey = buildJourney(await getJourneySignals(supabase, data.user.id));
  } catch {
    journey = null;
  }
  return (
    <>
      <IdentifyUser userId={data.user.id} />
      {/* Corridor scope (MV-96): signed-in = corridor known, always-on. Chrome
          included so Phase-2 surfaces can consume corridor accents without
          re-wiring. `contents` = token carrier only, no layout box. */}
      <div className="contents" data-corridor={DEFAULT_CORRIDOR}>
        {/* Full-height flex column pins the footer to the viewport bottom, so a short
            streamed loading fallback doesn't paint the footer high and then jump it
            down when the taller real page streams in (MV-98 CLS fix). The chrome
            (AppBar + JourneyMarker) lives INSIDE this column, not above it: the
            `contents` wrapper is boxless, so any chrome placed as its sibling would
            stack ~103px *outside* the 100dvh column, leaving the document taller
            than one viewport — a dead scrollbar on every short signed-in page and on
            the loading fallback, with the footer below the fold (MV-115 fix; mirrors
            app/(marketing)/layout.tsx). Padded below md so the fixed tab bar never
            covers content or footer. */}
        <div className="flex min-h-dvh flex-col pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
          <AppBar variant="app" user={data.user} />
          {journey && <JourneyMarker journey={journey} />}
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
        <MobileTabBar />
      </div>
    </>
  );
}
