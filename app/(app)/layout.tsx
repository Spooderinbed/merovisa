import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth?next=/dashboard");
  return (
    <>
      <AppBar variant="app" user={data.user} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
