import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const variant = data.user ? "marketing-signed-in" : "marketing";
  return (
    <>
      <AppBar variant={variant} user={data.user ?? null} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
