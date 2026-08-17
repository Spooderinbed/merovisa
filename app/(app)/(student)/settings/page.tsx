import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DeleteAccountSection } from "@/components/account/delete-account-section";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth?next=/settings");

  // No case resolution here (unlike every sibling page): this page reads nothing
  // case-scoped. The one control it hosts posts to /api/account/delete, which
  // authorizes the actor itself.
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Settings</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Manage your account</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Account controls live here, away from the profile and plan you work on day to day.
        </p>
      </header>

      <DeleteAccountSection />
    </div>
  );
}
