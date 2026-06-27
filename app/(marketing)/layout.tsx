import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // The auth.getUser() probe is the layout's only live read, and it only personalises
  // the AppBar. A same-segment layout throw bubbles PAST the group error.tsx to
  // global-error (document-replacing) — a brutal dead-end for an anonymous first-time
  // visitor on a flaky connection. So degrade gracefully: if the session probe fails,
  // render the signed-out chrome (the page itself is unaffected) and log loudly so the
  // failure stays observable rather than silently masked.
  let user: User | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    console.error("[marketing] session probe failed; serving signed-out chrome", error);
  }
  const variant = user ? "marketing-signed-in" : "marketing";
  return (
    <>
      <AppBar variant={variant} user={user} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
