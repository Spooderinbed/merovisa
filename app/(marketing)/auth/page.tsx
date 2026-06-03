import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthCard } from "@/components/auth/auth-card";
import { safeNext } from "@/lib/auth/safe-next";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    redirect(safeNext(sp.next) ?? "/dashboard");
  }
  return <AuthCard />;
}
