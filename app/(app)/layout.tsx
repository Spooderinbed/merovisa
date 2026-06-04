import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";

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
      <AppBar variant="app" user={data.user} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
