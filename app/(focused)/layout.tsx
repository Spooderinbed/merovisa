import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FocusBar } from "@/components/layout/focus-bar";

export default async function FocusedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return (
    // Full-height flex column keeps a short focused page filling the viewport
    // (no footer in this group) — consistent with the other route-group shells (MV-98).
    <div className="flex min-h-dvh flex-col">
      <FocusBar signedIn={!!data.user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
