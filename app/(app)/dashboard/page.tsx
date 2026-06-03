import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { getProfile } from "@/lib/profiles/repo";
import { Greeting } from "@/components/dashboard/greeting";
import { SnapshotCard } from "@/components/dashboard/snapshot-card";
import { PromptCard, type PromptKind } from "@/components/dashboard/prompt-card";
import { JourneyTimeline } from "@/components/dashboard/journey-timeline";
import { StatsRow } from "@/components/dashboard/stats-row";
import { RecentUpdates } from "@/components/dashboard/recent-updates";
import type { AssessmentPayload } from "@/lib/results/types";
import type { ProfileSections } from "@/lib/profiles/sections";

function partOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

function pickPromptKind(profile: { sections: ProfileSections } | null, primary: unknown): PromptKind {
  if (!profile) return "profile-incomplete";
  const s = profile.sections;
  if (s.english && s.english.overall && s.english.reportUploaded === false) return "ielts-missing";
  if (primary) return "none";
  return "profile-incomplete";
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user!;
  const [primaryRow, profileRow] = await Promise.all([
    getPrimaryAssessmentForUser(supabase, user.id),
    getProfile(supabase, user.id),
  ]);
  const primary = (primaryRow?.result as unknown as AssessmentPayload | undefined) ?? null;
  const profileSections = (profileRow?.sections as ProfileSections | undefined) ?? null;
  const name = profileSections?.personal?.name ?? null;
  const completenessPct = profileRow?.completeness ?? 0;
  const promptKind = pickPromptKind(profileRow as { sections: ProfileSections } | null, primary);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
      <Greeting name={name} partOfDay={partOfDay()} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <SnapshotCard primary={primary} destinationLabel={primaryRow?.destination_id ?? null} />
        <PromptCard kind={promptKind} />
      </div>
      <JourneyTimeline currentStep="shortlist" />
      <StatsRow
        universities={primary?.matchedCount ?? null}
        checklistDone={null}
        profilePct={completenessPct}
        scholarships={null}
      />
      <RecentUpdates updates={[]} />
    </div>
  );
}
