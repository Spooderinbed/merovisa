import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { IdentifyUser } from "@/components/analytics/identify-user";
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
  return (
    <>
      <IdentifyUser userId={data.user.id} />
      {/* Corridor scope (MV-96): signed-in = corridor known, always-on. Chrome
          included so Phase-2 surfaces can consume corridor accents without
          re-wiring. `contents` = token carrier only, no layout box. */}
      <div className="contents" data-corridor={DEFAULT_CORRIDOR}>
        <AppBar variant="app" user={data.user} />
        {/* Full-height flex column pins the footer to the viewport bottom, so a short
            streamed loading fallback doesn't paint the footer high and then jump it
            down when the taller real page streams in (MV-98 CLS fix). `contents`
            above carries no box, so the flex context lives on this real element.
            Padded below md so the fixed tab bar never covers content or footer. */}
        <div className="flex min-h-dvh flex-col pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
        <MobileTabBar />
      </div>
    </>
  );
}
