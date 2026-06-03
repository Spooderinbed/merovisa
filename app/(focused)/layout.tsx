import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FocusBar } from "@/components/layout/focus-bar";

export default async function FocusedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return (
    <>
      <FocusBar signedIn={!!data.user} />
      <main>{children}</main>
    </>
  );
}
